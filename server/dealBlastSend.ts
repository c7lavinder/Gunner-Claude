/**
 * Deal Blast GHL Send Service
 * 
 * Sends generated deal content (SMS and/or Email) directly through GHL
 * to matched buyers for a property, grouped by tier.
 * 
 * Uses the existing sendSms from ghlActions.ts and GHL conversations API for email.
 * Tracks send status per buyer and records activity.
 */

import { sendSms, ghlFetch, getCredentialsForTenant } from "./ghlActions";
import { getDb } from "./db";
import { propertyBuyerActivity, dealDistributions } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { recordBuyerSend } from "./inventory";

export type SendChannel = "sms" | "email" | "both";

export interface SendResult {
  buyerActivityId: number;
  buyerName: string;
  ghlContactId: string;
  smsSent: boolean;
  smsError?: string;
  smsMessageId?: string;
  emailSent: boolean;
  emailError?: string;
  emailMessageId?: string;
}

/**
 * Send an email through GHL conversations API.
 * GHL uses the conversations/messages endpoint with type "Email".
 */
async function sendGhlEmail(
  tenantId: number,
  contactId: string,
  subject: string,
  body: string,
): Promise<{ success: boolean; messageId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  // GHL conversations/messages endpoint supports Email type
  const emailBody: any = {
    type: "Email",
    contactId,
    subject,
    message: body, // Plain text email body
    html: body.replace(/\n/g, "<br>"), // Convert newlines to HTML breaks
  };

  try {
    const data = await ghlFetch(
      creds,
      `/conversations/messages`,
      "POST",
      emailBody
    );
    return { success: true, messageId: data.messageId || data.id };
  } catch (err: any) {
    console.error(`[DealBlast] Email send failed for contact ${contactId}:`, err.message);
    return { success: false };
  }
}

/**
 * Send deal blast content to all matched buyers of a specific tier for a property.
 * 
 * @param tenantId - The tenant ID
 * @param propertyId - The property ID
 * @param distributionId - The deal distribution ID (contains the content)
 * @param channel - Which channel(s) to send: "sms", "email", or "both"
 * @param userId - The user initiating the send (for activity logging)
 * @param userName - The user's name (for activity logging)
 */
export async function sendDealBlast(
  tenantId: number,
  propertyId: number,
  distributionId: number,
  channel: SendChannel,
  userId: number,
  userName: string,
): Promise<{ results: SendResult[]; sent: number; failed: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the distribution content
  const [distribution] = await db.select().from(dealDistributions)
    .where(and(
      eq(dealDistributions.id, distributionId),
      eq(dealDistributions.tenantId, tenantId),
    ));
  if (!distribution) throw new Error("Distribution not found");

  const tier = distribution.buyerTier;
  const smsContent = distribution.editedSmsContent || distribution.smsContent || "";
  const emailSubject = distribution.editedEmailSubject || distribution.emailSubject || "";
  const emailBody = distribution.editedEmailBody || distribution.emailBody || "";

  // Get all buyers for this property that match this tier and have a GHL contact ID
  const buyers = await db.select().from(propertyBuyerActivity)
    .where(and(
      eq(propertyBuyerActivity.tenantId, tenantId),
      eq(propertyBuyerActivity.propertyId, propertyId),
      eq(propertyBuyerActivity.buyerTier, tier),
      sql`${propertyBuyerActivity.ghlContactId} IS NOT NULL AND ${propertyBuyerActivity.ghlContactId} != ''`,
    ));

  // Also include buyers with no tier set (default to the distribution's tier for unmatched)
  // and buyers whose status is not "passed" or "skipped"
  const eligibleBuyers = buyers.filter(b => 
    b.status !== "passed" && b.status !== "skipped"
  );

  const results: SendResult[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const buyer of eligibleBuyers) {
    if (!buyer.ghlContactId) {
      skipped++;
      continue;
    }

    const result: SendResult = {
      buyerActivityId: buyer.id,
      buyerName: buyer.buyerName,
      ghlContactId: buyer.ghlContactId,
      smsSent: false,
      emailSent: false,
    };

    let anySent = false;

    // Send SMS
    if ((channel === "sms" || channel === "both") && smsContent) {
      try {
        const smsResult = await sendSms(tenantId, buyer.ghlContactId, smsContent);
        result.smsSent = smsResult.success;
        result.smsMessageId = smsResult.messageId;
        if (smsResult.success) anySent = true;
      } catch (err: any) {
        result.smsError = err.message || "SMS send failed";
        console.error(`[DealBlast] SMS failed for ${buyer.buyerName}:`, err.message);
      }
    }

    // Send Email
    if ((channel === "email" || channel === "both") && emailSubject && emailBody) {
      try {
        const emailResult = await sendGhlEmail(tenantId, buyer.ghlContactId, emailSubject, emailBody);
        result.emailSent = emailResult.success;
        result.emailMessageId = emailResult.messageId;
        if (emailResult.success) anySent = true;
      } catch (err: any) {
        result.emailError = err.message || "Email send failed";
        console.error(`[DealBlast] Email failed for ${buyer.buyerName}:`, err.message);
      }
    }

    // Record the send in buyer activity
    if (anySent) {
      try {
        const channelLabel = channel === "both" ? "sms+email" : channel;
        await recordBuyerSend(tenantId, buyer.id, channelLabel, userId, userName);
        sent++;
      } catch (err) {
        console.warn(`[DealBlast] Failed to record send for ${buyer.buyerName}:`, err);
        sent++; // Still count as sent even if logging fails
      }
    } else {
      failed++;
    }

    results.push(result);

    // Small delay between sends to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Update distribution status to "sent"
  await db.update(dealDistributions)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(dealDistributions.id, distributionId));

  return { results, sent, failed, skipped };
}

/**
 * Get buyer counts per tier for a property (for the UI to show how many buyers will receive each tier's blast).
 */
export async function getBuyerCountsByTier(
  tenantId: number,
  propertyId: number,
): Promise<Record<string, { total: number; withContact: number }>> {
  const db = await getDb();
  if (!db) return {};

  const buyers = await db.select({
    buyerTier: propertyBuyerActivity.buyerTier,
    ghlContactId: propertyBuyerActivity.ghlContactId,
    status: propertyBuyerActivity.status,
  })
    .from(propertyBuyerActivity)
    .where(and(
      eq(propertyBuyerActivity.tenantId, tenantId),
      eq(propertyBuyerActivity.propertyId, propertyId),
    ));

  const counts: Record<string, { total: number; withContact: number }> = {};
  for (const b of buyers) {
    const tier = b.buyerTier || "unqualified";
    if (b.status === "passed" || b.status === "skipped") continue;
    if (!counts[tier]) counts[tier] = { total: 0, withContact: 0 };
    counts[tier].total++;
    if (b.ghlContactId) counts[tier].withContact++;
  }

  return counts;
}
