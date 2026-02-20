/**
 * Gunner Engine Webhook Integration
 * 
 * Sends graded call data to the Gunner Engine backend automation system.
 * The engine auto-generates structured lead summaries, tags contacts in GHL,
 * and determines next actions.
 * 
 * When ghlContactId is missing from the call record, attempts a GHL contact
 * lookup by phone number to populate the contactId field.
 */

interface CallGradedPayload {
  callId: string;
  contactId: string;
  teamMember: string;
  grade: string;
  score: number;
  transcript: string;
  coachingFeedback: string;
  callType: string;
  duration: number;
  propertyAddress?: string;
  phone: string;
  timestamp: string;
}

// Default webhook URL — used when tenant has no custom engineWebhookUrl in crmConfig
const DEFAULT_ENGINE_WEBHOOK_URL = "https://gunner-engine-production.up.railway.app/webhooks/gunner/call-graded";

/**
 * Get the webhook URL for a given tenant.
 * Returns tenant-specific URL from crmConfig.engineWebhookUrl, or the default.
 * Returns null if the tenant explicitly has no webhook configured and is not the platform owner.
 */
async function getWebhookUrl(tenantId: number): Promise<string | null> {
  try {
    const { getTenantById, parseCrmConfig } = await import("./tenant");
    const tenant = await getTenantById(tenantId);
    if (!tenant) return DEFAULT_ENGINE_WEBHOOK_URL;
    
    const config = parseCrmConfig(tenant);
    if (config.engineWebhookUrl) return config.engineWebhookUrl;
    
    // Only send to default URL for the platform owner's tenant (tenant 1)
    // Other tenants don't have the Gunner Engine backend, so skip
    if (tenantId === 1) return DEFAULT_ENGINE_WEBHOOK_URL;
    
    return null; // No webhook configured for this tenant
  } catch {
    return DEFAULT_ENGINE_WEBHOOK_URL;
  }
}

/**
 * Attempt to resolve a GHL contact ID by searching for the phone number.
 * Returns the contact ID if found, empty string otherwise.
 */
async function resolveGhlContactId(tenantId: number, phone: string): Promise<string> {
  if (!phone || !tenantId) return "";

  try {
    const { searchContacts } = await import("./ghlActions");
    const results = await searchContacts(tenantId, phone);
    if (results.length > 0) {
      console.log(`[Gunner Engine Webhook] Resolved GHL contact by phone ${phone}: ${results[0].id}`);
      return results[0].id;
    }
    console.log(`[Gunner Engine Webhook] No GHL contact found for phone ${phone}`);
    return "";
  } catch (error) {
    console.warn(`[Gunner Engine Webhook] GHL contact lookup failed for phone ${phone}:`, error);
    return "";
  }
}

export async function sendCallGradedWebhook(
  payload: CallGradedPayload,
  tenantId: number,
  callId: number
): Promise<boolean> {
  try {
    // Resolve the webhook URL for this tenant
    const webhookUrl = await getWebhookUrl(tenantId);
    if (!webhookUrl) {
      console.log(`[Gunner Engine Webhook] No webhook URL configured for tenant ${tenantId}, skipping`);
      return true; // Not an error — just no webhook configured
    }

    // If contactId is empty, attempt GHL contact lookup by phone
    if (!payload.contactId && payload.phone) {
      const resolvedId = await resolveGhlContactId(tenantId, payload.phone);
      if (resolvedId) {
        payload.contactId = resolvedId;

        // Also update the call record in the database so future lookups don't need this
        try {
          const { updateCall } = await import("./db");
          await updateCall(callId, { ghlContactId: resolvedId });
          console.log(`[Gunner Engine Webhook] Backfilled ghlContactId on call ${callId}`);
        } catch (dbError) {
          console.warn(`[Gunner Engine Webhook] Failed to backfill ghlContactId on call ${callId}:`, dbError);
          // Non-critical — continue sending the webhook
        }
      }
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[Gunner Engine Webhook] Failed to send: ${error}`);
      
      // Queue for retry
      const { queueFailedWebhook } = await import("./webhookRetryQueue");
      await queueFailedWebhook(tenantId, callId, payload as unknown as Record<string, unknown>, error);
      
      return false;
    }

    const result = await response.json();
    console.log(`[Gunner Engine Webhook] Success for call ${payload.callId} (contactId: ${payload.contactId || "none"}):`, result);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Gunner Engine Webhook] Error sending webhook for call ${payload.callId}:`, errorMsg);
    
    // Queue for retry
    const { queueFailedWebhook } = await import("./webhookRetryQueue");
    await queueFailedWebhook(tenantId, callId, payload as unknown as Record<string, unknown>, errorMsg);
    
    return false;
  }
}
