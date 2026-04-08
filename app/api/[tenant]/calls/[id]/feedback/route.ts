// app/api/[tenant]/calls/[id]/feedback/route.ts
// Stores call feedback in audit_logs (type: call.feedback) for AI learning loop
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { z } from 'zod'

const schema = z.object({
  type: z.string().min(1),
  details: z.string().min(10),
})

export const POST = withTenant<{ id: string }>(async (request: NextRequest, ctx, params) => {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'call.feedback',
      resource: 'call',
      resourceId: params.id,
      source: 'USER',
      severity: 'INFO',
      payload: {
        type: parsed.data.type,
        details: parsed.data.details,
        submittedBy: ctx.userId,
      },
    },
  })

  return NextResponse.json({ success: true })
})
