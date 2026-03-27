'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { KpiStatCard } from './KpiStatCard'
import { KpiFunnel, type FunnelStage } from './KpiFunnel'
import { KpiTable, type TableTab } from './KpiTable'

interface KpiProperty {
  id: string
  status: string
  leadSource: string | null
  propertyMarkets: string[]
  projectType: string[]
  assignmentFee: number | null
  finalProfit: number | null
  createdAt: string
}

// ─── Stage Groupings ──────────────────────────────────────────────────────────

const ACQ_STAGES = [
  { key: 'lead', label: 'Lead', statuses: ['NEW_LEAD', 'CONTACTED', 'FOLLOW_UP'] },
  { key: 'aptSet', label: 'Apt Set', statuses: ['APPOINTMENT_SET', 'APPOINTMENT_COMPLETED'] },
  { key: 'offerMade', label: 'Offer Made', statuses: ['OFFER_MADE'] },
  { key: 'underContract', label: 'Under Contract', statuses: ['UNDER_CONTRACT'] },
  { key: 'closed', label: 'Closed', statuses: ['SOLD'] },
]

const DISPO_STAGES = [
  { key: 'newDeal', label: 'New Deal', statuses: ['IN_DISPOSITION'] },
  { key: 'pushedOut', label: 'Pushed Out', statuses: ['DISPO_PUSHED'] },
  { key: 'offers', label: 'Offers', statuses: ['DISPO_OFFERS'] },
  { key: 'contracted', label: 'Contracted', statuses: ['DISPO_CONTRACTED'] },
  { key: 'closed', label: 'Closed', statuses: ['DISPO_CLOSED'] },
]

const ACQ_ALL_STATUSES = ACQ_STAGES.flatMap(s => s.statuses)
const DISPO_ALL_STATUSES = DISPO_STAGES.flatMap(s => s.statuses)

const FUNNEL_COLORS = ['blue', 'orange', 'purple', 'green', 'red']

const INBOUND_SOURCES = ['PPL', 'PPC', 'SEO', 'Form', 'Texts']
const OUTBOUND_SOURCES = ['Cold Calling', 'Cold SMS', 'Direct Mail', 'JV', 'Dialer']

const MARKETS = ['Nashville', 'Global', 'Columbia', 'Knoxville', 'Chattanooga']

const TIME_PERIODS = [
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'all', label: 'All Time' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTimeRange(period: string): { start: Date; end: Date } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  switch (period) {
    case 'month': return { start: new Date(y, m, 1), end: now }
    case 'lastMonth': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) }
    case 'quarter': {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1)
      return { start: qStart, end: now }
    }
    default: return { start: new Date(2000, 0, 1), end: now }
  }
}

function fmt$(n: number): string { return `$${n.toLocaleString()}` }
function pct(count: number, total: number): string {
  if (total === 0) return '0%'
  return `${((count / total) * 100).toFixed(0)}%`
}
function countPct(count: number, total: number): string {
  return `${count} (${pct(count, total)})`
}

function sumRevenue(props: KpiProperty[]): number {
  return props.reduce((s, p) => s + (p.finalProfit ?? p.assignmentFee ?? 0), 0)
}

// Cumulative stage count: a property at stage N counts in stages 0..N
function cumulativeCounts(
  props: KpiProperty[],
  stages: typeof ACQ_STAGES,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of stages) counts[s.key] = 0
  for (const p of props) {
    const idx = stages.findIndex(s => s.statuses.includes(p.status))
    if (idx < 0) continue
    for (let i = 0; i <= idx; i++) counts[stages[i].key]++
  }
  return counts
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KpiDashboard({ properties, tenantSlug }: { properties: KpiProperty[]; tenantSlug: string }) {
  const [timePeriod, setTimePeriod] = useState('all')
  const [marketFilter, setMarketFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const { start, end } = getTimeRange(timePeriod)
    return properties.filter(p => {
      const d = new Date(p.createdAt)
      if (d < start || d > end) return false
      if (marketFilter !== 'all' && !p.propertyMarkets.includes(marketFilter)) return false
      // Source filter only for acquisition
      return true
    })
  }, [properties, timePeriod, marketFilter])

  // Acquisition properties (with source filter applied)
  const acqFiltered = useMemo(() => {
    const acq = filtered.filter(p => ACQ_ALL_STATUSES.includes(p.status))
    if (sourceFilter === 'all') return acq
    if (sourceFilter === '__none__') return acq.filter(p => !p.leadSource)
    return acq.filter(p => p.leadSource === sourceFilter)
  }, [filtered, sourceFilter])

  // Disposition properties (source filter does NOT apply)
  const dispoFiltered = useMemo(() => {
    return filtered.filter(p => DISPO_ALL_STATUSES.includes(p.status))
  }, [filtered])

  // ── Data Quality ────────────────────────────────────────────────────────────
  const missingSource = properties.filter(p => !p.leadSource && ACQ_ALL_STATUSES.includes(p.status)).length
  const missingMarket = properties.filter(p => p.propertyMarkets.length === 0).length

  // ── Acquisition Counts (cumulative: Offer Made also counts in Lead + Apt Set)
  const acqCounts = useMemo(() => cumulativeCounts(acqFiltered, ACQ_STAGES), [acqFiltered])

  const acqRevenue = useMemo(() => sumRevenue(acqFiltered.filter(p => p.status === 'SOLD')), [acqFiltered])

  const acqFunnelStages: FunnelStage[] = ACQ_STAGES.map((s, i) => ({
    label: s.label, count: acqCounts[s.key], color: FUNNEL_COLORS[i],
  }))

  // ── Disposition Counts (cumulative: Contracted also counts in New Deal, Pushed Out, Offers)
  const dispoCounts = useMemo(() => cumulativeCounts(dispoFiltered, DISPO_STAGES), [dispoFiltered])

  const dispoRevenue = useMemo(() => sumRevenue(dispoFiltered.filter(p => p.status === 'DISPO_CLOSED')), [dispoFiltered])

  const dispoFunnelStages: FunnelStage[] = DISPO_STAGES.map((s, i) => ({
    label: s.label, count: dispoCounts[s.key], color: FUNNEL_COLORS[i],
  }))

  // ── Acquisition Breakdown Tables ───────────────────────────────────────────
  const acqBySourceTab = useMemo((): TableTab => {
    const sources = [...new Set(acqFiltered.map(p => p.leadSource ?? 'Unassigned'))]
    if (!sources.includes('Unassigned') && acqFiltered.some(p => !p.leadSource)) sources.push('Unassigned')

    const rows = sources.map(src => {
      const group = acqFiltered.filter(p => src === 'Unassigned' ? !p.leadSource : p.leadSource === src)
      const total = group.length
      const type = INBOUND_SOURCES.includes(src) ? 'Inbound' : OUTBOUND_SOURCES.includes(src) ? 'Outbound' : 'Unknown'
      const rev = sumRevenue(group.filter(p => p.status === 'SOLD'))
      const cc = cumulativeCounts(group, ACQ_STAGES)

      return {
        source: src, type, spend: '—', vol: total,
        lead: countPct(cc.lead, total),
        aptSet: countPct(cc.aptSet, total),
        offerMade: countPct(cc.offerMade, total),
        underContract: countPct(cc.underContract, total),
        closed: countPct(cc.closed, total),
        revenue: fmt$(rev), cpl: '—', roi: '—',
      }
    })

    return {
      key: 'bySource', label: 'By Lead Source',
      columns: [
        { key: 'source', label: 'Source' }, { key: 'type', label: 'Type' },
        { key: 'spend', label: 'Spend', align: 'right' }, { key: 'vol', label: 'Vol', align: 'right' },
        { key: 'lead', label: 'Lead', align: 'right' }, { key: 'aptSet', label: 'Apt Set', align: 'right' },
        { key: 'offerMade', label: 'Offer Made', align: 'right' }, { key: 'underContract', label: 'Under Contract', align: 'right' },
        { key: 'closed', label: 'Closed', align: 'right' }, { key: 'revenue', label: 'Revenue', align: 'right' },
        { key: 'cpl', label: 'CPL', align: 'right' }, { key: 'roi', label: 'ROI', align: 'right' },
      ],
      rows,
    }
  }, [acqFiltered])

  const acqByMarketTab = useMemo((): TableTab => {
    const mkts = [...new Set(acqFiltered.flatMap(p => p.propertyMarkets.length > 0 ? p.propertyMarkets : ['Unassigned']))]
    const rows = mkts.map(mkt => {
      const group = acqFiltered.filter(p => mkt === 'Unassigned' ? p.propertyMarkets.length === 0 : p.propertyMarkets.includes(mkt))
      const total = group.length
      const rev = sumRevenue(group.filter(p => p.status === 'SOLD'))
      const cc = cumulativeCounts(group, ACQ_STAGES)
      return {
        market: mkt, spend: '—', vol: total,
        lead: countPct(cc.lead, total),
        aptSet: countPct(cc.aptSet, total),
        offerMade: countPct(cc.offerMade, total),
        underContract: countPct(cc.underContract, total),
        closed: countPct(cc.closed, total),
        revenue: fmt$(rev), cpl: '—', roi: '—',
      }
    })
    return {
      key: 'byMarket', label: 'By Market',
      columns: [
        { key: 'market', label: 'Market' }, { key: 'spend', label: 'Spend', align: 'right' },
        { key: 'vol', label: 'Vol', align: 'right' }, { key: 'lead', label: 'Lead', align: 'right' },
        { key: 'aptSet', label: 'Apt Set', align: 'right' }, { key: 'offerMade', label: 'Offer Made', align: 'right' },
        { key: 'underContract', label: 'Under Contract', align: 'right' }, { key: 'closed', label: 'Closed', align: 'right' },
        { key: 'revenue', label: 'Revenue', align: 'right' }, { key: 'cpl', label: 'CPL', align: 'right' },
        { key: 'roi', label: 'ROI', align: 'right' },
      ],
      rows,
    }
  }, [acqFiltered])

  const acqCrossTab = useMemo((): TableTab => {
    const sources = [...new Set(acqFiltered.map(p => p.leadSource ?? 'Unassigned'))]
    const cols: TableTab['columns'] = [{ key: 'source', label: 'Source' }]
    const groupHeaders: TableTab['groupHeaders'] = []

    for (const mkt of MARKETS) {
      groupHeaders.push({ label: mkt, span: 4 })
      cols.push(
        { key: `${mkt}_lead`, label: 'Lead', align: 'right' },
        { key: `${mkt}_closed`, label: 'Closed', align: 'right' },
        { key: `${mkt}_spend`, label: 'Spend', align: 'right' },
        { key: `${mkt}_revenue`, label: 'Rev', align: 'right' },
      )
    }

    const rows = sources.map(src => {
      const row: Record<string, string | number> = { source: src }
      for (const mkt of MARKETS) {
        const group = acqFiltered.filter(p =>
          (src === 'Unassigned' ? !p.leadSource : p.leadSource === src) && p.propertyMarkets.includes(mkt)
        )
        row[`${mkt}_lead`] = group.filter(p => ACQ_STAGES[0].statuses.includes(p.status)).length
        row[`${mkt}_closed`] = group.filter(p => p.status === 'SOLD').length
        row[`${mkt}_spend`] = '—'
        row[`${mkt}_revenue`] = fmt$(sumRevenue(group.filter(p => p.status === 'SOLD')))
      }
      return row
    })

    return { key: 'crossTab', label: 'Lead Source × Market', columns: cols, groupHeaders, rows }
  }, [acqFiltered])

  // ── Disposition Breakdown Tables ────────────────────────────────────────────
  const dispoByMarketTab = useMemo((): TableTab => {
    const mkts = [...new Set(dispoFiltered.flatMap(p => p.propertyMarkets.length > 0 ? p.propertyMarkets : ['Unassigned']))]
    const rows = mkts.map(mkt => {
      const group = dispoFiltered.filter(p => mkt === 'Unassigned' ? p.propertyMarkets.length === 0 : p.propertyMarkets.includes(mkt))
      const rev = sumRevenue(group.filter(p => p.status === 'DISPO_CLOSED'))
      return {
        market: mkt,
        newDeal: group.filter(p => DISPO_STAGES[0].statuses.includes(p.status)).length,
        pushedOut: group.filter(p => DISPO_STAGES[1].statuses.includes(p.status)).length,
        offers: group.filter(p => DISPO_STAGES[2].statuses.includes(p.status)).length,
        contracted: group.filter(p => DISPO_STAGES[3].statuses.includes(p.status)).length,
        closed: group.filter(p => DISPO_STAGES[4].statuses.includes(p.status)).length,
        revenue: fmt$(rev),
      }
    })
    return {
      key: 'dispoByMarket', label: 'By Market',
      columns: [
        { key: 'market', label: 'Market' }, { key: 'newDeal', label: 'New Deal', align: 'right' },
        { key: 'pushedOut', label: 'Pushed Out', align: 'right' }, { key: 'offers', label: 'Offers', align: 'right' },
        { key: 'contracted', label: 'Contracted', align: 'right' }, { key: 'closed', label: 'Closed', align: 'right' },
        { key: 'revenue', label: 'Revenue', align: 'right' },
      ],
      rows,
    }
  }, [dispoFiltered])

  const dispoByTypeTab = useMemo((): TableTab => {
    const types = [...new Set(dispoFiltered.flatMap(p => p.projectType.length > 0 ? p.projectType : ['Unassigned']))]
    const rows = types.map(pt => {
      const group = dispoFiltered.filter(p => pt === 'Unassigned' ? p.projectType.length === 0 : p.projectType.includes(pt))
      const rev = sumRevenue(group.filter(p => p.status === 'DISPO_CLOSED'))
      return {
        projectType: pt,
        newDeal: group.filter(p => DISPO_STAGES[0].statuses.includes(p.status)).length,
        pushedOut: group.filter(p => DISPO_STAGES[1].statuses.includes(p.status)).length,
        offers: group.filter(p => DISPO_STAGES[2].statuses.includes(p.status)).length,
        contracted: group.filter(p => DISPO_STAGES[3].statuses.includes(p.status)).length,
        closed: group.filter(p => DISPO_STAGES[4].statuses.includes(p.status)).length,
        revenue: fmt$(rev),
      }
    })
    return {
      key: 'dispoByType', label: 'By Project Type',
      columns: [
        { key: 'projectType', label: 'Project Type' }, { key: 'newDeal', label: 'New Deal', align: 'right' },
        { key: 'pushedOut', label: 'Pushed Out', align: 'right' }, { key: 'offers', label: 'Offers', align: 'right' },
        { key: 'contracted', label: 'Contracted', align: 'right' }, { key: 'closed', label: 'Closed', align: 'right' },
        { key: 'revenue', label: 'Revenue', align: 'right' },
      ],
      rows,
    }
  }, [dispoFiltered])

  const dispoCrossTab = useMemo((): TableTab => {
    const types = [...new Set(dispoFiltered.flatMap(p => p.projectType.length > 0 ? p.projectType : ['Unassigned']))]
    const cols: TableTab['columns'] = [{ key: 'projectType', label: 'Project Type' }]
    const groupHeaders: TableTab['groupHeaders'] = []

    for (const mkt of MARKETS) {
      groupHeaders.push({ label: mkt, span: 3 })
      cols.push(
        { key: `${mkt}_newDeal`, label: 'New Deal', align: 'right' },
        { key: `${mkt}_closed`, label: 'Closed', align: 'right' },
        { key: `${mkt}_revenue`, label: 'Rev', align: 'right' },
      )
    }

    const rows = types.map(pt => {
      const row: Record<string, string | number> = { projectType: pt }
      for (const mkt of MARKETS) {
        const group = dispoFiltered.filter(p =>
          (pt === 'Unassigned' ? p.projectType.length === 0 : p.projectType.includes(pt)) && p.propertyMarkets.includes(mkt)
        )
        row[`${mkt}_newDeal`] = group.filter(p => DISPO_STAGES[0].statuses.includes(p.status)).length
        row[`${mkt}_closed`] = group.filter(p => p.status === 'DISPO_CLOSED').length
        row[`${mkt}_revenue`] = fmt$(sumRevenue(group.filter(p => p.status === 'DISPO_CLOSED')))
      }
      return row
    })

    return { key: 'dispoCross', label: 'Market × Project Type', columns: cols, groupHeaders, rows }
  }, [dispoFiltered])

  // ── All available sources for filter dropdown ───────────────────────────────
  const allSources = [...new Set(properties.map(p => p.leadSource).filter(Boolean))] as string[]

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">KPI Dashboard</h1>
          <p className="text-ds-body text-txt-secondary mt-1">Marketing spend, pipeline funnel, and ROI tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={timePeriod} onChange={e => setTimePeriod(e.target.value)}
            className="bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-[9px] text-ds-body text-txt-primary">
            {TIME_PERIODS.map(tp => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
          </select>
          <select value={marketFilter} onChange={e => setMarketFilter(e.target.value)}
            className="bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-[9px] text-ds-body text-txt-primary">
            <option value="all">All Markets</option>
            {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
            className="bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-3 py-[9px] text-ds-body text-txt-primary">
            <option value="all">All Lead Sources</option>
            {allSources.sort().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Data Quality Banner */}
      {(missingSource > 0 || missingMarket > 0) && (
        <div className="bg-amber-50 border-[0.5px] border-amber-200 rounded-[14px] px-5 py-3 flex items-center justify-between">
          <p className="text-ds-fine text-amber-800 font-medium">
            {missingSource > 0 && <span>{missingSource} properties missing source</span>}
            {missingSource > 0 && missingMarket > 0 && <span> | </span>}
            {missingMarket > 0 && <span>{missingMarket} properties missing market</span>}
          </p>
          <Link href={`/${tenantSlug}/inventory`} className="text-ds-fine font-semibold text-amber-700 hover:text-amber-900">
            View in Inventory &rarr;
          </Link>
        </div>
      )}

      {/* ═══ ACQUISITION ═══ */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">Acquisition Pipeline</p>

        {/* Stat Cards */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          <KpiStatCard label="Spend" value={0} isCurrency showTrend={false} />
          <KpiStatCard label="Lead" value={acqCounts.lead} accent="border-l-teal-400" />
          <KpiStatCard label="Apt Set" value={acqCounts.aptSet} accent="border-l-teal-400" />
          <KpiStatCard label="Offer Made" value={acqCounts.offerMade} accent="border-l-teal-400" />
          <KpiStatCard label="Under Contract" value={acqCounts.underContract} accent="border-l-teal-400" />
          <KpiStatCard label="Closed" value={acqCounts.closed} accent="border-l-teal-400" />
          <KpiStatCard label="Revenue" value={acqRevenue} isCurrency showTrend={false} />
        </div>

        {/* Funnel */}
        <KpiFunnel stages={acqFunnelStages} />

        {/* Breakdown Tables */}
        <KpiTable tabs={[acqBySourceTab, acqByMarketTab, acqCrossTab]} />
      </div>

      {/* ═══ DISPOSITION ═══ */}
      <div className="space-y-4 mt-8">
        <p className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">Disposition Pipeline</p>

        {/* Stat Cards */}
        <div className="flex gap-3 overflow-x-auto pb-1">
          <KpiStatCard label="New Deal" value={dispoCounts.newDeal} accent="border-l-teal-400" />
          <KpiStatCard label="Pushed Out" value={dispoCounts.pushedOut} accent="border-l-teal-400" />
          <KpiStatCard label="Offers" value={dispoCounts.offers} accent="border-l-teal-400" />
          <KpiStatCard label="Contracted" value={dispoCounts.contracted} accent="border-l-teal-400" />
          <KpiStatCard label="Closed" value={dispoCounts.closed} accent="border-l-teal-400" />
          <KpiStatCard label="Revenue" value={dispoRevenue} isCurrency showTrend={false} />
        </div>

        {/* Funnel */}
        <KpiFunnel stages={dispoFunnelStages} />

        {/* Breakdown Tables */}
        <KpiTable tabs={[dispoByMarketTab, dispoByTypeTab, dispoCrossTab]} />
      </div>
    </div>
  )
}
