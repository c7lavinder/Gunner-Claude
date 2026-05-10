// lib/ghl/webhook-register.ts
// Bug #10 (Session 79): GHL Marketplace apps register webhooks at the
// **App level** in the GHL marketplace dashboard, not via per-location API
// calls. The previous `POST /locations/{id}/webhooks` path returned 404
// because that endpoint isn't exposed for marketplace-installed apps —
// every install was logging `webhook.register_failed` while real-time
// events still flowed (App-level webhooks deliver to a single global URL,
// which the OAuth Marketplace App config sends to /api/webhooks/ghl).
//
// This module now soft-deprecates per-tenant registration: the function
// stays callable so call sites (OAuth callback, /api/health, manual
// reregister route) compile and behave benignly, but it no longer thrashes
// against a 404 endpoint. The polling fallback in /api/cron/poll-calls
// remains the redundancy layer.
//
// Owner action: webhook URL is configured ONCE in the GHL Marketplace App
// dashboard. No per-tenant action needed.

export const GHL_WEBHOOK_EVENTS = [
  'InboundMessage', 'OutboundMessage', 'CallCompleted',
  'OpportunityStageChanged', 'OpportunityCreate',
  'ContactCreated', 'ContactUpdate', 'ContactDelete',
  'TaskCompleted', 'AppointmentCreated',
]

export async function reregisterWebhookForTenant(_tenantId: string): Promise<null> {
  // No-op. Webhooks are registered at the GHL Marketplace App level, not
  // per-tenant. See module header for context.
  return null
}
