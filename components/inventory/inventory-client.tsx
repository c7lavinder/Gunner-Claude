'use client'
// components/inventory/inventory-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, Phone, CheckSquare, Search, Plus, ChevronRight,
  UserPlus, CalendarCheck, FileText, Handshake,
  Package, DollarSign, XCircle, Clock, ArrowRightLeft,
  Megaphone, PauseCircle, Receipt, BadgeCheck,
} from 'lucide-react'

interface Property {
  id: string; address: string; city: string; state: string; zip: string
  status: string; arv: string | null; askingPrice: string | null
  mao: string | null; assignmentFee: string | null; createdAt: string
  sellerName: string | null; sellerPhone: string | null
  assignedTo: { id: string; name: string } | null
  callCount: number; taskCount: number
}

// ─── Pipeline stages (active deal flow) ──────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'NEW_LEAD',        label: 'New Lead',   icon: UserPlus,      step: 1 },
  { key: 'APPOINTMENT_SET', label: 'Appt Set',   icon: CalendarCheck, step: 2 },
  { key: 'OFFER_MADE',      label: 'Offer Made', icon: DollarSign,    step: 3 },
  { key: 'UNDER_CONTRACT',  label: 'Contract',   icon: Handshake,     step: 4 },
  { key: 'SOLD',            label: 'Closed',     icon: BadgeCheck,    step: 5 },
]

// ─── Disposition pipeline ────────────────────────────────────────────────────

const DISPO_STAGES = [
  { key: 'IN_DISPOSITION',   label: 'New Deal',        icon: Package,     step: 1 },
  { key: 'DISPO_PUSHED',     label: 'Pushed Out',      icon: Megaphone,   step: 2 },
  { key: 'DISPO_OFFERS',     label: 'Offers Received', icon: Receipt,     step: 3 },
  { key: 'DISPO_CONTRACTED', label: 'Contracted',      icon: Handshake,   step: 4 },
  { key: 'DISPO_CLOSED',     label: 'Closed',          icon: BadgeCheck,  step: 5 },
]

// ─── Long-term / terminal buckets ────────────────────────────────────────────

const LONG_TERM_BUCKETS = [
  { key: 'FOLLOW_UP', label: 'Follow Up', icon: Clock },
  { key: 'DEAD', label: 'Dead', icon: XCircle },
]

// ─── Stage colors ────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, { ring: string; bg: string; text: string; iconBg: string }> = {
  NEW_LEAD:              { ring: 'ring-semantic-blue',   bg: 'bg-semantic-blue',   text: 'text-semantic-blue',   iconBg: 'bg-semantic-blue-bg' },
  APPOINTMENT_SET:       { ring: 'ring-semantic-purple', bg: 'bg-semantic-purple', text: 'text-semantic-purple', iconBg: 'bg-semantic-purple-bg' },
  OFFER_MADE:            { ring: 'ring-semantic-amber',  bg: 'bg-semantic-amber',  text: 'text-semantic-amber',  iconBg: 'bg-semantic-amber-bg' },
  UNDER_CONTRACT:        { ring: 'ring-semantic-green',  bg: 'bg-semantic-green',  text: 'text-semantic-green',  iconBg: 'bg-semantic-green-bg' },
  SOLD:                  { ring: 'ring-semantic-green',  bg: 'bg-semantic-green',  text: 'text-semantic-green',  iconBg: 'bg-semantic-green-bg' },
  // Disposition stages
  IN_DISPOSITION:        { ring: 'ring-semantic-blue',   bg: 'bg-semantic-blue',   text: 'text-semantic-blue',   iconBg: 'bg-semantic-blue-bg' },
  DISPO_PUSHED:          { ring: 'ring-semantic-amber',  bg: 'bg-semantic-amber',  text: 'text-semantic-amber',  iconBg: 'bg-semantic-amber-bg' },
  DISPO_OFFERS:          { ring: 'ring-semantic-purple', bg: 'bg-semantic-purple', text: 'text-semantic-purple', iconBg: 'bg-semantic-purple-bg' },
  DISPO_CONTRACTED:      { ring: 'ring-semantic-green',  bg: 'bg-semantic-green',  text: 'text-semantic-green',  iconBg: 'bg-semantic-green-bg' },
  DISPO_CLOSED:          { ring: 'ring-semantic-green',  bg: 'bg-semantic-green',  text: 'text-semantic-green',  iconBg: 'bg-semantic-green-bg' },
  FOLLOW_UP:             { ring: 'ring-semantic-amber',  bg: 'bg-semantic-amber',  text: 'text-semantic-amber',  iconBg: 'bg-semantic-amber-bg' },
  // Terminal
  CONTACTED:             { ring: 'ring-semantic-amber',  bg: 'bg-semantic-amber',  text: 'text-semantic-amber',  iconBg: 'bg-semantic-amber-bg' },
  APPOINTMENT_COMPLETED: { ring: 'ring-semantic-purple', bg: 'bg-semantic-purple', text: 'text-semantic-purple', iconBg: 'bg-semantic-purple-bg' },
  DEAD:                  { ring: 'ring-txt-muted',       bg: 'bg-txt-muted',       text: 'text-txt-muted',       iconBg: 'bg-surface-tertiary' },
}

const STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead', APPOINTMENT_SET: 'Appt Set',
  OFFER_MADE: 'Offer Made', UNDER_CONTRACT: 'Contract',
  SOLD: 'Closed', IN_DISPOSITION: 'New Deal',
  DISPO_PUSHED: 'Pushed Out', DISPO_OFFERS: 'Offers Received',
  DISPO_CONTRACTED: 'Contracted', DISPO_CLOSED: 'Closed',
  FOLLOW_UP: 'Follow Up',
  CONTACTED: 'Contacted', APPOINTMENT_COMPLETED: 'Appt Done',
  DEAD: 'Dead',
}

// ─── Pipeline Row (shared between Acquisition + Disposition) ─────────────────

function PipelineRow({ label, icon, stages, statusCounts, activeStatus, onSelect }: {
  label: string
  icon: React.ReactNode
  stages: typeof PIPELINE_STAGES
  statusCounts: Record<string, number>
  activeStatus: string | null
  onSelect: (key: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-txt-muted">{icon}</span>
        <span className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-start justify-between">
        {stages.map((stage, i) => {
          const count = statusCounts[stage.key] ?? 0
          const isActive = activeStatus === stage.key
          const colors = STAGE_COLORS[stage.key]
          const Icon = stage.icon
          return (
            <div key={stage.key} className="flex items-start flex-1 min-w-0">
              <button
                onClick={() => onSelect(stage.key)}
                className="flex flex-col items-center gap-1 w-full"
              >
                {/* Circle */}
                <div className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isActive
                    ? `${colors.bg} shadow-md ring-2 ring-white`
                    : count > 0
                      ? `${colors.iconBg} hover:shadow-sm hover:scale-105`
                      : 'bg-surface-tertiary'
                }`}>
                  <Icon size={15} className={isActive ? 'text-white' : count > 0 ? colors.text : 'text-txt-muted'} />
                  {count > 0 && (
                    <span className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white rounded-full px-0.5 ${colors.bg} ring-[1.5px] ring-white`}>
                      {count}
                    </span>
                  )}
                </div>
                {/* Label */}
                <div className="text-center">
                  <p className={`text-[9px] font-semibold leading-tight ${isActive ? colors.text : count > 0 ? 'text-txt-primary' : 'text-txt-muted'}`}>
                    {stage.label}
                  </p>
                  <p className="text-[8px] text-txt-muted">Step {stage.step}</p>
                </div>
              </button>
              {/* Connecting line */}
              {i < stages.length - 1 && (
                <div className="flex-1 flex items-center pt-[18px] px-0.5 min-w-[10px]">
                  <div className={`h-[1.5px] w-full rounded-full ${
                    (statusCounts[stages[i + 1].key] ?? 0) > 0
                      ? 'bg-[rgba(0,0,0,0.12)]'
                      : 'bg-[rgba(0,0,0,0.06)]'
                  }`} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function InventoryClient({ properties, statusCounts, tenantSlug, canManage }: {
  properties: Property[]
  statusCounts: Record<string, number>
  tenantSlug: string
  canManage: boolean
}) {
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = properties.filter((p) => {
    if (activeStatus && p.status !== activeStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.sellerName ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const activeCount = properties.filter(p => !['SOLD', 'DEAD'].includes(p.status)).length

  return (
    <div className="space-y-6 max-w-7xl">
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

      {/* Pipeline visualization */}
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] px-5 pt-6 pb-5 space-y-4">
        {/* Acquisition pipeline */}
        <PipelineRow
          label="Acquisition"
          icon={<ChevronRight size={12} />}
          stages={PIPELINE_STAGES}
          statusCounts={statusCounts}
          activeStatus={activeStatus}
          onSelect={(key) => setActiveStatus(activeStatus === key ? null : key)}
        />

        {/* Disposition pipeline */}
        <div className="border-t border-[rgba(0,0,0,0.06)] pt-4">
          <PipelineRow
            label="Disposition"
            icon={<ArrowRightLeft size={12} />}
            stages={DISPO_STAGES}
            statusCounts={statusCounts}
            activeStatus={activeStatus}
            onSelect={(key) => setActiveStatus(activeStatus === key ? null : key)}
          />
        </div>

        {/* Long-term buckets */}
        <div className="border-t border-[rgba(0,0,0,0.06)] pt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={10} className="text-txt-muted" />
            <span className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider">Long-Term</span>
          </div>
          <div className="flex gap-2">
            {LONG_TERM_BUCKETS.map(bucket => {
              const count = statusCounts[bucket.key] ?? 0
              const isActive = activeStatus === bucket.key
              const colors = STAGE_COLORS[bucket.key]
              const Icon = bucket.icon
              return (
                <button
                  key={bucket.key}
                  onClick={() => setActiveStatus(isActive ? null : bucket.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-[10px] border-[0.5px] transition-all ${
                    isActive
                      ? `${colors.iconBg} border-transparent shadow-sm ring-2 ${colors.ring}`
                      : 'bg-surface-secondary border-[rgba(0,0,0,0.06)] hover:border-[rgba(0,0,0,0.14)] hover:shadow-ds-float'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${colors.iconBg}`}>
                    <Icon size={13} className={colors.text} />
                  </div>
                  <div className="text-left">
                    <p className={`text-[11px] font-semibold ${isActive ? colors.text : 'text-txt-primary'}`}>{bucket.label}</p>
                    <p className="text-[9px] text-txt-muted">{count}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-4 py-[9px] max-w-md">
        <Search size={14} className="text-txt-muted shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address, city, seller..."
          className="bg-transparent text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none flex-1"
        />
      </div>

      {/* Active filter label */}
      {activeStatus && (
        <div className="flex items-center gap-2">
          <span className={`text-ds-body font-semibold ${STAGE_COLORS[activeStatus]?.text ?? 'text-txt-primary'}`}>
            {STATUS_LABELS[activeStatus]} ({statusCounts[activeStatus] ?? 0})
          </span>
          <button
            onClick={() => setActiveStatus(null)}
            className="text-ds-fine text-txt-muted hover:text-txt-secondary underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Property grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
          <Building2 size={24} className="text-txt-muted mx-auto mb-3" />
          <p className="text-txt-secondary text-ds-body">
            {search || activeStatus ? 'No properties match your filter' : 'No properties yet \u2014 they appear here when contacts enter your trigger stage in GHL'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} tenantSlug={tenantSlug} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Property Card ───────────────────────────────────────────────────────────

function PropertyCard({ property: p, tenantSlug }: { property: Property; tenantSlug: string }) {
  const colors = STAGE_COLORS[p.status] ?? STAGE_COLORS.DEAD
  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null

  return (
    <Link
      href={`/${tenantSlug}/inventory/${p.id}`}
      className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.14)] hover:shadow-ds-float rounded-[14px] p-5 transition-all flex flex-col gap-3"
    >
      {/* Address + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ds-card font-medium text-txt-primary truncate">{p.address}</p>
          <p className="text-ds-fine text-txt-muted">{p.city}, {p.state} {p.zip}</p>
        </div>
        <span className={`text-ds-fine font-medium px-2 py-[3px] rounded-[9999px] shrink-0 ${colors.text} ${colors.iconBg}`}>
          {STATUS_LABELS[p.status]}
        </span>
      </div>

      {/* Seller */}
      {p.sellerName && (
        <div className="text-ds-body text-txt-secondary">
          Seller: <span className="text-txt-primary font-medium">{p.sellerName}</span>
          {p.sellerPhone && <span className="text-txt-muted ml-2">{p.sellerPhone}</span>}
        </div>
      )}

      {/* Financials */}
      <div className="grid grid-cols-2 gap-3">
        {fmt(p.askingPrice) && (
          <div>
            <p className="text-ds-fine text-txt-muted">Asking</p>
            <p className="text-ds-label font-medium text-txt-primary">{fmt(p.askingPrice)}</p>
          </div>
        )}
        {fmt(p.arv) && (
          <div>
            <p className="text-ds-fine text-txt-muted">ARV</p>
            <p className="text-ds-label font-medium text-semantic-green">{fmt(p.arv)}</p>
          </div>
        )}
        {fmt(p.mao) && (
          <div>
            <p className="text-ds-fine text-txt-muted">MAO</p>
            <p className="text-ds-label font-medium text-semantic-amber">{fmt(p.mao)}</p>
          </div>
        )}
        {fmt(p.assignmentFee) && (
          <div>
            <p className="text-ds-fine text-txt-muted">Assignment fee</p>
            <p className="text-ds-label font-medium text-semantic-blue">{fmt(p.assignmentFee)}</p>
          </div>
        )}
      </div>

      {/* Footer: activity counts + assigned */}
      <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,0,0,0.06)] text-ds-fine text-txt-muted">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Phone size={10} />{p.callCount}</span>
          <span className="flex items-center gap-1"><CheckSquare size={10} />{p.taskCount}</span>
        </div>
        {p.assignedTo && (
          <span className="text-txt-secondary">{p.assignedTo.name}</span>
        )}
      </div>
    </Link>
  )
}
