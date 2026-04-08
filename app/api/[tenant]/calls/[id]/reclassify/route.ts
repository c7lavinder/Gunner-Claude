// app/api/[tenant]/calls/[id]/reclassify/route.ts
// Handles both call type reclassification and manual outcome setting
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { gradeCall } from '@/lib/ai/grading'
import { z } from 'zod'

const schema = z.object({
  callType: z.string().min(1).optional(),
  callOutcome: z.string().min(1).optional(),
})

export const POST = withTenant<{ id: string }>(async (req, ctx, params) => {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Setting outcome only — no re-grade needed
  if (parsed.data.callOutcome && !parsed.data.callType) {
    await db.call.update({
      where: { id: params.id },
      data: { callOutcome: parsed.data.callOutcome },
    })
    return NextResponse.json({ success: true })
  }

  // Reclassifying call type — triggers re-grade
  if (parsed.data.callType) {
    await db.call.update({
      where: { id: params.id },
      data: {
        callType: parsed.data.callType,
        ...(parsed.data.callOutcome ? { callOutcome: parsed.data.callOutcome } : {}),
        gradingStatus: 'PENDING',
      },
    })

    gradeCall(params.id).catch(err => {
      console.error(`[Reclassify] Failed for call ${params.id}:`, err)
    })
  }

  return NextResponse.json({ success: true })
})
