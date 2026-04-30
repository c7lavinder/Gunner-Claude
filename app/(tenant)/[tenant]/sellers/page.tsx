// app/(tenant)/[tenant]/sellers/page.tsx
// v1.1 Wave 3 Phase A — Sellers list view.
// Server component. Reads NEW Wave 1+2 columns (firstName/lastName,
// person flags, portfolio aggregates) so backfilled data is visible.
// Falls back to legacy `name` when name parts are still NULL.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { formatPhone } from '@/lib/format'

export default async function SellersListPage({
  params,
}: {
  params: { tenant: string }
}) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) {
    redirect(`/${params.tenant}/dashboard`)
  }

  const canViewAll = hasPermission(role, 'properties.view.all')

  const sellers = await db.seller.findMany({
    where: {
      tenantId,
      // Non-admin Lead Managers see only sellers assigned to them.
      ...(canViewAll ? {} : { assignedToId: session.userId }),
    },
    select: {
      id: true,
      // Legacy name (Wave 5 will drop) + new decomposed parts.
      name: true,
      firstName: true,
      middleName: true,
      lastName: true,
      nameSuffix: true,
      // Identity (legacy + skip-trace fallback).
      phone: true,
      email: true,
      skipTracedPhone: true,
      skipTracedEmail: true,
      // Engagement / scoring.
      lastContactDate: true,
      firstContactDate: true,
      totalCallCount: true,
      noAnswerStreak: true,
      motivationScore: true,
      likelihoodToSellScore: true,
      followUpPriority: true,
      // Portfolio + flags (Wave 1+2 backfilled).
      totalPropertiesOwned: true,
      ownerPortfolioTotalEquity: true,
      seniorOwner: true,
      deceasedOwner: true,
      cashBuyerOwner: true,
      // Hard signals.
      doNotContact: true,
      isDeceased: true,
      // Linked properties — show counts + first address.
      properties: {
        select: {
          isPrimary: true,
          property: {
            select: {
              id: true,
              address: true,
              city: true,
              state: true,
              status: true,
            },
          },
        },
        orderBy: { isPrimary: 'desc' },
      },
    },
    orderBy: [
      { likelihoodToSellScore: { sort: 'desc', nulls: 'last' } },
      { lastContactDate: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
    take: 500,
  })

  const totalSellers = sellers.length
  const withMotivation = sellers.filter(s => s.likelihoodToSellScore != null).length
  const seniorCount = sellers.filter(s => s.seniorOwner === true).length
  const deceasedCount = sellers.filter(s => s.deceasedOwner === true).length
  const cashBuyerCount = sellers.filter(s => s.cashBuyerOwner === true).length

  function displayName(s: typeof sellers[number]): string {
    const parts = [s.firstName, s.middleName, s.lastName, s.nameSuffix]
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (parts.length > 0) return parts.join(' ')
    return s.name || '(unnamed)'
  }

  function fmtMoney(v: { toString(): string } | null | undefined): string {
    if (v == null) return '—'
    const n = Number(v.toString())
    if (Number.isNaN(n)) return '—'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  }

  function fmtRelative(d: Date | null): string {
    if (!d) return 'never'
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }

  return (
    <div className="min-h-screen bg-surface-app">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-txt-primary">Sellers</h1>
            <p className="text-sm text-txt-secondary mt-1">
              {totalSellers} {totalSellers === 1 ? 'seller' : 'sellers'}
              {canViewAll ? ' across all assignments' : ' assigned to you'}
              {' • '}
              ranked by likelihood-to-sell, then last-contact recency
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat label="Total" value={totalSellers.toString()} />
          <Stat label="With motivation score" value={`${withMotivation}/${totalSellers}`} />
          <Stat label="Senior owner" value={seniorCount.toString()} tone={seniorCount > 0 ? 'blue' : undefined} />
          <Stat label="Deceased owner" value={deceasedCount.toString()} tone={deceasedCount > 0 ? 'red' : undefined} />
          <Stat label="Also cash-buyer" value={cashBuyerCount.toString()} tone={cashBuyerCount > 0 ? 'blue' : undefined} />
        </div>

        {/* Empty state */}
        {sellers.length === 0 && (
          <div className="bg-surface-primary border rounded-[12px] p-8 text-center" style={{ borderColor: 'var(--border-light)' }}>
            <p className="text-sm text-txt-secondary">
              No sellers yet. Sellers are created when a Property is graded with a linked seller contact, or via the
              {' '}
              <span className="font-mono text-xs">PropertySeller</span> link from inventory.
            </p>
          </div>
        )}

        {/* Table */}
        {sellers.length > 0 && (
          <div className="bg-surface-primary border rounded-[12px] overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Name</th>
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Contact</th>
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Properties</th>
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Last contact</th>
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Score</th>
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Portfolio</th>
                    <th className="px-4 py-2 font-medium text-txt-secondary text-xs uppercase tracking-wide">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((s) => {
                    const phone = s.phone ?? s.skipTracedPhone
                    const email = s.email ?? s.skipTracedEmail
                    const linkedCount = s.properties.length
                    const firstAddr = s.properties[0]?.property
                    return (
                      <tr key={s.id} className="border-t hover:bg-surface-secondary/50 transition-colors" style={{ borderColor: 'var(--border-light)' }}>
                        <td className="px-4 py-3">
                          <Link href={`/${params.tenant}/sellers/${s.id}`} className="font-medium text-txt-primary hover:text-gunner-red">
                            {displayName(s)}
                          </Link>
                          {s.doNotContact && <span className="ml-2 text-xs text-red-600">DNC</span>}
                          {s.isDeceased && <span className="ml-2 text-xs text-gray-500">deceased</span>}
                        </td>
                        <td className="px-4 py-3 text-txt-secondary">
                          {phone && <div>{formatPhone(phone)}</div>}
                          {email && <div className="text-xs truncate max-w-[200px]">{email}</div>}
                          {!phone && !email && <span className="text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-txt-secondary">
                          {linkedCount === 0 ? '—' : (
                            <div>
                              <div className="font-medium text-txt-primary">{linkedCount}</div>
                              {firstAddr && (
                                <Link href={`/${params.tenant}/inventory/${firstAddr.id}`} className="text-xs hover:text-gunner-red truncate max-w-[200px] block">
                                  {firstAddr.address}, {firstAddr.city}
                                </Link>
                              )}
                              {linkedCount > 1 && <div className="text-xs">+{linkedCount - 1} more</div>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-txt-secondary text-xs">
                          {fmtRelative(s.lastContactDate)}
                          {s.totalCallCount > 0 && <div className="text-[11px] opacity-70">{s.totalCallCount} {s.totalCallCount === 1 ? 'call' : 'calls'}</div>}
                          {s.noAnswerStreak > 0 && <div className="text-[11px] text-orange-600">no-answer streak: {s.noAnswerStreak}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {s.likelihoodToSellScore != null
                            ? <ScorePill score={s.likelihoodToSellScore} />
                            : <span className="text-xs text-txt-secondary">—</span>}
                          {s.followUpPriority && (
                            <div className="text-[11px] mt-1 capitalize text-txt-secondary">{s.followUpPriority}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-txt-secondary text-xs">
                          {s.totalPropertiesOwned > 0 && <div>{s.totalPropertiesOwned} owned</div>}
                          {s.ownerPortfolioTotalEquity != null && <div>{fmtMoney(s.ownerPortfolioTotalEquity)} equity</div>}
                          {s.totalPropertiesOwned === 0 && s.ownerPortfolioTotalEquity == null && '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {s.seniorOwner === true && <FlagPill label="Senior" tone="blue" />}
                            {s.deceasedOwner === true && <FlagPill label="Deceased" tone="red" />}
                            {s.cashBuyerOwner === true && <FlagPill label="Cash buyer" tone="blue" />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline UI helpers (no new component file) ──────────────────────────────

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'red' | 'blue'
}) {
  const accent =
    tone === 'red' ? 'text-red-600' :
    tone === 'blue' ? 'text-blue-600' :
    'text-txt-primary'
  return (
    <div className="bg-surface-primary border rounded-[10px] px-3 py-2" style={{ borderColor: 'var(--border-light)' }}>
      <div className="text-[10px] uppercase tracking-wide text-txt-secondary">{label}</div>
      <div className={`text-lg font-semibold ${accent}`}>{value}</div>
    </div>
  )
}

function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const tone =
    pct >= 70 ? 'bg-green-100 text-green-800' :
    pct >= 40 ? 'bg-yellow-100 text-yellow-800' :
    'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tone}`}>
      {pct}%
    </span>
  )
}

function FlagPill({ label, tone }: { label: string; tone: 'red' | 'blue' }) {
  const cls = tone === 'red'
    ? 'bg-red-100 text-red-800'
    : 'bg-blue-100 text-blue-800'
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  )
}
