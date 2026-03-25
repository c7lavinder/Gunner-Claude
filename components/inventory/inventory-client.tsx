'use client'
// components/inventory/inventory-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2, Phone, CheckSquare, Search, Plus, ChevronRight,
  UserPlus, PhoneCall, CalendarCheck, FileText, Handshake,
  Package, DollarSign, XCircle, Clock,
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
  { key: 'NEW_LEAD',              label: 'New Lead',     icon: UserPlus,      step: 1 },
  { key: 'CONTACTED',             label: 'Contacted',    icon: PhoneCall,     step: 2 },
  { key: 'APPOINTMENT_SET',       label: 'Appt Set',     icon: CalendarCheck, step: 3 },
  { key: 'APPOINTMENT_COMPLETED', label: 'Appt Done',    icon: FileText,      step: 4 },
  { key: 'OFFER_MADE',            label: 'Offer Made',   icon: DollarSign,    step: 5 },
  { key: 'UNDER_CONTRACT',        label: 'Contract',     icon: Handshake,     step: 6 },
  { key: 'IN_DISPOSITION',        label: 'Disposition',  icon: Package,       step: 7 },
]

// ─── Long-term / terminal buckets ────────────────────────────────────────────

const LONG_TERM_BUCKETS = [
  { key: 'SOLD', label: 'Sold', icon: DollarSign },
  { key: 'DEAD', label: 'Dead', icon: XCircle },
]

// ─── Stage colors ────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, { ring: string; bg: string; text: string; iconBg: string }> = {
  NEW_LEAD:              { ring: 'ring-semantic-blue',   bg: 'bg-semantic-blue',   text: 'text-semantic-blue',   iconBg: 'bg-semantic-blue-bg' },
  CONTACTED:             { ring: 'ring-semantic-amber',  bg: 'bg-semantic-amber',  text: 'text-semantic-amber',  iconBg: 'bg-semantic-amber-bg' },
  APPOINTMENT_SET:       { ring: 'ring-semantic-purple', bg: 'bg-semantic-purple', text: 'text-semantic-purple', iconBg: 'bg-semantic-purple-bg' },
  APPOINTMENT_COMPLETED: { ring: 'ring-semantic-purple', bg: 'bg-semantic-purple', text: 'text-semantic-purple', iconBg: 'bg-semantic-purple-bg' },
  OFFER_MADE:            { ring: 'ring-semantic-blue',   bg: 'bg-semantic-blue',   text: 'text-semantic-blue',   iconBg: 'bg-semantic-blue-bg' },
  UNDER_CONTRACT:        { ring: 'ring-semantic-green',  bg: 'bg-semantic-green',  text: 'text-semantic-green',  iconBg: 'bg-semantic-green-bg' },
  IN_DISPOSITION:        { ring: 'ring-semantic-amber',  bg: 'bg-semantic-amber',  text: 'text-semantic-amber',  iconBg: 'bg-semantic-amber-bg' },
  SOLD:                  { ring: 'ring-semantic-green',  bg: 'bg-semantic-green',  text: 'text-semantic-green',  iconBg: 'bg-semantic-green-bg' },
  DEAD:                  { ring: 'ring-txt-muted',       bg: 'bg-txt-muted',       text: 'text-txt-muted',       iconBg: 'bg-surface-tertiary' },
}

const STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead', CONTACTED: 'Contacted', APPOINTMENT_SET: 'Appt set',
  APPOINTMENT_COMPLETED: 'Appt done', OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract', IN_DISPOSITION: 'In disposition',
  SOLD: 'Sold', DEAD: 'Dead',
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
      <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-6">
        {/* Stage nodes */}
        <div className="flex items-start justify-between overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = statusCounts[stage.key] ?? 0
            const isActive = activeStatus === stage.key
            const colors = STAGE_COLORS[stage.key]
            const Icon = stage.icon
            return (
              <div key={stage.key} className="flex items-start flex-1 min-w-0">
                {/* Node */}
                <button
                  onClick={() => setActiveStatus(isActive ? null : stage.key)}
                  className="flex flex-col items-center gap-1.5 group relative"
                >
                  {/* Circle with icon */}
                  <div className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    isActive
                      ? `ring-2 ${colors.ring} ${colors.iconBg} shadow-md`
                      : count > 0
                        ? `${colors.iconBg} hover:ring-2 ${colors.ring}`
                        : 'bg-surface-tertiary'
                  }`}>
                    <Icon size={18} className={count > 0 || isActive ? colors.text : 'text-txt-muted'} />
                    {/* Count badge */}
                    {count > 0 && (
                      <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white rounded-full px-1 ${colors.bg}`}>
                        {count}
                      </span>
                    )}
                  </div>
                  {/* Label */}
                  <div className="text-center">
                    <p className={`text-[10px] font-semibold leading-tight ${isActive ? colors.text : 'text-txt-secondary'}`}>
                      {stage.label}
                    </p>
                    <p className="text-[9px] text-txt-muted">Step {stage.step}</p>
                  </div>
                </button>
                {/* Connecting line */}
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="flex-1 flex items-center pt-5 px-1 min-w-[12px]">
                    <div className="h-[2px] w-full bg-[rgba(0,0,0,0.08)] rounded-full" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Long-term buckets */}
        <div className="mt-5 pt-4 border-t border-[rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={12} className="text-txt-muted" />
            <span className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">Long-Term</span>
          </div>
          <div className="flex gap-3">
            {LONG_TERM_BUCKETS.map(bucket => {
              const count = statusCounts[bucket.key] ?? 0
              const isActive = activeStatus === bucket.key
              const colors = STAGE_COLORS[bucket.key]
              const Icon = bucket.icon
              return (
                <button
                  key={bucket.key}
                  onClick={() => setActiveStatus(isActive ? null : bucket.key)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-[10px] border-[0.5px] transition-all ${
                    isActive
                      ? `${colors.iconBg} border-transparent shadow-ds-float`
                      : 'bg-surface-secondary border-[rgba(0,0,0,0.06)] hover:border-[rgba(0,0,0,0.12)]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colors.iconBg}`}>
                    <Icon size={14} className={colors.text} />
                  </div>
                  <div className="text-left">
                    <p className={`text-ds-body font-semibold ${isActive ? colors.text : 'text-txt-primary'}`}>{bucket.label}</p>
                    <p className="text-[11px] text-txt-muted">{count} {count === 1 ? 'property' : 'properties'}</p>
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
