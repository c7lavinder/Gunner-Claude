'use client'

import { useState } from 'react'

export interface TableTab {
  key: string
  label: string
  columns: Array<{ key: string; label: string; align?: 'left' | 'right'; span?: number }>
  subColumns?: Array<{ key: string; label: string }> // for cross-tab sub-headers
  rows: Array<Record<string, string | number>>
  groupHeaders?: Array<{ label: string; span: number }> // for cross-tab group headers
}

export function KpiTable({ tabs }: { tabs: TableTab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? '')
  const tab = tabs.find(t => t.key === activeTab) ?? tabs[0]
  if (!tab) return null

  const hasCrossTab = !!tab.groupHeaders

  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
      {/* Tab pills */}
      <div className="px-5 pt-4 pb-2 flex items-center gap-1.5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1 text-[10px] font-semibold rounded-full transition-all ${
              activeTab === t.key
                ? 'bg-txt-primary text-white'
                : 'bg-surface-secondary text-txt-muted hover:text-txt-secondary'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          {/* Group headers for cross-tab */}
          {hasCrossTab && tab.groupHeaders && (
            <thead>
              <tr className="border-b border-[rgba(0,0,0,0.06)]">
                {/* First column: empty (for row labels) */}
                <th className="px-4 py-2 text-left text-[9px] font-semibold text-txt-muted uppercase tracking-wider sticky left-0 bg-white z-10" />
                {tab.groupHeaders.map((g, i) => (
                  <th key={i} colSpan={g.span}
                    className="px-2 py-2 text-center text-[9px] font-semibold text-txt-primary uppercase tracking-wider border-l border-[rgba(0,0,0,0.06)]">
                    {g.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}

          {/* Column headers */}
          <thead>
            <tr className="border-b border-[rgba(0,0,0,0.06)] bg-surface-secondary/50">
              {tab.columns.map(col => (
                <th key={col.key}
                  colSpan={col.span ?? 1}
                  className={`px-4 py-2 text-[9px] font-semibold text-txt-muted uppercase tracking-wider whitespace-nowrap ${
                    col.key === tab.columns[0].key ? 'sticky left-0 bg-surface-secondary/50 z-10 text-left' : ''
                  } ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {tab.rows.length === 0 ? (
              <tr>
                <td colSpan={tab.columns.length} className="px-4 py-8 text-center text-txt-muted text-ds-fine">
                  No data for current filters
                </td>
              </tr>
            ) : (
              tab.rows.map((row, i) => (
                <tr key={i} className="border-b border-[rgba(0,0,0,0.03)] hover:bg-surface-secondary/30 transition-colors">
                  {tab.columns.map(col => {
                    const val = row[col.key]
                    const isFirst = col.key === tab.columns[0].key
                    // Check for special badges
                    const isBadge = col.key === 'type'
                    const badgeColor = val === 'Inbound' ? 'bg-green-100 text-green-700' : val === 'Outbound' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'

                    return (
                      <td key={col.key}
                        className={`px-4 py-2.5 whitespace-nowrap ${
                          isFirst ? 'sticky left-0 bg-white z-10 font-semibold text-txt-primary' : 'text-txt-secondary'
                        } ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {isBadge ? (
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
                            {String(val)}
                          </span>
                        ) : (
                          String(val ?? '—')
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
