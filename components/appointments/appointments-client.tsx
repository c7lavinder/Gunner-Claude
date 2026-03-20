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
  status: string
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-green-500/10 text-green-400 border-green-500/20',
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
  showed: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'no-show': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
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
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Appointments</h1>
        <p className="text-sm text-gray-400 mt-0.5">Next 7 days from Go High Level</p>
      </div>

      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />
          Could not load appointments. Your GHL connection may need additional permissions — try reconnecting GHL in Settings → Integrations.
        </div>
      )}

      {!fetchError && appointments.length === 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl py-16 text-center">
          <Calendar size={24} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No appointments in the next 7 days</p>
        </div>
      )}

      {Object.entries(grouped).map(([day, appts]) => (
        <div key={day}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{day}</p>
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
            {appts.map((appt) => {
              const start = parseISO(appt.startTime)
              const end = parseISO(appt.endTime)
              const statusColor = STATUS_COLORS[appt.status.toLowerCase()] ?? STATUS_COLORS.new
              return (
                <div key={appt.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Time column */}
                  <div className="w-16 shrink-0 text-right">
                    <p className="text-sm font-medium text-white">{format(start, 'h:mm')}</p>
                    <p className="text-xs text-gray-500">{format(start, 'a')}</p>
                  </div>

                  {/* Divider line */}
                  <div className="w-px h-10 bg-orange-500/40 shrink-0" />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{appt.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock size={10} />
                        {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
                      </span>
                      {appt.contactName && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <User size={10} />
                          {appt.contactName}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${statusColor}`}>
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
