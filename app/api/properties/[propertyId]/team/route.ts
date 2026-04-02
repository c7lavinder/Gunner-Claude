// GET + POST + DELETE /api/properties/[propertyId]/team
// Manages team members assigned to a property
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET(
  _req: Request,
  { params }: { params: { propertyId: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await db.propertyTeamMember.findMany({
    where: { propertyId: params.propertyId, tenantId: session.tenantId },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    members: members.map(m => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      userRole: m.user.role,
      source: m.source,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, role } = await request.json()
  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
  }

  // Verify user belongs to same tenant
  const user = await db.user.findFirst({
    where: { id: userId, tenantId: session.tenantId },
    select: { id: true, name: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const member = await db.propertyTeamMember.upsert({
    where: { propertyId_userId: { propertyId: params.propertyId, userId } },
    create: {
      propertyId: params.propertyId,
      userId,
      tenantId: session.tenantId,
      role,
      source: 'manual',
    },
    update: { role },
  })

  return NextResponse.json({
    member: {
      id: member.id,
      userId: member.userId,
      name: user.name,
      role: member.role,
      userRole: user.role,
      source: member.source,
      createdAt: member.createdAt.toISOString(),
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  await db.propertyTeamMember.deleteMany({
    where: { propertyId: params.propertyId, userId, tenantId: session.tenantId },
  })

  return NextResponse.json({ status: 'success' })
}
