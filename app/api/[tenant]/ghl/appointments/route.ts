// GET  /api/[tenant]/ghl/appointments  → list calendars (for picker)
// POST /api/[tenant]/ghl/appointments  → create appointment in GHL
//   Body: { contactId, calendarId, startTime (ISO), endTime (ISO), title?, assignedUserId?, address? }
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export const GET = withTenant<{ tenant: string }>(async (_req, ctx) => {
  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.getCalendars()
    const calendars = (result.calendars ?? []).map(c => ({ id: c.id, name: c.name }))
    return NextResponse.json({ calendars })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load calendars'
    return NextResponse.json({ calendars: [], error: message }, { status: 500 })
  }
})

export const POST = withTenant<{ tenant: string }>(async (req, ctx) => {
  try {
    const body = await req.json()
    const { contactId, calendarId, startTime, endTime, title, assignedUserId, address } = body
    if (!contactId || !calendarId || !startTime || !endTime) {
      return NextResponse.json({ error: 'contactId, calendarId, startTime, endTime required' }, { status: 400 })
    }

    const ghl = await getGHLClient(ctx.tenantId)
    const result = await ghl.createAppointment({
      contactId, calendarId, startTime, endTime,
      ...(title ? { title } : {}),
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(address ? { address } : {}),
    })

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'ghl.appointment_created',
        resource: 'appointment',
        resourceId: result?.id ?? null,
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, calendarId, startTime, endTime, title },
      },
    })

    return NextResponse.json({ status: 'success', id: result?.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create appointment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
