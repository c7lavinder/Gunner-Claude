// app/api/properties/jv-intake/route.ts
//
// Phase 5 of GHL multi-pipeline redesign — JV intake form.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §10.
//
// Creates a Property sourced from a JV partner. Different from the regular
// /api/properties POST in three ways:
//   1. Requires a partnerId — auto-creates the PropertyPartner join row
//      with role='sourced_to_us'.
//   2. leadSource='JV Partner' (vs the regular flow's null lead_source).
//   3. ghlAcqOppId stays null — these deals don't have GHL pipeline
//      tracking until the team chooses to add one.
// Otherwise mirrors the regular create flow: AI enrichment + multi-vendor
// enrichment fire fire-and-forget, milestone + audit log are non-fatal.

import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import type { AcqStatus } from '@prisma/client'
import { z } from 'zod'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'
import { splitCombinedAddressIfNeeded } from '@/lib/properties'
import { enrichProperty } from '@/lib/enrichment/enrich-property'

const jvIntakeSchema = z.object({
  partnerId: z.string().min(1, 'Partner is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'State must be 2 letters'),
  zip: z.string().optional(),
  arv: z.string().nullable().optional(),
  askingPrice: z.string().nullable().optional(),
  contractPrice: z.string().nullable().optional(),
  assignmentFee: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
})

export const POST = withTenant(async (request, ctx) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.create')) return forbiddenResponse()

  const body = await request.json()
  const parsed = jvIntakeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const {
    partnerId, address: rawAddr, city: rawCity, state: rawState, zip: rawZip,
    arv, askingPrice, contractPrice, assignmentFee, notes, assignedToId,
  } = parsed.data

  // Verify partner belongs to this tenant.
  const partner = await db.partner.findFirst({
    where: { id: partnerId, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  })
  if (!partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
  }

  const { standardizeStreet, standardizeCity, standardizeState, standardizeZip } = await import('@/lib/address')

  try {
    const property = await db.$transaction(async (tx) => {
      const prop = await tx.property.create({
        data: {
          tenantId: ctx.tenantId,
          address: standardizeStreet(rawAddr),
          city: standardizeCity(rawCity),
          state: standardizeState(rawState),
          zip: standardizeZip(rawZip ?? ''),
          acqStatus: 'NEW_LEAD' as AcqStatus,
          acqStageEnteredAt: new Date(),
          leadSource: 'JV Partner',
          internalNotes: notes ?? null,
          arv: arv ? parseFloat(arv) : null,
          askingPrice: askingPrice ? parseFloat(askingPrice) : null,
          contractPrice: contractPrice ? parseFloat(contractPrice) : null,
          assignmentFee: assignmentFee ? parseFloat(assignmentFee) : null,
          assignedToId: assignedToId ?? null,
        },
      })

      await tx.propertyPartner.create({
        data: {
          propertyId: prop.id,
          partnerId: partner.id,
          role: 'sourced_to_us',
        },
      })

      return prop
    })

    // Auto-log LEAD milestone — non-fatal.
    await db.propertyMilestone.create({
      data: {
        tenantId: ctx.tenantId,
        propertyId: property.id,
        type: 'LEAD',
        loggedById: ctx.userId,
        source: 'MANUAL',
      },
    }).catch(() => {})

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'property.created',
        resource: 'property',
        resourceId: property.id,
        source: 'USER',
        severity: 'INFO',
        payload: {
          mode: 'JV_INTAKE',
          partnerId: partner.id,
          partnerName: partner.name,
          address: standardizeStreet(rawAddr),
          city: standardizeCity(rawCity),
          state: standardizeState(rawState),
        },
      },
    })

    // Auto-split combined addresses (e.g. "508 & 512 Cassie Ln" → two rows).
    const splitResult = await splitCombinedAddressIfNeeded(property.id, ctx.tenantId).catch(err => {
      console.error('[JV Intake] Split check failed:', err)
      return { splitInto: null as [string, string] | null }
    })
    const returnedId = splitResult.splitInto?.[0] ?? property.id

    // Per plan §10: JV deals are partner-pre-qualified — fire enrichment
    // immediately rather than queuing them. Background tasks; user gets
    // their redirect right away.
    const enrichIds = splitResult.splitInto ?? [property.id]
    for (const id of enrichIds) {
      enrichProperty(id, ctx.tenantId).catch(err =>
        console.error('[JV Intake Enrich] Background error:', err instanceof Error ? err.message : err)
      )
      enrichPropertyWithAI(id, ctx.tenantId).catch(err =>
        console.error('[JV Intake AI Enrich] Background error:', err instanceof Error ? err.message : err)
      )
    }

    return NextResponse.json({ property: { id: returnedId }, split: splitResult.splitInto }, { status: 201 })
  } catch (err) {
    console.error('[JV Intake] Create error:', err)
    return NextResponse.json({ error: 'Failed to create JV deal' }, { status: 500 })
  }
})
