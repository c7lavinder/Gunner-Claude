'use client'
// components/calls/call-detail-client.tsx
// Call detail — matches getgunner.ai design
// Layout: [Header + pills] → [Grade+Strengths (33%) | 4 Tabs (67%)]

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Phone, Clock, Star, Lightbulb, FileText, Zap, Search, Mic,
  CheckCircle, Send, ChevronRight, ShieldCheck, CalendarCheck, DollarSign,
  Heart, AlertTriangle, Target, RotateCcw, Tag, MessageSquare, X, Loader2,
  User, MapPin, Clipboard, PhoneOutgoing, PhoneIncoming, Plus, RefreshCw,
  Play, Pause, SkipBack, SkipForward, Volume2, ChevronDown, Home, Sparkles,
} from 'lucide-react'
import { format } from 'date-fns'
import { useToast } from '@/components/ui/toaster'
import { CALL_TYPES, RESULT_NAMES } from '@/lib/call-types'
import { formatFieldLabel } from '@/lib/format'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RubricScore { score: number; maxScore: number; notes: string }
interface KeyMoment { timestamp: string; type: string; description: string }
interface Objection { objection: string; response: string; handled: boolean }

interface CoachingData {
  strengths: string[]
  redFlags: string[]
  improvements: Array<{ what_went_wrong: string; call_example: string; coaching_tip: string }>
  objectionReplies: Array<{ objection_label: string; call_quote: string; suggested_responses: string[] }>
}

interface CallDetail {
  id: string; score: number | null; gradingStatus: string
  callType: string | null; callOutcome: string | null; direction: string
  durationSeconds: number | null; calledAt: string
  recordingUrl: string | null; transcript: string | null
  aiSummary: string | null; aiFeedback: string | null
  coachingData: CoachingData
  sentiment: number | null; sellerMotivation: number | null
  talkRatio: number | null; nextBestAction: string | null
  keyMoments: KeyMoment[]; objections: Objection[]
  rubricScores: Record<string, RubricScore>; coachingTips: string[]
  contactName: string | null; contactPhone: string | null
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string; status: string; sellerName: string | null } | null
  aiNextSteps: Array<{ type: string; label: string; reasoning: string; status: string; pushedAt: string | null }> | null
}

type Tab = 'coaching' | 'criteria' | 'transcript' | 'next-steps' | 'property'

interface NextStep {
  type: string; label: string; reasoning: string
  status: 'pending' | 'pushed' | 'skipped'
  pushedAt?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function gradeInfo(score: number | null): { letter: string; color: string; glow: string; bg: string } {
  if (score === null) return { letter: '\u2014', color: 'bg-[#9B9A94]', glow: '', bg: 'bg-surface-tertiary' }
  if (score >= 90) return { letter: 'A', color: 'bg-[#22c55e]', glow: 'shadow-[0_0_20px_rgba(34,197,94,0.3)]', bg: 'bg-[#22c55e]/5' }
  if (score >= 80) return { letter: 'B', color: 'bg-semantic-blue', glow: 'shadow-[0_0_20px_rgba(24,95,165,0.3)]', bg: 'bg-semantic-blue/5' }
  if (score >= 70) return { letter: 'C', color: 'bg-semantic-amber', glow: 'shadow-[0_0_20px_rgba(186,117,23,0.3)]', bg: 'bg-semantic-amber/5' }
  return { letter: score >= 60 ? 'D' : 'F', color: 'bg-semantic-red', glow: 'shadow-[0_0_20px_rgba(163,45,45,0.3)]', bg: 'bg-semantic-red/5' }
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

const STEP_ICONS: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  check_off_task: { icon: CheckCircle, color: 'text-semantic-green', bg: 'bg-semantic-green-bg' },
  create_appointment: { icon: CalendarCheck, color: 'text-[#e11d48]', bg: 'bg-[#ffe4e6]' },
  change_stage: { icon: RefreshCw, color: 'text-semantic-amber', bg: 'bg-semantic-amber-bg' },
  add_note: { icon: FileText, color: 'text-semantic-blue', bg: 'bg-semantic-blue-bg' },
  send_sms: { icon: Send, color: 'text-[#0d9488]', bg: 'bg-[#ccfbf1]' },
  create_task: { icon: CheckCircle, color: 'text-semantic-purple', bg: 'bg-semantic-purple-bg' },
}

// ─── Main component ─────────────────────────────────────────────────────────

export function CallDetailClient({ call, tenantSlug, isOwn }: {
  call: CallDetail; tenantSlug: string; isOwn: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('coaching')
  const [searchQuery, setSearchQuery] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [showFeedback, setShowFeedback] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [generatedSteps, setGeneratedSteps] = useState<NextStep[]>(() => {
    if (call.aiNextSteps && call.aiNextSteps.length > 0) {
      return call.aiNextSteps.map(s => ({
        type: s.type,
        label: s.label,
        reasoning: s.reasoning,
        status: s.status as 'pending' | 'pushed' | 'skipped',
        pushedAt: s.pushedAt ?? undefined,
      }))
    }
    return []
  })
  const [generatingSteps, setGeneratingSteps] = useState(false)
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set())
  const audioRef = useRef<HTMLAudioElement>(null)

  const grade = gradeInfo(call.score)
  const outcome = call.callOutcome ?? call.property?.status ?? null

  const { strengths, redFlags, improvements, objectionReplies } = call.coachingData

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'coaching', label: 'Coaching', icon: <Lightbulb size={14} /> },
    { id: 'criteria', label: 'Criteria', icon: <Target size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'next-steps', label: 'Next Steps', icon: <Zap size={14} />, badge: generatedSteps.filter(s => s.status === 'pending').length || undefined },
    { id: 'property', label: 'Property', icon: <Home size={14} /> },
  ]

  function seekTo(timestamp: string) {
    if (audioRef.current) {
      audioRef.current.currentTime = parseTimestamp(timestamp)
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
    else { audioRef.current.play(); setIsPlaying(true) }
  }

  function changeSpeed() {
    const speeds = [0.5, 1, 1.5, 2]
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]
    setPlaybackRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  async function reprocess() {
    if (!window.confirm('Re-process this call? It will be re-graded.')) return
    setActionLoading('reprocess')
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/reprocess`, { method: 'POST' })
      if (res.ok) { toast('Call queued for re-grading', 'success'); startTransition(() => router.refresh()) }
      else toast('Failed to reprocess', 'error')
    } catch { toast('Failed to reprocess', 'error') }
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
      if (res.ok) { toast(`Reclassified as ${callType.replace(/_/g, ' ')}`, 'success'); startTransition(() => router.refresh()) }
      else toast('Failed to reclassify', 'error')
    } catch { toast('Failed to reclassify', 'error') }
    setActionLoading(null)
  }

  async function generateNextSteps() {
    setGeneratingSteps(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/generate-next-steps`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.steps) {
          const newSteps = data.steps.map((s: { type: string; label: string; reasoning: string }) => ({ ...s, status: 'pending' as const }))
          setGeneratedSteps(newSteps)
          toast('Next steps generated', 'success')
        }
      } else toast('Failed to generate next steps', 'error')
    } catch { toast('Failed to generate next steps', 'error') }
    setGeneratingSteps(false)
  }

  async function pushStep(index: number) {
    const step = generatedSteps[index]
    if (!step) return
    setActionLoading(`step-${index}`)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: step.type }),
      })
      if (res.ok) {
        const updatedSteps = generatedSteps.map((s, i) => i === index ? { ...s, status: 'pushed' as const, pushedAt: new Date().toISOString() } : s)
        setGeneratedSteps(updatedSteps)
        // Persist step status to DB
        fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiNextSteps: updatedSteps }),
        }).catch(() => {})
        toast('Action pushed to CRM', 'success')
      } else toast('Failed to push action', 'error')
    } catch { toast('Failed to push action', 'error') }
    setActionLoading(null)
  }

  function skipStep(index: number) {
    const updatedSteps = generatedSteps.map((s, i) => i === index ? { ...s, status: 'skipped' as const } : s)
    setGeneratedSteps(updatedSteps)
    // Persist step status to DB
    fetch(`/api/${tenantSlug}/calls/${call.id}/actions`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiNextSteps: updatedSteps }),
    }).catch(() => {})
  }

  function toggleReason(index: number) {
    setExpandedReasons(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="space-y-5 -mx-4 md:-mx-8 -my-4 md:-my-6 px-4 md:px-8 py-4 md:py-6">
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href={`/${tenantSlug}/calls`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary transition-all"
          style={{ borderColor: 'var(--border-medium)' }}
        >
          <ArrowLeft size={14} /> Back
        </Link>

        <h1 className="text-[24px] font-semibold text-txt-primary">
          {call.contactName ?? 'Unknown Contact'}
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowFeedback(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary transition-all"
            style={{ borderColor: 'var(--border-medium)' }}
          >
            <MessageSquare size={13} /> Feedback
          </button>
          <div className="relative">
            <button
              onClick={() => setReclassifying(!reclassifying)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary transition-all"
              style={{ borderColor: 'var(--border-medium)' }}
            >
              Reclassify
            </button>
            {reclassifying && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setReclassifying(false)} />
                <div className="absolute top-full right-0 mt-1 bg-surface-primary border rounded-[10px] p-1 z-50 min-w-44 shadow-ds-float" style={{ borderColor: 'var(--border-medium)' }}>
                  {CALL_TYPES.map(ct => (
                    <button key={ct.id} onClick={() => reclassify(ct.id)}
                      className="block w-full text-left text-[13px] text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary px-3 py-2 rounded-[6px]">
                      {ct.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tag row — metadata pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {call.assignedTo && (
          <Pill icon={<User size={9} />}>{call.assignedTo.name}</Pill>
        )}
        <Pill icon={<Clock size={9} />}>{fmtDuration(call.durationSeconds)}</Pill>
        <Pill icon={call.direction === 'OUTBOUND' ? <PhoneOutgoing size={9} /> : <PhoneIncoming size={9} />}
          color={call.direction === 'OUTBOUND' ? 'border-semantic-green text-semantic-green' : 'border-semantic-blue text-semantic-blue'}>
          {call.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'}
        </Pill>
        {call.callType && (
          <Pill color="border-semantic-purple text-semantic-purple">
            {CALL_TYPES.find(ct => ct.id === call.callType)?.name ?? call.callType.replace(/_/g, ' ')}
          </Pill>
        )}
        {outcome && (
          <Pill color="border-semantic-green text-semantic-green">
            {RESULT_NAMES[outcome] ?? outcome.replace(/_/g, ' ')}
          </Pill>
        )}
        {call.callOutcome === 'follow_up_scheduled' && (
          <Pill icon={<Clock size={9} />} color="border-semantic-amber text-semantic-amber">
            Follow-Up Scheduled
          </Pill>
        )}
        {call.property && (
          <Pill icon={<MapPin size={9} />}>
            {call.property.address}, {call.property.city}, {call.property.state}
          </Pill>
        )}
        {call.property && (
          <Pill icon={<Clipboard size={9} />}>
            {call.property.status === 'DEAD' ? 'Property no longer in inventory' : 'View Property'}
          </Pill>
        )}
      </div>

      {/* Date/time */}
      <p className="text-[13px] text-txt-muted">
        {format(new Date(call.calledAt), "EEEE, MMM d, yyyy 'at' h:mm a")}
      </p>

      {/* ── TWO-COLUMN BODY ───────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* LEFT COLUMN (1/3) */}
        <div className="space-y-4">
          {/* OVERALL GRADE card */}
          <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-6 text-center" style={{ borderColor: 'var(--border-light)' }}>
            <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-4">Overall Grade</p>

            {/* Grade square with glow */}
            <div className={`w-16 h-16 rounded-[14px] flex items-center justify-center mx-auto ${grade.color} ${grade.glow}`}>
              <span className="text-[28px] font-semibold text-white">{grade.letter}</span>
            </div>

            <p className="text-[24px] font-semibold text-txt-primary mt-3">
              {call.score !== null ? `${Math.round(call.score)}%` : '\u2014'}
            </p>

            <button className="text-[11px] text-semantic-red hover:underline mt-2">
              Flag a scoring issue
            </button>
          </div>

          {/* STRENGTHS card */}
          {strengths.length > 0 && (
            <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
              <h3 className="text-[14px] font-semibold text-semantic-green flex items-center gap-2 mb-3">
                <CheckCircle size={14} /> STRENGTHS
              </h3>
              <ul className="space-y-2.5">
                {strengths.map((s, i) => (
                  <li key={i} className="text-[13px] text-txt-secondary leading-relaxed flex items-start gap-2">
                    <span className="text-semantic-green mt-0.5 shrink-0">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* RED FLAGS card */}
          {redFlags.length > 0 && (
            <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
              <h3 className="text-[14px] font-semibold text-semantic-amber flex items-center gap-2 mb-3">
                <AlertTriangle size={14} /> RED FLAGS
              </h3>
              <ul className="space-y-2">
                {redFlags.map((flag, i) => (
                  <li key={i} className="text-[13px] text-txt-secondary leading-relaxed flex items-start gap-2">
                    <span className="text-semantic-amber mt-0.5 shrink-0">•</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (2/3) */}
        <div className="md:col-span-2 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 bg-surface-tertiary rounded-[14px] p-1 w-fit overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-surface-primary text-txt-primary shadow-ds-float'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {t.icon} {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="bg-gunner-red text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── COACHING TAB ─────────────────────────────────────── */}
          {tab === 'coaching' && (
            <div className="space-y-4">
              {/* Summary */}
              {call.aiSummary && (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase flex items-center gap-2 mb-3">
                    <FileText size={12} /> Summary
                  </h3>
                  <p className="text-[13px] text-txt-secondary leading-relaxed">{call.aiSummary}</p>
                </div>
              )}

              {/* Areas for Improvement — each item is its own card */}
              {improvements.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-amber uppercase flex items-center gap-2 mb-3 px-1">
                    <Target size={12} /> Areas for Improvement
                  </h3>
                  <div className="space-y-3">
                    {improvements.map((item, i) => (
                      <div key={i} className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                        {/* What went wrong */}
                        <p className="text-[13px] text-txt-primary leading-relaxed mb-3">{item.what_went_wrong}</p>

                        {/* Call example — blockquote style */}
                        {item.call_example && (
                          <div className="flex gap-2 mb-3 pl-1">
                            <span className="text-[20px] text-txt-muted leading-none shrink-0 -mt-1">&ldquo;</span>
                            <p className="text-[12px] text-txt-muted italic leading-relaxed">{item.call_example}</p>
                          </div>
                        )}

                        {/* Coaching tip — accent border card */}
                        {item.coaching_tip && (
                          <div className="border-l-[3px] border-semantic-blue bg-semantic-blue/5 rounded-r-[10px] px-4 py-3">
                            <p className="text-[10px] font-medium tracking-[0.08em] text-semantic-blue uppercase mb-1.5">
                              <Lightbulb size={10} className="inline -mt-0.5 mr-1" />Script Suggestion
                            </p>
                            <p className="text-[13px] text-txt-secondary leading-relaxed">{item.coaching_tip}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Potential Replies to Objections */}
              {objectionReplies.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-purple uppercase flex items-center gap-2 mb-1 px-1">
                    <ShieldCheck size={12} /> Potential Replies to Objections
                  </h3>
                  <p className="text-[11px] text-txt-muted mb-3 px-1">Objections identified in this call with suggested responses</p>
                  <div className="space-y-3">
                    {objectionReplies.map((obj, i) => (
                      <div key={i} className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                        {/* Objection label chip */}
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-semantic-purple-bg text-semantic-purple mb-3 inline-block">
                          {obj.objection_label}
                        </span>

                        {/* Call quote — blockquote style */}
                        {obj.call_quote && (
                          <div className="flex gap-2 mb-3 pl-1 mt-2">
                            <span className="text-[20px] text-txt-muted leading-none shrink-0 -mt-1">&ldquo;</span>
                            <p className="text-[12px] text-txt-muted italic leading-relaxed">{obj.call_quote}</p>
                          </div>
                        )}

                        {/* Suggested responses */}
                        {obj.suggested_responses.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[9px] font-medium tracking-[0.1em] text-txt-muted uppercase mb-2">Suggested Responses</p>
                            <div className="space-y-2">
                              {obj.suggested_responses.map((resp, ri) => (
                                <div key={ri} className="border-l-[3px] border-semantic-blue bg-semantic-blue/5 rounded-r-[10px] px-4 py-3">
                                  <p className="text-[13px] text-txt-secondary leading-relaxed">{resp}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!call.aiSummary && improvements.length === 0 && objectionReplies.length === 0 && (
                <EmptyState icon={<Lightbulb size={24} />} message="No coaching data available yet" />
              )}
            </div>
          )}

          {/* ── CRITERIA TAB ─────────────────────────────────────── */}
          {tab === 'criteria' && (
            <div>
              {Object.keys(call.rubricScores).length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(call.rubricScores).map(([cat, data]) => {
                    const pct = data.maxScore > 0 ? Math.round((data.score / data.maxScore) * 100) : 0
                    const barColor = pct >= 80 ? 'bg-semantic-green' : pct >= 60 ? 'bg-semantic-blue' : 'bg-semantic-red'
                    return (
                      <div key={cat} className="bg-surface-primary border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[14px] font-medium text-txt-primary">{formatFieldLabel(cat)}</span>
                          <span className={`text-[14px] font-semibold ${pct >= 80 ? 'text-semantic-green' : pct >= 60 ? 'text-semantic-blue' : 'text-semantic-red'}`}>
                            {data.score}/{data.maxScore}
                          </span>
                        </div>
                        <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden mb-3">
                          <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        {data.notes && (
                          <p className="text-[12px] text-txt-secondary leading-relaxed">{data.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState icon={<Star size={24} />} message="No criteria breakdown available" />
              )}
            </div>
          )}

          {/* ── TRANSCRIPT TAB ───────────────────────────────────── */}
          {tab === 'transcript' && (
            <div className="space-y-4">
              {/* Audio player */}
              {call.recordingUrl && (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                  <h3 className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase flex items-center gap-2 mb-4">
                    <Play size={12} /> Call Recording
                  </h3>

                  {/* Waveform placeholder */}
                  <div className="h-16 bg-surface-secondary rounded-[10px] flex items-center justify-center mb-3 overflow-hidden relative">
                    <div className="flex items-end gap-[2px] h-12">
                      {Array.from({ length: 60 }).map((_, i) => {
                        // Deterministic wave pattern: sine + harmonic for natural-looking audio bars
                        const h = 20 + Math.abs(Math.sin(i * 0.4) * 40) + Math.abs(Math.sin(i * 0.9) * 30) + (i % 3 === 0 ? 10 : 0)
                        return (
                          <div
                            key={i}
                            className="w-[3px] rounded-full bg-gunner-red/30"
                            style={{ height: `${Math.min(h, 100)}%` }}
                          />
                        )
                      })}
                    </div>
                    {/* Playhead */}
                    <div
                      className="absolute top-0 bottom-0 w-[2px] bg-gunner-red"
                      style={{ left: `${call.durationSeconds ? (currentTime / call.durationSeconds) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = 0 } }} className="p-1 text-txt-muted hover:text-txt-primary">
                      <SkipBack size={14} />
                    </button>
                    <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-gunner-red text-white flex items-center justify-center hover:bg-gunner-red-dark">
                      {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>
                    <button onClick={() => { if (audioRef.current) { audioRef.current.currentTime = audioRef.current.duration } }} className="p-1 text-txt-muted hover:text-txt-primary">
                      <SkipForward size={14} />
                    </button>
                    <span className="text-[11px] text-txt-muted">
                      {fmtDuration(Math.round(currentTime))} / {fmtDuration(call.durationSeconds)}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={changeSpeed} className="text-[11px] font-medium text-txt-secondary bg-surface-secondary px-2 py-1 rounded-[6px] hover:text-txt-primary">
                        {playbackRate}x
                      </button>
                      <button className="p-1 text-txt-muted hover:text-txt-primary">
                        <Volume2 size={14} />
                      </button>
                    </div>
                  </div>

                  <audio
                    ref={audioRef}
                    src={call.recordingUrl}
                    onTimeUpdate={e => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                </div>
              )}

              {/* Key Moments */}
              <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                <h3 className="text-[10px] font-medium tracking-[0.08em] text-semantic-purple uppercase flex items-center gap-2 mb-2">
                  &#x2726; Key Moments
                </h3>
                <p className="text-[12px] text-txt-muted mb-3">AI-identified highlights from this call — objections, appointments, price discussions, and more.</p>
                {call.keyMoments.length > 0 ? (
                  <div className="space-y-2">
                    {call.keyMoments.map((m, i) => {
                      const Icon = MOMENT_ICONS[m.type] ?? Zap
                      return (
                        <button
                          key={i}
                          onClick={() => seekTo(m.timestamp)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] bg-surface-secondary text-left hover:bg-surface-tertiary transition-colors"
                        >
                          <Icon size={12} className="text-semantic-purple shrink-0" />
                          <span className="text-[11px] text-semantic-purple font-medium shrink-0">{m.timestamp}</span>
                          <span className="text-[13px] text-txt-secondary truncate">{m.description}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <button
                    onClick={() => toast('Highlight generation coming soon', 'info')}
                    className="flex items-center gap-2 px-4 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-semantic-purple hover:bg-semantic-purple-bg transition-all"
                    style={{ borderColor: 'var(--border-medium)' }}
                  >
                    &#x2726; Generate Highlights
                  </button>
                )}
              </div>

              {/* Transcript */}
              {call.transcript ? (
                <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase">Call Transcript</h3>
                    <span className="text-[11px] text-txt-muted">Full transcription of the call</span>
                  </div>
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search transcript..."
                      className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] pl-9 pr-4 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-gunner-red"
                      style={{ borderColor: 'var(--border-medium)' }}
                    />
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <TranscriptView transcript={call.transcript} searchQuery={searchQuery} />
                  </div>
                </div>
              ) : call.recordingUrl ? (
                <EmptyState icon={<Mic size={24} />} message="Recording found but not transcribed yet" sub="Use Reprocess to trigger transcription." />
              ) : (
                <EmptyState icon={<Mic size={24} />} message="No recording URL — graded from metadata only" />
              )}
            </div>
          )}

          {/* ── NEXT STEPS TAB ───────────────────────────────────── */}
          {tab === 'next-steps' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-txt-primary">
                    {generatedSteps.filter(s => s.status === 'pending').length} pending step{generatedSteps.filter(s => s.status === 'pending').length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[12px] text-txt-muted">Review, edit, and push each action to CRM</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toast('Manual action creation coming soon', 'info')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border-[0.5px] text-[13px] font-medium text-txt-secondary hover:text-txt-primary"
                    style={{ borderColor: 'var(--border-medium)' }}
                  >
                    <Plus size={13} /> Add Action
                  </button>
                  {generatedSteps.length > 0 && (
                    <button onClick={generateNextSteps} className="text-[13px] text-txt-secondary hover:text-txt-primary">
                      Regenerate
                    </button>
                  )}
                </div>
              </div>

              {/* Generate button */}
              {generatedSteps.length === 0 && (
                <button
                  onClick={generateNextSteps}
                  disabled={generatingSteps}
                  className="w-full bg-semantic-purple hover:opacity-90 text-white text-[13px] font-semibold py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2"
                >
                  {generatingSteps ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <>&#x2726; Generate AI Next Steps</>}
                </button>
              )}

              {/* Pending actions */}
              {generatedSteps.filter(s => s.status === 'pending').length > 0 && (
                <div>
                  <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-2 flex items-center gap-1">
                    <MessageSquare size={10} /> CRM Actions ({generatedSteps.filter(s => s.status === 'pending').length})
                  </p>
                  <div className="space-y-3">
                    {generatedSteps.map((step, i) => {
                      if (step.status !== 'pending') return null
                      const stepDef = STEP_ICONS[step.type] ?? STEP_ICONS.add_note
                      const StepIcon = stepDef.icon
                      return (
                        <div key={i} className="bg-semantic-green-bg/30 border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)', borderLeft: '3px solid var(--green)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stepDef.bg} ${stepDef.color}`}>
                              <StepIcon size={10} className="inline mr-1" />
                              {step.type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726; AI</span>
                          </div>
                          <p className="text-[13px] text-txt-primary font-medium mb-1">{step.label}</p>
                          <button onClick={() => toggleReason(i)} className="text-[11px] text-semantic-purple hover:underline mb-3 flex items-center gap-1">
                            &#x2726; Why this action? <ChevronDown size={10} className={expandedReasons.has(i) ? 'rotate-180' : ''} />
                          </button>
                          {expandedReasons.has(i) && (
                            <p className="text-[12px] text-txt-muted italic mb-3">{step.reasoning}</p>
                          )}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => pushStep(i)}
                              disabled={actionLoading === `step-${i}`}
                              className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-[12px] font-semibold px-3 py-1.5 rounded-[10px] transition-colors"
                            >
                              {actionLoading === `step-${i}` ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                              Push to CRM
                            </button>
                            <button className="text-[12px] text-txt-secondary hover:text-txt-primary">Edit</button>
                            <button onClick={() => skipStep(i)} className="text-[12px] text-txt-secondary hover:text-txt-primary">Skip</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pushed actions */}
              {generatedSteps.filter(s => s.status === 'pushed').length > 0 && (
                <div>
                  <p className="text-[10px] font-medium tracking-[0.08em] text-txt-muted uppercase mb-2 flex items-center gap-1">
                    <Clock size={10} /> Actions Taken ({generatedSteps.filter(s => s.status === 'pushed').length} pushed)
                  </p>
                  <div className="space-y-3">
                    {generatedSteps.map((step, i) => {
                      if (step.status !== 'pushed') return null
                      const stepDef = STEP_ICONS[step.type] ?? STEP_ICONS.add_note
                      const StepIcon = stepDef.icon
                      return (
                        <div key={i} className="bg-semantic-amber-bg/30 border-[0.5px] rounded-[14px] p-4" style={{ borderColor: 'var(--border-light)', borderLeft: '3px solid var(--amber)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stepDef.bg} ${stepDef.color}`}>
                              <StepIcon size={10} className="inline mr-1" />
                              {step.type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[11px] font-medium text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726; AI</span>
                            <span className="text-[11px] font-medium text-semantic-green bg-semantic-green-bg px-2 py-0.5 rounded-full">&#x2713; Pushed</span>
                          </div>
                          <p className="text-[13px] text-txt-primary mb-2">{step.label}</p>
                          <p className="text-[12px] text-semantic-green">&#x2713; Action completed successfully!</p>
                          {step.pushedAt && (
                            <p className="text-[11px] text-txt-muted mt-1">Pushed {format(new Date(step.pushedAt), "MMM d 'at' h:mm a")}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AI recommended action (from grading) */}
              {call.nextBestAction && generatedSteps.length === 0 && (
                <div className="bg-semantic-purple-bg/30 border-[0.5px] rounded-[14px] p-5" style={{ borderColor: 'var(--border-light)', borderLeft: '3px solid var(--purple)' }}>
                  <h3 className="text-[14px] font-semibold text-semantic-purple flex items-center gap-2 mb-2">
                    <Zap size={14} /> AI Recommended Action
                    <span className="text-[11px] font-medium bg-semantic-purple-bg px-2 py-0.5 rounded-full">&#x2726; AI</span>
                  </h3>
                  <p className="text-[13px] text-txt-secondary">{call.nextBestAction}</p>
                </div>
              )}
            </div>
          )}

          {/* ── PROPERTY TAB ───────────────────────────────────────── */}
          {tab === 'property' && (
            <PropertyDataTab call={call} tenantSlug={tenantSlug} />
          )}
        </div>
      </div>

      {/* Feedback modal */}
      {showFeedback && <FeedbackModal callId={call.id} tenantSlug={tenantSlug} onClose={() => setShowFeedback(false)} />}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Pill({ children, icon, color }: { children: React.ReactNode; icon?: React.ReactNode; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border-[0.5px] ${
      color ?? 'border-[rgba(0,0,0,0.14)] text-txt-secondary'
    }`}>
      {icon} {children}
    </span>
  )
}

function EmptyState({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) {
  return (
    <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-8 text-center" style={{ borderColor: 'var(--border-light)' }}>
      <div className="text-txt-muted mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-[13px] text-txt-secondary">{message}</p>
      {sub && <p className="text-[11px] text-txt-muted mt-1">{sub}</p>}
    </div>
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

  const feedbackTypes = ['score_too_high', 'score_too_low', 'wrong_criteria', 'missed_issue', 'incorrect_feedback', 'general_correction', 'praise']

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-primary border-[0.5px] rounded-[20px] p-6 w-full max-w-md shadow-ds-float" style={{ borderColor: 'var(--border-light)' }} onClick={e => e.stopPropagation()}>
        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle size={24} className="text-semantic-green mx-auto mb-2" />
            <p className="text-[13px] text-txt-primary">Thank you — feedback submitted</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-txt-primary">Submit Feedback</h3>
              <button onClick={onClose} className="text-txt-muted hover:text-txt-primary"><X size={14} /></button>
            </div>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary mb-3 focus:outline-none"
              style={{ borderColor: 'var(--border-medium)' }}>
              {feedbackTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4}
              placeholder="Describe the issue (min 10 characters)..."
              className="w-full bg-surface-secondary border-[0.5px] rounded-[10px] px-3 py-2 text-[13px] text-txt-primary placeholder:text-txt-muted mb-3 focus:outline-none resize-none"
              style={{ borderColor: 'var(--border-medium)' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="text-[13px] font-medium text-txt-primary bg-surface-secondary border-[0.5px] rounded-[10px] px-4 py-[9px]" style={{ borderColor: 'var(--border-medium)' }}>Cancel</button>
              <button onClick={submit} disabled={details.length < 10 || submitting}
                className="text-[13px] font-semibold bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-40 text-white px-4 py-[9px] rounded-[10px]">
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PropertyDataTab({ call, tenantSlug }: { call: CallDetail; tenantSlug: string }) {
  const [suggestions, setSuggestions] = useState<Array<{
    field: string; label: string; currentValue: string | null
    suggestedValue: string; confidence: 'high' | 'medium' | 'low'
    quote: string; applied: boolean
  }>>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const { toast } = useToast()

  async function generateSuggestions() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/calls/${call.id}/property-suggestions`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions ?? [])
        setGenerated(true)
      } else {
        toast('Failed to analyze call', 'error')
      }
    } catch {
      toast('Failed to analyze call', 'error')
    }
    setLoading(false)
  }

  async function applySuggestion(index: number) {
    const s = suggestions[index]
    if (!s || !call.property) return
    setApplying(s.field)
    try {
      const res = await fetch(`/api/properties/${call.property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [s.field]: s.suggestedValue, fieldSources: { [s.field]: 'ai' } }),
      })
      if (res.ok) {
        setSuggestions(prev => prev.map((item, i) => i === index ? { ...item, applied: true } : item))
        toast(`Updated ${s.label}`, 'success')
      }
    } catch { /* swallow */ }
    setApplying(null)
  }

  const pendingCount = suggestions.filter(s => !s.applied).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-medium text-txt-primary">Property Data from Call</p>
          <p className="text-[12px] text-txt-muted">AI-extracted data points that can update the property record</p>
        </div>
        {generated && pendingCount > 0 && (
          <span className="text-[10px] font-bold text-semantic-purple bg-semantic-purple-bg px-2 py-0.5 rounded-full">{pendingCount} suggestions</span>
        )}
      </div>

      {!call.property && (
        <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-8 text-center" style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-[13px] text-txt-muted">No property linked to this call</p>
        </div>
      )}

      {call.property && !generated && (
        <button
          onClick={generateSuggestions}
          disabled={loading}
          className="w-full bg-semantic-purple hover:opacity-90 text-white text-[13px] font-semibold py-3 rounded-[10px] transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Analyzing transcript...</> : <><Sparkles size={14} /> Extract Property Data from Call</>}
        </button>
      )}

      {call.property && generated && suggestions.length === 0 && (
        <div className="bg-surface-primary border-[0.5px] rounded-[14px] p-8 text-center" style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-[13px] text-txt-muted">No new data points found in this call</p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className={`border-[0.5px] rounded-[14px] p-4 ${s.applied ? 'bg-green-50 border-green-200' : 'bg-surface-primary'}`} style={s.applied ? {} : { borderColor: 'var(--border-light)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-txt-primary">{s.label}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    s.confidence === 'high' ? 'bg-green-100 text-green-700' : s.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  }`}>{s.confidence}</span>
                  {s.applied ? (
                    <span className="text-[10px] font-medium text-green-600">Applied</span>
                  ) : (
                    <button
                      onClick={() => applySuggestion(i)}
                      disabled={applying === s.field}
                      className="text-[10px] font-semibold text-semantic-purple hover:text-semantic-purple/80 bg-semantic-purple-bg px-2.5 py-1 rounded-[8px]"
                    >
                      {applying === s.field ? '...' : 'Apply'}
                    </button>
                  )}
                </div>
              </div>
              {s.currentValue && (
                <p className="text-[11px] text-txt-muted">Current: {s.currentValue}</p>
              )}
              <p className="text-[12px] text-txt-primary font-medium mt-0.5">Suggested: {s.suggestedValue}</p>
              {s.quote && (
                <p className="text-[11px] text-txt-muted italic mt-1">&ldquo;{s.quote}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      )}

      {generated && (
        <button onClick={generateSuggestions} disabled={loading}
          className="text-[12px] text-txt-secondary hover:text-txt-primary">
          {loading ? 'Analyzing...' : 'Re-analyze'}
        </button>
      )}
    </div>
  )
}

function TranscriptView({ transcript, searchQuery }: { transcript: string; searchQuery: string }) {
  const lines = transcript.split('\n').filter(l => l.trim())
  const filtered = searchQuery ? lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase())) : lines

  if (searchQuery && filtered.length === 0) {
    return <p className="text-[13px] text-txt-muted">No matches for &ldquo;{searchQuery}&rdquo;</p>
  }

  return (
    <div className="space-y-2">
      {searchQuery && <p className="text-[11px] text-txt-muted mb-2">{filtered.length} matches</p>}
      {filtered.map((line, i) => {
        const match = line.match(/^(Speaker \d+|Rep|Seller|Agent|Customer|Unknown):\s*/i)
        const speaker = match?.[1] ?? null
        const content = speaker ? line.substring(match![0].length) : line
        const isRep = speaker?.toLowerCase().includes('rep') || speaker?.toLowerCase().includes('agent') || speaker === 'Speaker 0'

        return (
          <div key={i} className={`text-[13px] leading-relaxed ${speaker ? 'flex gap-2' : ''}`}>
            {speaker && (
              <span className={`text-[11px] font-medium shrink-0 mt-0.5 ${isRep ? 'text-semantic-blue' : 'text-gunner-red'}`}>
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
