// lib/ghl/webhooks.ts
// Processes all incoming GHL webhook events
// Called by: app/api/webhooks/ghl/route.ts

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { gradeCall } from '@/lib/ai/grading'
import { createPropertyFromContact } from '@/lib/properties'
import { awardTaskXP } from '@/lib/gamification/xp'
import { triggerWorkflows } from '@/lib/workflows/engine'
import { fetchAndStoreRecording } from '@/lib/ghl/fetch-recording'

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

// ─── InboundMessage / OutboundMessage ──────────────────────────────────────

async function handleMessage(tenantId: string, event: GHLWebhookEvent) {
  const msg = event as {
    type: string
    messageType?: string
    messageTypeId?: number
    locationId: string
    id?: string          // message ID
    messageId?: string   // alternate field
    contactId?: string
    conversationId?: string
    userId?: string
    direction?: string
    callDuration?: number
    callStatus?: string
    attachments?: Array<string | { url: string }>
    recordingUrl?: string
    recording_url?: string
    meta?: { call?: { duration?: number; status?: string; recordingUrl?: string } }
    body?: string
    dateAdded?: string
    altId?: string
  }

  // Log full payload for debugging
  console.log(`[GHL Webhook] Message: ${JSON.stringify(event).slice(0, 600)}`)

  // Check if this is a call message
  const msgType = (msg.messageType ?? '').toUpperCase()
  const isCall = msgType === 'TYPE_CALL' || msgType === 'CALL' || msg.messageTypeId === 1

  if (!isCall) return // skip SMS, email, chat

  // Extract what we can from the webhook — duration/status may NOT be present
  const callDuration = msg.callDuration ?? msg.meta?.call?.duration ?? 0
  const callStatus = (msg.callStatus ?? msg.meta?.call?.status ?? '').toLowerCase()
  const direction = (msg.direction ?? '').toLowerCase() === 'inbound' ? 'INBOUND' : 'OUTBOUND'
  const messageId = msg.id ?? msg.messageId ?? msg.altId ?? ''
  const recordingUrl = extractRecordingUrl(msg)

  console.log(`[GHL Webhook] Call: messageId=${messageId}, duration=${callDuration}s, status=${callStatus}, direction=${direction}, contact=${msg.contactId}, recording=${!!recordingUrl}`)

  // GHL sends callDuration=0 or null even for long calls — duration isn't known at webhook time.
  // Only skip if the call explicitly FAILED (status=failed/busy/no-answer).
  // Completed calls with no recording will get recording fetched after a delay.
  const skipStatuses = ['failed', 'busy', 'no-answer', 'canceled']
  if (skipStatuses.includes(callStatus)) {
    await db.auditLog.create({
      data: {
        tenantId,
        action: 'call.skipped',
        resource: 'call',
        source: 'GHL_WEBHOOK',
        severity: 'INFO',
        payload: {
          messageId,
          contactId: msg.contactId,
          duration: callDuration,
          status: callStatus,
          direction: msg.direction,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return
  }

  // Deduplicate by messageId or altId
  const dedupeId = msg.altId || messageId
  if (dedupeId) {
    const existing = await db.call.findFirst({
      where: {
        tenantId,
        OR: [
          { ghlCallId: dedupeId },
          ...(messageId && messageId !== dedupeId ? [{ ghlCallId: messageId }] : []),
        ],
      },
      select: { id: true, recordingUrl: true },
    })
    if (existing) {
      console.log(`[GHL Webhook] Duplicate call ${dedupeId}, skipping`)
      return
    }
  }

  // Find user by GHL userId
  const user = msg.userId
    ? await db.user.findFirst({ where: { tenantId, ghlUserId: msg.userId } })
    : null

  // Find linked property
  const property = msg.contactId
    ? await db.property.findFirst({ where: { tenantId, ghlContactId: msg.contactId } })
    : null

  // Resolve contact name
  let contactName: string | null = null
  if (msg.contactId) {
    try {
      const { getGHLClient } = await import('@/lib/ghl/client')
      const ghl = await getGHLClient(tenantId)
      const contact = await ghl.getContact(msg.contactId)
      contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || null
    } catch { /* non-fatal */ }
  }

  // Create call record — recording URL comes from attachments in webhook
  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId: dedupeId || messageId || undefined,
      ghlContactId: msg.contactId ?? undefined,
      contactName,
      assignedToId: user?.id,
      propertyId: property?.id,
      recordingUrl: recordingUrl ?? undefined,
      direction: direction as 'INBOUND' | 'OUTBOUND',
      durationSeconds: callDuration || undefined, // may be 0 from webhook, real duration comes later
      calledAt: msg.dateAdded ? new Date(msg.dateAdded) : new Date(),
      gradingStatus: 'PENDING',
    },
  })

  console.log(`[GHL Webhook] Created call ${call.id}: recording=${!!recordingUrl}, contact=${contactName}`)

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
        messageId,
        duration: callDuration,
        hasRecording: !!recordingUrl,
        contactId: msg.contactId,
        contactName,
      } as unknown as Prisma.InputJsonValue,
    },
  })

  // If recording URL available (from attachments), transcribe immediately
  // Twilio recording URLs are public — no auth needed for Deepgram
  if (recordingUrl) {
    // Transcribe and grade immediately (recording is already available)
    import('../ai/transcribe').then(({ transcribeRecording }) =>
      transcribeRecording(recordingUrl!).then(async trans => {
        if (trans.status === 'success' && trans.transcript) {
          await db.call.update({
            where: { id: call.id },
            data: {
              transcript: trans.transcript,
              ...(trans.duration ? { durationSeconds: trans.duration } : {}),
            },
          })
          console.log(`[GHL Webhook] Transcribed call ${call.id}: ${trans.transcript.length} chars`)
        }
        // Grade with or without transcript
        return gradeCall(call.id)
      }).catch(err => {
        console.error(`[GHL Webhook] Transcription/grading failed for ${call.id}:`, err instanceof Error ? err.message : err)
        // Grade without transcript as fallback
        gradeCall(call.id).catch(() => {})
      })
    ).catch(() => {})
    return
  }

  // If no recording URL in the payload, fetch it after 90 second delay
  if (!recordingUrl && messageId) {
    console.log(`[GHL Webhook] Scheduling recording fetch in 90s for call ${call.id} (msg: ${messageId})`)
    setTimeout(() => {
      fetchAndStoreRecording(call.id, messageId)
        .then(() => {
          // After recording is fetched, trigger grading
          gradeCall(call.id).catch(err => {
            console.error(`[Call Grading] Failed for call ${call.id}:`, err instanceof Error ? err.message : err)
          })
        })
        .catch(err => {
          console.error(`[Recording] Fetch failed for call ${call.id}:`, err instanceof Error ? err.message : err)
          // Grade anyway with metadata only
          gradeCall(call.id).catch(() => {})
        })
    }, 90_000) // 90 second delay
  } else {
    // Recording already available — grade immediately
    gradeCall(call.id).catch(err => {
      console.error(`[Call Grading] Failed for call ${call.id}:`, err instanceof Error ? err.message : err)
    })
  }
}

// Extract recording URL from webhook payload
function extractRecordingUrl(data: {
  attachments?: Array<string | { url: string }>
  recordingUrl?: string
  recording_url?: string
  meta?: { call?: { recordingUrl?: string } }
}): string | null {
  if (data.attachments && data.attachments.length > 0) {
    const first = data.attachments[0]
    const url = typeof first === 'string' ? first : first?.url
    if (url) return url
  }
  if (data.recordingUrl) return data.recordingUrl
  if (data.recording_url) return data.recording_url
  if (data.meta?.call?.recordingUrl) return data.meta.call.recordingUrl
  return null
}

// ─── Call Completed (legacy — some GHL setups send this) ────────────────────

async function handleCallCompleted(tenantId: string, event: GHLWebhookEvent) {
  const callData = event as {
    id?: string
    callId?: string
    messageId?: string
    recordingUrl?: string
    recording_url?: string
    attachments?: Array<string | { url: string }>
    duration?: number
    callDuration?: number
    direction?: string
    contactId?: string
    userId?: string
    locationId: string
  }

  const messageId = callData.messageId ?? callData.id ?? callData.callId
  if (!messageId) return

  const duration = callData.callDuration ?? callData.duration ?? 0
  if (duration < 45) return

  // Deduplicate
  const existing = await db.call.findFirst({
    where: { tenantId, ghlCallId: messageId },
    select: { id: true },
  })
  if (existing) return

  const user = callData.userId
    ? await db.user.findFirst({ where: { tenantId, ghlUserId: callData.userId } })
    : null

  const recordingUrl = extractRecordingUrl(callData)

  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId: messageId,
      ghlContactId: callData.contactId ?? undefined,
      assignedToId: user?.id,
      recordingUrl: recordingUrl ?? undefined,
      direction: callData.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
      durationSeconds: duration,
      calledAt: new Date(),
      gradingStatus: 'PENDING',
    },
  })

  if (!recordingUrl) {
    setTimeout(() => {
      fetchAndStoreRecording(call.id, messageId)
        .then(() => gradeCall(call.id).catch(() => {}))
        .catch(() => gradeCall(call.id).catch(() => {}))
    }, 90_000)
  } else {
    gradeCall(call.id).catch(err => {
      console.error(`[Call Grading] Failed for call ${call.id}:`, err instanceof Error ? err.message : err)
    })
  }
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

  if (updated?.assignedToId) {
    awardTaskXP(tenantId, updated.assignedToId, updated.id, updated.category ?? undefined).catch(err => {
      console.warn(`[Webhook] XP award failed for task ${updated.id}:`, err)
    })
  }

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
