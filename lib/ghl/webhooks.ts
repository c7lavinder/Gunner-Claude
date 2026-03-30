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
    case 'ContactUpdate':
    case 'contact.updated':
    case 'ContactDelete':
    case 'contact.deleted':
      await handleContactChange(tenant.id, event)
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

  // Resolve contact name + address from GHL
  let contactName: string | null = null
  let contactAddress: string | null = null
  if (msg.contactId) {
    try {
      const { getGHLClient } = await import('@/lib/ghl/client')
      const ghl = await getGHLClient(tenantId)
      const contact = await ghl.getContact(msg.contactId)
      contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || null
      contactAddress = [contact.address1, contact.city, contact.state].filter(Boolean).join(', ') || null
    } catch { /* non-fatal */ }
  }

  // Create call record — recording URL comes from attachments in webhook
  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId: dedupeId || messageId || undefined,
      ghlContactId: msg.contactId ?? undefined,
      contactName,
      contactAddress,
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
    previousStageId?: string
    contactId?: string
    pipelineId?: string
    source?: string
    locationId: string
  }

  const stageId = oppData.pipelineStageId || oppData.stageId
  if (!oppData.contactId || !stageId) return

  // Resolve stage name from GHL upfront — used by all paths below
  let resolvedStageName: string | null = null
  try {
    const { getGHLClient } = await import('@/lib/ghl/client')
    const ghl = await getGHLClient(tenantId)
    const pipelines = await ghl.getPipelines()
    for (const pipeline of pipelines.pipelines ?? []) {
      const stage = pipeline.stages?.find((s: { id: string; name: string }) => s.id === stageId)
      if (stage) { resolvedStageName = stage.name; break }
    }
  } catch { /* non-fatal */ }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      propertyPipelineId: true, propertyTriggerStage: true,
      dispoPipelineId: true, dispoTriggerStage: true,
    },
  })
  if (!tenant) return

  // ─── Check: is this the acquisition trigger? ──────────────────────────
  const isAcqTrigger =
    tenant.propertyTriggerStage &&
    stageId === tenant.propertyTriggerStage &&
    (!tenant.propertyPipelineId || oppData.pipelineId === tenant.propertyPipelineId)

  if (isAcqTrigger) {
    await createPropertyFromContact(tenantId, oppData.contactId, {
      ghlPipelineId: oppData.pipelineId,
      ghlPipelineStage: resolvedStageName ?? stageId,
      opportunitySource: oppData.source,
    })
    return
  }

  // ─── Check: is this the dispo trigger? ────────────────────────────────
  const isDispoTrigger =
    tenant.dispoTriggerStage &&
    stageId === tenant.dispoTriggerStage &&
    (!tenant.dispoPipelineId || oppData.pipelineId === tenant.dispoPipelineId)

  if (isDispoTrigger) {
    // Update existing property to IN_DISPOSITION, or create if none exists
    const existing = await db.property.findFirst({
      where: { tenantId, ghlContactId: oppData.contactId },
    })
    if (existing) {
      await db.property.update({
        where: { id: existing.id },
        data: {
          status: 'IN_DISPOSITION',
          ghlPipelineId: oppData.pipelineId,
          ghlPipelineStage: resolvedStageName ?? stageId,
        },
      })
      console.log(`[GHL Webhook] Dispo trigger: updated property ${existing.address} to IN_DISPOSITION`)
    } else {
      await createPropertyFromContact(tenantId, oppData.contactId, {
        ghlPipelineId: oppData.pipelineId,
        ghlPipelineStage: resolvedStageName ?? stageId,
        opportunitySource: oppData.source,
      })
    }
    return
  }

  // ─── General stage change: update existing property status ────────────
  try {
    const stageName = resolvedStageName

    const { getAppStage } = await import('@/lib/ghl-stage-map')
    const appStage = stageName ? getAppStage(stageName) : null

    const APP_STAGE_TO_STATUS: Record<string, string> = {
      'acquisition.new_lead': 'NEW_LEAD',
      'acquisition.appt_set': 'APPOINTMENT_SET',
      'acquisition.offer_made': 'OFFER_MADE',
      'acquisition.contract': 'UNDER_CONTRACT',
      'acquisition.closed': 'SOLD',
      'disposition.new_deal': 'IN_DISPOSITION',
      'disposition.pushed_out': 'DISPO_PUSHED',
      'disposition.offers_received': 'DISPO_OFFERS',
      'disposition.contracted': 'DISPO_CONTRACTED',
      'disposition.closed': 'DISPO_CLOSED',
      'longterm.follow_up': 'FOLLOW_UP',
      // SOLD maps to DEAD per business rule (sold = done = dead pipeline)
      'longterm.dead': 'DEAD',
    }

    const newStatus = appStage ? APP_STAGE_TO_STATUS[appStage] : null
    const isDispoStage = appStage?.startsWith('disposition')

    // Check if property is already in dispo — dispo outweighs acquisition
    const existingProp = await db.property.findFirst({
      where: { tenantId, ghlContactId: oppData.contactId },
      select: { status: true },
    })
    const currentlyInDispo = existingProp?.status && ['IN_DISPOSITION', 'DISPO_PUSHED', 'DISPO_OFFERS', 'DISPO_CONTRACTED', 'DISPO_CLOSED'].includes(existingProp.status)

    const updateData: Record<string, unknown> = {}

    if (isDispoStage) {
      // Dispo stage changes always update everything
      updateData.ghlPipelineStage = stageName ?? stageId
      updateData.ghlPipelineId = oppData.pipelineId
      if (newStatus) updateData.status = newStatus
    } else if (currentlyInDispo) {
      // Property is in dispo — don't let acquisition stage overwrite status or stage name
      console.log(`[GHL Webhook] Skipping acq stage update — property already in dispo (${existingProp.status})`)
    } else {
      // Normal acquisition/longterm update
      updateData.ghlPipelineStage = stageName ?? stageId
      updateData.ghlPipelineId = oppData.pipelineId
      if (newStatus) updateData.status = newStatus
    }

    if (Object.keys(updateData).length > 0) {
      await db.property.updateMany({
        where: { tenantId, ghlContactId: oppData.contactId },
        data: updateData,
      })
    }

    // Auto-create milestone for the new status (with dedup: same type + property + same day = skip)
    if (newStatus) {
      const STATUS_TO_MILESTONE: Record<string, string> = {
        'NEW_LEAD': 'LEAD', 'CONTACTED': 'LEAD', 'FOLLOW_UP': 'LEAD',
        'APPOINTMENT_SET': 'APPOINTMENT_SET', 'APPOINTMENT_COMPLETED': 'APPOINTMENT_SET',
        'OFFER_MADE': 'OFFER_MADE', 'UNDER_CONTRACT': 'UNDER_CONTRACT', 'SOLD': 'CLOSED',
        'IN_DISPOSITION': 'DISPO_NEW', 'DISPO_PUSHED': 'DISPO_PUSHED',
        'DISPO_OFFERS': 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED': 'DISPO_CONTRACTED',
        'DISPO_CLOSED': 'DISPO_CLOSED',
      }
      const milestoneType = STATUS_TO_MILESTONE[newStatus]
      if (milestoneType) {
        try {
          const prop = await db.property.findFirst({
            where: { tenantId, ghlContactId: oppData.contactId },
            select: { id: true },
          })
          if (prop) {
            const { startOfDay, endOfDay } = await import('date-fns')
            const now = new Date()
            const existing = await db.propertyMilestone.findFirst({
              where: {
                tenantId, propertyId: prop.id, type: milestoneType as import('@prisma/client').MilestoneType,
                createdAt: { gte: startOfDay(now), lte: endOfDay(now) },
              },
            })
            if (!existing) {
              await db.propertyMilestone.create({
                data: {
                  tenantId,
                  propertyId: prop.id,
                  type: milestoneType as import('@prisma/client').MilestoneType,
                  source: 'AUTO_WEBHOOK',
                },
              })
              console.log(`[GHL Webhook] Auto-created ${milestoneType} milestone for property ${prop.id}`)
            }
          }
        } catch (err) {
          console.warn('[GHL Webhook] Milestone auto-create failed:', err instanceof Error ? err.message : err)
        }
      }
    }

    console.log(`[GHL Webhook] Stage changed for contact ${oppData.contactId}: ${stageName ?? stageId} → ${appStage ?? 'unknown'} → ${newStatus ?? 'no update'}`)
  } catch (err) {
    console.error('[GHL Webhook] Stage update failed:', err instanceof Error ? err.message : err)
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

// ─── Contact Change → Buyer Sync ─────────────────────────────────────────────
// When a GHL contact is created/updated/deleted, sync to local Buyer table
// This keeps the buyer DB fresh for instant matching

async function handleContactChange(tenantId: string, event: GHLWebhookEvent) {
  const contactId = (event.contactId ?? event.id ?? (event as Record<string, unknown>).contact_id) as string | undefined
  if (!contactId) return

  const isDelete = event.type === 'ContactDelete' || event.type === 'contact.deleted'

  if (isDelete) {
    // Mark buyer as inactive
    await db.buyer.updateMany({
      where: { ghlContactId: contactId, tenantId },
      data: { isActive: false },
    }).catch(() => {})
    console.log(`[GHL Webhook] Buyer deactivated: ${contactId}`)
    return
  }

  // For create/update, check if this contact is in the buyer pipeline
  try {
    const { getGHLClient } = await import('@/lib/ghl/client')
    const ghl = await getGHLClient(tenantId)
    const contact = await ghl.getContact(contactId)
    if (!contact) return

    // Check if they have buyer-related custom fields or are in buyer pipeline
    const hasCustomFields = (contact.customFields ?? []).some(
      (f: { id: string }) => ['Y4ton500NvCkJKtb4YzP', 'ghOapC4jq1iSzmCzv5up', 'VcdWDP2lXuuV1LwedOhs'].includes(f.id)
    )

    if (hasCustomFields) {
      const { syncBuyerFromGHL } = await import('@/lib/buyers/sync')
      await syncBuyerFromGHL(tenantId, {
        id: contact.id, firstName: contact.firstName, lastName: contact.lastName,
        phone: contact.phone, email: contact.email, city: contact.city, state: contact.state,
        tags: contact.tags ?? [], customFields: contact.customFields ?? [],
      })
      console.log(`[GHL Webhook] Buyer synced: ${contact.firstName} ${contact.lastName}`)
    }
  } catch (err) {
    console.error('[GHL Webhook] Contact sync failed:', err instanceof Error ? err.message : err)
  }
}
