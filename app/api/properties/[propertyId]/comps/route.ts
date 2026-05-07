// GET  /api/properties/[propertyId]/comps    — list comps for a property
// POST /api/properties/[propertyId]/comps    — create one comp
//
// Comps are manually-entered buyer comps shown in the Data tab Property
// Assessment area + fed into the Section 2 listing-site generator. No
// vendor / MLS auto-pull.
//
// condition: remodeled | updated | functional | as_is
// status:    sold | active | pending

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import type { UserRole } from '@/types/roles'

const CONDITIONS = ['remodeled', 'updated', 'functional', 'as_is'] as const
const STATUSES = ['sold', 'active', 'pending'] as const

const createSchema = z.object({
  address: z.string().min(1),
  zillowUrl: z.string().url().nullable().optional().or(z.literal('')),
  beds: z.number().int().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  condition: z.enum(CONDITIONS).nullable().optional(),
  price: z.string().nullable().optional(),  // accepted as string, parsed to Decimal
  status: z.enum(STATUSES).nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.view.assigned')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Class-4 gate: confirm property belongs to tenant
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const comps = await db.propertyComp.findMany({
    where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({
    comps: comps.map(c => ({
      id: c.id,
      address: c.address,
      zillowUrl: c.zillowUrl,
      beds: c.beds,
      baths: c.baths,
      sqft: c.sqft,
      condition: c.condition,
      price: c.price?.toString() ?? null,
      status: c.status,
      notes: c.notes,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
    })),
  })
})

export const POST = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  }

  // Class-4 gate
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const data = parsed.data
  const priceNum = data.price ? parseFloat(data.price.replace(/[^0-9.]/g, '')) : null

  // Place new comp at the end of the sort order.
  const last = await db.propertyComp.findFirst({
    where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  const sortOrder = (last?.sortOrder ?? -1) + 1

  const comp = await db.propertyComp.create({
    data: {
      tenantId: ctx.tenantId,
      propertyId: params.propertyId,
      address: data.address,
      zillowUrl: data.zillowUrl || null,
      beds: data.beds ?? null,
      baths: data.baths ?? null,
      sqft: data.sqft ?? null,
      condition: data.condition ?? null,
      price: priceNum != null && !isNaN(priceNum) ? priceNum : null,
      status: data.status ?? null,
      notes: data.notes ?? null,
      sortOrder,
    },
  })

  return NextResponse.json({
    comp: {
      id: comp.id,
      address: comp.address,
      zillowUrl: comp.zillowUrl,
      beds: comp.beds,
      baths: comp.baths,
      sqft: comp.sqft,
      condition: comp.condition,
      price: comp.price?.toString() ?? null,
      status: comp.status,
      notes: comp.notes,
      sortOrder: comp.sortOrder,
      createdAt: comp.createdAt.toISOString(),
    },
  })
})
