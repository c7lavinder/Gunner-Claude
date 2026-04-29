// app/api/properties/[propertyId]/re-enrich/route.ts
// POST — re-triggers AI enrichment for a property
import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'
import { enrichProperty } from '@/lib/enrichment/enrich-property'

export const POST = withTenant<{ propertyId: string }>(async (_request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true, aiEnrichmentStatus: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Don't re-enrich if already pending
  if (property.aiEnrichmentStatus === 'pending') {
    return NextResponse.json({ status: 'already_pending' })
  }

  // Fire both enrichment paths in parallel:
  //   1. Multi-vendor orchestrator — BatchData/PR/Google/CourtListener.
  //      User explicitly clicked "re-enrich" so force BD regardless of
  //      cache / PR-no-match skip — they want the full dataset.
  //   2. Claude AI estimates — ARV, repair, rental.
  enrichProperty(property.id, ctx.tenantId, { forceBatchData: true }).catch(err =>
    console.error('[Re-Enrich Vendor] Background error:', err instanceof Error ? err.message : err)
  )
  enrichPropertyWithAI(property.id, ctx.tenantId).catch(err =>
    console.error('[Re-Enrich AI] Background error:', err instanceof Error ? err.message : err)
  )

  return NextResponse.json({ status: 'started' })
})
