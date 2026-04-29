// app/api/buyers/route.ts
// Buyer list CRUD — GET list, POST create
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  markets: z.array(z.string()).optional(),
  criteria: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

export const GET = withTenant(async (_req, ctx) => {
  const buyers = await db.buyer.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { blastRecipients: true } },
    },
  })

  return NextResponse.json({ buyers })
})

export const POST = withTenant(async (req, ctx) => {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const buyer = await db.buyer.create({
    data: {
      tenantId: ctx.tenantId,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      company: parsed.data.company ?? null,
      primaryMarkets: (parsed.data.markets ?? []) as Prisma.InputJsonValue,
      customFields: (parsed.data.criteria ?? {}) as Prisma.InputJsonValue,
      tags: (parsed.data.tags ?? []) as Prisma.InputJsonValue,
      internalNotes: parsed.data.notes ?? null,
    },
  })

  return NextResponse.json({ buyer }, { status: 201 })
})
