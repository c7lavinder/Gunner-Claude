// app/(tenant)/[tenant]/appointments/page.tsx
// Appointments page — fetches from GHL calendars API with contact + user enrichment
import { requireSession } from '@/lib/auth/session'
import { getGHLClient, GHLError } from '@/lib/ghl/client'
import { AppointmentsClient } from '@/components/appointments/appointments-client'
import { startOfDay, endOfDay, addDays } from 'date-fns'

export default async function AppointmentsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const today = new Date()
  const startDate = startOfDay(today).toISOString()
  const endDate = endOfDay(addDays(today, 7)).toISOString()

  let appointments: AppointmentItem[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)

    // Resolve GHL user IDs to names
    let apptUserMap = new Map<string, string>()
    try {
      const usersResult = await ghl.getLocationUsers()
      for (const u of (usersResult?.users ?? [])) {
        const name = u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
        if (u.id && name) apptUserMap.set(u.id, name)
      }
    } catch { /* non-fatal */ }

    const result = await ghl.getAppointments({ startDate, endDate })
    const events = result.events ?? result.appointments ?? []

    // Enrich with contact names (batch, max 15)
    const contactIds = [...new Set(events.map(a => a.contactId).filter(Boolean))]
    const contactMap = new Map<string, string>()
    const batchIds = contactIds.slice(0, 15)
    const contactResults = await Promise.allSettled(
      batchIds.map(id => ghl.getContact(id))
    )
    contactResults.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value) {
        const c = res.value
        contactMap.set(batchIds[i], `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email || 'Unknown')
      }
    })

    appointments = events.map((a) => ({
      id: a.id,
      title: a.title || contactMap.get(a.contactId) || 'Appointment',
      startTime: a.startTime,
      endTime: a.endTime,
      contactId: a.contactId,
      contactName: contactMap.get(a.contactId) ?? null,
      assignedUserName: apptUserMap.get(a.assignedUserId || a.userId || '') ?? null,
      status: a.appointmentStatus || a.status || 'new',
    }))
  } catch (err) {
    const statusCode = err instanceof GHLError ? err.statusCode : null
    console.error('[Appointments] GHL fetch failed:', {
      statusCode,
      message: err instanceof Error ? err.message : err,
    })
    fetchError = true
  }

  return (
    <AppointmentsClient
      appointments={appointments}
      fetchError={fetchError}
      tenantSlug={params.tenant}
    />
  )
}

interface AppointmentItem {
  id: string
  title: string
  startTime: string
  endTime: string
  contactId: string
  contactName: string | null
  assignedUserName: string | null
  status: string
}
