'use client'
// Accountability dashboard — admin only
// Data quality issues + user performance tracking

import Link from 'next/link'
import { AlertTriangle, Database, MapPin, Tag, Clock, MessageSquare, ListTodo, Phone } from 'lucide-react'

const CT = 'America/Chicago'
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CT })

interface Props {
  tenantSlug: string
  dataQuality: { missingMarket: number; missingSource: number; missingAddress: number; milestoneGaps: number }
  milestoneGapList: Array<{ id: string; address: string; status: string; missing: string[] }>
  firstCalls: Array<{ userId: string; userName: string; firstCallAt: string | null }>
  unreadByUser: Array<{ userId: string; userName: string; unread: number }>
  overdueWithoutCalls: Array<{ id: string; title: string; dueAt: string | null; assignedTo: string; property: string; daysOverdue: number }>
  heatMaps: Array<{ userId: string; userName: string; role: string; hours: number[]; total: number }>
}

export function AccountabilityClient({
  tenantSlug, dataQuality, milestoneGapList, firstCalls, unreadByUser, overdueWithoutCalls, heatMaps,
}: Props) {
  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-txt-primary">Accountability</h1>
        <p className="text-[12px] text-txt-muted">Data quality and team performance</p>
      </div>

      {/* ═══ SECTION 1: DATA UPDATES ═══ */}
      <Section title="Data Updates">
        <div className="grid grid-cols-4 gap-3 mb-5">
          <SC label="Missing Market" value={dataQuality.missingMarket} status={dataQuality.missingMarket === 0 ? 'good' : 'warn'} icon={<MapPin size={12} />} />
          <SC label="Missing Source" value={dataQuality.missingSource} status={dataQuality.missingSource === 0 ? 'good' : 'warn'} icon={<Tag size={12} />} />
          <SC label="Missing Address" value={dataQuality.missingAddress} status={dataQuality.missingAddress === 0 ? 'good' : 'bad'} icon={<Database size={12} />} />
          <SC label="Missing Logs" value={dataQuality.milestoneGaps} status={dataQuality.milestoneGaps === 0 ? 'good' : 'warn'} icon={<AlertTriangle size={12} />} />
        </div>

        {milestoneGapList.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Properties Missing Milestone Logs</p>
            <Table headers={['Property', 'Status', 'Missing Milestones']}>
              {milestoneGapList.map(p => (
                <tr key={p.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
                  <td className="px-4 py-2">
                    <Link href={`/${tenantSlug}/inventory/${p.id}`} className="text-txt-primary hover:text-gunner-red font-medium">
                      {p.address}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-txt-secondary">{formatStatus(p.status)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {p.missing.map(m => (
                        <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {formatMilestone(m)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Section>

      {/* ═══ SECTION 2: USER MANAGEMENT ═══ */}

      {/* Panel A: First Call Time */}
      <Section title="First Call of the Day">
        <Table headers={['Team Member', 'First Call', 'Status']}>
          {firstCalls.map(u => (
            <tr key={u.userId} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
              <td className="px-4 py-2 text-txt-primary font-medium">{u.userName}</td>
              <td className="px-4 py-2 text-txt-secondary">
                {u.firstCallAt ? fmtTime(u.firstCallAt) : '—'}
              </td>
              <td className="px-4 py-2">
                {u.firstCallAt ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">No calls yet</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Panel B: Unread Messages */}
      <Section title="Unread Messages">
        <div className="grid grid-cols-4 gap-3">
          {unreadByUser.map(u => (
            <div key={u.userId} className={`border-[0.5px] rounded-[12px] p-4 ${u.unread > 10 ? 'bg-red-50 border-red-200' : u.unread > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-[11px] font-semibold text-txt-muted">{u.userName}</p>
              <p className="text-[22px] font-bold text-txt-primary">{u.unread}</p>
              <p className="text-[10px] text-txt-muted">unread conversations</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Panel C: Overdue Tasks Without Calls */}
      <Section title="Overdue Tasks — No Call Today">
        {overdueWithoutCalls.length === 0 ? (
          <p className="text-[12px] text-txt-muted text-center py-8">All overdue tasks have been contacted today</p>
        ) : (
          <Table headers={['Task', 'Property', 'Assigned To', 'Days Overdue']}>
            {overdueWithoutCalls.map(t => (
              <tr key={t.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
                <td className="px-4 py-2 text-txt-primary font-medium">{t.title}</td>
                <td className="px-4 py-2 text-txt-secondary">{t.property}</td>
                <td className="px-4 py-2 text-txt-secondary">{t.assignedTo}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.daysOverdue > 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {t.daysOverdue}d overdue
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Panel D: Call Heat Map */}
      <Section title="Call Activity — Hourly Breakdown">
        <div className="space-y-4">
          {/* Hour labels */}
          <div className="flex items-center gap-0">
            <div className="w-[140px] shrink-0" />
            {Array.from({ length: 11 }, (_, i) => i + 8).map(h => (
              <div key={h} className="flex-1 text-center text-[9px] text-txt-muted">
                {h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`}
              </div>
            ))}
            <div className="w-[60px] shrink-0 text-center text-[9px] text-txt-muted font-semibold">Total</div>
          </div>

          {heatMaps.map(user => {
            const workHours = user.hours.slice(8, 19) // 8am-6pm
            const maxVal = Math.max(...workHours, 1)
            return (
              <div key={user.userId} className="flex items-center gap-0">
                <div className="w-[140px] shrink-0 pr-3">
                  <p className="text-[12px] font-medium text-txt-primary truncate">{user.userName}</p>
                  <p className="text-[9px] text-txt-muted">{formatRole(user.role)}</p>
                </div>
                {workHours.map((count, i) => {
                  const intensity = count === 0 ? 0 : Math.max(0.15, count / maxVal)
                  return (
                    <div key={i} className="flex-1 px-0.5">
                      <div
                        className="h-8 rounded-[4px] flex items-center justify-center text-[10px] font-semibold transition-colors"
                        style={{
                          backgroundColor: count === 0 ? 'var(--surface-tertiary)' : `rgba(34, 197, 94, ${intensity})`,
                          color: count === 0 ? 'var(--txt-muted)' : intensity > 0.5 ? 'white' : '#166534',
                        }}
                        title={`${8 + i}:00 — ${count} calls`}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    </div>
                  )
                })}
                <div className="w-[60px] shrink-0 text-center">
                  <span className="text-[14px] font-bold text-txt-primary">{user.total}</span>
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-[0.5px] rounded-[14px] overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
        <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SC({ label, value, status, icon }: { label: string; value: number; status: 'good' | 'warn' | 'bad'; icon: React.ReactNode }) {
  const colors = { good: 'bg-green-50 border-green-200', warn: 'bg-amber-50 border-amber-200', bad: 'bg-red-50 border-red-200' }
  const dots = { good: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-red-500' }
  return (
    <div className={`border-[0.5px] rounded-[12px] p-4 ${colors[status]}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${dots[status]}`} />
        <span className="text-[10px] font-semibold text-txt-muted uppercase">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[22px] font-bold text-txt-primary">{value}</p>
      </div>
    </div>
  )
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10px] font-semibold text-txt-muted uppercase border-b" style={{ borderColor: 'var(--border-light)' }}>
          {headers.map(h => <th key={h} className="px-4 py-2">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatMilestone(m: string): string {
  const names: Record<string, string> = {
    LEAD: 'Lead', APPOINTMENT_SET: 'Apt Set', OFFER_MADE: 'Offer',
    UNDER_CONTRACT: 'Contract', CLOSED: 'Closed',
    DISPO_NEW: 'Dispo New', DISPO_PUSHED: 'Pushed',
    DISPO_OFFER_RECEIVED: 'Dispo Offer', DISPO_CONTRACTED: 'Dispo Contract',
    DISPO_CLOSED: 'Dispo Closed',
  }
  return names[m] ?? m
}

function formatRole(r: string): string {
  const names: Record<string, string> = {
    LEAD_MANAGER: 'Lead Manager', ACQUISITION_MANAGER: 'Acq Manager',
    DISPOSITION_MANAGER: 'Dispo Manager', TEAM_LEAD: 'Team Lead',
  }
  return names[r] ?? r
}
