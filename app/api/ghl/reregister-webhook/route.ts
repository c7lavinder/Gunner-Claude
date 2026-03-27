// POST /api/ghl/reregister-webhook — update GHL webhook subscription with latest events
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

const GHL_WEBHOOK_EVENTS = [
  'InboundMessage', 'OutboundMessage', 'CallCompleted',
  'OpportunityStageChanged', 'OpportunityCreate',
  'ContactCreated', 'ContactUpdate', 'ContactDelete',
  'TaskCompleted', 'AppointmentCreated',
]

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { ghlWebhookId: true },
  })

  const ghl = await getGHLClient(session.tenantId)
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://gunner-ai-production.up.railway.app'
  const webhookUrl = `${baseUrl}/api/webhooks/ghl`

  try {
    // Delete old webhook if exists
    if (tenant?.ghlWebhookId) {
      await ghl.deleteWebhook(tenant.ghlWebhookId).catch(() => {})
    }

    // Register new webhook with all events
    const webhook = await ghl.registerWebhook(webhookUrl, GHL_WEBHOOK_EVENTS)
    await db.tenant.update({
      where: { id: session.tenantId },
      data: { ghlWebhookId: webhook.id },
    })

    return NextResponse.json({ success: true, webhookId: webhook.id, events: GHL_WEBHOOK_EVENTS })
  } catch (err) {
    console.error('[GHL] Webhook re-registration failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
