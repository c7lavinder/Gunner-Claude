'use client'

export interface FunnelStage {
  label: string
  count: number
  color: string      // e.g. 'blue', 'orange', 'purple', 'green', 'red'
}

const COLOR_MAP: Record<string, { fill: string; bg: string; text: string }> = {
  blue:   { fill: 'bg-blue-400',   bg: 'bg-blue-100',   text: 'text-blue-600' },
  orange: { fill: 'bg-orange-400', bg: 'bg-orange-100', text: 'text-orange-600' },
  purple: { fill: 'bg-purple-400', bg: 'bg-purple-100', text: 'text-purple-600' },
  green:  { fill: 'bg-green-400',  bg: 'bg-green-100',  text: 'text-green-600' },
  red:    { fill: 'bg-red-400',    bg: 'bg-red-100',    text: 'text-red-600' },
}

export function KpiFunnel({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(...stages.map(s => s.count), 1)

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-5">
      <p className="text-[9px] font-semibold text-txt-muted uppercase tracking-wider mb-4">Pipeline Funnel</p>

      <div className="flex gap-3 items-end">
        {stages.map((stage, i) => {
          const prev = i > 0 ? stages[i - 1].count : 0
          const conversion = prev > 0 ? ((stage.count / prev) * 100).toFixed(1) : null
          const c = COLOR_MAP[stage.color] ?? COLOR_MAP.blue
          const fillPct = maxCount > 0 ? Math.max((stage.count / maxCount) * 100, 4) : 4

          if (i === 0) {
            // First stage: large box
            return (
              <div key={stage.label} className="flex flex-col items-center flex-1">
                <div className={`w-full aspect-square max-h-[120px] rounded-[10px] ${c.fill} flex items-center justify-center`}>
                  <span className="text-white text-[24px] font-bold">{stage.count}</span>
                </div>
                <p className="text-[10px] text-txt-muted mt-2 text-center">{stage.label}</p>
              </div>
            )
          }

          return (
            <div key={stage.label} className="flex flex-col items-center flex-1">
              {/* Conversion % */}
              <p className={`text-[10px] font-semibold ${c.text} mb-1`}>
                {conversion != null ? `${conversion}%` : ''}
              </p>
              {/* Bar */}
              <div className={`w-full h-[44px] ${c.bg} rounded-[8px] relative overflow-hidden`}>
                <div
                  className={`absolute left-0 top-0 bottom-0 ${c.fill} rounded-[8px] transition-all`}
                  style={{ width: `${fillPct}%` }}
                />
                <span className={`absolute inset-0 flex items-center justify-center text-ds-body font-bold ${c.text} z-10`}>
                  {stage.count}
                </span>
              </div>
              <p className="text-[10px] text-txt-muted mt-2 text-center">{stage.label}</p>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-txt-muted mt-4 text-center">Click any stage to see property details</p>
    </div>
  )
}
