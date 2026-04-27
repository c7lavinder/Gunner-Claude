'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bug, Loader2, ChevronDown, ChevronRight, Copy, Check, Trash2, Image as ImageIcon, X } from 'lucide-react'

interface BugRow {
  id: string
  createdAt: string
  updatedAt: string
  reporterId: string | null
  reporterName: string | null
  description: string
  severity: string
  pageUrl: string | null
  userAgent: string | null
  status: string
  adminNotes: string | null
  resolvedAt: string | null
  resolvedById: string | null
  hasScreenshot: boolean
}

type StatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'wont_fix'
type SeverityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical'

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: 'Needs Review', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'Working On It', color: 'bg-amber-100 text-amber-700' },
  resolved: { label: 'Fixed', color: 'bg-green-100 text-green-700' },
  wont_fix: { label: 'Skipped', color: 'bg-gray-100 text-gray-700' },
}

const SEVERITY_META: Record<string, { label: string; color: string }> = {
  low: { label: 'Small', color: 'bg-gray-100 text-gray-700' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  high: { label: 'Big', color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Emergency', color: 'bg-red-100 text-red-700' },
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Needs Review' },
  { id: 'in_progress', label: 'Working On It' },
  { id: 'resolved', label: 'Fixed' },
  { id: 'wont_fix', label: 'Skipped' },
  { id: 'all', label: 'All' },
]

const CT = 'America/Chicago'

function prettyPage(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.pathname
  } catch {
    return url
  }
}

export function BugsClient() {
  const [bugs, setBugs] = useState<BugRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  // Screenshots are not part of the list response — fetched on-demand the
  // first time a row with hasScreenshot=true is expanded. 'loading' is the
  // sentinel while the fetch is in flight; null = errored or no screenshot.
  const [screenshots, setScreenshots] = useState<Record<string, string | 'loading' | null>>({})
  const [lightbox, setLightbox] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (severityFilter !== 'all') params.set('severity', severityFilter)

    try {
      const res = await fetch(`/api/bugs?${params}`)
      const data = await res.json()
      setBugs(data.bugs ?? [])
      setCounts(data.statusCounts ?? {})
    } catch {
      setBugs([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, severityFilter])

  useEffect(() => { load() }, [load])

  async function fetchScreenshot(bugId: string) {
    if (screenshots[bugId] !== undefined) return
    setScreenshots(s => ({ ...s, [bugId]: 'loading' }))
    try {
      const res = await fetch(`/api/bugs/${bugId}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setScreenshots(s => ({ ...s, [bugId]: data.bug?.screenshot ?? null }))
    } catch {
      setScreenshots(s => ({ ...s, [bugId]: null }))
    }
  }

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  async function updateBug(id: string, patch: Record<string, unknown>) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/bugs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const data = await res.json()
        setBugs(prev => prev.map(b => b.id === id ? { ...b, ...data.bug } : b))
        // Refresh counts silently
        load()
      }
    } finally {
      setSavingId(null)
    }
  }

  async function deleteBug(id: string) {
    if (!confirm('Delete this bug report? This cannot be undone.')) return
    setSavingId(id)
    try {
      const res = await fetch(`/api/bugs/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setBugs(prev => prev.filter(b => b.id !== id))
        load()
      }
    } finally {
      setSavingId(null)
    }
  }

  async function copyBug(bug: BugRow) {
    const lines = [
      `Bug Report ${bug.id}`,
      `When: ${new Date(bug.createdAt).toLocaleString('en-US', { timeZone: CT })}`,
      `From: ${bug.reporterName ?? 'Unknown'}`,
      `Severity: ${SEVERITY_META[bug.severity]?.label ?? bug.severity}`,
      `Status: ${STATUS_META[bug.status]?.label ?? bug.status}`,
      `Page: ${bug.pageUrl ?? 'n/a'}`,
      `Browser: ${bug.userAgent ?? 'n/a'}`,
      '',
      '--- Description ---',
      bug.description,
      '',
      bug.adminNotes ? `--- Admin Notes ---\n${bug.adminNotes}` : '',
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      setCopiedId(bug.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  const totals = {
    open: counts.open ?? 0,
    in_progress: counts.in_progress ?? 0,
    resolved: counts.resolved ?? 0,
    wont_fix: counts.wont_fix ?? 0,
  }
  const totalAll = totals.open + totals.in_progress + totals.resolved + totals.wont_fix

  return (
    <div className="max-w-[1000px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-txt-primary flex items-center gap-2">
          <Bug size={18} className="text-semantic-red" /> Bug Reports
        </h1>
        <p className="text-[12px] text-txt-muted">What your team has flagged. Click one to work it.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Needs Review" value={totals.open} color="text-semantic-blue" />
        <StatCard label="Working On It" value={totals.in_progress} color="text-amber-600" />
        <StatCard label="Fixed" value={totals.resolved} color="text-semantic-green" />
        <StatCard label="Total Reports" value={totalAll} color="text-txt-primary" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface-secondary rounded-[12px] p-1 w-fit flex-wrap">
        {STATUS_TABS.map(t => {
          const active = statusFilter === t.id
          const count = t.id === 'all' ? totalAll : (totals as Record<string, number>)[t.id] ?? 0
          return (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-colors ${active ? 'bg-white text-txt-primary shadow-ds-float' : 'text-txt-muted hover:text-txt-secondary'}`}
            >
              <span>{t.label}</span>
              {count > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-blue-100 text-blue-700' : 'bg-surface-tertiary text-txt-muted'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Severity filter */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-txt-muted">How bad:</span>
        {(['all', 'critical', 'high', 'medium', 'low'] as SeverityFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${severityFilter === s ? 'bg-txt-primary text-white' : 'bg-surface-secondary text-txt-muted hover:bg-surface-tertiary'}`}
          >
            {s === 'all' ? 'Any' : SEVERITY_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-txt-muted" />
        </div>
      ) : bugs.length === 0 ? (
        <div className="bg-white border-[0.5px] rounded-[14px] py-16 text-center" style={{ borderColor: 'var(--border-light)' }}>
          <Bug size={28} className="text-txt-muted mx-auto mb-2" />
          <p className="text-[13px] text-txt-muted">
            {statusFilter === 'open' ? 'No bugs to review. Clean slate.' : 'No reports here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bugs.map(bug => {
            const sev = SEVERITY_META[bug.severity] ?? { label: bug.severity, color: 'bg-gray-100 text-gray-600' }
            const st = STATUS_META[bug.status] ?? { label: bug.status, color: 'bg-gray-100 text-gray-600' }
            const isExpanded = expandedId === bug.id
            const saving = savingId === bug.id
            const pageShort = prettyPage(bug.pageUrl)

            return (
              <div
                key={bug.id}
                className={`bg-white border-[0.5px] rounded-[14px] overflow-hidden transition-shadow ${isExpanded ? 'shadow-ds-float' : ''}`}
                style={{ borderColor: 'var(--border-light)' }}
              >
                <button
                  onClick={() => {
                    const willExpand = !isExpanded
                    setExpandedId(willExpand ? bug.id : null)
                    if (willExpand) {
                      setNotesDraft(d => ({ ...d, [bug.id]: bug.adminNotes ?? '' }))
                      if (bug.hasScreenshot) void fetchScreenshot(bug.id)
                    }
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-surface-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <Bug size={14} className="text-semantic-red" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[12px] font-semibold text-txt-primary">{bug.reporterName ?? 'Unknown'}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sev.color}`}>{sev.label}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        {bug.hasScreenshot && (
                          <span title="Includes screenshot" className="text-txt-muted">
                            <ImageIcon size={10} />
                          </span>
                        )}
                        {pageShort && <span className="text-[9px] text-txt-muted">on {pageShort}</span>}
                      </div>
                      <p className="text-[12px] text-txt-primary leading-relaxed line-clamp-2">{bug.description}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-txt-muted">
                        {new Date(bug.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: CT })}
                      </p>
                      <p className="text-[9px] text-txt-muted">
                        {new Date(bug.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CT })}
                      </p>
                      {isExpanded ? <ChevronDown size={10} className="text-txt-muted ml-auto mt-1" /> : <ChevronRight size={10} className="text-txt-muted ml-auto mt-1" />}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 space-y-3" style={{ borderColor: 'var(--border-light)' }}>
                    {/* Full description */}
                    <div>
                      <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">What they said</p>
                      <div className="bg-surface-secondary rounded-[10px] px-3 py-2">
                        <p className="text-[12px] text-txt-primary leading-relaxed whitespace-pre-wrap">{bug.description}</p>
                      </div>
                    </div>

                    {/* Screenshot — lazy-loaded so the list payload stays small */}
                    {bug.hasScreenshot && (
                      <div>
                        <p className="text-[9px] font-semibold text-txt-muted uppercase mb-1">Screenshot</p>
                        {screenshots[bug.id] === 'loading' || screenshots[bug.id] === undefined ? (
                          <div className="flex items-center gap-2 bg-surface-secondary rounded-[10px] px-3 py-3">
                            <Loader2 size={12} className="animate-spin text-txt-muted" />
                            <p className="text-[11px] text-txt-muted">Loading screenshot…</p>
                          </div>
                        ) : screenshots[bug.id] ? (
                          <button
                            type="button"
                            onClick={() => setLightbox(screenshots[bug.id] as string)}
                            className="block w-full bg-surface-secondary rounded-[10px] overflow-hidden border-[0.5px] hover:opacity-90 transition-opacity"
                            style={{ borderColor: 'var(--border-light)' }}
                            title="Click to enlarge"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={screenshots[bug.id] as string}
                              alt="Bug screenshot"
                              className="w-full max-h-[320px] object-contain mx-auto"
                            />
                          </button>
                        ) : (
                          <p className="text-[11px] text-txt-muted">Could not load screenshot.</p>
                        )}
                      </div>
                    )}

                    {/* Admin controls: status + severity */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-semibold text-txt-muted uppercase block mb-1">Status</label>
                        <select
                          value={bug.status}
                          onChange={e => updateBug(bug.id, { status: e.target.value })}
                          disabled={saving}
                          className="w-full text-[12px] text-txt-primary bg-white border-[0.5px] rounded-[10px] px-3 py-2 disabled:opacity-40"
                          style={{ borderColor: 'var(--border-medium)' }}
                        >
                          <option value="open">Needs Review</option>
                          <option value="in_progress">Working On It</option>
                          <option value="resolved">Fixed</option>
                          <option value="wont_fix">Skipped (won&apos;t fix)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-semibold text-txt-muted uppercase block mb-1">How bad</label>
                        <select
                          value={bug.severity}
                          onChange={e => updateBug(bug.id, { severity: e.target.value })}
                          disabled={saving}
                          className="w-full text-[12px] text-txt-primary bg-white border-[0.5px] rounded-[10px] px-3 py-2 disabled:opacity-40"
                          style={{ borderColor: 'var(--border-medium)' }}
                        >
                          <option value="low">Small — annoying</option>
                          <option value="medium">Medium — something is wrong</option>
                          <option value="high">Big — blocks the job</option>
                          <option value="critical">Emergency — app is broken</option>
                        </select>
                      </div>
                    </div>

                    {/* Admin notes */}
                    <div>
                      <label className="text-[9px] font-semibold text-txt-muted uppercase block mb-1">Your notes (private)</label>
                      <textarea
                        value={notesDraft[bug.id] ?? ''}
                        onChange={e => setNotesDraft(d => ({ ...d, [bug.id]: e.target.value }))}
                        placeholder="What you found, what you fixed, or a link to a commit…"
                        rows={3}
                        className="w-full text-[12px] text-txt-primary bg-white border-[0.5px] rounded-[10px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-semantic-blue/30 resize-none"
                        style={{ borderColor: 'var(--border-medium)' }}
                      />
                      <div className="flex items-center justify-end gap-2 mt-1">
                        <button
                          onClick={() => updateBug(bug.id, { adminNotes: notesDraft[bug.id] ?? '' })}
                          disabled={saving || (notesDraft[bug.id] ?? '') === (bug.adminNotes ?? '')}
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-[8px] bg-txt-primary text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          {saving ? 'Saving…' : 'Save notes'}
                        </button>
                      </div>
                    </div>

                    {/* Tech details */}
                    <div className="bg-surface-secondary rounded-[10px] p-3 space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[9px] font-semibold text-txt-muted uppercase">Tech details</p>
                        <button
                          onClick={() => copyBug(bug)}
                          className="text-[9px] font-medium px-2 py-0.5 rounded-[6px] bg-white text-txt-secondary hover:text-txt-primary flex items-center gap-1 transition-colors"
                        >
                          {copiedId === bug.id ? <><Check size={9} /> Copied</> : <><Copy size={9} /> Copy all</>}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                        <DiagRow label="Report ID" value={bug.id} mono />
                        <DiagRow label="Sent" value={new Date(bug.createdAt).toLocaleString('en-US', { timeZone: CT })} />
                        <DiagRow label="Page" value={bug.pageUrl ?? '—'} mono />
                        <DiagRow label="Last updated" value={new Date(bug.updatedAt).toLocaleString('en-US', { timeZone: CT })} />
                        <DiagRow label="Resolved on" value={bug.resolvedAt ? new Date(bug.resolvedAt).toLocaleString('en-US', { timeZone: CT }) : '—'} />
                        <DiagRow label="Browser" value={bug.userAgent ?? '—'} mono truncate />
                      </div>
                    </div>

                    {/* Delete */}
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => deleteBug(bug.id)}
                        disabled={saving}
                        className="text-[10px] font-medium px-2.5 py-1 rounded-[8px] text-txt-muted hover:text-semantic-red hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center gap-1"
                      >
                        <Trash2 size={10} /> Delete report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Screenshot lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/95 flex items-center justify-center text-txt-primary hover:bg-white transition-colors"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Screenshot"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-[12px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border-[0.5px] rounded-[12px] p-4" style={{ borderColor: 'var(--border-light)' }}>
      <p className="text-[10px] font-semibold text-txt-muted uppercase mb-1">{label}</p>
      <p className={`text-[20px] font-bold ${color}`}>{value}</p>
    </div>
  )
}

function DiagRow({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-txt-muted shrink-0">{label}</span>
      <span className={`text-txt-secondary ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`} title={value}>{value}</span>
    </div>
  )
}

