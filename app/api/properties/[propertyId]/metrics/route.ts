// GET /api/properties/[propertyId]/metrics
// Returns computed metrics for a property (engagement, financials)
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { computePropertyMetrics } from '@/lib/computed-metrics'

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  // FIX: was leaking — Class 1 (helper-delegate variant) — `computePropertyMetrics`
  // does an id-only `db.property.findUnique` and then trusts the row's tenantId
  // to scope downstream queries. Without route-level validation, any tenant
  // could read another tenant's metrics by passing the propertyId. Validate
  // the property belongs to ctx.tenantId before delegating.
  const property = await db.property.findFirst({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const metrics = await computePropertyMetrics(params.propertyId)
    return NextResponse.json({ metrics })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
