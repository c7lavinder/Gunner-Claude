/**
 * Loops.so Integration for Email Automation
 * 
 * This module handles all communication with Loops.so for:
 * - Adding contacts when users sign up
 * - Sending events to trigger email sequences
 * - Updating contact properties
 */

const LOOPS_API_URL = "https://app.loops.so/api/v1";
const LOOPS_API_KEY = process.env.LOOPS_API_KEY;

interface LoopsContact {
  email: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
  source?: string;
  subscribed?: boolean;
  userGroup?: string;
  // Custom properties for Gunner
  tenantId?: string;
  tenantName?: string;
  planType?: string;
  trialEndsAt?: string;
}

interface LoopsEvent {
  email?: string;
  userId?: string;
  eventName: string;
  eventProperties?: Record<string, string | number | boolean>;
}

async function loopsRequest(endpoint: string, method: string, body?: object) {
  // ⛔ ALL LOOPS API CALLS DISABLED — spam attack mitigation
  console.log(`[Loops] ⛔ DISABLED — would have called ${endpoint}`);
  return null;

  if (!LOOPS_API_KEY) {
    console.warn("[Loops] API key not configured, skipping request");
    return null;
  }

  try {
    const response = await fetch(`${LOOPS_API_URL}${endpoint}`, {
      method,
      headers: {
        "Authorization": `Bearer ${LOOPS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Loops] API error (${response.status}):`, errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[Loops] Request failed:", error);
    return null;
  }
}

/**
 * Create or update a contact in Loops
 * Called when a user signs up or their profile changes
 */
export async function createOrUpdateContact(contact: LoopsContact) {
  console.log(`[Loops] Creating/updating contact: ${contact.email}`);
  
  return loopsRequest("/contacts/create", "POST", {
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    userId: contact.userId,
    source: contact.source || "gunner_signup",
    subscribed: contact.subscribed ?? true,
    userGroup: contact.userGroup || "trial",
    // Custom properties
    tenantId: contact.tenantId,
    tenantName: contact.tenantName,
    planType: contact.planType,
    trialEndsAt: contact.trialEndsAt,
  });
}

/**
 * Send an event to Loops to trigger automations
 * Events can trigger specific email sequences based on user actions
 */
export async function sendEvent(event: LoopsEvent) {
  console.log(`[Loops] Sending event: ${event.eventName}`);
  
  return loopsRequest("/events/send", "POST", {
    email: event.email,
    userId: event.userId,
    eventName: event.eventName,
    eventProperties: event.eventProperties,
  });
}

/**
 * Update a contact's properties
 */
export async function updateContact(email: string, properties: Partial<LoopsContact>) {
  console.log(`[Loops] Updating contact: ${email}`);
  
  return loopsRequest("/contacts/update", "PUT", {
    email,
    ...properties,
  });
}

/**
 * Delete a contact from Loops
 */
export async function deleteContact(email: string) {
  console.log(`[Loops] Deleting contact: ${email}`);
  
  return loopsRequest("/contacts/delete", "POST", {
    email,
  });
}

// ============================================
// Gunner-specific event helpers
// ============================================

/**
 * Called when a new user signs up
 * Triggers the welcome email sequence in Loops
 */
export async function onUserSignup(user: {
  email: string;
  firstName?: string;
  lastName?: string;
  userId: string;
  tenantId?: string;
  tenantName?: string;
  trialEndsAt?: Date;
}) {
  await createOrUpdateContact({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    userId: user.userId,
    source: "gunner_signup",
    userGroup: "trial",
    tenantId: user.tenantId,
    tenantName: user.tenantName,
    trialEndsAt: user.trialEndsAt?.toISOString(),
  });
}

/**
 * Called when a user converts from trial to paid
 */
export async function onUserConverted(email: string, planType: string) {
  await updateContact(email, {
    userGroup: "paid",
    planType,
  });
  
  await sendEvent({
    email,
    eventName: "user_converted",
    eventProperties: {
      planType,
    },
  });
}

/**
 * Called when a user grades their first call
 */
export async function onFirstCallGraded(email: string) {
  await sendEvent({
    email,
    eventName: "first_call_graded",
  });
}

/**
 * Called when a user hasn't graded any calls after 48 hours
 */
export async function onNoCallsAfter48Hours(email: string) {
  await sendEvent({
    email,
    eventName: "no_calls_48h",
  });
}

/**
 * Called when a user grades 10+ calls in their first week (power user)
 */
export async function onPowerUser(email: string, callCount: number) {
  await sendEvent({
    email,
    eventName: "power_user",
    eventProperties: {
      callCount,
    },
  });
}

/**
 * Called when a user's trial is about to end (1 day left)
 */
export async function onTrialEndingSoon(email: string) {
  await sendEvent({
    email,
    eventName: "trial_ending_soon",
  });
}

/**
 * Called when a user's trial has ended
 */
export async function onTrialEnded(email: string) {
  await sendEvent({
    email,
    eventName: "trial_ended",
  });
}

/**
 * Called when a user cancels their subscription
 */
export async function onSubscriptionCancelled(email: string) {
  await updateContact(email, {
    userGroup: "churned",
  });
  
  await sendEvent({
    email,
    eventName: "subscription_cancelled",
  });
}

// ============================================
// Transactional Email IDs (from Loops.so dashboard)
// ============================================

export const TRANSACTIONAL_EMAIL_IDS = {
  DAY1_FIRST_CALL: "cml8sv6ga0f910iyk2wssbsro",
  DAY2_TRIAL_ENDING: "cml8unlpd0v4t0ivj5ti636og",
  PASSWORD_RESET: "cml8rnl030005018lu5bprcb7",
} as const;

// ============================================
// Transactional Email Sending
// ============================================

interface TransactionalEmailData {
  email: string;
  transactionalId: string;
  dataVariables?: Record<string, string | number>;
  addToAudience?: boolean;
}

/**
 * Send a transactional email via Loops API
 * Requires the transactional email to be created and published in Loops dashboard
 */
export async function sendTransactionalEmail(data: TransactionalEmailData) {
  console.log(`[Loops] Sending transactional email ${data.transactionalId} to ${data.email}`);
  
  return loopsRequest("/transactional", "POST", {
    email: data.email,
    transactionalId: data.transactionalId,
    dataVariables: data.dataVariables || {},
    addToAudience: data.addToAudience ?? false,
  });
}

/**
 * Send an email using template content directly (for emails not yet in Loops)
 * This uses the event system to trigger emails based on conditions
 */
export async function sendEmailByEvent(
  email: string,
  eventName: string,
  properties?: Record<string, string | number | boolean>
) {
  return sendEvent({
    email,
    eventName,
    eventProperties: properties,
  });
}
