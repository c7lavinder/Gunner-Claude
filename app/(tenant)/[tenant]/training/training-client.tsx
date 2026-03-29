'use client'
// app/(tenant)/[tenant]/training/training-client.tsx
// Training Hub UI — Design system: docs/DESIGN.md
// Layout: [Header] [Call of the Week] [2-col grid: Top Calls | Review Queue]

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

// ─── Helpers ──────────────────────────────────────────────────────────────

function scoreCircleStyle(score: number): string {
  if (score >= 90) return 'bg-semantic-green text-white'
  if (score >= 80) return 'bg-semantic-amber text-white'
  if (score >= 70) return 'bg-semantic-blue text-white'
  return 'bg-semantic-red text-white'
}

// ─── Component ────────────────────────────────────────────────────────────

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
      {/* Header */}
      <div>
        <h1 className="text-ds-page font-semibold text-txt-primary">Training</h1>
        <p className="text-ds-body text-txt-secondary mt-1">{totalGraded} calls graded — learn from the best, coach the rest</p>
      </div>

      {/* Call of the Week — win card: 2px left green border + green-bg */}
      <div
        className="bg-semantic-green-bg border-l-2 border-l-semantic-green border-[0.5px] border-black/[0.08] rounded-[14px] p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Crown size={16} className="text-semantic-green" />
          <h2 className="text-ds-label font-semibold text-semantic-green">Call of the Week</h2>
        </div>
        {callOfTheWeek ? (
          <Link href={`/${tenantSlug}/calls/${callOfTheWeek.id}`} className="block group">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-[14px] flex items-center justify-center shrink-0 ${scoreCircleStyle(callOfTheWeek.score)}`}>
                <span className="text-ds-section font-semibold">{callOfTheWeek.score}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-ds-label font-medium text-txt-primary">{callOfTheWeek.assignedTo}</p>
                  <span className="text-ds-fine text-txt-muted">{callOfTheWeek.assignedToRole.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
                {callOfTheWeek.property && (
                  <p className="text-ds-fine text-txt-muted mb-2">{callOfTheWeek.property}</p>
                )}
                <p className="text-ds-body text-txt-secondary line-clamp-2">{callOfTheWeek.feedback ?? callOfTheWeek.summary ?? 'No feedback available'}</p>
                <p className="text-ds-fine text-gunner-red mt-2 group-hover:text-gunner-red-dark flex items-center gap-1 font-medium">
                  Study this call <ArrowUpRight size={10} />
                </p>
              </div>
            </div>
          </Link>
        ) : (
          <p className="text-ds-body text-txt-muted">No calls graded this week yet. The highest scoring call will appear here.</p>
        )}
      </div>

      {/* 2-col grid: Top Calls | Review Queue */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Calls Library — win style: green left border */}
        <div className="bg-surface-primary border-l-2 border-l-semantic-green border-[0.5px] border-black/[0.08] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2">
              <Star size={14} className="text-semantic-green" />
              Top calls (70+)
            </h2>
            <span className="text-ds-fine text-txt-muted">{topCalls.length} calls</span>
          </div>
          {topCalls.length === 0 ? (
            <p className="text-ds-body text-txt-muted py-6 text-left">No calls scoring 70+ yet</p>
          ) : (
            <div className="space-y-1">
              {topCalls.map((call) => (
                <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
              ))}
            </div>
          )}
        </div>

        {/* Review Queue — issue style: red left border */}
        <div className="bg-surface-primary border-l-2 border-l-semantic-red border-[0.5px] border-black/[0.08] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ds-label font-medium text-txt-primary flex items-center gap-2">
              <AlertTriangle size={14} className="text-semantic-red" />
              <span>{isManager ? 'Review Queue' : 'Calls to improve'}</span>
              {isManager && reviewQueue.length > 0 && (
                <span className="ml-2 text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">{reviewQueue.length}</span>
              )}
            </h2>
            <span className="text-ds-fine text-txt-muted">{reviewQueue.length} calls</span>
          </div>
          {reviewQueue.length === 0 ? (
            <p className="text-ds-body text-txt-muted py-6 text-left">
              {isManager ? 'No calls under 50 — team is performing well' : 'Managers can see calls needing review here'}
            </p>
          ) : (
            <div className="space-y-1">
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

// ─── Call Row ─────────────────────────────────────────────────────────────

function CallRow({ call, tenantSlug }: { call: CallEntry; tenantSlug: string }) {
  const date = call.calledAt
    ? new Date(call.calledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  return (
    <Link
      href={`/${tenantSlug}/calls/${call.id}`}
      className="flex items-center gap-3 p-2.5 rounded-[10px] hover:bg-surface-secondary transition-colors"
    >
      {/* Score circle: 40px, colored bg, white text */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-ds-body font-semibold shrink-0 ${scoreCircleStyle(call.score)}`}>
        {call.score}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-ds-body text-txt-primary truncate">{call.assignedTo}</p>
        <p className="text-ds-fine text-txt-muted truncate">{call.summary ?? call.property ?? 'Graded call'}</p>
      </div>
      <span className="text-ds-fine text-txt-muted shrink-0">{date}</span>
    </Link>
  )
}
