'use client'
// components/calls/calls-client.tsx
// Calls list page — matches getgunner.ai design

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Phone, RotateCcw, Loader2, AlertTriangle, Search, X, Download,
  Settings, RefreshCw, MoreVertical,
  Calendar, User, PhoneOutgoing, PhoneIncoming, MapPin, Clock,
  Archive, FileText, MessageSquare,
} from 'lucide-react'
import { format, subDays, subMonths, formatDistanceToNow } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { CALL_TYPES, RESULT_NAMES } from '@/lib/call-types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Call {
  id: string; score: number | null; gradingStatus: string
  callType: string | null; callOutcome: string | null; callResult: string | null
  direction: string; durationSeconds: number | null; calledAt: string
  recordingUrl: string | null; aiSummary: string | null; aiFeedback: string | null
  contactName: string | null; contactAddress: string | null
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string } | null
}

type Tab = 'all' | 'review' | 'skipped' | 'archived'

// ─── Helpers ────────────────────────────────────────────────────────────────

const CALL_TYPE_NAMES: Record<string, string> = Object.fromEntries(
  CALL_TYPES.map(ct => [ct.id, ct.name])
)

function gradeLetter(score: number | null): string {
  if (score === null) return '\u2014'
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function gradeColor(score: number | null): string {
  if (score === null) return 'bg-surface-tertiary text-txt-muted'
  if (score >= 90) return 'bg-semantic-green text-white'
  if (score >= 80) return 'bg-semantic-blue text-white'
  if (score >= 70) return 'bg-semantic-amber text-white'
  return 'bg-semantic-red text-white'
}

function callTypeBadge(type: string): string {
  const map: Record<string, string> = {
    cold_call: 'border-semantic-purple text-semantic-purple',
    qualification_call: 'border-semantic-purple text-semantic-purple',
    admin_call: 'border-[rgba(0,0,0,0.14)] text-txt-secondary',
    follow_up_call: 'border-semantic-blue text-semantic-blue',
    offer_call: 'border-semantic-red text-semantic-red',
    purchase_agreement_call: 'border-semantic-green text-semantic-green',
    dispo_call: 'border-semantic-green text-semantic-green',
  }
  return map[type] ?? 'border-[rgba(0,0,0,0.14)] text-txt-secondary'
}

function outcomeBadge(outcome: string): string {
  const positive = ['interested', 'appointment_set', 'accepted', 'signed', 'solved', 'showing_scheduled', 'offer_collected']
  const negative = ['not_interested', 'rejected']
  if (positive.includes(outcome)) return 'border-semantic-green text-semantic-green'
  if (negative.includes(outcome)) return 'border-semantic-red text-semantic-red'
  return 'border-semantic-amber text-semantic-amber'
}

function formatDuration(s: number | null): string {
  if (!s) return '--'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const SCORE_RANGES = [
  { label: 'A (90-100)', key: 'A', min: 90, max: 100 },
  { label: 'B (75-89)', key: 'B', min: 75, max: 89 },
  { label: 'C (60-74)', key: 'C', min: 60, max: 74 },
  { label: 'D (<60)', key: 'D', min: 0, max: 59 },
]

// ─── Main component ─────────────────────────────────────────────────────────

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
  const [teamFilter, setTeamFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [scoreFilter, setScoreFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gunner_calls_date_filter') ?? '7d'
    }
    return '7d'
  })
  function updateDateFilter(v: string) {
    setDateFilter(v)
    if (typeof window !== 'undefined') localStorage.setItem('gunner_calls_date_filter', v)
  }
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // Tab filtering
  const allCalls = calls.filter(c => c.gradingStatus === 'COMPLETED')
  const reviewCalls = calls.filter(c =>
    ['PENDING', 'PROCESSING'].includes(c.gradingStatus) ||
    (c.gradingStatus === 'FAILED' && c.callResult !== 'no_answer')
  )
  const skippedCalls = calls.filter(c =>
    (c.durationSeconds !== null && c.durationSeconds < 45) ||
    c.callResult === 'no_answer' ||
    (c.gradingStatus === 'FAILED' && c.durationSeconds === 0)
  )

  // Apply filters
  let filtered = tab === 'all' ? allCalls : tab === 'review' ? reviewCalls : tab === 'skipped' ? skippedCalls : []
  if (tab === 'all') {
    if (teamFilter) filtered = filtered.filter(c => c.assignedTo?.id === teamFilter)
    if (typeFilter) filtered = filtered.filter(c => c.callType === typeFilter)
    if (outcomeFilter) filtered = filtered.filter(c => c.callOutcome === outcomeFilter)
    if (scoreFilter) {
      const range = SCORE_RANGES.find(r => r.key === scoreFilter)
      if (range) filtered = filtered.filter(c => c.score !== null && c.score >= range.min && c.score <= range.max)
    }
    if (dateFilter) {
      const now = new Date()
      const cutoff = dateFilter === '1d' ? subDays(now, 1)
        : dateFilter === '7d' ? subDays(now, 7)
        : dateFilter === '30d' ? subDays(now, 30)
        : dateFilter === '90d' ? subMonths(now, 3) : null
      if (cutoff) filtered = filtered.filter(c => new Date(c.calledAt) >= cutoff)
    }
  }

  const uniqueTypes = [...new Set(calls.map(c => c.callType).filter(Boolean))] as string[]
  const uniqueOutcomes = [...new Set(calls.map(c => c.callOutcome).filter(Boolean))] as string[]

  async function callAction(callId: string, action: 'reprocess' | 'skip' | 'refetch-recording') {
    setActionLoading(`${callId}-${action}`)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${callId}/${action}`, { method: 'POST' })
      if (res.ok) {
        toast(action === 'reprocess' ? 'Call queued for re-grading' : action === 'skip' ? 'Call skipped' : 'Re-fetching recording', 'success')
        startTransition(() => router.refresh())
      } else { toast('Action failed', 'error') }
    } catch { toast('Action failed', 'error') }
    setActionLoading(null)
  }

  const tabs: Array<{ id: Tab; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'all', label: 'All Calls', count: allCalls.length, icon: <Phone size={13} /> },
    { id: 'review', label: 'Needs Review', count: reviewCalls.length, icon: <AlertTriangle size={13} /> },
    { id: 'skipped', label: 'Skipped', count: skippedCalls.length, icon: <X size={13} /> },
    { id: 'archived', label: 'Archived', count: 0, icon: <Archive size={13} /> },
  ]

  return (
    <div className="space-y-5">

        {/* PAGE HEADER */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[24px] font-semibold text-txt-primary">Call History</h1>
            <p className="text-[13px] text-txt-muted mt-1">Review calls, provide feedback, and get coaching advice</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/${tenantSlug}/settings`} className="p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors">
              <Settings size={16} />
            </Link>
            {syncing && (
              <span className="flex items-center gap-1.5 text-[11px] text-semantic-blue">
                <RefreshCw size={12} className="animate-spin" /> Syncing...
              </span>
            )}
            <button
              onClick={() => { setSyncing(true); startTransition(() => { router.refresh(); setTimeout(() => setSyncing(false), 2000) }) }}
              className="p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors"
            >
              <RefreshCw size={16} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 rounded-[10px] text-txt-muted hover:text-txt-primary hover:bg-surface-secondary transition-colors"
              >
                <MoreVertical size={16} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-10 w-48 bg-surface-primary border rounded-[14px] py-1 shadow-ds-float z-50" style={{ borderColor: 'var(--border-medium)' }}>
                    <a href={`/${tenantSlug}/ai-coach`} className="w-full text-left px-4 py-2.5 text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary block">AI Coach</a>
                    <a href={`/${tenantSlug}/training`} className="w-full text-left px-4 py-2.5 text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary block">Training Hub</a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* STATUS TABS */}
        <div className="grid grid-cols-4 gap-3">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[14px] text-[13px] font-medium transition-all ${
                tab === t.id
                  ? 'bg-surface-primary shadow-ds-float text-txt-primary border-[0.5px]'
                  : 'bg-surface-tertiary text-txt-secondary hover:text-txt-primary'
              }`}
              style={tab === t.id ? { borderColor: 'var(--border-light)' } : undefined}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? 'bg-gunner-red text-white' : 'bg-surface-primary text-txt-muted'
                }`}>{t.count > 99 ? '100+' : t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* FILTER BAR */}
        {tab === 'all' && (
          <div className="flex flex-wrap gap-2">
            <select value={dateFilter} onChange={e => updateDateFilter(e.target.value)}
              className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}>
              <option value="1d">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">This Month</option>
              <option value="90d">Last 90 Days</option>
              <option value="">All Time</option>
            </select>
            {canViewAll && teamMembers.length > 0 && (
              <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}>
                <option value="">Team Member</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            {uniqueTypes.length > 0 && (
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}>
                <option value="">Call Type</option>
                {uniqueTypes.map(t => <option key={t} value={t}>{CALL_TYPE_NAMES[t] ?? t}</option>)}
              </select>
            )}
            {uniqueOutcomes.length > 0 && (
              <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}
                className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
                style={{ borderColor: 'var(--border-medium)' }}>
                <option value="">Outcome</option>
                {uniqueOutcomes.map(o => <option key={o} value={o}>{RESULT_NAMES[o] ?? o}</option>)}
              </select>
            )}
            <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)}
              className="bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-secondary focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}>
              <option value="">Score</option>
              {SCORE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        )}

        {/* CALL LIST */}
        {tab === 'all' && (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-surface-primary border-[0.5px] rounded-[14px] py-16 text-center text-[13px] text-txt-muted" style={{ borderColor: 'var(--border-light)' }}>
                No calls match this filter
              </div>
            ) : (
              filtered.map(call => (
                <CallCard key={call.id} call={call} tenantSlug={tenantSlug} />
              ))
            )}
          </div>
        )}

        {/* NEEDS REVIEW */}
        {tab === 'review' && (
          <div className="space-y-3">
            {reviewCalls.length === 0 ? (
              <div className="bg-surface-primary border-[0.5px] rounded-[14px] py-16 text-center text-[13px] text-txt-muted" style={{ borderColor: 'var(--border-light)' }}>
                No calls in review
              </div>
            ) : (
              reviewCalls.map(c => (
                <div key={c.id} className="bg-surface-primary border-[0.5px] rounded-[14px] flex items-center gap-3 px-5 py-4" style={{ borderColor: 'var(--border-light)' }}>
                  {c.gradingStatus === 'FAILED' ? (
                    <AlertTriangle size={16} className="text-semantic-red shrink-0" />
                  ) : (
                    <Loader2 size={16} className="text-semantic-blue animate-spin shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-txt-primary truncate">{c.contactName ?? 'Call'}</p>
                    <p className="text-[11px] text-txt-muted">{c.gradingStatus.toLowerCase()} · {format(new Date(c.calledAt), 'MMM d, h:mm a')}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => callAction(c.id, 'reprocess')} disabled={actionLoading === `${c.id}-reprocess`}
                      className="text-[11px] font-medium bg-gunner-red-light text-gunner-red hover:bg-gunner-red hover:text-white px-2.5 py-1.5 rounded-[6px] transition-colors">
                      {actionLoading === `${c.id}-reprocess` ? <Loader2 size={10} className="animate-spin" /> : 'Retry'}
                    </button>
                    <button onClick={() => callAction(c.id, 'skip')} disabled={actionLoading === `${c.id}-skip`}
                      className="text-[11px] font-medium bg-surface-secondary text-txt-secondary hover:text-txt-primary px-2.5 py-1.5 rounded-[6px] transition-colors">
                      Skip
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SKIPPED */}
        {tab === 'skipped' && (
          <div className="space-y-3">
            {skippedCalls.length === 0 ? (
              <div className="bg-surface-primary border-[0.5px] rounded-[14px] py-16 text-center text-[13px] text-txt-muted" style={{ borderColor: 'var(--border-light)' }}>
                No skipped calls
              </div>
            ) : (
              skippedCalls.map(c => (
                <div key={c.id} className="bg-surface-primary border-[0.5px] rounded-[14px] flex items-center gap-3 px-5 py-4" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="w-10 h-10 rounded-[10px] bg-surface-tertiary flex items-center justify-center shrink-0">
                    <Phone size={14} className="text-txt-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-txt-primary truncate">{c.contactName ?? 'Call'}</p>
                    <p className="text-[11px] text-txt-muted">{formatDuration(c.durationSeconds)} · {format(new Date(c.calledAt), 'MMM d, h:mm a')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ARCHIVED */}
        {tab === 'archived' && (
          <div className="bg-surface-primary border-[0.5px] rounded-[14px] py-16 text-center text-[13px] text-txt-muted" style={{ borderColor: 'var(--border-light)' }}>
            No archived calls
          </div>
        )}
    </div>
  )
}

// ─── Call Card ───────────────────────────────────────────────────────────────

function CallCard({ call, tenantSlug }: { call: Call; tenantSlug: string }) {
  const letter = gradeLetter(call.score)
  const isNew = call.gradingStatus !== 'COMPLETED'

  return (
    <Link
      href={`/${tenantSlug}/calls/${call.id}`}
      className="block bg-surface-primary border-[0.5px] rounded-[14px] px-5 py-4 hover:shadow-ds-float hover:border-[var(--border-medium)] transition-all"
      style={{ borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-start gap-4">
        {/* Blue dot */}
        <div className="mt-2 shrink-0">
          <span className={`block w-2 h-2 rounded-full ${isNew ? 'bg-semantic-blue' : 'bg-semantic-green'}`} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-medium text-txt-primary truncate">
              {call.contactName ?? call.property?.address ?? 'Unknown contact'}
            </span>

            {/* Direction badge */}
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${
              call.direction === 'OUTBOUND' ? 'border-semantic-green text-semantic-green' : 'border-semantic-blue text-semantic-blue'
            }`}>
              {call.direction === 'OUTBOUND' ? <PhoneOutgoing size={9} /> : <PhoneIncoming size={9} />}
              {call.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'}
            </span>

            {/* Call type badge */}
            {call.callType && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${callTypeBadge(call.callType)}`}>
                {CALL_TYPE_NAMES[call.callType] ?? call.callType.replace(/_/g, ' ')}
              </span>
            )}

            {/* Outcome badge */}
            {call.callOutcome && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${outcomeBadge(call.callOutcome)}`}>
                {RESULT_NAMES[call.callOutcome] ?? call.callOutcome.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* Row 2: Rep, duration, time */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-txt-muted">
            {call.assignedTo && (
              <span className="flex items-center gap-1"><User size={9} /> {call.assignedTo.name}</span>
            )}
            <span className="flex items-center gap-1"><Clock size={9} /> {formatDuration(call.durationSeconds)}</span>
            <span className="flex items-center gap-1"><Phone size={9} /> {formatDistanceToNow(new Date(call.calledAt), { addSuffix: true })}</span>
          </div>

          {/* Row 3: Address — links to property detail if linked */}
          {(call.property || call.contactAddress) && (
            <div className="mt-1.5">
              {call.property ? (
                <Link href={`/${tenantSlug}/inventory/${call.property.id}`}
                  className="inline-flex items-center gap-1 text-[11px] text-txt-muted hover:text-gunner-red bg-surface-secondary border-[0.5px] px-2 py-0.5 rounded-full transition-colors" style={{ borderColor: 'var(--border-light)' }}>
                  <MapPin size={9} /> {call.property.address}, {call.property.city}, {call.property.state}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-txt-muted bg-surface-secondary border-[0.5px] px-2 py-0.5 rounded-full" style={{ borderColor: 'var(--border-light)' }}>
                  <MapPin size={9} /> {call.contactAddress}
                </span>
              )}
            </div>
          )}

          {/* Row 4: Summary */}
          {call.aiSummary && (
            <p className="text-[13px] text-txt-secondary mt-1.5 line-clamp-2">{call.aiSummary}</p>
          )}
        </div>

        {/* Grade circle */}
        <div className="shrink-0 text-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold ${gradeColor(call.score)}`}>
            {letter}
          </div>
          {call.score !== null && (
            <p className="text-[11px] text-txt-muted mt-1">{Math.round(call.score)}%</p>
          )}
        </div>
      </div>
    </Link>
  )
}
