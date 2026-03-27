'use client'

import { TrendingUp } from 'lucide-react'

export function KpiStatCard({
  label, value, prevValue, accent, isCurrency, showTrend = true,
}: {
  label: string
  value: number
  prevValue?: number
  accent?: string // tailwind border color class e.g. 'border-l-teal-400'
  isCurrency?: boolean
  showTrend?: boolean
}) {
  const formatted = isCurrency
    ? `$${value.toLocaleString()}`
    : value.toLocaleString()

  const prevFormatted = prevValue != null
    ? isCurrency ? `$${prevValue.toLocaleString()}` : prevValue.toLocaleString()
    : null

  return (
    <div className={`bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] px-4 py-3 min-w-[130px] flex-1 ${accent ? `border-l-[3px] ${accent}` : ''}`}>
      <div className="flex items-start justify-between">
        <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider">{label}</p>
        {showTrend ? (
          <TrendingUp size={12} className={accent ? 'text-teal-500' : 'text-txt-muted'} />
        ) : (
          <span className="text-[10px] text-txt-muted">—</span>
        )}
      </div>
      <p className="text-[22px] font-bold text-txt-primary mt-1 leading-none">{formatted}</p>
      {prevFormatted != null && (
        <p className="text-[10px] text-txt-muted mt-1">prev: {prevFormatted}</p>
      )}
    </div>
  )
}
