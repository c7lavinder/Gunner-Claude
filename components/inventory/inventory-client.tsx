'use client'
// components/inventory/inventory-client.tsx

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Building2, Phone, CheckSquare, Search, Plus,
  ExternalLink, X, Send, Users, AlertTriangle, Flag, Lock, Unlock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatPhone, titleCase } from '@/lib/format'
import { PipelineStageTabs } from './PipelineStageTabs'
import { PriceMatrixCard, ComputedSpreadCard } from './property-detail-client'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'

interface Property {
  id: string; address: string; city: string; state: string; zip: string
  status: string; dispoStatus: string | null; arv: string | null; askingPrice: string | null
  mao: string | null; contractPrice: string | null; assignmentFee: string | null
  currentOffer: string | null; highestOffer: string | null; acceptedPrice: string | null; finalProfit: string | null
  offerTypes: string[]
  altPrices: Record<string, Record<string, string | null>>
  fieldSources: Record<string, string>
  createdAt: string
  stageEnteredAt: string | null
  // Per-pipeline entry + stage timestamps for the days badges.
  acqPipelineEnteredAt: string
  acqStageEnteredAt: string
  dispoPipelineEnteredAt: string | null
  dispoStageEnteredAt: string | null
  ghlSyncLocked: boolean
  sellerName: string | null; sellerPhone: string | null
  sellers: Array<{ id: string; name: string; phone: string | null; email: string | null; isPrimary: boolean; role: string; ghlContactId: string | null }>
  assignedTo: { id: string; name: string } | null
  callCount: number; taskCount: number
  ghlContactId: string | null
  leadSource: string | null
  ghlStageName: string | null
  market: string | null
  lastOfferDate: string | null
  lastContactedDate: string | null
  // Vendor distress signals (from PropertyRadar + BatchData)
  distressScore: number | null
  preForeclosure: boolean | null
  bankOwned: boolean | null
  inBankruptcy: boolean | null
  inProbate: boolean | null
  inDivorce: boolean | null
  hasRecentEviction: boolean | null
  taxDelinquent: boolean | null
  foreclosureStatus: string | null
}

// DistressBadge — renders the PropertyRadar composite score with a color
// scale (red ≥ 70, orange 40-69, amber 20-39, slate < 20 or null), plus
// a small stack of icons for active distress flags hovered in the tooltip.
function DistressBadge({
  score,
  preForeclosure,
  bankOwned,
  inBankruptcy,
  inProbate,
  inDivorce,
  taxDelinquent,
  foreclosureStatus,
}: {
  score: number | null
  preForeclosure: boolean | null
  bankOwned: boolean | null
  inBankruptcy: boolean | null
  inProbate: boolean | null
  inDivorce: boolean | null
  taxDelinquent: boolean | null
  foreclosureStatus: string | null
}) {
  const activeFlags: string[] = []
  if (preForeclosure) activeFlags.push('Pre-foreclosure')
  if (bankOwned) activeFlags.push('REO')
  if (foreclosureStatus) activeFlags.push(`Foreclosure: ${foreclosureStatus}`)
  if (inBankruptcy) activeFlags.push('Bankruptcy')
  if (inProbate) activeFlags.push('Probate')
  if (inDivorce) activeFlags.push('Divorce')
  if (taxDelinquent) activeFlags.push('Tax delinquent')

  const hasScore = typeof score === 'number'
  if (!hasScore && activeFlags.length === 0) return null

  const color = !hasScore ? 'bg-slate-100 text-slate-600 border-slate-200'
    : score! >= 70 ? 'bg-red-100 text-red-700 border-red-300'
    : score! >= 40 ? 'bg-orange-100 text-orange-700 border-orange-300'
    : score! >= 20 ? 'bg-amber-100 text-amber-700 border-amber-300'
    : 'bg-slate-100 text-slate-600 border-slate-200'

  const tooltip = [
    hasScore ? `Distress score: ${score}/100` : 'Distress flags present',
    ...activeFlags.map(f => `• ${f}`),
  ].join('\n')

  return (
    <span
      className={`text-[10px] font-medium px-2 py-[2px] rounded-full border whitespace-nowrap ${color}`}
      title={tooltip}
    >
      {hasScore ? `⚠ ${score}` : `⚠ ${activeFlags.length}`}
    </span>
  )
}

export function InventoryClient({ properties: initialProperties, statusCounts, tenantSlug, canManage, ghlLocationId, showArchived }: {
  properties: Property[]
  statusCounts: Record<string, number>
  tenantSlug: string
  canManage: boolean
  ghlLocationId?: string
  showArchived: boolean
}) {
  const searchParams = useSearchParams()
  const [selectedStage, setSelectedStage] = useState<AppStage | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dataQualityOpen, setDataQualityOpen] = useState(false)
  const [dataQualityFilter, setDataQualityFilter] = useState<string | null>(null)

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)

  // Local state so drawer edits immediately reflect in the table row.
  // Re-syncs if the server re-fetches (e.g., via router.refresh).
  const [properties, setProperties] = useState(initialProperties)
  useEffect(() => { setProperties(initialProperties) }, [initialProperties])
  const updateProperty = (id: string, patch: Partial<Property>) => {
    setProperties(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  // Handle ?filter= deeplinks from KPI page
  useEffect(() => {
    const filter = searchParams?.get('filter')
    if (filter === 'missing_market') setDataQualityFilter('market')
    else if (filter === 'missing_source') setDataQualityFilter('source')
    else if (filter === 'missing_address') setDataQualityFilter('address')
  }, [searchParams])

  // Reset pagination whenever filters or search change
  useEffect(() => {
    setVisibleCount(50)
  }, [search, selectedStage, selectedMarket, selectedSource, dataQualityFilter])

  // Convert DB status counts to AppStage counts
  const stageCounts: Partial<Record<AppStage, number>> = {}
  for (const [dbStatus, count] of Object.entries(statusCounts)) {
    const appStage = STATUS_TO_APP_STAGE[dbStatus]
    if (appStage) {
      stageCounts[appStage] = (stageCounts[appStage] ?? 0) + count
    }
  }

  // Filter properties
  const filtered = properties.filter((p) => {
    if (dataQualityFilter === 'address') return !p.address
    if (dataQualityFilter === 'contact') return !p.sellerName && p.sellers.length === 0
    if (dataQualityFilter === 'market') return !p.market
    if (dataQualityFilter === 'source') return !p.leadSource
    if (dataQualityFilter === 'stage') return !p.ghlStageName && p.status === 'NEW_LEAD'
    if (selectedStage) {
      const acqStage = STATUS_TO_APP_STAGE[p.status]
      const dispoStage = p.dispoStatus ? STATUS_TO_APP_STAGE[p.dispoStatus] : null
      if (acqStage !== selectedStage && dispoStage !== selectedStage) return false
    }
    if (selectedMarket) {
      if (p.market !== selectedMarket) return false
    }
    if (selectedSource) {
      if (selectedSource === '__none__') { if (p.leadSource) return false }
      else if (p.leadSource !== selectedSource) return false
    }
    if (search) {
      if (search === '__missing_source__') return !p.leadSource
      const q = search.toLowerCase()
      return (
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.zip.includes(q) ||
        (p.sellerName ?? '').toLowerCase().includes(q) ||
        (p.sellerPhone ?? '').includes(q)
      )
    }
    return true
  })

  const activeCount = properties.filter(p => !['SOLD', 'DEAD'].includes(p.status)).length
  const missingSourceCount = properties.filter(p => !p.leadSource).length
  const missingAddressCount = properties.filter(p => !p.address).length
  const missingContactCount = properties.filter(p => !p.sellerName && (!p.sellers || p.sellers.length === 0)).length
  const missingMarketCount = properties.filter(p => !p.market).length
  const missingStageCount = properties.filter(p => !p.ghlStageName && p.status === 'NEW_LEAD').length
  const totalIssues = missingAddressCount + missingContactCount + missingMarketCount + missingSourceCount + missingStageCount
  const leadSources = [...new Set(properties.map(p => p.leadSource).filter(Boolean))] as string[]
  const markets = [...new Set(properties.map(p => p.market).filter(Boolean))] as string[]
  const selectedProperty = selectedPropertyId ? properties.find(p => p.id === selectedPropertyId) : null

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">Inventory</h1>
          <p className="text-ds-body text-txt-secondary mt-1">
            {activeCount} {showArchived ? 'total' : 'active'} properties
            {showArchived ? ' (including archived)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Show-archived toggle (Phase 1 commit 2 — plan §4 visibility rule).
              Active default hides longterm-only / dead / fully-closed rows;
              toggle reveals them via ?archived=1 URL param. */}
          <Link
            href={showArchived ? `/${tenantSlug}/inventory` : `/${tenantSlug}/inventory?archived=1`}
            className={`flex items-center gap-1.5 text-ds-body font-medium px-3 py-[9px] rounded-[10px] border-[0.5px] transition-colors ${
              showArchived
                ? 'bg-gunner-red text-white border-gunner-red hover:bg-gunner-red-dark'
                : 'bg-white text-txt-secondary border-[rgba(0,0,0,0.14)] hover:text-txt-primary hover:bg-surface-secondary'
            }`}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Link>
          {canManage && (
            <Link
              href={`/${tenantSlug}/inventory/new`}
              className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold px-4 py-[9px] rounded-[10px] transition-colors"
            >
              <Plus size={14} /> Add property
            </Link>
          )}
        </div>
      </div>

      {/* Pipeline stage selector */}
      <PipelineStageTabs
        stageCounts={stageCounts}
        selectedStage={selectedStage}
        onStageSelect={(stage) => { setSelectedStage(stage); setSelectedPropertyId(null) }}
      />

      {/* Toolbar: search + view toggle + filter info */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-4 py-[9px] flex-1 max-w-md">
          <Search size={14} className="text-txt-muted shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, zip, name, phone..."
            className="bg-transparent text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none flex-1"
          />
        </div>

        {/* Data quality icon */}
        {totalIssues > 0 && (
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => dataQualityFilter ? undefined : setDataQualityOpen(v => !v)}
                className={`flex items-center gap-1.5 text-ds-fine font-medium px-3 py-[7px] rounded-[10px] transition-colors ${
                  dataQualityFilter
                    ? 'bg-amber-100 text-amber-800 border-[0.5px] border-amber-300'
                    : 'bg-amber-50 text-amber-700 border-[0.5px] border-amber-200 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle size={12} />
                {dataQualityFilter ? <>{filtered.length} issues</> : <>{totalIssues} Data Issues</>}
              </button>
              {dataQualityFilter && (
                <button onClick={() => { setDataQualityFilter(null); setDataQualityOpen(false) }} className="text-amber-600 hover:text-red-600 p-1">
                  <X size={12} />
                </button>
              )}
            </div>
            {dataQualityOpen && !dataQualityFilter && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDataQualityOpen(false)} />
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border-[0.5px] rounded-[10px] shadow-ds-float z-50 overflow-hidden" style={{ borderColor: 'var(--border-medium)' }}>
                  {[
                    { key: 'address', label: 'Missing Address', count: missingAddressCount },
                    { key: 'contact', label: 'Missing Contact', count: missingContactCount },
                    { key: 'market', label: 'Missing Market', count: missingMarketCount },
                    { key: 'source', label: 'Missing Source', count: missingSourceCount },
                    { key: 'stage', label: 'Missing Stage', count: missingStageCount },
                  ].filter(i => i.count > 0).map(item => (
                    <button
                      key={item.key}
                      onClick={() => { setDataQualityFilter(item.key); setDataQualityOpen(false); setSelectedStage(null); setSelectedMarket(null); setSelectedSource(null); setSearch('') }}
                      className="w-full text-left px-4 py-2.5 text-[12px] text-txt-primary hover:bg-surface-secondary transition-colors flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      <span className="text-amber-600 font-semibold">{item.count}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {selectedStage && (
          <div className="flex items-center gap-2">
            <span className={`text-ds-fine font-semibold px-2.5 py-1 rounded-full ${APP_STAGE_BADGE_COLORS[selectedStage]}`}>
              {APP_STAGE_LABELS[selectedStage]}
            </span>
            <span className="text-ds-fine text-txt-muted">{filtered.length}</span>
            <button onClick={() => setSelectedStage(null)} className="text-ds-fine text-txt-muted hover:text-txt-secondary underline">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Quick filters: Market + Source */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Market:</span>
        {markets.map(m => {
          const isActive = selectedMarket === m
          const color = MARKET_COLORS[m] ?? 'bg-surface-tertiary text-txt-secondary'
          return (
            <button key={m} onClick={() => { setSelectedMarket(isActive ? null : m); setSelectedPropertyId(null) }}
              className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-all ${isActive ? color + ' ring-1 ring-offset-1 ring-current' : color + ' opacity-60 hover:opacity-100'}`}>
              {m}
            </button>
          )
        })}

        <span className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider ml-3">Source:</span>
        {leadSources.map(s => {
          const isActive = selectedSource === s
          const color = getSourceColor(s)
          return (
            <button key={s} onClick={() => { setSelectedSource(isActive ? null : s); setSelectedPropertyId(null) }}
              className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-all ${isActive ? color + ' ring-1 ring-offset-1 ring-current' : color + ' opacity-60 hover:opacity-100'}`}>
              {s}
            </button>
          )
        })}

        {(selectedMarket || selectedSource) && (
          <button onClick={() => { setSelectedMarket(null); setSelectedSource(null) }}
            className="text-[10px] text-txt-muted hover:text-txt-secondary underline ml-1">
            Clear filters
          </button>
        )}
      </div>

      {/* Content — flex split: list + optional detail panel */}
      <div className="flex gap-0">
        <div className={`${selectedProperty ? 'flex-1 min-w-0' : 'w-full'} transition-all`}>
          {filtered.length === 0 ? (
            <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
              <Building2 size={24} className="text-txt-muted mx-auto mb-3" />
              <p className="text-txt-secondary text-ds-body">
                {search || selectedStage || selectedMarket || selectedSource ? 'No properties match your filter' : 'No properties yet'}
              </p>
            </div>
          ) : (
            <>
              <PropertyTable
                properties={filtered.slice(0, visibleCount)}
                tenantSlug={tenantSlug}
                selectedId={selectedPropertyId}
                onSelect={setSelectedPropertyId}
                ghlLocationId={ghlLocationId}
                selectedStage={selectedStage}
              />
              {filtered.length > visibleCount && (
                <div className="flex items-center justify-between px-4 py-3 mt-2 bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px]">
                  <p className="text-ds-fine text-txt-muted">
                    Showing <span className="font-semibold text-txt-primary">{visibleCount}</span> of{' '}
                    <span className="font-semibold text-txt-primary">{filtered.length.toLocaleString()}</span>
                  </p>
                  <button
                    onClick={() => setVisibleCount(v => v + 50)}
                    className="flex items-center gap-1.5 bg-surface-secondary hover:bg-surface-tertiary text-txt-primary text-ds-fine font-semibold px-4 py-[7px] rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
                  >
                    + Next {Math.min(50, filtered.length - visibleCount)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel — in-flow, not fixed */}
        {selectedProperty && (
          <PropertyDrawer
            property={selectedProperty}
            tenantSlug={tenantSlug}
            ghlLocationId={ghlLocationId}
            onClose={() => setSelectedPropertyId(null)}
            onPropertyUpdate={updateProperty}
            selectedStage={selectedStage}
          />
        )}
      </div>
    </div>
  )
}

// ─── Pipeline-aware days helper ─────────────────────────────────────────────
// Returns the pair of timestamps to show for a given property + current
// filter context. Rule:
//   - If a stage tab is selected, use that stage's track (acq vs dispo).
//   - If no tab selected, default to the property's "current" pipeline:
//     dispo if dispoStatus is set, otherwise acq.
// Disposition fields can be null for acq-only properties; we fall back to acq
// in that case so the badge is never blank.
function pipelinePair(p: Property, selectedStage: AppStage | null): {
  pipelineAnchor: string
  stageAnchor: string
  track: 'acquisition' | 'disposition'
} {
  const filterTrack = selectedStage?.startsWith('disposition') ? 'disposition'
    : selectedStage?.startsWith('acquisition') ? 'acquisition'
    : null
  const wantsDispo = filterTrack === 'disposition'
    || (filterTrack === null && !!p.dispoStatus)
  if (wantsDispo && p.dispoPipelineEnteredAt && p.dispoStageEnteredAt) {
    return {
      pipelineAnchor: p.dispoPipelineEnteredAt,
      stageAnchor: p.dispoStageEnteredAt,
      track: 'disposition',
    }
  }
  return {
    pipelineAnchor: p.acqPipelineEnteredAt,
    stageAnchor: p.acqStageEnteredAt,
    track: 'acquisition',
  }
}

// ─── Property Table ──────────────────────────────────────────────────────────

// Rotating palette for lead sources — any new source gets a consistent color
const SOURCE_PALETTE = [
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-lime-100 text-lime-700',
  'bg-sky-100 text-sky-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-orange-100 text-orange-700',
  'bg-emerald-100 text-emerald-700',
]

const SOURCE_COLORS: Record<string, string> = {
  'PPL': 'bg-violet-100 text-violet-700',
  'PPC': 'bg-sky-100 text-sky-700',
  'Texts': 'bg-cyan-100 text-cyan-700',
  'Form': 'bg-rose-100 text-rose-700',
  'Dialer': 'bg-orange-100 text-orange-700',
  'Cold Call': 'bg-orange-100 text-orange-700',
  'Direct Mail': 'bg-pink-100 text-pink-700',
  'Referral': 'bg-green-100 text-green-700',
  'Website': 'bg-purple-100 text-purple-700',
  'GHL': 'bg-blue-100 text-blue-700',
  'Manual': 'bg-gray-100 text-gray-600',
}

function getSourceColor(source: string): string {
  if (SOURCE_COLORS[source]) return SOURCE_COLORS[source]
  // Hash-based fallback for unknown sources
  let hash = 0
  for (let i = 0; i < source.length; i++) hash = source.charCodeAt(i) + ((hash << 5) - hash)
  return SOURCE_PALETTE[Math.abs(hash) % SOURCE_PALETTE.length]
}

const GHL_STAGE_COLORS: Record<string, string> = {
  'New Lead (1)': 'bg-sky-100 text-sky-700',
  'Warm Leads(2)': 'bg-orange-100 text-orange-700',
  'Hot Leads(2)': 'bg-red-100 text-red-700',
  'Pending Apt(3)': 'bg-yellow-100 text-yellow-700',
  'Walkthrough Apt Scheduled': 'bg-amber-100 text-amber-700',
  'Offer Apt Scheduled (3)': 'bg-lime-100 text-lime-700',
  'Made Offer (4)': 'bg-purple-100 text-purple-700',
  'Under Contract (5)': 'bg-emerald-100 text-emerald-700',
  'Purchased (6)': 'bg-green-100 text-green-700',
  '1 Month Follow Up': 'bg-teal-100 text-teal-700',
  '4 Month Follow Up': 'bg-cyan-100 text-cyan-700',
  '1 Year Follow Up': 'bg-indigo-100 text-indigo-700',
  'Ghosted Lead': 'bg-stone-100 text-stone-600',
  'New deal': 'bg-blue-100 text-blue-700',
  'Clear to Send Out': 'bg-violet-100 text-violet-700',
  'Sent to buyers': 'bg-fuchsia-100 text-fuchsia-700',
  'Offers Received': 'bg-pink-100 text-pink-700',
  'UC W/ Buyer': 'bg-emerald-100 text-emerald-700',
  'Working w/ Title': 'bg-teal-100 text-teal-700',
  'Closed': 'bg-green-100 text-green-700',
}

const STAGE_PALETTE = [
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-violet-100 text-violet-700',
  'bg-lime-100 text-lime-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
]

function getStageColor(stage: string): string {
  if (GHL_STAGE_COLORS[stage]) return GHL_STAGE_COLORS[stage]
  let hash = 0
  for (let i = 0; i < stage.length; i++) hash = stage.charCodeAt(i) + ((hash << 5) - hash)
  return STAGE_PALETTE[Math.abs(hash) % STAGE_PALETTE.length]
}

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'New Lead (1)': 'New Lead',
  'Warm Leads(2)': 'Warm Lead',
  'Hot Leads(2)': 'Hot Lead',
  'Pending Apt(3)': 'Pending Apt',
  'Pending Apt (3)': 'Pending Apt',
  'Walkthrough Apt Scheduled': 'Walkthrough',
  'Walkthrough Apt Scheduled (3)': 'Walkthrough',
  'Offer Apt Scheduled (3)': 'Offer Apt',
  'Offer Apt Scheduled(3)': 'Offer Apt',
  'Made Offer (4)': 'Made Offer',
  'Under Contract (5)': 'Under Contract',
  'Purchased (6)': 'Purchased',
  '1 Month Follow Up': '1 Month',
  '4 Month Follow Up': '4 Month',
  '1 Year Follow Up': '1 Year',
  'Ghosted Lead': 'Ghosted',
  'Agreement not closed': 'No Agreement',
  'DO NOT WANT': 'Do Not Want',
  'New deal': 'New Deal',
  'Clear to Send Out': 'Clear to Send',
  'Sent to buyers': 'Sent to Buyers',
  'Offers Received': 'Offers In',
  '<1 Day — Need to Terminate': 'Terminating',
  '<1 Day - Need to Terminate': 'Terminating',
  'With JV Partner': 'JV Partner',
  'UC W/ Buyer': 'UC w/ Buyer',
  'Working w/ Title': 'Title Work',
}

function cleanStageName(raw: string): string {
  if (STAGE_DISPLAY_NAMES[raw]) return STAGE_DISPLAY_NAMES[raw]
  // Fallback: strip numbers in parens, collapse whitespace
  return raw.replace(/\s*\(\d+\)\s*/g, '').replace(/\s+/g, ' ').trim()
}

const MARKET_COLORS: Record<string, string> = {
  'Nashville': 'bg-red-100 text-red-700',
  'Columbia': 'bg-teal-100 text-teal-700',
  'Knoxville': 'bg-indigo-100 text-indigo-700',
  'Chattanooga': 'bg-amber-100 text-amber-700',
  'Global': 'bg-gray-100 text-gray-600',
}

function PropertyTable({ properties, tenantSlug, selectedId, onSelect, selectedStage }: {
  properties: Property[]
  tenantSlug: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  ghlLocationId?: string
  selectedStage: AppStage | null
}) {
  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
      {properties.map(p => {
        const appStage = STATUS_TO_APP_STAGE[p.dispoStatus ?? p.status] ?? 'acquisition.new_lead'
        const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
        const isSelected = selectedId === p.id
        const sourceColor = p.leadSource ? getSourceColor(p.leadSource) : ''
        const marketColor = MARKET_COLORS[p.market ?? ''] ?? 'bg-surface-tertiary text-txt-secondary'
        const { pipelineAnchor, stageAnchor, track } = pipelinePair(p, selectedStage)
        const domPipeline = Math.floor((Date.now() - new Date(pipelineAnchor).getTime()) / 86400000)
        const domStage = Math.floor((Date.now() - new Date(stageAnchor).getTime()) / 86400000)
        const pipelineColor = domPipeline < 6 ? 'text-green-600 bg-green-50' : domPipeline <= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
        const stageColor = domStage < 6 ? 'text-green-600 bg-green-50' : domStage <= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
        const trackLabel = track === 'disposition' ? 'disposition' : 'acquisition'

        return (
          <button
            key={p.id}
            onClick={() => onSelect(isSelected ? null : p.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[rgba(0,0,0,0.04)] hover:bg-surface-secondary transition-colors ${
              isSelected ? 'bg-gunner-red-light' : ''
            }`}
          >
            {/* Days in current pipeline · days in current stage (pipeline = acq or dispo based on filter / property state) */}
            <div className="flex items-center gap-1 shrink-0" title={`${domPipeline}d in ${trackLabel} · ${domStage}d in stage`}>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-[6px] whitespace-nowrap ${pipelineColor}`}>
                {domPipeline}d
              </span>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-[6px] whitespace-nowrap ${stageColor}`}>
                {domStage}d
              </span>
            </div>
            {/* Address */}
            <div className="min-w-0 shrink-0" style={{ maxWidth: '40%' }}>
              <p className="text-ds-body font-medium text-txt-primary truncate">{p.address || <span className="text-txt-muted italic">Address missing</span>}</p>
              <p className="text-ds-fine text-txt-muted">{[p.city, p.state].filter(Boolean).join(', ')} {p.zip ?? ''}</p>
            </div>
            {/* Labels */}
            <div className="flex items-center gap-1.5 flex-1 flex-wrap">
              <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${badgeColor}`}>
                {APP_STAGE_LABELS[appStage]}
              </span>
              {p.ghlStageName && !p.ghlStageName.includes('-') && (
                <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${getStageColor(p.ghlStageName)}`}>
                  {cleanStageName(p.ghlStageName)}
                </span>
              )}
              {p.leadSource && (
                <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${sourceColor}`}>
                  {p.leadSource}
                </span>
              )}
              {p.market && (
                <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full whitespace-nowrap ${marketColor}`}>
                  {p.market}
                </span>
              )}
              <DistressBadge
                score={p.distressScore}
                preForeclosure={p.preForeclosure}
                bankOwned={p.bankOwned}
                inBankruptcy={p.inBankruptcy}
                inProbate={p.inProbate}
                inDivorce={p.inDivorce}
                taxDelinquent={p.taxDelinquent}
                foreclosureStatus={p.foreclosureStatus}
              />
            </div>
            {/* Link */}
            <Link
              href={`/${tenantSlug}/inventory/${p.id}`}
              onClick={e => e.stopPropagation()}
              className="text-txt-muted hover:text-gunner-red transition-colors shrink-0"
            >
              <ExternalLink size={12} />
            </Link>
          </button>
        )
      })}
    </div>
  )
}

// ─── Property Drawer (quick detail on row click) ─────────────────────────────

function PropertyDrawer({ property: p, tenantSlug, ghlLocationId, onClose, onPropertyUpdate, selectedStage }: {
  property: Property
  tenantSlug: string
  ghlLocationId?: string
  onClose: () => void
  onPropertyUpdate: (id: string, patch: Partial<Property>) => void
  selectedStage: AppStage | null
}) {
  const { pipelineAnchor, stageAnchor, track } = pipelinePair(p, selectedStage)
  // App-stage chip follows the same pipeline context so it reads the pipeline
  // the user is currently viewing, not always the dispo side.
  const appStage = track === 'disposition' && p.dispoStatus
    ? STATUS_TO_APP_STAGE[p.dispoStatus] ?? 'acquisition.new_lead'
    : STATUS_TO_APP_STAGE[p.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const domPipeline = Math.floor((Date.now() - new Date(pipelineAnchor).getTime()) / 86400000)
  const domStage = Math.floor((Date.now() - new Date(stageAnchor).getTime()) / 86400000)
  const pipelineColor = domPipeline < 6 ? 'text-green-600 bg-green-50' : domPipeline <= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
  const stageColor = domStage < 6 ? 'text-green-600 bg-green-50' : domStage <= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
  const trackLabel = track === 'disposition' ? 'disposition' : 'acquisition'

  const [vals, setVals] = useState({
    askingPrice: p.askingPrice, mao: p.mao, currentOffer: p.currentOffer,
    contractPrice: p.contractPrice, highestOffer: p.highestOffer, acceptedPrice: p.acceptedPrice,
    assignmentFee: p.assignmentFee, finalProfit: p.finalProfit,
  })
  const [sources, setSources] = useState<Record<string, string>>(p.fieldSources ?? {})
  const [altPrices, setAltPrices] = useState<Record<string, Record<string, string | null>>>(p.altPrices ?? {})

  // Address editing state
  const [editingAddress, setEditingAddress] = useState(false)
  const [addrFields, setAddrFields] = useState({ address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', zip: p.zip ?? '' })
  const [addrMarket, setAddrMarket] = useState(p.market ?? '')
  const [savingAddress, setSavingAddress] = useState(false)

  // Reset all local state when the selected property changes
  useEffect(() => {
    setVals({
      askingPrice: p.askingPrice, mao: p.mao, currentOffer: p.currentOffer,
      contractPrice: p.contractPrice, highestOffer: p.highestOffer, acceptedPrice: p.acceptedPrice,
      assignmentFee: p.assignmentFee, finalProfit: p.finalProfit,
    })
    setSources(p.fieldSources ?? {})
    setAltPrices(p.altPrices ?? {})
    setEditingAddress(false)
    setAddrFields({ address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', zip: p.zip ?? '' })
    setAddrMarket(p.market ?? '')
  }, [p.id])

  // Auto-populate market when zip changes
  useEffect(() => {
    if (addrFields.zip && addrFields.zip.length === 5) {
      fetch(`/api/properties/market-lookup?zip=${addrFields.zip}`)
        .then(r => r.json())
        .then(d => { if (d.market) setAddrMarket(d.market) })
        .catch(() => {})
    }
  }, [addrFields.zip])

  async function saveAddress() {
    setSavingAddress(true)
    try {
      const res = await fetch(`/api/properties/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: addrFields.address || undefined,
          city: addrFields.city || undefined,
          state: addrFields.state || undefined,
          zip: addrFields.zip || undefined,
          market: addrMarket || undefined,
        }),
      })
      if (res.ok) {
        setEditingAddress(false)
        // Propagate to parent so the table row reflects the new address without a page refresh.
        onPropertyUpdate(p.id, {
          address: addrFields.address,
          city: addrFields.city,
          state: addrFields.state,
          zip: addrFields.zip,
          market: addrMarket,
        })
      }
    } catch {}
    setSavingAddress(false)
  }

  function handleSaved(field: string, val: string | null, src: string) {
    setVals(prev => ({ ...prev, [field]: val }))
    setSources(prev => {
      const next = { ...prev }
      if (src) next[field] = src; else delete next[field]
      // Keep parent in sync so other views of this property pick up the change.
      onPropertyUpdate(p.id, {
        [field]: val,
        fieldSources: next,
      } as Partial<Property>)
      return next
    })
  }

  function handleAltSaved(type: string, field: string, val: string | null) {
    setAltPrices(prev => {
      const typeRow = { ...(prev[type] ?? {}), [field]: val }
      const next = { ...prev, [type]: typeRow }
      onPropertyUpdate(p.id, { altPrices: next } as Partial<Property>)
      return next
    })
  }

  return (
    <div className="w-[420px] max-w-[50vw] shrink-0 bg-white border-l border-[rgba(0,0,0,0.08)] shadow-sm flex flex-col max-h-[calc(100vh-120px)] sticky top-[60px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full ${badgeColor}`}>
              {APP_STAGE_LABELS[appStage]}
            </span>
            <span className="flex items-center gap-1" title={`${domPipeline}d in ${trackLabel} · ${domStage}d in stage`}>
              <span className={`text-[10px] font-bold px-1.5 py-[2px] rounded-[4px] ${pipelineColor}`}>{domPipeline}d</span>
              <span className={`text-[10px] font-bold px-1.5 py-[2px] rounded-[4px] ${stageColor}`}>{domStage}d</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/${tenantSlug}/inventory/${p.id}`}
              className="text-ds-fine text-txt-muted hover:text-gunner-red transition-colors">
              Full detail
            </Link>
            <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        {editingAddress ? (
          <div className="space-y-1.5 mt-1">
            <input value={addrFields.address} onChange={e => setAddrFields(f => ({ ...f, address: e.target.value }))}
              placeholder="Street address" className="w-full text-ds-fine bg-surface-secondary border rounded-[6px] px-2 py-1" style={{ borderColor: 'var(--border-medium)' }} />
            <div className="flex gap-1.5">
              <input value={addrFields.city} onChange={e => setAddrFields(f => ({ ...f, city: e.target.value }))}
                placeholder="City" className="flex-1 text-ds-fine bg-surface-secondary border rounded-[6px] px-2 py-1" style={{ borderColor: 'var(--border-medium)' }} />
              <input value={addrFields.state} onChange={e => setAddrFields(f => ({ ...f, state: e.target.value }))}
                placeholder="ST" className="w-12 text-ds-fine bg-surface-secondary border rounded-[6px] px-2 py-1 text-center" style={{ borderColor: 'var(--border-medium)' }} />
              <input value={addrFields.zip} onChange={e => setAddrFields(f => ({ ...f, zip: e.target.value }))}
                placeholder="Zip" className="w-16 text-ds-fine bg-surface-secondary border rounded-[6px] px-2 py-1" style={{ borderColor: 'var(--border-medium)' }} />
            </div>
            {addrMarket && <p className="text-[9px] text-txt-muted">Market: <span className="font-medium text-txt-primary">{addrMarket}</span></p>}
            <div className="flex gap-1.5">
              <button onClick={saveAddress} disabled={savingAddress}
                className="text-[10px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark px-3 py-1 rounded-[6px] transition-colors">
                {savingAddress ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setEditingAddress(false); setAddrFields({ address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', zip: p.zip ?? '' }) }}
                className="text-[10px] text-txt-muted hover:text-txt-primary px-2 py-1">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <h2 className="text-ds-label font-semibold text-txt-primary">{p.address || <span className="italic text-amber-600">No address</span>}</h2>
              <p className="text-ds-fine text-txt-secondary">{[p.city, p.state].filter(Boolean).join(', ')} {p.zip ?? ''}</p>
            </div>
            <button onClick={() => setEditingAddress(true)} title="Edit address"
              className="text-txt-muted hover:text-amber-600 transition-colors mt-0.5 shrink-0">
              <Flag size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* GHL sync toggle — off when user wants this property to diverge from the shared opportunity */}
        <GhlSyncToggle
          propertyId={p.id}
          initialLocked={p.ghlSyncLocked}
          onChange={(locked) => onPropertyUpdate(p.id, { ghlSyncLocked: locked })}
        />

        {/* Row 1 — Pricing Intent */}
        <div>
          <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Pricing Intent</p>
          <div className="grid grid-cols-3 gap-2">
            <PriceMatrixCard label="ASKING" field="askingPrice" cashValue={vals.askingPrice} source={sources.askingPrice} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
            <PriceMatrixCard label="MAO" field="mao" cashValue={vals.mao} source={sources.mao} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
            <PriceMatrixCard label="CURRENT OFFER" field="currentOffer" cashValue={vals.currentOffer} source={sources.currentOffer} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          </div>
        </div>

        {/* Row 2 — Deal Outcomes */}
        <div>
          <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Deal Outcomes</p>
          <div className="grid grid-cols-3 gap-2">
            <PriceMatrixCard label="CONTRACT" field="contractPrice" cashValue={vals.contractPrice} source={sources.contractPrice} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
            <PriceMatrixCard label="HIGHEST OFFER" field="highestOffer" cashValue={vals.highestOffer} source={sources.highestOffer} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
            <PriceMatrixCard label="ACCEPTED" field="acceptedPrice" cashValue={vals.acceptedPrice} source={sources.acceptedPrice} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          </div>
        </div>

        {/* Row 3 — Profit Summary */}
        <div>
          <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Profit Summary</p>
          <div className="grid grid-cols-3 gap-2">
            <ComputedSpreadCard cashAccepted={vals.acceptedPrice} cashContract={vals.contractPrice} altPrices={altPrices} offerTypes={p.offerTypes} />
            <PriceMatrixCard label="ASSIGN. FEE" field="assignmentFee" cashValue={vals.assignmentFee} source={sources.assignmentFee} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
            <PriceMatrixCard label="FINAL PROFIT" field="finalProfit" cashValue={vals.finalProfit} source={sources.finalProfit} altPrices={altPrices} offerTypes={p.offerTypes} propertyId={p.id} onCashSaved={handleSaved} onAltSaved={handleAltSaved} />
          </div>
        </div>

        {/* Contacts — with add */}
        <DrawerContacts propertyId={p.id} initialSellers={p.sellers} />

        {/* Team Members — with add/remove */}
        <DrawerTeam propertyId={p.id} tenantSlug={tenantSlug} />

        {/* AI Actions */}
        <DrawerInlineAI propertyId={p.id} />

        {/* Links */}
        <div className="flex gap-2 pt-1">
          <Link href={`/${tenantSlug}/inventory/${p.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-fine font-semibold py-2 rounded-[8px] transition-colors">
            View Full Detail
          </Link>
          {p.ghlContactId && ghlLocationId && (
            <a href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${p.ghlContactId}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-surface-secondary hover:bg-surface-tertiary text-txt-secondary text-ds-fine font-semibold py-2 px-3 rounded-[8px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors">
              <ExternalLink size={11} /> GHL
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Drawer Contacts (with add/remove) ──────────────────────────────────────

const DRAWER_ROLES = ['Primary Seller', 'Co-Seller', 'Spouse', 'Buyer', 'Buyer Agent', 'Attorney', 'Agent', 'Other']

function DrawerContacts({ propertyId, initialSellers }: {
  propertyId: string
  initialSellers: Property['sellers']
}) {
  const [sellers, setSellers] = useState(initialSellers)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; phone: string | null; email: string | null }>>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedRole, setSelectedRole] = useState('Primary Seller')

  // Reset when property changes
  useEffect(() => {
    setSellers(initialSellers)
    setShowSearch(false)
    setQuery('')
    setResults([])
  }, [propertyId])

  async function searchContacts(q: string) {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/ghl/contacts?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.contacts ?? [])
    } catch { setResults([]) }
    setSearching(false)
  }

  async function addContact(c: { id: string; name: string; phone: string | null; email: string | null }) {
    setAdding(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghlContactId: c.id, name: c.name, phone: c.phone, email: c.email, role: selectedRole, isPrimary: sellers.length === 0 }),
      })
      if (res.ok) {
        const data = await res.json()
        setSellers(prev => [...prev, data.seller])
        setShowSearch(false); setQuery(''); setResults([])
      }
    } catch {}
    setAdding(false)
  }

  async function removeContact(sellerId: string) {
    try {
      const res = await fetch(`/api/properties/${propertyId}/sellers`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId }),
      })
      if (res.ok) setSellers(prev => prev.filter(s => s.id !== sellerId))
    } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider">
          <Users size={9} className="inline -mt-0.5 text-gunner-red" /> Contacts ({sellers.length})
        </p>
        <button onClick={() => setShowSearch(!showSearch)}
          className="text-[10px] font-medium text-gunner-red hover:text-gunner-red-dark flex items-center gap-0.5 transition-colors">
          {showSearch ? <X size={9} /> : <Plus size={9} />}
          {showSearch ? 'Cancel' : 'Add'}
        </button>
      </div>

      {showSearch && (
        <div className="mb-2 space-y-1.5">
          <input autoFocus value={query} onChange={e => searchContacts(e.target.value)}
            placeholder="Search GHL contacts..."
            className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-[10px] placeholder-txt-muted focus:outline-none" />
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-[10px]">
            {DRAWER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {searching && <p className="text-[10px] text-txt-muted">Searching...</p>}
          {results.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-1">
              {results.map(c => {
                const linked = sellers.some(s => s.ghlContactId === c.id)
                return (
                  <button key={c.id} onClick={() => !linked && addContact(c)} disabled={linked || adding}
                    className={`w-full text-left px-2 py-1 rounded text-[10px] ${linked ? 'bg-surface-tertiary text-txt-muted' : 'bg-surface-secondary hover:bg-surface-tertiary text-txt-primary'}`}>
                    <p className="font-medium">{titleCase(c.name)}{linked ? ' (linked)' : ''}</p>
                    <p className="text-txt-muted">{formatPhone(c.phone) || c.email || '—'}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {sellers.length === 0 ? (
        <p className="text-ds-fine text-txt-muted">No contacts linked</p>
      ) : (
        <div className="space-y-1.5">
          {sellers.map(s => (
            <div key={s.id} className="bg-surface-secondary rounded-[8px] px-2.5 py-2 group">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-ds-fine text-txt-primary font-medium">{titleCase(s.name)}</p>
                    <span className="text-[8px] font-medium text-gunner-red">{s.role}</span>
                  </div>
                  {s.phone && <p className="text-[10px] text-txt-secondary">{formatPhone(s.phone)}</p>}
                  {s.email && <p className="text-[10px] text-txt-secondary truncate">{s.email}</p>}
                </div>
                <button onClick={() => removeContact(s.id)}
                  className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-semantic-red transition-all shrink-0 mt-0.5">
                  <X size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Drawer Team Members (with add/remove) ─────────────────────────────────

const TEAM_ROLES = ['Admin', 'Lead Manager', 'Acquisition Manager', 'Disposition Manager']

function DrawerTeam({ propertyId, tenantSlug }: { propertyId: string; tenantSlug: string }) {
  const [members, setMembers] = useState<Array<{ id: string; userId: string; name: string; role: string; userRole: string; source: string }>>([])
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [showAdd, setShowAdd] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('Lead Manager')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setShowAdd(false)
    fetch(`/api/properties/${propertyId}/team`)
      .then(r => r.json())
      .then(d => { setMembers(d.members ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [propertyId])

  useEffect(() => {
    fetch(`/api/${tenantSlug}/dayhub/team-numbers`)
      .then(r => r.json())
      .then(d => {
        setAllUsers((d.numbers ?? []).map((n: { name: string; userId: string }) => ({
          id: n.userId, name: n.name, role: '',
        })))
      })
      .catch(() => {})
  }, [tenantSlug])

  async function addMember() {
    if (!selectedUserId) return
    const res = await fetch(`/api/properties/${propertyId}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
    })
    if (res.ok) {
      const data = await res.json()
      setMembers(prev => [...prev.filter(m => m.userId !== selectedUserId), data.member])
      setShowAdd(false)
      setSelectedUserId('')
    }
  }

  async function removeMember(userId: string) {
    await fetch(`/api/properties/${propertyId}/team`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setMembers(prev => prev.filter(m => m.userId !== userId))
  }

  // Users not yet on the team
  const availableUsers = allUsers.filter(u => !members.some(m => m.userId === u.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider">Team</p>
        <button onClick={() => setShowAdd(!showAdd)} className="text-txt-muted hover:text-gunner-red transition-colors">
          <Plus size={12} />
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface-secondary rounded-[8px] p-2.5 mb-2 space-y-1.5">
          <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
            className="w-full text-[10px] bg-white border rounded-[6px] px-2 py-1.5" style={{ borderColor: 'var(--border-medium)' }}>
            <option value="">Select team member...</option>
            {availableUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            className="w-full text-[10px] bg-white border rounded-[6px] px-2 py-1.5" style={{ borderColor: 'var(--border-medium)' }}>
            {TEAM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={addMember} disabled={!selectedUserId}
            className="w-full text-[10px] font-medium text-white bg-gunner-red hover:bg-gunner-red-dark disabled:opacity-50 rounded-[6px] py-1.5 transition-colors">
            Add to Team
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[10px] text-txt-muted">Loading...</p>
      ) : members.length === 0 ? (
        <p className="text-[10px] text-txt-muted italic">No team members assigned</p>
      ) : (
        <div className="space-y-1">
          {members.map(m => {
            const roleLabel = m.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
            const roleColor = m.role.includes('LEAD') || m.role === 'Lead Manager' ? 'bg-blue-100 text-blue-700'
              : m.role.includes('ACQUISITION') || m.role === 'Acquisition Manager' ? 'bg-green-100 text-green-700'
              : m.role.includes('DISPOSITION') || m.role === 'Disposition Manager' ? 'bg-orange-100 text-orange-700'
              : m.role.includes('ADMIN') || m.role === 'Admin' ? 'bg-gray-100 text-gray-700'
              : 'bg-gray-100 text-gray-600'
            return (
            <div key={m.userId} className="group flex items-center gap-2 bg-surface-secondary rounded-[8px] px-2.5 py-1.5 border-[0.5px]" style={{ borderColor: 'var(--border-light)' }}>
              <div className="w-5 h-5 rounded-full bg-white border-[0.5px] flex items-center justify-center shrink-0" style={{ borderColor: 'var(--border-medium)' }}>
                <Users size={9} className="text-txt-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-txt-primary truncate">{m.name}</p>
                <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${roleColor}`}>
                  {roleLabel.includes('Acquisition') ? 'Acq. Manager' : roleLabel.includes('Disposition') ? 'Dispo Manager' : roleLabel}
                </span>
              </div>
              <button onClick={() => removeMember(m.userId)}
                className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-semantic-red transition-all shrink-0">
                <X size={10} />
              </button>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── GHL Sync Toggle ────────────────────────────────────────────────────────
// Pause/resume whether GHL webhook stage updates flow to this property. Used
// after a split when one property continues following the shared GHL
// opportunity and the other needs to track independently. Saves optimistically,
// reverts on failure.
function GhlSyncToggle({ propertyId, initialLocked, onChange }: {
  propertyId: string
  initialLocked: boolean
  onChange: (locked: boolean) => void
}) {
  const [locked, setLocked] = useState(initialLocked)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLocked(initialLocked) }, [initialLocked, propertyId])

  async function toggle() {
    if (saving) return
    const next = !locked
    setLocked(next)
    setSaving(true)
    onChange(next)
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ghlSyncLocked: next }),
      })
      if (!res.ok) {
        setLocked(!next)
        onChange(!next)
        console.error('[GhlSyncToggle] PATCH failed:', await res.text())
      }
    } catch (err) {
      setLocked(!next)
      onChange(!next)
      console.error('[GhlSyncToggle] Error:', err)
    }
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={locked
        ? 'Sync paused — GHL stage changes will not update this property. Click to resume.'
        : 'Synced — GHL stage changes update this property. Click to pause.'}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-[8px] border-[0.5px] text-[10px] font-semibold transition-colors ${
        locked
          ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
          : 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100'
      }`}
    >
      {locked ? <Lock size={10} /> : <Unlock size={10} />}
      <span className="flex-1 text-left">{locked ? 'GHL sync paused' : 'GHL sync active'}</span>
      <span className="text-[9px] opacity-70">{locked ? 'Click to resume' : 'Click to pause'}</span>
    </button>
  )
}

// ─── Drawer Inline AI ───────────────────────────────────────────────────────

function DrawerInlineAI({ propertyId }: { propertyId: string }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])
  const [loading, setLoading] = useState(false)

  // Reset chat when property changes
  useEffect(() => { setInput(''); setMessages([]); setLoading(false) }, [propertyId])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: text }].map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: 'text' in m ? m.text : (m as { content: string }).content,
          })),
          propertyId,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply ?? 'No response' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to connect' }])
    }
    setLoading(false)
  }

  return (
    <div>
      <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">AI Actions</p>

      {messages.length > 0 && (
        <div className="space-y-1.5 mb-1.5 max-h-[150px] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`text-[10px] px-2 py-1.5 rounded-[6px] ${
              m.role === 'user' ? 'bg-gunner-red text-white ml-3' : 'bg-surface-secondary text-txt-primary mr-3'
            }`}>{m.text}</div>
          ))}
          {loading && (
            <div className="bg-surface-secondary rounded-[6px] px-2 py-1.5 mr-3">
              <span className="text-[10px] text-txt-muted">Thinking...</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder="Send SMS, email, analyze..."
          className="flex-1 bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-[10px] placeholder-txt-muted focus:outline-none" />
        <button onClick={send} disabled={!input.trim() || loading}
          className="bg-semantic-purple hover:bg-semantic-purple/90 disabled:opacity-40 text-white px-2.5 rounded-[6px] transition-colors">
          <Send size={10} />
        </button>
      </div>
    </div>
  )
}
