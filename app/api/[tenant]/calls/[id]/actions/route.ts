// app/api/[tenant]/calls/[id]/actions/route.ts
// Quick actions: add note, create task, send SMS from call detail page
// PATCH: persist aiNextSteps status changes (push/skip)
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { z } from 'zod'
import { addDays, format } from 'date-fns'

const schema = z.object({
  type: z.enum(['add_note', 'create_task', 'send_sms']),
})

const patchSchema = z.object({
  aiNextSteps: z.array(z.object({
    type: z.string(),
    label: z.string(),
    reasoning: z.string(),
    status: z.enum(['pending', 'pushed', 'skipped']),
    pushedAt: z.string().nullable().optional(),
  })),
})

export const POST = withTenant<{ id: string }>(async (req, ctx, params) => {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: {
      id: true, aiSummary: true, calledAt: true, ghlCallId: true, ghlContactId: true,
      property: {
        select: {
          id: true, address: true, ghlContactId: true,
          sellers: { include: { seller: true }, take: 1 },
        },
      },
    },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Resolve contact ID: call's ghlContactId first, then property's
  const contactId = call.ghlContactId ?? call.property?.ghlContactId
  if (!contactId) {
    return NextResponse.json({ success: false, message: 'No GHL contact linked to this call' }, { status: 400 })
  }

  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const callDate = call.calledAt ? format(new Date(call.calledAt), 'MMM d') : 'recent'

    switch (parsed.data.type) {
      case 'add_note': {
        const noteBody = `Call on ${callDate}: ${call.aiSummary ?? 'Call graded — see Gunner AI for details.'}`
        await ghl.addNote(contactId, noteBody)
        break
      }
      case 'create_task': {
        const title = `Follow up: ${call.property?.address ?? 'Contact'}`
        const dueDate = format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm:ss'Z'")
        await ghl.createTask(contactId, { title, dueDate })
        break
      }
      case 'send_sms': {
        // SMS available via Role Assistant or property detail SMS modal
        return NextResponse.json({ success: true, message: 'Use the assistant or property page to send SMS with message editing' }, { status: 200 })
      }
    }

    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: `call.action.${parsed.data.type}`,
        resource: 'call',
        resourceId: params.id,
        source: 'USER',
        severity: 'INFO',
        payload: { contactId, type: parsed.data.type },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[Call Action] ${parsed.data.type} failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, message: 'GHL action failed' }, { status: 500 })
  }
})

// PATCH — persist aiNextSteps status changes (push/skip)
export const PATCH = withTenant<{ id: string }>(async (req, ctx, params) => {
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  try {
    // Verify call belongs to tenant before updating
    const call = await db.call.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
      select: { id: true },
    })
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    await db.call.update({
      where: { id: params.id },
      data: { aiNextSteps: parsed.data.aiNextSteps },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Call Actions PATCH] Failed to persist next steps:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to update next steps' }, { status: 500 })
  }
})
