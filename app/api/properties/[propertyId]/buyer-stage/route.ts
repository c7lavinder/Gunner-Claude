// PATCH /api/properties/[propertyId]/buyer-stage — update buyer pipeline stage
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  buyerId: z.string().min(1),
  stage: z.enum(['matched', 'responded', 'interested']),
})

export const PATCH = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const { buyerId, stage } = parsed.data

    // FIX: was leaking — upsert on compound unique `propertyId_buyerId` without
    // tenant validation. If propertyId in URL belonged to another tenant, the
    // upsert would find an existing row in that tenant (compound match) and
    // mutate it — cross-tenant write. Defense-in-depth: validate propertyId
    // belongs to this tenant first.
    const property = await db.property.findFirst({
      where: { id: params.propertyId, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    const record = await db.propertyBuyerStage.upsert({
      where: { propertyId_buyerId: { propertyId: params.propertyId, buyerId } },
      create: {
        tenantId: ctx.tenantId,
        propertyId: params.propertyId,
        buyerId,
        stage,
      },
      update: { stage },
    })

    return NextResponse.json({ status: 'success', stage: record.stage })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
