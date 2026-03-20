// components/calls/call-detail-client.tsx
// 4-tab call detail layout: Rubric, Coaching, Transcript, Next Steps

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Phone, Clock, Star, Lightbulb, FileText, Zap, ChevronRight, Search, Mic, CheckCircle, Send } from 'lucide-react'
import { format } from 'date-fns'

interface RubricScore {
  score: number
  maxScore: number
  notes: string
}

interface KeyMoment {
  timestamp: string
  type: string
  description: string
}

interface CallDetail {
  id: string
  score: number | null
  gradingStatus: string
  callType: string | null
  callOutcome: string | null
  direction: string
  durationSeconds: number | null
  calledAt: string
  recordingUrl: string | null
  transcript: string | null
  aiSummary: string | null
  aiFeedback: string | null
  sentiment: number | null
  sellerMotivation: number | null
  nextBestAction: string | null
  keyMoments: KeyMoment[]
  rubricScores: Record<string, RubricScore>
  coachingTips: string[]
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string; status: string; sellerName: string | null } | null
}

type Tab = 'rubric' | 'coaching' | 'transcript' | 'next-steps'

export function CallDetailClient({
  call, tenantSlug, isOwn,
}: {
  call: CallDetail
  tenantSlug: string
  isOwn: boolean
}) {
  const [tab, setTab] = useState<Tab>('rubric')
  const [searchQuery, setSearchQuery] = useState('')

  const score = call.score ?? 0
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : score >= 50 ? 'text-orange-400' : 'text-red-400'
  const scoreBg = score >= 80 ? 'bg-green-500/10 border-green-500/20' : score >= 60 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-orange-500/10 border-orange-500/20'

  const fmt = (s: number | null) => {
    if (!s) return '—'
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const rubricEntries = Object.entries(call.rubricScores)
  const totalMax = rubricEntries.reduce((s, [, v]) => s + v.maxScore, 0)

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'rubric', label: 'Rubric', icon: <Star size={14} /> },
    { id: 'coaching', label: 'Coaching', icon: <Lightbulb size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'next-steps', label: 'Next Steps', icon: <Zap size={14} /> },
  ]

  return (
    <div className="max-w-3xl space-y-5">
      {/* Back */}
      <Link
        href={`/${tenantSlug}/calls`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={14} /> Back to calls
      </Link>

      {/* Score hero */}
      <div className={`bg-[#1a1d27] border rounded-2xl p-5 ${scoreBg}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Phone size={14} className="text-gray-400" />
              <span className="text-xs text-gray-400">
                {call.direction.toLowerCase()} · {call.callType ?? 'call'} · {fmt(call.durationSeconds)}
                {call.callOutcome && ` · ${call.callOutcome.replace(/_/g, ' ')}`}
              </span>
            </div>
            <p className="text-white font-medium">
              {call.property?.address ?? 'No property linked'}
            </p>
            {call.property && (
              <p className="text-xs text-gray-500 mt-0.5">
                {call.property.city}, {call.property.state}
                {call.property.sellerName && ` · ${call.property.sellerName}`}
              </p>
            )}
            {call.assignedTo && (
              <p className="text-xs text-gray-500 mt-2">{call.assignedTo.name} · {call.assignedTo.role.replace(/_/g, ' ').toLowerCase()}</p>
            )}
            <p className="text-xs text-gray-600 mt-1">
              {format(new Date(call.calledAt), 'MMM d, yyyy h:mm a')}
            </p>
          </div>

          {call.gradingStatus === 'COMPLETED' && (
            <div className="text-center shrink-0">
              <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
              <div className="text-xs text-gray-500 mt-1">/ {totalMax || 100}</div>
            </div>
          )}

          {call.gradingStatus === 'PENDING' && (
            <div className="text-sm text-gray-500 shrink-0">Grading pending…</div>
          )}
          {call.gradingStatus === 'PROCESSING' && (
            <div className="text-sm text-blue-400 shrink-0">Grading in progress</div>
          )}
        </div>

        {/* Summary — always visible */}
        {call.aiSummary && (
          <p className="text-sm text-gray-300 mt-4 leading-relaxed">{call.aiSummary}</p>
        )}

        {/* Recording player */}
        {call.recordingUrl && (
          <div className="mt-4">
            <audio controls src={call.recordingUrl} className="w-full accent-orange-500 h-8" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition-colors ${
              tab === t.id ? 'bg-[#1a1d27] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Rubric ────────────────────────────────────────────── */}
      {tab === 'rubric' && (
        <div className="space-y-4">
          {rubricEntries.length > 0 ? (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-5">
              {rubricEntries.map(([category, data]) => {
                const pct = data.maxScore > 0 ? Math.round((data.score / data.maxScore) * 100) : 0
                const barColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-500'
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-300 font-medium">{category}</span>
                      <span className="text-sm font-bold text-white">
                        {data.score}<span className="text-gray-500 font-normal">/{data.maxScore}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {data.notes && (
                      <p className="text-xs text-gray-500 mt-1.5">{data.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8 text-center">
              <Star size={24} className="text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No rubric breakdown available for this call</p>
            </div>
          )}

          {/* Sentiment + Motivation indicators */}
          {(call.sentiment !== null || call.sellerMotivation !== null) && (
            <div className="grid grid-cols-2 gap-3">
              {call.sentiment !== null && (
                <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Call Sentiment</p>
                  <p className={`text-lg font-bold ${call.sentiment > 0.3 ? 'text-green-400' : call.sentiment > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {call.sentiment > 0.3 ? 'Positive' : call.sentiment > 0 ? 'Neutral' : 'Negative'}
                  </p>
                  <p className="text-xs text-gray-600">{(call.sentiment * 100).toFixed(0)}%</p>
                </div>
              )}
              {call.sellerMotivation !== null && (
                <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Seller Motivation</p>
                  <p className={`text-lg font-bold ${call.sellerMotivation > 0.6 ? 'text-green-400' : call.sellerMotivation > 0.3 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {call.sellerMotivation > 0.6 ? 'High' : call.sellerMotivation > 0.3 ? 'Medium' : 'Low'}
                  </p>
                  <p className="text-xs text-gray-600">{(call.sellerMotivation * 100).toFixed(0)}%</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Coaching ──────────────────────────────────────────── */}
      {tab === 'coaching' && (
        <div className="space-y-4">
          {/* Detailed feedback */}
          {call.aiFeedback && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
                <Star size={14} className="text-yellow-400" /> Detailed Feedback
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">{call.aiFeedback}</p>
            </div>
          )}

          {/* Coaching tips */}
          {call.coachingTips.length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-orange-400 flex items-center gap-2 mb-3">
                <Lightbulb size={14} /> What to Improve
              </h3>
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

          {/* Key moments */}
          {call.keyMoments.length > 0 && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
                <Clock size={14} className="text-blue-400" /> Key Moments
              </h3>
              <div className="space-y-2">
                {call.keyMoments.map((moment, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded shrink-0">{moment.timestamp}</span>
                    <span className="text-gray-300">{moment.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!call.aiFeedback && call.coachingTips.length === 0 && (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8 text-center">
              <Lightbulb size={24} className="text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No coaching data available yet</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: Transcript ────────────────────────────────────────── */}
      {tab === 'transcript' && (
        <div className="space-y-4">
          {call.transcript ? (
            <>
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transcript..."
                  className="w-full bg-[#0f1117] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Transcript body */}
              <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 max-h-[500px] overflow-y-auto">
                <TranscriptView transcript={call.transcript} searchQuery={searchQuery} />
              </div>
            </>
          ) : (
            <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8 text-center">
              <Mic size={24} className="text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No transcript available</p>
              <p className="text-xs text-gray-600 mt-1">Transcripts are generated from call recordings when available</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: Next Steps ────────────────────────────────────────── */}
      {tab === 'next-steps' && (
        <div className="space-y-4">
          {/* AI suggested next action */}
          {call.nextBestAction && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-blue-400 flex items-center gap-2 mb-2">
                <Zap size={14} /> AI Recommended Action
              </h3>
              <p className="text-sm text-gray-300">{call.nextBestAction}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-medium text-white mb-3">Quick Actions</h3>

            <ActionButton
              icon={<Phone size={14} />}
              label="Schedule follow-up call"
              description="Create a task in GHL for a follow-up call"
              tenantSlug={tenantSlug}
              callId={call.id}
              actionType="follow_up_call"
            />
            <ActionButton
              icon={<Send size={14} />}
              label="Send follow-up SMS"
              description="Queue an SMS to the seller via GHL"
              tenantSlug={tenantSlug}
              callId={call.id}
              actionType="follow_up_sms"
            />
            <ActionButton
              icon={<FileText size={14} />}
              label="Add note to GHL contact"
              description="Add a call summary note to the GHL contact record"
              tenantSlug={tenantSlug}
              callId={call.id}
              actionType="add_note"
            />
            <ActionButton
              icon={<CheckCircle size={14} />}
              label="Set appointment"
              description="Create an appointment in GHL calendar"
              tenantSlug={tenantSlug}
              callId={call.id}
              actionType="set_appointment"
            />
          </div>

          {/* Link to property */}
          {call.property && (
            <Link
              href={`/${tenantSlug}/inventory/${call.property.id}`}
              className="flex items-center justify-between bg-[#1a1d27] border border-white/10 hover:border-white/20 rounded-2xl px-5 py-4 transition-colors"
            >
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
  )
}

// ─── Transcript viewer with search highlighting ─────────────────────────────

function TranscriptView({ transcript, searchQuery }: { transcript: string; searchQuery: string }) {
  const lines = transcript.split('\n').filter(l => l.trim())

  if (searchQuery) {
    const filtered = lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase()))
    if (filtered.length === 0) {
      return <p className="text-sm text-gray-500">No matches found for &ldquo;{searchQuery}&rdquo;</p>
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500 mb-3">{filtered.length} matches</p>
        {filtered.map((line, i) => (
          <TranscriptLine key={i} line={line} highlight={searchQuery} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <TranscriptLine key={i} line={line} />
      ))}
    </div>
  )
}

function TranscriptLine({ line, highlight }: { line: string; highlight?: string }) {
  // Detect speaker labels like "Speaker 0:" or "Rep:" or "Seller:"
  const speakerMatch = line.match(/^(Speaker \d+|Rep|Seller|Agent|Customer|Unknown):\s*/i)
  const speaker = speakerMatch?.[1] ?? null
  const content = speaker ? line.substring(speakerMatch![0].length) : line
  const isRep = speaker?.toLowerCase().includes('rep') || speaker?.toLowerCase().includes('agent') || speaker === 'Speaker 0'

  const renderContent = (text: string) => {
    if (!highlight) return text
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-orange-500/30 text-orange-300 rounded px-0.5">{part}</mark>
        : part
    )
  }

  return (
    <div className={`text-sm leading-relaxed ${speaker ? 'flex gap-2' : ''}`}>
      {speaker && (
        <span className={`text-xs font-medium shrink-0 mt-0.5 ${isRep ? 'text-blue-400' : 'text-orange-400'}`}>
          {speaker}:
        </span>
      )}
      <span className="text-gray-300">{renderContent(content)}</span>
    </div>
  )
}

// ─── Action button (Next Steps tab) ─────────────────────────────────────────

function ActionButton({
  icon, label, description, tenantSlug, callId, actionType,
}: {
  icon: React.ReactNode
  label: string
  description: string
  tenantSlug: string
  callId: string
  actionType: string
}) {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'sending' | 'sent'>('idle')

  async function handleAction() {
    if (status === 'idle') {
      setStatus('confirming')
      return
    }
    if (status === 'confirming') {
      setStatus('sending')
      try {
        await fetch(`/api/ghl/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId, actionType }),
        })
        setStatus('sent')
        setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('idle')
      }
    }
  }

  return (
    <button
      onClick={handleAction}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-gray-400">
        {status === 'sent' ? <CheckCircle size={14} className="text-green-400" /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium">
          {status === 'confirming' ? `Confirm: ${label}?` : status === 'sending' ? 'Sending...' : status === 'sent' ? 'Done!' : label}
        </p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {status === 'idle' && <ChevronRight size={14} className="text-gray-500 shrink-0" />}
      {status === 'confirming' && <span className="text-xs text-orange-400 font-medium shrink-0">Click to confirm</span>}
    </button>
  )
}
