// app/(tenant)/[tenant]/appointments/page.tsx
// Appointments page — fetches from GHL calendars API with contact enrichment
import { requireSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { AppointmentsClient } from '@/components/appointments/appointments-client'
import { startOfDay, endOfDay, addDays } from 'date-fns'

export default async function AppointmentsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  const tenantId = session.tenantId
  const today = new Date()
  // GHL expects full ISO timestamps
  const startDate = startOfDay(today).toISOString()
  const endDate = endOfDay(addDays(today, 7)).toISOString()

  let appointments: AppointmentItem[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)
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
      status: a.status,
    }))
  } catch (err) {
    console.error('[Appointments] GHL fetch failed:', err instanceof Error ? err.message : err)
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
  status: string
}
