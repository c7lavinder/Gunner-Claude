// lib/ghl/webhooks.ts
// Processes all incoming GHL webhook events
// Called by: app/api/webhooks/ghl/route.ts

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { gradeCall } from '@/lib/ai/grading'
import { createPropertyFromContact } from '@/lib/properties'
import { awardTaskXP } from '@/lib/gamification/xp'
import { triggerWorkflows } from '@/lib/workflows/engine'

export type GHLWebhookEvent = {
  type: string
  locationId: string
  [key: string]: unknown
}

// Route incoming webhook events to the right handler
export async function handleGHLWebhook(event: GHLWebhookEvent): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { ghlLocationId: event.locationId },
  })

  if (!tenant) {
    console.warn(`[GHL Webhook] No tenant found for locationId: ${event.locationId}`)
    return
  }

  console.log(`[GHL Webhook] ${event.type} for tenant ${tenant.slug}`)

  switch (event.type) {
    case 'CallCompleted':
    case 'call.completed':
      await handleCallCompleted(tenant.id, event)
      break

    case 'InboundMessage':
    case 'OutboundMessage':
      await handleMessage(tenant.id, event)
      break

    case 'OpportunityStageChanged':
    case 'opportunity.stageChanged':
    case 'OpportunityCreate':
    case 'OpportunityUpdate':
      await handleOpportunityStageChanged(tenant.id, event)
      break

    case 'ContactCreated':
    case 'contact.created':
      // No auto-property on contact create — only on pipeline stage
      break

    case 'TaskCompleted':
    case 'task.completed':
      await handleTaskCompleted(tenant.id, event)
      break

    case 'AppointmentCreated':
    case 'appointment.created':
      await handleAppointmentCreated(tenant.id, event)
      break

    default:
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'ghl.webhook.unhandled',
          resource: 'webhook',
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
          source: 'GHL_WEBHOOK',
          severity: 'INFO',
        },
      })
  }
}

// ─── InboundMessage / OutboundMessage — recording URL lives here ────────────

async function handleMessage(tenantId: string, event: GHLWebhookEvent) {
  const msgData = event as {
    type: string
    messageType?: string
    locationId: string
    contactId?: string
    conversationId?: string
    userId?: string
    direction?: string
    attachments?: Array<string | { url: string }>
    recordingUrl?: string
    recording_url?: string
    recordingURL?: string
    meta?: { call?: { duration?: number; status?: string; recordingUrl?: string } }
    body?: string
    dateAdded?: string
    altId?: string
  }

  // Only process call messages — skip SMS, email, etc.
  if (msgData.messageType !== 'TYPE_CALL') return

  // Extract recording URL from all possible locations
  const recordingUrl = extractRecordingUrl(msgData)
  const duration = msgData.meta?.call?.duration ?? 0
  const callStatus = msgData.meta?.call?.status ?? ''
  const direction = msgData.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'

  console.log(`[GHL Webhook] Call message: duration=${duration}s, status=${callStatus}, recording=${recordingUrl ? 'YES' : 'NO'}, contact=${msgData.contactId}`)

  // Duration-based routing:
  // 0s or under 45s → dial attempt / no answer, skip entirely
  // 45-90s → create call, summary only (no rubric score)
  // Over 90s → full transcription + grading

  // Zero duration also caught here (0 < 45 is true) — no answer calls
  if (duration < 45) {
    await db.auditLog.create({
      data: {
        tenantId,
        action: 'call.dial_attempt',
        resource: 'call',
        source: 'GHL_WEBHOOK',
        severity: 'INFO',
        payload: {
          contactId: msgData.contactId,
          duration,
          status: callStatus,
          direction: msgData.direction,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return
  }

  // Deduplicate — check by conversationId or altId
  const dedupeId = msgData.conversationId || msgData.altId
  if (dedupeId) {
    const existing = await db.call.findFirst({
      where: { tenantId, ghlCallId: dedupeId },
      select: { id: true, recordingUrl: true },
    })

    if (existing) {
      // If we already have this call but now have a recording URL, update it
      if (recordingUrl && !existing.recordingUrl) {
        await db.call.update({
          where: { id: existing.id },
          data: { recordingUrl },
        })
        console.log(`[GHL Webhook] Updated recording URL for existing call ${existing.id}`)
      }
      return
    }
  }

  // Find user in our system
  const user = msgData.userId
    ? await db.user.findFirst({ where: { tenantId } })
    : null

  // Find linked property
  const property = msgData.contactId
    ? await db.property.findFirst({ where: { tenantId, ghlContactId: msgData.contactId } })
    : null

  // Create call record
  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId: dedupeId ?? undefined,
      assignedToId: user?.id,
      propertyId: property?.id,
      recordingUrl: recordingUrl ?? undefined,
      direction: direction as 'INBOUND' | 'OUTBOUND',
      durationSeconds: duration,
      calledAt: msgData.dateAdded ? new Date(msgData.dateAdded) : new Date(),
      // 30-60s → SUMMARY_ONLY, 60s+ → PENDING for full grading
      gradingStatus: 'PENDING',
    },
  })

  console.log(`[GHL Webhook] Created call ${call.id}: duration=${duration}s, recording=${!!recordingUrl}, grading=${duration >= 90 ? 'FULL' : 'SUMMARY_ONLY'}`)

  // Trigger grading — fire and forget
  // gradeCall handles the duration-based routing internally
  gradeCall(call.id).catch((err) => {
    console.error(`[Call Grading] Failed for call ${call.id}:`, err instanceof Error ? err.message : err)
  })

  await db.auditLog.create({
    data: {
      tenantId,
      action: 'call.received',
      resource: 'call',
      resourceId: call.id,
      source: 'GHL_WEBHOOK',
      severity: 'INFO',
      payload: {
        ghlCallId: dedupeId,
        duration,
        hasRecording: !!recordingUrl,
        contactId: msgData.contactId,
      } as unknown as Prisma.InputJsonValue,
    },
  })
}

// Extract recording URL from all possible locations in the webhook payload
function extractRecordingUrl(data: {
  attachments?: Array<string | { url: string }>
  recordingUrl?: string
  recording_url?: string
  recordingURL?: string
  meta?: { call?: { recordingUrl?: string } }
}): string | null {
  // Primary: attachments array
  if (data.attachments && data.attachments.length > 0) {
    const first = data.attachments[0]
    const url = typeof first === 'string' ? first : first?.url
    if (url) return url
  }

  // Fallbacks: various field name conventions
  if (data.recordingUrl) return data.recordingUrl
  if (data.recording_url) return data.recording_url
  if (data.recordingURL) return data.recordingURL
  if (data.meta?.call?.recordingUrl) return data.meta.call.recordingUrl

  return null
}

// ─── Call Completed (legacy — some GHL setups send this) ────────────────────

async function handleCallCompleted(tenantId: string, event: GHLWebhookEvent) {
  const callData = event as {
    id?: string
    callId?: string
    recordingUrl?: string
    recording_url?: string
    attachments?: Array<string | { url: string }>
    duration?: number
    direction?: string
    contactId?: string
    userId?: string
    locationId: string
  }

  const ghlCallId = callData.id ?? callData.callId
  if (!ghlCallId) return

  const recordingUrl = extractRecordingUrl(callData)
  const duration = callData.duration ?? 0

  // Skip dial attempts / no answer (0s or under 45s)
  if (duration < 45) return

  // Deduplicate
  const existing = await db.call.findFirst({
    where: { tenantId, ghlCallId },
    select: { id: true },
  })
  if (existing) return

  const user = callData.userId
    ? await db.user.findFirst({ where: { tenantId } })
    : null

  const property = callData.contactId
    ? await db.property.findFirst({ where: { tenantId, ghlContactId: callData.contactId } })
    : null

  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId,
      assignedToId: user?.id,
      propertyId: property?.id,
      recordingUrl: recordingUrl ?? undefined,
      direction: callData.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
      durationSeconds: duration,
      calledAt: new Date(),
      gradingStatus: 'PENDING',
    },
  })

  gradeCall(call.id).catch((err) => {
    console.error(`[Call Grading] Failed for call ${call.id}:`, err instanceof Error ? err.message : err)
  })
}

// ─── Opportunity Stage Changed → Maybe create property ─────────────────────

async function handleOpportunityStageChanged(tenantId: string, event: GHLWebhookEvent) {
  const oppData = event as {
    id?: string
    stageId?: string
    pipelineStageId?: string
    contactId?: string
    pipelineId?: string
    source?: string
    locationId: string
  }

  const stageId = oppData.pipelineStageId || oppData.stageId

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { propertyPipelineId: true, propertyTriggerStage: true },
  })

  if (!tenant?.propertyTriggerStage) return

  const isPropertyTrigger =
    stageId === tenant.propertyTriggerStage &&
    (!tenant.propertyPipelineId || oppData.pipelineId === tenant.propertyPipelineId)

  if (!isPropertyTrigger) return

  if (oppData.contactId) {
    await createPropertyFromContact(tenantId, oppData.contactId, {
      ghlPipelineId: oppData.pipelineId,
      ghlPipelineStage: stageId,
      opportunitySource: oppData.source,
    })
  }
}

// ─── Task Completed → Sync to our DB ───────────────────────────────────────

async function handleTaskCompleted(tenantId: string, event: GHLWebhookEvent) {
  const taskData = event as { taskId?: string; id?: string }
  const ghlTaskId = taskData.taskId ?? taskData.id
  if (!ghlTaskId) return

  const updated = await db.task.findFirst({
    where: { tenantId, ghlTaskId },
    select: { id: true, assignedToId: true, category: true },
  })

  await db.task.updateMany({
    where: { tenantId, ghlTaskId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  // Award XP for task completion
  if (updated?.assignedToId) {
    awardTaskXP(tenantId, updated.assignedToId, updated.id, updated.category ?? undefined).catch((err) => {
      console.warn(`[Webhook] XP award failed for task ${updated.id}:`, err)
    })
  }

  // Trigger task_completed workflows
  triggerWorkflows(tenantId, 'task_completed', { taskId: updated?.id }).catch(() => {})
}

// ─── Appointment Created → Log it ──────────────────────────────────────────

async function handleAppointmentCreated(tenantId: string, event: GHLWebhookEvent) {
  await db.auditLog.create({
    data: {
      tenantId,
      action: 'appointment.created',
      resource: 'appointment',
      source: 'GHL_WEBHOOK',
      severity: 'INFO',
      payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
    },
  })
}
