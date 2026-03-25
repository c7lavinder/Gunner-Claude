// GET /api/[tenant]/dayhub/appointments?date=2026-03-24
// Returns appointments from ALL GHL calendars for the given day
// Enriches with contact phone, address from GHL
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true, ghlLocationId: true },
    })
    if (!tenant?.ghlAccessToken || !tenant.ghlLocationId) {
      return NextResponse.json({ appointments: [], error: 'No GHL connection' })
    }

    const headers = {
      'Authorization': `Bearer ${tenant.ghlAccessToken}`,
      'Version': '2021-07-28',
    }

    // Support day navigation via ?date= param
    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date')
    const targetDate = dateParam ? new Date(dateParam) : new Date()
    const start = startOfDay(targetDate).getTime()
    const end = endOfDay(targetDate).getTime()

    // Get all calendars
    const calRes = await fetch(
      `https://services.leadconnectorhq.com/calendars/?locationId=${tenant.ghlLocationId}`,
      { headers }
    )
    if (!calRes.ok) {
      return NextResponse.json({ appointments: [], error: 'Failed to fetch calendars' })
    }
    const calData = await calRes.json() as { calendars?: Array<{ id: string; name: string }> }
    const calendars = calData.calendars ?? []

    // Resolve user IDs → names
    const ghl = await getGHLClient(tenantId)
    const userMap = new Map<string, string>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of (usersResult?.users ?? [])) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (u.id && name) userMap.set(u.id, name)
      }
    } catch {}

    // Fetch events from each calendar
    interface RawAppt {
      id: string; title: string; startTime: string; endTime: string
      status: string; calendarName: string; assignedUserId: string | null; contactId: string
    }
    const allAppts: RawAppt[] = []

    for (const cal of calendars) {
      try {
        const p = new URLSearchParams({
          locationId: tenant.ghlLocationId,
          calendarId: cal.id,
          startTime: String(start),
          endTime: String(end),
        })
        const evRes = await fetch(`https://services.leadconnectorhq.com/calendars/events?${p}`, { headers })
        if (!evRes.ok) continue
        const evData = await evRes.json() as { events?: Array<Record<string, unknown>> }
        for (const e of (evData.events ?? [])) {
          allAppts.push({
            id: String(e.id ?? ''),
            title: String(e.title ?? cal.name),
            startTime: String(e.startTime ?? ''),
            endTime: String(e.endTime ?? ''),
            status: String(e.appointmentStatus ?? e.status ?? 'confirmed').toLowerCase(),
            calendarName: cal.name,
            assignedUserId: e.assignedUserId ? String(e.assignedUserId) : null,
            contactId: String(e.contactId ?? ''),
          })
        }
      } catch { continue }
    }

    // Sort by time
    allAppts.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    // Bulk fetch contact details (phone, address) from GHL
    const contactIds = [...new Set(allAppts.map(a => a.contactId).filter(Boolean))]
    const contactMap = new Map<string, { name: string; phone: string; address: string }>()

    // Also check local properties for address
    const properties = contactIds.length > 0
      ? await db.property.findMany({
          where: { tenantId, ghlContactId: { in: contactIds } },
          select: { ghlContactId: true, address: true, city: true, state: true },
        })
      : []
    const propMap = new Map<string, string>()
    for (const p of properties) {
      if (p.ghlContactId) propMap.set(p.ghlContactId, [p.address, p.city, p.state].filter(Boolean).join(', '))
    }

    // Fetch contact details from GHL (batch, rate limited)
    for (const cid of contactIds.slice(0, 20)) {
      try {
        const contact = await ghl.getContact(cid)
        contactMap.set(cid, {
          name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
          phone: contact.phone ?? '',
          address: [contact.address1, contact.city, contact.state].filter(Boolean).join(', '),
        })
      } catch {}
    }

    // Build final response
    const appointments = allAppts.map(a => {
      const contact = contactMap.get(a.contactId)
      const startMs = new Date(a.startTime).getTime()
      const endMs = new Date(a.endTime).getTime()
      const durationMin = Math.round((endMs - startMs) / 60000)

      return {
        id: a.id,
        title: a.title,
        contactName: contact?.name || a.title,
        contactPhone: contact?.phone ?? '',
        contactAddress: propMap.get(a.contactId) || contact?.address || '',
        contactId: a.contactId,
        startTime: a.startTime,
        endTime: a.endTime,
        durationMin,
        status: a.status,
        calendarName: a.calendarName,
        assignedUserName: a.assignedUserId ? userMap.get(a.assignedUserId) ?? null : null,
      }
    })

    return NextResponse.json({ appointments, locationId: tenant.ghlLocationId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch appointments'
    return NextResponse.json({ appointments: [], error: message })
  }
}

// POST — update appointment status
export async function POST(
  req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const { appointmentId, status } = await req.json()
    if (!appointmentId || !status) {
      return NextResponse.json({ error: 'appointmentId and status required' }, { status: 400 })
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlAccessToken: true },
    })
    if (!tenant?.ghlAccessToken) return NextResponse.json({ error: 'No GHL connection' }, { status: 400 })

    // Update appointment status in GHL
    const res = await fetch(
      `https://services.leadconnectorhq.com/calendars/events/appointments/${appointmentId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tenant.ghlAccessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({ appointmentStatus: status }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'GHL update failed: ' + err.slice(0, 100) }, { status: 500 })
    }

    await db.auditLog.create({
      data: {
        tenantId,
        userId: session.userId,
        action: 'appointment.status_updated',
        resource: 'appointment',
        resourceId: appointmentId,
        source: 'USER',
        severity: 'INFO',
        payload: { appointmentId, status },
      },
    })

    return NextResponse.json({ status: 'success' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update appointment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
