// GET /api/[tenant]/dayhub/appointments
// Returns appointments from ALL GHL calendars for today + next 7 days
// Iterates per-calendar since /calendars/events requires calendarId
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'
import { startOfDay, endOfDay, addDays } from 'date-fns'

export async function GET(
  _req: Request,
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

    const today = new Date()
    const start = startOfDay(today).getTime()
    const end = endOfDay(addDays(today, 7)).getTime()

    // Step 1: Get all calendars
    const calRes = await fetch(
      `https://services.leadconnectorhq.com/calendars/?locationId=${tenant.ghlLocationId}`,
      { headers }
    )
    if (!calRes.ok) {
      return NextResponse.json({ appointments: [], error: 'Failed to fetch calendars' })
    }
    const calData = await calRes.json() as { calendars?: Array<{ id: string; name: string; calendarType: string }> }
    const calendars = calData.calendars ?? []

    // Step 2: Fetch events from EACH calendar (calendarId is required)
    const allAppointments: Array<{
      id: string; title: string; contactName: string
      startTime: string; endTime: string; status: string
      calendarName: string; assignedUserId: string | null; contactId: string
    }> = []

    // Resolve user IDs → names
    const ghl = await getGHLClient(tenantId)
    const userMap = new Map<string, string>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of (usersResult?.users ?? [])) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (u.id && name) userMap.set(u.id, name)
      }
    } catch { /* non-fatal */ }

    for (const cal of calendars) {
      try {
        const params = new URLSearchParams({
          locationId: tenant.ghlLocationId,
          calendarId: cal.id,
          startTime: String(start),
          endTime: String(end),
        })
        const evRes = await fetch(
          `https://services.leadconnectorhq.com/calendars/events?${params}`,
          { headers }
        )
        if (!evRes.ok) continue

        const evData = await evRes.json() as { events?: Array<Record<string, unknown>> }
        for (const e of (evData.events ?? [])) {
          const status = String(e.appointmentStatus ?? e.status ?? 'confirmed').toLowerCase()
          if (status === 'cancelled') continue // skip cancelled

          allAppointments.push({
            id: String(e.id ?? ''),
            title: String(e.title ?? cal.name),
            contactName: String(e.title ?? ''),
            startTime: String(e.startTime ?? ''),
            endTime: String(e.endTime ?? ''),
            status,
            calendarName: cal.name,
            assignedUserId: e.assignedUserId ? String(e.assignedUserId) : null,
            contactId: String(e.contactId ?? ''),
          })
        }
      } catch { continue }
    }

    // Sort by startTime
    allAppointments.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    // Enrich with user names
    const appointments = allAppointments.map(a => ({
      ...a,
      assignedUserName: a.assignedUserId ? userMap.get(a.assignedUserId) ?? null : null,
    }))

    return NextResponse.json({ appointments })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch appointments'
    return NextResponse.json({ appointments: [], error: message })
  }
}
