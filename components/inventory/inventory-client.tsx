'use client'
// components/inventory/inventory-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Phone, CheckSquare, Search, Plus } from 'lucide-react'
import { PipelineStageTabs } from './PipelineStageTabs'
import { STATUS_TO_APP_STAGE, APP_STAGE_LABELS, APP_STAGE_BADGE_COLORS } from '@/types/property'
import type { AppStage } from '@/types/property'

interface Property {
  id: string; address: string; city: string; state: string; zip: string
  status: string; arv: string | null; askingPrice: string | null
  mao: string | null; assignmentFee: string | null; createdAt: string
  sellerName: string | null; sellerPhone: string | null
  assignedTo: { id: string; name: string } | null
  callCount: number; taskCount: number
}

export function InventoryClient({ properties, statusCounts, tenantSlug, canManage }: {
  properties: Property[]
  statusCounts: Record<string, number>
  tenantSlug: string
  canManage: boolean
}) {
  const [selectedStage, setSelectedStage] = useState<AppStage | null>(null)
  const [search, setSearch] = useState('')

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
        onStageSelect={setSelectedStage}
      />

      {/* Search + active filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border-[0.5px] border-[rgba(0,0,0,0.14)] rounded-[10px] px-4 py-[9px] flex-1 max-w-md">
          <Search size={14} className="text-txt-muted shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, city, seller..."
            className="bg-transparent text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none flex-1"
          />
        </div>
        {selectedStage && (
          <div className="flex items-center gap-2">
            <span className={`text-ds-fine font-semibold px-2.5 py-1 rounded-full ${APP_STAGE_BADGE_COLORS[selectedStage]}`}>
              {APP_STAGE_LABELS[selectedStage]}
            </span>
            <span className="text-ds-fine text-txt-muted">{filtered.length} properties</span>
            <button onClick={() => setSelectedStage(null)} className="text-ds-fine text-txt-muted hover:text-txt-secondary underline">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Property grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] py-16 text-center">
          <Building2 size={24} className="text-txt-muted mx-auto mb-3" />
          <p className="text-txt-secondary text-ds-body">
            {search || selectedStage ? 'No properties match your filter' : 'No properties yet \u2014 they appear here when contacts enter your trigger stage in GHL'}
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
  const appStage = STATUS_TO_APP_STAGE[p.status] ?? 'acquisition.new_lead'
  const badgeColor = APP_STAGE_BADGE_COLORS[appStage]
  const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null

  // Days on market
  const dom = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
  const domColor = dom <= 7 ? 'text-green-600' : dom <= 30 ? 'text-amber-500' : 'text-red-600'

  return (
    <Link
      href={`/${tenantSlug}/inventory/${p.id}`}
      className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] hover:border-[rgba(0,0,0,0.14)] hover:shadow-ds-float rounded-[14px] p-5 transition-all flex flex-col gap-3"
    >
      {/* Top row: status + type + DOM */}
      <div className="flex items-center gap-2">
        <span className={`text-ds-fine font-medium px-2 py-[3px] rounded-full ${badgeColor}`}>
          {APP_STAGE_LABELS[appStage]}
        </span>
        <span className="flex-1" />
        <span className={`text-ds-fine font-medium ${domColor}`}>{dom}d</span>
      </div>

      {/* Address */}
      <div>
        <p className="text-ds-card font-medium text-txt-primary truncate">{p.address}</p>
        <p className="text-ds-fine text-txt-muted">{p.city}, {p.state} {p.zip}</p>
      </div>

      {/* Seller */}
      {p.sellerName && (
        <p className="text-ds-body text-txt-secondary truncate">{p.sellerName}</p>
      )}

      {/* Financials */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[rgba(0,0,0,0.06)]">
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
            <p className="text-ds-fine text-txt-muted">Assignment</p>
            <p className="text-ds-label font-medium text-semantic-blue">{fmt(p.assignmentFee)}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-ds-fine text-txt-muted">
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
