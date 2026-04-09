// app/api/webhooks/ghl/route.ts
// Receives ALL GHL webhook events — Marketplace App OR Workflow Automations
// Accepts ANY payload format. Logs everything. Never rejects.

import { NextRequest, NextResponse } from 'next/server'
import { handleGHLWebhook, GHLWebhookEvent } from '@/lib/ghl/webhooks'
import { db } from '@/lib/db/client'
import { logFailure } from '@/lib/audit'

export async function POST(request: NextRequest) {
  let rawBody = ''
  try {
    rawBody = await request.text()

    // ─── Signature verification (when GHL_WEBHOOK_SECRET is configured) ─────
    const secret = process.env.GHL_WEBHOOK_SECRET
    if (secret) {
      const signature =
        request.headers.get('x-ghl-signature') ??
        request.headers.get('x-wh-signature') ??
        request.headers.get('x-hub-signature-256') ??
        ''

      if (!signature) {
        console.warn('[Webhook] No signature header on incoming webhook — rejecting')
        return NextResponse.json({ received: true, verified: false, reason: 'no_signature' }, { status: 200 })
      }

      try {
        const crypto = await import('crypto')
        // Strip "sha256=" prefix if present (GitHub-style signing)
        const sigHex = signature.replace(/^sha256=/, '')
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

        const sigBuf = Buffer.from(sigHex, 'hex')
        const expBuf = Buffer.from(expected, 'hex')

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          console.warn(`[Webhook] Signature mismatch — rejecting. Got ${sigHex.slice(0, 16)}..., expected ${expected.slice(0, 16)}...`)
          // Return 200 so GHL doesn't retry-storm us, but DO NOT process
          return NextResponse.json({ received: true, verified: false, reason: 'signature_mismatch' }, { status: 200 })
        }
      } catch (err) {
        console.error('[Webhook] Signature verification error:', err instanceof Error ? err.message : err)
        return NextResponse.json({ received: true, verified: false, reason: 'verify_error' }, { status: 200 })
      }
    } else {
      // Secret not configured — accept but log warning so we know we're unverified
      console.warn('[Webhook] GHL_WEBHOOK_SECRET not set — accepting unverified webhook (set the env var to enable verification)')
    }

    const event = JSON.parse(rawBody)

    // ── Raw webhook log — every GHL webhook gets a row immediately ──────
    // Captures eventType + raw payload on arrival. Status updated after processing.
    const _rawEvent = event as Record<string, unknown>
    let webhookLogId: string | null = null
    try {
      const wl = await db.webhookLog.create({
        data: {
          eventType: String(
            _rawEvent.type ?? _rawEvent.event ?? _rawEvent.eventType ?? 'UNKNOWN'
          ),
          messageId: String(
            _rawEvent.messageId ?? _rawEvent.id ?? _rawEvent.altId ?? _rawEvent.callId ?? ''
          ) || null,
          locationId: String(
            _rawEvent.locationId ?? _rawEvent.location_id ??
            (_rawEvent.location && typeof _rawEvent.location === 'object'
              ? (_rawEvent.location as Record<string, unknown>).id
              : '') ??
            'UNKNOWN'
          ),
          rawPayload: JSON.parse(JSON.stringify(_rawEvent)),
          processed: false,
          status: 'processing',
        },
      })
      webhookLogId = wl.id
    } catch (err) {
      console.error('[Webhook] WebhookLog write failed:', err instanceof Error ? err.message : err)
    }
    // ── End webhook log ───────────────────────────────────────────────────

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
      console.warn(`[Webhook] No tenant resolved — locationId=${locationId} — dropping event type=${event.type ?? 'unknown'}`)
      return NextResponse.json({ received: true, dropped: 'no_tenant' }, { status: 200 })
    }

    // Log EVERY webhook — raw payload preserved for debugging
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
    }).catch(err => logFailure(tenantId, 'webhook.audit_log_write_failed', 'audit_log', err, { eventType: event.type, locationId }))

    // Normalize to standard format — handles ANY GHL payload shape
    const normalized = normalizeToEvent(event, locationId)

    console.log(`[Webhook] type=${normalized.type} | loc=${locationId} | contact=${normalized.contactId ?? 'none'} | callDuration=${normalized.callDuration ?? 'n/a'}`)

    // Process — outcome written to WebhookLog async (never blocks the response)
    handleGHLWebhook(normalized)
      .then(async () => {
        if (webhookLogId) {
          await db.webhookLog.update({
            where: { id: webhookLogId },
            data: { status: 'success', processed: true, processedAt: new Date() },
          }).catch(() => {}) // silent — never block on outcome write
        }
      })
      .catch(async (err) => {
        console.error('[Webhook] Processing failed:', err instanceof Error ? err.message : err)
        if (webhookLogId) {
          await db.webhookLog.update({
            where: { id: webhookLogId },
            data: {
              status: 'failed',
              processed: true,
              processedAt: new Date(),
              errorReason: err instanceof Error ? err.message : 'Unknown error',
            },
          }).catch(() => {}) // silent — never block on outcome write
        }
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
  // Extract customData (GHL workflow webhooks put call data here)
  const cd = (raw.customData && typeof raw.customData === 'object') ? raw.customData as Record<string, unknown> : {}
  const userObj = (raw.user && typeof raw.user === 'object') ? raw.user as Record<string, unknown> : {}

  // Already standard OAuth app format with type + locationId
  // BUT check if it's a call — even standard OutboundMessage can be a call
  if (raw.type && typeof raw.type === 'string' && raw.locationId) {
    const msgType = String(raw.messageType ?? '').toUpperCase()
    const typeId = typeof raw.messageTypeId === 'number' ? raw.messageTypeId : -1
    const isStandardCall = msgType === 'CALL' || typeId === 1 || typeId === 10

    if (isStandardCall) {
      // It's a call from OAuth app — enrich with any customData if available
      return {
        ...raw,
        type: 'CallCompleted', // Re-type so it routes to handleCallCompleted
        callDuration: Number(raw.callDuration ?? cd.callDuration ?? 0),
        callStatus: String(raw.callStatus ?? cd.callStatus ?? 'completed'),
      } as unknown as GHLWebhookEvent
    }

    // Non-call standard event — pass through
    return raw as unknown as GHLWebhookEvent
  }

  // Workflow automation payload — call data in customData or top-level
  const hasCallSignals = !!(
    raw.call_status ?? raw.callStatus ?? raw.call_duration ?? raw.callDuration ??
    cd.callStatus ?? cd.callDuration ?? cd.callDirection ??
    raw.recording_url ?? raw.recordingUrl ??
    (raw.messageType && String(raw.messageType).toUpperCase() === 'CALL') ??
    ((raw.message as Record<string, unknown>)?.type === 1) // workflow message.type=1 means call
  )

  const contactObj = (raw.contact && typeof raw.contact === 'object') ? raw.contact as Record<string, unknown> : {}
  const contactId = String(raw.contactId ?? raw.contact_id ?? contactObj.id ?? '')
  const direction = String(raw.direction ?? raw.call_direction ?? cd.callDirection ?? 'outbound')
  const duration = Number(cd.callDuration ?? raw.call_duration ?? raw.callDuration ?? raw.duration ?? 0)
  const userId = String(cd.callUserId ?? raw.assigned_to ?? raw.userId ?? raw.user_id ?? '')

  if (hasCallSignals) {
    return {
      type: 'CallCompleted',
      locationId,
      contactId,
      messageType: 'CALL',
      messageTypeId: 1,
      id: String(raw.id ?? raw.message_id ?? raw.messageId ?? cd.callSid ?? `wf_${Date.now()}`),
      callDuration: duration,
      callStatus: String(cd.callStatus ?? raw.call_status ?? raw.callStatus ?? raw.status ?? 'completed'),
      direction,
      recordingUrl: cd.recordingUrl ?? raw.recording_url ?? raw.recordingUrl ?? undefined,
      recording_url: cd.recordingUrl ?? raw.recording_url ?? raw.recordingUrl ?? undefined,
      userId: userId || undefined,
      fullName: raw.full_name ?? raw.contact_name ?? raw.name ?? undefined,
      phone: raw.phone ?? raw.contact_phone ?? cd.callTo ?? cd.callFrom ?? undefined,
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
