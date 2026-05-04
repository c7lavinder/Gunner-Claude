// app/api/partners/[partnerId]/route.ts
// PATCH /api/partners/[partnerId] — edit partner-level fields
// DELETE /api/partners/[partnerId] — delete the partner row (cascades
//   to PropertyPartner via Prisma onDelete: Cascade)
//
// Partner identity + GHL link via ghlContactId. Per-deal facts (role,
// commission, etc.) live on PropertyPartner — edit those via
// /api/properties/[propertyId]/partners (action='update').
//
// Mirrors /api/buyers/[buyerId] pattern (Session 67 Phase 5).

import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { z } from 'zod'
import { PARTNER_TYPES } from '@/lib/partners/sync'

const partnerTypeSchema = z.enum(PARTNER_TYPES)

const patchSchema = z.object({
  // Identity
  name: z.string().min(1).optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  website: z.string().nullable().optional(),

  // Types — full replace (UI sends the new full list)
  types: z.array(partnerTypeSchema).optional(),

  // Agent-flavored
  brokerageName: z.string().nullable().optional(),
  brokerageAddress: z.string().nullable().optional(),
  licenseNumber: z.string().nullable().optional(),
  licenseState: z.string().nullable().optional(),

  // Wholesaler-flavored
  buyerListSize: z.number().int().nullable().optional(),
  dealsPerMonthEstimate: z.number().int().nullable().optional(),
  prefersAssignment: z.boolean().nullable().optional(),
  typicalAssignmentFee: z.number().nullable().optional(),

  // Market focus
  primaryMarkets: z.array(z.string()).optional(),
  propertyTypeFocus: z.string().nullable().optional(),
  yearsExperience: z.number().int().nullable().optional(),
  specialties: z.array(z.string()).optional(),

  // Reputation
  partnerGrade: z.string().nullable().optional(),
  tierClassification: z.string().nullable().optional(),
  badWithUsFlag: z.boolean().optional(),
  priorityFlag: z.boolean().optional(),
  reputationNotes: z.string().nullable().optional(),

  // Communication
  preferredContactMethod: z.string().nullable().optional(),
  bestTimeToContact: z.string().nullable().optional(),
  doNotContact: z.boolean().optional(),

  // Standard
  internalNotes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

export const PATCH = withTenant<{ partnerId: string }>(async (req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const partner = await db.partner.findFirst({
    where: { id: params.partnerId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const data = parsed.data
    const updated = await db.partner.update({
      where: { id: params.partnerId, tenantId: ctx.tenantId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.company !== undefined && { company: data.company }),
        ...(data.website !== undefined && { website: data.website }),
        ...(data.types !== undefined && { types: data.types }),
        ...(data.brokerageName !== undefined && { brokerageName: data.brokerageName }),
        ...(data.brokerageAddress !== undefined && { brokerageAddress: data.brokerageAddress }),
        ...(data.licenseNumber !== undefined && { licenseNumber: data.licenseNumber }),
        ...(data.licenseState !== undefined && { licenseState: data.licenseState }),
        ...(data.buyerListSize !== undefined && { buyerListSize: data.buyerListSize }),
        ...(data.dealsPerMonthEstimate !== undefined && { dealsPerMonthEstimate: data.dealsPerMonthEstimate }),
        ...(data.prefersAssignment !== undefined && { prefersAssignment: data.prefersAssignment }),
        ...(data.typicalAssignmentFee !== undefined && { typicalAssignmentFee: data.typicalAssignmentFee }),
        ...(data.primaryMarkets !== undefined && { primaryMarkets: data.primaryMarkets }),
        ...(data.propertyTypeFocus !== undefined && { propertyTypeFocus: data.propertyTypeFocus }),
        ...(data.yearsExperience !== undefined && { yearsExperience: data.yearsExperience }),
        ...(data.specialties !== undefined && { specialties: data.specialties }),
        ...(data.partnerGrade !== undefined && { partnerGrade: data.partnerGrade }),
        ...(data.tierClassification !== undefined && { tierClassification: data.tierClassification }),
        ...(data.badWithUsFlag !== undefined && { badWithUsFlag: data.badWithUsFlag }),
        ...(data.priorityFlag !== undefined && { priorityFlag: data.priorityFlag }),
        ...(data.reputationNotes !== undefined && { reputationNotes: data.reputationNotes }),
        ...(data.preferredContactMethod !== undefined && { preferredContactMethod: data.preferredContactMethod }),
        ...(data.bestTimeToContact !== undefined && { bestTimeToContact: data.bestTimeToContact }),
        ...(data.doNotContact !== undefined && { doNotContact: data.doNotContact }),
        ...(data.internalNotes !== undefined && { internalNotes: data.internalNotes }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    })

    return NextResponse.json({ status: 'success', partner: updated })
  } catch (err) {
    console.error('[Partner PATCH]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
})

export const DELETE = withTenant<{ partnerId: string }>(async (_req, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const partner = await db.partner.findFirst({
    where: { id: params.partnerId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!partner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await db.partner.delete({
      where: { id: params.partnerId, tenantId: ctx.tenantId },
    })
    return NextResponse.json({ status: 'success' })
  } catch (err) {
    console.error('[Partner DELETE]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
})
