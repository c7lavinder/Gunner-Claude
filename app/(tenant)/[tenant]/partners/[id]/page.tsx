// app/(tenant)/[tenant]/partners/[id]/page.tsx
// Partner detail — mirror of /sellers/[id] + /buyers/[id] for the
// unified Partner contact type (Session 67 Phase 5).

import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { notFound, redirect } from 'next/navigation'
import { PartnerDetailClient } from './partner-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export default async function PartnerDetailPage({
  params,
}: {
  params: { tenant: string; id: string }
}) {
  const session = await requireSession()
  const tenantId = session.tenantId
  const role = session.role as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/day-hub`)
  const canEdit = hasPermission(role, 'properties.edit')

  const partner = await db.partner.findFirst({
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
              askingPrice: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!partner) notFound()

  const serialized = {
    id: partner.id,
    createdAt: partner.createdAt.toISOString(),
    updatedAt: partner.updatedAt.toISOString(),

    // Identity
    name: partner.name,
    firstName: partner.firstName,
    lastName: partner.lastName,
    phone: partner.phone,
    email: partner.email,
    ghlContactId: partner.ghlContactId,
    company: partner.company,
    website: partner.website,

    types: (partner.types ?? []) as string[],

    // Brokerage / license
    brokerageName: partner.brokerageName,
    brokerageAddress: partner.brokerageAddress,
    licenseNumber: partner.licenseNumber,
    licenseState: partner.licenseState,
    licenseExpiration: partner.licenseExpiration?.toISOString() ?? null,

    // Wholesaler-flavored
    buyerListSize: partner.buyerListSize,
    dealsPerMonthEstimate: partner.dealsPerMonthEstimate,
    prefersAssignment: partner.prefersAssignment,
    typicalAssignmentFee: partner.typicalAssignmentFee?.toString() ?? null,

    // Markets
    primaryMarkets: (partner.primaryMarkets ?? []) as string[],
    propertyTypeFocus: partner.propertyTypeFocus,
    yearsExperience: partner.yearsExperience,
    specialties: (partner.specialties ?? []) as string[],

    // Performance counters
    dealsSourcedToUsCount: partner.dealsSourcedToUsCount,
    dealsTakenFromUsCount: partner.dealsTakenFromUsCount,
    dealsClosedWithUsCount: partner.dealsClosedWithUsCount,
    jvHistoryCount: partner.jvHistoryCount,
    lastDealDate: partner.lastDealDate?.toISOString() ?? null,
    responseRate: partner.responseRate,
    reliabilityScore: partner.reliabilityScore,
    partnerGrade: partner.partnerGrade,
    averageCommissionPercent: partner.averageCommissionPercent,

    // Communication
    preferredContactMethod: partner.preferredContactMethod,
    bestTimeToContact: partner.bestTimeToContact,
    doNotContact: partner.doNotContact,

    // Reputation
    tierClassification: partner.tierClassification,
    reputationNotes: partner.reputationNotes,
    badWithUsFlag: partner.badWithUsFlag,
    priorityFlag: partner.priorityFlag,

    // Standard
    tags: (partner.tags ?? []) as string[],
    internalNotes: partner.internalNotes,

    // Linked properties (deal history)
    deals: partner.properties.map(pp => ({
      propertyId: pp.propertyId,
      role: pp.role,
      commissionPercent: pp.commissionPercent,
      commissionAmount: pp.commissionAmount?.toString() ?? null,
      purchasePrice: pp.purchasePrice?.toString() ?? null,
      assignmentFeePaid: pp.assignmentFeePaid?.toString() ?? null,
      notesOnThisDeal: pp.notesOnThisDeal,
      createdAt: pp.createdAt.toISOString(),
      property: {
        id: pp.property.id,
        address: pp.property.address,
        city: pp.property.city,
        state: pp.property.state,
        status: effectiveStatus(pp.property),
        arv: pp.property.arv?.toString() ?? null,
        askingPrice: pp.property.askingPrice?.toString() ?? null,
      },
    })),
  }

  return (
    <PartnerDetailClient
      partner={serialized}
      tenantSlug={params.tenant}
      canEdit={canEdit}
    />
  )
}
