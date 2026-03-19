'use client'
// components/calls/call-detail-client.tsx

import Link from 'next/link'
import { ArrowLeft, Phone, Clock, Star, Lightbulb, FileText, Mic, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface RubricScore {
  score: number
  maxScore: number
  notes: string
}

interface CallDetail {
  id: string
  score: number | null
  gradingStatus: string
  callType: string | null
  direction: string
  durationSeconds: number | null
  calledAt: string
  recordingUrl: string | null
  transcript: string | null
  aiSummary: string | null
  aiFeedback: string | null
  rubricScores: Record<string, RubricScore>
  coachingTips: string[]
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string; status: string; sellerName: string | null } | null
}

export function CallDetailClient({
  call, tenantSlug, isOwn,
}: {
  call: CallDetail
  tenantSlug: string
  isOwn: boolean
}) {
  const score = call.score ?? 0
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const scoreBg = score >= 80 ? 'bg-green-500/10 border-green-500/20' : score >= 60 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20'
  const scoreLabel = score >= 80 ? 'Great call' : score >= 70 ? 'Good call' : score >= 60 ? 'Needs improvement' : 'Needs focus'

  const fmt = (s: number | null) => {
    if (!s) return '—'
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const rubricEntries = Object.entries(call.rubricScores)
  const totalMax = rubricEntries.reduce((s, [, v]) => s + v.maxScore, 0)

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back */}
      <Link
        href={`/${tenantSlug}/calls`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={14} /> Back to calls
      </Link>

      {/* Score hero */}
      <div className={`bg-[#1a1d27] border rounded-2xl p-6 ${scoreBg}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Phone size={14} className="text-gray-400" />
              <span className="text-xs text-gray-400">
                {call.direction.toLowerCase()} · {call.callType ?? 'call'} · {fmt(call.durationSeconds)}
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
              <p className="text-xs text-gray-500 mt-2">{call.assignedTo.name}</p>
            )}
            <p className="text-xs text-gray-600 mt-1">
              {format(new Date(call.calledAt), 'MMM d, yyyy h:mm a')}
            </p>
          </div>

          {/* Score circle */}
          {call.gradingStatus === 'COMPLETED' && (
            <div className="text-center shrink-0">
              <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
              <div className="text-xs text-gray-500 mt-1">/ {totalMax || 100}</div>
              <div className={`text-xs mt-1 font-medium ${scoreColor}`}>{scoreLabel}</div>
            </div>
          )}

          {call.gradingStatus === 'PENDING' && (
            <div className="text-center shrink-0">
              <div className="text-sm text-gray-500">Grading pending…</div>
            </div>
          )}

          {call.gradingStatus === 'PROCESSING' && (
            <div className="text-center shrink-0">
              <div className="text-sm text-blue-400">Grading in progress</div>
            </div>
          )}
        </div>
      </div>

      {/* Recording */}
      {call.recordingUrl && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
            <Mic size={14} className="text-orange-500" /> Recording
          </h2>
          <audio controls src={call.recordingUrl} className="w-full accent-orange-500" />
        </div>
      )}

      {/* AI Summary */}
      {call.aiSummary && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
            <FileText size={14} className="text-blue-400" /> Call summary
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">{call.aiSummary}</p>
        </div>
      )}

      {/* Rubric scores */}
      {rubricEntries.length > 0 && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
            <Star size={14} className="text-orange-500" /> Score breakdown
          </h2>
          <div className="space-y-4">
            {rubricEntries.map(([category, data]) => {
              const pct = Math.round((data.score / data.maxScore) * 100)
              const barColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-300">{category}</span>
                    <span className="text-sm font-medium text-white">
                      {data.score}
                      <span className="text-gray-500 font-normal">/{data.maxScore}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor} transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {data.notes && (
                    <p className="text-xs text-gray-500 mt-1">{data.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI Feedback */}
      {call.aiFeedback && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
            <Star size={14} className="text-yellow-400" /> Detailed feedback
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">{call.aiFeedback}</p>
        </div>
      )}

      {/* Coaching tips */}
      {call.coachingTips.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-orange-400 flex items-center gap-2 mb-3">
            <Lightbulb size={14} /> Coaching tips
          </h2>
          <ul className="space-y-2">
            {call.coachingTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <ChevronRight size={14} className="text-orange-500 mt-0.5 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript */}
      {call.transcript && (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
            <FileText size={14} className="text-gray-400" /> Transcript
          </h2>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed font-sans max-h-64 overflow-y-auto">
            {call.transcript}
          </pre>
        </div>
      )}

      {/* Link to property */}
      {call.property && (
        <Link
          href={`/${tenantSlug}/inventory/${call.property.id}`}
          className="flex items-center justify-between bg-[#1a1d27] border border-white/10 hover:border-white/20 rounded-2xl px-5 py-4 transition-colors"
        >
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Property</p>
            <p className="text-sm text-white">{call.property.address}</p>
          </div>
          <ChevronRight size={14} className="text-gray-500" />
        </Link>
      )}
    </div>
  )
}
