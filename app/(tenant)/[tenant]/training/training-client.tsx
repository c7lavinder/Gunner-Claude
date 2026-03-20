'use client'
// app/(tenant)/[tenant]/training/training-client.tsx
// Training Hub UI — Call of the Week, top calls library, review queue

import Link from 'next/link'
import { Trophy, Star, AlertTriangle, Phone, ArrowUpRight, Crown } from 'lucide-react'

interface CallEntry {
  id: string; score: number; summary: string | null
  assignedTo: string; property: string | null
  calledAt: string | null; direction: string
}

interface CallOfWeek extends CallEntry {
  feedback: string | null; assignedToRole: string
}

export function TrainingClient({
  tenantSlug, isManager, callOfTheWeek, topCalls, reviewQueue, totalGraded,
}: {
  tenantSlug: string
  isManager: boolean
  callOfTheWeek: CallOfWeek | null
  topCalls: CallEntry[]
  reviewQueue: CallEntry[]
  totalGraded: number
}) {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Training Hub</h1>
        <p className="text-sm text-gray-400 mt-0.5">{totalGraded} calls graded — learn from the best, coach the rest</p>
      </div>

      {/* Call of the Week */}
      <div className="bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 border border-yellow-500/20 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Crown size={16} className="text-yellow-400" />
          <h2 className="text-sm font-medium text-yellow-400">Call of the Week</h2>
        </div>
        {callOfTheWeek ? (
          <Link href={`/${tenantSlug}/calls/${callOfTheWeek.id}`} className="block group">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-yellow-400">{callOfTheWeek.score}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-white font-medium">{callOfTheWeek.assignedTo}</p>
                  <span className="text-xs text-gray-500">{callOfTheWeek.assignedToRole.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
                {callOfTheWeek.property && (
                  <p className="text-xs text-gray-500 mb-2">{callOfTheWeek.property}</p>
                )}
                <p className="text-sm text-gray-300 line-clamp-2">{callOfTheWeek.feedback ?? callOfTheWeek.summary ?? 'No feedback available'}</p>
                <p className="text-xs text-orange-400 mt-2 group-hover:text-orange-300 flex items-center gap-1">
                  Study this call <ArrowUpRight size={10} />
                </p>
              </div>
            </div>
          </Link>
        ) : (
          <p className="text-sm text-gray-500">No calls graded this week yet. The highest scoring call will appear here.</p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Calls Library */}
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <Star size={14} className="text-green-400" />
              Top calls (70+)
            </h2>
            <span className="text-xs text-gray-600">{topCalls.length} calls</span>
          </div>
          {topCalls.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No calls scoring 70+ yet</p>
          ) : (
            <div className="space-y-1.5">
              {topCalls.map((call) => (
                <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
              ))}
            </div>
          )}
        </div>

        {/* Review Queue — managers only */}
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              {isManager ? 'Review queue (under 50)' : 'Calls to improve'}
            </h2>
            <span className="text-xs text-gray-600">{reviewQueue.length} calls</span>
          </div>
          {reviewQueue.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {isManager ? 'No calls under 50 — team is performing well' : 'Managers can see calls needing review here'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {reviewQueue.map((call) => (
                <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CallRow({ call, tenantSlug }: { call: CallEntry; tenantSlug: string }) {
  const scoreColor = call.score >= 80 ? 'text-green-400 bg-green-500/10' :
    call.score >= 60 ? 'text-yellow-400 bg-yellow-500/10' :
    'text-red-400 bg-red-500/10'

  const date = call.calledAt ? new Date(call.calledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  return (
    <Link
      href={`/${tenantSlug}/calls/${call.id}`}
      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 ${scoreColor}`}>
        {call.score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{call.assignedTo}</p>
        <p className="text-xs text-gray-600 truncate">{call.summary ?? call.property ?? 'Graded call'}</p>
      </div>
      <span className="text-xs text-gray-600 shrink-0">{date}</span>
    </Link>
  )
}
