'use client'
// components/inventory/inventory-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, Phone, CheckSquare, Search, Plus, List, LayoutGrid,
  Trash2, ExternalLink, X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { PipelineStageTabs } from './PipelineStageTabs'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'

interface Property {
  id: string; address: string; city: string; state: string; zip: string
  status: string; arv: string | null; askingPrice: string | null
  mao: string | null; contractPrice: string | null; assignmentFee: string | null; createdAt: string
  sellerName: string | null; sellerPhone: string | null
  assignedTo: { id: string; name: string } | null
  callCount: number; taskCount: number
  ghlContactId: string | null
  leadSource: string | null
  ghlStageName: string | null
  market: string | null
  lastOfferDate: string | null
  lastContactedDate: string | null
}

type ViewMode = 'cards' | 'table'

export function InventoryClient({ properties, statusCounts, tenantSlug, canManage, ghlLocationId }: {
  properties: Property[]
  statusCounts: Record<string, number>
  tenantSlug: string
  canManage: boolean
  ghlLocationId?: string
}) {
  const [selectedStage, setSelectedStage] = useState<AppStage | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)

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
    if (selectedStage) {
      const propStage = STATUS_TO_APP_STAGE[p.status]
      if (propStage !== selectedStage) return false
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
  const leadSources = [...new Set(properties.map(p => p.leadSource).filter(Boolean))] as string[]
  const selectedProperty = selectedPropertyId ? properties.find(p => p.id === selectedPropertyId) : null

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ds-page font-semibold text-txt-primary">Inventory</h1>
          <p className="text-ds-body text-txt-secondary mt-1">{activeCount} active properties</p>
        </div>
        {canManage && (
          <Link
            href={`/${tenantSlug}/inventory/new`}
            className="flex items-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-body font-semibold px-4 py-[9px] rounded-[10px] transition-colors"
          >
            <Plus size={14} /> Add property
          </Link>
        )}
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

        {/* View toggle */}
        <div className="flex bg-surface-tertiary rounded-[10px] p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-[8px] transition-all ${viewMode === 'table' ? 'bg-white shadow-ds-float text-txt-primary' : 'text-txt-muted hover:text-txt-secondary'}`}
          >
            <List size={14} />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-[8px] transition-all ${viewMode === 'cards' ? 'bg-white shadow-ds-float text-txt-primary' : 'text-txt-muted hover:text-txt-secondary'}`}
          >
            <LayoutGrid size={14} />
          </button>
        </div>

        {/* Missing source alert */}
        {missingSourceCount > 0 && (
          <button
            onClick={() => setSearch('__missing_source__')}
            className="flex items-center gap-1.5 text-ds-fine font-medium bg-amber-50 text-amber-700 border-[0.5px] border-amber-200 px-3 py-[7px] rounded-[10px] hover:bg-amber-100 transition-colors"
          >
            ⚠️ {missingSourceCount} Missing Source
          </button>
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

      {/* Content — flex split: list + optional detail panel */}
      <div className="flex gap-0">
        <div className={`${selectedProperty ? 'flex-1 min-w-0' : 'w-full'} transition-all`}>
          {filtered.length === 0 ? (
            <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
              <Building2 size={24} className="text-txt-muted mx-auto mb-3" />
              <p className="text-txt-secondary text-ds-body">
                {search || selectedStage ? 'No properties match your filter' : 'No properties yet'}
              </p>
            </div>
          ) : viewMode === 'table' ? (
            <PropertyTable
              properties={filtered}
              tenantSlug={tenantSlug}
              selectedId={selectedPropertyId}
              onSelect={setSelectedPropertyId}
              ghlLocationId={ghlLocationId}
            />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <PropertyCard key={p.id} property={p} tenantSlug={tenantSlug} />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel — in-flow, not fixed */}
        {selectedProperty && (
          <PropertyDrawer
            property={selectedProperty}
            tenantSlug={tenantSlug}
            ghlLocationId={ghlLocationId}
            onClose={() => setSelectedPropertyId(null)}
          />
        )}
      </div>
    </div>
  )
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

function cleanStageName(raw: string): string {
  return raw
    .replace(/\s*\(\d+\)\s*/g, '')  // Remove (1), (2), etc.
    .replace(/\s*\((\d+)\)\s*/g, '') // Remove (3) variants
    .replace(/\s+/g, ' ')            // Collapse whitespace
    .trim()
}

const MARKET_COLORS: Record<string, string> = {
  'Nashville': 'bg-red-100 text-red-700',
  'Columbia': 'bg-teal-100 text-teal-700',
  'Knoxville': 'bg-indigo-100 text-indigo-700',
  'Chattanooga': 'bg-amber-100 text-amber-700',
  'Global': 'bg-gray-100 text-gray-600',
}

function PropertyTable({ properties, tenantSlug, selectedId, onSelect }: {
  properties: Property[]
  tenantSlug: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  ghlLocationId?: string
}) {
  return (
    <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
      {properties.map(p => {
        const appStage = STATUS_TO_APP_STAGE[p.status] ?? 'acquisition.new_lead'
        const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
        const isSelected = selectedId === p.id
        const sourceColor = p.leadSource ? getSourceColor(p.leadSource) : ''
        const marketColor = MARKET_COLORS[p.market ?? ''] ?? 'bg-surface-tertiary text-txt-secondary'
        const dom = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
        const domColor = dom < 6 ? 'text-green-600 bg-green-50' : dom <= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'

        return (
          <button
            key={p.id}
            onClick={() => onSelect(isSelected ? null : p.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[rgba(0,0,0,0.04)] hover:bg-surface-secondary transition-colors ${
              isSelected ? 'bg-gunner-red-light' : ''
            }`}
          >
            {/* Days in stage */}
            <span className={`text-[11px] font-bold px-2 py-1 rounded-[6px] whitespace-nowrap shrink-0 ${domColor}`}>
              {dom}d
            </span>
            {/* Address */}
            <div className="min-w-0 shrink-0" style={{ maxWidth: '40%' }}>
              <p className="text-ds-body font-medium text-txt-primary truncate">{p.address}</p>
              <p className="text-ds-fine text-txt-muted">{p.city}, {p.state} {p.zip}</p>
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

// ─── Property Card (grid view) ───────────────────────────────────────────────

function PropertyCard({ property: p, tenantSlug }: { property: Property; tenantSlug: string }) {
  const appStage = STATUS_TO_APP_STAGE[p.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null
  const dom = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
  const domColor = dom <= 7 ? 'text-green-600' : dom <= 30 ? 'text-amber-500' : 'text-red-600'

  return (
    <Link
      href={`/${tenantSlug}/inventory/${p.id}`}
      className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.14)] hover:shadow-ds-float rounded-[14px] p-5 transition-all flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <span className={`text-ds-fine font-medium px-2 py-[3px] rounded-full ${badgeColor}`}>
          {APP_STAGE_LABELS[appStage]}
        </span>
        <span className="flex-1" />
        <span className={`text-ds-fine font-medium ${domColor}`}>{dom}d</span>
      </div>
      <div>
        <p className="text-ds-card font-medium text-txt-primary truncate">{p.address}</p>
        <p className="text-ds-fine text-txt-muted">{p.city}, {p.state} {p.zip}</p>
      </div>
      {p.sellerName && <p className="text-ds-body text-txt-secondary truncate">{p.sellerName}</p>}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[rgba(0,0,0,0.06)]">
        {fmt(p.askingPrice) && <div><p className="text-ds-fine text-txt-muted">Asking</p><p className="text-ds-label font-medium text-txt-primary">{fmt(p.askingPrice)}</p></div>}
        {fmt(p.arv) && <div><p className="text-ds-fine text-txt-muted">ARV</p><p className="text-ds-label font-medium text-semantic-green">{fmt(p.arv)}</p></div>}
        {fmt(p.mao) && <div><p className="text-ds-fine text-txt-muted">MAO</p><p className="text-ds-label font-medium text-semantic-amber">{fmt(p.mao)}</p></div>}
        {fmt(p.assignmentFee) && <div><p className="text-ds-fine text-txt-muted">Assignment</p><p className="text-ds-label font-medium text-semantic-blue">{fmt(p.assignmentFee)}</p></div>}
      </div>
      <div className="flex items-center justify-between text-ds-fine text-txt-muted">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Phone size={10} />{p.callCount}</span>
          <span className="flex items-center gap-1"><CheckSquare size={10} />{p.taskCount}</span>
        </div>
        {p.assignedTo && <span className="text-txt-secondary">{p.assignedTo.name}</span>}
      </div>
    </Link>
  )
}

// ─── Property Drawer (quick detail on row click) ─────────────────────────────

function PropertyDrawer({ property: p, tenantSlug, ghlLocationId, onClose }: {
  property: Property
  tenantSlug: string
  ghlLocationId?: string
  onClose: () => void
}) {
  const appStage = STATUS_TO_APP_STAGE[p.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : '—'
  const dom = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
  const domColor = dom <= 7 ? 'text-green-600' : dom <= 30 ? 'text-amber-500' : 'text-red-600'

  return (
    <div className="w-[420px] shrink-0 bg-white border-l border-[rgba(0,0,0,0.08)] shadow-sm flex flex-col max-h-[calc(100vh-120px)] sticky top-[60px]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full ${badgeColor}`}>
              {APP_STAGE_LABELS[appStage]}
            </span>
            <span className={`text-ds-fine font-medium ${domColor}`}>{dom}d</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/${tenantSlug}/inventory/${p.id}`}
              className="text-ds-fine text-txt-muted hover:text-gunner-red transition-colors"
            >
              Full detail
            </Link>
            <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <h2 className="text-ds-section font-semibold text-txt-primary">{p.address}</h2>
        <p className="text-ds-body text-txt-secondary">{p.city}, {p.state} {p.zip}</p>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Seller */}
        {p.sellerName && (
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Seller</p>
            <p className="text-ds-body text-txt-primary font-medium">{p.sellerName}</p>
            {p.sellerPhone && <p className="text-ds-fine text-txt-secondary">{p.sellerPhone}</p>}
          </div>
        )}

        {/* Financials */}
        <div>
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Financials</p>
          <div className="grid grid-cols-2 gap-3">
            <FinCard label="Asking" value={fmt(p.askingPrice)} />
            <FinCard label="ARV" value={fmt(p.arv)} color="text-semantic-green" />
            <FinCard label="Contract" value={fmt(p.contractPrice)} />
            <FinCard label="MAO" value={fmt(p.mao)} color="text-semantic-amber" />
            <FinCard label="Assignment Fee" value={fmt(p.assignmentFee)} color="text-semantic-blue" />
            <FinCard label="DOM" value={`${dom} days`} color={domColor} />
          </div>
        </div>

        {/* Assigned */}
        {p.assignedTo && (
          <div>
            <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Assigned To</p>
            <p className="text-ds-body text-txt-primary">{p.assignedTo.name}</p>
          </div>
        )}

        {/* Activity summary */}
        <div>
          <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Activity</p>
          <div className="flex gap-4 text-ds-body text-txt-secondary">
            <span className="flex items-center gap-1.5"><Phone size={12} className="text-txt-muted" /> {p.callCount} calls</span>
            <span className="flex items-center gap-1.5"><CheckSquare size={12} className="text-txt-muted" /> {p.taskCount} tasks</span>
          </div>
        </div>

        {/* Quick links */}
        <div className="flex gap-2 pt-2">
          <Link
            href={`/${tenantSlug}/inventory/${p.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 bg-gunner-red hover:bg-gunner-red-dark text-white text-ds-fine font-semibold py-2.5 rounded-[10px] transition-colors"
          >
            View Full Detail
          </Link>
          {p.ghlContactId && ghlLocationId && (
            <a
              href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${p.ghlContactId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 bg-surface-secondary hover:bg-surface-tertiary text-txt-secondary text-ds-fine font-semibold py-2.5 px-4 rounded-[10px] border-[0.5px] border-[rgba(0,0,0,0.08)] transition-colors"
            >
              <ExternalLink size={12} /> GHL
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function FinCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const isDash = value === '—'
  return (
    <div className="bg-surface-secondary rounded-[10px] px-3 py-2">
      <p className="text-[10px] text-txt-muted uppercase">{label}</p>
      <p className={`text-ds-label font-semibold ${isDash ? 'text-semantic-red' : color ?? 'text-txt-primary'}`}>{value}</p>
    </div>
  )
}
