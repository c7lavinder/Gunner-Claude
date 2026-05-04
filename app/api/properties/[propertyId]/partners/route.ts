// app/api/properties/[propertyId]/partners/route.ts
// WRITES TO: partners + property_partners tables
// API ENDPOINT: GET/POST/PATCH/DELETE /api/properties/[propertyId]/partners
// READ BY: property detail page → Partners tab
// READ QUERY: db.propertyPartner.findMany({ where: { propertyId }, include: { partner: true } })
//
// Mirrors the sibling /api/properties/[propertyId]/sellers/route.ts pattern
// (Session 67 Phase 2). Partners are a unified deal-team contact table —
// see lib/partners/sync.ts + prisma/schema.prisma model Partner.

import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { z } from 'zod'
import { titleCase } from '@/lib/format'
import { upsertPartnerFromGHL, PARTNER_TYPES } from '@/lib/partners/sync'

const partnerTypeSchema = z.enum(PARTNER_TYPES)

const linkSchema = z.object({
  ghlContactId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  types: z.array(partnerTypeSchema).default([]),
  role: z.string().min(1).default('sourced_to_us'),
  commissionPercent: z.number().nullable().optional(),
  commissionAmount: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  assignmentFeePaid: z.number().nullable().optional(),
  notesOnThisDeal: z.string().nullable().optional(),
})

const unlinkSchema = z.object({
  partnerId: z.string().min(1),
})

const updateSchema = z.object({
  partnerId: z.string().min(1),
  role: z.string().min(1).optional(),
  commissionPercent: z.number().nullable().optional(),
  commissionAmount: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  assignmentFeePaid: z.number().nullable().optional(),
  notesOnThisDeal: z.string().nullable().optional(),
})

export const GET = withTenant<{ propertyId: string }>(async (_request, ctx, params) => {
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // DiD-via-FK: propertyId is tenant-validated above; PropertyPartner rows
  // for this propertyId can only belong to this tenant.
  const rows = await db.propertyPartner.findMany({
    where: { propertyId: params.propertyId },
    include: {
      partner: {
        select: {
          id: true, name: true, phone: true, email: true, company: true,
          ghlContactId: true, types: true, partnerGrade: true, tierClassification: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    partners: rows.map((pp) => ({
      id: pp.partner.id,
      name: pp.partner.name,
      phone: pp.partner.phone,
      email: pp.partner.email,
      company: pp.partner.company,
      ghlContactId: pp.partner.ghlContactId,
      types: pp.partner.types as string[],
      partnerGrade: pp.partner.partnerGrade,
      tierClassification: pp.partner.tierClassification,
      role: pp.role,
      commissionPercent: pp.commissionPercent,
      commissionAmount: pp.commissionAmount?.toString() ?? null,
      purchasePrice: pp.purchasePrice?.toString() ?? null,
      assignmentFeePaid: pp.assignmentFeePaid?.toString() ?? null,
      notesOnThisDeal: pp.notesOnThisDeal,
    })),
  })
})

export const POST = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  // Handle update of an existing PropertyPartner row
  if (body.action === 'update') {
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    try {
      await db.propertyPartner.update({
        where: {
          propertyId_partnerId: {
            propertyId: params.propertyId,
            partnerId: parsed.data.partnerId,
          },
        },
        data: {
          ...(parsed.data.role !== undefined && { role: parsed.data.role }),
          ...(parsed.data.commissionPercent !== undefined && { commissionPercent: parsed.data.commissionPercent }),
          ...(parsed.data.commissionAmount !== undefined && { commissionAmount: parsed.data.commissionAmount }),
          ...(parsed.data.purchasePrice !== undefined && { purchasePrice: parsed.data.purchasePrice }),
          ...(parsed.data.assignmentFeePaid !== undefined && { assignmentFeePaid: parsed.data.assignmentFeePaid }),
          ...(parsed.data.notesOnThisDeal !== undefined && { notesOnThisDeal: parsed.data.notesOnThisDeal }),
        },
      })
      return NextResponse.json({ success: true })
    } catch (err) {
      console.error('[Partners] Update error:', err)
      return NextResponse.json({ error: 'Failed to update partner on deal' }, { status: 500 })
    }
  }

  // Handle link (create-or-reuse Partner + create PropertyPartner)
  const parsed = linkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })

  try {
    const partnerId = await upsertPartnerFromGHL({
      tenantId: ctx.tenantId,
      ghlContactId: parsed.data.ghlContactId,
      name: titleCase(parsed.data.name),
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      company: parsed.data.company ?? null,
      types: parsed.data.types,
    })

    const existing = await db.propertyPartner.findUnique({
      where: {
        propertyId_partnerId: {
          propertyId: params.propertyId,
          partnerId,
        },
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'Partner already linked' }, { status: 409 })
    }

    await db.propertyPartner.create({
      data: {
        propertyId: params.propertyId,
        partnerId,
        role: parsed.data.role,
        commissionPercent: parsed.data.commissionPercent ?? null,
        commissionAmount: parsed.data.commissionAmount ?? null,
        purchasePrice: parsed.data.purchasePrice ?? null,
        assignmentFeePaid: parsed.data.assignmentFeePaid ?? null,
        notesOnThisDeal: parsed.data.notesOnThisDeal ?? null,
      },
    })

    const partner = await db.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true, name: true, phone: true, email: true, company: true,
        ghlContactId: true, types: true, partnerGrade: true, tierClassification: true,
      },
    })

    return NextResponse.json({
      partner: {
        ...partner,
        types: (partner?.types ?? []) as string[],
        role: parsed.data.role,
        commissionPercent: parsed.data.commissionPercent ?? null,
        commissionAmount: parsed.data.commissionAmount?.toString() ?? null,
        purchasePrice: parsed.data.purchasePrice?.toString() ?? null,
        assignmentFeePaid: parsed.data.assignmentFeePaid?.toString() ?? null,
        notesOnThisDeal: parsed.data.notesOnThisDeal ?? null,
      },
    })
  } catch (err) {
    console.error('[Partners] Link error:', err)
    return NextResponse.json({ error: 'Failed to link partner' }, { status: 500 })
  }
})

export const DELETE = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = unlinkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  try {
    await db.propertyPartner.delete({
      where: {
        propertyId_partnerId: {
          propertyId: params.propertyId,
          partnerId: parsed.data.partnerId,
        },
      },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to unlink partner' }, { status: 500 })
  }
})
