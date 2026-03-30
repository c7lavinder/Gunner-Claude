// app/api/properties/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { PropertyStatus } from '@prisma/client'
import { z } from 'zod'
import { enrichPropertyWithAI } from '@/lib/ai/enrich-property'

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

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.create')) return forbiddenResponse()

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
          tenantId: session.tenantId,
          address: standardizeStreet(rawAddr),
          city: standardizeCity(rawCity),
          state: standardizeState(rawState),
          zip: standardizeZip(rawZip ?? ''),
          status: status as PropertyStatus,
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
            tenantId: session.tenantId,
            name: sellerName,
            phone: sellerPhone ?? null,
            email: sellerEmail ?? null,
          },
        })
        await tx.propertySeller.create({
          data: { propertyId: prop.id, sellerId: seller.id, isPrimary: true },
        })
      }

      return prop
    })

    // Auto-log LEAD milestone (dedup: skip if one already exists)
    const existingLead = await db.propertyMilestone.findFirst({
      where: { tenantId: session.tenantId, propertyId: property.id, type: 'LEAD' },
    }).catch(() => null)
    if (!existingLead) {
      await db.propertyMilestone.create({
        data: {
          tenantId: session.tenantId,
          propertyId: property.id,
          type: 'LEAD',
          loggedById: session.userId,
          source: 'MANUAL',
        },
      }).catch(() => {}) // non-fatal
    }

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'property.created',
        resource: 'property',
        resourceId: property.id,
        source: 'USER',
        severity: 'INFO',
        payload: { address: standardizeStreet(rawAddr), city: standardizeCity(rawCity), state: standardizeState(rawState) },
      },
    })

    // AI auto-enrichment (fire-and-forget — non-blocking)
    enrichPropertyWithAI(property.id).catch(err =>
      console.error('[AI Enrich] Background error:', err)
    )

    return NextResponse.json({ property: { id: property.id } }, { status: 201 })
  } catch (err) {
    console.error('[Properties] Create error:', err)
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
}
