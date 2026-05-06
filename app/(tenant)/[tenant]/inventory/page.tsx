import { requireSession } from '@/lib/auth/session'
// app/(tenant)/[tenant]/inventory/page.tsx

import { Suspense } from 'react'
import { db } from '@/lib/db/client'
import { redirect } from 'next/navigation'
import { InventoryClient } from '@/components/inventory/inventory-client'
import type { UserRole } from '@/types/roles'
import { hasPermission } from '@/types/roles'
import { effectiveStatus, effectiveStageName, effectiveStageEnteredAt, PROPERTY_LANE_SELECT } from '@/lib/property-status'

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: { tenant: string }
  searchParams?: { archived?: string }
}) {
  const session = await requireSession()


  const userId = session.userId
  const tenantId = session.tenantId
  const role = (session.role) as UserRole

  if (!hasPermission(role, 'inventory.view')) redirect(`/${params.tenant}/day-hub`)

  const canViewAll = hasPermission(role, 'properties.view.all')

  // Phase 1 visibility (plan §4) — Session 73 fix: include longterm
  // alongside acq + dispo. After the Phase 2 backfill loaded ~7,700
  // longterm-only properties from the GHL Follow Up pipeline, the
  // original "acq OR dispo" rule hid all of them by default and the
  // FOLLOW_UP / DEAD chip counts read 0. Default visibility now =
  // any lane status set. Dispo CLOSED stays hidden (it's a finished
  // deal you sold). ?archived=1 still flips to "show everything"
  // including dispo CLOSED and orphan rows with no status anywhere.
  const showArchived = searchParams?.archived === '1'
  const visibilityFilter = showArchived
    ? {}
    : {
        OR: [
          { acqStatus: { not: null } },
          { AND: [{ dispoStatus: { not: null } }, { dispoStatus: { not: 'CLOSED' as const } }] },
          { longtermStatus: { not: null } },
        ],
      }

  let properties
  try {
    properties = await db.property.findMany({
      where: {
        tenantId,
        ...(!canViewAll ? { assignedToId: userId } : {}),
        ...visibilityFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: 20000,
      select: {
        id: true, address: true, city: true, state: true, zip: true,
        ...PROPERTY_LANE_SELECT,
        createdAt: true,
        ghlSyncLocked: true,
        arv: true, askingPrice: true, mao: true, contractPrice: true,
        assignmentFee: true, currentOffer: true, highestOffer: true,
        acceptedPrice: true, finalProfit: true,
        offerTypes: true, altPrices: true,
        fieldSources: true, ghlContactId: true,
        leadSource: true, lastOfferDate: true, lastContactedDate: true,
        assignedToId: true,
        // Vendor distress signals for the inventory row badge
        distressScore: true, preForeclosure: true, bankOwned: true,
        inBankruptcy: true, inProbate: true, inDivorce: true,
        hasRecentEviction: true, taxDelinquent: true, foreclosureStatus: true,
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

  // Status counts for filter chips — count each lane independently so a
  // property in two lanes (e.g. acq=NEW_LEAD + longterm=FOLLOW_UP) shows
  // up under BOTH chips. Earlier version only counted acq + dispo and
  // ignored longterm entirely, which meant FOLLOW_UP / DEAD chips read
  // zero even after the Phase 2 backfill loaded ~7,700 longterm rows.
  const statusCounts = properties.reduce<Record<string, number>>((acc, p) => {
    if (p.acqStatus) acc[p.acqStatus] = (acc[p.acqStatus] ?? 0) + 1
    if (p.dispoStatus) acc[p.dispoStatus] = (acc[p.dispoStatus] ?? 0) + 1
    if (p.longtermStatus) acc[p.longtermStatus] = (acc[p.longtermStatus] ?? 0) + 1
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
        status: effectiveStatus(p),
        dispoStatus: p.dispoStatus,
        longtermStatus: p.longtermStatus,
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
        stageEnteredAt: effectiveStageEnteredAt(p)?.toISOString() ?? null,
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
        ghlStageName: effectiveStageName(p),
        market: p.market?.name ?? null,
        lastOfferDate: p.lastOfferDate?.toISOString() ?? null,
        lastContactedDate: p.lastContactedDate?.toISOString() ?? null,
        distressScore: p.distressScore,
        preForeclosure: p.preForeclosure,
        bankOwned: p.bankOwned,
        inBankruptcy: p.inBankruptcy,
        inProbate: p.inProbate,
        inDivorce: p.inDivorce,
        hasRecentEviction: p.hasRecentEviction,
        taxDelinquent: p.taxDelinquent,
        foreclosureStatus: p.foreclosureStatus,
      }))}
      statusCounts={statusCounts}
      tenantSlug={params.tenant}
      canManage={hasPermission(role, 'inventory.manage')}
      ghlLocationId={tenant?.ghlLocationId ?? undefined}
      showArchived={showArchived}
    />
    </Suspense>
  )
}
