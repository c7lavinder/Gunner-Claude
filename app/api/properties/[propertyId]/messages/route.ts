// POST /api/properties/[propertyId]/messages — create an internal message with @mentions
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { text, mentions } = body as { text: string; mentions?: Array<{ id: string; name: string }> }

  if (!text?.trim()) return NextResponse.json({ error: 'Message text required' }, { status: 400 })

  // Verify property belongs to tenant
  const property = await db.property.findUnique({
    where: { id: params.propertyId, tenantId: session.tenantId },
    select: { id: true, address: true },
  })
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Store message as audit log
  const log = await db.auditLog.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'property.message',
      resource: 'property',
      resourceId: params.propertyId,
      source: 'USER',
      severity: 'INFO',
      payload: {
        text: text.trim(),
        mentions: mentions ?? [],
        propertyAddress: property.address,
      } as unknown as Prisma.InputJsonValue,
    },
    include: { user: { select: { name: true } } },
  })

  return NextResponse.json({
    message: {
      id: log.id,
      text: text.trim(),
      mentions: mentions ?? [],
      userId: session.userId,
      userName: log.user?.name ?? 'Unknown',
      createdAt: log.createdAt.toISOString(),
    },
  })
}
