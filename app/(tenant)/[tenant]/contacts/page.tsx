// app/(tenant)/[tenant]/contacts/page.tsx

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { ContactsClient } from '@/components/contacts/contacts-client'
import type { UserRole } from '@/types/roles'
import { hasPermission, isRoleAtLeast } from '@/types/roles'

export default async function ContactsPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/dashboard`)

  const [sellers, sellerCount, buyers, buyerCount] = await Promise.all([
    db.seller.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, phone: true, email: true, ghlContactId: true,
        motivationPrimary: true, urgencyLevel: true, leadScore: true,
        predictedCloseProbability: true, followUpPriority: true,
        totalCallCount: true, lastContactDate: true,
        createdAt: true,
      },
    }),
    db.seller.count({ where: { tenantId } }),
    db.buyer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, name: true, phone: true, secondaryPhone: true, mobilePhone: true,
        email: true, secondaryEmail: true, company: true, website: true, ghlContactId: true,
        mailingAddress: true, mailingCity: true, mailingState: true, mailingZip: true,
        preferredContactMethod: true, bestTimeToContact: true,
        doNotContact: true, isActive: true, isVip: true, isGhost: true,
        // Buybox — Geographic
        primaryMarkets: true, countiesOfInterest: true, citiesOfInterest: true,
        zipCodesOfInterest: true, urbanRuralPreference: true,
        isNationalBuyer: true, isOutOfStateBuyer: true,
        // Buybox — Property
        propertyTypes: true, minBeds: true, maxBeds: true, minSqft: true, maxSqft: true,
        yearBuiltMin: true, maxRepairBudget: true,
        tenantOccupiedOk: true, prefersVacant: true,
        // Buybox — Financial
        minPurchasePrice: true, maxPurchasePrice: true, minArv: true, maxArv: true,
        maxArvPercent: true, fundingType: true, proofOfFundsOnFile: true,
        pofAmount: true, hardMoneyLender: true,
        typicalCloseTimelineDays: true, canCloseAsIs: true,
        doubleCloseOk: true, subjectToOk: true,
        // Activity
        buyerGrade: true, buyerSinceDate: true, totalDealsClosedWithUs: true,
        totalDealsClosedOverall: true, averageCloseTimelineDays: true,
        blastResponseRate: true, offerRate: true, closeRate: true,
        dealsFallenThrough: true, reliabilityScore: true,
        // Communication
        preferredBlastChannel: true, unsubscribedFromEmail: true, unsubscribedFromText: true,
        lastCommunicationDate: true, engagementTrend: true,
        // Relationship
        howAcquired: true, referralSourceName: true, relationshipStrength: true,
        hasExclusivityAgreement: true,
        // Strategy
        exitStrategies: true, offMarketOnly: true, creativeFinanceInterest: true,
        isSubjectToBuyer: true,
        // AI
        buyerScore: true, ghostRiskScore: true,
        // General
        tags: true, internalNotes: true, priorityFlag: true,
        createdAt: true,
      },
    }),
    db.buyer.count({ where: { tenantId } }),
  ])

  return (
    <ContactsClient
      sellers={sellers.map(s => ({
        ...s,
        lastContactDate: s.lastContactDate?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      }))}
      buyers={buyers.map(b => ({
        ...b,
        primaryMarkets: b.primaryMarkets as string[],
        countiesOfInterest: b.countiesOfInterest as string[],
        citiesOfInterest: b.citiesOfInterest as string[],
        zipCodesOfInterest: b.zipCodesOfInterest as string[],
        propertyTypes: b.propertyTypes as string[],
        exitStrategies: b.exitStrategies as string[],
        tags: b.tags as string[],
        maxRepairBudget: b.maxRepairBudget?.toString() ?? null,
        minPurchasePrice: b.minPurchasePrice?.toString() ?? null,
        maxPurchasePrice: b.maxPurchasePrice?.toString() ?? null,
        minArv: b.minArv?.toString() ?? null,
        maxArv: b.maxArv?.toString() ?? null,
        pofAmount: b.pofAmount?.toString() ?? null,
        buyerSinceDate: b.buyerSinceDate?.toISOString() ?? null,
        lastCommunicationDate: b.lastCommunicationDate?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      }))}
      sellerCount={sellerCount}
      buyerCount={buyerCount}
      tenantSlug={params.tenant}
      canSync={isRoleAtLeast(role, 'ADMIN')}
    />
  )
}
