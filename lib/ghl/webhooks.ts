// lib/ghl/webhooks.ts
// Processes all incoming GHL webhook events
// Called by: app/api/webhooks/ghl/route.ts

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { gradeCall } from '@/lib/ai/grading'
import { getGHLClient } from '@/lib/ghl/client'
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
  console.log(`[GHL Webhook] Message: type=${msg.messageType} typeId=${msg.messageTypeId} direction=${msg.direction} contact=${msg.contactId} payload=${JSON.stringify(event).slice(0, 400)}`)

  // Check if this is a call message
  // Verified from GHL docs: messageType="CALL", messageTypeId=1, messageTypeString="TYPE_CALL"
  // Voicemail: messageTypeId=10
  // Fallback: any message with callDuration/callStatus/meta.call is a call
  const msgType = (msg.messageType ?? '').toUpperCase()
  const typeId = typeof msg.messageTypeId === 'number' ? msg.messageTypeId : -1
  const isCall = msgType === 'CALL' || typeId === 1 || typeId === 10
    || !!(msg.callDuration || msg.callStatus || msg.meta?.call)

  if (!isCall) return // skip SMS, email, chat

  // Extract call metadata
  const callDuration = msg.callDuration ?? msg.meta?.call?.duration ?? 0
  const callStatus = (msg.callStatus ?? msg.meta?.call?.status ?? '').toLowerCase()
  // Direction: GHL uses string field "inbound" / "outbound" (verified from docs)
  const direction = (msg.direction ?? '').toLowerCase() === 'inbound' ? 'INBOUND' : 'OUTBOUND'
  const messageId = msg.id ?? msg.messageId ?? msg.altId ?? ''
  const recordingUrl = extractRecordingUrl(msg)

  console.log(`[GHL Webhook] Call detected: messageId=${messageId}, duration=${callDuration}s, status=${callStatus}, direction=${direction}, contact=${msg.contactId}, recording=${!!recordingUrl}`)

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
      durationSeconds: callDuration > 0 ? callDuration : undefined, // 0 = not yet known, poll-calls fills it later
      calledAt: msg.dateAdded ? new Date(msg.dateAdded) : new Date(),
      gradingStatus: 'PENDING',
    },
  })

  console.log(`[GHL Webhook] Created call ${call.id}: recording=${!!recordingUrl}, contact=${contactName}`)

  // Auto-add team member when a call is tied to a property
  if (property?.id && user?.id) {
    await db.propertyTeamMember.upsert({
      where: { propertyId_userId: { propertyId: property.id, userId: user.id } },
      create: { propertyId: property.id, userId: user.id, tenantId, role: user.role ?? 'Team', source: 'call' },
      update: {},
    }).catch(() => {}) // ignore if already exists
  }

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
    callStatus?: string
    status?: string
  }

  const messageId = callData.messageId ?? callData.id ?? callData.callId
  if (!messageId) return

  // Skip only pre-connection statuses (not yet a dial)
  const status = String(callData.callStatus ?? callData.status ?? '').toLowerCase()
  if (['initiated', 'ringing'].includes(status)) return

  const duration = callData.callDuration ?? callData.duration ?? 0

  // Deduplicate — check by messageId first
  let existing = await db.call.findFirst({
    where: { tenantId, ghlCallId: messageId },
    select: { id: true, durationSeconds: true, gradingStatus: true, recordingUrl: true },
  })

  // If not found by messageId, check by contactId + recent time (workflow events have different IDs)
  if (!existing && callData.contactId) {
    existing = await db.call.findFirst({
      where: {
        tenantId,
        ghlContactId: callData.contactId,
        calledAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // within last 5 minutes
      },
      orderBy: { calledAt: 'desc' },
      select: { id: true, durationSeconds: true, gradingStatus: true, recordingUrl: true },
    })
  }

  if (existing) {
    // Update existing call with any new data we have (duration, recording)
    const updates: Record<string, unknown> = {}
    if (existing.durationSeconds === null && duration > 0) updates.durationSeconds = duration
    if (!existing.recordingUrl) {
      const rec = extractRecordingUrl(callData)
      if (rec) updates.recordingUrl = rec
    }

    if (Object.keys(updates).length > 0) {
      const finalDuration = (updates.durationSeconds ?? existing.durationSeconds ?? 0) as number
      const isGradeable = finalDuration >= 45
      await db.call.update({
        where: { id: existing.id },
        data: {
          ...updates,
          ...(isGradeable && existing.gradingStatus !== 'COMPLETED' ? { gradingStatus: 'PENDING' } : {}),
          ...(!isGradeable && finalDuration > 0 ? { gradingStatus: 'FAILED', callResult: 'short_call', aiSummary: `Short call (${finalDuration}s) — not graded.` } : {}),
        },
      })
      if (isGradeable && existing.gradingStatus !== 'COMPLETED') {
        console.log(`[GHL Webhook] Updated call ${existing.id} with duration=${finalDuration}s, triggering grade`)
        gradeCall(existing.id).catch(() => {})
      }
    }
    return
  }

  const user = callData.userId
    ? await db.user.findFirst({ where: { tenantId, ghlUserId: String(callData.userId) } })
    : null

  // Look up contact name from GHL (or from workflow payload)
  let contactName: string | null = (event as { fullName?: string; full_name?: string }).fullName
    ?? (event as { full_name?: string }).full_name ?? null
  let contactAddress: string | null = null
  const contactId = callData.contactId ? String(callData.contactId) : null

  if (!contactName && contactId) {
    try {
      const ghl = await getGHLClient(tenantId)
      const contact = await ghl.getContact(contactId)
      const c = (contact as { contact?: { firstName?: string; lastName?: string; address1?: string; city?: string; state?: string } }).contact ?? contact as { firstName?: string; lastName?: string; address1?: string; city?: string; state?: string }
      contactName = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || null
      contactAddress = [c.address1, c.city, c.state].filter(Boolean).join(', ') || null
    } catch {
      // GHL lookup failed — contact name stays null, poll-calls will fill it later
    }
  }

  // At webhook time, GHL sends duration=0 for connected calls (call hasn't ended yet).
  // Don't pre-judge — create as PENDING. Recording fetch + polling cron will upgrade later.
  // Only mark FAILED if we have PROOF: explicit no-answer status, or non-zero duration < 45s.
  const explicitNoAnswer = duration === 0 && ['no-answer', 'busy', 'failed', 'canceled'].includes(
    String(callData.callStatus ?? callData.status ?? '').toLowerCase()
  )
  const provenShortCall = duration > 0 && duration < 45
  const isFailed = explicitNoAnswer || provenShortCall

  // Save ALL calls — only mark FAILED when we have proof
  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId: messageId,
      ghlContactId: contactId ?? undefined,
      contactName: contactName ?? undefined,
      contactAddress: contactAddress ?? undefined,
      assignedToId: user?.id,
      direction: callData.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
      durationSeconds: duration > 0 ? duration : undefined,
      calledAt: new Date(),
      gradingStatus: isFailed ? 'FAILED' : 'PENDING',
      callResult: explicitNoAnswer ? 'no_answer' : provenShortCall ? 'short_call' : undefined,
      ...(isFailed ? {
        aiSummary: explicitNoAnswer ? 'No answer.' : `Short call (${duration}s) — not graded.`
      } : {}),
    },
  })

  console.log(`[GHL Webhook] Created call ${call.id}: ${contactName ?? 'Unknown'} | ${duration}s | ${isFailed ? 'FAILED' : 'PENDING'}`)

  // Fetch recording + grade for any call that isn't proven failed
  if (!isFailed) {
    const recordingUrl = extractRecordingUrl(callData)
    if (recordingUrl) {
      await db.call.update({ where: { id: call.id }, data: { recordingUrl } })
    }

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
    assignedTo?: string
    userId?: string
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

  // Resolve GHL user → local user for milestone attribution
  const ghlUserId = oppData.assignedTo ?? oppData.userId ?? ''
  const milestoneUser = ghlUserId
    ? await db.user.findFirst({ where: { tenantId, ghlUserId }, select: { id: true } })
    : null

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
    // Entering dispo: set dispoStatus (never touch acq status).
    const existing = await db.property.findFirst({
      where: { tenantId, ghlContactId: oppData.contactId },
      select: { id: true, address: true, status: true },
    })
    if (existing) {
      await db.property.update({
        where: { id: existing.id },
        data: { dispoStatus: 'IN_DISPOSITION' },
      })
      console.log(`[GHL Webhook] Dispo trigger: ${existing.address} → dispoStatus=IN_DISPOSITION (acq stays ${existing.status})`)
    } else {
      await createPropertyFromContact(tenantId, oppData.contactId, {
        ghlPipelineId: oppData.pipelineId,
        ghlPipelineStage: resolvedStageName ?? stageId,
        opportunitySource: oppData.source,
      })
    }

    const propForMilestone = existing ?? await db.property.findFirst({
      where: { tenantId, ghlContactId: oppData.contactId },
      select: { id: true, status: true },
    })
    if (propForMilestone) {
      const { getCentralDayBounds } = await import('@/lib/dates')
      const { dayStart, dayEnd } = getCentralDayBounds()

      // Backfill any missing acquisition milestones up to current acq status.
      // A property entering dispo has clearly completed acquisition through its current stage.
      const ACQ_STATUS_TO_MILESTONES: Record<string, string[]> = {
        'UNDER_CONTRACT': ['LEAD', 'UNDER_CONTRACT'],
        'OFFER_MADE': ['LEAD', 'OFFER_MADE'],
        'APPOINTMENT_SET': ['LEAD', 'APPOINTMENT_SET'],
        'SOLD': ['LEAD', 'UNDER_CONTRACT', 'CLOSED'],
      }
      const acqStatus = (existing ?? propForMilestone).status ?? ''
      const neededMilestones = ACQ_STATUS_TO_MILESTONES[acqStatus] ?? ['LEAD']
      for (const mType of neededMilestones) {
        const exists = await db.propertyMilestone.findFirst({
          where: { tenantId, propertyId: propForMilestone.id, type: mType as import('@prisma/client').MilestoneType },
        })
        if (!exists) {
          await db.propertyMilestone.create({
            data: { tenantId, propertyId: propForMilestone.id, type: mType as import('@prisma/client').MilestoneType, source: 'AUTO_WEBHOOK', loggedById: milestoneUser?.id },
          }).catch(() => {})
          console.log(`[GHL Webhook] Backfilled ${mType} milestone for ${propForMilestone.id}`)
        }
      }

      // Create DISPO_NEW milestone (same-day dedup)
      const existingDispo = await db.propertyMilestone.findFirst({
        where: { tenantId, propertyId: propForMilestone.id, type: 'DISPO_NEW', createdAt: { gte: dayStart, lte: dayEnd } },
      })
      if (!existingDispo) {
        await db.propertyMilestone.create({
          data: { tenantId, propertyId: propForMilestone.id, type: 'DISPO_NEW', source: 'AUTO_WEBHOOK', loggedById: milestoneUser?.id },
        }).catch(() => {})
        console.log(`[GHL Webhook] Created DISPO_NEW milestone for ${propForMilestone.id}`)
      }
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

    // Dispo stages → dispoStatus. Acq/longterm stages → status. Never cross-contaminate.
    const updateData: Record<string, unknown> = {}

    if (isDispoStage) {
      if (newStatus) updateData.dispoStatus = newStatus
    } else {
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

    // Auto-create milestone for the new status
    // Same-day dedup (Central time): allows re-entries on different days but prevents
    // duplicate milestones from multiple webhook fires within the same day.
    // CONTACTED/FOLLOW_UP don't create new LEAD milestones — only actual stage triggers do.
    if (newStatus) {
      const STATUS_TO_MILESTONE: Record<string, string> = {
        'NEW_LEAD': 'LEAD',
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
            // Same-day dedup in Central time
            const { getCentralDayBounds } = await import('@/lib/dates')
            const { dayStart, dayEnd } = getCentralDayBounds()

            const existing = await db.propertyMilestone.findFirst({
              where: {
                tenantId, propertyId: prop.id, type: milestoneType as import('@prisma/client').MilestoneType,
                createdAt: { gte: dayStart, lte: dayEnd },
              },
            })
            if (!existing) {
              await db.propertyMilestone.create({
                data: {
                  tenantId,
                  propertyId: prop.id,
                  type: milestoneType as import('@prisma/client').MilestoneType,
                  source: 'AUTO_WEBHOOK',
                  loggedById: milestoneUser?.id,
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

  // For create/update — fetch fresh contact data from GHL
  try {
    const { getGHLClient } = await import('@/lib/ghl/client')
    const ghl = await getGHLClient(tenantId)
    const contact = await ghl.getContact(contactId)
    if (!contact) return

    // ─── Sync property address + seller name ────────────────────────────
    // When a contact is updated in GHL (address fixed, name corrected),
    // push those changes to any linked Gunner property + seller.
    const property = await db.property.findFirst({
      where: { tenantId, ghlContactId: contactId },
      select: { id: true, address: true, city: true, state: true, zip: true, marketId: true },
    })

    if (property) {
      const { standardizeStreet, standardizeCity, standardizeState, standardizeZip } = await import('@/lib/address')
      const newAddress = standardizeStreet(contact.address1 ?? '')
      const newCity = standardizeCity(contact.city ?? '')
      const newState = standardizeState(contact.state ?? '')
      const newZip = standardizeZip(contact.postalCode ?? '')

      // Only update fields that GHL now has data for AND Gunner is missing or different
      const updates: Record<string, string> = {}
      if (newAddress && newAddress !== property.address) updates.address = newAddress
      if (newCity && newCity !== property.city) updates.city = newCity
      if (newState && newState !== property.state) updates.state = newState
      if (newZip && newZip !== property.zip) updates.zip = newZip

      if (Object.keys(updates).length > 0) {
        await db.property.update({ where: { id: property.id }, data: updates })
        console.log(`[GHL Webhook] Property ${property.id} address updated: ${JSON.stringify(updates)}`)

        // Auto-assign market by zip if property has no market and we now have a zip
        if (!property.marketId && (updates.zip || newZip)) {
          const zipToCheck = updates.zip ?? newZip
          const market = await db.market.findFirst({
            where: { tenantId, zipCodes: { has: zipToCheck } },
            select: { id: true },
          })
          if (market) {
            await db.property.update({ where: { id: property.id }, data: { marketId: market.id } })
            console.log(`[GHL Webhook] Property ${property.id} auto-assigned market from zip ${zipToCheck}`)
          } else {
            // Try config-based market lookup
            try {
              const { getMarketsForZip, MARKETS } = await import('@/lib/config/crm.config')
              const marketNames = getMarketsForZip(zipToCheck)
              if (marketNames.length > 0) {
                const name = marketNames[0]
                const zips = [...MARKETS[name].zips] as string[]
                let mkt = await db.market.findFirst({ where: { tenantId, name }, select: { id: true } })
                if (!mkt) mkt = await db.market.create({ data: { tenantId, name, zipCodes: zips } })
                await db.property.update({ where: { id: property.id }, data: { marketId: mkt.id } })
                console.log(`[GHL Webhook] Property ${property.id} auto-assigned market ${name} from zip ${zipToCheck}`)
              }
            } catch { /* config lookup optional */ }
          }
        }

        // Re-trigger BatchData enrichment if address changed and we have the key
        if (updates.address && process.env.BATCHDATA_API_KEY) {
          import('@/lib/batchdata/enrich').then(({ enrichPropertyFromBatchData }) =>
            enrichPropertyFromBatchData(property.id).catch(() => {})
          )
        }
      }

      // Update seller name/phone/email if changed
      const seller = await db.seller.findFirst({
        where: { tenantId, ghlContactId: contactId },
        select: { id: true, name: true, phone: true, email: true },
      })
      if (seller) {
        const newName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
        const sellerUpdates: Record<string, string> = {}
        if (newName && newName !== seller.name) sellerUpdates.name = newName
        if (contact.phone && contact.phone !== seller.phone) sellerUpdates.phone = contact.phone
        if (contact.email && contact.email !== seller.email) sellerUpdates.email = contact.email
        if (Object.keys(sellerUpdates).length > 0) {
          await db.seller.update({ where: { id: seller.id }, data: sellerUpdates })
          console.log(`[GHL Webhook] Seller ${seller.id} updated: ${JSON.stringify(sellerUpdates)}`)
        }
      }
    }

    // ─── Sync buyer if applicable ───────────────────────────────────────
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
