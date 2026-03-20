// app/api/blasts/route.ts
// Deal blast — create + approve + send
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { requireApproval, approveAction } from '@/lib/gates/requireApproval'
import { z } from 'zod'

const createBlastSchema = z.object({
  propertyId: z.string(),
  buyerIds: z.array(z.string()).min(1),
  channel: z.enum(['sms', 'email']),
  message: z.string().min(1),
})

const approveSchema = z.object({
  blastId: z.string(),
})

// POST — create a new blast (may require approval)
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const body = await request.json()

  // Handle approval action
  if (body.action === 'approve') {
    const parsed = approveSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const blast = await db.dealBlast.findFirst({
      where: { id: parsed.data.blastId, tenantId: session.tenantId },
    })
    if (!blast) return NextResponse.json({ error: 'Blast not found' }, { status: 404 })

    await approveAction(blast.id, session.userId, session.tenantId)

    await db.dealBlast.update({
      where: { id: blast.id },
      data: { status: 'approved', approvedAt: new Date() },
    })

    return NextResponse.json({ status: 'approved', blastId: blast.id })
  }

  // Create new blast
  const parsed = createBlastSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Verify property belongs to tenant
  const property = await db.property.findFirst({
    where: { id: parsed.data.propertyId, tenantId: session.tenantId },
    select: { id: true, address: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  // Check approval gate
  const gate = await requireApproval({
    action: `${parsed.data.channel}_blast`,
    description: `Send ${parsed.data.channel.toUpperCase()} to ${parsed.data.buyerIds.length} buyers for ${property.address}`,
    data: { count: parsed.data.buyerIds.length, recipientCount: parsed.data.buyerIds.length, propertyId: property.id },
    userId: session.userId,
    tenantId: session.tenantId,
  })

  // Create the blast record
  const blast = await db.dealBlast.create({
    data: {
      tenantId: session.tenantId,
      propertyId: parsed.data.propertyId,
      createdById: session.userId,
      channel: parsed.data.channel,
      message: parsed.data.message,
      status: gate.approved ? 'approved' : 'pending',
      approvedAt: gate.approved ? new Date() : null,
      recipients: {
        create: parsed.data.buyerIds.map(buyerId => ({ buyerId })),
      },
    },
    include: {
      recipients: { include: { buyer: { select: { name: true } } } },
    },
  })

  return NextResponse.json({
    blast: {
      id: blast.id,
      status: blast.status,
      recipientCount: blast.recipients.length,
      requiresApproval: !gate.approved,
      gateReason: gate.reason,
    },
  }, { status: 201 })
}
