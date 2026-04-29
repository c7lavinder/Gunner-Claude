// GET /api/properties/[propertyId]/metrics
// Returns computed metrics for a property (engagement, financials)
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { computePropertyMetrics } from '@/lib/computed-metrics'

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  // computePropertyMetrics now requires tenantId — leak vector closed at the
  // helper level (was Class 4 helper-delegate). Route-level findFirst gate is
  // no longer required for safety, but kept here for the 404 contract: returns
  // a clear "Not found" before delegating to a metrics function that throws.
  const property = await db.property.findFirst({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const metrics = await computePropertyMetrics(params.propertyId, ctx.tenantId)
    return NextResponse.json({ metrics })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
