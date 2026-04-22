import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx


import { db } from '@/lib/db/client'
import { redirect, notFound } from 'next/navigation'
import { PropertyDetailClient } from '@/components/inventory/property-detail-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function PropertyDetailPage({
  params,
}: {
  params: { tenant: string; propertyId: string }
}) {
  const session = await requireSession()
  

  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  if (!hasPermission(role, 'properties.view.assigned')) redirect(`/${params.tenant}/dashboard`)

  let property
  try {
    property = await db.property.findUnique({
      where: { id: params.propertyId, tenantId },
      select: {
        id: true, address: true, city: true, state: true, zip: true,
        status: true, dispoStatus: true, createdAt: true, updatedAt: true,
        arv: true, askingPrice: true, mao: true, contractPrice: true,
        assignmentFee: true, offerPrice: true, repairCost: true, wholesalePrice: true,
        currentOffer: true, highestOffer: true, acceptedPrice: true, finalProfit: true,
        fieldSources: true, ghlContactId: true, ghlPipelineId: true, ghlPipelineStage: true,
        assignedToId: true, leadSource: true,
        beds: true, baths: true, sqft: true, yearBuilt: true, lotSize: true,
        propertyType: true, occupancy: true, lockboxCode: true,
        waterType: true, waterNotes: true, sewerType: true, sewerCondition: true, sewerNotes: true,
        electricType: true, electricNotes: true,
        projectType: true, propertyMarkets: true,
        description: true, internalNotes: true,
        propertyCondition: true, dealIntel: true,
        lastOfferDate: true, lastContactedDate: true,
        repairEstimate: true, rentalEstimate: true, neighborhoodSummary: true,
        zestimate: true, floodZone: true, taxAssessment: true, annualTax: true,
        deedDate: true, aiEnrichmentStatus: true, aiEnrichmentError: true,
        dealBlastAskingOverride: true, dealBlastArvOverride: true,
        dealBlastContractOverride: true, dealBlastAssignmentFeeOverride: true,
        customFields: true, marketId: true, manualBuyerIds: true,
        tcpScore: true, tcpFactors: true, tcpUpdatedAt: true,
        competingOfferCount: true, dealHealthScore: true,
        zillowData: true, countyData: true, constructionEstimate: true,
        offerTypes: true, altPrices: true,
        story: true, storyUpdatedAt: true, storyVersion: true,
        sellers: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                ghlContactId: true,
              },
            },
          },
          orderBy: { isPrimary: 'desc' },
        },
        assignedTo: { select: { id: true, name: true, role: true } },
        market: { select: { name: true } },
        calls: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true, score: true, gradingStatus: true, direction: true,
            callType: true, durationSeconds: true, calledAt: true, aiSummary: true,
            assignedTo: { select: { name: true } },
          },
        },
        tasks: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
          orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
          take: 10,
        },
      },
    })
  } catch (err) {
    console.error('[PropertyDetail] Prisma query failed:', err instanceof Error ? err.message : err)
    throw err
  }

  if (!property) notFound()

  // Fetch milestones for pipeline display — from PropertyMilestone table + KPI entries
  const [dbMilestones, kpiEntries] = await Promise.all([
    db.propertyMilestone.findMany({
      where: { propertyId: params.propertyId, tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, createdAt: true, notes: true, source: true, loggedById: true, loggedBy: { select: { name: true } } },
    }),
    db.auditLog.findMany({
      where: {
        tenantId, action: 'kpi.entry',
        payload: { path: ['propertyId'], equals: params.propertyId },
      },
      orderBy: { createdAt: 'asc' },
      select: { payload: true, createdAt: true },
    }),
  ])

  // Map KPI entry types to milestone types
  const kpiTypeToMilestone: Record<string, string> = {
    apts: 'APPOINTMENT_SET', offers: 'OFFER_MADE', contracts: 'UNDER_CONTRACT',
  }
  const kpiMilestones = kpiEntries
    .filter(e => {
      const p = e.payload as Record<string, unknown> | null
      return p?.type && kpiTypeToMilestone[p.type as string]
    })
    .map(e => {
      const p = e.payload as Record<string, unknown>
      return {
        type: kpiTypeToMilestone[p.type as string],
        createdAt: e.createdAt,
        notes: (p.contactName as string) ?? (p.notes as string) ?? null,
      }
    })

  // Merge: DB milestones take priority, KPI entries fill gaps
  const milestoneTypes = new Set(dbMilestones.map(m => m.type as string))
  const milestones = [
    ...dbMilestones,
    ...kpiMilestones.filter(m => !milestoneTypes.has(m.type)),
  ]

  // Fetch team members for @mentions in messaging
  const teamMembers = await db.user.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  // Fetch messages (audit logs with action 'property.message')
  const messages = await db.auditLog.findMany({
    where: { tenantId, resourceId: params.propertyId, action: 'property.message' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, payload: true, createdAt: true, userId: true, user: { select: { name: true } } },
  })

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlLocationId: true, config: true },
  })

  const tenantConfig = (tenant?.config ?? {}) as Record<string, unknown>
  const projectTypeOptions = Array.isArray(tenantConfig.projectTypes)
    ? tenantConfig.projectTypes as string[]
    : ['Fix and Flip', 'Rental', 'Retail', 'Land', 'New Build', 'Commercial', 'Multi-Family']

  return (
    <PropertyDetailClient
      property={{
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        status: property.status,
        arv: property.arv?.toString() ?? null,
        askingPrice: property.askingPrice?.toString() ?? null,
        mao: property.mao?.toString() ?? null,
        contractPrice: property.contractPrice?.toString() ?? null,
        assignmentFee: property.assignmentFee?.toString() ?? null,
        offerPrice: property.offerPrice?.toString() ?? null,
        repairCost: property.repairCost?.toString() ?? null,
        wholesalePrice: property.wholesalePrice?.toString() ?? null,
        currentOffer: property.currentOffer?.toString() ?? null,
        highestOffer: property.highestOffer?.toString() ?? null,
        acceptedPrice: property.acceptedPrice?.toString() ?? null,
        finalProfit: property.finalProfit?.toString() ?? null,
        fieldSources: (() => {
          const fs = { ...((property.fieldSources ?? {}) as Record<string, string>) }
          // If propertyMarkets has values but no source tracked, derive from how it was populated
          const mkts = (property.propertyMarkets ?? []) as string[]
          if (mkts.length > 0 && !fs.propertyMarkets) fs.propertyMarkets = 'api'
          if (property.market?.name && !fs.propertyMarkets) fs.propertyMarkets = 'api'
          // Same for projectType
          const pts = (property.projectType ?? []) as string[]
          if (pts.length > 0 && !fs.projectType) fs.projectType = 'user'
          // Physical-attribute fields populated by API/AI enrichment — show the tag
          // when a value exists but no source was recorded. 'api' is the right default
          // since these originate from BatchData / Zillow enrichment, not user input.
          const apiDefaults: Array<keyof typeof property> = [
            'yearBuilt', 'lotSize', 'propertyType', 'beds', 'baths', 'sqft',
          ]
          for (const k of apiDefaults) {
            if (property[k] != null && property[k] !== '' && !fs[k as string]) {
              fs[k as string] = 'api'
            }
          }
          return fs
        })(),
        ghlContactId: property.ghlContactId,
        createdAt: property.createdAt.toISOString(),
        beds: property.beds, baths: property.baths, sqft: property.sqft,
        yearBuilt: property.yearBuilt, lotSize: property.lotSize,
        propertyType: property.propertyType, occupancy: property.occupancy, lockboxCode: property.lockboxCode,
        waterType: property.waterType, waterNotes: property.waterNotes,
        sewerType: property.sewerType, sewerCondition: property.sewerCondition, sewerNotes: property.sewerNotes,
        electricType: property.electricType, electricNotes: property.electricNotes,
        projectType: (property.projectType ?? []) as string[],
        marketName: property.market?.name ?? null,
        propertyMarkets: (property.propertyMarkets ?? []) as string[],
        description: property.description, internalNotes: property.internalNotes,
        // Deal Intel
        propertyCondition: property.propertyCondition ?? null,
        lastOfferDate: property.lastOfferDate?.toISOString() ?? null,
        lastContactedDate: property.lastContactedDate?.toISOString() ?? null,
        // AI enrichment fields
        repairEstimate: property.repairEstimate?.toString() ?? null,
        rentalEstimate: property.rentalEstimate?.toString() ?? null,
        neighborhoodSummary: property.neighborhoodSummary ?? null,
        zestimate: property.zestimate?.toString() ?? null,
        floodZone: property.floodZone ?? null,
        taxAssessment: property.taxAssessment?.toString() ?? null,
        annualTax: property.annualTax?.toString() ?? null,
        aiEnrichmentStatus: property.aiEnrichmentStatus ?? null,
        // Deal Blast overrides
        dealBlastAskingOverride: property.dealBlastAskingOverride?.toString() ?? null,
        dealBlastArvOverride: property.dealBlastArvOverride?.toString() ?? null,
        dealBlastContractOverride: property.dealBlastContractOverride?.toString() ?? null,
        dealBlastAssignmentFeeOverride: property.dealBlastAssignmentFeeOverride?.toString() ?? null,
        // Alt offer types + per-type price overrides
        offerTypes: (property.offerTypes ?? []) as string[],
        altPrices: (property.altPrices ?? {}) as Record<string, Record<string, string | null>>,
        // Property Story
        story: property.story,
        storyUpdatedAt: property.storyUpdatedAt?.toISOString() ?? null,
        storyVersion: property.storyVersion,
        sellers: property.sellers.map((ps) => ({
          id: ps.seller.id,
          name: ps.seller.name,
          phone: ps.seller.phone,
          email: ps.seller.email,
          isPrimary: ps.isPrimary,
          role: ps.role,
          ghlContactId: ps.seller.ghlContactId,
        })),
        assignedTo: property.assignedTo,
        calls: property.calls.map((c) => ({
          id: c.id,
          score: c.score,
          gradingStatus: c.gradingStatus,
          direction: c.direction,
          callType: c.callType,
          durationSeconds: c.durationSeconds,
          calledAt: c.calledAt?.toISOString() ?? null,
          aiSummary: c.aiSummary,
          assignedToName: c.assignedTo?.name ?? null,
        })),
        tasks: property.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          priority: t.priority,
          status: t.status,
          dueAt: t.dueAt?.toISOString() ?? null,
        })),
        auditLogs: [],
        leadSource: property.leadSource,
        ghlStageName: property.ghlPipelineStage,
        milestones: milestones.map(m => ({
          id: 'id' in m ? m.id : undefined,
          type: m.type as string,
          date: m.createdAt.toISOString(),
          notes: m.notes,
          source: 'source' in m ? (m.source as string) : 'MANUAL',
          loggedById: 'loggedById' in m ? (m.loggedById as string | null) : null,
          loggedByName: 'loggedBy' in m ? ((m.loggedBy as { name: string } | null)?.name ?? null) : null,
        })),
        dispoStatus: property.dispoStatus,
        teamMembers: teamMembers.map(u => ({ id: u.id, name: u.name })),
        messages: messages.map(m => ({
          id: m.id,
          text: ((m.payload as Record<string, unknown>)?.text as string) ?? '',
          mentions: ((m.payload as Record<string, unknown>)?.mentions as Array<{ id: string; name: string }>) ?? [],
          userId: m.userId,
          userName: m.user?.name ?? 'Unknown',
          createdAt: m.createdAt.toISOString(),
        })),
      }}
      tenantSlug={params.tenant}
      canEdit={hasPermission(role, 'properties.edit')}
      canManage={hasPermission(role, 'inventory.manage')}
      ghlContactId={property.ghlContactId}
      ghlLocationId={tenant?.ghlLocationId ?? undefined}
      projectTypeOptions={projectTypeOptions}
    />
  )
}
