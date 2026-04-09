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

interface AuditResponse {
  tab: AuditTab
  date: string
  rows: Record<string, unknown>[]
  summary: Summary
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
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
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

  const summary = data?.summary
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
              {activeTab === 'dials' && <DialsTable rows={rows} />}
              {activeTab === 'leads' && <LeadsTable rows={rows} />}
              {activeTab === 'appointments' && <WebhookTable rows={rows} columns={appointmentColumns} />}
              {activeTab === 'messages' && <WebhookTable rows={rows} columns={messageColumns} />}
              {activeTab === 'tasks' && <WebhookTable rows={rows} columns={taskColumns} />}
              {activeTab === 'stages' && <WebhookTable rows={rows} columns={stageColumns} />}
            </div>
          )}
          {rows.length >= 200 && (
            <p className="text-ds-fine text-txt-muted text-center py-2">Showing 200 of {summary?.counts[activeTab] ?? '200+'} — load more not yet implemented</p>
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

function DialsTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <TableShell headers={['Time', 'Contact', 'Direction', 'Duration', 'Team Member', 'Source', 'Status', 'Score']}>
      {rows.map(r => {
        const dur = r.durationSeconds as number | null
        const status = r.gradingStatus as string
        const result = r.callResult as string | null
        const score = r.score as number | null
        const dir = r.direction as string | null
        const src = r.source as string | null

        let statusLabel = 'Unknown'
        let statusClass = 'text-txt-muted'
        if (status === 'COMPLETED' && score !== null) { statusLabel = 'Graded \u2705'; statusClass = 'text-green-600' }
        else if (result === 'no_answer') { statusLabel = 'No Answer'; statusClass = 'text-txt-muted' }
        else if (status === 'FAILED') { statusLabel = 'Failed \u274c'; statusClass = 'text-red-600' }
        else if (status === 'PENDING') { statusLabel = 'Pending \u23f3'; statusClass = 'text-blue-600' }
        else if (dur && dur < 45) { statusLabel = 'Too Short'; statusClass = 'text-txt-muted' }

        const sourceLabel = src === 'webhook' ? '\u26a1 Webhook' : src === 'poll' ? '\ud83d\udd04 Poll' : '\u2014'
        const sourceClass = src === 'webhook' ? 'text-green-600' : src === 'poll' ? 'text-amber-600' : 'text-txt-muted'

        return (
          <tr key={r.id as string} className={trClass} style={{ borderColor: 'var(--border-light)' }}>
            <td className={tdClass}>{formatTime(r.createdAt as string)}</td>
            <td className={tdClass}>{(r.contactName as string) || (r.ghlContactId as string) || 'Unknown'}</td>
            <td className={tdClass}>{dir === 'INBOUND' ? '\ud83d\udce5 Inbound' : dir === 'OUTBOUND' ? '\ud83d\udce4 Outbound' : '\u2014'}</td>
            <td className={tdClass}>{formatDuration(dur)}</td>
            <td className={tdClass}>{(r.teamMemberName as string) || '\u2014'}</td>
            <td className={`${tdClass} ${sourceClass} font-medium text-[11px]`}>{sourceLabel}</td>
            <td className={`${tdClass} ${statusClass} font-medium`}>{statusLabel}</td>
            <td className={tdClass}>{score !== null ? Math.round(score) : '\u2014'}</td>
          </tr>
        )
      })}
    </TableShell>
  )
}

// ─── Tab 2: Leads ──────────────────────────────────────────────────────────

function LeadsTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <TableShell headers={['Time', 'Contact / Seller', 'Address', 'Lead Source', 'Market', 'Gunner Stage', 'GHL Stage']}>
      {rows.map(r => (
        <tr key={r.id as string} className={trClass} style={{ borderColor: 'var(--border-light)' }}>
          <td className={tdClass}>{formatTime(r.createdAt as string)}</td>
          <td className={tdClass}>{(r.sellerName as string) || 'Unknown Seller'}</td>
          <td className={tdClass}>{(r.address as string) || '\u2014'}</td>
          <td className={tdClass}>{(r.leadSource as string) || '\u2014'}</td>
          <td className={tdClass}>{(r.market as string) || '\u2014'}</td>
          <td className={tdClass}>{(r.status as string) || '\u2014'}</td>
          <td className={tdClass}>{(r.ghlStage as string) || '\u2014'}</td>
        </tr>
      ))}
    </TableShell>
  )
}

// ─── Tabs 3-6: Webhook-based tables ────────────────────────────────────────

interface WebhookColumn {
  header: string
  render: (row: Record<string, unknown>, p: Record<string, unknown>) => string
}

const appointmentColumns: WebhookColumn[] = [
  { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
  { header: 'Contact', render: (_, p) => nestedStr(p, 'contact', 'contactName') },
  { header: 'Scheduled Time', render: (_, p) => formatDateLong((p.startTime ?? (p.appointment as Record<string, unknown>)?.startTime) as string | undefined) },
  { header: 'Type', render: (_, p) => (p.appointmentType ?? p.type ?? '\u2014') as string },
  { header: 'Assigned To', render: (_, p) => (p.assignedUserId ?? p.calendarId ?? '\u2014') as string },
  { header: 'Status', render: (_, p) => (p.appointmentStatus ?? p.status ?? '\u2014') as string },
  { header: 'Event Status', render: (r) => webhookStatusIcon(r.status as string) },
]

const messageColumns: WebhookColumn[] = [
  { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
  { header: 'Contact', render: (_, p) => nestedStr(p, 'contact', 'contactName', 'fullName') || 'Unknown' },
  { header: 'Direction', render: (r) => { const et = r.eventType as string; return et?.includes('Inbound') ? '\ud83d\udce5 Inbound' : et?.includes('Outbound') ? '\ud83d\udce4 Outbound' : '\u2014' } },
  { header: 'Preview', render: (_, p) => truncate((p.body ?? (p.message as Record<string, unknown>)?.body) as string | undefined, 60) },
  { header: 'Team Member', render: (_, p) => (p.userId ?? p.assignedTo ?? '\u2014') as string },
  { header: 'Read', render: (_, p) => p.read === true ? '\u2705 Read' : '\u2b1c Unread' },
  { header: 'Replied', render: (_, p) => p.replied === true ? '\u2705 Replied' : '\u2014' },
]

const taskColumns: WebhookColumn[] = [
  { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
  { header: 'Contact', render: (_, p) => nestedStr(p, 'contact', 'contactName') },
  { header: 'Task Title', render: (_, p) => (p.title ?? (p.task as Record<string, unknown>)?.title ?? '\u2014') as string },
  { header: 'Assigned To', render: (_, p) => (p.assignedTo ?? p.userId ?? '\u2014') as string },
  { header: 'Due Date', render: (_, p) => { const d = p.dueDate as string | undefined; if (!d) return '\u2014'; try { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) } catch { return '\u2014' } } },
  { header: 'Category', render: (_, p) => (p.taskType ?? p.category ?? '\u2014') as string },
  { header: 'Status', render: (r, p) => { const et = r.eventType as string; if (et?.includes('Completed') || et?.includes('completed')) return 'Completed \u2705'; return (p.status ?? '\u2014') as string } },
]

const stageColumns: WebhookColumn[] = [
  { header: 'Time', render: (r) => formatTime((r.receivedAt ?? r.createdAt) as string) },
  { header: 'Contact', render: (_, p) => nestedStr(p, 'contact', 'contactName') },
  { header: 'Address', render: (_, p) => (p.address ?? (p.opportunity as Record<string, unknown>)?.address ?? '\u2014') as string },
  { header: 'GHL: From', render: (_, p) => (p.oldPipelineStageId ?? p.previousStage ?? '\u2014') as string },
  { header: 'GHL: To', render: (_, p) => (p.pipelineStageId ?? p.stage ?? p.stageId ?? '\u2014') as string },
  { header: 'Gunner Stage', render: (_, p) => ((p.opportunity as Record<string, unknown>)?.status ?? '\u2014') as string },
]

function WebhookTable({ rows, columns }: { rows: Record<string, unknown>[]; columns: WebhookColumn[] }) {
  return (
    <TableShell headers={columns.map(c => c.header)}>
      {rows.map(r => {
        const p = payload(r)
        const isFailed = (r.status as string) === 'failed'
        return (
          <tr
            key={r.id as string}
            className={isFailed ? failedTrClass : trClass}
            style={{ borderColor: 'var(--border-light)' }}
            title={isFailed ? (r.errorReason as string) ?? 'Processing failed' : undefined}
          >
            {columns.map(col => (
              <td key={col.header} className={tdClass}>{col.render(r, p)}</td>
            ))}
          </tr>
        )
      })}
    </TableShell>
  )
}
