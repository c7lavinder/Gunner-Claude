// app/api/[tenant]/calls/[id]/skip/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const POST = withTenant<{ id: string }>(async (req, ctx, params) => {
  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  await db.call.update({
    where: { id: params.id },
    data: { gradingStatus: 'SKIPPED', aiSummary: 'Manually skipped.' },
  })

  return NextResponse.json({ success: true })
})
