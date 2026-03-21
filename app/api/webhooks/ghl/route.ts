// app/api/webhooks/ghl/route.ts
// Receives all GHL webhook events
// Verifies signature, routes to handler

import { NextRequest, NextResponse } from 'next/server'
import { handleGHLWebhook } from '@/lib/ghl/webhooks'
import { db } from '@/lib/db/client'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    // Verify GHL webhook signature (skip if no real secret configured)
    const signature = request.headers.get('x-ghl-signature') ?? ''
    const secret = process.env.GHL_WEBHOOK_SECRET ?? ''
    const hasRealSecret = secret && secret !== 'placeholder-will-set-later'

    if (hasRealSecret && signature && !verifySignature(body, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)

    // Log every webhook to audit_logs so we can debug without Railway logs
    const locationId = event.locationId ?? 'unknown'
    const tenant = await db.tenant.findUnique({ where: { ghlLocationId: locationId }, select: { id: true } })
    if (tenant) {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'webhook.received',
          resource: 'webhook',
          source: 'GHL_WEBHOOK',
          severity: 'INFO',
          payload: {
            type: event.type,
            messageType: event.messageType,
            direction: event.direction,
            contactId: event.contactId,
            hasAttachments: !!(event.attachments?.length),
            hasRecordingUrl: !!(event.recordingUrl || event.recording_url),
            bodyPreview: body.slice(0, 500),
          },
        },
      }).catch(() => {}) // non-blocking
    }

    // Process async — return 200 immediately so GHL doesn't retry
    handleGHLWebhook(event).catch((err) => {
      console.error('[GHL Webhook] Processing error:', err)
    })

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('[GHL Webhook] Parse error:', err)
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
