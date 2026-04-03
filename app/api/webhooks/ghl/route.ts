// app/api/webhooks/ghl/route.ts
// Receives ALL GHL webhook events — Marketplace App OR Workflow Automations
// Accepts ANY payload format. Logs everything. Never rejects.

import { NextRequest, NextResponse } from 'next/server'
import { handleGHLWebhook, GHLWebhookEvent } from '@/lib/ghl/webhooks'
import { db } from '@/lib/db/client'

export async function POST(request: NextRequest) {
  let rawBody = ''
  try {
    rawBody = await request.text()
    const event = JSON.parse(rawBody)

    // Find tenant from ANY location field GHL might send
    const locObj = (event.location && typeof event.location === 'object') ? event.location as Record<string, unknown> : {}
    const locationId = String(
      event.locationId ?? event.location_id ?? locObj.id ??
      event.companyId ?? event.company_id ?? ''
    )

    // If no location in payload, try to find tenant from contactId
    let tenantId: string | null = null
    if (locationId) {
      const tenant = await db.tenant.findUnique({ where: { ghlLocationId: locationId }, select: { id: true } })
      tenantId = tenant?.id ?? null
    }
    if (!tenantId) {
      // Try finding tenant from any contact reference
      const ctObj = (event.contact && typeof event.contact === 'object') ? event.contact as Record<string, unknown> : {}
      const contactId = String(event.contactId ?? event.contact_id ?? ctObj.id ?? '')
      if (contactId) {
        const callWithTenant = await db.call.findFirst({ where: { ghlContactId: contactId }, select: { tenantId: true } })
        tenantId = callWithTenant?.tenantId ?? null
      }
    }
    if (!tenantId) {
      // Last resort — use first tenant (single-tenant for now)
      const firstTenant = await db.tenant.findFirst({ select: { id: true } })
      tenantId = firstTenant?.id ?? null
    }

    // Log EVERY webhook — raw payload preserved for debugging
    if (tenantId) {
      await db.auditLog.create({
        data: {
          tenantId,
          action: 'webhook.received',
          resource: 'webhook',
          source: 'GHL_WEBHOOK',
          severity: 'INFO',
          payload: JSON.parse(JSON.stringify({
            rawKeys: Object.keys(event),
            type: event.type,
            messageType: event.messageType,
            call_status: event.call_status ?? event.callStatus,
            direction: event.direction,
            contactId: event.contactId ?? event.contact_id,
            locationId,
            body: rawBody.slice(0, 1500),
          })),
        },
      }).catch(() => {})
    }

    // Normalize to standard format — handles ANY GHL payload shape
    const normalized = normalizeToEvent(event, locationId)

    console.log(`[Webhook] type=${normalized.type} | loc=${locationId} | contact=${normalized.contactId ?? 'none'} | callDuration=${normalized.callDuration ?? 'n/a'}`)

    // Process
    handleGHLWebhook(normalized).catch((err) => {
      console.error('[Webhook] Error:', err instanceof Error ? err.message : err)
    })

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('[Webhook] Parse error:', err, 'body:', rawBody.slice(0, 300))
    return NextResponse.json({ received: true }, { status: 200 }) // Always 200 so GHL doesn't retry
  }
}

// Also accept GET for webhook verification (some GHL configs send a verification GET)
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'ghl-webhook' })
}

// ── Accept ANY GHL payload and turn it into something our handler understands ──

function normalizeToEvent(raw: Record<string, unknown>, locationId: string): GHLWebhookEvent {
  // Already standard format
  if (raw.type && typeof raw.type === 'string' && raw.locationId) {
    return raw as unknown as GHLWebhookEvent
  }

  // Detect call data from ANY field combination
  const hasCallSignals = !!(
    raw.call_status ?? raw.callStatus ?? raw.call_duration ?? raw.callDuration ??
    raw.recording_url ?? raw.recordingUrl ??
    (raw.messageType && String(raw.messageType).toUpperCase() === 'CALL') ??
    (typeof raw.messageTypeId === 'number' && (raw.messageTypeId === 1 || raw.messageTypeId === 10))
  )

  const contactObj = (raw.contact && typeof raw.contact === 'object') ? raw.contact as Record<string, unknown> : {}
  const contactId = String(raw.contactId ?? raw.contact_id ?? contactObj.id ?? '')
  const direction = String(raw.direction ?? raw.call_direction ?? 'outbound')

  if (hasCallSignals) {
    return {
      type: 'CallCompleted',
      locationId,
      contactId,
      messageType: 'CALL',
      messageTypeId: 1,
      id: String(raw.id ?? raw.message_id ?? raw.messageId ?? raw.call_id ?? `wf_${Date.now()}`),
      callDuration: Number(raw.call_duration ?? raw.callDuration ?? raw.duration ?? 0),
      callStatus: String(raw.call_status ?? raw.callStatus ?? raw.status ?? 'completed'),
      direction,
      recordingUrl: raw.recording_url ?? raw.recordingUrl ?? undefined,
      recording_url: raw.recording_url ?? raw.recordingUrl ?? undefined,
      userId: raw.assigned_to ?? raw.userId ?? raw.user_id ?? undefined,
      fullName: raw.full_name ?? raw.contact_name ?? raw.name ?? undefined,
      phone: raw.phone ?? raw.contact_phone ?? undefined,
      attachments: raw.attachments ?? undefined,
      meta: raw.meta ?? undefined,
    } as unknown as GHLWebhookEvent
  }

  // Opportunity events
  if (raw.opportunity_id ?? raw.opportunityId ?? raw.pipeline_id ?? raw.pipelineId ?? raw.stage_id ?? raw.stageId) {
    return {
      type: String(raw.type ?? 'OpportunityStageChanged'),
      locationId,
      contactId,
      ...raw,
    } as unknown as GHLWebhookEvent
  }

  // Fallback — pass through with best-guess type
  return {
    type: String(raw.type ?? raw.event ?? raw.event_type ?? 'unknown'),
    locationId,
    contactId,
    ...raw,
  } as unknown as GHLWebhookEvent
}
