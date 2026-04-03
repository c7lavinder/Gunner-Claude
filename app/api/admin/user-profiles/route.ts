// GET + PATCH /api/admin/user-profiles
// Admin-only: view and edit user performance profiles
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const profiles = await db.userProfile.findMany({
    where: { tenantId: session.tenantId },
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
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { profileId, strengths, weaknesses, commonMistakes, communicationStyle, coachingPriorities } = await request.json()
  if (!profileId) return NextResponse.json({ error: 'profileId required' }, { status: 400 })

  // Verify profile belongs to this tenant
  const profile = await db.userProfile.findFirst({
    where: { id: profileId, tenantId: session.tenantId },
  })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  await db.userProfile.update({
    where: { id: profileId },
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
}
