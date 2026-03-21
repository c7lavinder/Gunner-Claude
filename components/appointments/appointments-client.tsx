'use client'
// components/appointments/appointments-client.tsx

import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { Calendar, Clock, User, AlertCircle } from 'lucide-react'

interface AppointmentItem {
  id: string
  title: string
  startTime: string
  endTime: string
  contactId: string
  contactName?: string | null
  assignedUserName?: string | null
  status: string
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-semantic-green-bg text-semantic-green',
  new: 'bg-semantic-blue-bg text-semantic-blue',
  cancelled: 'bg-semantic-red-bg text-semantic-red',
  showed: 'bg-semantic-green-bg text-semantic-green',
  'no-show': 'bg-surface-tertiary text-txt-secondary',
}

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEEE, MMM d')
}

export function AppointmentsClient({ appointments, fetchError, tenantSlug }: {
  appointments: AppointmentItem[]
  fetchError: boolean
  tenantSlug: string
}) {
  // Group by day
  const grouped = appointments.reduce<Record<string, AppointmentItem[]>>((acc, appt) => {
    const label = dayLabel(appt.startTime)
    if (!acc[label]) acc[label] = []
    acc[label].push(appt)
    return acc
  }, {})

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-ds-page font-semibold text-txt-primary">Appointments</h1>
        <p className="text-ds-body text-txt-secondary mt-1">Next 7 days from Go High Level</p>
      </div>

      {fetchError && (
        <div className="bg-semantic-red-bg border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] px-5 py-4 flex items-start gap-3">
          <AlertCircle size={14} className="text-semantic-red shrink-0 mt-0.5" />
          <p className="text-ds-body text-semantic-red">
            Could not load appointments. Your GHL connection may need additional permissions — try reconnecting GHL in Settings &rarr; Integrations.
          </p>
        </div>
      )}

      {!fetchError && appointments.length === 0 && (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
          <Calendar size={24} className="text-txt-muted mx-auto mb-3" />
          <p className="text-txt-secondary text-ds-body">No appointments in the next 7 days</p>
        </div>
      )}

      {Object.entries(grouped).map(([day, appts]) => (
        <div key={day}>
          <p className="text-ds-fine font-medium text-txt-muted uppercase tracking-[0.08em] mb-2">{day}</p>
          <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] divide-y divide-[rgba(0,0,0,0.06)]">
            {appts.map((appt) => {
              const start = parseISO(appt.startTime)
              const end = parseISO(appt.endTime)
              const statusColor = STATUS_COLORS[appt.status.toLowerCase()] ?? STATUS_COLORS.new
              return (
                <div key={appt.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-secondary transition-colors">
                  {/* Time column */}
                  <div className="w-16 shrink-0 text-right">
                    <p className="text-ds-label font-medium text-txt-primary">{format(start, 'h:mm')}</p>
                    <p className="text-ds-fine text-txt-muted">{format(start, 'a')}</p>
                  </div>

                  {/* Divider line */}
                  <div className="w-px h-10 bg-gunner-red/30 shrink-0" />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-label font-medium text-txt-primary truncate">{appt.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-ds-fine text-txt-muted">
                        <Clock size={10} />
                        {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
                      </span>
                      {appt.contactName && (
                        <span className="flex items-center gap-1 text-ds-fine text-txt-secondary">
                          <User size={10} />
                          {appt.contactName}
                        </span>
                      )}
                      {appt.assignedUserName && (
                        <span className="text-ds-fine text-semantic-blue flex items-center gap-1">
                          <User size={10} /> {appt.assignedUserName}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className={`text-ds-fine font-medium px-2 py-[3px] rounded-[9999px] shrink-0 ${statusColor}`}>
                    {appt.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
