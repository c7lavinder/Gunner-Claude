// app/(tenant)/[tenant]/sellers/[id]/page.tsx

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { notFound, redirect } from 'next/navigation'
import { SellerDetailClient } from '@/components/sellers/seller-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export default async function SellerDetailPage({
  params,
}: {
  params: { tenant: string; id: string }
}) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/day-hub`)

  const seller = await db.seller.findFirst({
    where: { id: params.id, tenantId },
    include: {
      properties: {
        include: {
          property: {
            select: {
              id: true,
              address: true,
              city: true,
              state: true,
              ...PROPERTY_LANE_SELECT,
              arv: true,
              assignedTo: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  if (!seller) notFound()

  // Serialize for client
  const serialized = {
    ...seller,
    createdAt: seller.createdAt.toISOString(),
    updatedAt: seller.updatedAt.toISOString(),
    dateOfBirth: seller.dateOfBirth?.toISOString() ?? null,
    foreclosureAuctionDate: seller.foreclosureAuctionDate?.toISOString() ?? null,
    tenantLeaseEndDate: seller.tenantLeaseEndDate?.toISOString() ?? null,
    agentListingExpiration: seller.agentListingExpiration?.toISOString() ?? null,
    firstContactDate: seller.firstContactDate?.toISOString() ?? null,
    lastContactDate: seller.lastContactDate?.toISOString() ?? null,
    lastMeaningfulConversationDate: seller.lastMeaningfulConversationDate?.toISOString() ?? null,
    leadDate: seller.leadDate?.toISOString() ?? null,
    lastAiAnalysisDate: seller.lastAiAnalysisDate?.toISOString() ?? null,
    lastSaleDate: seller.lastSaleDate?.toISOString() ?? null,
    enrichmentLastUpdated: seller.enrichmentLastUpdated?.toISOString() ?? null,
    appointmentSetDate: seller.appointmentSetDate?.toISOString() ?? null,
    appointmentCompletedDate: seller.appointmentCompletedDate?.toISOString() ?? null,
    // CourtListener case-search dates
    clCasesSearchedAt: seller.clCasesSearchedAt?.toISOString() ?? null,
    clBankruptcyLatestFilingDate: seller.clBankruptcyLatestFilingDate?.toISOString() ?? null,
    clDivorceLatestFilingDate: seller.clDivorceLatestFilingDate?.toISOString() ?? null,
    clCivilJudgmentLatestDate: seller.clCivilJudgmentLatestDate?.toISOString() ?? null,
    clForeclosureCourtCaseDate: seller.clForeclosureCourtCaseDate?.toISOString() ?? null,
    clProbateLatestFilingDate: seller.clProbateLatestFilingDate?.toISOString() ?? null,
    clCasesJson: seller.clCasesJson as Array<{
      caseName: string | null; court: string | null; courtId: string | null
      dateFiled: string | null; dateTerminated: string | null
      docketNumber: string | null; natureOfSuit: string | null
      absoluteUrl: string | null; caseType: string; caseStatus?: string
    }>,
    // Decimals to strings
    mortgageBalance: seller.mortgageBalance?.toString() ?? null,
    monthlyMortgagePayment: seller.monthlyMortgagePayment?.toString() ?? null,
    secondMortgageBalance: seller.secondMortgageBalance?.toString() ?? null,
    hoaAmount: seller.hoaAmount?.toString() ?? null,
    propertyTaxesOwed: seller.propertyTaxesOwed?.toString() ?? null,
    lienAmount: seller.lienAmount?.toString() ?? null,
    sellerAskingPrice: seller.sellerAskingPrice?.toString() ?? null,
    lowestAcceptablePrice: seller.lowestAcceptablePrice?.toString() ?? null,
    amountNeededToClear: seller.amountNeededToClear?.toString() ?? null,
    monthlyCarryingCost: seller.monthlyCarryingCost?.toString() ?? null,
    countyAssessedValue: seller.countyAssessedValue?.toString() ?? null,
    countyMarketValue: seller.countyMarketValue?.toString() ?? null,
    lastSalePrice: seller.lastSalePrice?.toString() ?? null,
    // v1.1 Wave 1+2 — portfolio aggregate Decimals.
    ownerPortfolioTotalEquity: seller.ownerPortfolioTotalEquity?.toString() ?? null,
    ownerPortfolioTotalValue: seller.ownerPortfolioTotalValue?.toString() ?? null,
    ownerPortfolioTotalPurchase: seller.ownerPortfolioTotalPurchase?.toString() ?? null,
    ownerPortfolioAvgAssessed: seller.ownerPortfolioAvgAssessed?.toString() ?? null,
    ownerPortfolioAvgPurchase: seller.ownerPortfolioAvgPurchase?.toString() ?? null,
    // Properties
    properties: seller.properties.map(ps => ({
      isPrimary: ps.isPrimary,
      role: ps.role,
      property: {
        id: ps.property.id,
        address: ps.property.address,
        city: ps.property.city,
        state: ps.property.state,
        status: effectiveStatus(ps.property),
        arv: ps.property.arv?.toString() ?? null,
        assignedToName: ps.property.assignedTo?.name ?? null,
      },
    })),
    // JSON fields stay as-is
    fieldSources: (seller.fieldSources ?? {}) as Record<string, string>,
    commonObjections: seller.commonObjections as unknown[],
    objectionProfile: seller.objectionProfile as unknown[],
    redFlags: seller.redFlags as unknown[],
    positiveSignals: seller.positiveSignals as unknown[],
    environmentalFlags: seller.environmentalFlags as unknown[],
    tags: seller.tags as string[],
    customFields: seller.customFields as Record<string, unknown>,
  }

  return (
    <SellerDetailClient
      seller={serialized}
      tenantSlug={params.tenant}
    />
  )
}
