'use client'
// components/inventory/inventory-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, Phone, CheckSquare, Search, Plus,
  ExternalLink, X, MessageSquare, Send, FileText, User, Users,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatPhone } from '@/lib/format'
import { PipelineStageTabs } from './PipelineStageTabs'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'

interface Property {
  id: string; address: string; city: string; state: string; zip: string
  status: string; arv: string | null; askingPrice: string | null
  mao: string | null; contractPrice: string | null; assignmentFee: string | null
  currentOffer: string | null; highestOffer: string | null; acceptedPrice: string | null; finalProfit: string | null
  fieldSources: Record<string, string>
  createdAt: string
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
}

export function InventoryClient({ properties, statusCounts, tenantSlug, canManage, ghlLocationId }: {
  properties: Property[]
  statusCounts: Record<string, number>
  tenantSlug: string
  canManage: boolean
  ghlLocationId?: string
}) {
  const [selectedStage, setSelectedStage] = useState<AppStage | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [search, setSearch] = useState('')

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
  const leadSources = [...new Set(properties.map(p => p.leadSource).filter(Boolean))] as string[]
  const markets = [...new Set(properties.map(p => p.market).filter(Boolean))] as string[]
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
            <PropertyTable
              properties={filtered}
              tenantSlug={tenantSlug}
              selectedId={selectedPropertyId}
              onSelect={setSelectedPropertyId}
              ghlLocationId={ghlLocationId}
            />
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

// ─── Property Drawer (quick detail on row click) ─────────────────────────────

// Source-based color styles for drawer inline edit cards
function drawerSourceStyles(source: string | null) {
  if (source === 'ai') return { bg: 'bg-blue-50 border-[0.5px] border-blue-300', label: 'text-blue-700', value: 'text-blue-800' }
  if (source === 'user') return { bg: 'bg-green-50 border-[0.5px] border-green-300', label: 'text-green-700', value: 'text-green-800' }
  return { bg: 'bg-surface-secondary', label: 'text-txt-muted', value: 'text-txt-primary' }
}

function DrawerEditCard({ label, value, field, propertyId, source, onSaved }: {
  label: string; value: string | null; field: string; propertyId: string
  source?: string | null; onSaved: (field: string, val: string | null, src: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    const raw = editValue.trim()
    if (raw === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    try {
      const newVal = raw || null
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVal, fieldSources: newVal ? { [field]: 'user' } : { [field]: '' } }),
      })
      if (res.ok) onSaved(field, newVal, newVal ? 'user' : '')
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  const displayValue = value ? `$${Number(value).toLocaleString()}` : null
  const s = drawerSourceStyles(source || null)

  if (editing) {
    return (
      <div className={`${s.bg} rounded-[8px] px-2.5 py-2`}>
        <p className={`text-[8px] font-semibold uppercase tracking-wider ${s.label}`}>{label}</p>
        <input autoFocus type="number" value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full bg-white border-[0.5px] border-gunner-red/30 rounded px-1.5 py-0.5 text-ds-fine font-semibold text-txt-primary mt-0.5 focus:outline-none"
          disabled={saving} placeholder="0"
        />
      </div>
    )
  }

  return (
    <div onClick={() => { setEditValue(value ?? ''); setEditing(true) }}
      className={`${s.bg} rounded-[8px] px-2.5 py-2 cursor-pointer hover:ring-1 hover:ring-gunner-red/20 transition-all group`}>
      <p className={`text-[8px] font-semibold uppercase tracking-wider flex items-center justify-between ${s.label}`}>
        {label}
      </p>
      <p className={`text-ds-fine font-semibold mt-0.5 ${displayValue ? s.value : 'text-txt-muted'}`}>
        {displayValue ?? '—'}
      </p>
    </div>
  )
}

function PropertyDrawer({ property: p, tenantSlug, ghlLocationId, onClose }: {
  property: Property
  tenantSlug: string
  ghlLocationId?: string
  onClose: () => void
}) {
  const appStage = STATUS_TO_APP_STAGE[p.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const dom = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
  const domColor = dom < 6 ? 'text-green-600 bg-green-50' : dom <= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'

  const [vals, setVals] = useState({
    askingPrice: p.askingPrice, mao: p.mao, currentOffer: p.currentOffer,
    contractPrice: p.contractPrice, highestOffer: p.highestOffer, acceptedPrice: p.acceptedPrice,
    assignmentFee: p.assignmentFee, finalProfit: p.finalProfit,
  })
  const [sources, setSources] = useState<Record<string, string>>(p.fieldSources ?? {})

  function handleSaved(field: string, val: string | null, src: string) {
    setVals(prev => ({ ...prev, [field]: val }))
    setSources(prev => {
      const next = { ...prev }
      if (src) next[field] = src; else delete next[field]
      return next
    })
  }

  const spread = vals.acceptedPrice && vals.contractPrice
    ? Number(vals.acceptedPrice) - Number(vals.contractPrice) : null

  return (
    <div className="w-[420px] shrink-0 bg-white border-l border-[rgba(0,0,0,0.08)] shadow-sm flex flex-col max-h-[calc(100vh-120px)] sticky top-[60px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium px-2 py-[2px] rounded-full ${badgeColor}`}>
              {APP_STAGE_LABELS[appStage]}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-[2px] rounded-[4px] ${domColor}`}>{dom}d</span>
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
        <h2 className="text-ds-label font-semibold text-txt-primary">{p.address}</h2>
        <p className="text-ds-fine text-txt-secondary">{p.city}, {p.state} {p.zip}</p>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Row 1 — Pricing Intent */}
        <div>
          <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Pricing Intent</p>
          <div className="grid grid-cols-3 gap-2">
            <DrawerEditCard label="ASKING" value={vals.askingPrice} field="askingPrice" propertyId={p.id} source={sources.askingPrice} onSaved={handleSaved} />
            <DrawerEditCard label="MAO" value={vals.mao} field="mao" propertyId={p.id} source={sources.mao} onSaved={handleSaved} />
            <DrawerEditCard label="CURRENT OFFER" value={vals.currentOffer} field="currentOffer" propertyId={p.id} source={sources.currentOffer} onSaved={handleSaved} />
          </div>
        </div>

        {/* Row 2 — Deal Outcomes */}
        <div>
          <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Deal Outcomes</p>
          <div className="grid grid-cols-3 gap-2">
            <DrawerEditCard label="CONTRACT" value={vals.contractPrice} field="contractPrice" propertyId={p.id} source={sources.contractPrice} onSaved={handleSaved} />
            <DrawerEditCard label="HIGHEST OFFER" value={vals.highestOffer} field="highestOffer" propertyId={p.id} source={sources.highestOffer} onSaved={handleSaved} />
            <DrawerEditCard label="ACCEPTED" value={vals.acceptedPrice} field="acceptedPrice" propertyId={p.id} source={sources.acceptedPrice} onSaved={handleSaved} />
          </div>
        </div>

        {/* Row 3 — Profit Summary */}
        <div>
          <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1.5">Profit Summary</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-secondary rounded-[8px] px-2.5 py-2">
              <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider">EST. SPREAD</p>
              <p className={`text-ds-fine font-semibold mt-0.5 ${spread != null ? (spread > 0 ? 'text-semantic-green' : 'text-semantic-red') : 'text-txt-muted'}`}>
                {spread != null ? `$${spread.toLocaleString()}` : '—'}
              </p>
            </div>
            <DrawerEditCard label="ASSIGN. FEE" value={vals.assignmentFee} field="assignmentFee" propertyId={p.id} source={sources.assignmentFee} onSaved={handleSaved} />
            <DrawerEditCard label="FINAL PROFIT" value={vals.finalProfit} field="finalProfit" propertyId={p.id} source={sources.finalProfit} onSaved={handleSaved} />
          </div>
        </div>

        {/* Contacts — with add */}
        <DrawerContacts propertyId={p.id} initialSellers={p.sellers} />

        {/* Assigned */}
        {p.assignedTo && (
          <div>
            <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider mb-1">Assigned To</p>
            <p className="text-ds-fine text-txt-primary font-medium">{p.assignedTo.name}</p>
          </div>
        )}

        {/* Quick actions — SMS + Email */}
        {p.ghlContactId && <DrawerQuickActions ghlContactId={p.ghlContactId} />}

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
                    <p className="font-medium">{c.name}{linked ? ' (linked)' : ''}</p>
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
                    <p className="text-ds-fine text-txt-primary font-medium">{s.name}</p>
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

// ─── Drawer Quick Actions ───────────────────────────────────────────────────

function DrawerQuickActions({ ghlContactId }: { ghlContactId: string }) {
  const [smsText, setSmsText] = useState('')
  const [emailText, setEmailText] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  async function sendAction(type: string, payload: Record<string, string>) {
    setSending(true)
    try {
      const res = await fetch('/api/ghl/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contactId: ghlContactId, ...payload }),
      })
      setMsg(res.ok ? 'Sent!' : 'Failed')
    } catch { setMsg('Error') }
    setSending(false)
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="space-y-2">
      <p className="text-[8px] font-semibold text-txt-muted uppercase tracking-wider">Quick Actions</p>
      <div className="space-y-1.5">
        <textarea value={smsText} onChange={e => setSmsText(e.target.value)}
          placeholder="Send SMS..." rows={2}
          className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-[10px] placeholder-txt-muted focus:outline-none resize-none" />
        <button onClick={() => { sendAction('send_sms', { message: smsText }); setSmsText('') }}
          disabled={!smsText.trim() || sending}
          className="w-full bg-semantic-green hover:bg-semantic-green/90 disabled:opacity-40 text-white text-[10px] font-semibold rounded-[6px] py-1.5 transition-colors flex items-center justify-center gap-1">
          <MessageSquare size={10} /> {sending ? 'Sending...' : 'Send SMS'}
        </button>
        <textarea value={emailText} onChange={e => setEmailText(e.target.value)}
          placeholder="Send email..." rows={2}
          className="w-full bg-surface-secondary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] px-2.5 py-1.5 text-[10px] placeholder-txt-muted focus:outline-none resize-none" />
        <button onClick={() => { sendAction('send_email', { message: emailText }); setEmailText('') }}
          disabled={!emailText.trim() || sending}
          className="w-full bg-semantic-blue hover:bg-semantic-blue/90 disabled:opacity-40 text-white text-[10px] font-semibold rounded-[6px] py-1.5 transition-colors flex items-center justify-center gap-1">
          <Send size={10} /> {sending ? 'Sending...' : 'Send Email'}
        </button>
      </div>
      {msg && <p className="text-[10px] text-gunner-red text-center">{msg}</p>}
    </div>
  )
}
