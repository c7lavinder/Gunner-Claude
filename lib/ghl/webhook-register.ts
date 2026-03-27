// lib/ghl/webhook-register.ts
// Reusable webhook registration — called from route handler and health check
import { getGHLClient } from '@/lib/ghl/client'
import { db } from '@/lib/db/client'

export const GHL_WEBHOOK_EVENTS = [
  'InboundMessage', 'OutboundMessage', 'CallCompleted',
  'OpportunityStageChanged', 'OpportunityCreate',
  'ContactCreated', 'ContactUpdate', 'ContactDelete',
  'TaskCompleted', 'AppointmentCreated',
]

export async function reregisterWebhookForTenant(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { ghlWebhookId: true, ghlAccessToken: true },
  })
  if (!tenant?.ghlAccessToken) return null

  const ghl = await getGHLClient(tenantId)
  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://gunner-ai-production.up.railway.app'
  const webhookUrl = `${baseUrl}/api/webhooks/ghl`

  if (tenant.ghlWebhookId) {
    await ghl.deleteWebhook(tenant.ghlWebhookId).catch(() => {})
  }

  const webhook = await ghl.registerWebhook(webhookUrl, GHL_WEBHOOK_EVENTS)
  await db.tenant.update({
    where: { id: tenantId },
    data: { ghlWebhookId: webhook.id },
  })

  return webhook.id
}
