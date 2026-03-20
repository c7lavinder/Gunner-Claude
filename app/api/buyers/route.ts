// app/api/buyers/route.ts
// Buyer list CRUD — GET list, POST create
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
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

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const buyers = await db.buyer.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { blastRecipients: true } },
    },
  })

  return NextResponse.json({ buyers })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const buyer = await db.buyer.create({
    data: {
      tenantId: session.tenantId,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      company: parsed.data.company ?? null,
      markets: (parsed.data.markets ?? []) as Prisma.InputJsonValue,
      criteria: (parsed.data.criteria ?? {}) as Prisma.InputJsonValue,
      tags: (parsed.data.tags ?? []) as Prisma.InputJsonValue,
      notes: parsed.data.notes ?? null,
    },
  })

  return NextResponse.json({ buyer }, { status: 201 })
}
