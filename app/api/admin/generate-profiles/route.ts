// POST /api/admin/generate-profiles
// Admin-only: regenerate user performance profiles from real call data
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { generateUserProfiles } from '@/lib/ai/generate-user-profiles'

export const POST = withTenant(async (_req, ctx) => {
  // ctx.userRole is set by withTenant — no need for a follow-up user lookup
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const result = await generateUserProfiles(ctx.tenantId)

  return NextResponse.json({
    status: 'success',
    ...result,
  })
})
