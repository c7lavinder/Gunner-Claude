'use client'
// components/inventory/inventory-client.tsx

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Phone, CheckSquare, Search, Plus, ChevronRight } from 'lucide-react'

interface Property {
  id: string; address: string; city: string; state: string; zip: string
  status: string; arv: string | null; askingPrice: string | null
  mao: string | null; assignmentFee: string | null; createdAt: string
  sellerName: string | null; sellerPhone: string | null
  assignedTo: { id: string; name: string } | null
  callCount: number; taskCount: number
}

const STATUS_ORDER = [
  'NEW_LEAD', 'CONTACTED', 'APPOINTMENT_SET', 'APPOINTMENT_COMPLETED',
  'OFFER_MADE', 'UNDER_CONTRACT', 'IN_DISPOSITION', 'SOLD', 'DEAD',
]

const STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead', CONTACTED: 'Contacted', APPOINTMENT_SET: 'Appt set',
  APPOINTMENT_COMPLETED: 'Appt done', OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract', IN_DISPOSITION: 'In disposition',
  SOLD: 'Sold', DEAD: 'Dead',
}

const STATUS_COLORS: Record<string, string> = {
  NEW_LEAD: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
  CONTACTED: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10',
  APPOINTMENT_SET: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
  APPOINTMENT_COMPLETED: 'border-orange-400/40 text-orange-300 bg-orange-400/10',
  OFFER_MADE: 'border-purple-500/40 text-purple-400 bg-purple-500/10',
  UNDER_CONTRACT: 'border-green-500/40 text-green-400 bg-green-500/10',
  IN_DISPOSITION: 'border-teal-500/40 text-teal-400 bg-teal-500/10',
  SOLD: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
  DEAD: 'border-gray-500/40 text-gray-400 bg-gray-500/10',
}

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
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">{activeCount} active properties</p>
        </div>
        {canManage && (
          <Link
            href={`/${tenantSlug}/inventory/new`}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Add property
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-[#1a1d27] border border-white/10 rounded-lg px-3 py-2.5 max-w-md">
        <Search size={14} className="text-gray-500 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address, city, seller…"
          className="bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none flex-1"
        />
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveStatus(null)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            !activeStatus
              ? 'border-orange-500 bg-orange-500/15 text-orange-400'
              : 'border-white/10 text-gray-400 hover:text-white'
          }`}
        >
          All ({properties.length})
        </button>
        {STATUS_ORDER.filter(s => statusCounts[s] > 0).map((status) => (
          <button
            key={status}
            onClick={() => setActiveStatus(activeStatus === status ? null : status)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeStatus === status
                ? STATUS_COLORS[status]
                : 'border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {STATUS_LABELS[status]} ({statusCounts[status]})
          </button>
        ))}
      </div>

      {/* Property grid */}
      {filtered.length === 0 ? (
        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl py-16 text-center">
          <Building2 size={24} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {search || activeStatus ? 'No properties match your filter' : 'No properties yet — they appear here when contacts enter your trigger stage in GHL'}
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

function PropertyCard({ property: p, tenantSlug }: { property: Property; tenantSlug: string }) {
  const statusColor = STATUS_COLORS[p.status] ?? 'border-gray-500/40 text-gray-400 bg-gray-500/10'

  const fmt = (v: string | null) =>
    v ? `$${Number(v).toLocaleString()}` : null

  return (
    <Link
      href={`/${tenantSlug}/inventory/${p.id}`}
      className="bg-[#1a1d27] border border-white/10 hover:border-white/20 rounded-2xl p-5 transition-colors flex flex-col gap-3"
    >
      {/* Address + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{p.address}</p>
          <p className="text-xs text-gray-500">{p.city}, {p.state} {p.zip}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${statusColor}`}>
          {STATUS_LABELS[p.status]}
        </span>
      </div>

      {/* Seller */}
      {p.sellerName && (
        <div className="text-xs text-gray-400">
          Seller: <span className="text-white">{p.sellerName}</span>
          {p.sellerPhone && <span className="text-gray-500 ml-2">{p.sellerPhone}</span>}
        </div>
      )}

      {/* Financials */}
      <div className="grid grid-cols-2 gap-2">
        {fmt(p.askingPrice) && (
          <div>
            <p className="text-xs text-gray-500">Asking</p>
            <p className="text-sm font-medium text-white">{fmt(p.askingPrice)}</p>
          </div>
        )}
        {fmt(p.arv) && (
          <div>
            <p className="text-xs text-gray-500">ARV</p>
            <p className="text-sm font-medium text-green-400">{fmt(p.arv)}</p>
          </div>
        )}
        {fmt(p.mao) && (
          <div>
            <p className="text-xs text-gray-500">MAO</p>
            <p className="text-sm font-medium text-orange-400">{fmt(p.mao)}</p>
          </div>
        )}
        {fmt(p.assignmentFee) && (
          <div>
            <p className="text-xs text-gray-500">Assignment fee</p>
            <p className="text-sm font-medium text-teal-400">{fmt(p.assignmentFee)}</p>
          </div>
        )}
      </div>

      {/* Footer: activity counts + assigned */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Phone size={10} />{p.callCount}</span>
          <span className="flex items-center gap-1"><CheckSquare size={10} />{p.taskCount}</span>
        </div>
        {p.assignedTo && (
          <span className="text-gray-600">{p.assignedTo.name}</span>
        )}
      </div>
    </Link>
  )
}
