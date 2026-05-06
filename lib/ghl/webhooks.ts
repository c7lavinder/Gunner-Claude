// lib/ghl/webhooks.ts
// Processes all incoming GHL webhook events
// Called by: app/api/webhooks/ghl/route.ts
//
// Webhooks ONLY save data. Grading happens in the cron (process-recording-jobs).
// One path, one loop, no fragile fire-and-forget chains.

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { getGHLClient } from '@/lib/ghl/client'
import { createPropertyFromContact, splitCombinedAddressIfNeeded } from '@/lib/properties'
import { enrichProperty } from '@/lib/enrichment/enrich-property'
import { awardTaskXP } from '@/lib/gamification/xp'
import { triggerWorkflows } from '@/lib/workflows/engine'
import { logFailure } from '@/lib/audit'

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

    case 'OpportunityCreate':
    case 'opportunity.create':
      await handleOpportunityCreate(tenant.id, event)
      break

    case 'OpportunityStageChanged':
    case 'opportunity.stageChanged':
    case 'OpportunityUpdate':
    case 'opportunity.update':
      await handleOpportunityUpdate(tenant.id, event)
      break

    case 'OpportunityDelete':
    case 'opportunity.delete':
      await handleOpportunityDelete(tenant.id, event)
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

  const webhookSource = (event as Record<string, unknown>)._webhookSource as string | undefined

  // Log full payload for debugging
  console.log(`[GHL Webhook] Message: type=${msg.messageType} typeId=${msg.messageTypeId} direction=${msg.direction} contact=${msg.contactId} payload=${JSON.stringify(event).slice(0, 400)}`)

  // Check if this is a call message
  // Verified from GHL docs: messageType="CALL", messageTypeId=1, messageTypeString="TYPE_CALL"
  // Voicemail: messageTypeId=10
  // Fallback: any message with callDuration/callStatus/meta.call is a call
  const msgType = (msg.messageType ?? '').toUpperCase()
  const typeId = typeof msg.messageTypeId === 'number' ? msg.messageTypeId : -1
  const isCall = msgType === 'CALL' || msgType === 'TYPE_CALL' || typeId === 1 || typeId === 10
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

  // Save call status info for the cron processor to use later.
  // We do NOT classify or skip here — the cron decides SKIPPED vs grade.
  const hasFailStatus = ['failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)

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

  // Cross-source dedup: OAuth and automation webhooks fire for the same call with different IDs.
  // One has a real GHL ID, the other has a wf_ prefix. Either can arrive first.
  // If one source already created this call within 10s, upgrade that row instead of creating a dupe.
  // 10s is safe — real double-dials are deliberate redials with 10+ seconds between them.
  if (msg.contactId) {
    const isAutomation = dedupeId.startsWith('wf_')
    const otherSourcePrefix = isAutomation ? 'webhook_oauth' : 'webhook_automation'
    const crossSourceDupe = await db.call.findFirst({
      where: {
        tenantId,
        ghlContactId: msg.contactId,
        createdAt: { gte: new Date(Date.now() - 30_000) },
        source: { startsWith: otherSourcePrefix },
      },
      select: { id: true, durationSeconds: true, gradingStatus: true, ghlCallId: true },
    })
    if (crossSourceDupe) {
      // Upgrade the existing row if we have better data (e.g. real duration)
      const updates: Record<string, unknown> = {}
      if (callDuration > 0 && !crossSourceDupe.durationSeconds) updates.durationSeconds = callDuration
      if (!isAutomation && crossSourceDupe.ghlCallId?.startsWith('wf_')) updates.ghlCallId = dedupeId // prefer real ID
      if (Object.keys(updates).length > 0) {
        await db.call.update({ where: { id: crossSourceDupe.id }, data: updates })
      }
      console.log(`[GHL Webhook] Cross-source duplicate for ${msg.contactId} — merged into ${crossSourceDupe.id}`)
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
    } catch (err) { await logFailure(tenantId, 'webhook.contact_lookup_failed', 'call', err, { contactId: msg.contactId, handler: 'handleMessage' }) }
  }
  // Fallback: use phone number if contact name couldn't be resolved
  if (!contactName) {
    const phone = String(event.phone ?? event.to ?? event.from ?? (event as Record<string, unknown>).callerNumber ?? '')
    if (phone) contactName = phone
  }

  // Create call record — always PENDING. The cron processor decides SKIPPED vs grade.
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
      durationSeconds: callDuration > 0 ? callDuration : undefined,
      calledAt: msg.dateAdded ? new Date(msg.dateAdded) : new Date(),
      source: webhookSource === 'automation' ? 'webhook_automation' : 'webhook_oauth',
      gradingStatus: 'PENDING',
      callResult: hasFailStatus ? 'no_answer' : undefined,
    },
  })

  console.log(`[GHL Webhook] Created call ${call.id}: recording=${!!recordingUrl}, contact=${contactName}, duration=${callDuration}s`)

  // Auto-add team member when a call is tied to a property
  if (property?.id && user?.id) {
    await db.propertyTeamMember.upsert({
      where: { propertyId_userId: { propertyId: property.id, userId: user.id } },
      create: { propertyId: property.id, userId: user.id, tenantId, role: user.role ?? 'Team', source: 'call' },
      update: {},
    }).catch(err => logFailure(tenantId, 'webhook.team_member_upsert_failed', 'property_team_member', err, { propertyId: property?.id, userId: user?.id, callId: call.id }))
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

  // Cron processes this call within ~30 seconds. One path, no fragile chains.
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
  const webhookSource = (event as Record<string, unknown>)._webhookSource as string | undefined
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

  // Cross-source dedup: if the other source (OAuth or automation) already created
  // this call within 10s, treat as same call. Either can arrive first.
  if (!existing && callData.contactId) {
    const isAutomation = messageId.startsWith('wf_')
    const otherSourcePrefix = isAutomation ? 'webhook_oauth' : 'webhook_automation'
    existing = await db.call.findFirst({
      where: {
        tenantId,
        ghlContactId: callData.contactId,
        calledAt: { gte: new Date(Date.now() - 30_000) },
        source: { startsWith: otherSourcePrefix },
      },
      orderBy: { calledAt: 'desc' },
      select: { id: true, durationSeconds: true, gradingStatus: true, recordingUrl: true },
    })
  }

  if (existing) {
    // Update existing call with any new data — cron processor will handle grading
    const updates: Record<string, unknown> = {}
    if (existing.durationSeconds === null && duration > 0) updates.durationSeconds = duration
    if (!existing.recordingUrl) {
      const rec = extractRecordingUrl(callData)
      if (rec) updates.recordingUrl = rec
    }
    // If we got new data and call isn't already graded, bump back to PENDING so cron picks it up
    if (Object.keys(updates).length > 0) {
      if (existing.gradingStatus !== 'COMPLETED' && existing.gradingStatus !== 'PROCESSING') {
        updates.gradingStatus = 'PENDING'
      }
      await db.call.update({ where: { id: existing.id }, data: updates })
      console.log(`[GHL Webhook] Updated call ${existing.id}: ${JSON.stringify(updates)}`)
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
    } catch (err) {
      await logFailure(tenantId, 'webhook.contact_lookup_failed', 'call', err, { contactId, handler: 'handleCallCompleted' })
    }
  }
  // Fallback: use phone number if contact name couldn't be resolved
  if (!contactName) {
    const phone = String(event.phone ?? (event as Record<string, unknown>).to ?? (event as Record<string, unknown>).from ?? (event as Record<string, unknown>).callerNumber ?? '')
    if (phone) contactName = phone
  }

  // Save call status hint from GHL (cron uses this for SKIPPED routing)
  const explicitNoAnswer = duration === 0 && ['no-answer', 'busy', 'failed', 'canceled'].includes(
    String(callData.callStatus ?? callData.status ?? '').toLowerCase()
  )

  // Save recording URL if present in the webhook payload
  const recordingUrl = extractRecordingUrl(callData)

  // Always PENDING — the cron processor makes all grading decisions
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
      source: webhookSource === 'automation' ? 'webhook_automation' : 'webhook_oauth',
      recordingUrl: recordingUrl ?? undefined,
      gradingStatus: 'PENDING',
      callResult: explicitNoAnswer ? 'no_answer' : undefined,
    },
  })

  console.log(`[GHL Webhook] Created call ${call.id}: ${contactName ?? 'Unknown'} | ${duration}s | recording=${!!recordingUrl}`)
  // Cron processes this call within ~30 seconds. One path, no fragile chains.
}

// ─── Opportunity Create / Update / Delete (lane-aware, Phase 1 commit 2) ───
//
// Lane is determined by the GHL pipeline ID looking up tenant_ghl_pipelines.
// If the pipeline isn't registered → log INFO + ignore. The handler writes
// only to the lane's matching status / opp ID / stage name / entered-at
// columns (strict-lane writes per plan §0 decision #2). The single allowed
// cross-lane exception is the Sales Process pipeline at the "1 Month
// Follow Up" stage, which writes longtermStatus instead of acqStatus.

type GhlOppEvent = {
  id?: string                  // opp ID
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

type Lane = 'acquisition' | 'disposition' | 'longterm'

async function resolveStageName(tenantId: string, stageId: string): Promise<string | null> {
  try {
    const { getGHLClient } = await import('@/lib/ghl/client')
    const ghl = await getGHLClient(tenantId)
    const pipelines = await ghl.getPipelines()
    for (const pipeline of pipelines.pipelines ?? []) {
      const stage = pipeline.stages?.find((s: { id: string; name: string }) => s.id === stageId)
      if (stage) return stage.name
    }
  } catch (err) {
    await logFailure(tenantId, 'webhook.pipeline_lookup_failed', 'property', err, { stageId })
  }
  return null
}

async function getTrackForPipeline(tenantId: string, pipelineId: string): Promise<Lane | null> {
  const row = await db.tenantGhlPipeline.findFirst({
    where: { tenantId, ghlPipelineId: pipelineId, isActive: true },
    select: { track: true },
  })
  if (!row) return null
  if (row.track === 'acquisition' || row.track === 'disposition' || row.track === 'longterm') {
    return row.track
  }
  return null
}

const APP_STAGE_TO_STATUS: Record<string, string> = {
  'acquisition.new_lead': 'NEW_LEAD',
  'acquisition.appt_set': 'APPOINTMENT_SET',
  'acquisition.offer_made': 'OFFER_MADE',
  'acquisition.contract': 'UNDER_CONTRACT',
  'acquisition.closed': 'CLOSED',
  'disposition.new_deal': 'IN_DISPOSITION',
  'disposition.pushed_out': 'DISPO_PUSHED',
  'disposition.offers_received': 'DISPO_OFFERS',
  'disposition.contracted': 'DISPO_CONTRACTED',
  'disposition.closed': 'CLOSED',
  'longterm.follow_up': 'FOLLOW_UP',
  'longterm.dead': 'DEAD',
}

const APPSTAGE_REQUIRED_MILESTONES: Record<string, string[]> = {
  'acquisition.new_lead':   ['LEAD'],
  'acquisition.appt_set':   ['LEAD', 'APPOINTMENT_SET'],
  'acquisition.offer_made': ['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE'],
  'acquisition.contract':   ['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT'],
  'acquisition.closed':     ['LEAD', 'APPOINTMENT_SET', 'OFFER_MADE', 'UNDER_CONTRACT', 'CLOSED'],
  'disposition.new_deal':       ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW'],
  'disposition.pushed_out':     ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED'],
  'disposition.offers_received':['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED'],
  'disposition.contracted':     ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED'],
  'disposition.closed':         ['LEAD', 'UNDER_CONTRACT', 'DISPO_NEW', 'DISPO_PUSHED', 'DISPO_OFFER_RECEIVED', 'DISPO_CONTRACTED', 'DISPO_CLOSED'],
  'longterm.follow_up': ['LEAD'],
  'longterm.dead': [],
}

// Resolve the lane + status to write based on track + stageName.
// Returns null when the move is a NO-OP under strict-lane mode (e.g. SP at
// "4 Month FU" — paired Follow Up opp expected to do the longterm write).
async function resolveLaneAndStatus(
  track: Lane,
  stageName: string,
): Promise<{ lane: Lane; status: string; appStage: string } | null> {
  const { getAppStage } = await import('@/lib/ghl-stage-map')
  const appStage = getAppStage(stageName)

  if (track === 'acquisition') {
    if (appStage.startsWith('acquisition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'acquisition', status, appStage } : null
    }
    // Cross-lane exception: SP at "1 Month Follow Up" → longtermStatus
    if (appStage === 'longterm.follow_up' && stageName === '1 Month Follow Up') {
      return { lane: 'longterm', status: 'FOLLOW_UP', appStage: 'longterm.follow_up' }
    }
    // SP at 4 Month FU / 1 Year FU / Ghosted / DO NOT WANT / SOLD → NO-OP.
    // Strict-lane mode expects a paired Follow Up pipeline opp to drive
    // longtermStatus separately.
    return null
  }

  if (track === 'disposition') {
    if (appStage.startsWith('disposition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'disposition', status, appStage } : null
    }
    // Stage didn't classify cleanly — log + treat as default new-deal entry
    return { lane: 'disposition', status: 'IN_DISPOSITION', appStage }
  }

  if (track === 'longterm') {
    if (appStage === 'acquisition.closed') {
      // FU pipeline at "Purchased" stage → NO-OP per plan §2
      return null
    }
    if (appStage.startsWith('longterm.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'longterm', status, appStage } : null
    }
    return { lane: 'longterm', status: 'FOLLOW_UP', appStage }
  }

  return null
}

// Build the per-lane Property update payload (status + entered_at + stage name + opp ID).
function laneUpdatePayload(
  lane: Lane,
  status: string,
  stageLabel: string,
  oppId: string | null,
  now: Date,
): Record<string, unknown> {
  if (lane === 'acquisition') {
    return {
      acqStatus: status,
      acqStageEnteredAt: now,
      ghlAcqStageName: stageLabel,
      ...(oppId ? { ghlAcqOppId: oppId } : {}),
    }
  }
  if (lane === 'disposition') {
    return {
      dispoStatus: status,
      dispoStageEnteredAt: now,
      ghlDispoStageName: stageLabel,
      ...(oppId ? { ghlDispoOppId: oppId } : {}),
    }
  }
  return {
    longtermStatus: status,
    longtermStageEnteredAt: now,
    ghlLongtermStageName: stageLabel,
    ...(oppId ? { ghlLongtermOppId: oppId } : {}),
  }
}

async function logUnlistenedPipeline(tenantId: string, oppData: GhlOppEvent, eventType: string) {
  await db.auditLog.create({
    data: {
      tenantId,
      action: 'ghl.webhook.unlistened_pipeline',
      resource: 'webhook',
      severity: 'INFO',
      source: 'GHL_WEBHOOK',
      payload: {
        eventType,
        contactId: oppData.contactId,
        pipelineId: oppData.pipelineId,
        oppId: oppData.id,
      } as Prisma.InputJsonValue,
    },
  }).catch(() => {})
}

// Auto-create milestones (LEAD, APPOINTMENT_SET, etc.) up to and including
// the current appStage. Works the same for any lane.
async function backfillMilestones(
  tenantId: string,
  propertyId: string,
  appStage: string,
  loggedById: string | null,
): Promise<void> {
  const required = APPSTAGE_REQUIRED_MILESTONES[appStage] ?? []
  if (required.length === 0) return
  try {
    const prop = await db.property.findFirst({
      where: { tenantId, id: propertyId },
      select: { milestones: { select: { type: true } } },
    })
    if (!prop) return
    const existing = new Set(prop.milestones.map(m => String(m.type)))
    for (const mType of required) {
      if (existing.has(mType)) continue
      await db.propertyMilestone.create({
        data: {
          tenantId,
          propertyId,
          type: mType as import('@prisma/client').MilestoneType,
          source: 'AUTO_WEBHOOK',
          loggedById: loggedById ?? undefined,
        },
      }).catch(err => logFailure(tenantId, 'webhook.milestone_backfill_failed', 'property_milestone', err, { propertyId, milestoneType: mType }))
    }
  } catch (err) {
    await logFailure(tenantId, 'webhook.milestone_create_failed', 'property_milestone', err, { propertyId, appStage })
  }
}

// Upsert seller / buyer when the opp's pipeline is the configured
// seller-pipeline or buyer-pipeline. Independent of the property write path.
async function upsertSellerBuyerFromOpp(tenantId: string, oppData: GhlOppEvent): Promise<void> {
  if (!oppData.contactId || !oppData.pipelineId) return
  try {
    const { getSellerBuyerPipelineIds } = await import('@/lib/ghl/pipelines')
    const { sellerPipelineId, buyerPipelineId } = await getSellerBuyerPipelineIds(tenantId)
    const ghl = await getGHLClient(tenantId)
    const contact = await ghl.getContact(oppData.contactId)
    const contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
    if (!contactName) return

    const normalizePhone = (p: string | null | undefined): string | null => {
      if (!p) return null
      const d = p.replace(/\D/g, '')
      if (d.length === 10) return `+1${d}`
      if (d.length === 11 && d.startsWith('1')) return `+${d}`
      return p
    }
    const phone = normalizePhone(contact.phone)

    if (oppData.pipelineId === sellerPipelineId) {
      const existing = await db.seller.findFirst({
        where: { tenantId, OR: [{ ghlContactId: oppData.contactId }, ...(phone ? [{ phone }] : [])] },
        select: { id: true },
      })
      if (existing) {
        await db.seller.update({ where: { id: existing.id }, data: { name: contactName, phone, email: contact.email || null, ghlContactId: oppData.contactId } })
      } else {
        await db.seller.create({ data: { tenantId, name: contactName, phone, email: contact.email || null, ghlContactId: oppData.contactId } })
      }
    }

    if (oppData.pipelineId === buyerPipelineId) {
      const existing = await db.buyer.findFirst({
        where: { tenantId, OR: [{ ghlContactId: oppData.contactId }, ...(phone ? [{ phone }] : [])] },
        select: { id: true },
      })
      if (existing) {
        await db.buyer.update({ where: { id: existing.id }, data: { name: contactName, phone, email: contact.email || null, ghlContactId: oppData.contactId } })
      } else {
        await db.buyer.create({ data: { tenantId, name: contactName, phone, email: contact.email || null, ghlContactId: oppData.contactId } })
      }
    }
  } catch (err) {
    await logFailure(tenantId, 'webhook.contact_upsert_from_opp_failed', 'seller', err, { contactId: oppData.contactId })
  }
}

// Resolve the assigned GHL user → local user (for milestone attribution).
async function resolveMilestoneUser(tenantId: string, oppData: GhlOppEvent): Promise<string | null> {
  const ghlUserId = oppData.assignedTo ?? oppData.userId ?? ''
  if (!ghlUserId) return null
  const user = await db.user.findFirst({ where: { tenantId, ghlUserId }, select: { id: true } })
  return user?.id ?? null
}

// ── Common path: process a Create or Update event for a known lane ──────
async function processLaneOppEvent(
  tenantId: string,
  oppData: GhlOppEvent,
  track: Lane,
  resolvedStageName: string | null,
  isCreate: boolean,
): Promise<void> {
  const stageId = oppData.pipelineStageId || oppData.stageId || ''
  if (!oppData.contactId || !stageId) return
  const stageLabel = resolvedStageName ?? stageId

  const resolution = resolvedStageName ? await resolveLaneAndStatus(track, resolvedStageName) : null
  if (!resolution) {
    // Strict-lane NO-OP — paired opp expected in another pipeline.
    console.log(`[GHL Webhook] No-op stage move (track=${track}, stage=${stageLabel})`)
    return
  }

  const { lane, status, appStage } = resolution
  const now = new Date()
  const milestoneUserId = await resolveMilestoneUser(tenantId, oppData)

  // Find the existing property for this contact (any lane).
  const existing = await db.property.findFirst({
    where: { tenantId, ghlContactId: oppData.contactId },
    select: { id: true, address: true, ghlSyncLocked: true },
  })

  if (!existing) {
    // No property yet for this contact. All three lanes create when no
    // property exists. Owner override 2026-05-06 — long-term-only leads
    // are real pipeline state and should land in Gunner inventory.
    // Visibility filter (plan §4) keeps them out of the default view
    // unless "Show archived" is on, so they don't clutter day-to-day work.

    // Create property + apply lane payload.
    await createPropertyFromContact(tenantId, oppData.contactId, {
      ghlPipelineId: oppData.pipelineId,
      ghlPipelineStage: stageLabel,
      opportunitySource: oppData.source,
    })

    const created = await db.property.findFirst({
      where: { tenantId, ghlContactId: oppData.contactId },
      select: { id: true },
    })
    if (created) {
      await db.property.update({
        where: { id: created.id },
        data: laneUpdatePayload(lane, status, stageLabel, oppData.id ?? null, now),
      })
      await backfillMilestones(tenantId, created.id, appStage, milestoneUserId)
    }
    console.log(`[GHL Webhook] ${isCreate ? 'Created' : 'Stage moved'} → property created for contact ${oppData.contactId} (lane=${lane}, status=${status})`)
    return
  }

  // Existing property — respect sync lock then write the lane.
  if (existing.ghlSyncLocked) {
    console.log(`[GHL Webhook] Lane write skipped (sync locked): ${existing.address}`)
    return
  }

  await db.property.update({
    where: { id: existing.id, tenantId },
    data: laneUpdatePayload(lane, status, stageLabel, oppData.id ?? null, now),
  })
  await backfillMilestones(tenantId, existing.id, appStage, milestoneUserId)
  console.log(`[GHL Webhook] ${existing.address} → ${lane}=${status} (stage="${stageLabel}")`)
}

async function handleOpportunityCreate(tenantId: string, event: GHLWebhookEvent) {
  const oppData = event as unknown as GhlOppEvent
  const stageId = oppData.pipelineStageId || oppData.stageId
  if (!oppData.contactId || !stageId || !oppData.pipelineId) return

  const track = await getTrackForPipeline(tenantId, oppData.pipelineId)
  if (!track) {
    await logUnlistenedPipeline(tenantId, oppData, 'OpportunityCreate')
    return
  }

  const resolvedStageName = await resolveStageName(tenantId, stageId)
  await processLaneOppEvent(tenantId, oppData, track, resolvedStageName, true)
  await upsertSellerBuyerFromOpp(tenantId, oppData)
}

async function handleOpportunityUpdate(tenantId: string, event: GHLWebhookEvent) {
  const oppData = event as unknown as GhlOppEvent
  const stageId = oppData.pipelineStageId || oppData.stageId
  if (!oppData.contactId || !stageId || !oppData.pipelineId) return

  const track = await getTrackForPipeline(tenantId, oppData.pipelineId)
  if (!track) {
    await logUnlistenedPipeline(tenantId, oppData, 'OpportunityUpdate')
    return
  }

  const resolvedStageName = await resolveStageName(tenantId, stageId)
  await processLaneOppEvent(tenantId, oppData, track, resolvedStageName, false)
  await upsertSellerBuyerFromOpp(tenantId, oppData)
}

// On opp delete: clear the matching lane's *OppId. Status values stay
// intact. If a new opp arrives later for the same contact in the same
// pipeline, the field repopulates and the property reappears in views
// keyed off opp ID.
async function handleOpportunityDelete(tenantId: string, event: GHLWebhookEvent) {
  const oppData = event as unknown as GhlOppEvent
  const oppId = oppData.id
  if (!oppId) return

  // Find any property whose lane opp ID matches this deleted opp.
  const props = await db.property.findMany({
    where: {
      tenantId,
      OR: [
        { ghlAcqOppId: oppId },
        { ghlDispoOppId: oppId },
        { ghlLongtermOppId: oppId },
      ],
    },
    select: {
      id: true, address: true,
      ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
    },
  })

  for (const p of props) {
    const data: Record<string, null> = {}
    if (p.ghlAcqOppId === oppId) data.ghlAcqOppId = null
    if (p.ghlDispoOppId === oppId) data.ghlDispoOppId = null
    if (p.ghlLongtermOppId === oppId) data.ghlLongtermOppId = null
    if (Object.keys(data).length === 0) continue

    await db.property.update({ where: { id: p.id, tenantId }, data })
    console.log(`[GHL Webhook] Cleared opp ID ${oppId} from ${p.address} (${Object.keys(data).join(', ')})`)
  }

  await db.auditLog.create({
    data: {
      tenantId,
      action: 'ghl.webhook.opportunity_deleted',
      resource: 'webhook',
      resourceId: oppId,
      severity: 'INFO',
      source: 'GHL_WEBHOOK',
      payload: { oppId, propertiesCleared: props.length } as Prisma.InputJsonValue,
    },
  }).catch(() => {})
}


// ─── Task Completed → Sync to our DB ───────────────────────────────────────

async function handleTaskCompleted(tenantId: string, event: GHLWebhookEvent) {
  const taskData = event as { taskId?: string; id?: string; userId?: string }
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

  // Write an audit log entry so the Day Hub "Completed Today" panel can detect
  // GHL-UI completions the same way it detects Gunner-UI ones (we key off this
  // action). The webhook payload doesn't include a reliable "completed by"
  // user, so fall back to the task's assignee for attribution.
  await db.auditLog.create({
    data: {
      tenantId,
      // Map GHL user (if provided) → our internal user. Fallback to assignee.
      userId: updated?.assignedToId ?? null,
      action: 'task.completed_ghl',
      resource: 'task',
      resourceId: ghlTaskId,
      source: 'GHL_WEBHOOK',
      severity: 'INFO',
      payload: { taskId: ghlTaskId, viaWebhook: true },
    },
  }).catch(err => {
    console.warn(`[Webhook] Audit log write failed for task ${ghlTaskId}:`, err)
  })

  if (updated?.assignedToId) {
    awardTaskXP(tenantId, updated.assignedToId, updated.id, updated.category ?? undefined).catch(err => {
      console.warn(`[Webhook] XP award failed for task ${updated.id}:`, err)
    })
  }

  triggerWorkflows(tenantId, 'task_completed', { taskId: updated?.id }).catch(err => logFailure(tenantId, 'workflow.trigger_failed', 'task', err, { event: 'task_completed', taskId: updated?.id }))
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
    }).catch(err => logFailure(tenantId, 'buyer.deactivate_failed', `buyer:${contactId}`, err, { reason: 'ghl_contact_deleted' }))
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

        // If the newly synced address is a combined pattern (this was the root
        // cause of the historical doubles: empty address at creation, combined
        // address arrives here after GHL contact is enriched), split now.
        if (updates.address) {
          await splitCombinedAddressIfNeeded(property.id, tenantId).catch(err => {
            console.error('[GHL Webhook] Address split failed:', err)
          })
        }

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

        // Re-trigger full multi-vendor enrichment when address changes.
        if (updates.address) {
          enrichProperty(property.id, tenantId).catch(err =>
            console.warn('[GHL webhook] address-change enrichment failed:', err instanceof Error ? err.message : err)
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
