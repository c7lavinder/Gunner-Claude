/**
 * Buyer Auto-Tier Assignment
 * 
 * Automatically assigns buyer tiers based on:
 * - GHL custom field buyerTier (if set, takes priority)
 * - Contact cache data: verifiedFunding, hasPurchasedBefore, responseSpeed
 * - Historical activity: offer count, send count, acceptance history
 * - VIP flag from buyer activity
 * 
 * Tier Logic:
 * - Priority: Verified funding + purchased before, OR GHL tier = "Priority", OR VIP with high activity
 * - Qualified: Has purchased before OR verified funding OR good response speed, OR GHL tier = "Qualified"
 * - JV Partner: GHL tier = "JV Partner" (must be explicitly set — can't auto-detect partnership relationships)
 * - Unqualified: Default for new/unknown buyers
 * - Halted: GHL tier = "Halted" (must be explicitly set — manual decision to stop sending)
 */

import { getDb } from "./db";
import { propertyBuyerActivity, contactCache } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export type BuyerTier = "priority" | "qualified" | "jv_partner" | "unqualified" | "halted";

export interface TierAssignment {
  buyerActivityId: number;
  buyerName: string;
  previousTier: BuyerTier | null;
  newTier: BuyerTier;
  reason: string;
  changed: boolean;
}

interface BuyerScoreData {
  // From contact cache (GHL custom fields)
  ghlTier: string | null;
  verifiedFunding: boolean;
  hasPurchasedBefore: boolean;
  responseSpeed: string | null;
  // From buyer activity (historical)
  totalOffers: number;
  totalSends: number;
  totalResponses: number;
  hasAccepted: boolean;
  isVip: boolean;
}

/**
 * Score a buyer and determine their tier based on available data.
 */
export function determineTier(data: BuyerScoreData): { tier: BuyerTier; reason: string } {
  // 1. GHL custom field takes priority (explicit human decision)
  const ghlTier = (data.ghlTier || "").toLowerCase().trim();
  if (ghlTier === "halted") {
    return { tier: "halted", reason: "Manually halted in CRM" };
  }
  if (ghlTier === "jv partner" || ghlTier === "jv_partner") {
    return { tier: "jv_partner", reason: "JV Partner in CRM" };
  }
  if (ghlTier === "priority") {
    return { tier: "priority", reason: "Priority in CRM" };
  }
  if (ghlTier === "qualified") {
    return { tier: "qualified", reason: "Qualified in CRM" };
  }
  if (ghlTier === "unqualified") {
    return { tier: "unqualified", reason: "Unqualified in CRM" };
  }

  // 2. Auto-score based on data signals
  let score = 0;
  const reasons: string[] = [];

  // Verified funding is a strong signal
  if (data.verifiedFunding) {
    score += 30;
    reasons.push("verified funding");
  }

  // Has purchased before — proven buyer
  if (data.hasPurchasedBefore) {
    score += 25;
    reasons.push("purchased before");
  }

  // Response speed
  const speed = (data.responseSpeed || "").toLowerCase();
  if (speed === "lightning") {
    score += 20;
    reasons.push("lightning responder");
  } else if (speed === "same day" || speed === "same-day") {
    score += 12;
    reasons.push("same-day responder");
  } else if (speed === "slow") {
    score += 5;
    reasons.push("slow responder");
  }
  // "ghost" = 0 points

  // Historical activity
  if (data.hasAccepted) {
    score += 20;
    reasons.push("proven closer");
  }
  if (data.totalOffers >= 3) {
    score += 15;
    reasons.push(`${data.totalOffers} offers made`);
  } else if (data.totalOffers >= 1) {
    score += 8;
    reasons.push(`${data.totalOffers} offer(s) made`);
  }
  if (data.totalResponses >= 3) {
    score += 10;
    reasons.push("active responder");
  }

  // VIP flag
  if (data.isVip) {
    score += 15;
    reasons.push("VIP");
  }

  // 3. Map score to tier
  if (score >= 45) {
    return { tier: "priority", reason: reasons.join(" + ") };
  }
  if (score >= 20) {
    return { tier: "qualified", reason: reasons.join(" + ") };
  }

  return { tier: "unqualified", reason: reasons.length > 0 ? reasons.join(" + ") : "no qualifying signals" };
}

/**
 * Auto-assign tiers to all buyers matched to a specific property.
 * Returns the list of assignments with what changed.
 */
export async function autoAssignTiersForProperty(
  tenantId: number,
  propertyId: number,
): Promise<{ assignments: TierAssignment[]; changed: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all buyer activities for this property
  const buyers = await db.select().from(propertyBuyerActivity)
    .where(and(
      eq(propertyBuyerActivity.tenantId, tenantId),
      eq(propertyBuyerActivity.propertyId, propertyId),
    ));

  if (buyers.length === 0) {
    return { assignments: [], changed: 0, total: 0 };
  }

  // Get contact cache data for all buyers with GHL contact IDs
  const ghlContactIds = buyers
    .map(b => b.ghlContactId)
    .filter((id): id is string => !!id);

  let contactMap = new Map<string, typeof contactCache.$inferSelect>();
  if (ghlContactIds.length > 0) {
    const contacts = await db.select().from(contactCache)
      .where(and(
        eq(contactCache.tenantId, tenantId),
        sql`${contactCache.ghlContactId} IN (${sql.join(ghlContactIds.map(id => sql`${id}`), sql`, `)})`,
      ));
    for (const c of contacts) {
      contactMap.set(c.ghlContactId, c);
    }
  }

  // Get cross-property activity totals for each buyer
  const allActivity = await db.select({
    ghlContactId: propertyBuyerActivity.ghlContactId,
    offerCount: propertyBuyerActivity.offerCount,
    sendCount: propertyBuyerActivity.sendCount,
    responseCount: propertyBuyerActivity.responseCount,
    status: propertyBuyerActivity.status,
    isVip: propertyBuyerActivity.isVip,
  })
    .from(propertyBuyerActivity)
    .where(eq(propertyBuyerActivity.tenantId, tenantId));

  // Aggregate activity by ghlContactId
  const activityMap = new Map<string, { totalOffers: number; totalSends: number; totalResponses: number; hasAccepted: boolean; isVip: boolean }>();
  for (const a of allActivity) {
    if (!a.ghlContactId) continue;
    const existing = activityMap.get(a.ghlContactId) || { totalOffers: 0, totalSends: 0, totalResponses: 0, hasAccepted: false, isVip: false };
    existing.totalOffers += a.offerCount || 0;
    existing.totalSends += a.sendCount || 0;
    existing.totalResponses += a.responseCount || 0;
    if (a.status === "accepted") existing.hasAccepted = true;
    if (a.isVip === "true") existing.isVip = true;
    activityMap.set(a.ghlContactId, existing);
  }

  // Score and assign tiers
  const assignments: TierAssignment[] = [];
  let changedCount = 0;

  for (const buyer of buyers) {
    const contact = buyer.ghlContactId ? contactMap.get(buyer.ghlContactId) : null;
    const activity = buyer.ghlContactId ? activityMap.get(buyer.ghlContactId) : null;

    const scoreData: BuyerScoreData = {
      ghlTier: contact?.buyerTier || null,
      verifiedFunding: contact?.verifiedFunding === "true",
      hasPurchasedBefore: contact?.hasPurchasedBefore === "true",
      responseSpeed: contact?.responseSpeed || null,
      totalOffers: activity?.totalOffers || 0,
      totalSends: activity?.totalSends || 0,
      totalResponses: activity?.totalResponses || 0,
      hasAccepted: activity?.hasAccepted || false,
      isVip: activity?.isVip || buyer.isVip === "true",
    };

    const { tier, reason } = determineTier(scoreData);
    const previousTier = (buyer.buyerTier as BuyerTier) || null;
    const changed = previousTier !== tier;

    if (changed) {
      await db.update(propertyBuyerActivity)
        .set({ buyerTier: tier })
        .where(eq(propertyBuyerActivity.id, buyer.id));
      changedCount++;
    }

    assignments.push({
      buyerActivityId: buyer.id,
      buyerName: buyer.buyerName,
      previousTier,
      newTier: tier,
      reason,
      changed,
    });
  }

  return { assignments, changed: changedCount, total: buyers.length };
}
