'use client'
// components/inventory/contacts-panel.tsx
// Compact contacts panel mounted on the property-detail Overview tab + at
// the top of the Data tab. Replaces the prior Sellers / Buyers / Partners
// tabs (which forced reps to switch tabs to see who's on a deal).
//
// Shows: linked sellers · linked buyer(s) · linked partners. Each row =
// name + role/type + click-through to that contact's detail page. Empty
// states surface handoff gaps explicitly ("No buyer assigned").

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, User, Briefcase, Users } from 'lucide-react'
import { formatPhone, titleCase } from '@/lib/format'
import type { PropertyDetail } from './property-detail-client'

interface AddedBuyer {
  id: string
  name: string
  phone: string | null
  email: string | null
  tier: string
}

export function ContactsPanel({
  property,
  tenantSlug,
}: {
  property: PropertyDetail
  tenantSlug: string
}) {
  // Buyers aren't on PropertyDetail — they're fetched dynamically the same
  // way the (now-removed) Buyers tab fetched them. Single endpoint call on
  // mount; cached for the life of the panel mount.
  const [buyers, setBuyers] = useState<AddedBuyer[]>([])
  const [buyersLoaded, setBuyersLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/properties/${property.id}/buyers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getManualBuyers' }),
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setBuyers((data.buyers ?? []) as AddedBuyer[])
          setBuyersLoaded(true)
        }
      } catch {
        if (!cancelled) setBuyersLoaded(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [property.id])

  const sellers = property.sellers ?? []
  const partners = property.partners ?? []

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-[12px] overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center gap-2">
        <span className="text-[11px] font-medium text-txt-secondary uppercase tracking-wide">
          Contacts on this deal
        </span>
      </div>
      <div className="divide-y divide-[rgba(0,0,0,0.06)]">
        <Section
          icon={User}
          label="Sellers"
          count={sellers.length}
          empty="No seller assigned"
        >
          {sellers.map(s => (
            <Row
              key={s.id}
              href={`/${tenantSlug}/sellers/${s.id}`}
              name={s.name || 'Unnamed'}
              meta={[
                s.isPrimary ? 'primary' : null,
                s.phone ? formatPhone(s.phone) : s.email ?? null,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>

        <Section
          icon={Users}
          label="Buyer"
          count={buyers.length}
          empty={buyersLoaded ? 'No buyer assigned' : 'Loading…'}
        >
          {buyers.map(b => (
            <Row
              key={b.id}
              href={`/${tenantSlug}/buyers/${b.id}`}
              name={b.name || 'Unnamed'}
              meta={[
                b.tier ? titleCase(b.tier) : null,
                b.phone ? formatPhone(b.phone) : b.email ?? null,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>

        <Section
          icon={Briefcase}
          label="Partners"
          count={partners.length}
          empty="No partners linked"
        >
          {partners.map(p => (
            <Row
              key={p.id}
              href={`/${tenantSlug}/partners/${p.id}`}
              name={p.name || 'Unnamed'}
              meta={[
                p.types.length > 0 ? p.types.map(titleCase).join('/') : null,
                p.role ? titleCase(p.role.replace(/_/g, ' ')) : null,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
      </div>
    </div>
  )
}

function Section({
  icon: Icon,
  label,
  count,
  empty,
  children,
}: {
  icon: typeof User
  label: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} className="text-txt-muted" />
        <span className="text-[11px] font-medium text-txt-secondary uppercase tracking-wide">
          {label}
        </span>
        <span className="text-[11px] text-txt-muted">({count})</span>
      </div>
      {count === 0 ? (
        <div className="text-[12px] text-txt-muted italic pl-5">{empty}</div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  )
}

function Row({
  href,
  name,
  meta,
}: {
  href: string
  name: string
  meta: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 pl-5 pr-2 py-1 rounded hover:bg-surface-secondary/50 group"
    >
      <span className="text-[13px] text-txt-primary font-medium truncate">{name}</span>
      {meta && <span className="text-[12px] text-txt-secondary truncate">· {meta}</span>}
      <ExternalLink size={11} className="ml-auto text-txt-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </Link>
  )
}
