'use client'
// app/(tenant)/[tenant]/partners/partners-list-client.tsx
// Browseable Partners index — search by name/phone/email, filter by type.
// Phase 3 of Session 67. The canonical edit-on-deal surface is the
// property-detail Partners tab; this page is read-mostly with a count
// of how many properties each partner is on.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Search, AlertTriangle, Star } from 'lucide-react'
import { formatPhone, titleCase } from '@/lib/format'

interface PartnerEntry {
  id: string
  name: string
  phone: string | null
  email: string | null
  company: string | null
  ghlContactId: string | null
  types: string[]
  partnerGrade: string | null
  tierClassification: string | null
  dealsSourcedToUsCount: number
  dealsTakenFromUsCount: number
  dealsClosedWithUsCount: number
  jvHistoryCount: number
  lastDealDate: string | null
  primaryMarkets: string[]
  propertyLinkCount: number
  priorityFlag: boolean
  badWithUsFlag: boolean
}

const ALL_TYPES = [
  'agent', 'wholesaler', 'attorney', 'title', 'lender',
  'inspector', 'contractor', 'photographer', 'property_manager', 'other',
] as const

function typeLabel(t: string): string {
  return t === 'property_manager' ? 'Property Mgr' : t.charAt(0).toUpperCase() + t.slice(1)
}

export function PartnersListClient({
  tenantSlug,
  partners,
}: {
  tenantSlug: string
  partners: PartnerEntry[]
}) {
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState<string | 'all'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return partners.filter(p => {
      if (activeType !== 'all' && !p.types.includes(activeType)) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.company ?? '').toLowerCase().includes(q) ||
        (p.phone ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [partners, query, activeType])

  // Per-type counts for the chip row
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of ALL_TYPES) counts[t] = 0
    for (const p of partners) {
      for (const t of p.types) {
        if (t in counts) counts[t]++
      }
    }
    return counts
  }, [partners])

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={20} className="text-gunner-red" />
          <h1 className="text-ds-section font-semibold text-txt-primary">Partners</h1>
          <span className="text-ds-fine text-txt-muted">({partners.length})</span>
        </div>
        <p className="text-ds-body text-txt-secondary">
          Real estate agents, wholesalers, attorneys, title, lenders, and other deal-team contacts.
          Linked to deals on the property detail page.
        </p>
      </header>

      {/* Search + type filter */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, company, phone, email..."
            className="w-full bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.1)] rounded-[10px] pl-9 pr-3 py-2 text-ds-body text-txt-primary placeholder-txt-muted focus:outline-none focus:border-gunner-red/60 transition-colors"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveType('all')}
            className={`text-ds-fine font-medium px-3 py-1 rounded-full transition-colors ${
              activeType === 'all'
                ? 'bg-gunner-red text-white'
                : 'bg-surface-secondary text-txt-secondary hover:text-txt-primary border-[0.5px] border-[rgba(0,0,0,0.08)]'
            }`}
          >
            All ({partners.length})
          </button>
          {ALL_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              disabled={typeCounts[t] === 0}
              className={`text-ds-fine font-medium px-3 py-1 rounded-full transition-colors ${
                activeType === t
                  ? 'bg-gunner-red text-white'
                  : typeCounts[t] === 0
                    ? 'bg-surface-secondary text-txt-muted opacity-50 cursor-not-allowed'
                    : 'bg-surface-secondary text-txt-secondary hover:text-txt-primary border-[0.5px] border-[rgba(0,0,0,0.08)]'
              }`}
            >
              {typeLabel(t)} ({typeCounts[t]})
            </button>
          ))}
        </div>
      </div>

      {/* Result list */}
      {filtered.length === 0 ? (
        <div className="bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] p-8 text-center">
          <Briefcase size={28} className="mx-auto text-txt-muted opacity-40 mb-2" />
          <p className="text-ds-body text-txt-muted">
            {partners.length === 0
              ? 'No partners yet. Link one from any property detail page.'
              : 'No partners match this filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface-primary border-[0.5px] border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1.4fr_1fr_0.8fr_0.8fr_0.6fr] gap-4 px-4 py-2.5 bg-surface-secondary border-b-[0.5px] border-[rgba(0,0,0,0.08)] text-[10px] font-semibold text-txt-muted uppercase tracking-wider">
            <div>Name</div>
            <div>Types</div>
            <div>Markets</div>
            <div>On deals</div>
            <div>Last deal</div>
            <div>Grade</div>
          </div>
          {filtered.map(p => (
            <Link
              key={p.id}
              href={`/${tenantSlug}/contacts`}
              className="block px-4 py-3 border-b-[0.5px] border-[rgba(0,0,0,0.06)] last:border-b-0 hover:bg-surface-secondary transition-colors"
            >
              <div className="md:grid md:grid-cols-[2fr_1.4fr_1fr_0.8fr_0.8fr_0.6fr] md:gap-4 md:items-center">
                {/* Name + contact */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {p.priorityFlag && <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />}
                    {p.badWithUsFlag && <AlertTriangle size={11} className="text-semantic-red shrink-0" />}
                    <span className="text-ds-body text-txt-primary font-medium truncate">{titleCase(p.name)}</span>
                  </div>
                  {p.company && <p className="text-ds-fine text-txt-secondary truncate">{p.company}</p>}
                  {p.phone && <p className="text-ds-fine text-txt-muted">{formatPhone(p.phone)}</p>}
                  {p.email && <p className="text-ds-fine text-txt-muted truncate">{p.email}</p>}
                </div>

                {/* Types */}
                <div className="mt-1 md:mt-0">
                  {p.types.length === 0 ? (
                    <span className="text-ds-fine text-txt-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.types.map(t => (
                        <span
                          key={t}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gunner-red-light text-gunner-red"
                        >
                          {typeLabel(t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Markets */}
                <div className="mt-1 md:mt-0 text-ds-fine text-txt-secondary truncate">
                  {p.primaryMarkets.length === 0 ? '—' : p.primaryMarkets.slice(0, 3).join(', ')}
                </div>

                {/* On deals */}
                <div className="mt-1 md:mt-0 text-ds-body text-txt-primary font-medium">
                  {p.propertyLinkCount}
                </div>

                {/* Last deal */}
                <div className="mt-1 md:mt-0 text-ds-fine text-txt-secondary">
                  {p.lastDealDate ? new Date(p.lastDealDate).toLocaleDateString() : '—'}
                </div>

                {/* Grade */}
                <div className="mt-1 md:mt-0">
                  {p.partnerGrade ? (
                    <span className="text-ds-fine font-semibold px-2 py-0.5 rounded-full bg-semantic-blue-bg text-semantic-blue inline-block">
                      {p.partnerGrade}
                    </span>
                  ) : (
                    <span className="text-ds-fine text-txt-muted">—</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
