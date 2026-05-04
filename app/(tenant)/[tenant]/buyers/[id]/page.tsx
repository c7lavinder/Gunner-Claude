// app/(tenant)/[tenant]/buyers/[id]/page.tsx

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { notFound, redirect } from 'next/navigation'
import { BuyerDetailClient } from '@/components/buyers/buyer-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

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
              status: true,
              arv: true,
              askingPrice: true,
            },
          },
        },
      },
    },
  })

  if (!buyer) notFound()

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
        status: ps.property.status,
        arv: ps.property.arv?.toString() ?? null,
        askingPrice: ps.property.askingPrice?.toString() ?? null,
      },
    })),
  }

  return (
    <BuyerDetailClient
      buyer={serialized}
      tenantSlug={params.tenant}
    />
  )
}
