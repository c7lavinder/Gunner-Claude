'use client'
// components/calls/calls-client.tsx
// Full calls list: 4 tabs, filters, grade letters, outcome/type badges

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Phone, Clock, ArrowDownLeft, ArrowUpRight as ArrowUp, AlertCircle, RefreshCw, RotateCcw, Loader2, Info, SkipForward } from 'lucide-react'
import { formatDistanceToNow, subDays, subMonths } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { CALL_TYPES } from '@/lib/call-types'

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

// ─── Grade + color helpers ─────────────────────────────────────────────────

function gradeLetter(score: number | null): { letter: string; color: string; glow: string } {
  if (score === null) return { letter: '—', color: 'text-gray-500', glow: '' }
  if (score >= 90) return { letter: 'A', color: 'text-green-400', glow: 'shadow-green-500/20 shadow-lg' }
  if (score >= 80) return { letter: 'B', color: 'text-blue-400', glow: 'shadow-blue-500/20 shadow-lg' }
  if (score >= 70) return { letter: 'C', color: 'text-yellow-400', glow: 'shadow-yellow-500/20 shadow-lg' }
  if (score >= 60) return { letter: 'D', color: 'text-orange-400', glow: 'shadow-orange-500/20 shadow-lg' }
  return { letter: 'F', color: 'text-red-400', glow: 'shadow-red-500/20 shadow-lg' }
}

const CALL_TYPE_COLORS: Record<string, string> = {
  cold_call: 'bg-purple-500/10 text-purple-400',
  qualification_call: 'bg-blue-500/10 text-blue-400',
  admin_call: 'bg-gray-500/10 text-gray-400',
  follow_up_call: 'bg-yellow-500/10 text-yellow-400',
  offer_call: 'bg-orange-500/10 text-orange-400',
  purchase_agreement_call: 'bg-teal-500/10 text-teal-400',
  dispo_call: 'bg-green-500/10 text-green-400',
}

// Map call type IDs to display names
const CALL_TYPE_NAMES: Record<string, string> = Object.fromEntries(
  CALL_TYPES.map(ct => [ct.id, ct.name])
)

const OUTCOME_COLORS: Record<string, string> = {
  appointment_set: 'bg-green-500/10 text-green-400',
  offer_made: 'bg-orange-500/10 text-orange-400',
  offer_rejected: 'bg-red-500/10 text-red-400',
  interested: 'bg-teal-500/10 text-teal-400',
  not_interested: 'bg-red-500/5 text-red-400/70',
  callback_scheduled: 'bg-yellow-500/10 text-yellow-400',
  left_vm: 'bg-gray-500/10 text-gray-400',
  no_answer: 'bg-gray-500/10 text-gray-400',
  dead: 'bg-red-500/15 text-red-500',
  follow_up: 'bg-yellow-500/10 text-yellow-400',
  contract: 'bg-green-500/15 text-green-400',
}

const SCORE_RANGES = [
  { label: 'A (90-100)', min: 90, max: 100 },
  { label: 'B (80-89)', min: 80, max: 89 },
  { label: 'C (70-79)', min: 70, max: 79 },
  { label: 'D (60-69)', min: 60, max: 69 },
  { label: 'F (0-59)', min: 0, max: 59 },
]

function formatDuration(s: number | null): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

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
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [outcomeFilter, setOutcomeFilter] = useState<string>('')
  const [scoreFilter, setScoreFilter] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Tab filtering
  const allCalls = calls.filter(c => c.gradingStatus === 'COMPLETED')
  const reviewCalls = calls.filter(c =>
    ['PENDING', 'PROCESSING'].includes(c.gradingStatus) ||
    (c.gradingStatus === 'FAILED' && c.callResult !== 'no_answer')
  )
  const processingCalls = reviewCalls.filter(c => ['PENDING', 'PROCESSING'].includes(c.gradingStatus))
  const failedCalls = reviewCalls.filter(c => c.gradingStatus === 'FAILED')
  const shortCalls = calls.filter(c =>
    (c.durationSeconds !== null && c.durationSeconds < 45) ||
    c.callResult === 'no_answer' ||
    (c.gradingStatus === 'FAILED' && c.durationSeconds === 0)
  )

  // Apply filters on All tab
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

  // Unique call types/outcomes for filter dropdowns
  const uniqueTypes = [...new Set(calls.map(c => c.callType).filter(Boolean))] as string[]
  const uniqueOutcomes = [...new Set(calls.map(c => c.callOutcome).filter(Boolean))] as string[]

  const ACTION_MESSAGES: Record<string, { success: string; error: string }> = {
    reprocess: { success: 'Call queued for re-grading', error: 'Failed to reprocess — please try again' },
    skip: { success: 'Call marked as skipped', error: 'Failed to skip call' },
    'refetch-recording': { success: 'Recording re-fetch started', error: 'Failed to re-fetch recording' },
  }

  async function callAction(callId: string, action: 'reprocess' | 'skip' | 'refetch-recording') {
    setActionLoading(`${callId}-${action}`)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${callId}/${action}`, { method: 'POST' })
      if (res.ok) {
        toast(ACTION_MESSAGES[action].success, 'success')
        startTransition(() => router.refresh())
      } else {
        toast(ACTION_MESSAGES[action].error, 'error')
      }
    } catch {
      toast(ACTION_MESSAGES[action].error, 'error')
    }
    setActionLoading(null)
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: 'All graded', count: allCalls.length },
    { id: 'review', label: 'Needs review', count: reviewCalls.length },
    { id: 'short', label: 'No answer', count: shortCalls.length },
  ]

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Call Grading</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {gradedCalls.length} graded · Avg {avgScore}%
          </p>
        </div>
        <button
          onClick={() => startTransition(() => router.refresh())}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm transition-colors ${
              tab === t.id ? 'bg-[#1a1d27] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-xs text-gray-600">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Filters (All tab only) */}
      {tab === 'all' && (
        <>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            Filters {showFilters ? '▲' : '▼'}
          </button>
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {canViewAll && teamMembers.length > 0 && (
                <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                  className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none">
                  <option value="">All team</option>
                  {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              {uniqueTypes.length > 0 && (
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none">
                  <option value="">All types</option>
                  {uniqueTypes.map(t => <option key={t} value={t}>{CALL_TYPE_NAMES[t] ?? t.replace(/_/g, ' ')}</option>)}
                </select>
              )}
              {uniqueOutcomes.length > 0 && (
                <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
                  className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none">
                  <option value="">All outcomes</option>
                  {uniqueOutcomes.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              )}
              <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)}
                className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none">
                <option value="">All scores</option>
                {SCORE_RANGES.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
              </select>
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none">
                <option value="">All time</option>
                <option value="yesterday">Yesterday</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              {(teamFilter || typeFilter || outcomeFilter || scoreFilter || dateFilter) && (
                <button onClick={() => { setTeamFilter(''); setTypeFilter(''); setOutcomeFilter(''); setScoreFilter(''); setDateFilter('') }}
                  className="text-xs text-orange-400 hover:text-orange-300 px-2">Clear</button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── All tab ───────────────────────────────────────────────────── */}
      {tab === 'all' && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">No calls match this filter</div>
          ) : (
            filtered.map(call => (
              <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
            ))
          )}
        </div>
      )}

      {/* ── Review tab ────────────────────────────────────────────────── */}
      {tab === 'review' && (
        <div className="space-y-4">
          {processingCalls.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Processing ({processingCalls.length})</p>
              <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
                {processingCalls.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-4">
                    <Loader2 size={16} className="text-blue-400 animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.contactName ?? c.property?.address ?? 'Call'}</p>
                      <p className="text-xs text-gray-500">{c.gradingStatus.toLowerCase()} · {formatDistanceToNow(new Date(c.calledAt), { addSuffix: true })}</p>
                    </div>
                    <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">{c.gradingStatus.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {failedCalls.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">Failed ({failedCalls.length})</p>
              <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
                {failedCalls.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-4">
                    <AlertCircle size={16} className="text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.contactName ?? c.property?.address ?? 'Call'}</p>
                      <p className="text-xs text-red-400/70 truncate">{c.aiFeedback ?? 'Grading failed'}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => callAction(c.id, 'reprocess')} disabled={actionLoading === `${c.id}-reprocess`}
                        className="text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        {actionLoading === `${c.id}-reprocess` ? <Loader2 size={10} className="animate-spin" /> : <><RotateCcw size={10} /> Retry</>}
                      </button>
                      <button onClick={() => callAction(c.id, 'refetch-recording')} disabled={actionLoading === `${c.id}-refetch-recording`}
                        className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        Re-fetch
                      </button>
                      <button onClick={() => callAction(c.id, 'skip')} disabled={actionLoading === `${c.id}-skip`}
                        className="text-xs bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <SkipForward size={10} /> Skip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {reviewCalls.length === 0 && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl py-12 text-center">
              <p className="text-gray-500 text-sm">No calls in review</p>
            </div>
          )}
        </div>
      )}

      {/* ── Short calls tab ─────────────────────────────────────────── */}
      {tab === 'short' && (
        <div className="space-y-4">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-blue-300">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>Under 45 seconds or no answer — not graded. These are dial attempts, voicemails, or calls that were not picked up.</p>
          </div>
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
            {shortCalls.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">No short calls</div>
            ) : (
              shortCalls.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-500/10 flex items-center justify-center shrink-0">
                    <Phone size={14} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{c.contactName ?? c.property?.address ?? 'Call'}</p>
                    <p className="text-xs text-gray-500">{formatDuration(c.durationSeconds)} · {formatDistanceToNow(new Date(c.calledAt), { addSuffix: true })}</p>
                  </div>
                  {c.recordingUrl && (
                    <button onClick={() => callAction(c.id, 'reprocess')} disabled={actionLoading === `${c.id}-reprocess`}
                      className="text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1">
                      {actionLoading === `${c.id}-reprocess` ? <Loader2 size={10} className="animate-spin" /> : <><RotateCcw size={10} /> Reprocess</>}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Call row (All tab) ────────────────────────────────────────────────────

function CallRow({ call, tenantSlug }: { call: Call; tenantSlug: string }) {
  const { letter, color, glow } = gradeLetter(call.score)
  const typeColor = CALL_TYPE_COLORS[call.callType ?? ''] ?? 'bg-gray-500/10 text-gray-400'
  const outcomeColor = OUTCOME_COLORS[call.callOutcome ?? ''] ?? 'bg-gray-500/10 text-gray-400'

  return (
    <Link
      href={`/${tenantSlug}/calls/${call.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors"
    >
      {/* Grade badge */}
      <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 bg-[#0f1117] ${glow}`}>
        <span className={`text-lg font-bold ${color}`}>{letter}</span>
        {call.score !== null && (
          <span className="text-xs text-gray-600">{Math.round(call.score)}%</span>
        )}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {call.contactName ?? call.property?.address ?? 'Unknown contact'}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Call type badge */}
          {call.callType && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor}`}>
              {CALL_TYPE_NAMES[call.callType] ?? call.callType.replace(/_/g, ' ')}
            </span>
          )}
          {/* Outcome badge */}
          {call.callOutcome && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${outcomeColor}`}>
              {call.callOutcome.replace(/_/g, ' ')}
            </span>
          )}
          {call.assignedTo && (
            <span className="text-xs text-gray-500">{call.assignedTo.name}</span>
          )}
          {call.property && (
            <span className="text-xs text-gray-600 truncate max-w-32">
              {call.property.address}
            </span>
          )}
        </div>
        {call.aiSummary && (
          <p className="text-xs text-gray-600 mt-1 truncate">{call.aiSummary}</p>
        )}
      </div>

      {/* Meta column */}
      <div className="text-right shrink-0 space-y-1">
        <div className="flex items-center gap-1 justify-end text-xs text-gray-500">
          {call.direction === 'INBOUND' ? <ArrowDownLeft size={10} /> : <ArrowUp size={10} />}
          {formatDuration(call.durationSeconds)}
        </div>
        <p className="text-xs text-gray-600">
          {formatDistanceToNow(new Date(call.calledAt), { addSuffix: true })}
        </p>
      </div>
    </Link>
  )
}
