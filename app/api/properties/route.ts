// app/api/properties/route.ts
import { NextResponse } from 'next/server'
import { forbiddenResponse } from '@/lib/auth/session'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { hasPermission, type UserRole } from '@/types/roles'
import { PropertyStatus } from '@prisma/client'
import { z } from 'zod'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'
import { splitCombinedAddressIfNeeded } from '@/lib/properties'
import { enrichProperty } from '@/lib/enrichment/enrich-property'

const propertySchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().optional(),
  status: z.string().default('NEW_LEAD'),
  arv: z.string().nullable().optional(),
  askingPrice: z.string().nullable().optional(),
  mao: z.string().nullable().optional(),
  contractPrice: z.string().nullable().optional(),
  assignmentFee: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  sellerPhone: z.string().nullable().optional(),
  sellerEmail: z.string().nullable().optional(),
})

export const POST = withTenant(async (request, ctx) => {
  if (!hasPermission(ctx.userRole as UserRole, 'properties.create')) return forbiddenResponse()

  const body = await request.json()
  const parsed = propertySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const {
    address: rawAddr, city: rawCity, state: rawState, zip: rawZip, status,
    arv, askingPrice, mao, contractPrice, assignmentFee,
    assignedToId, sellerName, sellerPhone, sellerEmail,
  } = parsed.data

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
          status: status as PropertyStatus,
          stageEnteredAt: new Date(),
          arv: arv ? parseFloat(arv) : null,
          askingPrice: askingPrice ? parseFloat(askingPrice) : null,
          mao: mao ? parseFloat(mao) : null,
          contractPrice: contractPrice ? parseFloat(contractPrice) : null,
          assignmentFee: assignmentFee ? parseFloat(assignmentFee) : null,
          assignedToId: assignedToId ?? null,
        },
      })

      // Create seller if name provided
      if (sellerName) {
        const seller = await tx.seller.create({
          data: {
            tenantId: ctx.tenantId,
            name: sellerName,
            phone: sellerPhone ?? null,
            email: sellerEmail ?? null,
          },
        })
        // NOTE: PropertySeller has no tenantId column — DiD-via-FK via
        // prop.id (just created in this tx with our tenantId).
        await tx.propertySeller.create({
          data: { propertyId: prop.id, sellerId: seller.id, isPrimary: true },
        })
      }

      return prop
    })

    // Auto-log LEAD milestone (dedup: skip if one already exists)
    const existingLead = await db.propertyMilestone.findFirst({
      where: { tenantId: ctx.tenantId, propertyId: property.id, type: 'LEAD' },
    }).catch(() => null)
    if (!existingLead) {
      await db.propertyMilestone.create({
        data: {
          tenantId: ctx.tenantId,
          propertyId: property.id,
          type: 'LEAD',
          loggedById: ctx.userId,
          source: 'MANUAL',
        },
      }).catch(() => {}) // non-fatal
    }

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'property.created',
        resource: 'property',
        resourceId: property.id,
        source: 'USER',
        severity: 'INFO',
        payload: { address: standardizeStreet(rawAddr), city: standardizeCity(rawCity), state: standardizeState(rawState) },
      },
    })

    // If the user entered a combined address (e.g., "2716 & 2720 Enterprise Ave")
    // split it into two properties now. Non-blocking decision: we created the
    // combined row in the transaction and let the splitter delete + replace it.
    // NOTE: splitCombinedAddressIfNeeded does an internal id-only findUnique
    // (Class 4 helper). Safe here because property.id was JUST created in this
    // transaction with our tenantId — collision would require CUID guessing.
    const splitResult = await splitCombinedAddressIfNeeded(property.id).catch(err => {
      console.error('[Properties POST] Split check failed:', err)
      return { splitInto: null as [string, string] | null }
    })
    const returnedId = splitResult.splitInto?.[0] ?? property.id

    // Auto-enrichment (fire-and-forget — non-blocking). If split, enrich both halves.
    // NOTE: enrichProperty + enrichPropertyWithAI are Class 4 helpers but
    // operate on just-created property ids, so safe in this caller.
    const enrichIds = splitResult.splitInto ?? [property.id]
    for (const id of enrichIds) {
      enrichProperty(id).catch(err =>
        console.error('[Vendor Enrich] Background error:', err instanceof Error ? err.message : err)
      )
      enrichPropertyWithAI(id).catch(err =>
        console.error('[AI Enrich] Background error:', err instanceof Error ? err.message : err)
      )
    }

    return NextResponse.json({ property: { id: returnedId }, split: splitResult.splitInto }, { status: 201 })
  } catch (err) {
    console.error('[Properties] Create error:', err)
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
})
