// app/api/properties/[propertyId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { Prisma, PropertyStatus } from '@prisma/client'
import { z } from 'zod'
import { awardPropertyXP } from '@/lib/gamification/xp'

const updateSchema = z.object({
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  status: z.string().optional(),
  arv: z.string().nullable().optional(),
  askingPrice: z.string().nullable().optional(),
  mao: z.string().nullable().optional(),
  contractPrice: z.string().nullable().optional(),
  assignmentFee: z.string().nullable().optional(),
  offerPrice: z.string().nullable().optional(),
  repairCost: z.string().nullable().optional(),
  wholesalePrice: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  sellerPhone: z.string().nullable().optional(),
  sellerEmail: z.string().nullable().optional(),
  // Property details
  beds: z.number().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().nullable().optional(),
  yearBuilt: z.number().nullable().optional(),
  lotSize: z.string().nullable().optional(),
  propertyType: z.string().nullable().optional(),
  occupancy: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  // Tracking dates
  lastOfferDate: z.string().nullable().optional(),
  lastContactedDate: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const {
    address, city, state, zip, status,
    arv, askingPrice, mao, contractPrice, assignmentFee,
    offerPrice, repairCost, wholesalePrice,
    assignedToId, sellerName, sellerPhone, sellerEmail,
    beds, baths, sqft, yearBuilt, lotSize, propertyType, occupancy,
    description, internalNotes, lastOfferDate, lastContactedDate,
  } = parsed.data

  try {
    await db.$transaction(async (tx) => {
      // Update property
      await tx.property.update({
        where: { id: params.propertyId, tenantId: session.tenantId },
        data: {
          ...(address && { address }),
          ...(city && { city }),
          ...(state && { state }),
          ...(zip !== undefined && { zip }),
          ...(status && { status: status as PropertyStatus }),
          ...(arv !== undefined && { arv: arv ? parseFloat(arv) : null }),
          ...(askingPrice !== undefined && { askingPrice: askingPrice ? parseFloat(askingPrice) : null }),
          ...(mao !== undefined && { mao: mao ? parseFloat(mao) : null }),
          ...(contractPrice !== undefined && { contractPrice: contractPrice ? parseFloat(contractPrice) : null }),
          ...(assignmentFee !== undefined && { assignmentFee: assignmentFee ? parseFloat(assignmentFee) : null }),
          ...(offerPrice !== undefined && { offerPrice: offerPrice ? parseFloat(offerPrice) : null }),
          ...(repairCost !== undefined && { repairCost: repairCost ? parseFloat(repairCost) : null }),
          ...(wholesalePrice !== undefined && { wholesalePrice: wholesalePrice ? parseFloat(wholesalePrice) : null }),
          ...(assignedToId !== undefined && { assignedToId: assignedToId ?? undefined }),
          ...(beds !== undefined && { beds }),
          ...(baths !== undefined && { baths }),
          ...(sqft !== undefined && { sqft }),
          ...(yearBuilt !== undefined && { yearBuilt }),
          ...(lotSize !== undefined && { lotSize }),
          ...(propertyType !== undefined && { propertyType }),
          ...(occupancy !== undefined && { occupancy }),
          ...(description !== undefined && { description }),
          ...(internalNotes !== undefined && { internalNotes }),
          ...(lastOfferDate !== undefined && { lastOfferDate: lastOfferDate ? new Date(lastOfferDate) : null }),
          ...(lastContactedDate !== undefined && { lastContactedDate: lastContactedDate ? new Date(lastContactedDate) : null }),
        },
      })

      // Update primary seller if name provided
      if (sellerName !== undefined) {
        const existingSeller = await tx.propertySeller.findFirst({
          where: { propertyId: params.propertyId, isPrimary: true },
          include: { seller: true },
        })

        if (existingSeller) {
          await tx.seller.update({
            where: { id: existingSeller.sellerId },
            data: {
              name: sellerName || existingSeller.seller.name,
              phone: sellerPhone ?? existingSeller.seller.phone,
              email: sellerEmail ?? existingSeller.seller.email,
            },
          })
        } else if (sellerName) {
          const seller = await tx.seller.create({
            data: {
              tenantId: session.tenantId,
              name: sellerName,
              phone: sellerPhone ?? null,
              email: sellerEmail ?? null,
            },
          })
          await tx.propertySeller.create({
            data: { propertyId: params.propertyId, sellerId: seller.id, isPrimary: true },
          })
        }
      }
    })

    await db.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'property.updated',
        resource: 'property',
        resourceId: params.propertyId,
        source: 'USER',
        severity: 'INFO',
        payload: JSON.parse(JSON.stringify(parsed.data)) as Prisma.InputJsonValue,
      },
    })

    // Award XP for status milestones (Under Contract, Sold)
    if (status && (status === 'UNDER_CONTRACT' || status === 'SOLD')) {
      const assignee = property.assignedToId ?? session.userId
      awardPropertyXP(session.tenantId, assignee, params.propertyId, status).catch((err) => {
        console.warn(`[Properties] XP award failed:`, err)
      })
    }

    // Auto-log CLOSED milestone when property status → SOLD
    if (status === 'SOLD') {
      const existingClose = await db.propertyMilestone.findFirst({
        where: { propertyId: params.propertyId, type: 'CLOSED' },
      })
      if (!existingClose) {
        await db.propertyMilestone.create({
          data: {
            tenantId: session.tenantId,
            propertyId: params.propertyId,
            type: 'CLOSED',
            loggedById: session.userId,
            source: 'AUTO_WEBHOOK',
          },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Properties] Update error:', err)
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
  }
}
