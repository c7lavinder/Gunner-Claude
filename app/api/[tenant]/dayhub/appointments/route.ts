// GET /api/[tenant]/dayhub/appointments
// Returns today's appointments from GHL calendar
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { startOfDay, endOfDay } from 'date-fns'

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantId = session.tenantId
    const today = new Date()
    const ghl = await getGHLClient(tenantId)

    const result = await ghl.getAppointments({
      startDate: String(startOfDay(today).getTime()),
      endDate: String(endOfDay(today).getTime()),
    })

    const appointments = (result.events ?? []).map(appt => ({
      id: appt.id,
      title: appt.title ?? 'Appointment',
      contactName: appt.title ?? '',
      startTime: appt.startTime ?? '',
      endTime: appt.endTime ?? '',
      assignedUser: appt.assignedUserId ?? null,
      status: appt.appointmentStatus ?? appt.status ?? 'confirmed',
    }))

    return NextResponse.json({ appointments })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch appointments'
    return NextResponse.json({ appointments: [], error: message })
  }
}
