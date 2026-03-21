'use client'
// components/calls/call-detail-client.tsx
// Two-column call detail: grade + audio + highlights | 4 tabs

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

function gradeLetter(score: number | null): { letter: string; color: string; bg: string } {
  if (score === null) return { letter: '—', color: 'text-gray-500', bg: 'bg-gray-500/10' }
  if (score >= 90) return { letter: 'A', color: 'text-green-400', bg: 'bg-green-500/15' }
  if (score >= 80) return { letter: 'B', color: 'text-blue-400', bg: 'bg-blue-500/15' }
  if (score >= 70) return { letter: 'C', color: 'text-yellow-400', bg: 'bg-yellow-500/15' }
  if (score >= 60) return { letter: 'D', color: 'text-orange-400', bg: 'bg-orange-500/15' }
  return { letter: 'F', color: 'text-red-400', bg: 'bg-red-500/15' }
}

function fmtDuration(s: number | null): string {
  if (!s) return '—'
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
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [generatedSteps, setGeneratedSteps] = useState<Array<{ type: string; label: string; reasoning: string }>>([])
  const [generatingSteps, setGeneratingSteps] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const { letter, color, bg } = gradeLetter(call.score)
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
      <Link href={`/${tenantSlug}/calls`} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to calls
      </Link>

      {/* Two-column layout */}
      <div className="grid md:grid-cols-5 gap-6">
        {/* ── LEFT COLUMN (2/5) ─────────────────────────────────── */}
        <div className="md:col-span-2 space-y-4">
          {/* Grade display */}
          <div className={`${bg} border border-white/10 rounded-2xl p-6 text-center`}>
            <div className={`text-7xl font-black ${color}`} style={{ textShadow: `0 0 30px currentColor` }}>
              {letter}
            </div>
            <p className="text-lg text-gray-400 mt-1">
              {call.score !== null ? `${Math.round(call.score)} / 100` : 'Not graded'}
            </p>
          </div>

          {/* Info pills */}
          <div className="flex flex-wrap gap-1.5">
            {call.callType && <Pill>{CALL_TYPES.find(ct => ct.id === call.callType)?.name ?? call.callType.replace(/_/g, ' ')}</Pill>}
            {outcome && <Pill>{RESULT_NAMES[outcome] ?? outcome.replace(/_/g, ' ')}</Pill>}
            <Pill>{call.direction.toLowerCase()}</Pill>
            <Pill>{fmtDuration(call.durationSeconds)}</Pill>
            {call.assignedTo && <Pill>{call.assignedTo.name}</Pill>}
            <Pill>{format(new Date(call.calledAt), 'MMM d, h:mm a')}</Pill>
          </div>

          {/* Property link */}
          {call.property ? (
            <Link href={`/${tenantSlug}/inventory/${call.property.id}`}
              className="block bg-[#1a1d27] border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 transition-colors">
              <p className="text-xs text-gray-500">Property</p>
              <p className="text-sm text-white">{call.property.address}, {call.property.city} {call.property.state}</p>
              {call.property.sellerName && <p className="text-xs text-gray-500 mt-0.5">{call.property.sellerName}</p>}
            </Link>
          ) : (
            <p className="text-xs text-gray-600 px-1">No property linked</p>
          )}

          {/* Audio player */}
          {call.recordingUrl && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4 space-y-3">
              <audio ref={audioRef} controls src={call.recordingUrl} className="w-full h-8" />
              <div className="flex gap-1.5">
                {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                  <button key={rate} onClick={() => changeSpeed(rate)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${playbackRate === rate ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Key moments / highlights */}
          {call.keyMoments.length > 0 && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-2">Key Moments</p>
              <div className="flex flex-wrap gap-1.5">
                {call.keyMoments.map((m, i) => {
                  const Icon = MOMENT_ICONS[m.type] ?? Zap
                  return (
                    <button key={i} onClick={() => seekTo(m.timestamp)}
                      className="flex items-center gap-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300 transition-colors">
                      <Icon size={10} className="text-orange-400 shrink-0" />
                      <span className="text-gray-500">{m.timestamp}</span>
                      <span className="truncate max-w-24">{m.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={reprocess} disabled={actionLoading === 'reprocess'}
              className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
              <RotateCcw size={10} /> Reprocess
            </button>
            <div className="relative">
              <button onClick={() => setReclassifying(!reclassifying)}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                <Tag size={10} /> Reclassify
              </button>
              {reclassifying && (
                <div className="absolute top-full left-0 mt-1 bg-[#1a1d27] border border-white/10 rounded-lg p-1 z-10 min-w-40">
                  {CALL_TYPES.map(ct => (
                    <button key={ct.id} onClick={() => reclassify(ct.id)}
                      className="block w-full text-left text-xs text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded">
                      {ct.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowFeedback(true)}
              className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
              <MessageSquare size={10} /> Feedback
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN (3/5) ────────────────────────────────── */}
        <div className="md:col-span-3 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1 w-fit">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-[#1a1d27] text-white' : 'text-gray-400 hover:text-white'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── Coaching tab ──────────────────────────────────── */}
          {tab === 'coaching' && (
            <div className="space-y-4">
              {call.aiSummary && (
                <Section title="Call Summary">
                  <p className="text-sm text-gray-300 leading-relaxed">{call.aiSummary}</p>
                </Section>
              )}
              {call.aiFeedback && (
                <Section title="AI Feedback">
                  <p className="text-sm text-gray-300 leading-relaxed">{call.aiFeedback}</p>
                </Section>
              )}
              {call.coachingTips.length > 0 && (
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5">
                  <h3 className="text-sm font-medium text-orange-400 flex items-center gap-2 mb-3"><Lightbulb size={14} /> What to Improve</h3>
                  <ul className="space-y-3">
                    {call.coachingTips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                        <span className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs text-orange-400 font-bold">{i + 1}</span>
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
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded shrink-0">{m.timestamp}</span>
                          <Icon size={12} className="text-orange-400 shrink-0 mt-0.5" />
                          <span className="text-gray-300">{m.description}</span>
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
                      <div key={i} className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Objection:</p>
                        <p className="text-sm text-gray-300 italic">"{obj.objection}"</p>
                        <p className="text-xs text-gray-500 mt-2 mb-1">Response:</p>
                        <p className="text-sm text-gray-300">{obj.response}</p>
                        <span className={`text-xs mt-1 inline-block ${obj.handled ? 'text-green-400' : 'text-red-400'}`}>
                          {obj.handled ? '✓ Handled' : '✗ Not handled'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              {(call.sentiment !== null || call.sellerMotivation !== null) && (
                <div className="grid grid-cols-2 gap-3">
                  {call.sentiment !== null && (
                    <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Sentiment</p>
                      <p className={`text-lg font-bold ${call.sentiment > 0.3 ? 'text-green-400' : call.sentiment > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {call.sentiment > 0.3 ? 'Positive' : call.sentiment > 0 ? 'Neutral' : 'Negative'}
                      </p>
                    </div>
                  )}
                  {call.sellerMotivation !== null && (
                    <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Seller Motivation</p>
                      <p className={`text-lg font-bold ${call.sellerMotivation > 0.6 ? 'text-green-400' : call.sellerMotivation > 0.3 ? 'text-yellow-400' : 'text-red-400'}`}>
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
                <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-5">
                  {Object.entries(call.rubricScores).map(([cat, data]) => {
                    const pct = data.maxScore > 0 ? Math.round((data.score / data.maxScore) * 100) : 0
                    const barColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-300 font-medium">{cat}</span>
                          <span className="text-sm font-bold text-white">{data.score}<span className="text-gray-500 font-normal">/{data.maxScore}</span></span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        {data.notes && <p className="text-xs text-gray-500 mt-1.5">{data.notes}</p>}
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
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search transcript..." className="w-full bg-[#0f1117] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                  </div>
                  <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 max-h-[500px] overflow-y-auto">
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
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
                  <h3 className="text-sm font-medium text-blue-400 flex items-center gap-2 mb-2"><Zap size={14} /> AI Recommended Action</h3>
                  <p className="text-sm text-gray-300">{call.nextBestAction}</p>
                </div>
              )}

              {/* Generate AI steps */}
              {generatedSteps.length === 0 && (
                <button onClick={generateNextSteps} disabled={generatingSteps}
                  className="w-full bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/20 text-orange-400 text-sm font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {generatingSteps ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Zap size={14} /> Generate AI Next Steps</>}
                </button>
              )}

              {generatedSteps.length > 0 && (
                <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-medium text-white mb-2">AI-Generated Steps</h3>
                  {generatedSteps.map((step, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-3">
                      <p className="text-sm text-white font-medium">{step.label}</p>
                      <p className="text-xs text-gray-500 italic mt-1">{step.reasoning}</p>
                      <span className="text-xs text-gray-600 mt-1 inline-block">{step.type.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-medium text-white mb-3">Quick Actions</h3>
                <QuickAction icon={<FileText size={14} />} label="Add call note to GHL" type="add_note" loading={actionLoading} onAction={quickAction} />
                <QuickAction icon={<CheckCircle size={14} />} label="Create follow-up task" type="create_task" loading={actionLoading} onAction={quickAction} />
                <QuickAction icon={<Send size={14} />} label="Send follow-up SMS" type="send_sms" loading={actionLoading} onAction={quickAction} />
              </div>

              {call.property && (
                <Link href={`/${tenantSlug}/inventory/${call.property.id}`}
                  className="flex items-center justify-between bg-[#1a1d27] border border-white/10 hover:border-white/20 rounded-2xl px-5 py-4 transition-colors">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">View Property</p>
                    <p className="text-sm text-white">{call.property.address}, {call.property.city} {call.property.state}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-500" />
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

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-full">{children}</span>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-white mb-3">{title}</h3>
      {children}
    </div>
  )
}

function EmptyTab({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) {
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8 text-center">
      <div className="text-gray-600 mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-sm text-gray-500">{message}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
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
    <button onClick={handle} disabled={isLoading}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-gray-400">
        {status === 'done' ? <CheckCircle size={14} className="text-green-400" /> : isLoading ? <Loader2 size={14} className="animate-spin" /> : icon}
      </div>
      <p className="text-sm text-white font-medium flex-1">
        {status === 'confirm' ? `Confirm: ${label}?` : status === 'done' ? 'Done!' : label}
      </p>
      {status === 'confirm' && <span className="text-xs text-orange-400 shrink-0">Click to confirm</span>}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
            <p className="text-sm text-white">Thank you — feedback submitted</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">Submit Feedback</h3>
              <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={14} /></button>
            </div>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none">
              {feedbackTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4} placeholder="Describe the issue (min 10 characters)..."
              className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 mb-3 focus:outline-none resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-3 py-2">Cancel</button>
              <button onClick={submit} disabled={details.length < 10 || submitting}
                className="text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg">
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
    return <p className="text-sm text-gray-500">No matches for &ldquo;{searchQuery}&rdquo;</p>
  }

  return (
    <div className="space-y-2">
      {searchQuery && <p className="text-xs text-gray-500 mb-2">{filtered.length} matches</p>}
      {filtered.map((line, i) => {
        const match = line.match(/^(Speaker \d+|Rep|Seller|Agent|Customer|Unknown):\s*/i)
        const speaker = match?.[1] ?? null
        const content = speaker ? line.substring(match![0].length) : line
        const isRep = speaker?.toLowerCase().includes('rep') || speaker?.toLowerCase().includes('agent') || speaker === 'Speaker 0'

        return (
          <div key={i} className={`text-sm leading-relaxed ${speaker ? 'flex gap-2' : ''}`}>
            {speaker && (
              <span className={`text-xs font-medium shrink-0 mt-0.5 ${isRep ? 'text-blue-400' : 'text-orange-400'}`}>{speaker}:</span>
            )}
            <span className="text-gray-300">
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
    regex.test(part) ? <mark key={i} className="bg-orange-500/30 text-orange-300 rounded px-0.5">{part}</mark> : part
  )
}
