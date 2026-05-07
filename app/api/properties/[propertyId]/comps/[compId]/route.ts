// PATCH  /api/properties/[propertyId]/comps/[compId]  — edit one comp
// DELETE /api/properties/[propertyId]/comps/[compId]  — remove one comp

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'

const CONDITIONS = ['remodeled', 'updated', 'functional', 'as_is'] as const
const STATUSES = ['sold', 'active', 'pending'] as const

const patchSchema = z.object({
  address: z.string().min(1).optional(),
  zillowUrl: z.string().url().nullable().optional().or(z.literal('')),
  beds: z.number().int().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  condition: z.enum(CONDITIONS).nullable().optional(),
  price: z.string().nullable().optional(),
  status: z.enum(STATUSES).nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const PATCH = withTenant<{ propertyId: string; compId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  // Class-4 gate: confirm comp belongs to property AND tenant
  const comp = await db.propertyComp.findUnique({
    where: { id: params.compId },
    select: { id: true, tenantId: true, propertyId: true },
  })
  if (!comp || comp.tenantId !== ctx.tenantId || comp.propertyId !== params.propertyId) {
    return NextResponse.json({ error: 'Comp not found' }, { status: 404 })
  }

  const d = parsed.data
  const priceNum = d.price !== undefined
    ? (d.price ? parseFloat(d.price.replace(/[^0-9.]/g, '')) : null)
    : undefined

  const updated = await db.propertyComp.update({
    where: { id: params.compId },
    data: {
      ...(d.address !== undefined && { address: d.address }),
      ...(d.zillowUrl !== undefined && { zillowUrl: d.zillowUrl || null }),
      ...(d.beds !== undefined && { beds: d.beds }),
      ...(d.baths !== undefined && { baths: d.baths }),
      ...(d.sqft !== undefined && { sqft: d.sqft }),
      ...(d.condition !== undefined && { condition: d.condition }),
      ...(priceNum !== undefined && { price: priceNum != null && !isNaN(priceNum) ? priceNum : null }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.notes !== undefined && { notes: d.notes }),
    },
  })

  return NextResponse.json({
    comp: {
      id: updated.id,
      address: updated.address,
      zillowUrl: updated.zillowUrl,
      beds: updated.beds,
      baths: updated.baths,
      sqft: updated.sqft,
      condition: updated.condition,
      price: updated.price?.toString() ?? null,
      status: updated.status,
      notes: updated.notes,
      sortOrder: updated.sortOrder,
      createdAt: updated.createdAt.toISOString(),
    },
  })
})

export const DELETE = withTenant<{ propertyId: string; compId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const comp = await db.propertyComp.findUnique({
    where: { id: params.compId },
    select: { id: true, tenantId: true, propertyId: true },
  })
  if (!comp || comp.tenantId !== ctx.tenantId || comp.propertyId !== params.propertyId) {
    return NextResponse.json({ error: 'Comp not found' }, { status: 404 })
  }

  await db.propertyComp.delete({ where: { id: params.compId } })

  return NextResponse.json({ status: 'deleted' })
})
