// POST /api/ghl/reregister-webhook — update GHL webhook subscription with latest events
// Also called automatically by GET /api/health on first boot to ensure events are current
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export const GHL_WEBHOOK_EVENTS = [
  'InboundMessage', 'OutboundMessage', 'CallCompleted',
  'OpportunityStageChanged', 'OpportunityCreate',
  'ContactCreated', 'ContactUpdate', 'ContactDelete',
  'TaskCompleted', 'AppointmentCreated',
]

// Reusable function — can be called from health check or manually
export async function reregisterWebhookForTenant(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlWebhookId: true, ghlAccessToken: true },
  })
  if (!tenant?.ghlAccessToken) return null

  const ghl = await getGHLClient(tenantId)
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://gunner-ai-production.up.railway.app'
  const webhookUrl = `${baseUrl}/api/webhooks/ghl`

  // Delete old webhook if exists
  if (tenant.ghlWebhookId) {
    await ghl.deleteWebhook(tenant.ghlWebhookId).catch(() => {})
  }

  // Register new webhook with all events
  const webhook = await ghl.registerWebhook(webhookUrl, GHL_WEBHOOK_EVENTS)
  await db.tenant.update({
    where: { id: tenantId },
    data: { ghlWebhookId: webhook.id },
  })

  return webhook.id
}

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
