// app/(tenant)/[tenant]/buyers/[id]/page.tsx

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { notFound, redirect } from 'next/navigation'
import { BuyerDetailClient } from '@/components/buyers/buyer-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export default async function BuyerDetailPage({
  params,
}: {
  params: { tenant: string; id: string }
}) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/day-hub`)

  const buyer = await db.buyer.findFirst({
    where: { id: params.id, tenantId },
    include: {
      propertyStages: {
        include: {
          property: {
            select: {
              id: true,
              address: true,
              city: true,
              state: true,
              ...PROPERTY_LANE_SELECT,
              arv: true,
              askingPrice: true,
              assignmentFee: true,
              acceptedPrice: true,
            },
          },
        },
      },
    },
  })

  if (!buyer) notFound()

  // Closed-deal revenue — Session 78b. Pull every accepted offer for
  // this buyer's GHL contact and sum the property's assignment fee.
  // Falls back to acceptedPrice - contractPrice if assignmentFee isn't set.
  // Done server-side so the hero card lights up on first paint.
  let closedRevenue = 0
  let closedDealCount = 0
  const closedDealAddresses: Array<{ propertyId: string; address: string; assignmentFee: string | null; closedAt: string | null }> = []
  if (buyer.ghlContactId) {
    const acceptedOffers = await db.outreachLog.findMany({
      where: {
        tenantId,
        ghlContactId: buyer.ghlContactId,
        type: 'offer',
        offerStatus: 'Accepted',
      },
      select: {
        propertyId: true,
        loggedAt: true,
        property: {
          select: { id: true, address: true, assignmentFee: true, acceptedPrice: true, contractPrice: true },
        },
      },
      orderBy: { loggedAt: 'desc' },
    })
    // Dedup by property — one accepted offer per deal even if logged twice.
    const seen = new Set<string>()
    for (const o of acceptedOffers) {
      if (!o.property || seen.has(o.property.id)) continue
      seen.add(o.property.id)
      const fee = o.property.assignmentFee ? Number(o.property.assignmentFee) : null
      const derived = (o.property.acceptedPrice && o.property.contractPrice)
        ? Number(o.property.acceptedPrice) - Number(o.property.contractPrice)
        : null
      const value = fee ?? derived ?? 0
      closedRevenue += value
      closedDealCount += 1
      closedDealAddresses.push({
        propertyId: o.property.id,
        address: o.property.address,
        assignmentFee: o.property.assignmentFee?.toString() ?? (derived !== null ? String(derived) : null),
        closedAt: o.loggedAt.toISOString(),
      })
    }
  }

  // Last contact date — Session 78b. Latest of Call.calledAt or
  // OutreachLog.loggedAt for this buyer's GHL contact. Falls back to
  // the manually-stored value when nothing is logged. Auto-updates with
  // every page load — no cron needed.
  let lastContactComputed: string | null = null
  if (buyer.ghlContactId) {
    const [lastCall, lastLog] = await Promise.all([
      db.call.findFirst({
        where: { tenantId, ghlContactId: buyer.ghlContactId, calledAt: { not: null } },
        orderBy: { calledAt: 'desc' },
        select: { calledAt: true },
      }),
      db.outreachLog.findFirst({
        where: { tenantId, ghlContactId: buyer.ghlContactId },
        orderBy: { loggedAt: 'desc' },
        select: { loggedAt: true },
      }),
    ])
    const candidates = [
      lastCall?.calledAt ?? null,
      lastLog?.loggedAt ?? null,
    ].filter((d): d is Date => d !== null)
    if (candidates.length > 0) {
      lastContactComputed = candidates.reduce((a, b) => (a > b ? a : b)).toISOString()
    }
  }

  // Tenant-wide market list — pulled from Buyer.primaryMarkets ∪
  // Property.propertyMarkets so the multi-select knows every market
  // currently in use. Reps can also add new ones from the slideover.
  const [allBuyerMarkets, allPropertyMarkets] = await Promise.all([
    db.buyer.findMany({
      where: { tenantId },
      select: { primaryMarkets: true },
    }),
    db.property.findMany({
      where: { tenantId },
      select: { propertyMarkets: true },
    }),
  ])
  const marketSet = new Set<string>()
  for (const b of allBuyerMarkets) {
    if (Array.isArray(b.primaryMarkets)) {
      for (const m of b.primaryMarkets as string[]) {
        const t = String(m).trim()
        if (t) marketSet.add(t)
      }
    }
  }
  for (const p of allPropertyMarkets) {
    if (Array.isArray(p.propertyMarkets)) {
      for (const m of p.propertyMarkets) {
        const t = String(m).trim()
        if (t) marketSet.add(t)
      }
    }
  }
  const tenantMarkets = Array.from(marketSet).sort((a, b) => a.localeCompare(b))

  const serialized = {
    ...buyer,
    createdAt: buyer.createdAt.toISOString(),
    updatedAt: buyer.updatedAt.toISOString(),
    // Decimals to strings
    maxRepairBudget: buyer.maxRepairBudget?.toString() ?? null,
    minPurchasePrice: buyer.minPurchasePrice?.toString() ?? null,
    maxPurchasePrice: buyer.maxPurchasePrice?.toString() ?? null,
    minArv: buyer.minArv?.toString() ?? null,
    maxArv: buyer.maxArv?.toString() ?? null,
    minEquityRequired: buyer.minEquityRequired?.toString() ?? null,
    maxAssignmentFeeAccepted: buyer.maxAssignmentFeeAccepted?.toString() ?? null,
    minCashFlowRequired: buyer.minCashFlowRequired?.toString() ?? null,
    rehabBudgetMin: buyer.rehabBudgetMin?.toString() ?? null,
    rehabBudgetMax: buyer.rehabBudgetMax?.toString() ?? null,
    pofAmount: buyer.pofAmount?.toString() ?? null,
    pofExpiration: buyer.pofExpiration?.toISOString() ?? null,
    emdAmountComfortable: buyer.emdAmountComfortable?.toString() ?? null,
    averageDealPrice: buyer.averageDealPrice?.toString() ?? null,
    averageSpreadAccepted: buyer.averageSpreadAccepted?.toString() ?? null,
    totalVolumeFromUs: buyer.totalVolumeFromUs?.toString() ?? null,
    lifetimeValueEstimate: buyer.lifetimeValueEstimate?.toString() ?? null,
    // Dates
    buyerSinceDate: buyer.buyerSinceDate?.toISOString() ?? null,
    lastDealClosedDate: buyer.lastDealClosedDate?.toISOString() ?? null,
    lastCommunicationDate: buyer.lastCommunicationDate?.toISOString() ?? null,
    birthday: buyer.birthday?.toISOString() ?? null,
    lastInPersonMeeting: buyer.lastInPersonMeeting?.toISOString() ?? null,
    lastAiAnalysisDate: buyer.lastAiAnalysisDate?.toISOString() ?? null,
    // JSON fields
    primaryMarkets: buyer.primaryMarkets as string[],
    countiesOfInterest: buyer.countiesOfInterest as string[],
    citiesOfInterest: buyer.citiesOfInterest as string[],
    zipCodesOfInterest: buyer.zipCodesOfInterest as string[],
    neighborhoodsOfInterest: buyer.neighborhoodsOfInterest as string[],
    geographicExclusions: buyer.geographicExclusions as string[],
    propertyTypes: buyer.propertyTypes as string[],
    conditionRange: buyer.conditionRange as Record<string, unknown>,
    fallThroughReasons: buyer.fallThroughReasons as string[],
    keyStaffNames: buyer.keyStaffNames as string[],
    exitStrategies: buyer.exitStrategies as string[],
    redFlagsAi: buyer.redFlagsAi as string[],
    tags: buyer.tags as string[],
    customFields: buyer.customFields as Record<string, unknown>,
    fieldSources: (buyer.fieldSources ?? {}) as Record<string, string>,
    // Property stages
    propertyStages: buyer.propertyStages.map(ps => ({
      id: ps.id,
      stage: ps.stage,
      property: {
        id: ps.property.id,
        address: ps.property.address,
        city: ps.property.city,
        state: ps.property.state,
        status: effectiveStatus(ps.property),
        arv: ps.property.arv?.toString() ?? null,
        askingPrice: ps.property.askingPrice?.toString() ?? null,
      },
    })),
  }

  return (
    <BuyerDetailClient
      buyer={serialized}
      tenantSlug={params.tenant}
      closedRevenue={closedRevenue}
      closedDealCount={closedDealCount}
      closedDeals={closedDealAddresses}
      lastContactComputed={lastContactComputed}
      tenantMarkets={tenantMarkets}
    />
  )
}
