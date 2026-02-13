/**
 * Gunner Engine Webhook Integration
 * 
 * Sends graded call data to the Gunner Engine backend automation system.
 * The engine auto-generates structured lead summaries, tags contacts in GHL,
 * and determines next actions.
 */

interface CallGradedPayload {
  callId: string;
  contactId?: string;
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

export async function sendCallGradedWebhook(payload: CallGradedPayload): Promise<boolean> {
  try {
    const response = await fetch(GUNNER_ENGINE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Gunner Engine Webhook] Failed to send: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log(`[Gunner Engine Webhook] Success for call ${payload.callId}:`, result);
    return true;
  } catch (error) {
    console.error(`[Gunner Engine Webhook] Error sending webhook for call ${payload.callId}:`, error);
    return false;
  }
}
