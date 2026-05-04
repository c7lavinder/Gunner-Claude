'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ExternalLink, Search } from 'lucide-react'
import { formatPhone } from '@/lib/format'
import { formatDistanceToNow } from 'date-fns'

// ── Types ─────────────────────────────────────────────────

interface SellerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  ghlContactId: string | null
  leadSource: string | null
  totalCallCount: number
  lastContactDate: string | null
  createdAt: string
  propertyAddress: string | null
  propertyId: string | null
  market: string | null
}

interface BuyerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  company: string | null
  ghlContactId: string | null
  mailingCity: string | null
  mailingState: string | null
  isActive: boolean
  isVip: boolean
  isGhost: boolean
  doNotContact: boolean
  primaryMarkets: string[]
  tags: string[]
  customFields: Record<string, unknown>
  buyerGrade: string | null
  totalDealsClosedWithUs: number
  createdAt: string
}

// Session 67 Phase 4 — Partner row shape for the Partners tab.
interface PartnerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  company: string | null
  ghlContactId: string | null
  types: string[]
  partnerGrade: string | null
  primaryMarkets: string[]
  propertyLinkCount: number
  lastDealDate: string | null
}

interface ContactsClientProps {
  sellers: SellerRow[]
  buyers: BuyerRow[]
  partners: PartnerRow[]
  sellerCount: number
  buyerCount: number
  partnerCount: number
  tenantSlug: string
  canSync?: boolean
}

// ── Helpers ───────────────────────────────────────────────

const MOTIVATION_COLORS: Record<string, string> = {
  foreclosure: 'bg-red-100 text-red-700',
  divorce: 'bg-orange-100 text-orange-700',
  inheritance: 'bg-blue-100 text-blue-700',
  financial: 'bg-amber-100 text-amber-700',
  health: 'bg-rose-100 text-rose-700',
  tired_landlord: 'bg-violet-100 text-violet-700',
  relocation: 'bg-cyan-100 text-cyan-700',
}

const URGENCY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
  unknown: 'bg-gray-100 text-gray-500',
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
}

function relTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return '\u2014'
  }
}

// ── Main Component ─────────────────────────────────────────

type Tab = 'sellers' | 'buyers' | 'partners'

function partnerTypeLabel(t: string): string {
  return t === 'property_manager' ? 'Property Mgr' : t.charAt(0).toUpperCase() + t.slice(1)
}

export function ContactsClient({ sellers, buyers, partners, sellerCount, buyerCount, partnerCount, tenantSlug, canSync }: ContactsClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('sellers')
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/contacts/sync-from-ghl`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const sellerTotal = (data.sellersCreated ?? 0) + (data.sellersUpdated ?? 0)
        const buyerTotal = (data.buyersCreated ?? 0) + (data.buyersUpdated ?? 0)
        const pipelines = data.pipelines
        let msg = `Sync complete — ${sellerTotal} sellers, ${buyerTotal} buyers`
        if (pipelines?.all) msg += ` | Pipelines: ${pipelines.all.join(', ')}`
        setSyncResult(msg)
      } else {
        setSyncResult(`Error: ${data.error ?? 'Sync failed'}`)
      }
    } catch {
      setSyncResult('Error: Network error')
    }
    setSyncing(false)
    setTimeout(() => setSyncResult(null), 8000)
  }

  const q = search.toLowerCase()

  const filteredSellers = useMemo(() => {
    if (!q) return sellers
    return sellers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.phone ?? '').includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    )
  }, [sellers, q])

  const filteredBuyers = useMemo(() => {
    if (!q) return buyers
    return buyers.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.phone ?? '').includes(q) ||
      (b.email ?? '').toLowerCase().includes(q) ||
      (b.company ?? '').toLowerCase().includes(q)
    )
  }, [buyers, q])

  const filteredPartners = useMemo(() => {
    if (!q) return partners
    return partners.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.company ?? '').toLowerCase().includes(q) ||
      p.types.some(t => t.toLowerCase().includes(q))
    )
  }, [partners, q])

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Contacts</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">{sellerCount} seller{sellerCount !== 1 ? 's' : ''} &middot; {buyerCount} buyer{buyerCount !== 1 ? 's' : ''} &middot; {partnerCount} partner{partnerCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            {syncResult && (
              <span className={`text-[10px] font-medium ${syncResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {syncResult}
              </span>
            )}
            {canSync && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-3 py-1.5 text-[11px] font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 rounded-[8px] flex items-center gap-1.5 transition-colors"
              >
                {syncing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {syncing ? 'Syncing...' : 'Sync from GHL'}
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-[11px] border border-gray-200 rounded-[8px] w-64 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)]">
        <div className="max-w-6xl mx-auto flex gap-1 px-6">
          <button
            onClick={() => setActiveTab('sellers')}
            className={`px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
              activeTab === 'sellers' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Sellers ({q ? filteredSellers.length : sellerCount})
          </button>
          <button
            onClick={() => setActiveTab('buyers')}
            className={`px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
              activeTab === 'buyers' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Buyers ({q ? filteredBuyers.length : buyerCount})
          </button>
          <button
            onClick={() => setActiveTab('partners')}
            className={`px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${
              activeTab === 'partners' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            Partners ({q ? filteredPartners.length : partnerCount})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mx-auto px-6 py-5">
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-x-auto">
          {activeTab === 'partners' ? (
            filteredPartners.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[12px] font-medium text-gray-500">No partners yet</p>
                <p className="text-[10px] text-gray-400 mt-1">Link an agent or wholesaler from any property detail page</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAFA]">
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Types</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Markets</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">On deals</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Last deal</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Grade</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">GHL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPartners.map(p => (
                      <tr key={p.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <Link href={`/${tenantSlug}/partners`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          {p.types.length === 0 ? <span className="text-gray-300">{'—'}</span> : (
                            <div className="flex flex-wrap items-center gap-1">
                              {p.types.slice(0, 3).map(t => (
                                <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-rose-100 text-rose-700">{partnerTypeLabel(t)}</span>
                              ))}
                              {p.types.length > 3 && <span className="text-[9px] text-gray-400">+{p.types.length - 3}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{formatPhone(p.phone)}</td>
                        <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">{p.email ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{p.company ?? '—'}</td>
                        <td className="px-3 py-2.5">
                          {p.primaryMarkets.length > 0 ? (
                            <div className="flex items-center gap-1">
                              {p.primaryMarkets.slice(0, 2).map((m, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-blue-50 text-blue-600">{String(m)}</span>
                              ))}
                              {p.primaryMarkets.length > 2 && <span className="text-[9px] text-gray-400">+{p.primaryMarkets.length - 2}</span>}
                            </div>
                          ) : <span className="text-gray-300">{'—'}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 font-medium">{p.propertyLinkCount}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-[10px]">{relTime(p.lastDealDate)}</td>
                        <td className="px-3 py-2.5">
                          {p.partnerGrade ? (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${GRADE_COLORS[p.partnerGrade] ?? 'bg-gray-100 text-gray-600'}`}>{p.partnerGrade}</span>
                          ) : <span className="text-gray-300">{'—'}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.ghlContactId ? (
                            <a href={`https://app.gohighlevel.com/contacts/detail/${p.ghlContactId}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'sellers' ? (
            filteredSellers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[12px] font-medium text-gray-500">No sellers yet</p>
                <p className="text-[10px] text-gray-400 mt-1">Sellers are created when contacts are linked to properties</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAFA]">
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Market</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Calls</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Last Contact</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">GHL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSellers.map(s => (
                      <tr key={s.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2.5">
                          <Link href={`/${tenantSlug}/sellers/${s.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                            {s.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{formatPhone(s.phone)}</td>
                        <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">{s.email ?? '\u2014'}</td>
                        <td className="px-3 py-2.5">
                          {s.propertyId ? (
                            <Link href={`/${tenantSlug}/inventory/${s.propertyId}`} className="text-gray-900 hover:text-blue-600 hover:underline text-[10px]">
                              {s.propertyAddress}
                            </Link>
                          ) : <span className="text-gray-300">{'\u2014'}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {s.market ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-blue-50 text-blue-600">{s.market}</span>
                          ) : <span className="text-gray-300">{'\u2014'}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 text-[10px]">{s.leadSource ?? '\u2014'}</td>
                        <td className="px-3 py-2.5 text-gray-700">{s.totalCallCount}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-[10px]">{relTime(s.lastContactDate)}</td>
                        <td className="px-3 py-2.5">
                          {s.ghlContactId ? (
                            <a
                              href={`https://app.gohighlevel.com/contacts/detail/${s.ghlContactId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredBuyers.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[12px] font-medium text-gray-500">No buyers yet</p>
                <p className="text-[10px] text-gray-400 mt-1">Buyers are synced from GHL or created via deal blasts</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAFA]">
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Markets</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Buybox</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Verified Funding</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Response Speed</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Deals</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Tags</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">GHL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuyers.map(b => {
                      const cf = b.customFields ?? {}
                      const markets = Array.isArray(b.primaryMarkets) ? b.primaryMarkets : []
                      const tags = Array.isArray(b.tags) ? b.tags : []
                      const tier = (cf.tier as string) ?? null
                      const buybox = (cf.buybox as string) ?? null
                      const verifiedFunding = cf.verifiedFunding === true
                      const maxBuyPrice = cf.maxBuyPrice as number | null
                      const responseSpeed = (cf.responseSpeed as string) ?? null
                      const secondaryMarkets = Array.isArray(cf.secondaryMarkets) ? cf.secondaryMarkets as string[] : []
                      const allMarkets = [...markets, ...secondaryMarkets]

                      const TIER_COLORS: Record<string, string> = {
                        'a': 'bg-green-100 text-green-700',
                        'b': 'bg-blue-100 text-blue-700',
                        'c': 'bg-amber-100 text-amber-700',
                        'd': 'bg-red-100 text-red-700',
                        'unqualified': 'bg-gray-100 text-gray-500',
                      }

                      return (
                        <tr key={b.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <Link href={`/${tenantSlug}/buyers/${b.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                              {b.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{formatPhone(b.phone)}</td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">{b.email ?? '\u2014'}</td>
                          <td className="px-3 py-2.5">
                            {tier ? (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize ${TIER_COLORS[tier.toLowerCase()] ?? 'bg-gray-100 text-gray-600'}`}>{tier}</span>
                            ) : '\u2014'}
                          </td>
                          <td className="px-3 py-2.5">
                            {allMarkets.length > 0 ? (
                              <div className="flex items-center gap-1">
                                {allMarkets.slice(0, 2).map((m, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-blue-50 text-blue-600">{String(m)}</span>
                                ))}
                                {allMarkets.length > 2 && <span className="text-[9px] text-gray-400">+{allMarkets.length - 2}</span>}
                              </div>
                            ) : <span className="text-gray-300">{'\u2014'}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[180px] truncate text-[10px]">{buybox ?? '\u2014'}</td>
                          <td className="px-3 py-2.5">
                            {verifiedFunding ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-green-100 text-green-700">Verified</span>
                            ) : <span className="text-gray-300">{'\u2014'}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{responseSpeed ?? '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700 font-medium">{b.totalDealsClosedWithUs}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {b.isGhost && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-200 text-gray-600">Ghost</span>}
                              {b.isVip && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-purple-100 text-[#7F77DD]">VIP</span>}
                              {b.doNotContact && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-red-100 text-red-700">DNC</span>}
                              {!b.isActive && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-red-100 text-red-600">Inactive</span>}
                              {b.isActive && !b.isGhost && !b.isVip && !b.doNotContact && <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-green-50 text-green-600">Active</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {tags.length > 0 ? (
                              <div className="flex items-center gap-1">
                                {tags.slice(0, 3).map((t, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-gray-100 text-gray-600">{String(t)}</span>
                                ))}
                                {tags.length > 3 && <span className="text-[9px] text-gray-400">+{tags.length - 3}</span>}
                              </div>
                            ) : <span className="text-gray-300">{'\u2014'}</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {b.ghlContactId ? (
                              <a href={`https://app.gohighlevel.com/contacts/detail/${b.ghlContactId}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
