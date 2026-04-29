// POST /api/ghl/reregister-webhook — update GHL webhook subscription
import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { reregisterWebhookForTenant, GHL_WEBHOOK_EVENTS } from '@/lib/ghl/webhook-register'

export const POST = withTenant(async (_req, ctx) => {
  try {
    const webhookId = await reregisterWebhookForTenant(ctx.tenantId)
    return NextResponse.json({ success: true, webhookId, events: GHL_WEBHOOK_EVENTS })
  } catch (err) {
    console.error('[GHL] Webhook re-registration failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
})
