// POST /api/ghl/reregister-webhook — update GHL webhook subscription
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { reregisterWebhookForTenant, GHL_WEBHOOK_EVENTS } from '@/lib/ghl/webhook-register'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const webhookId = await reregisterWebhookForTenant(session.tenantId)
    return NextResponse.json({ success: true, webhookId, events: GHL_WEBHOOK_EVENTS })
  } catch (err) {
    console.error('[GHL] Webhook re-registration failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
