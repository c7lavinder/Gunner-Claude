// app/api/milestones/route.ts
// Manual milestone logging: APPOINTMENT_SET, OFFER_MADE, UNDER_CONTRACT
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { z } from 'zod'
import { MilestoneType } from '@prisma/client'

const schema = z.object({
  propertyId: z.string().min(1),
  type: z.enum(['APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT']),
  notes: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { propertyId, type, notes } = parsed.data
  const tenantId = session.tenantId

  const property = await db.property.findUnique({
    where: { id: propertyId, tenantId },
    select: { id: true, address: true },
  })
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  try {
    const milestone = await db.propertyMilestone.create({
      data: {
        tenantId,
        propertyId,
        type: type as MilestoneType,
        loggedById: session.userId,
        source: 'MANUAL',
        notes: notes ?? null,
      },
      include: {
        property: { select: { address: true, city: true, state: true } },
        loggedBy: { select: { name: true } },
      },
    })

    await db.auditLog.create({
      data: {
        tenantId,
        action: `milestone.${type.toLowerCase()}`,
        resource: 'property',
        resourceId: propertyId,
        userId: session.userId,
        source: 'USER',
        severity: 'INFO',
        payload: { type, propertyId },
      },
    }).catch(() => {})

    return NextResponse.json({ milestone })
  } catch (err) {
    console.error('[Milestones] Create failed:', err)
    return NextResponse.json({ error: 'Failed to log milestone' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('propertyId')
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  }

  try {
    const milestones = await db.propertyMilestone.findMany({
      where: { tenantId: session.tenantId, propertyId },
      orderBy: { createdAt: 'asc' },
      include: { loggedBy: { select: { name: true } } },
    })

    return NextResponse.json({ milestones })
  } catch (err) {
    console.error('[Milestones] Fetch failed:', err)
    return NextResponse.json({ milestones: [] })
  }
}
