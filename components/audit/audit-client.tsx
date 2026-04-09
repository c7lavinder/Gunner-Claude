'use client'
// components/audit/audit-client.tsx
// Audit page client — 6-tab system event monitor

import { useState, useEffect, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

type AuditTab = 'dials' | 'leads' | 'appointments' | 'messages' | 'tasks' | 'stages'

interface Summary {
  totalToday: number
  counts: Record<AuditTab, number>
  failedCount: number
  lastWebhookAt: string | null
}

interface PipelineHealth {
  stuckPending: number
  stuckRecordings: number
  gradedToday: number
  gradeableToday: number
  gradingRate: number | null
  avgGradeTimeSec: number | null
}

interface HourlyBucket {
  hour: number
  webhook: number
  poll: number
}

interface DialBreakdown {
  total: number
  webhookCount: number
  pollCount: number
  noAnswer: number
  graded: number
  pending: number
  failed: number
}

interface AuditResponse {
  tab: AuditTab
  date: string
  rows: Record<string, unknown>[]
  summary: Summary
  pipelineHealth: PipelineHealth
  hourly: HourlyBucket[] | null
  dialBreakdown: DialBreakdown | null
  userMap: Record<string, string>
}

const TAB_LABELS: Record<AuditTab, string> = {
  dials: 'Dials',
  leads: 'Leads',
  appointments: 'Appointments',
  messages: 'Messages',
  tasks: 'Tasks',
  stages: 'Stage Changes',
}

const TABS: AuditTab[] = ['dials', 'leads', 'appointments', 'messages', 'tasks', 'stages']

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec === 0) return '\u2014'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDateLong(iso: string | undefined): string {
  if (!iso) return '\u2014'
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return '\u2014' }
}

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
}

function truncate(s: string | undefined | null, len: number): string {
  if (!s) return '\u2014'
  return s.length > len ? s.slice(0, len) + '...' : s
}

function payload(row: Record<string, unknown>): Record<string, unknown> {
  const rp = row.rawPayload
  if (!rp) return {}
  if (typeof rp === 'string') { try { return JSON.parse(rp) } catch { return {} } }
  return rp as Record<string, unknown>
}

function nestedStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v) return v
    if (v && typeof v === 'object') {
      const nested = v as Record<string, unknown>
      if (typeof nested.name === 'string') return nested.name
      if (typeof nested.id === 'string') return nested.id
    }
  }
  return '\u2014'
}

function exportDialsCsv(rows: Record<string, unknown>[], date: string) {
  const headers = ['Time (CT)', 'Contact', 'Direction', 'Duration (s)', 'Team Member', 'Delivery', 'Source', 'Status', 'Score', 'GHL Contact ID']
  const csvRows = rows.map(r => {
    const src = r.source as string | null
    const { delivery, source } = formatCallSource(src)
    return [
      formatTime(r.createdAt as string),
      (r.contactName as string) || (r.ghlContactId as string) || 'Unknown',
      r.direction as string || '',
      r.durationSeconds ?? '',
      (r.teamMemberName as string) || '',
      delivery.replace(/[^\w\s]/g, '').trim(),
      source,
      r.gradingStatus as string || '',
      r.score ?? '',
      r.ghlContactId ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })
  const csv = [headers.join(','), ...csvRows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gunner-dials-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function webhookStatusIcon(status: string | undefined): string {
  if (status === 'success') return '\u2705'
  if (status === 'failed') return '\u274c'
  if (status === 'processing') return '\u23f3'
  return '\u2b1c'
}

// ─── Component ─────────────────────────────────────────────────────────────

interface AuditClientProps {
  tenantSlug: string
  tenantName: string
}

export function AuditClient({ tenantSlug, tenantName }: AuditClientProps) {
  const [activeTab, setActiveTab] = useState<AuditTab>('dials')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'webhook' | 'poll'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sourceParam = activeTab === 'dials' && sourceFilter !== 'all' ? `&source=${sourceFilter}` : ''
      const res = await fetch(`/api/${tenantSlug}/audit?tab=${activeTab}&date=${selectedDate}${sourceParam}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, activeTab, selectedDate, sourceFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const summary = data?.summary
  const health = data?.pipelineHealth
  const hourly = data?.hourly
  const dialBreakdown = data?.dialBreakdown
  const userMap = data?.userMap ?? {}
  const rows = data?.rows ?? []
  const lastMins = minutesAgo(summary?.lastWebhookAt ?? null)
  const statusColor = lastMins === null ? 'bg-red-400' : lastMins < 60 ? 'bg-green-400' : lastMins < 240 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-txt-primary">Audit</h1>
          <p className="text-ds-fine text-txt-muted">System event monitor</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-ds-fine text-txt-muted">{tenantName}</span>
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-2.5 py-1.5 text-ds-fine border rounded-[8px] bg-surface-primary text-txt-primary"
            style={{ borderColor: 'var(--border-medium)' }}
          />
        </div>
      </div>

      {/* Status bar */}
      {summary && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-[10px] bg-surface-secondary">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor} inline-block`} />
            <span className="text-ds-fine text-txt-secondary">
              {lastMins === null ? 'No events today' : `Last event: ${lastMins} min ago`}
            </span>
          </div>
          <span className="text-ds-fine text-txt-secondary">Events today: {summary.totalToday}</span>
          {summary.failedCount > 0 && (
            <span className="text-ds-fine text-red-600 font-medium">Failed: {summary.failedCount}</span>
          )}
        </div>
      )}

      {/* Pipeline health */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HealthCard
            label="Grading Rate"
            value={health.gradingRate !== null ? `${health.gradingRate}%` : 'N/A'}
            detail={`${health.gradedToday} of ${health.gradeableToday} gradeable`}
            status={health.gradingRate === null ? 'neutral' : health.gradingRate >= 90 ? 'good' : health.gradingRate >= 50 ? 'warn' : 'bad'}
          />
          <HealthCard
            label="Stuck Pending"
            value={String(health.stuckPending)}
            detail="calls > 30 min without grade"
            status={health.stuckPending === 0 ? 'good' : health.stuckPending <= 3 ? 'warn' : 'bad'}
          />
          <HealthCard
            label="Stuck Recordings"
            value={String(health.stuckRecordings)}
            detail="fetch jobs pending/failed"
            status={health.stuckRecordings === 0 ? 'good' : health.stuckRecordings <= 3 ? 'warn' : 'bad'}
          />
          <HealthCard
            label="Avg Grade Time"
            value={health.avgGradeTimeSec !== null ? formatDuration(health.avgGradeTimeSec) : 'N/A'}
            detail="call created \u2192 graded"
            status={health.avgGradeTimeSec === null ? 'neutral' : health.avgGradeTimeSec < 300 ? 'good' : health.avgGradeTimeSec < 600 ? 'warn' : 'bad'}
          />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border-light)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab
          const count = summary?.counts[tab] ?? 0
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-3 py-2.5 text-ds-fine font-medium whitespace-nowrap transition-colors ${
                active ? 'text-gunner-red' : 'text-txt-muted hover:text-txt-primary'
              }`}
            >
              {TAB_LABELS[tab]} <span className="text-[10px] opacity-60">({count})</span>
              {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-gunner-red rounded-full" />}
            </button>
          )
        })}
      </div>

      {/* Source filter — Dials tab only */}
      {activeTab === 'dials' && (
        <div className="flex items-center gap-2">
          <span className="text-ds-fine text-txt-muted">Source:</span>
          {(['all', 'webhook', 'poll'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setSourceFilter(opt)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                sourceFilter === opt
                  ? 'bg-gunner-red text-white'
                  : 'bg-surface-secondary text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {opt === 'all' ? 'All' : opt === 'webhook' ? 'Webhook' : 'Poll'}
            </button>
          ))}
        </div>
      )}

      {/* Reconciliation bar — Dials tab only */}
      {activeTab === 'dials' && dialBreakdown && (
        <div className="px-4 py-3 rounded-[10px] border bg-surface-primary" style={{ borderColor: 'var(--border-medium)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-ds-fine font-semibold text-txt-primary">Gunner: {dialBreakdown.total} dials</span>
              <span className="text-[10px] text-txt-muted">\u26a1 {dialBreakdown.webhookCount} webhook</span>
              <span className="text-[10px] text-txt-muted">\ud83d\udd04 {dialBreakdown.pollCount} poll</span>
              <span className="text-[10px] text-txt-muted">\u2705 {dialBreakdown.graded} graded</span>
              <span className="text-[10px] text-txt-muted">\u23f3 {dialBreakdown.pending} pending</span>
              <span className="text-[10px] text-txt-muted">\ud83d\udcf5 {dialBreakdown.noAnswer} no answer</span>
              {dialBreakdown.failed > 0 && <span className="text-[10px] text-red-600">\u274c {dialBreakdown.failed} failed</span>}
            </div>
            <button
              onClick={() => exportDialsCsv(rows, selectedDate)}
              className="px-3 py-1.5 text-[11px] font-medium rounded-[8px] bg-surface-secondary text-txt-secondary hover:text-txt-primary transition-colors"
            >
              Export CSV
            </button>
          </div>
          <p className="text-[9px] text-txt-muted mt-1">Compare this total against your GHL dashboard dial count. Times shown in Central.</p>
        </div>
      )}

      {/* Hourly webhook vs poll — Dials tab only */}
      {activeTab === 'dials' && hourly && hourly.some(h => h.webhook > 0 || h.poll > 0) && (
        <HourlyChart hourly={hourly} />
      )}

      {/* Error state */}
      {error && (
        <div className="px-4 py-3 rounded-[10px] bg-red-50 text-red-700 text-ds-fine">
          Failed to load: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-[8px] bg-surface-secondary animate-pulse" />
          ))}
        </div>
      )}

      {/* Data table */}
      {!loading && !error && (
        <>
          {rows.length === 0 ? (
            <EmptyState tab={activeTab} date={selectedDate} />
          ) : (
            <div className="overflow-x-auto">
              {activeTab === 'dials' && <DialsTable rows={rows} expandedRow={expandedRow} onToggle={setExpandedRow} />}
              {activeTab === 'leads' && <LeadsTable rows={rows} expandedRow={expandedRow} onToggle={setExpandedRow} />}
              {activeTab === 'appointments' && <WebhookTable rows={rows} columns={buildAppointmentColumns()} expandedRow={expandedRow} onToggle={setExpandedRow} userMap={userMap} />}
              {activeTab === 'messages' && <WebhookTable rows={rows} columns={buildMessageColumns()} expandedRow={expandedRow} onToggle={setExpandedRow} userMap={userMap} />}
              {activeTab === 'tasks' && <WebhookTable rows={rows} columns={buildTaskColumns()} expandedRow={expandedRow} onToggle={setExpandedRow} userMap={userMap} />}
              {activeTab === 'stages' && <WebhookTable rows={rows} columns={buildStageColumns()} expandedRow={expandedRow} onToggle={setExpandedRow} userMap={userMap} />}
            </div>
          )}
          {rows.length >= 500 && (
            <p className="text-ds-fine text-txt-muted text-center py-2">Showing 500 of {summary?.counts[activeTab] ?? '500+'}</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Empty States ──────────────────────────────────────────────────────────

function EmptyState({ tab, date }: { tab: AuditTab; date: string }) {
  const messages: Record<AuditTab, string> = {
    dials: `No dials on ${date}`,
    leads: `No new leads on ${date}`,
    appointments: `No appointments on ${date} \u2014 appointment events will appear here as they come in from GHL`,
    messages: `No messages on ${date} \u2014 message events will appear here as they come in from GHL`,
    tasks: `No tasks on ${date} \u2014 task events will appear here as they come in from GHL`,
    stages: `No stage changes on ${date} \u2014 stage change events will appear here as they come in from GHL`,
  }
  return (
    <div className="py-12 text-center">
      <p className="text-ds-body text-txt-muted">{messages[tab]}</p>
    </div>
  )
}

// ─── Table Shell ───────────────────────────────────────────────────────────

const thClass = 'px-3 py-2.5 text-left text-[10px] font-semibold text-txt-muted uppercase tracking-wider whitespace-nowrap'
const tdClass = 'px-3 py-2.5 text-ds-fine text-txt-primary whitespace-nowrap'
const trClass = 'border-b hover:bg-surface-secondary transition-colors'
const failedTrClass = 'border-b bg-[#FEF2F2] hover:bg-red-100 transition-colors'

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full min-w-[700px]">
      <thead>
        <tr className="border-b" style={{ borderColor: 'var(--border-light)' }}>
          {headers.map(h => <th key={h} className={thClass}>{h}</th>)}
        </tr>
      </thead>
      <tbody style={{ borderColor: 'var(--border-light)' }}>
        {children}
      </tbody>
    </table>
  )
}

// ─── Tab 1: Dials ──────────────────────────────────────────────────────────

function formatCallSource(src: string | null): { delivery: string; deliveryClass: string; source: string; sourceClass: string } {
  if (src === 'webhook_oauth') return { delivery: '\u26a1 Real-time', deliveryClass: 'text-green-600', source: 'OAuth', sourceClass: 'text-green-600' }
  if (src === 'webhook_automation') return { delivery: '\u26a1 Real-time', deliveryClass: 'text-green-600', source: 'Automation', sourceClass: 'text-blue-600' }
  if (src === 'webhook') return { delivery: '\u26a1 Real-time', deliveryClass: 'text-green-600', source: 'Webhook', sourceClass: 'text-green-600' }
  if (src === 'poll') return { delivery: '\ud83d\udd53 Cron', deliveryClass: 'text-amber-600', source: 'API Poll', sourceClass: 'text-amber-600' }
  return { delivery: '\u2014', deliveryClass: 'text-txt-muted', source: '\u2014', sourceClass: 'text-txt-muted' }
}

function DialsTable({ rows, expandedRow, onToggle }: { rows: Record<string, unknown>[]; expandedRow: string | null; onToggle: (id: string | null) => void }) {
  return (
    <TableShell headers={['Time', 'Contact', 'Direction', 'Duration', 'Team Member', 'Delivery', 'Source', 'Status', 'Score']}>
      {rows.map(r => {
        const dur = r.durationSeconds as number | null
        const status = r.gradingStatus as string
        const result = r.callResult as string | null
        const score = r.score as number | null
        const dir = r.direction as string | null
        const { delivery, deliveryClass, source, sourceClass } = formatCallSource(r.source as string | null)

        let statusLabel = 'Unknown'
        let statusClass = 'text-txt-muted'
        if (status === 'COMPLETED' && score !== null) { statusLabel = 'Graded \u2705'; statusClass = 'text-green-600' }
        else if (result === 'no_answer') { statusLabel = 'No Answer'; statusClass = 'text-txt-muted' }
        else if (status === 'FAILED') { statusLabel = 'Failed \u274c'; statusClass = 'text-red-600' }
        else if (status === 'PENDING') { statusLabel = 'Pending \u23f3'; statusClass = 'text-blue-600' }
        else if (dur && dur < 45) { statusLabel = 'Too Short'; statusClass = 'text-txt-muted' }

        const id = r.id as string
        const isExpanded = expandedRow === id
        return (
          <ExpandableRow key={id} id={id} isExpanded={isExpanded} onToggle={onToggle} row={r} colSpan={9} isFailed={false}>
            <td className={tdClass}>{formatTime(r.createdAt as string)}</td>
            <td className={tdClass}>{(r.contactName as string) || (r.ghlContactId as string) || 'Unknown'}</td>
            <td className={tdClass}>{dir === 'INBOUND' ? '\ud83d\udce5 Inbound' : dir === 'OUTBOUND' ? '\ud83d\udce4 Outbound' : '\u2014'}</td>
            <td className={tdClass}>{formatDuration(dur)}</td>
            <td className={tdClass}>{(r.teamMemberName as string) || '\u2014'}</td>
            <td className={`${tdClass} ${deliveryClass} font-medium text-[11px]`}>{delivery}</td>
            <td className={`${tdClass} ${sourceClass} font-medium text-[11px]`}>{source}</td>
            <td className={`${tdClass} ${statusClass} font-medium`}>{statusLabel}</td>
            <td className={tdClass}>{score !== null ? Math.round(score) : '\u2014'}</td>
          </ExpandableRow>
        )
      })}
    </TableShell>
  )
}

// ─── Tab 2: Leads ──────────────────────────────────────────────────────────

function LeadsTable({ rows, expandedRow, onToggle }: { rows: Record<string, unknown>[]; expandedRow: string | null; onToggle: (id: string | null) => void }) {
  return (
    <TableShell headers={['Time', 'Contact / Seller', 'Address', 'Lead Source', 'Market', 'Gunner Stage', 'GHL Stage']}>
      {rows.map(r => {
        const id = r.id as string
        return (
          <ExpandableRow key={id} id={id} isExpanded={expandedRow === id} onToggle={onToggle} row={r} colSpan={7} isFailed={false}>
            <td className={tdClass}>{formatTime(r.createdAt as string)}</td>
            <td className={tdClass}>{(r.sellerName as string) || 'Unknown Seller'}</td>
            <td className={tdClass}>{(r.address as string) || '\u2014'}</td>
            <td className={tdClass}>{(r.leadSource as string) || '\u2014'}</td>
            <td className={tdClass}>{(r.market as string) || '\u2014'}</td>
            <td className={tdClass}>{(r.status as string) || '\u2014'}</td>
            <td className={tdClass}>{(r.ghlStage as string) || '\u2014'}</td>
          </ExpandableRow>
        )
      })}
    </TableShell>
  )
}

// ─── Tabs 3-6: Webhook-based tables ────────────────────────────────────────

interface WebhookColumn {
  header: string
  render: (row: Record<string, unknown>, p: Record<string, unknown>, um: Record<string, string>) => string
}

function resolveUser(userId: string | undefined | null, um: Record<string, string>): string {
  if (!userId) return '\u2014'
  return um[userId] ?? userId.slice(0, 8) + '...'
}

function formatStatus(s: string | undefined): string {
  if (!s) return '\u2014'
  if (s === 'open') return 'Open'
  if (s === 'won') return 'Won'
  if (s === 'lost') return 'Lost'
  if (s === 'abandoned') return 'Abandoned'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDeliveryStatus(s: string | undefined): string {
  if (s === 'sent') return 'Sent'
  if (s === 'delivered') return 'Delivered'
  if (s === 'read') return 'Read'
  if (s === 'failed') return 'Failed'
  return s ?? '\u2014'
}

function buildAppointmentColumns(): WebhookColumn[] {
  return [
    { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
    { header: 'Title', render: (_, p) => { const apt = (p.appointment ?? {}) as Record<string, unknown>; return (apt.title ?? '\u2014') as string } },
    { header: 'Scheduled', render: (_, p) => { const apt = (p.appointment ?? {}) as Record<string, unknown>; return formatDateLong(apt.startTime as string | undefined) } },
    { header: 'Assigned To', render: (_, p, um) => { const apt = (p.appointment ?? {}) as Record<string, unknown>; return resolveUser(apt.assignedUserId as string, um) } },
    { header: 'Location', render: (_, p) => { const apt = (p.appointment ?? {}) as Record<string, unknown>; return (apt.address ?? '\u2014') as string } },
    { header: 'Status', render: (_, p) => { const apt = (p.appointment ?? {}) as Record<string, unknown>; return formatStatus(apt.appointmentStatus as string) } },
    { header: 'Event Status', render: (r) => webhookStatusIcon(r.status as string) },
  ]
}

function buildMessageColumns(): WebhookColumn[] {
  return [
    { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
    { header: 'Direction', render: (_, p) => { const d = String(p.direction ?? ''); return d === 'inbound' ? '\ud83d\udce5 Inbound' : d === 'outbound' ? '\ud83d\udce4 Outbound' : '\u2014' } },
    { header: 'Type', render: (_, p) => { const mt = String(p.messageType ?? ''); return mt === 'SMS' ? 'SMS' : mt === 'Email' ? 'Email' : mt === 'CALL' ? 'Call' : mt || '\u2014' } },
    { header: 'Preview', render: (_, p) => truncate(p.body as string | undefined, 60) },
    { header: 'Team Member', render: (_, p, um) => resolveUser(p.userId as string, um) },
    { header: 'Delivery', render: (_, p) => formatDeliveryStatus(p.status as string) },
  ]
}

function buildTaskColumns(): WebhookColumn[] {
  return [
    { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
    { header: 'Task', render: (_, p) => truncate(p.title as string | undefined, 50) },
    { header: 'Assigned To', render: (_, p, um) => resolveUser(p.assignedTo as string, um) },
    { header: 'Due Date', render: (_, p) => { const d = p.dueDate as string | undefined; if (!d) return '\u2014'; try { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) } catch { return '\u2014' } } },
    { header: 'Action', render: (r) => { const et = r.eventType as string; if (et === 'TaskComplete' || et === 'TaskCompleted' || et === 'task.completed') return 'Completed'; if (et === 'TaskCreate') return 'Created'; if (et === 'TaskUpdate') return 'Updated'; return et ?? '\u2014' } },
  ]
}

function buildStageColumns(): WebhookColumn[] {
  return [
    { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
    { header: 'Contact', render: (_, p) => (p.name ?? '\u2014') as string },
    { header: 'Assigned To', render: (_, p, um) => resolveUser(p.assignedTo as string, um) },
    { header: 'Pipeline Status', render: (_, p) => formatStatus(p.status as string) },
    { header: 'Action', render: (r) => { const et = r.eventType as string; if (et === 'OpportunityStageUpdate') return 'Stage Changed'; if (et === 'OpportunityUpdate') return 'Updated'; if (et === 'OpportunityCreate') return 'Created'; return et ?? '\u2014' } },
    { header: 'Event Status', render: (r) => webhookStatusIcon(r.status as string) },
  ]
}

function WebhookTable({ rows, columns, expandedRow, onToggle, userMap }: { rows: Record<string, unknown>[]; columns: WebhookColumn[]; expandedRow: string | null; onToggle: (id: string | null) => void; userMap: Record<string, string> }) {
  return (
    <TableShell headers={columns.map(c => c.header)}>
      {rows.map(r => {
        const p = payload(r)
        const id = r.id as string
        const isFailed = (r.status as string) === 'failed'
        return (
          <ExpandableRow key={id} id={id} isExpanded={expandedRow === id} onToggle={onToggle} row={r} colSpan={columns.length} isFailed={isFailed}>
            {columns.map(col => (
              <td key={col.header} className={tdClass}>{col.render(r, p, userMap)}</td>
            ))}
          </ExpandableRow>
        )
      })}
    </TableShell>
  )
}

// ─── Expandable Row ────────────────────────────────────────────────────────

function ExpandableRow({ id, isExpanded, onToggle, row, colSpan, isFailed, children }: {
  id: string; isExpanded: boolean; onToggle: (id: string | null) => void
  row: Record<string, unknown>; colSpan: number; isFailed: boolean; children: React.ReactNode
}) {
  return (
    <>
      <tr
        className={`${isFailed ? failedTrClass : trClass} cursor-pointer`}
        style={{ borderColor: 'var(--border-light)' }}
        onClick={() => onToggle(isExpanded ? null : id)}
        title={isFailed ? (row.errorReason as string) ?? 'Processing failed' : 'Click to expand'}
      >
        {children}
      </tr>
      {isExpanded && (
        <tr className="border-b" style={{ borderColor: 'var(--border-light)' }}>
          <td colSpan={colSpan} className="px-4 py-3 bg-surface-secondary">
            <ExpandedDetail row={row} />
          </td>
        </tr>
      )}
    </>
  )
}

function ExpandedDetail({ row }: { row: Record<string, unknown> }) {
  const rp = row.rawPayload as Record<string, unknown> | undefined
  const err = row.errorReason as string | undefined

  // For Call rows (dials/leads), show key fields
  const fields: [string, unknown][] = Object.entries(row).filter(
    ([k]) => !['id', 'rawPayload'].includes(k) && row[k] !== null && row[k] !== undefined
  )

  return (
    <div className="space-y-3 text-ds-fine">
      {err && (
        <div className="px-3 py-2 rounded-[8px] bg-red-50 text-red-700">
          <span className="font-semibold">Error:</span> {err}
        </div>
      )}
      <div>
        <p className="font-semibold text-txt-secondary mb-1">Fields</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
          {fields.map(([k, v]) => (
            <div key={k}>
              <span className="text-txt-muted">{k}:</span>{' '}
              <span className="text-txt-primary">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      </div>
      {rp && (
        <div>
          <p className="font-semibold text-txt-secondary mb-1">Raw Payload</p>
          <pre className="text-[10px] text-txt-secondary bg-surface-primary border rounded-[8px] px-3 py-2 overflow-x-auto max-h-[300px]" style={{ borderColor: 'var(--border-light)' }}>
            {JSON.stringify(rp, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Health Card ───────────────────────────────────────────────────────────

function HealthCard({ label, value, detail, status }: {
  label: string; value: string; detail: string; status: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const borderColor = status === 'good' ? 'border-green-300' : status === 'warn' ? 'border-yellow-300' : status === 'bad' ? 'border-red-300' : 'border-gray-200'
  const dotColor = status === 'good' ? 'bg-green-400' : status === 'warn' ? 'bg-yellow-400' : status === 'bad' ? 'bg-red-400' : 'bg-gray-300'

  return (
    <div className={`px-4 py-3 rounded-[10px] border bg-surface-primary ${borderColor}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[20px] font-semibold text-txt-primary leading-tight">{value}</p>
      <p className="text-[10px] text-txt-muted mt-0.5">{detail}</p>
    </div>
  )
}

// ─── Hourly Chart ──────────────────────────────────────────────────────────

function HourlyChart({ hourly }: { hourly: HourlyBucket[] }) {
  const maxVal = Math.max(...hourly.map(h => Math.max(h.webhook, h.poll)), 1)
  // Only show hours that have data or are within business range (6am-10pm UTC ~= 1am-5pm CT)
  const activeHours = hourly.filter(h => h.webhook > 0 || h.poll > 0 || (h.hour >= 12 && h.hour <= 23))
  if (activeHours.length === 0) return null

  return (
    <div className="px-4 py-3 rounded-[10px] bg-surface-secondary">
      <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Webhook vs Poll by Hour (UTC)</p>
      <div className="flex items-end gap-1 h-[60px]">
        {activeHours.map(h => {
          const wH = Math.max((h.webhook / maxVal) * 56, h.webhook > 0 ? 4 : 0)
          const pH = Math.max((h.poll / maxVal) * 56, h.poll > 0 ? 4 : 0)
          const label = h.hour > 12 ? `${h.hour - 12}p` : h.hour === 12 ? '12p' : h.hour === 0 ? '12a' : `${h.hour}a`
          return (
            <div key={h.hour} className="flex flex-col items-center gap-0.5 flex-1 min-w-[24px]" title={`${label}: ${h.webhook} webhook, ${h.poll} poll`}>
              <div className="flex items-end gap-[2px] w-full justify-center">
                <div className="w-[8px] rounded-t-sm bg-green-400" style={{ height: `${wH}px` }} />
                <div className="w-[8px] rounded-t-sm bg-amber-400" style={{ height: `${pH}px` }} />
              </div>
              <span className="text-[8px] text-txt-muted">{label}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-400" /><span className="text-[9px] text-txt-muted">Webhook</span></div>
        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /><span className="text-[9px] text-txt-muted">Poll</span></div>
      </div>
    </div>
  )
}
