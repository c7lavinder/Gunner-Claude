// GET + POST + DELETE /api/properties/[propertyId]/team
// Manages team members assigned to a property
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant<{ propertyId: string }>(async (_req, ctx, params) => {
  const members = await db.propertyTeamMember.findMany({
    where: { propertyId: params.propertyId, tenantId: ctx.tenantId },
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
})

export const POST = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  const { userId, role } = await request.json()
  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
  }

  // FIX: was leaking — Class 3 (compound-unique upsert without parent
  // validation). Prior code did `propertyTeamMember.upsert({ where: {
  // propertyId_userId } })` without first verifying propertyId belongs to
  // this tenant. An attacker passing another tenant's propertyId could
  // mutate that tenant's PropertyTeamMember row via the compound match.
  // Fix: validate property belongs to ctx.tenantId first.
  const property = await db.property.findFirst({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  // Verify user belongs to same tenant
  const user = await db.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId },
    select: { id: true, name: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // NOTE: upsert remains on compound `propertyId_userId` — DiD-via-FK now
  // that property is validated above.
  const member = await db.propertyTeamMember.upsert({
    where: { propertyId_userId: { propertyId: params.propertyId, userId } },
    create: {
      propertyId: params.propertyId,
      userId,
      tenantId: ctx.tenantId,
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
})

export const DELETE = withTenant<{ propertyId: string }>(async (request, ctx, params) => {
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  await db.propertyTeamMember.deleteMany({
    where: { propertyId: params.propertyId, userId, tenantId: ctx.tenantId },
  })

  return NextResponse.json({ status: 'success' })
})
