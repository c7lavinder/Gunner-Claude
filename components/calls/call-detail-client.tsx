'use client'
// components/calls/call-detail-client.tsx
// Two-column call detail: grade + audio + highlights | 4 tabs
// Redesigned to match docs/DESIGN.md — light theme, no gradients, no heavy shadows

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, Clock, Star, Lightbulb, FileText, Zap, Search, Mic,
  CheckCircle, Send, ChevronRight, ShieldCheck, CalendarCheck, DollarSign,
  Heart, AlertTriangle, Target, RotateCcw, Tag, MessageSquare, X, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { CALL_TYPES, RESULT_NAMES } from '@/lib/call-types'

// ─── Types ─────────────────────────────────────────────────────────────────

interface RubricScore { score: number; maxScore: number; notes: string }
interface KeyMoment { timestamp: string; type: string; description: string }
interface Objection { objection: string; response: string; handled: boolean }

interface CallDetail {
  id: string; score: number | null; gradingStatus: string
  callType: string | null; callOutcome: string | null; direction: string
  durationSeconds: number | null; calledAt: string
  recordingUrl: string | null; transcript: string | null
  aiSummary: string | null; aiFeedback: string | null
  sentiment: number | null; sellerMotivation: number | null
  talkRatio: number | null; nextBestAction: string | null
  keyMoments: KeyMoment[]; objections: Objection[]
  rubricScores: Record<string, RubricScore>; coachingTips: string[]
  contactName: string | null; contactPhone: string | null
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string; status: string; sellerName: string | null } | null
}

type Tab = 'coaching' | 'criteria' | 'transcript' | 'next-steps'

// ─── Helpers ───────────────────────────────────────────────────────────────

function scoreColor(score: number | null): { text: string; bg: string; circle: string } {
  if (score === null) return { text: 'text-txt-muted', bg: 'bg-surface-tertiary', circle: 'bg-[#9B9A94]' }
  if (score >= 90) return { text: 'text-semantic-green', bg: 'bg-semantic-green-bg', circle: 'bg-semantic-green' }
  if (score >= 80) return { text: 'text-semantic-amber', bg: 'bg-semantic-amber-bg', circle: 'bg-semantic-amber' }
  if (score >= 70) return { text: 'text-semantic-blue', bg: 'bg-semantic-blue-bg', circle: 'bg-semantic-blue' }
  return { text: 'text-semantic-red', bg: 'bg-semantic-red-bg', circle: 'bg-semantic-red' }
}

function gradeLetter(score: number | null): string {
  if (score === null) return '\u2014'
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function fmtDuration(s: number | null): string {
  if (!s) return '\u2014'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number)
  if (parts.length === 2) return (parts[0] * 60) + parts[1]
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  return 0
}

const MOMENT_ICONS: Record<string, typeof Star> = {
  objection_handled: ShieldCheck, objection: ShieldCheck,
  appointment_set: CalendarCheck, price_discussion: DollarSign,
  rapport_building: Heart, red_flag: AlertTriangle,
  closing_attempt: Target, motivation_revealed: Lightbulb,
}

// ─── Main component ────────────────────────────────────────────────────────

export function CallDetailClient({ call, tenantSlug, isOwn }: {
  call: CallDetail; tenantSlug: string; isOwn: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('coaching')
  const [searchQuery, setSearchQuery] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showFeedback, setShowFeedback] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [settingOutcome, setSettingOutcome] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [generatedSteps, setGeneratedSteps] = useState<Array<{ type: string; label: string; reasoning: string }>>([])
  const [generatingSteps, setGeneratingSteps] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const { text: scoreTextColor, bg: scoreBgColor, circle: scoreCircleColor } = scoreColor(call.score)
  const letter = gradeLetter(call.score)
  const outcome = call.callOutcome ?? call.property?.status ?? null

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'coaching', label: 'Coaching', icon: <Lightbulb size={14} /> },
    { id: 'criteria', label: 'Criteria', icon: <Star size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'next-steps', label: 'Next Steps', icon: <Zap size={14} /> },
  ]

  function seekTo(timestamp: string) {
    if (audioRef.current) {
      audioRef.current.currentTime = parseTimestamp(timestamp)
      audioRef.current.play()
    }
  }

  function changeSpeed(rate: number) {
    setPlaybackRate(rate)
    if (audioRef.current) audioRef.current.playbackRate = rate
  }

  async function reprocess() {
    if (!window.confirm('Re-process this call? It will be re-graded from scratch.')) return
    setActionLoading('reprocess')
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/reprocess`, { method: 'POST' })
      if (res.ok) {
        toast('Call queued for re-grading', 'success')
        startTransition(() => router.refresh())
      } else {
        toast('Failed to reprocess — please try again', 'error')
      }
    } catch {
      toast('Failed to reprocess — please try again', 'error')
    }
    setActionLoading(null)
  }

  async function reclassify(callType: string) {
    setReclassifying(false)
    setActionLoading('reclassify')
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/reclassify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callType }),
      })
      if (res.ok) {
        toast(`Reclassified as ${callType.replace(/_/g, ' ')}`, 'success')
        startTransition(() => router.refresh())
      } else {
        toast('Failed to reclassify — please try again', 'error')
      }
    } catch {
      toast('Failed to reclassify — please try again', 'error')
    }
    setActionLoading(null)
  }

  async function setOutcome(outcome: string) {
    setSettingOutcome(false)
    setActionLoading('outcome')
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/reclassify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callOutcome: outcome }),
      })
      if (res.ok) {
        toast(`Outcome set to ${RESULT_NAMES[outcome] ?? outcome}`, 'success')
        startTransition(() => router.refresh())
      } else {
        toast('Failed to set outcome', 'error')
      }
    } catch {
      toast('Failed to set outcome', 'error')
    }
    setActionLoading(null)
  }

  async function generateNextSteps() {
    setGeneratingSteps(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/generate-next-steps`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.steps) {
          setGeneratedSteps(data.steps)
          toast('Next steps generated', 'success')
        }
      } else {
        toast('Failed to generate next steps', 'error')
      }
    } catch {
      toast('Failed to generate next steps', 'error')
    }
    setGeneratingSteps(false)
  }

  const QUICK_ACTION_MESSAGES: Record<string, { success: string; error: string }> = {
    add_note: { success: 'Note added to GHL', error: 'Failed to add note' },
    create_task: { success: 'Follow-up task created', error: 'Failed to create task' },
    send_sms: { success: 'SMS sent', error: 'SMS feature coming soon' },
  }

  async function quickAction(type: string) {
    setActionLoading(type)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(QUICK_ACTION_MESSAGES[type]?.success ?? 'Action completed', 'success')
      } else {
        toast(data.message ?? QUICK_ACTION_MESSAGES[type]?.error ?? 'Action failed', 'error')
      }
    } catch {
      toast(QUICK_ACTION_MESSAGES[type]?.error ?? 'Action failed', 'error')
    }
    setActionLoading(null)
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href={`/${tenantSlug}/calls`}
        className="inline-flex items-center gap-1.5 text-ds-body text-txt-secondary hover:text-txt-primary transition-colors"
      >
        <ArrowLeft size={14} /> Back to calls
      </Link>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-5 gap-6">
        {/* ── LEFT COLUMN (2/5) ─────────────────────────────────── */}
        <div className="md:col-span-2 space-y-4">
          {/* Grade display */}
          <div
            className={`${scoreBgColor} border rounded-[14px] p-6 text-center`}
            style={{ borderColor: 'var(--border-light)' }}
          >
            {/* Score circle — 40px round, colored by score */}
            <div
              className={`${scoreCircleColor} w-10 h-10 rounded-full flex items-center justify-center mx-auto`}
            >
              <span className="text-ds-body font-semibold text-white">{letter}</span>
            </div>
            <p className="text-ds-section font-semibold text-txt-primary mt-3">
              {call.score !== null ? `${Math.round(call.score)}` : '\u2014'}
              <span className="text-ds-body font-normal text-txt-muted"> / 100</span>
            </p>
            <p className="text-ds-fine text-txt-muted mt-1">
              {call.score !== null ? 'Overall Score' : 'Not graded'}
            </p>
          </div>

          {/* Info pills — 11px, font-weight 500, pill shape */}
          <div className="flex flex-wrap gap-1.5">
            {call.callType && (
              <Pill>{CALL_TYPES.find(ct => ct.id === call.callType)?.name ?? call.callType.replace(/_/g, ' ')}</Pill>
            )}
            {outcome && <Pill>{RESULT_NAMES[outcome] ?? outcome.replace(/_/g, ' ')}</Pill>}
            <Pill>{call.direction.toLowerCase()}</Pill>
            <Pill>{fmtDuration(call.durationSeconds)}</Pill>
            {call.assignedTo && <Pill>{call.assignedTo.name}</Pill>}
            <Pill>{format(new Date(call.calledAt), 'MMM d, h:mm a')}</Pill>
          </div>

          {/* Property link */}
          {call.property ? (
            <Link
              href={`/${tenantSlug}/inventory/${call.property.id}`}
              className="block bg-surface-primary border rounded-[14px] px-4 py-3 transition-all hover:shadow-ds-float"
              style={{ borderColor: 'var(--border-light)' }}
            >
              <p className="text-ds-fine text-txt-muted">Property</p>
              <p className="text-ds-body text-txt-primary mt-0.5">
                {call.property.address}, {call.property.city} {call.property.state}
              </p>
              {call.property.sellerName && (
                <p className="text-ds-fine text-txt-muted mt-0.5">{call.property.sellerName}</p>
              )}
            </Link>
          ) : (
            <p className="text-ds-fine text-txt-muted px-1">No property linked</p>
          )}

          {/* Audio player */}
          {call.recordingUrl && (
            <div
              className="bg-surface-primary border rounded-[14px] p-4 space-y-3"
              style={{ borderColor: 'var(--border-light)' }}
            >
              <audio ref={audioRef} controls src={call.recordingUrl} className="w-full h-8" />
              <div className="flex gap-1.5">
                {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                  <button
                    key={rate}
                    onClick={() => changeSpeed(rate)}
                    className={`text-ds-fine px-2 py-1 rounded-[10px] transition-colors ${
                      playbackRate === rate
                        ? 'bg-gunner-red text-white'
                        : 'bg-surface-secondary text-txt-secondary hover:text-txt-primary'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Key moments / highlights */}
          {call.keyMoments.length > 0 && (
            <div
              className="bg-surface-primary border rounded-[14px] p-4"
              style={{ borderColor: 'var(--border-light)' }}
            >
              <p className="text-ds-fine text-txt-muted mb-2">Key Moments</p>
              <div className="flex flex-wrap gap-1.5">
                {call.keyMoments.map((m, i) => {
                  const Icon = MOMENT_ICONS[m.type] ?? Zap
                  return (
                    <button
                      key={i}
                      onClick={() => seekTo(m.timestamp)}
                      className="flex items-center gap-1 text-ds-fine bg-surface-secondary border rounded-[6px] px-2 py-1.5 text-txt-secondary hover:text-txt-primary transition-colors"
                      style={{ borderColor: 'var(--border-light)' }}
                    >
                      <Icon size={10} className="text-gunner-red shrink-0" />
                      <span className="text-txt-muted">{m.timestamp}</span>
                      <span className="truncate max-w-24">{m.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions — secondary button style */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={reprocess}
              disabled={actionLoading === 'reprocess'}
              className="text-ds-body font-medium bg-surface-secondary border rounded-[10px] text-txt-secondary hover:text-txt-primary px-3 py-1.5 flex items-center gap-1 transition-colors"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              <RotateCcw size={10} /> Reprocess
            </button>
            <div className="relative">
              <button
                onClick={() => setReclassifying(!reclassifying)}
                className="text-ds-body font-medium bg-surface-secondary border rounded-[10px] text-txt-secondary hover:text-txt-primary px-3 py-1.5 flex items-center gap-1 transition-colors"
                style={{ borderColor: 'var(--border-medium)' }}
              >
                <Tag size={10} /> Reclassify
              </button>
              {reclassifying && (
                <div
                  className="absolute top-full left-0 mt-1 bg-surface-primary border rounded-[10px] p-1 z-10 min-w-40 shadow-ds-float"
                  style={{ borderColor: 'var(--border-medium)' }}
                >
                  {CALL_TYPES.map(ct => (
                    <button
                      key={ct.id}
                      onClick={() => reclassify(ct.id)}
                      className="block w-full text-left text-ds-body text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary px-3 py-1.5 rounded-[6px]"
                    >
                      {ct.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setSettingOutcome(!settingOutcome)}
                className="text-ds-body font-medium bg-surface-secondary border rounded-[10px] text-txt-secondary hover:text-txt-primary px-3 py-1.5 flex items-center gap-1 transition-colors"
                style={{ borderColor: 'var(--border-medium)' }}
              >
                <CheckCircle size={10} /> Outcome
              </button>
              {settingOutcome && (
                <div
                  className="absolute top-full left-0 mt-1 bg-surface-primary border rounded-[10px] p-1 z-10 min-w-44 shadow-ds-float"
                  style={{ borderColor: 'var(--border-medium)' }}
                >
                  {(call.callType ? CALL_TYPES.find(ct => ct.id === call.callType)?.results ?? [] : CALL_TYPES.flatMap(ct => ct.results).filter((r, i, a) => a.findIndex(x => x.id === r.id) === i)).map(r => (
                    <button
                      key={r.id}
                      onClick={() => setOutcome(r.id)}
                      className={`block w-full text-left text-ds-body px-3 py-1.5 rounded-[6px] ${
                        call.callOutcome === r.id
                          ? 'text-gunner-red bg-gunner-red-light'
                          : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary'
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFeedback(true)}
              className="text-ds-body font-medium bg-surface-secondary border rounded-[10px] text-txt-secondary hover:text-txt-primary px-3 py-1.5 flex items-center gap-1 transition-colors"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              <MessageSquare size={10} /> Feedback
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN (3/5) ────────────────────────────────── */}
        <div className="md:col-span-3 space-y-4">
          {/* Tab bar — bg-tertiary container, white active tab with shadow */}
          <div className="flex gap-1 bg-surface-tertiary rounded-[14px] p-1 w-fit">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-ds-body font-medium transition-all ${
                  tab === t.id
                    ? 'bg-surface-primary text-txt-primary shadow-ds-float'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── Coaching tab ──────────────────────────────────── */}
          {tab === 'coaching' && (
            <div className="space-y-4">
              {call.aiSummary && (
                <Section title="Call Summary" ai>
                  <p className="text-ds-body text-txt-secondary leading-relaxed">{call.aiSummary}</p>
                </Section>
              )}
              {call.aiFeedback && (
                <Section title="AI Feedback" ai>
                  <p className="text-ds-body text-txt-secondary leading-relaxed">{call.aiFeedback}</p>
                </Section>
              )}
              {call.coachingTips.length > 0 && (
                <div
                  className="bg-semantic-purple-bg rounded-[14px] p-5"
                  style={{ borderLeft: '2px solid var(--purple)' }}
                >
                  <h3 className="text-ds-label font-semibold text-semantic-purple flex items-center gap-2 mb-3">
                    <Lightbulb size={14} /> What to Improve
                    <AiBadge />
                  </h3>
                  <ul className="space-y-3">
                    {call.coachingTips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-ds-body text-txt-secondary">
                        <span className="w-5 h-5 rounded-full bg-semantic-purple/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-ds-fine text-semantic-purple font-semibold">{i + 1}</span>
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {call.keyMoments.length > 0 && (
                <Section title="Key Moments">
                  <div className="space-y-2">
                    {call.keyMoments.map((m, i) => {
                      const Icon = MOMENT_ICONS[m.type] ?? Zap
                      return (
                        <div key={i} className="flex items-start gap-3 text-ds-body">
                          <span className="text-ds-fine text-txt-muted bg-surface-secondary px-2 py-0.5 rounded-[6px] shrink-0">
                            {m.timestamp}
                          </span>
                          <Icon size={12} className="text-gunner-red shrink-0 mt-0.5" />
                          <span className="text-txt-secondary">{m.description}</span>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}
              {call.objections.length > 0 && (
                <Section title="Objection Handling">
                  <div className="space-y-3">
                    {call.objections.map((obj, i) => (
                      <div key={i} className="bg-surface-secondary rounded-[10px] p-3">
                        <p className="text-ds-fine text-txt-muted mb-1">Objection:</p>
                        <p className="text-ds-body text-txt-secondary italic">&ldquo;{obj.objection}&rdquo;</p>
                        <p className="text-ds-fine text-txt-muted mt-2 mb-1">Response:</p>
                        <p className="text-ds-body text-txt-secondary">{obj.response}</p>
                        <span className={`text-ds-fine mt-1 inline-block ${obj.handled ? 'text-semantic-green' : 'text-semantic-red'}`}>
                          {obj.handled ? '\u2713 Handled' : '\u2717 Not handled'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {(call.sentiment !== null || call.sellerMotivation !== null) && (
                <div className="grid grid-cols-2 gap-3">
                  {call.sentiment !== null && (
                    <div
                      className="bg-surface-primary border rounded-[14px] p-4"
                      style={{ borderColor: 'var(--border-light)' }}
                    >
                      <p className="text-ds-fine text-txt-muted mb-1">Sentiment</p>
                      <p className={`text-ds-card font-semibold ${
                        call.sentiment > 0.3 ? 'text-semantic-green'
                        : call.sentiment > 0 ? 'text-semantic-amber'
                        : 'text-semantic-red'
                      }`}>
                        {call.sentiment > 0.3 ? 'Positive' : call.sentiment > 0 ? 'Neutral' : 'Negative'}
                      </p>
                    </div>
                  )}
                  {call.sellerMotivation !== null && (
                    <div
                      className="bg-surface-primary border rounded-[14px] p-4"
                      style={{ borderColor: 'var(--border-light)' }}
                    >
                      <p className="text-ds-fine text-txt-muted mb-1">Seller Motivation</p>
                      <p className={`text-ds-card font-semibold ${
                        call.sellerMotivation > 0.6 ? 'text-semantic-green'
                        : call.sellerMotivation > 0.3 ? 'text-semantic-amber'
                        : 'text-semantic-red'
                      }`}>
                        {call.sellerMotivation > 0.6 ? 'High' : call.sellerMotivation > 0.3 ? 'Medium' : 'Low'}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {!call.aiSummary && !call.aiFeedback && call.coachingTips.length === 0 && (
                <EmptyTab icon={<Lightbulb size={24} />} message="No coaching data available yet" />
              )}
            </div>
          )}

          {/* ── Criteria tab (rubric) ─────────────────────────── */}
          {tab === 'criteria' && (
            <div className="space-y-4">
              {Object.keys(call.rubricScores).length > 0 ? (
                <div
                  className="bg-surface-primary border rounded-[14px] p-5 space-y-5"
                  style={{ borderColor: 'var(--border-light)' }}
                >
                  {Object.entries(call.rubricScores).map(([cat, data]) => {
                    const pct = data.maxScore > 0 ? Math.round((data.score / data.maxScore) * 100) : 0
                    const barColor =
                      pct >= 90 ? 'bg-semantic-green'
                      : pct >= 80 ? 'bg-semantic-amber'
                      : pct >= 70 ? 'bg-semantic-blue'
                      : 'bg-semantic-red'
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-ds-body text-txt-primary font-medium">{cat}</span>
                          <span className="text-ds-body font-semibold text-txt-primary">
                            {data.score}
                            <span className="text-txt-muted font-normal">/{data.maxScore}</span>
                          </span>
                        </div>
                        <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor} transition-all duration-700`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {data.notes && (
                          <p className="text-ds-fine text-txt-muted mt-1.5">{data.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyTab icon={<Star size={24} />} message="No criteria breakdown available" />
              )}
            </div>
          )}

          {/* ── Transcript tab ────────────────────────────────── */}
          {tab === 'transcript' && (
            <div className="space-y-4">
              {call.transcript ? (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search transcript..."
                      className="w-full bg-surface-secondary border rounded-[10px] pl-9 pr-4 py-2.5 text-ds-body text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-gunner-red"
                      style={{ borderColor: 'var(--border-medium)' }}
                    />
                  </div>
                  <div
                    className="bg-surface-primary border rounded-[14px] p-5 max-h-[500px] overflow-y-auto"
                    style={{ borderColor: 'var(--border-light)' }}
                  >
                    <TranscriptView transcript={call.transcript} searchQuery={searchQuery} />
                  </div>
                </>
              ) : call.recordingUrl ? (
                <EmptyTab
                  icon={<Mic size={24} />}
                  message="A recording was found but hasn't been transcribed yet"
                  sub="Use Reprocess to trigger transcription."
                />
              ) : (
                <EmptyTab
                  icon={<Mic size={24} />}
                  message="This call has no recording URL — graded from metadata only"
                  sub="Transcripts require a recording captured via GHL webhook. Recording URLs are only available on real-time calls, not historical ones."
                />
              )}
            </div>
          )}

          {/* ── Next Steps tab ────────────────────────────────── */}
          {tab === 'next-steps' && (
            <div className="space-y-4">
              {call.nextBestAction && (
                <div
                  className="bg-semantic-purple-bg rounded-[14px] p-5"
                  style={{ borderLeft: '2px solid var(--purple)' }}
                >
                  <h3 className="text-ds-label font-semibold text-semantic-purple flex items-center gap-2 mb-2">
                    <Zap size={14} /> AI Recommended Action
                    <AiBadge />
                  </h3>
                  <p className="text-ds-body text-txt-secondary">{call.nextBestAction}</p>
                </div>
              )}

              {/* Generate AI steps — AI Generate button style (purple) */}
              {generatedSteps.length === 0 && (
                <button
                  onClick={generateNextSteps}
                  disabled={generatingSteps}
                  className="w-full bg-semantic-purple hover:opacity-90 text-white text-ds-body font-semibold py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2"
                >
                  {generatingSteps ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating...</>
                  ) : (
                    <>{'\u2726'} Generate AI Next Steps</>
                  )}
                </button>
              )}

              {generatedSteps.length > 0 && (
                <div
                  className="bg-surface-primary border rounded-[14px] p-5 space-y-3"
                  style={{ borderColor: 'var(--border-light)' }}
                >
                  <h3 className="text-ds-card font-semibold text-txt-primary mb-2">AI-Generated Steps</h3>
                  {generatedSteps.map((step, i) => (
                    <div key={i} className="bg-surface-secondary rounded-[10px] p-3">
                      <p className="text-ds-body text-txt-primary font-medium">{step.label}</p>
                      <p className="text-ds-fine text-txt-muted italic mt-1">{step.reasoning}</p>
                      <span className="text-ds-fine text-txt-muted mt-1 inline-block">
                        {step.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div
                className="bg-surface-primary border rounded-[14px] p-5 space-y-2"
                style={{ borderColor: 'var(--border-light)' }}
              >
                <h3 className="text-ds-card font-semibold text-txt-primary mb-3">Quick Actions</h3>
                <QuickAction icon={<FileText size={14} />} label="Add call note to GHL" type="add_note" loading={actionLoading} onAction={quickAction} />
                <QuickAction icon={<CheckCircle size={14} />} label="Create follow-up task" type="create_task" loading={actionLoading} onAction={quickAction} />
                <QuickAction icon={<Send size={14} />} label="Send follow-up SMS" type="send_sms" loading={actionLoading} onAction={quickAction} />
              </div>

              {call.property && (
                <Link
                  href={`/${tenantSlug}/inventory/${call.property.id}`}
                  className="flex items-center justify-between bg-surface-primary border rounded-[14px] px-5 py-4 transition-all hover:shadow-ds-float"
                  style={{ borderColor: 'var(--border-light)' }}
                >
                  <div>
                    <p className="text-ds-fine text-txt-muted mb-0.5">View Property</p>
                    <p className="text-ds-body text-txt-primary">{call.property.address}, {call.property.city} {call.property.state}</p>
                  </div>
                  <ChevronRight size={14} className="text-txt-muted" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Feedback modal */}
      {showFeedback && <FeedbackModal callId={call.id} tenantSlug={tenantSlug} onClose={() => setShowFeedback(false)} />}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

/** AI badge — purple-bg, purple text, 11px, pill shape with ✦ prefix */
function AiBadge() {
  return (
    <span className="text-ds-fine font-medium bg-semantic-purple-bg text-semantic-purple px-2 py-0.5 rounded-full">
      {'\u2726'} AI
    </span>
  )
}

/** Info pill — 11px, font-weight 500, pill shape, semantic colors */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-ds-fine font-medium bg-surface-secondary border text-txt-secondary px-2.5 py-1 rounded-full"
      style={{ borderColor: 'var(--border-light)' }}
    >
      {children}
    </span>
  )
}

/** Card section — 14px border-radius, 0.5px border. AI variant gets purple left border + purple header. */
function Section({ title, children, ai }: { title: string; children: React.ReactNode; ai?: boolean }) {
  return (
    <div
      className="bg-surface-primary border rounded-[14px] p-5"
      style={{
        borderColor: 'var(--border-light)',
        borderLeft: ai ? '2px solid var(--purple)' : undefined,
      }}
    >
      <h3 className={`text-ds-card font-semibold mb-3 flex items-center gap-2 ${ai ? 'text-semantic-purple' : 'text-txt-primary'}`}>
        {title}
        {ai && <AiBadge />}
      </h3>
      {children}
    </div>
  )
}

function EmptyTab({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) {
  return (
    <div
      className="bg-surface-primary border rounded-[14px] p-8 text-center"
      style={{ borderColor: 'var(--border-light)' }}
    >
      <div className="text-txt-muted mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-ds-body text-txt-secondary">{message}</p>
      {sub && <p className="text-ds-fine text-txt-muted mt-1">{sub}</p>}
    </div>
  )
}

function QuickAction({ icon, label, type, loading, onAction }: {
  icon: React.ReactNode; label: string; type: string
  loading: string | null; onAction: (type: string) => void
}) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'done'>('idle')
  const isLoading = loading === type

  function handle() {
    if (status === 'idle') { setStatus('confirm'); return }
    if (status === 'confirm') {
      onAction(type)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <button
      onClick={handle}
      disabled={isLoading}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-[10px] hover:bg-surface-secondary transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-[10px] bg-surface-secondary flex items-center justify-center shrink-0 text-txt-secondary">
        {status === 'done' ? (
          <CheckCircle size={14} className="text-semantic-green" />
        ) : isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          icon
        )}
      </div>
      <p className="text-ds-body text-txt-primary font-medium flex-1">
        {status === 'confirm' ? `Confirm: ${label}?` : status === 'done' ? 'Done!' : label}
      </p>
      {status === 'confirm' && (
        <span className="text-ds-fine text-gunner-red shrink-0">Click to confirm</span>
      )}
    </button>
  )
}

function FeedbackModal({ callId, tenantSlug, onClose }: { callId: string; tenantSlug: string; onClose: () => void }) {
  const [type, setType] = useState('general_correction')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit() {
    if (details.length < 10) return
    setSubmitting(true)
    await fetch(`/api/${tenantSlug}/calls/${callId}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, details }),
    }).catch(() => {})
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(onClose, 1500)
  }

  const feedbackTypes = [
    'score_too_high', 'score_too_low', 'wrong_criteria', 'missed_issue',
    'incorrect_feedback', 'general_correction', 'praise',
  ]

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface-primary border rounded-[20px] p-6 w-full max-w-md shadow-ds-float"
        style={{ borderColor: 'var(--border-light)' }}
        onClick={e => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle size={24} className="text-semantic-green mx-auto mb-2" />
            <p className="text-ds-body text-txt-primary">Thank you — feedback submitted</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-ds-card font-semibold text-txt-primary">Submit Feedback</h3>
              <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors">
                <X size={14} />
              </button>
            </div>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary mb-3 focus:outline-none focus:border-gunner-red"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              {feedbackTypes.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={4}
              placeholder="Describe the issue (min 10 characters)..."
              className="w-full bg-surface-secondary border rounded-[10px] px-3 py-2 text-ds-body text-txt-primary placeholder:text-txt-muted mb-3 focus:outline-none focus:border-gunner-red resize-none"
              style={{ borderColor: 'var(--border-medium)' }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="text-ds-body font-medium text-txt-primary bg-surface-secondary border rounded-[10px] px-4 py-[9px] hover:border-[var(--border-medium)] transition-colors"
                style={{ borderColor: 'var(--border-medium)' }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={details.length < 10 || submitting}
                className="text-ds-body font-semibold bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 py-[9px] rounded-[10px] transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Transcript viewer ─────────────────────────────────────────────────────

function TranscriptView({ transcript, searchQuery }: { transcript: string; searchQuery: string }) {
  const lines = transcript.split('\n').filter(l => l.trim())
  const filtered = searchQuery
    ? lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase()))
    : lines

  if (searchQuery && filtered.length === 0) {
    return <p className="text-ds-body text-txt-muted">No matches for &ldquo;{searchQuery}&rdquo;</p>
  }

  return (
    <div className="space-y-2">
      {searchQuery && <p className="text-ds-fine text-txt-muted mb-2">{filtered.length} matches</p>}
      {filtered.map((line, i) => {
        const match = line.match(/^(Speaker \d+|Rep|Seller|Agent|Customer|Unknown):\s*/i)
        const speaker = match?.[1] ?? null
        const content = speaker ? line.substring(match![0].length) : line
        const isRep = speaker?.toLowerCase().includes('rep') || speaker?.toLowerCase().includes('agent') || speaker === 'Speaker 0'

        return (
          <div key={i} className={`text-ds-body leading-relaxed ${speaker ? 'flex gap-2' : ''}`}>
            {speaker && (
              <span className={`text-ds-fine font-medium shrink-0 mt-0.5 ${isRep ? 'text-semantic-blue' : 'text-gunner-red'}`}>
                {speaker}:
              </span>
            )}
            <span className="text-txt-secondary">
              {searchQuery ? highlightText(content, searchQuery) : content}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function highlightText(text: string, query: string): React.ReactNode {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-semantic-amber-bg text-semantic-amber rounded px-0.5">{part}</mark>
      : part
  )
}
