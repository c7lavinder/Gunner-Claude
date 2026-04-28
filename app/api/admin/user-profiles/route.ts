// GET + PATCH /api/admin/user-profiles
// Admin-only: view and edit user performance profiles
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant(async (_req, ctx) => {
  // SIMPLIFY: removed redundant db.user.findUnique role lookup — ctx.userRole is canonical
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const profiles = await db.userProfile.findMany({
    where: { tenantId: ctx.tenantId },
    include: { user: { select: { name: true, role: true, email: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    profiles: profiles.map(p => ({
      id: p.id,
      userId: p.userId,
      userName: p.user.name,
      userRole: p.user.role,
      userEmail: p.user.email,
      strengths: p.strengths,
      weaknesses: p.weaknesses,
      commonMistakes: p.commonMistakes,
      communicationStyle: p.communicationStyle,
      coachingPriorities: p.coachingPriorities,
      totalCallsGraded: p.totalCallsGraded,
      profileSource: p.profileSource,
      updatedAt: p.updatedAt.toISOString(),
    })),
  })
})

export const PATCH = withTenant(async (request, ctx) => {
  // SIMPLIFY: removed redundant db.user.findUnique role lookup — ctx.userRole is canonical
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { profileId, strengths, weaknesses, commonMistakes, communicationStyle, coachingPriorities } = await request.json()
  if (!profileId) return NextResponse.json({ error: 'profileId required' }, { status: 400 })

  // Verify profile belongs to this tenant
  const profile = await db.userProfile.findFirst({
    where: { id: profileId, tenantId: ctx.tenantId },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // FIX: was leaking — prior code used `update({ where: { id: profileId } })`
  // without tenant scope. The findFirst above was the only guard; if a future
  // refactor dropped that check, the update would silently cross tenants.
  // Defense-in-depth: scope on the update too.
  await db.userProfile.update({
    where: { id: profileId, tenantId: ctx.tenantId },
    data: {
      ...(strengths !== undefined ? { strengths } : {}),
      ...(weaknesses !== undefined ? { weaknesses } : {}),
      ...(commonMistakes !== undefined ? { commonMistakes } : {}),
      ...(communicationStyle !== undefined ? { communicationStyle } : {}),
      ...(coachingPriorities !== undefined ? { coachingPriorities } : {}),
      profileSource: 'manual', // Mark as manually edited
    },
  })

  return NextResponse.json({ status: 'success' })
})
