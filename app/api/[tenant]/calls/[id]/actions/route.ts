// app/api/[tenant]/calls/[id]/actions/route.ts
// Push AI-generated next steps to GHL: notes, tasks, SMS, appointments, stage changes
// PATCH: persist aiNextSteps status changes (push/skip)
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { z } from 'zod'
import { addDays, format } from 'date-fns'

const schema = z.object({
  type: z.enum(['add_note', 'create_task', 'send_sms', 'create_appointment', 'change_stage', 'check_off_task']),
  label: z.string().optional(),
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
          id: true, address: true, ghlContactId: true, ghlPipelineId: true, ghlPipelineStage: true,
          sellers: { include: { seller: { select: { id: true, name: true, phone: true, ghlContactId: true } } }, take: 1 },
        },
      },
    },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const contactId = call.ghlContactId ?? call.property?.ghlContactId
  if (!contactId) {
    return NextResponse.json({ success: false, message: 'No GHL contact linked to this call' }, { status: 400 })
  }

  const label = parsed.data.label ?? ''

  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const callDate = call.calledAt ? format(new Date(call.calledAt), 'MMM d') : 'recent'

    switch (parsed.data.type) {
      // ── Add Note to GHL Contact ─────────────────────────────────────────
      case 'add_note': {
        const noteBody = label || `Call on ${callDate}: ${call.aiSummary ?? 'Call graded — see Gunner AI for details.'}`
        await ghl.addNote(contactId, noteBody)
        break
      }

      // ── Create Task in GHL ──────────────────────────────────────────────
      case 'create_task': {
        const title = label || `Follow up: ${call.property?.address ?? 'Contact'}`
        const dueDate = format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm:ss'Z'")
        await ghl.createTask(contactId, { title, dueDate })
        break
      }

      // ── Send SMS via GHL ────────────────────────────────────────────────
      case 'send_sms': {
        if (!label) {
          return NextResponse.json({ success: false, message: 'SMS message text is required' }, { status: 400 })
        }
        await ghl.sendSMS(contactId, label)
        break
      }

      // ── Create Appointment (as a scheduled task in GHL) ─────────────────
      case 'create_appointment': {
        const title = label || `Appointment: ${call.property?.address ?? 'Contact'}`
        const dueDate = format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm:ss'Z'")
        await ghl.createTask(contactId, { title: `📅 ${title}`, dueDate })
        break
      }

      // ── Change Pipeline Stage ───────────────────────────────────────────
      case 'change_stage': {
        // Find the opportunity for this contact to move its stage
        const pipelines = await ghl.getPipelines()
        let opportunityId: string | null = null

        for (const pipeline of pipelines.pipelines ?? []) {
          try {
            const opps = await ghl.searchOpportunities(pipeline.id)
            const match = opps.opportunities?.find((o: { contactId: string }) => o.contactId === contactId)
            if (match) {
              opportunityId = match.id
              // Find the target stage by matching the label text
              const targetStage = pipeline.stages?.find((s: { name: string }) =>
                label.toLowerCase().includes(s.name.toLowerCase())
              )
              if (targetStage) {
                await ghl.updateOpportunityStage(opportunityId, targetStage.id)
                break
              }
            }
          } catch {
            continue // try next pipeline
          }
        }

        if (!opportunityId) {
          // Fallback: add as a note so the action isn't lost
          await ghl.addNote(contactId, `Stage change requested: ${label}`)
        }
        break
      }

      // ── Check Off / Complete a Task ─────────────────────────────────────
      case 'check_off_task': {
        // Find the most recent open task for this contact and complete it
        const tasks = await db.task.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            property: { ghlContactId: contactId },
          },
          select: { id: true, ghlTaskId: true },
          orderBy: { dueAt: 'asc' },
          take: 1,
        })

        if (tasks.length > 0 && tasks[0].ghlTaskId) {
          await ghl.completeTask(contactId, tasks[0].ghlTaskId)
          await db.task.update({
            where: { id: tasks[0].id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
        } else {
          // No matching task — add note so action isn't lost
          await ghl.addNote(contactId, `Task completed: ${label}`)
        }
        break
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
        payload: { contactId, type: parsed.data.type, label },
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[Call Action] ${parsed.data.type} failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'GHL action failed' }, { status: 500 })
  }
})

// PATCH — persist aiNextSteps status changes (push/skip)
export const PATCH = withTenant<{ id: string }>(async (req, ctx, params) => {
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  try {
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
