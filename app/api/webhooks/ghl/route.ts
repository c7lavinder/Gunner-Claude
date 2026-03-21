// app/api/webhooks/ghl/route.ts
// Receives all GHL webhook events
// Verifies signature, routes to handler

import { NextRequest, NextResponse } from 'next/server'
import { handleGHLWebhook } from '@/lib/ghl/webhooks'
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

    // Log every incoming webhook for debugging
    console.log(`[GHL Webhook] RECEIVED: type=${event.type}, keys=${Object.keys(event).join(',')}, body=${body.slice(0, 300)}`)

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
