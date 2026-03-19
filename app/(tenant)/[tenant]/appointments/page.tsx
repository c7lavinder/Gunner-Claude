import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/appointments/page.tsx


import { getGHLClient } from '@/lib/ghl/client'
import { AppointmentsClient } from '@/components/appointments/appointments-client'
import { format, startOfDay, endOfDay, addDays } from 'date-fns'

export default async function AppointmentsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const tenantId = session.tenantId
  const ghlUserId = undefined

  const today = new Date()
  const startDate = format(startOfDay(today), "yyyy-MM-dd'T'HH:mm:ss'Z'")
  const endDate = format(endOfDay(addDays(today, 7)), "yyyy-MM-dd'T'HH:mm:ss'Z'")

  let appointments: AppointmentItem[] = []
  let fetchError = false

  try {
    const ghl = await getGHLClient(tenantId)
    const result = await ghl.getAppointments({ startDate, endDate, userId: ghlUserId })
    appointments = (result.appointments ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      startTime: a.startTime,
      endTime: a.endTime,
      contactId: a.contactId,
      status: a.status,
    }))
  } catch {
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
  status: string
}
