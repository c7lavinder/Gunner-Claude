'use client'
// components/disposition/journey/journey-section.tsx
// Shared chrome for one section of the Disposition Journey.
// Header: index + title + status pill + collapse chevron + optional summary.
// Body: rendered when expanded.

import { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SectionStatus } from '@/lib/disposition/journey-status'

const STATUS_LABEL: Record<SectionStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}

const STATUS_PILL_CLASS: Record<SectionStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}

export function JourneySection({
  index,
  title,
  status,
  summary,
  expanded,
  onToggle,
  children,
}: {
  index: 1 | 2 | 3 | 4 | 5
  title: string
  status: SectionStatus
  summary?: string  // one-line summary shown when collapsed
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <div className="border border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary/50 transition-colors"
      >
        <Chevron size={16} className="text-txt-secondary flex-shrink-0" />
        <span className="text-[11px] font-mono text-txt-muted">{index}.</span>
        <span className="font-medium text-txt-primary text-[14px] flex-1 uppercase tracking-wide">{title}</span>
        {!expanded && summary && (
          <span className="text-[12px] text-txt-secondary truncate hidden md:inline max-w-[400px]">
            {summary}
          </span>
        )}
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${STATUS_PILL_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[rgba(0,0,0,0.06)] p-5">
          {children}
        </div>
      )}
    </div>
  )
}
