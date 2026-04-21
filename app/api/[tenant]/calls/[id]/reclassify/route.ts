// app/api/[tenant]/calls/[id]/reclassify/route.ts
// Handles both call type reclassification and manual outcome setting.
// Every reclassification is captured in call_reclassifications for later LLM training.
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

  // Snapshot the call BEFORE mutating — feeds the training log
  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true, callType: true, callOutcome: true, aiSummary: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const typeChanged = !!parsed.data.callType && parsed.data.callType !== call.callType
  const outcomeChanged = !!parsed.data.callOutcome && parsed.data.callOutcome !== call.callOutcome
  if (!typeChanged && !outcomeChanged) {
    return NextResponse.json({ success: true, noop: true })
  }

  // Type changes trigger a full re-grade so the AI re-scores against the new rubric.
  // Outcome-only changes do not re-grade.
  // When the human sets an outcome, lock it against future AI overwrites.
  await db.call.update({
    where: { id: params.id },
    data: {
      ...(typeChanged ? { callType: parsed.data.callType, gradingStatus: 'PENDING' } : {}),
      ...(outcomeChanged ? { callOutcome: parsed.data.callOutcome, outcomeManualOverride: true } : {}),
    },
  })

  await db.callReclassification.create({
    data: {
      tenantId: ctx.tenantId,
      callId: params.id,
      userId: ctx.userId,
      previousCallType: call.callType,
      newCallType: typeChanged ? parsed.data.callType! : null,
      previousCallOutcome: call.callOutcome,
      newCallOutcome: outcomeChanged ? parsed.data.callOutcome! : null,
      previousAiSummary: call.aiSummary,
    },
  }).catch(err => {
    console.error(`[Reclassify] Failed to log reclassification for ${params.id}:`, err)
  })

  if (typeChanged) {
    gradeCall(params.id).catch(err => {
      console.error(`[Reclassify] Re-grade failed for call ${params.id}:`, err)
    })
  }

  return NextResponse.json({ success: true })
})
