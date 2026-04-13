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
  motivationPrimary: string | null
  urgencyLevel: string | null
  leadScore: number | null
  predictedCloseProbability: number | null
  followUpPriority: string | null
  totalCallCount: number
  lastContactDate: string | null
  createdAt: string
}

interface BuyerRow {
  id: string
  name: string
  phone: string | null
  secondaryPhone: string | null
  mobilePhone: string | null
  email: string | null
  secondaryEmail: string | null
  company: string | null
  website: string | null
  ghlContactId: string | null
  mailingAddress: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  preferredContactMethod: string | null
  bestTimeToContact: string | null
  doNotContact: boolean
  isActive: boolean
  isVip: boolean
  isGhost: boolean
  // Buybox — Geographic
  primaryMarkets: string[]
  countiesOfInterest: string[]
  citiesOfInterest: string[]
  zipCodesOfInterest: string[]
  urbanRuralPreference: string | null
  isNationalBuyer: boolean
  isOutOfStateBuyer: boolean
  // Buybox — Property
  propertyTypes: string[]
  minBeds: number | null
  maxBeds: number | null
  minSqft: number | null
  maxSqft: number | null
  yearBuiltMin: number | null
  maxRepairBudget: string | null
  tenantOccupiedOk: boolean | null
  prefersVacant: boolean | null
  // Buybox — Financial
  minPurchasePrice: string | null
  maxPurchasePrice: string | null
  minArv: string | null
  maxArv: string | null
  maxArvPercent: number | null
  fundingType: string | null
  proofOfFundsOnFile: boolean
  pofAmount: string | null
  hardMoneyLender: string | null
  typicalCloseTimelineDays: number | null
  canCloseAsIs: boolean | null
  doubleCloseOk: boolean | null
  subjectToOk: boolean | null
  // Activity
  buyerGrade: string | null
  buyerSinceDate: string | null
  totalDealsClosedWithUs: number
  totalDealsClosedOverall: number | null
  averageCloseTimelineDays: number | null
  blastResponseRate: number | null
  offerRate: number | null
  closeRate: number | null
  dealsFallenThrough: number
  reliabilityScore: number | null
  // Communication
  preferredBlastChannel: string | null
  unsubscribedFromEmail: boolean
  unsubscribedFromText: boolean
  lastCommunicationDate: string | null
  engagementTrend: string | null
  // Relationship
  howAcquired: string | null
  referralSourceName: string | null
  relationshipStrength: string | null
  hasExclusivityAgreement: boolean
  // Strategy
  exitStrategies: string[]
  offMarketOnly: boolean
  creativeFinanceInterest: boolean
  isSubjectToBuyer: boolean
  // AI
  buyerScore: number | null
  ghostRiskScore: number | null
  // General
  tags: string[]
  internalNotes: string | null
  priorityFlag: boolean
  createdAt: string
}

interface ContactsClientProps {
  sellers: SellerRow[]
  buyers: BuyerRow[]
  sellerCount: number
  buyerCount: number
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

function fmt$(val: string | null): string {
  if (!val) return '\u2014'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '\u2014'
  return `${(val * 100).toFixed(0)}%`
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

type Tab = 'sellers' | 'buyers'

export function ContactsClient({ sellers, buyers, sellerCount, buyerCount, tenantSlug, canSync }: ContactsClientProps) {
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
        setSyncResult(`Sync complete — ${data.sellersCreated + data.sellersUpdated} sellers, ${data.buyersCreated + data.buyersUpdated} buyers imported`)
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

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.06)] px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Contacts</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">{sellerCount} seller{sellerCount !== 1 ? 's' : ''} &middot; {buyerCount} buyer{buyerCount !== 1 ? 's' : ''}</p>
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
        </div>
      </div>

      {/* Table */}
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="bg-white border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
          {activeTab === 'sellers' ? (
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
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Motivation</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Urgency</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Lead Score</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Close %</th>
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
                        <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{s.email ?? '\u2014'}</td>
                        <td className="px-3 py-2.5">
                          {s.motivationPrimary ? (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${MOTIVATION_COLORS[s.motivationPrimary] ?? 'bg-gray-100 text-gray-600'}`}>
                              {s.motivationPrimary.replace(/_/g, ' ')}
                            </span>
                          ) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5">
                          {s.urgencyLevel ? (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${URGENCY_COLORS[s.urgencyLevel] ?? URGENCY_COLORS.unknown}`}>
                              {s.urgencyLevel}
                            </span>
                          ) : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">{s.leadScore !== null ? `${s.leadScore.toFixed(0)}/100` : '\u2014'}</td>
                        <td className="px-3 py-2.5 text-gray-700">{s.predictedCloseProbability !== null ? `${(s.predictedCloseProbability * 100).toFixed(0)}%` : '\u2014'}</td>
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
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAFA]">
                      {/* Identity */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-[#FAFAFA] z-10">Name</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">City/State</th>
                      {/* Status */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Grade</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Source</th>
                      {/* Buybox — Geo */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Markets</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Counties</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Zips</th>
                      {/* Buybox — Property */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Prop Types</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Beds</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Sqft</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Max Repair</th>
                      {/* Buybox — Financial */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Price Range</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">ARV Range</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Max ARV%</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Funding</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">POF</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Close Days</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Dbl Close</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Sub-To</th>
                      {/* Performance */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Deals</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Blast Resp</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Offer Rate</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Close Rate</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Reliability</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Fallen Thru</th>
                      {/* Strategy */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Exit Strategy</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Creative</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Off-Market</th>
                      {/* Communication */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Pref Channel</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Trend</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Last Contact</th>
                      {/* Meta */}
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Tags</th>
                      <th className="text-left px-3 py-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">GHL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuyers.map(b => {
                      const markets = Array.isArray(b.primaryMarkets) ? b.primaryMarkets : []
                      const counties = Array.isArray(b.countiesOfInterest) ? b.countiesOfInterest : []
                      const zips = Array.isArray(b.zipCodesOfInterest) ? b.zipCodesOfInterest : []
                      const propTypes = Array.isArray(b.propertyTypes) ? b.propertyTypes : []
                      const exits = Array.isArray(b.exitStrategies) ? b.exitStrategies : []
                      const tags = Array.isArray(b.tags) ? b.tags : []

                      const Pills = ({ items, color = 'bg-blue-50 text-blue-600', max = 2 }: { items: string[]; color?: string; max?: number }) => (
                        items.length > 0 ? (
                          <div className="flex items-center gap-1">
                            {items.slice(0, max).map((m, i) => (
                              <span key={i} className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${color}`}>{String(m)}</span>
                            ))}
                            {items.length > max && <span className="text-[9px] text-gray-400">+{items.length - max}</span>}
                          </div>
                        ) : <span className="text-gray-300">{'\u2014'}</span>
                      )

                      const yn = (v: boolean | null) => v === true ? 'Yes' : v === false ? 'No' : '\u2014'

                      return (
                        <tr key={b.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-gray-50/50 transition-colors">
                          {/* Identity */}
                          <td className="px-3 py-2.5 sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-1.5">
                              {b.priorityFlag && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                              <Link href={`/${tenantSlug}/buyers/${b.id}`} className="font-medium text-gray-900 hover:text-blue-600 hover:underline">
                                {b.name}
                              </Link>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{b.company ?? '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{formatPhone(b.phone)}</td>
                          <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">{b.email ?? '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{b.mailingCity && b.mailingState ? `${b.mailingCity}, ${b.mailingState}` : b.mailingState ?? '\u2014'}</td>
                          {/* Status */}
                          <td className="px-3 py-2.5">
                            {b.buyerGrade ? (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${GRADE_COLORS[b.buyerGrade] ?? 'bg-gray-100 text-gray-600'}`}>{b.buyerGrade}</span>
                            ) : '\u2014'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {b.isGhost && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-200 text-gray-600">Ghost</span>}
                              {b.isVip && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-purple-100 text-[#7F77DD]">VIP</span>}
                              {b.doNotContact && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-red-100 text-red-700">DNC</span>}
                              {!b.isActive && <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-red-100 text-red-600">Inactive</span>}
                              {b.isActive && !b.isGhost && !b.isVip && !b.doNotContact && <span className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-green-50 text-green-600">Active</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 text-[10px]">{b.howAcquired ?? '\u2014'}</td>
                          {/* Buybox — Geo */}
                          <td className="px-3 py-2.5"><Pills items={markets} /></td>
                          <td className="px-3 py-2.5"><Pills items={counties} color="bg-amber-50 text-amber-600" /></td>
                          <td className="px-3 py-2.5"><Pills items={zips} color="bg-gray-100 text-gray-600" max={3} /></td>
                          {/* Buybox — Property */}
                          <td className="px-3 py-2.5"><Pills items={propTypes} color="bg-violet-50 text-violet-600" /></td>
                          <td className="px-3 py-2.5 text-gray-700">{b.minBeds != null || b.maxBeds != null ? `${b.minBeds ?? '?'}-${b.maxBeds ?? '?'}` : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{b.minSqft != null || b.maxSqft != null ? `${b.minSqft?.toLocaleString() ?? '?'}-${b.maxSqft?.toLocaleString() ?? '?'}` : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{fmt$(b.maxRepairBudget)}</td>
                          {/* Buybox — Financial */}
                          <td className="px-3 py-2.5 text-gray-700">{b.minPurchasePrice || b.maxPurchasePrice ? `${fmt$(b.minPurchasePrice)}-${fmt$(b.maxPurchasePrice)}` : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{b.minArv || b.maxArv ? `${fmt$(b.minArv)}-${fmt$(b.maxArv)}` : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{b.maxArvPercent != null ? `${b.maxArvPercent}%` : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-600">{b.fundingType ?? '\u2014'}</td>
                          <td className="px-3 py-2.5">
                            {b.proofOfFundsOnFile ? (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-green-100 text-green-700">{b.pofAmount ? fmt$(b.pofAmount) : 'Yes'}</span>
                            ) : <span className="text-gray-300">{'\u2014'}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{b.typicalCloseTimelineDays != null ? `${b.typicalCloseTimelineDays}d` : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{yn(b.doubleCloseOk)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{yn(b.subjectToOk)}</td>
                          {/* Performance */}
                          <td className="px-3 py-2.5 text-gray-700 font-medium">{b.totalDealsClosedWithUs}</td>
                          <td className="px-3 py-2.5 text-gray-700">{fmtPct(b.blastResponseRate)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{fmtPct(b.offerRate)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{fmtPct(b.closeRate)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{b.reliabilityScore != null ? b.reliabilityScore.toFixed(1) : '\u2014'}</td>
                          <td className="px-3 py-2.5 text-gray-700">{b.dealsFallenThrough || '\u2014'}</td>
                          {/* Strategy */}
                          <td className="px-3 py-2.5"><Pills items={exits} color="bg-indigo-50 text-indigo-600" /></td>
                          <td className="px-3 py-2.5 text-gray-700">{yn(b.creativeFinanceInterest)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{yn(b.offMarketOnly)}</td>
                          {/* Communication */}
                          <td className="px-3 py-2.5 text-gray-600">{b.preferredBlastChannel ?? '\u2014'}</td>
                          <td className="px-3 py-2.5">
                            {b.engagementTrend ? (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                b.engagementTrend === 'improving' ? 'bg-green-100 text-green-700' :
                                b.engagementTrend === 'declining' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{b.engagementTrend}</span>
                            ) : '\u2014'}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-[10px]">{relTime(b.lastCommunicationDate)}</td>
                          {/* Meta */}
                          <td className="px-3 py-2.5 text-gray-500 max-w-[200px] truncate text-[10px]">{b.internalNotes ?? '\u2014'}</td>
                          <td className="px-3 py-2.5"><Pills items={tags} color="bg-gray-100 text-gray-600" max={3} /></td>
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
