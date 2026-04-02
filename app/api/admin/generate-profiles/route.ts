// POST /api/admin/generate-profiles
// Admin-only: regenerate user performance profiles from real call data
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { generateUserProfiles } from '@/lib/ai/generate-user-profiles'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const result = await generateUserProfiles(session.tenantId)

  return NextResponse.json({
    status: 'success',
    ...result,
  })
}
