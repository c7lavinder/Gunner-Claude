// app/api/webhooks/ghl/route.ts
// Receives GHL webhook events from:
// 1. Marketplace App webhooks (standard event format)
// 2. GHL Workflow automations (contact/call data format)
// Handles both payload formats and routes to appropriate handler

import { NextRequest, NextResponse } from 'next/server'
import { handleGHLWebhook } from '@/lib/ghl/webhooks'
import { db } from '@/lib/db/client'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    // Verify GHL webhook signature (skip if no real secret or workflow webhook)
    const signature = request.headers.get('x-ghl-signature') ?? ''
    const secret = process.env.GHL_WEBHOOK_SECRET ?? ''
    const hasRealSecret = secret && secret !== 'placeholder-will-set-later'

    if (hasRealSecret && signature && !verifySignature(body, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)

    // ── Detect payload format ──
    // Marketplace webhooks have: { type: "InboundMessage", locationId: "xxx", ... }
    // Workflow webhooks have: { contact_id: "xxx", location_id: "xxx", ... } or { type: "workflow", ... }
    // Normalize to standard format

    const normalized = normalizeWebhookPayload(event)

    // Find tenant
    const locationId = String(normalized.locationId ?? '')
    if (!locationId) {
      console.warn('[GHL Webhook] No locationId in payload:', JSON.stringify(event).slice(0, 300))
      return NextResponse.json({ received: true, warning: 'no locationId' }, { status: 200 })
    }

    const tenant = await db.tenant.findUnique({ where: { ghlLocationId: locationId }, select: { id: true, slug: true } })
    if (!tenant) {
      console.warn(`[GHL Webhook] No tenant for locationId: ${locationId}`)
      return NextResponse.json({ received: true, warning: 'unknown tenant' }, { status: 200 })
    }

    // Log every webhook for debugging
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'webhook.received',
        resource: 'webhook',
        source: 'GHL_WEBHOOK',
        severity: 'INFO',
        payload: JSON.parse(JSON.stringify({
          type: normalized.type,
          originalType: event.type,
          isWorkflowWebhook: normalized.isWorkflowWebhook,
          messageType: normalized.messageType,
          direction: normalized.direction,
          contactId: normalized.contactId,
          callStatus: normalized.callStatus,
          callDuration: normalized.callDuration,
          hasRecordingUrl: !!(normalized.recordingUrl),
          bodyPreview: body.slice(0, 800),
        })),
      },
    }).catch(() => {})

    console.log(`[GHL Webhook] ${normalized.type} | tenant=${tenant.slug} | workflow=${normalized.isWorkflowWebhook} | contact=${normalized.contactId} | callStatus=${normalized.callStatus ?? 'n/a'}`)

    // Process — return 200 immediately so GHL doesn't retry
    handleGHLWebhook({ type: String(normalized.type ?? 'unknown'), locationId: String(normalized.locationId ?? ''), ...normalized } as import('@/lib/ghl/webhooks').GHLWebhookEvent).catch((err) => {
      console.error('[GHL Webhook] Processing error:', err)
    })

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('[GHL Webhook] Parse error:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}

// ── Normalize different GHL webhook payload formats ──

function normalizeWebhookPayload(event: Record<string, unknown>): Record<string, unknown> & { isWorkflowWebhook: boolean } {
  // Standard Marketplace webhook — already has type + locationId
  if (event.type && event.locationId && typeof event.type === 'string' &&
      ['InboundMessage', 'OutboundMessage', 'CallCompleted', 'call.completed',
       'OpportunityStageChanged', 'OpportunityCreate', 'OpportunityUpdate',
       'ContactCreated', 'ContactUpdate', 'TaskCompleted', 'AppointmentCreated',
       'contact.created', 'contact.updated', 'opportunity.stageChanged', 'task.completed',
      ].includes(event.type as string)) {
    return { ...event, isWorkflowWebhook: false }
  }

  // GHL Workflow webhook — various formats
  // Common fields: contact_id, location_id, full_name, phone, email
  // Call-specific: call_status, call_duration, direction, recording_url

  const contactId = event.contact_id ?? event.contactId ?? (event.contact as Record<string, unknown>)?.id ?? null
  const locationId = event.location_id ?? event.locationId ?? (event.location as Record<string, unknown>)?.id ?? null

  // Detect if this is a call event from workflow
  const callStatus = event.call_status ?? event.callStatus ?? event.status ?? null
  const callDuration = Number(event.call_duration ?? event.callDuration ?? event.duration ?? 0)
  const direction = event.direction ?? event.call_direction ?? null
  const recordingUrl = event.recording_url ?? event.recordingUrl ?? null
  const hasCallData = !!(callStatus || callDuration > 0 || recordingUrl || direction)

  if (hasCallData) {
    // This is a call event from a workflow automation
    const callStatusStr = String(callStatus ?? '').toLowerCase()
    const isCompleted = ['completed', 'answered', 'connected', 'busy', 'no-answer', 'voicemail', 'failed', ''].includes(callStatusStr)

    return {
      type: isCompleted ? 'CallCompleted' : 'InboundMessage',
      locationId: String(locationId ?? ''),
      contactId: String(contactId ?? ''),
      callStatus: callStatusStr,
      callDuration,
      direction: String(direction ?? 'outbound'),
      recordingUrl: recordingUrl ? String(recordingUrl) : undefined,
      recording_url: recordingUrl ? String(recordingUrl) : undefined,
      // Pass through all original fields for the handler
      messageType: 'CALL',
      messageTypeId: 1,
      id: event.message_id ?? event.id ?? `wf_${Date.now()}`,
      userId: event.assigned_to ?? event.userId ?? null,
      fullName: event.full_name ?? event.contact_name ?? null,
      phone: event.phone ?? null,
      isWorkflowWebhook: true,
      _original: event,
    }
  }

  // Non-call workflow event (contact update, opportunity change, etc.)
  // Try to determine type from payload shape
  let eventType = String(event.type ?? event.event ?? event.workflow_trigger ?? 'unknown')

  if (event.opportunity_id || event.pipeline_id || event.stage_id) {
    eventType = 'OpportunityStageChanged'
  } else if (contactId && !hasCallData) {
    eventType = 'ContactUpdate'
  }

  return {
    ...event,
    type: eventType,
    locationId: String(locationId ?? ''),
    contactId: String(contactId ?? ''),
    isWorkflowWebhook: true,
  }
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
