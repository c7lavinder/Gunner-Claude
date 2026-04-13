// app/api/properties/[propertyId]/sellers/route.ts
// WRITES TO: sellers + property_sellers tables
// API ENDPOINT: GET/POST/DELETE /api/properties/[propertyId]/sellers
// READ BY: property detail page → Contacts section
// READ QUERY: db.propertySeller.findMany({ where: { propertyId }, include: { seller: true } })

import { NextRequest, NextResponse } from 'next/server'
import { getSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hasPermission } from '@/types/roles'
import { z } from 'zod'
import { titleCase } from '@/lib/format'

const addSchema = z.object({
  ghlContactId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  role: z.string().default('Seller'),
  isPrimary: z.boolean().default(false),
})

const removeSchema = z.object({
  sellerId: z.string().min(1),
})

const updateRoleSchema = z.object({
  sellerId: z.string().min(1),
  role: z.string().min(1),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sellers = await db.propertySeller.findMany({
    where: { propertyId: params.propertyId },
    include: { seller: { select: { id: true, name: true, phone: true, email: true, ghlContactId: true } } },
    orderBy: { isPrimary: 'desc' },
  })

  return NextResponse.json({
    sellers: sellers.map((ps) => ({
      id: ps.seller.id,
      name: ps.seller.name,
      phone: ps.seller.phone,
      email: ps.seller.email,
      ghlContactId: ps.seller.ghlContactId,
      isPrimary: ps.isPrimary,
      role: ps.role,
    })),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  // Handle role update
  if (body.action === 'updateRole') {
    const parsed = updateRoleSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    try {
      await db.propertySeller.update({
        where: {
          propertyId_sellerId: {
            propertyId: params.propertyId,
            sellerId: parsed.data.sellerId,
          },
        },
        data: { role: parsed.data.role },
      })
      return NextResponse.json({ success: true })
    } catch {
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }
  }

  // Handle add contact
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  try {
    // Find or create seller by ghlContactId
    let seller = await db.seller.findFirst({
      where: {
        tenantId: session.tenantId,
        ghlContactId: parsed.data.ghlContactId,
      },
    })

    if (!seller) {
      seller = await db.seller.create({
        data: {
          tenantId: session.tenantId,
          name: titleCase(parsed.data.name),
          phone: parsed.data.phone ?? null,
          email: parsed.data.email ?? null,
          ghlContactId: parsed.data.ghlContactId,
        },
      })
    }

    // Check if already linked
    const existing = await db.propertySeller.findUnique({
      where: {
        propertyId_sellerId: {
          propertyId: params.propertyId,
          sellerId: seller.id,
        },
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'Contact already linked' }, { status: 409 })
    }

    // If marking as primary, unset other primaries first
    if (parsed.data.isPrimary) {
      await db.propertySeller.updateMany({
        where: { propertyId: params.propertyId, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    await db.propertySeller.create({
      data: {
        propertyId: params.propertyId,
        sellerId: seller.id,
        isPrimary: parsed.data.isPrimary,
        role: parsed.data.role,
      },
    })

    return NextResponse.json({
      seller: {
        id: seller.id,
        name: seller.name,
        phone: seller.phone,
        email: seller.email,
        ghlContactId: seller.ghlContactId,
        isPrimary: parsed.data.isPrimary,
        role: parsed.data.role,
      },
    })
  } catch (err) {
    console.error('[Sellers] Add error:', err)
    return NextResponse.json({ error: 'Failed to add contact' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return unauthorizedResponse()
  if (!hasPermission(session.role, 'properties.edit')) return forbiddenResponse()

  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  try {
    await db.propertySeller.delete({
      where: {
        propertyId_sellerId: {
          propertyId: params.propertyId,
          sellerId: parsed.data.sellerId,
        },
      },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to remove contact' }, { status: 500 })
  }
}
