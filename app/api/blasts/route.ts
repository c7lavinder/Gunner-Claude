// app/api/blasts/route.ts
// Deal blast — create + approve + send
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
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
export const POST = withTenant(async (request, ctx) => {
  const body = await request.json()

  // Handle approval action
  if (body.action === 'approve') {
    const parsed = approveSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const blast = await db.dealBlast.findFirst({
      where: { id: parsed.data.blastId, tenantId: ctx.tenantId },
    })
    if (!blast) return NextResponse.json({ error: 'Blast not found' }, { status: 404 })

    await approveAction(blast.id, ctx.userId, ctx.tenantId)

    // FIX: was leaking — prior code used `update({ where: { id: blast.id } })` without tenant scope
    await db.dealBlast.update({
      where: { id: blast.id, tenantId: ctx.tenantId },
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
    where: { id: parsed.data.propertyId, tenantId: ctx.tenantId },
    select: { id: true, address: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  // Check approval gate
  const gate = await requireApproval({
    action: `${parsed.data.channel}_blast`,
    description: `Send ${parsed.data.channel.toUpperCase()} to ${parsed.data.buyerIds.length} buyers for ${property.address}`,
    data: { count: parsed.data.buyerIds.length, recipientCount: parsed.data.buyerIds.length, propertyId: property.id },
    userId: ctx.userId,
    tenantId: ctx.tenantId,
  })

  // Create the blast record
  const blast = await db.dealBlast.create({
    data: {
      tenantId: ctx.tenantId,
      propertyId: parsed.data.propertyId,
      createdById: ctx.userId,
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
})
