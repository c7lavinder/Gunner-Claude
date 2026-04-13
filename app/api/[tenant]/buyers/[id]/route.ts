// app/api/[tenant]/buyers/[id]/route.ts
// GET — fetch buyer with linked property stages
// PATCH — update any buyer field(s)

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { withTenant } from '@/lib/api/withTenant'

type Params = { tenant: string; id: string }

export const GET = withTenant<Params>(async (_req, ctx, params) => {
  const buyer = await db.buyer.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      propertyStages: {
        include: {
          property: {
            select: {
              id: true,
              address: true,
              city: true,
              state: true,
              status: true,
              arv: true,
              askingPrice: true,
            },
          },
        },
      },
    },
  })

  if (!buyer) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  }

  return NextResponse.json({ buyer })
})

export const PATCH = withTenant<Params>(async (req, ctx, params) => {
  const body = await req.json()

  const existing = await db.buyer.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, fieldSources: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  }

  const currentSources = (existing.fieldSources ?? {}) as Record<string, string>
  const updatedSources = { ...currentSources }
  for (const key of Object.keys(body)) {
    if (key !== 'fieldSources') {
      updatedSources[key] = 'manual'
    }
  }

  const updated = await db.buyer.update({
    where: { id: params.id },
    data: {
      ...body,
      fieldSources: updatedSources,
    },
  })

  return NextResponse.json({ buyer: updated })
})
