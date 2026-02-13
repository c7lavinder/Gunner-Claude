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

const GUNNER_ENGINE_WEBHOOK_URL = "https://gunner-engine-production.up.railway.app/webhooks/gunner/call-graded";

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

    const response = await fetch(GUNNER_ENGINE_WEBHOOK_URL, {
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
