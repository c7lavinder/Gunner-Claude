// lib/ghl/webhooks.ts
// Processes all incoming GHL webhook events
// Called by: app/api/webhooks/ghl/route.ts

import { db } from '@/lib/db/client'
import { gradeCall } from '@/lib/ai/grading'
import { createPropertyFromContact } from '@/lib/properties'

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

    case 'OpportunityStageChanged':
    case 'opportunity.stageChanged':
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
      // Log unhandled events for future implementation
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: `ghl.webhook.unhandled`,
          resource: 'webhook',
          payload: event as Record<string, unknown>,
          source: 'GHL_WEBHOOK',
          severity: 'INFO',
        },
      })
  }
}

// ─── Call Completed → Auto-grade immediately ────────────────────────────────

async function handleCallCompleted(tenantId: string, event: GHLWebhookEvent) {
  const callData = event as {
    id?: string
    callId?: string
    recordingUrl?: string
    duration?: number
    direction?: string
    contactId?: string
    userId?: string
    locationId: string
  }

  const ghlCallId = callData.id ?? callData.callId
  if (!ghlCallId) {
    console.error('[GHL Webhook] CallCompleted missing call ID')
    return
  }

  // Find the user this call belongs to
  const ghlUserId = callData.userId
  const user = ghlUserId
    ? await db.user.findFirst({ where: { tenantId, ghlUserId } })
    : null

  // Find the property linked to this contact
  const property = callData.contactId
    ? await db.property.findFirst({
        where: { tenantId, ghlContactId: callData.contactId },
      })
    : null

  // Create the call record
  const call = await db.call.create({
    data: {
      tenantId,
      ghlCallId,
      assignedToId: user?.id,
      propertyId: property?.id,
      recordingUrl: callData.recordingUrl,
      direction: callData.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
      durationSeconds: callData.duration,
      calledAt: new Date(),
      gradingStatus: 'PENDING',
    },
  })

  // Fire-and-forget: grade the call asynchronously
  // We don't await this so the webhook returns fast
  gradeCall(call.id).catch((err) => {
    console.error(`[Call Grading] Failed to grade call ${call.id}:`, err)
  })

  await db.auditLog.create({
    data: {
      tenantId,
      action: 'call.received',
      resource: 'call',
      resourceId: call.id,
      source: 'GHL_WEBHOOK',
      severity: 'INFO',
      payload: { ghlCallId, userId: user?.id, propertyId: property?.id },
    },
  })
}

// ─── Opportunity Stage Changed → Maybe create property ─────────────────────

async function handleOpportunityStageChanged(tenantId: string, event: GHLWebhookEvent) {
  const oppData = event as {
    opportunityId?: string
    stageId?: string
    contactId?: string
    pipelineId?: string
    locationId: string
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { propertyPipelineId: true, propertyTriggerStage: true },
  })

  if (!tenant?.propertyTriggerStage) return

  // Check if this stage change matches the configured trigger
  const isPropertyTrigger =
    oppData.stageId === tenant.propertyTriggerStage &&
    (!tenant.propertyPipelineId || oppData.pipelineId === tenant.propertyPipelineId)

  if (!isPropertyTrigger) return

  // Create a property from this contact
  if (oppData.contactId) {
    await createPropertyFromContact(tenantId, oppData.contactId, {
      ghlPipelineId: oppData.pipelineId,
      ghlPipelineStage: oppData.stageId,
    })
  }
}

// ─── Task Completed → Sync to our DB ───────────────────────────────────────

async function handleTaskCompleted(tenantId: string, event: GHLWebhookEvent) {
  const taskData = event as { taskId?: string; id?: string }
  const ghlTaskId = taskData.taskId ?? taskData.id
  if (!ghlTaskId) return

  await db.task.updateMany({
    where: { tenantId, ghlTaskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })
}

// ─── Appointment Created → Log it ──────────────────────────────────────────

async function handleAppointmentCreated(tenantId: string, event: GHLWebhookEvent) {
  // Appointments are fetched live from GHL, not stored locally
  // Just log for now — future: push notification to assigned user
  await db.auditLog.create({
    data: {
      tenantId,
      action: 'appointment.created',
      resource: 'appointment',
      source: 'GHL_WEBHOOK',
      severity: 'INFO',
      payload: event as Record<string, unknown>,
    },
  })
}
