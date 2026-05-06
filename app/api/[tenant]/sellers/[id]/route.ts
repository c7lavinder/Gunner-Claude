// app/api/[tenant]/sellers/[id]/route.ts
// GET — fetch seller with linked properties
// PATCH — update any seller field(s)

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { withTenant } from '@/lib/api/withTenant'
import { PROPERTY_LANE_SELECT } from '@/lib/property-status'

type Params = { tenant: string; id: string }

export const GET = withTenant<Params>(async (_req, ctx, params) => {
  const seller = await db.seller.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      properties: {
        include: {
          property: {
            select: {
              id: true,
              address: true,
              city: true,
              state: true,
              ...PROPERTY_LANE_SELECT,
              arv: true,
              assignedTo: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
  }

  return NextResponse.json({ seller })
})

export const PATCH = withTenant<Params>(async (req, ctx, params) => {
  const body = await req.json()

  // Verify seller exists and belongs to tenant
  const existing = await db.seller.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, fieldSources: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
  }

  // Build fieldSources update — mark every changed field as "manual"
  const currentSources = (existing.fieldSources ?? {}) as Record<string, string>
  const updatedSources = { ...currentSources }
  for (const key of Object.keys(body)) {
    if (key !== 'fieldSources') {
      updatedSources[key] = 'manual'
    }
  }

  const updated = await db.seller.update({
    where: { id: params.id },
    data: {
      ...body,
      fieldSources: updatedSources,
    },
  })

  return NextResponse.json({ seller: updated })
})
