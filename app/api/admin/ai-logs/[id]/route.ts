// GET /api/admin/ai-logs/[id] — fetch full AI log detail
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const GET = withTenant<{ id: string }>(async (_req, ctx, params) => {
  // ctx.userRole is set by withTenant — no need for a follow-up user lookup
  if (!['OWNER', 'ADMIN'].includes(ctx.userRole)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const log = await db.aiLog.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
  })

  if (!log) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ log })
})
