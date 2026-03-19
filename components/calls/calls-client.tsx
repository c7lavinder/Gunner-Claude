'use client'
// components/calls/calls-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import { Phone, Filter, ChevronRight, Clock, ArrowDownLeft, ArrowUpRight as ArrowUpRightIcon } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Call {
  id: string; score: number | null; gradingStatus: string
  callType: string | null; direction: string; durationSeconds: number | null
  calledAt: string; aiSummary: string | null; aiFeedback: string | null
  assignedTo: { id: string; name: string; role: string } | null
  property: { id: string; address: string; city: string; state: string } | null
}

export function CallsClient({ calls, tenantSlug, canViewAll }: {
  calls: Call[]; tenantSlug: string; canViewAll: boolean
}) {
  const [filter, setFilter] = useState<'all' | 'great' | 'needs-work'>('all')

  const filtered = calls.filter((c) => {
    if (filter === 'all') return true
    if (filter === 'great') return (c.score ?? 0) >= 75
    if (filter === 'needs-work') return (c.score ?? 0) < 75 && c.gradingStatus === 'COMPLETED'
    return true
  })

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Call grading</h1>
          <p className="text-sm text-gray-400 mt-0.5">Every call scored automatically by AI</p>
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-1">
          {(['all', 'great', 'needs-work'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'great' ? 'Great (75+)' : 'Needs work'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatPill label="Total calls" value={String(calls.length)} />
        <StatPill
          label="Avg score"
          value={`${Math.round(calls.filter(c => c.score != null).reduce((s, c) => s + (c.score ?? 0), 0) / (calls.filter(c => c.score != null).length || 1))}%`}
        />
        <StatPill
          label="Graded"
          value={`${calls.filter(c => c.gradingStatus === 'COMPLETED').length}/${calls.length}`}
        />
      </div>

      {/* Call list */}
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl divide-y divide-white/5">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-500 text-sm">No calls match this filter</div>
        )}
        {filtered.map((call) => (
          <CallRow key={call.id} call={call} tenantSlug={tenantSlug} />
        ))}
      </div>
    </div>
  )
}

function CallRow({ call, tenantSlug }: { call: Call; tenantSlug: string }) {
  const score = call.score ?? 0
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const scoreBg = score >= 80 ? 'bg-green-500/10' : score >= 60 ? 'bg-yellow-500/10' : 'bg-red-500/10'

  const statusBadge: Record<string, string> = {
    COMPLETED: 'bg-green-500/10 text-green-400',
    PENDING: 'bg-gray-500/10 text-gray-400',
    PROCESSING: 'bg-blue-500/10 text-blue-400',
    FAILED: 'bg-red-500/10 text-red-400',
  }

  const formatDuration = (s: number | null) => {
    if (!s) return '—'
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <Link
      href={`/${tenantSlug}/calls/${call.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors"
    >
      {/* Score */}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
        call.gradingStatus === 'COMPLETED' ? `${scoreBg} ${scoreColor}` : 'bg-gray-500/10 text-gray-500'
      }`}>
        {call.gradingStatus === 'COMPLETED' ? score : call.gradingStatus === 'PROCESSING' ? '…' : '—'}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {call.property?.address ?? 'No property linked'}
          </span>
          {call.property && (
            <span className="text-xs text-gray-500 shrink-0">
              {call.property.city}, {call.property.state}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {call.assignedTo && (
            <span className="text-xs text-gray-400">{call.assignedTo.name}</span>
          )}
          {call.callType && (
            <span className="text-xs text-gray-500">{call.callType}</span>
          )}
          <span className="text-xs text-gray-600 flex items-center gap-1">
            {call.direction === 'INBOUND' ? <ArrowDownLeft size={10} /> : <ArrowUpRightIcon size={10} />}
            {call.direction.toLowerCase()}
          </span>
        </div>
        {call.aiSummary && (
          <p className="text-xs text-gray-500 mt-1 truncate">{call.aiSummary}</p>
        )}
      </div>

      {/* Meta */}
      <div className="text-right shrink-0 space-y-1">
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[call.gradingStatus]}`}>
          {call.gradingStatus.toLowerCase()}
        </span>
        <div className="flex items-center gap-2 justify-end text-xs text-gray-500">
          <Clock size={10} />
          {formatDuration(call.durationSeconds)}
        </div>
        <p className="text-xs text-gray-600">
          {formatDistanceToNow(new Date(call.calledAt), { addSuffix: true })}
        </p>
      </div>

      <ChevronRight size={14} className="text-gray-600 shrink-0" />
    </Link>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-xl px-4 py-3">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}
