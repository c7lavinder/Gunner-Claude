'use client'
// components/calls/calls-client.tsx
// Call list page — Design system: docs/DESIGN.md
// Layout: [Tabs] [Filters] [Call list (flex:1) | AI Coach (320px sticky)]

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Phone, RotateCcw, Loader2, SkipForward, AlertCircle, Info } from 'lucide-react'
import { format, subDays, subMonths } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { CALL_TYPES, RESULT_NAMES } from '@/lib/call-types'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Call {
  id: string; score: number | null; gradingStatus: string
  callType: string | null; callOutcome: string | null; callResult: string | null
  direction: string; durationSeconds: number | null; calledAt: string
  recordingUrl: string | null; aiSummary: string | null; aiFeedback: string | null
  contactName: string | null
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string } | null
}

type Tab = 'all' | 'review' | 'short'

// ─── Helpers ──────────────────────────────────────────────────────────────

const CALL_TYPE_NAMES: Record<string, string> = Object.fromEntries(
  CALL_TYPES.map(ct => [ct.id, ct.name])
)

function scoreColor(score: number | null): string {
  if (score === null) return 'bg-surface-tertiary text-txt-muted'
  if (score >= 90) return 'bg-semantic-green text-white'
  if (score >= 80) return 'bg-semantic-amber text-white'
  if (score >= 70) return 'bg-semantic-blue text-white'
  return 'bg-semantic-red text-white'
}

function badgeStyle(type: 'green' | 'purple' | 'amber' | 'red' | 'blue' | 'muted'): string {
  const map = {
    green: 'bg-semantic-green-bg text-semantic-green',
    purple: 'bg-semantic-purple-bg text-semantic-purple',
    amber: 'bg-semantic-amber-bg text-semantic-amber',
    red: 'bg-semantic-red-bg text-semantic-red',
    blue: 'bg-semantic-blue-bg text-semantic-blue',
    muted: 'bg-surface-tertiary text-txt-secondary',
  }
  return map[type]
}

function callTypeBadgeColor(type: string): string {
  const map: Record<string, string> = {
    cold_call: 'purple',
    qualification_call: 'blue',
    admin_call: 'muted',
    follow_up_call: 'amber',
    offer_call: 'red',
    purchase_agreement_call: 'green',
    dispo_call: 'green',
  }
  return badgeStyle((map[type] ?? 'muted') as 'green')
}

function outcomeBadgeColor(outcome: string): string {
  const positive = ['interested', 'appointment_set', 'accepted', 'signed', 'solved', 'showing_scheduled', 'offer_collected']
  const negative = ['not_interested', 'rejected']
  const neutral = ['follow_up_scheduled', 'not_qualified', 'not_solved', 'not_signed']
  if (positive.includes(outcome)) return badgeStyle('green')
  if (negative.includes(outcome)) return badgeStyle('red')
  if (neutral.includes(outcome)) return badgeStyle('amber')
  return badgeStyle('muted')
}

function formatDuration(s: number | null): string {
  if (!s) return '--'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const SCORE_RANGES = [
  { label: 'A (90-100)', min: 90, max: 100 },
  { label: 'B (80-89)', min: 80, max: 89 },
  { label: 'C (70-79)', min: 70, max: 79 },
  { label: 'D (60-69)', min: 60, max: 69 },
  { label: 'F (0-59)', min: 0, max: 59 },
]

// ─── Main component ────────────────────────────────────────────────────────

export function CallsClient({ calls, tenantSlug, canViewAll, teamMembers }: {
  calls: Call[]
  tenantSlug: string
  canViewAll: boolean
  teamMembers: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [teamFilter, setTeamFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [scoreFilter, setScoreFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Tab filtering
  const allCalls = calls.filter(c => c.gradingStatus === 'COMPLETED')
  const reviewCalls = calls.filter(c =>
    ['PENDING', 'PROCESSING'].includes(c.gradingStatus) ||
    (c.gradingStatus === 'FAILED' && c.callResult !== 'no_answer')
  )
  const shortCalls = calls.filter(c =>
    (c.durationSeconds !== null && c.durationSeconds < 45) ||
    c.callResult === 'no_answer' ||
    (c.gradingStatus === 'FAILED' && c.durationSeconds === 0)
  )

  // Apply filters
  let filtered = tab === 'all' ? allCalls : tab === 'review' ? reviewCalls : shortCalls
  if (tab === 'all') {
    if (teamFilter) filtered = filtered.filter(c => c.assignedTo?.id === teamFilter)
    if (typeFilter) filtered = filtered.filter(c => c.callType === typeFilter)
    if (outcomeFilter) filtered = filtered.filter(c => c.callOutcome === outcomeFilter)
    if (scoreFilter) {
      const range = SCORE_RANGES.find(r => r.label === scoreFilter)
      if (range) filtered = filtered.filter(c => c.score !== null && c.score >= range.min && c.score <= range.max)
    }
    if (dateFilter) {
      const now = new Date()
      const cutoff = dateFilter === 'yesterday' ? subDays(now, 1)
        : dateFilter === '7d' ? subDays(now, 7)
        : dateFilter === '30d' ? subDays(now, 30)
        : dateFilter === '90d' ? subMonths(now, 3) : null
      if (cutoff) filtered = filtered.filter(c => new Date(c.calledAt) >= cutoff)
    }
  }

  // Stats
  const gradedCalls = calls.filter(c => c.gradingStatus === 'COMPLETED' && c.score !== null)
  const avgScore = gradedCalls.length > 0
    ? Math.round(gradedCalls.reduce((s, c) => s + (c.score ?? 0), 0) / gradedCalls.length) : 0

  const uniqueTypes = [...new Set(calls.map(c => c.callType).filter(Boolean))] as string[]
  const uniqueOutcomes = [...new Set(calls.map(c => c.callOutcome).filter(Boolean))] as string[]

  async function callAction(callId: string, action: 'reprocess' | 'skip' | 'refetch-recording') {
    setActionLoading(`${callId}-${action}`)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${callId}/${action}`, { method: 'POST' })
      if (res.ok) {
        toast(action === 'reprocess' ? 'Call queued for re-grading' : action === 'skip' ? 'Call skipped' : 'Re-fetching recording', 'success')
        startTransition(() => router.refresh())
      } else {
        toast('Action failed', 'error')
      }
    } catch { toast('Action failed', 'error') }
    setActionLoading(null)
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: 'All Calls', count: allCalls.length },
    { id: 'review', label: 'Needs Review', count: reviewCalls.length },
    { id: 'short', label: 'Skipped', count: shortCalls.length },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-ds-page font-semibold text-txt-primary">Call History</h1>
        <p className="text-ds-body text-txt-secondary mt-1">
          {gradedCalls.length} graded calls · Average score {avgScore}%
        </p>
      </div>

      {/* Tabs — bg-tertiary container, white active */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 bg-surface-tertiary p-1 rounded-[14px]">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-[10px] text-ds-body font-medium transition-all ${
                tab === t.id
                  ? 'bg-surface-primary text-txt-primary shadow-ds-float'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 text-ds-fine ${tab === t.id ? 'text-txt-muted' : 'text-txt-muted'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={() => startTransition(() => router.refresh())}
          className="ml-auto px-3 py-2 rounded-[10px] text-ds-body font-medium text-txt-secondary hover:text-txt-primary bg-surface-secondary hover:bg-surface-tertiary transition-colors"
          style={{ border: '0.5px solid var(--border-medium)' }}
        >
          Refresh
        </button>
      </div>

      {/* Filters (All tab) */}
      {tab === 'all' && (
        <>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-ds-body text-txt-secondary hover:text-txt-primary transition-colors"
          >
            Filters {showFilters ? '−' : '+'}
          </button>
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {canViewAll && teamMembers.length > 0 && (
                <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                  className="bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none focus:ring-1 focus:ring-gunner-red" style={{ borderColor: 'var(--border-medium)' }}>
                  <option value="">All team</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              {uniqueTypes.length > 0 && (
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none" style={{ borderColor: 'var(--border-medium)' }}>
                  <option value="">All types</option>
                  {uniqueTypes.map(t => <option key={t} value={t}>{CALL_TYPE_NAMES[t] ?? t}</option>)}
                </select>
              )}
              {uniqueOutcomes.length > 0 && (
                <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
                  className="bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none" style={{ borderColor: 'var(--border-medium)' }}>
                  <option value="">All outcomes</option>
                  {uniqueOutcomes.map(o => <option key={o} value={o}>{RESULT_NAMES[o] ?? o}</option>)}
                </select>
              )}
              <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)}
                className="bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none" style={{ borderColor: 'var(--border-medium)' }}>
                <option value="">All scores</option>
                {SCORE_RANGES.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
              </select>
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                className="bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary focus:outline-none" style={{ borderColor: 'var(--border-medium)' }}>
                <option value="">All time</option>
                <option value="yesterday">Yesterday</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              {(teamFilter || typeFilter || outcomeFilter || scoreFilter || dateFilter) && (
                <button onClick={() => { setTeamFilter(''); setTypeFilter(''); setOutcomeFilter(''); setScoreFilter(''); setDateFilter('') }}
                  className="text-ds-body text-gunner-red hover:text-gunner-red-dark px-2 font-medium">Clear</button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── All Calls tab ──────────────────────────────────────────── */}
      {tab === 'all' && (
        <div className="bg-surface-primary border rounded-[14px]" style={{ borderColor: 'var(--border-light)' }}>
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-ds-body text-txt-muted">No calls match this filter</div>
          ) : (
            filtered.map((call, i) => (
              <CallRow key={call.id} call={call} tenantSlug={tenantSlug} isLast={i === filtered.length - 1} />
            ))
          )}
        </div>
      )}

      {/* ── Review tab ─────────────────────────────────────────────── */}
      {tab === 'review' && (
        <div className="space-y-4">
          {reviewCalls.length === 0 ? (
            <div className="bg-surface-primary border rounded-[14px] py-16 text-center text-ds-body text-txt-muted" style={{ borderColor: 'var(--border-light)' }}>
              No calls in review
            </div>
          ) : (
            <div className="bg-surface-primary border rounded-[14px]" style={{ borderColor: 'var(--border-light)' }}>
              {reviewCalls.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-4 border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
                  {c.gradingStatus === 'FAILED' ? (
                    <AlertCircle size={16} className="text-semantic-red shrink-0" />
                  ) : (
                    <Loader2 size={16} className="text-semantic-blue animate-spin shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-body font-medium text-txt-primary truncate">{c.contactName ?? c.property?.address ?? 'Call'}</p>
                    <p className="text-ds-fine text-txt-muted">{c.gradingStatus.toLowerCase()} · {format(new Date(c.calledAt), 'MMM d, h:mm a')}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => callAction(c.id, 'reprocess')} disabled={actionLoading === `${c.id}-reprocess`}
                      className="text-ds-fine font-medium bg-gunner-red-light text-gunner-red hover:bg-gunner-red hover:text-white px-2.5 py-1.5 rounded-[6px] transition-colors">
                      {actionLoading === `${c.id}-reprocess` ? <Loader2 size={10} className="animate-spin" /> : 'Retry'}
                    </button>
                    <button onClick={() => callAction(c.id, 'skip')} disabled={actionLoading === `${c.id}-skip`}
                      className="text-ds-fine font-medium bg-surface-secondary text-txt-secondary hover:text-txt-primary px-2.5 py-1.5 rounded-[6px] transition-colors">
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Skipped tab ────────────────────────────────────────────── */}
      {tab === 'short' && (
        <div className="space-y-4">
          <div className="bg-semantic-blue-bg border rounded-[14px] px-4 py-3 flex items-start gap-2" style={{ borderColor: 'rgba(24,95,165,0.15)' }}>
            <Info size={14} className="text-semantic-blue shrink-0 mt-0.5" />
            <p className="text-ds-body text-semantic-blue">Under 45 seconds or no answer — not graded.</p>
          </div>
          <div className="bg-surface-primary border rounded-[14px]" style={{ borderColor: 'var(--border-light)' }}>
            {shortCalls.length === 0 ? (
              <div className="py-16 text-center text-ds-body text-txt-muted">No skipped calls</div>
            ) : (
              shortCalls.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-4 border-b last:border-b-0" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="w-10 h-10 rounded-[10px] bg-surface-tertiary flex items-center justify-center shrink-0">
                    <Phone size={14} className="text-txt-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-body font-medium text-txt-primary truncate">{c.contactName ?? c.property?.address ?? 'Call'}</p>
                    <p className="text-ds-fine text-txt-muted">{formatDuration(c.durationSeconds)} · {format(new Date(c.calledAt), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Call Row ──────────────────────────────────────────────────────────────
// Design: [dot] [Name] [badges] ——— [Score circle]
//         [Rep] [duration] [time]
//         [address]
//         [summary — 2 lines max]

function CallRow({ call, tenantSlug, isLast }: { call: Call; tenantSlug: string; isLast: boolean }) {
  const hasBeenReviewed = call.gradingStatus === 'COMPLETED'

  return (
    <Link
      href={`/${tenantSlug}/calls/${call.id}`}
      className={`flex items-start gap-4 px-5 py-4 hover:bg-surface-secondary transition-all ${!isLast ? 'border-b' : ''}`}
      style={{ borderColor: 'var(--border-light)' }}
    >
      {/* Review dot */}
      <div className="mt-1.5 shrink-0">
        <span className={`block w-2 h-2 rounded-full ${hasBeenReviewed ? 'bg-semantic-green' : 'bg-semantic-blue'}`} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-ds-label font-medium text-txt-primary truncate">
            {call.contactName ?? call.property?.address ?? 'Unknown contact'}
          </span>
          {call.callType && (
            <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full ${callTypeBadgeColor(call.callType)}`}>
              {CALL_TYPE_NAMES[call.callType] ?? call.callType}
            </span>
          )}
          {call.callOutcome && (
            <span className={`text-ds-fine font-medium px-2 py-0.5 rounded-full ${outcomeBadgeColor(call.callOutcome)}`}>
              {RESULT_NAMES[call.callOutcome] ?? call.callOutcome}
            </span>
          )}
        </div>

        {/* Row 2: Rep, duration, time */}
        <div className="flex items-center gap-2 mt-1 text-ds-fine text-txt-muted">
          {call.assignedTo && <span>{call.assignedTo.name}</span>}
          {call.assignedTo && <span>·</span>}
          <span>{formatDuration(call.durationSeconds)}</span>
          <span>·</span>
          <span>{format(new Date(call.calledAt), 'MMM d, h:mm a')}</span>
        </div>

        {/* Row 3: Property address */}
        {call.property && (
          <p className="text-ds-fine text-txt-muted mt-0.5">{call.property.address}</p>
        )}

        {/* Row 4: Summary — 2 lines max */}
        {call.aiSummary && (
          <p className="text-ds-body text-txt-secondary mt-1 line-clamp-2">{call.aiSummary}</p>
        )}
      </div>

      {/* Score circle */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-ds-body font-semibold ${scoreColor(call.score)}`}>
        {call.score !== null ? Math.round(call.score) : '--'}
      </div>
    </Link>
  )
}
