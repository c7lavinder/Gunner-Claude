// app/api/[tenant]/calls/[id]/reprocess/route.ts
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { gradeCall } from '@/lib/ai/grading'

export const POST = withTenant<{ tenant: string; id: string }>(async (_req, ctx, params) => {
  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // FIX (cross-tenant defense): prior code did `where: { id: params.id }` on
  // the update — unscoped. Same id-collision risk as deal-intel + generate-next-steps.
  await db.call.update({
    where: { id: params.id, tenantId: ctx.tenantId },
    data: { gradingStatus: 'PENDING' },
  })

  gradeCall(params.id).catch(err => {
    console.error(`[Reprocess] Failed for call ${params.id}:`, err)
  })

  return NextResponse.json({ success: true })
})
