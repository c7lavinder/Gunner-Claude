// app/(tenant)/[tenant]/disposition/page.tsx
// Disposition portfolio — admin-only manager view of where every property
// is in its journey. Strict dispo scope per plan: only properties with
// status IN_DISPOSITION or UNDER_CONTRACT appear here. Earlier-stage
// properties live on /inventory.

import { requireSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { isRoleAtLeast } from '@/types/roles'
import { computeJourneyStatus, type JourneyInputs } from '@/lib/disposition/journey-status'
import { DispositionClient, type DispositionRow } from './disposition-client'
import { effectiveStatus, PROPERTY_LANE_SELECT, WHERE_DISPO_NOT_LOST, WHERE_ACQ_NOT_LOST } from '@/lib/property-status'

export default async function DispositionPage({ params }: { params: { tenant: string } }) {
  const session = await requireSession()

  if (!isRoleAtLeast(session.role, 'ADMIN')) {
    redirect(`/${params.tenant}/day-hub`)
  }

  // Hide rows whose matching lane was marked Lost in GHL. The dispo
  // portfolio is "deals that are or were in disposition" — so an
  // UNDER_CONTRACT row that already entered dispo and got Lost there
  // must ALSO drop off this page, even though acq is technically still
  // under-contract. Both branches therefore require dispoLostAt to be
  // null: dispo work is dead = dispo portfolio is hidden.
  const properties = await db.property.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [
        { dispoStatus: 'IN_DISPOSITION', ...WHERE_DISPO_NOT_LOST },
        { acqStatus: 'UNDER_CONTRACT', ...WHERE_ACQ_NOT_LOST, ...WHERE_DISPO_NOT_LOST },
      ],
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      ...PROPERTY_LANE_SELECT,
      askingPrice: true,
      arv: true,
      description: true,
      assignmentFee: true,
      googlePhotoThumbnailUrl: true,
      _count: {
        select: {
          sellers: true,
          buyerStages: true,
          dealBlasts: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // Offers + acceptance counts come from a separate query because we need
  // to filter on type + offerStatus (not just count the relation).
  const propertyIds = properties.map(p => p.id)
  const offerLogs = propertyIds.length
    ? await db.outreachLog.findMany({
        where: { tenantId: session.tenantId, propertyId: { in: propertyIds }, type: 'offer' },
        select: { propertyId: true, offerStatus: true },
      })
    : []
  const offerCounts = new Map<string, { logged: number; accepted: number }>()
  for (const o of offerLogs) {
    const cur = offerCounts.get(o.propertyId) ?? { logged: 0, accepted: 0 }
    cur.logged += 1
    if (o.offerStatus === 'Accepted') cur.accepted += 1
    offerCounts.set(o.propertyId, cur)
  }

  const rows: DispositionRow[] = properties.map(p => {
    const offers = offerCounts.get(p.id) ?? { logged: 0, accepted: 0 }
    const status = effectiveStatus(p)
    // Portfolio page only consumes journey.stage (the aggregate bucket
    // for grouping rows) — it does NOT render the Section 1 readiness
    // checklist. The 3 Session 77 readiness gates (hasContract /
    // hasDispoManager / propertyDetailsAllFilled) only feed Section 1
    // status which we don't display here, so we pass `true` to keep
    // the portfolio query lean (no need to load 26 detail fields +
    // PropertyTeamMember rows per property). The detailed readiness
    // view lives on the per-property page.
    const inputs: JourneyInputs = {
      status,
      address: p.address,
      arv: p.arv ? p.arv.toString() : null,
      hasPhotos: !!p.googlePhotoThumbnailUrl,
      hasSellerLinked: p._count.sellers > 0,
      hasContract: true,
      hasDispoManager: true,
      propertyDetailsAllFilled: true,
      blastsSentCount: p._count.dealBlasts,
      buyersMatchedCount: p._count.buyerStages,
      responsesCount: 0,
      offersLoggedCount: offers.logged,
      offersAcceptedCount: offers.accepted,
    }
    const journey = computeJourneyStatus(inputs)
    return {
      id: p.id,
      address: p.address,
      city: p.city,
      state: p.state,
      status,
      askingPrice: p.askingPrice ? p.askingPrice.toString() : null,
      assignmentFee: p.assignmentFee ? p.assignmentFee.toString() : null,
      stage: journey.stage,
    }
  })

  return <DispositionClient tenantSlug={params.tenant} rows={rows} />
}
