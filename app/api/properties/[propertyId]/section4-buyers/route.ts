// GET /api/properties/[propertyId]/section4-buyers
// Lightweight read for Section 4 of the Disposition Journey. Returns
// every buyer on this property whose PropertyBuyerStage.stage is one
// of: responded | interested | showing_scheduled.
//
// Skips the GHL match algorithm (which lives in /buyers GET) — Section
// 4 only cares about buyers already in the pipeline, not fresh matches.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'

const SECTION_4_STAGES = ['responded', 'interested', 'showing_scheduled']

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.view.assigned')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const stages = await db.propertyBuyerStage.findMany({
    where: {
      propertyId: params.propertyId,
      tenantId: ctx.tenantId,
      stage: { in: SECTION_4_STAGES },
    },
    include: {
      buyer: {
        select: {
          id: true, name: true, phone: true, email: true,
          ghlContactId: true, primaryMarkets: true,
          // Buyer.tier doesn't exist as a column — pull tags so the UI
          // can derive a tier badge from `tier:realtor` style entries.
          tags: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    rows: stages.map(s => {
      // Derive tier from tags (`tier:realtor` etc.) — fallback unqualified.
      const tags = (Array.isArray(s.buyer.tags) ? s.buyer.tags : []) as string[]
      const tierTag = tags.find(t => typeof t === 'string' && t.startsWith('tier:'))
      const tier = tierTag ? tierTag.replace('tier:', '') : 'unqualified'
      return {
        buyerId: s.buyer.id,
        name: s.buyer.name,
        phone: s.buyer.phone,
        email: s.buyer.email,
        ghlContactId: s.buyer.ghlContactId,
        markets: (s.buyer.primaryMarkets ?? []) as string[],
        tier,
        stage: s.stage,
        responseIntent: s.responseIntent,
        responseAt: s.responseAt?.toISOString() ?? null,
        movedToInterestedAt: s.movedToInterestedAt?.toISOString() ?? null,
        matchScore: s.matchScore,
      }
    }),
  })
})
