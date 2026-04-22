import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/inventory/page.tsx

import { Suspense } from 'react'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { InventoryClient } from '@/components/inventory/inventory-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'

export default async function InventoryPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()
  

  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  if (!hasPermission(role, 'inventory.view')) redirect(`/${params.tenant}/dashboard`)

  const canViewAll = hasPermission(role, 'properties.view.all')

  let properties
  try {
    properties = await db.property.findMany({
      where: {
        tenantId,
        ...(!canViewAll ? { assignedToId: userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 20000,
      select: {
        id: true, address: true, city: true, state: true, zip: true,
        status: true, dispoStatus: true, createdAt: true, stageEnteredAt: true,
        ghlSyncLocked: true,
        arv: true, askingPrice: true, mao: true, contractPrice: true,
        assignmentFee: true, currentOffer: true, highestOffer: true,
        acceptedPrice: true, finalProfit: true,
        offerTypes: true, altPrices: true,
        fieldSources: true, ghlContactId: true, ghlPipelineStage: true,
        leadSource: true, lastOfferDate: true, lastContactedDate: true,
        assignedToId: true,
        sellers: {
          include: { seller: { select: { id: true, name: true, phone: true, email: true, ghlContactId: true } } },
          orderBy: { isPrimary: 'desc' },
        },
        assignedTo: { select: { id: true, name: true } },
        market: { select: { name: true } },
        // Milestones feed the context-aware days badges. Acq-type milestones
        // (LEAD / APPOINTMENT_SET / OFFER_MADE / UNDER_CONTRACT / CLOSED)
        // drive the acq-pipeline numbers; DISPO_* drive the dispo numbers.
        milestones: {
          select: { type: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { calls: true, tasks: true } },
      },
    })
  } catch (err) {
    console.error('[Inventory] Prisma query failed:', err instanceof Error ? err.message : err)
    throw err
  }

  // Status counts for filter chips — properties with dispoStatus count in BOTH pipelines
  const statusCounts = properties.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    if (p.dispoStatus) {
      acc[p.dispoStatus] = (acc[p.dispoStatus] ?? 0) + 1
    }
    return acc
  }, {})

  // Get GHL location ID for CRM links
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlLocationId: true },
  })

  // Per-pipeline entry + stage timestamps derived from the milestones table.
  // Acq pipeline enters at the first LEAD milestone (≈ createdAt); dispo pipeline
  // enters at the first DISPO_* milestone. Stage-entered = latest milestone of
  // the matching kind. Returns ISO strings or null when the property has never
  // been in that pipeline.
  const ACQ_MILESTONE_TYPES = new Set(['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT', 'CLOSED'])
  const DISPO_MILESTONE_TYPES = new Set(['DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED', 'DISPO_CLOSED'])
  function pipelineTimestamps(milestones: Array<{ type: string; createdAt: Date }>, createdAt: Date) {
    const acq = milestones.filter(m => ACQ_MILESTONE_TYPES.has(m.type))
    const dispo = milestones.filter(m => DISPO_MILESTONE_TYPES.has(m.type))
    return {
      acqPipelineEnteredAt: (acq[0]?.createdAt ?? createdAt).toISOString(),
      acqStageEnteredAt: (acq[acq.length - 1]?.createdAt ?? createdAt).toISOString(),
      dispoPipelineEnteredAt: dispo[0]?.createdAt.toISOString() ?? null,
      dispoStageEnteredAt: dispo[dispo.length - 1]?.createdAt.toISOString() ?? null,
    }
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-txt-muted">Loading inventory...</div>}>
    <InventoryClient
      properties={properties.map((p) => ({
        id: p.id,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        status: p.status,
        dispoStatus: p.dispoStatus,
        arv: p.arv?.toString() ?? null,
        askingPrice: p.askingPrice?.toString() ?? null,
        mao: p.mao?.toString() ?? null,
        contractPrice: p.contractPrice?.toString() ?? null,
        assignmentFee: p.assignmentFee?.toString() ?? null,
        currentOffer: p.currentOffer?.toString() ?? null,
        highestOffer: p.highestOffer?.toString() ?? null,
        acceptedPrice: p.acceptedPrice?.toString() ?? null,
        finalProfit: p.finalProfit?.toString() ?? null,
        offerTypes: Array.isArray(p.offerTypes) ? (p.offerTypes as string[]) : [],
        altPrices: (p.altPrices ?? {}) as Record<string, Record<string, string | null>>,
        fieldSources: (p.fieldSources ?? {}) as Record<string, string>,
        createdAt: p.createdAt.toISOString(),
        stageEnteredAt: p.stageEnteredAt?.toISOString() ?? null,
        ghlSyncLocked: p.ghlSyncLocked,
        ...pipelineTimestamps(p.milestones, p.createdAt),
        sellerName: p.sellers[0]?.seller.name ?? null,
        sellerPhone: p.sellers[0]?.seller.phone ?? null,
        sellers: p.sellers.map((ps) => ({
          id: ps.seller.id,
          name: ps.seller.name,
          phone: ps.seller.phone,
          email: ps.seller.email,
          isPrimary: ps.isPrimary,
          role: ps.role,
          ghlContactId: ps.seller.ghlContactId,
        })),
        assignedTo: p.assignedTo,
        callCount: p._count.calls,
        taskCount: p._count.tasks,
        ghlContactId: p.ghlContactId,
        leadSource: p.leadSource,
        ghlStageName: p.ghlPipelineStage,
        market: p.market?.name ?? null,
        lastOfferDate: p.lastOfferDate?.toISOString() ?? null,
        lastContactedDate: p.lastContactedDate?.toISOString() ?? null,
      }))}
      statusCounts={statusCounts}
      tenantSlug={params.tenant}
      canManage={hasPermission(role, 'inventory.manage')}
      ghlLocationId={tenant?.ghlLocationId ?? undefined}
    />
    </Suspense>
  )
}
