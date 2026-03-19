// app/api/properties/[propertyId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { z } from 'zod'

const updateSchema = z.object({
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().length(2).optional(),
  zip: z.string().optional(),
  status: z.string().optional(),
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
    assignedToId, sellerName, sellerPhone, sellerEmail,
  } = parsed.data

  try {
    await db.$transaction(async (tx) => {
      // Update property
      await tx.property.update({
        where: { id: params.propertyId },
        data: {
          ...(address && { address }),
          ...(city && { city }),
          ...(state && { state }),
          ...(zip !== undefined && { zip }),
          ...(status && { status }),
          ...(arv !== undefined && { arv: arv ? parseFloat(arv) : null }),
          ...(askingPrice !== undefined && { askingPrice: askingPrice ? parseFloat(askingPrice) : null }),
          ...(mao !== undefined && { mao: mao ? parseFloat(mao) : null }),
          ...(contractPrice !== undefined && { contractPrice: contractPrice ? parseFloat(contractPrice) : null }),
          ...(assignmentFee !== undefined && { assignmentFee: assignmentFee ? parseFloat(assignmentFee) : null }),
          ...(assignedToId !== undefined && { assignedToId: assignedToId ?? null }),
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
        payload: parsed.data as Record<string, unknown>,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Properties] Update error:', err)
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
  }
}
