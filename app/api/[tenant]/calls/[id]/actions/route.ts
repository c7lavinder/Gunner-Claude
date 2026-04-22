// app/api/[tenant]/calls/[id]/actions/route.ts
// Push AI-generated next steps to GHL: notes, tasks, SMS, appointments, stage changes
// PATCH: persist aiNextSteps status changes (push/skip)
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { resolveAssignee } from '@/lib/ghl/resolveAssignee'
import { logFailure } from '@/lib/audit'
import { z } from 'zod'
import { addDays, format } from 'date-fns'

const schema = z.object({
  type: z.enum(['add_note', 'create_task', 'send_sms', 'create_appointment', 'change_stage', 'check_off_task']),
  label: z.string().optional(),
  // Edit-panel fields — widened per ACTION_EXECUTION_AUDIT.md defect #1.
  // Each is optional; handlers fall back to sensible defaults when absent.
  description: z.string().optional(),
  dueDate: z.string().optional(),      // ISO datetime or YYYY-MM-DD
  assignedTo: z.string().optional(),   // internal user id — resolved to ghlUserId and forwarded to GHL below
  stageId: z.string().optional(),      // required for change_stage (defect #4)
  pipelineId: z.string().optional(),   // optional hint for stageId lookup; otherwise scan all pipelines
  smsBody: z.string().optional(),      // lets SMS body diverge from display label
  noteBody: z.string().optional(),     // full CRM note text (label is just the card title)
  // SMS scheduling (merged schedule_sms into send_sms).
  sendAt: z.string().optional(),       // ISO datetime when the SMS should fire; empty/null = send immediately
  timezone: z.string().optional(),     // IANA zone, e.g. "America/Chicago"
  fromNumber: z.string().optional(),   // LC outbound number (overrides location default)
  // Appointment fields — create_appointment now calls the real GHL
  // /calendars/events/appointments endpoint instead of creating a task.
  calendarId: z.string().optional(),          // GHL calendar id
  appointmentTypeId: z.string().optional(),   // local tenant.config.appointmentTypes id (for auditing)
  appointmentTime: z.string().optional(),     // ISO datetime start (user may edit)
  durationMin: z.number().optional(),         // defaults to 30 or config default
})

const patchSchema = z.object({
  aiNextSteps: z.array(z.object({
    type: z.string(),
    label: z.string(),
    reasoning: z.string(),
    status: z.enum(['pending', 'pushed', 'skipped']),
    pushedAt: z.string().nullable().optional(),
    // Persist edit-panel fields so they survive reload and are available at push time
    description: z.string().optional(),
    dueDate: z.string().optional(),
    assignedTo: z.string().optional(),
    stageId: z.string().optional(),
    pipelineId: z.string().optional(),
    smsBody: z.string().optional(),
    noteBody: z.string().optional(),
    originalLabel: z.string().optional(),
    sendAt: z.string().optional(),
    timezone: z.string().optional(),
    fromNumber: z.string().optional(),
    calendarId: z.string().optional(),
    appointmentTypeId: z.string().optional(),
    appointmentTime: z.string().optional(),
    durationMin: z.number().optional(),
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

  // Normalize a user-supplied date/datetime to GHL's expected ISO format.
  // Accepts YYYY-MM-DD (from <input type="date">) or a full ISO string.
  // Falls back to the provided `fallback` Date if input is missing/invalid.
  function resolveDueDate(input: string | undefined, fallback: Date): string {
    if (input) {
      const d = new Date(input.length === 10 ? `${input}T00:00:00Z` : input)
      if (!Number.isNaN(d.getTime())) return format(d, "yyyy-MM-dd'T'HH:mm:ss'Z'")
    }
    return format(fallback, "yyyy-MM-dd'T'HH:mm:ss'Z'")
  }

  // Resolve internal user id -> GHL user id for task assignment.
  // Falls back to undefined if user has no ghlUserId mapping — task is still
  // created, just without an assignee. Skipped resolution is recorded in the
  // audit payload below. Shared helper also powers the AI Assistant's execute
  // route so the resolution/audit-tag logic is single-sourced.
  const { ghlUserId: resolvedAssignedTo, note: assignedToResolutionNote } =
    await resolveAssignee(parsed.data.assignedTo, ctx.tenantId)

  try {
    const ghl = await getGHLClient(ctx.tenantId)
    const callDate = call.calledAt ? format(new Date(call.calledAt), 'MMM d') : 'recent'

    switch (parsed.data.type) {
      // ── Add Note to GHL Contact ─────────────────────────────────────────
      //
      // Push priority: noteBody (full narrative paragraph) → description →
      // label (legacy fallback for old rows where label held the body) →
      // autosummary from aiSummary. The AI now emits noteBody separately
      // from label so the card can show a short title while the pushed CRM
      // note carries the full paragraph.
      case 'add_note': {
        const noteText = parsed.data.noteBody
          || parsed.data.description
          || label
          || `Call on ${callDate}: ${call.aiSummary ?? 'Call graded — see Gunner AI for details.'}`
        await ghl.addNote(contactId, noteText)
        break
      }

      // ── Create Task in GHL ──────────────────────────────────────────────
      case 'create_task': {
        const title = label || `Follow up: ${call.property?.address ?? 'Contact'}`
        const dueDate = resolveDueDate(parsed.data.dueDate, addDays(new Date(), 1))
        await ghl.createTask(contactId, {
          title,
          body: parsed.data.description || undefined,
          dueDate,
          assignedTo: resolvedAssignedTo,
        })
        break
      }

      // ── Send SMS via GHL (send now, or queue if sendAt is set) ──────────
      case 'send_sms': {
        const body = parsed.data.smsBody || label
        if (!body) {
          return NextResponse.json({ success: false, message: 'SMS message text is required' }, { status: 400 })
        }

        // Scheduled send is UI-wired but the queue/cron is a follow-up.
        // Reject loudly so users don't silently get immediate sends.
        if (parsed.data.sendAt) {
          const scheduledTime = new Date(parsed.data.sendAt)
          if (!Number.isNaN(scheduledTime.getTime()) && scheduledTime.getTime() > Date.now() + 60_000) {
            return NextResponse.json({
              success: false,
              message: 'Scheduled SMS not yet available — leave "Send At" empty to send immediately. Scheduling queue is a follow-up.',
            }, { status: 501 })
          }
          // past / near-now → treat as immediate
        }

        await ghl.sendSMS(contactId, body, parsed.data.fromNumber)
        break
      }

      // ── Create Appointment — real GHL /calendars/events/appointments ────
      case 'create_appointment': {
        if (!parsed.data.calendarId) {
          return NextResponse.json({
            success: false,
            message: 'calendarId is required. Configure Appointment Types in Settings → Call config so the AI can auto-select one.',
          }, { status: 400 })
        }
        if (!parsed.data.appointmentTime) {
          return NextResponse.json({
            success: false,
            message: 'appointmentTime (ISO datetime) is required.',
          }, { status: 400 })
        }

        const start = new Date(parsed.data.appointmentTime)
        if (Number.isNaN(start.getTime())) {
          return NextResponse.json({ success: false, message: 'Invalid appointmentTime format.' }, { status: 400 })
        }
        const durationMin = parsed.data.durationMin && parsed.data.durationMin > 0 ? parsed.data.durationMin : 30
        const end = new Date(start.getTime() + durationMin * 60_000)

        const title = label || `Appointment: ${call.property?.address ?? 'Contact'}`

        await ghl.createAppointment({
          calendarId: parsed.data.calendarId,
          contactId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          title,
          assignedUserId: resolvedAssignedTo,
          address: call.property?.address || undefined,
        })
        break
      }

      // ── Change Pipeline Stage (requires explicit stageId — defect #4) ───
      case 'change_stage': {
        if (!parsed.data.stageId) {
          return NextResponse.json(
            { success: false, message: 'stageId is required for change_stage (Rule 2: no fuzzy matching)' },
            { status: 400 },
          )
        }
        const targetStageId = parsed.data.stageId

        // Validate the stage exists in GHL. If pipelineId was provided, only check
        // that pipeline; otherwise scan all pipelines to find which one owns it.
        const pipelinesResp = await ghl.getPipelines()
        const candidatePipelines = parsed.data.pipelineId
          ? (pipelinesResp.pipelines ?? []).filter(p => p.id === parsed.data.pipelineId)
          : (pipelinesResp.pipelines ?? [])
        const stageValid = candidatePipelines.some(p =>
          p.stages?.some((s: { id: string }) => s.id === targetStageId)
        )
        if (!stageValid) {
          return NextResponse.json(
            { success: false, message: 'stageId not found in the specified pipeline(s)' },
            { status: 400 },
          )
        }

        // Find the opportunity on this contact, preferring the matching pipeline.
        let opportunityId: string | null = null
        for (const pipeline of candidatePipelines) {
          try {
            const opps = await ghl.searchOpportunities(pipeline.id)
            const match = opps.opportunities?.find((o: { contactId: string }) => o.contactId === contactId)
            if (match) { opportunityId = match.id; break }
          } catch { continue }
        }

        if (!opportunityId) {
          return NextResponse.json(
            { success: false, message: 'No opportunity found for this contact in the target pipeline' },
            { status: 404 },
          )
        }
        await ghl.updateOpportunityStage(opportunityId, targetStageId)
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
        payload: {
          contactId,
          type: parsed.data.type,
          label,
          description: parsed.data.description,
          dueDate: parsed.data.dueDate,
          assignedTo: parsed.data.assignedTo,           // internal user id as submitted
          ghlAssignedTo: resolvedAssignedTo,            // GHL user id actually sent (if resolved)
          assignedToResolution: assignedToResolutionNote, // undefined on success, error tag if skipped
          stageId: parsed.data.stageId,
          pipelineId: parsed.data.pipelineId,
          smsBody: parsed.data.smsBody,
          noteBody: parsed.data.noteBody,
          sendAt: parsed.data.sendAt,
          timezone: parsed.data.timezone,
          fromNumber: parsed.data.fromNumber,
          calendarId: parsed.data.calendarId,
          appointmentTypeId: parsed.data.appointmentTypeId,
          appointmentTime: parsed.data.appointmentTime,
          durationMin: parsed.data.durationMin,
        },
      },
    })

    return NextResponse.json({
      success: true,
      // Present only when the client-supplied assignedTo couldn't be forwarded
      // to GHL; the client uses this to show a warning toast explaining why.
      ...(assignedToResolutionNote ? { assignedToResolution: assignedToResolutionNote } : {}),
    })
  } catch (err) {
    console.error(`[Call Action] ${parsed.data.type} failed:`, err instanceof Error ? err.message : err)

    const errorMessage = err instanceof Error ? err.message : 'GHL action failed'
    const errorStack = err instanceof Error ? err.stack?.slice(0, 500) : undefined

    // Failure audit — two rows per failure by design:
    //   ERROR row  (action='call.action.failed')  — forensic, full fields
    //   SYSTEM row (resource='call:<id>')         — triage, fast grep
    // Health query:
    //   SELECT COUNT(*) FROM audit_logs
    //   WHERE action='call.action.failed'
    //     AND created_at > NOW() - INTERVAL '24 hours';
    //
    // Route its own ERROR audit_logs row that mirrors the success row's shape
    // so queries on action='call.action.failed' return a parallel trail.
    // Wrapped so audit write errors can't cascade into another 500.
    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'call.action.failed',
        resource: 'call',
        resourceId: params.id,
        source: 'USER',
        severity: 'ERROR',
        payload: {
          contactId,
          type: parsed.data.type,
          label,
          description: parsed.data.description,
          dueDate: parsed.data.dueDate,
          assignedTo: parsed.data.assignedTo,
          ghlAssignedTo: resolvedAssignedTo,
          assignedToResolution: assignedToResolutionNote,
          stageId: parsed.data.stageId,
          pipelineId: parsed.data.pipelineId,
          smsBody: parsed.data.smsBody,
          noteBody: parsed.data.noteBody,
          sendAt: parsed.data.sendAt,
          timezone: parsed.data.timezone,
          fromNumber: parsed.data.fromNumber,
          calendarId: parsed.data.calendarId,
          appointmentTypeId: parsed.data.appointmentTypeId,
          appointmentTime: parsed.data.appointmentTime,
          durationMin: parsed.data.durationMin,
          errorMessage,
          errorStack,
        },
      },
    }).catch(writeErr => {
      console.error('[Call Action] Failed to write ERROR audit row:', writeErr instanceof Error ? writeErr.message : writeErr)
    })

    // logFailure adds a second SYSTEM-severity row with the standard shape used
    // everywhere else (resource=`call:<id>`). Complementary to the ERROR row above;
    // both point back to the same callId so either query path finds them.
    await logFailure(ctx.tenantId, 'call.action.failed', `call:${params.id}`, err, {
      type: parsed.data.type,
      contactId,
      label,
      stageId: parsed.data.stageId,
      pipelineId: parsed.data.pipelineId,
      assignedTo: parsed.data.assignedTo,
      dueDate: parsed.data.dueDate,
    })

    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 })
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
