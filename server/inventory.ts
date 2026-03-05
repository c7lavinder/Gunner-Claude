/**
 * Dispo Inventory Module
 * Handles property management, sends tracking, offers, showings, and dispo KPIs
 */
import { getDb } from "./db";
import {
  dispoProperties,
  dispoPropertySends,
  dispoPropertyOffers,
  dispoPropertyShowings,
  dispoDailyKpis,
  propertyStageHistory,
  type InsertDispoProperty,
  type InsertDispoPropertySend,
  type InsertDispoPropertyOffer,
  type InsertDispoPropertyShowing,
} from "../drizzle/schema";
import { eq, and, desc, asc, sql, gte, lte, inArray } from "drizzle-orm";

// ─── DISPO KPI TARGETS ───
export const DISPO_TARGETS = {
  properties_sent: 5,
  showings_scheduled: 3,
  offers_received: 2,
  deals_assigned: 1,
  contracts_closed: 1,
};

// ─── PROPERTIES CRUD ───

export async function getProperties(tenantId: number, filters?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions = [eq(dispoProperties.tenantId, tenantId)];
  if (filters?.status && filters.status !== "all") {
    conditions.push(sql`${dispoProperties.status} = ${filters.status}`);
  }
  if (filters?.search) {
    const s = `%${filters.search}%`;
    conditions.push(sql`(${dispoProperties.address} LIKE ${s} OR ${dispoProperties.city} LIKE ${s} OR ${dispoProperties.sellerName} LIKE ${s})`);
  }

  const where = and(...conditions);
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const [items, countResult] = await Promise.all([
    db.select().from(dispoProperties).where(where).orderBy(desc(dispoProperties.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(dispoProperties).where(where),
  ]);

  // Enrich each property with activity counts
  const enriched = await Promise.all(items.map(async (p) => {
    const [sends] = await db.select({
      count: sql<number>`count(*)`,
      totalRecipients: sql<number>`COALESCE(SUM(${dispoPropertySends.recipientCount}), 0)`,
    }).from(dispoPropertySends).where(eq(dispoPropertySends.propertyId, p.id));

    const [offers] = await db.select({
      count: sql<number>`count(*)`,
      highestOffer: sql<number>`COALESCE(MAX(${dispoPropertyOffers.offerAmount}), 0)`,
    }).from(dispoPropertyOffers).where(eq(dispoPropertyOffers.propertyId, p.id));

    const [showings] = await db.select({
      count: sql<number>`count(*)`,
      upcoming: sql<number>`SUM(CASE WHEN ${dispoPropertyShowings.status} = 'scheduled' THEN 1 ELSE 0 END)`,
    }).from(dispoPropertyShowings).where(eq(dispoPropertyShowings.propertyId, p.id));

    return {
      ...p,
      _activity: {
        sendCount: Number(sends?.count || 0),
        totalRecipients: Number(sends?.totalRecipients || 0),
        offerCount: Number(offers?.count || 0),
        highestOffer: Number(offers?.highestOffer || 0),
        showingCount: Number(showings?.count || 0),
        upcomingShowings: Number(showings?.upcoming || 0),
      },
    };
  }));

  return { items: enriched, total: Number(countResult[0]?.count || 0) };
}

export async function getPropertyById(tenantId: number, propertyId: number) {
  const db = await getDb();
  if (!db) return null;

  const [property] = await db.select().from(dispoProperties)
    .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));

  if (!property) return null;

  // Get all sends, offers, showings
  const sends = await db.select().from(dispoPropertySends)
    .where(eq(dispoPropertySends.propertyId, propertyId))
    .orderBy(desc(dispoPropertySends.sentAt));

  const offers = await db.select().from(dispoPropertyOffers)
    .where(eq(dispoPropertyOffers.propertyId, propertyId))
    .orderBy(desc(dispoPropertyOffers.offeredAt));

  const showings = await db.select().from(dispoPropertyShowings)
    .where(eq(dispoPropertyShowings.propertyId, propertyId))
    .orderBy(desc(dispoPropertyShowings.showingDate));

  return { ...property, sends, offers, showings };
}

export async function createProperty(tenantId: number, userId: number, data: Omit<InsertDispoProperty, "id" | "tenantId" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(dispoProperties).values({
    ...data,
    tenantId,
  });

  return { id: result.insertId };
}

export async function updateProperty(tenantId: number, propertyId: number, data: Partial<InsertDispoProperty>, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Remove fields that shouldn't be updated
  const { id, tenantId: _, createdAt, ...updateData } = data as any;

  // If status is changing, log it in stage history and update milestone flags
  if (updateData.status) {
    const [existing] = await db.select({ status: dispoProperties.status })
      .from(dispoProperties)
      .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));

    if (existing && existing.status !== updateData.status) {
      // Log stage change
      await db.insert(propertyStageHistory).values({
        tenantId,
        propertyId,
        fromStatus: existing.status,
        toStatus: updateData.status,
        changedByUserId: userId || null,
        source: "manual",
      });

      // Update milestone flags (only set to true, never back to false)
      updateData.stageChangedAt = new Date();
      const s = updateData.status;
      const statusOrder = ["lead", "qualified", "offer_made", "under_contract", "marketing", "buyer_negotiating", "closing", "closed"];
      const idx = statusOrder.indexOf(s);
      if (idx >= 1) updateData.aptEverSet = true;
      if (idx >= 2) updateData.offerEverMade = true;
      if (idx >= 3) {
        updateData.everUnderContract = true;
        if (!updateData.underContractAt) updateData.underContractAt = new Date();
      }
      if (idx >= 7) {
        updateData.everClosed = true;
        if (!updateData.soldAt) updateData.soldAt = new Date();
      }
    }
  }

  await db.update(dispoProperties)
    .set(updateData)
    .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));

  return { success: true };
}

export async function deleteProperty(tenantId: number, propertyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete related records first
  await db.delete(dispoPropertySends).where(eq(dispoPropertySends.propertyId, propertyId));
  await db.delete(dispoPropertyOffers).where(eq(dispoPropertyOffers.propertyId, propertyId));
  await db.delete(dispoPropertyShowings).where(eq(dispoPropertyShowings.propertyId, propertyId));
  await db.delete(dispoProperties)
    .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));

  return { success: true };
}

// ─── SENDS TRACKING ───

export async function addPropertySend(tenantId: number, userId: number, data: {
  propertyId: number;
  channel: "sms" | "email" | "facebook" | "investor_base" | "other";
  buyerGroup?: string;
  recipientCount?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(dispoPropertySends).values({
    tenantId,
    propertyId: data.propertyId,
    channel: data.channel,
    buyerGroup: data.buyerGroup || null,
    recipientCount: data.recipientCount || 0,
    notes: data.notes || null,
    sentByUserId: userId,
  });

  // Update the property's marketedAt if not set (first time sending out)
  const [property] = await db.select({ marketedAt: dispoProperties.marketedAt, status: dispoProperties.status })
    .from(dispoProperties).where(eq(dispoProperties.id, data.propertyId));
  if (property && !property.marketedAt) {
    await db.update(dispoProperties)
      .set({ marketedAt: new Date(), status: "marketing" } as any)
      .where(eq(dispoProperties.id, data.propertyId));
  }

  return { id: result.insertId };
}

export async function getPropertySends(tenantId: number, propertyId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(dispoPropertySends)
    .where(and(eq(dispoPropertySends.propertyId, propertyId), eq(dispoPropertySends.tenantId, tenantId)))
    .orderBy(desc(dispoPropertySends.sentAt));
}

export async function deletePropertySend(tenantId: number, sendId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(dispoPropertySends)
    .where(and(eq(dispoPropertySends.id, sendId), eq(dispoPropertySends.tenantId, tenantId)));

  return { success: true };
}

// ─── OFFERS ───

export async function addPropertyOffer(tenantId: number, data: {
  propertyId: number;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerCompany?: string;
  ghlContactId?: string;
  offerAmount: number; // in cents
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(dispoPropertyOffers).values({
    tenantId,
    propertyId: data.propertyId,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone || null,
    buyerEmail: data.buyerEmail || null,
    buyerCompany: data.buyerCompany || null,
    ghlContactId: data.ghlContactId || null,
    offerAmount: data.offerAmount,
    notes: data.notes || null,
  });

  // Auto-update property status to negotiating if first offer
  const [property] = await db.select({ status: dispoProperties.status })
    .from(dispoProperties).where(eq(dispoProperties.id, data.propertyId));
  if (property && (property.status === "new" || property.status === "marketing")) {
    await db.update(dispoProperties)
      .set({ status: "negotiating" })
      .where(eq(dispoProperties.id, data.propertyId));
  }

  return { id: result.insertId };
}

export async function updateOfferStatus(tenantId: number, offerId: number, status: "pending" | "accepted" | "rejected" | "countered" | "expired", notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = { status, respondedAt: new Date() };
  if (notes !== undefined) updates.notes = notes;

  await db.update(dispoPropertyOffers)
    .set(updates)
    .where(and(eq(dispoPropertyOffers.id, offerId), eq(dispoPropertyOffers.tenantId, tenantId)));

  // If accepted, update property status to under_contract
  if (status === "accepted") {
    const [offer] = await db.select({ propertyId: dispoPropertyOffers.propertyId })
      .from(dispoPropertyOffers).where(eq(dispoPropertyOffers.id, offerId));
    if (offer) {
      await db.update(dispoProperties)
        .set({ status: "under_contract", underContractAt: new Date() })
        .where(eq(dispoProperties.id, offer.propertyId));
    }
  }

  return { success: true };
}

export async function deletePropertyOffer(tenantId: number, offerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(dispoPropertyOffers)
    .where(and(eq(dispoPropertyOffers.id, offerId), eq(dispoPropertyOffers.tenantId, tenantId)));

  return { success: true };
}

// ─── SHOWINGS ───

export async function addPropertyShowing(tenantId: number, data: {
  propertyId: number;
  buyerName: string;
  buyerPhone?: string;
  buyerCompany?: string;
  ghlContactId?: string;
  showingDate: string; // YYYY-MM-DD
  showingTime?: string; // HH:MM
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(dispoPropertyShowings).values({
    tenantId,
    propertyId: data.propertyId,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone || null,
    buyerCompany: data.buyerCompany || null,
    ghlContactId: data.ghlContactId || null,
    showingDate: data.showingDate,
    showingTime: data.showingTime || null,
    notes: data.notes || null,
  });

  return { id: result.insertId };
}

export async function updateShowing(tenantId: number, showingId: number, data: {
  status?: "scheduled" | "completed" | "cancelled" | "no_show";
  feedback?: string;
  interestLevel?: "hot" | "warm" | "cold" | "none";
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(dispoPropertyShowings)
    .set(data)
    .where(and(eq(dispoPropertyShowings.id, showingId), eq(dispoPropertyShowings.tenantId, tenantId)));

  return { success: true };
}

export async function deletePropertyShowing(tenantId: number, showingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(dispoPropertyShowings)
    .where(and(eq(dispoPropertyShowings.id, showingId), eq(dispoPropertyShowings.tenantId, tenantId)));

  return { success: true };
}

export async function getTodayShowings(tenantId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get today in Central time
  const now = new Date();
  const ctFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ctDateStr = ctFormatter.format(now);
  const [month, day, year] = ctDateStr.split("/").map(Number);
  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const showings = await db.select({
    showing: dispoPropertyShowings,
    propertyAddress: dispoProperties.address,
    propertyCity: dispoProperties.city,
    propertyState: dispoProperties.state,
  })
    .from(dispoPropertyShowings)
    .innerJoin(dispoProperties, eq(dispoPropertyShowings.propertyId, dispoProperties.id))
    .where(and(
      eq(dispoPropertyShowings.tenantId, tenantId),
      eq(dispoPropertyShowings.showingDate, todayStr),
    ))
    .orderBy(asc(dispoPropertyShowings.showingTime));

  return showings.map(s => ({
    ...s.showing,
    propertyAddress: s.propertyAddress,
    propertyCity: s.propertyCity,
    propertyState: s.propertyState,
  }));
}

// ─── DISPO KPI SUMMARY ───

export async function getDispoKpiSummary(tenantId: number, date: string) {
  const db = await getDb();
  if (!db) return {
    properties_sent: 0,
    showings_scheduled: 0,
    offers_received: 0,
    deals_assigned: 0,
    contracts_closed: 0,
    total_properties: 0,
    active_properties: 0,
  };

  try {
    // Auto-count from activity tables for the given date
    const dateStart = `${date} 00:00:00`;
    const dateEnd = `${date} 23:59:59`;

    // Properties sent today (count of sends logged today)
    const [sendsToday] = await db.select({
      count: sql<number>`count(DISTINCT ${dispoPropertySends.propertyId})`,
    }).from(dispoPropertySends)
      .where(and(
        eq(dispoPropertySends.tenantId, tenantId),
        gte(dispoPropertySends.sentAt, new Date(dateStart)),
        lte(dispoPropertySends.sentAt, new Date(dateEnd)),
      ));

    // Showings scheduled today
    const [showingsToday] = await db.select({
      count: sql<number>`count(*)`,
    }).from(dispoPropertyShowings)
      .where(and(
        eq(dispoPropertyShowings.tenantId, tenantId),
        eq(dispoPropertyShowings.showingDate, date),
      ));

    // Offers received today
    const [offersToday] = await db.select({
      count: sql<number>`count(*)`,
    }).from(dispoPropertyOffers)
      .where(and(
        eq(dispoPropertyOffers.tenantId, tenantId),
        gte(dispoPropertyOffers.offeredAt, new Date(dateStart)),
        lte(dispoPropertyOffers.offeredAt, new Date(dateEnd)),
      ));

    // Deals assigned today (properties moved to under_contract today)
    const [dealsToday] = await db.select({
      count: sql<number>`count(*)`,
    }).from(dispoProperties)
      .where(and(
        eq(dispoProperties.tenantId, tenantId),
        eq(dispoProperties.status, "under_contract"),
        gte(dispoProperties.underContractAt, new Date(dateStart)),
        lte(dispoProperties.underContractAt, new Date(dateEnd)),
      ));

    // Contracts closed today (properties moved to sold today)
    const [closedToday] = await db.select({
      count: sql<number>`count(*)`,
    }).from(dispoProperties)
      .where(and(
        eq(dispoProperties.tenantId, tenantId),
        eq(dispoProperties.status, "sold"),
        gte(dispoProperties.soldAt, new Date(dateStart)),
        lte(dispoProperties.soldAt, new Date(dateEnd)),
      ));

    // Total and active properties
    const [totalProps] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`SUM(CASE WHEN ${dispoProperties.status} != 'sold' THEN 1 ELSE 0 END)`,
    }).from(dispoProperties)
      .where(eq(dispoProperties.tenantId, tenantId));

    // Also check manual KPI entries
    let manualKpis: Record<string, number> = {};
    try {
      const manualEntries = await db.select().from(dispoDailyKpis)
        .where(and(
          eq(dispoDailyKpis.tenantId, tenantId),
          eq(dispoDailyKpis.date, date),
          eq(dispoDailyKpis.source, "manual"),
        ));
      for (const entry of manualEntries) {
        manualKpis[entry.kpiType] = (manualKpis[entry.kpiType] || 0) + entry.value;
      }
    } catch { /* best effort */ }

    return {
      properties_sent: Number(sendsToday?.count || 0) + (manualKpis.properties_sent || 0),
      showings_scheduled: Number(showingsToday?.count || 0) + (manualKpis.showings_scheduled || 0),
      offers_received: Number(offersToday?.count || 0) + (manualKpis.offers_received || 0),
      deals_assigned: Number(dealsToday?.count || 0) + (manualKpis.deals_assigned || 0),
      contracts_closed: Number(closedToday?.count || 0) + (manualKpis.contracts_closed || 0),
      total_properties: Number(totalProps?.total || 0),
      active_properties: Number(totalProps?.active || 0),
    };
  } catch (err) {
    console.error("[DispoKPI] Error computing KPI summary:", err);
    return {
      properties_sent: 0,
      showings_scheduled: 0,
      offers_received: 0,
      deals_assigned: 0,
      contracts_closed: 0,
      total_properties: 0,
      active_properties: 0,
    };
  }
}

// ─── KPI COLOR HELPER ───
export function getDispoKpiColor(value: number, target: number): "red" | "yellow" | "green" {
  if (target === 0) return value > 0 ? "green" : "red";
  const pct = value / target;
  if (pct >= 1) return "green";
  if (pct >= 0.5) return "yellow";
  return "red";
}


// ─── BUYER ACTIVITY MANAGEMENT ───

import {
  propertyBuyerActivity,
  propertyActivityLog,
  contactCache,
  type InsertPropertyBuyerActivity,
  type InsertPropertyActivityLog,
} from "../drizzle/schema";

export async function getBuyerActivities(tenantId: number, propertyId: number, filters?: {
  status?: string;
  isVip?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(propertyBuyerActivity.tenantId, tenantId),
    eq(propertyBuyerActivity.propertyId, propertyId),
  ];
  if (filters?.status && filters.status !== "all") {
    conditions.push(sql`${propertyBuyerActivity.status} = ${filters.status}`);
  }
  if (filters?.isVip) {
    conditions.push(sql`${propertyBuyerActivity.isVip} = 'true'`);
  }

  return db.select().from(propertyBuyerActivity)
    .where(and(...conditions))
    .orderBy(desc(propertyBuyerActivity.updatedAt));
}

export async function addBuyerActivity(tenantId: number, data: {
  propertyId: number;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerCompany?: string;
  ghlContactId?: string;
  buyerMarkets?: string[];
  buyerBudgetMin?: number;
  buyerBudgetMax?: number;
  buyerPropertyTypes?: string[];
  buyerStrategy?: string;
  isVip?: boolean;
  notes?: string;
}, performedByUserId?: number, performedByName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(propertyBuyerActivity).values({
    tenantId,
    propertyId: data.propertyId,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone || null,
    buyerEmail: data.buyerEmail || null,
    buyerCompany: data.buyerCompany || null,
    ghlContactId: data.ghlContactId || null,
    buyerMarkets: data.buyerMarkets ? JSON.stringify(data.buyerMarkets) : null,
    buyerBudgetMin: data.buyerBudgetMin || null,
    buyerBudgetMax: data.buyerBudgetMax || null,
    buyerPropertyTypes: data.buyerPropertyTypes ? JSON.stringify(data.buyerPropertyTypes) : null,
    buyerStrategy: data.buyerStrategy || null,
    isVip: data.isVip ? "true" : "false",
    notes: data.notes || null,
  });

  // Log the buyer match
  await logPropertyActivity(tenantId, data.propertyId, {
    eventType: "buyer_matched",
    title: `Buyer matched: ${data.buyerName}`,
    description: data.buyerCompany ? `${data.buyerName} (${data.buyerCompany})` : data.buyerName,
    buyerName: data.buyerName,
    buyerActivityId: result.insertId,
    performedByUserId,
    performedByName,
  });

  return { id: result.insertId };
}

export async function updateBuyerActivity(tenantId: number, buyerActivityId: number, data: {
  status?: "matched" | "sent" | "interested" | "offered" | "passed" | "accepted" | "skipped";
  isVip?: boolean;
  notes?: string;
  sendCount?: number;
  lastSentAt?: Date;
  lastSentChannel?: string;
  offerCount?: number;
  lastOfferAmount?: number;
  lastOfferAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updates: any = {};
  if (data.status !== undefined) updates.status = data.status;
  if (data.isVip !== undefined) updates.isVip = data.isVip ? "true" : "false";
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.sendCount !== undefined) updates.sendCount = data.sendCount;
  if (data.lastSentAt !== undefined) updates.lastSentAt = data.lastSentAt;
  if (data.lastSentChannel !== undefined) updates.lastSentChannel = data.lastSentChannel;
  if (data.offerCount !== undefined) updates.offerCount = data.offerCount;
  if (data.lastOfferAmount !== undefined) updates.lastOfferAmount = data.lastOfferAmount;
  if (data.lastOfferAt !== undefined) updates.lastOfferAt = data.lastOfferAt;

  await db.update(propertyBuyerActivity)
    .set(updates)
    .where(and(
      eq(propertyBuyerActivity.id, buyerActivityId),
      eq(propertyBuyerActivity.tenantId, tenantId),
    ));

  return { success: true };
}

export async function recordBuyerSend(tenantId: number, buyerActivityId: number, channel: string, performedByUserId?: number, performedByName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current buyer activity
  const [buyer] = await db.select().from(propertyBuyerActivity)
    .where(and(eq(propertyBuyerActivity.id, buyerActivityId), eq(propertyBuyerActivity.tenantId, tenantId)));
  if (!buyer) throw new Error("Buyer activity not found");

  await db.update(propertyBuyerActivity)
    .set({
      sendCount: buyer.sendCount + 1,
      lastSentAt: new Date(),
      lastSentChannel: channel,
      status: buyer.status === "matched" ? "sent" : buyer.status,
    })
    .where(eq(propertyBuyerActivity.id, buyerActivityId));

  // Log the send
  await logPropertyActivity(tenantId, buyer.propertyId, {
    eventType: "send",
    title: `Deal sent to ${buyer.buyerName} via ${channel}`,
    buyerName: buyer.buyerName,
    buyerActivityId,
    performedByUserId,
    performedByName,
  });

  return { success: true };
}

export async function recordBuyerOffer(tenantId: number, buyerActivityId: number, offerAmount: number, performedByUserId?: number, performedByName?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [buyer] = await db.select().from(propertyBuyerActivity)
    .where(and(eq(propertyBuyerActivity.id, buyerActivityId), eq(propertyBuyerActivity.tenantId, tenantId)));
  if (!buyer) throw new Error("Buyer activity not found");

  await db.update(propertyBuyerActivity)
    .set({
      offerCount: buyer.offerCount + 1,
      lastOfferAmount: offerAmount,
      lastOfferAt: new Date(),
      status: "offered",
    })
    .where(eq(propertyBuyerActivity.id, buyerActivityId));

  // Also add to the legacy offers table for backwards compat
  await db.insert(dispoPropertyOffers).values({
    tenantId,
    propertyId: buyer.propertyId,
    buyerName: buyer.buyerName,
    buyerPhone: buyer.buyerPhone,
    buyerEmail: buyer.buyerEmail,
    buyerCompany: buyer.buyerCompany,
    ghlContactId: buyer.ghlContactId,
    offerAmount,
  });

  // Log the offer
  await logPropertyActivity(tenantId, buyer.propertyId, {
    eventType: "offer_received",
    title: `Offer from ${buyer.buyerName}: $${(offerAmount / 100).toLocaleString()}`,
    buyerName: buyer.buyerName,
    buyerActivityId,
    metadata: JSON.stringify({ offerAmount }),
    performedByUserId,
    performedByName,
  });

  return { success: true };
}

export async function deleteBuyerActivity(tenantId: number, buyerActivityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(propertyBuyerActivity)
    .where(and(eq(propertyBuyerActivity.id, buyerActivityId), eq(propertyBuyerActivity.tenantId, tenantId)));

  return { success: true };
}

// ─── BUYER MATCHING FROM GHL CONTACTS ───

export async function matchBuyersForProperty(tenantId: number, propertyId: number) {
  const db = await getDb();
  if (!db) return { matched: 0, buyers: [] };

  // Get the property details
  const [property] = await db.select().from(dispoProperties)
    .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));
  if (!property) throw new Error("Property not found");

  // Search contact cache for buyers with matching tags
  // Look for contacts tagged as "buyer", "investor", "cash_buyer", etc.
  const buyerTags = ["buyer", "investor", "cash buyer", "cash_buyer", "wholesale buyer", "flipper", "builder"];
  const marketTag = property.market?.toLowerCase() || property.city?.toLowerCase() || "";

  // Query contacts that have buyer-related tags
  const contacts = await db.select().from(contactCache)
    .where(and(
      eq(contactCache.tenantId, tenantId),
      sql`(${contactCache.tags} IS NOT NULL AND (
        ${contactCache.tags} LIKE '%buyer%' OR
        ${contactCache.tags} LIKE '%investor%' OR
        ${contactCache.tags} LIKE '%cash%' OR
        ${contactCache.tags} LIKE '%flipper%' OR
        ${contactCache.tags} LIKE '%builder%' OR
        ${contactCache.tags} LIKE '%wholesale%'
      ))`,
    ))
    .limit(200);

  // Get existing buyer activities for this property to avoid duplicates
  const existingBuyers = await db.select({ ghlContactId: propertyBuyerActivity.ghlContactId })
    .from(propertyBuyerActivity)
    .where(and(
      eq(propertyBuyerActivity.propertyId, propertyId),
      eq(propertyBuyerActivity.tenantId, tenantId),
    ));
  const existingGhlIds = new Set(existingBuyers.map(b => b.ghlContactId).filter(Boolean));

  // Filter and match
  const newBuyers: Array<{
    buyerName: string;
    buyerPhone: string | null;
    buyerEmail: string | null;
    buyerCompany: string | null;
    ghlContactId: string;
    isVip: boolean;
    matchReason: string;
  }> = [];

  for (const contact of contacts) {
    if (existingGhlIds.has(contact.ghlContactId)) continue;

    const tags = (() => {
      try { return JSON.parse(contact.tags || "[]"); }
      catch { return []; }
    })();
    const tagStr = tags.map((t: string) => t.toLowerCase()).join(",");

    // Check market match
    const marketMatch = marketTag && tagStr.includes(marketTag);
    // Check VIP status
    const isVip = tagStr.includes("vip") || tagStr.includes("a-buyer") || tagStr.includes("top buyer");

    let matchReason = "Tagged as buyer";
    if (marketMatch) matchReason += ` + ${property.market || property.city} market`;
    if (isVip) matchReason += " (VIP)";

    newBuyers.push({
      buyerName: contact.name || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Unknown",
      buyerPhone: contact.phone,
      buyerEmail: contact.email,
      buyerCompany: contact.companyName,
      ghlContactId: contact.ghlContactId,
      isVip,
      matchReason,
    });
  }

  // Insert matched buyers
  let insertedCount = 0;
  for (const buyer of newBuyers) {
    try {
      await db.insert(propertyBuyerActivity).values({
        tenantId,
        propertyId,
        buyerName: buyer.buyerName,
        buyerPhone: buyer.buyerPhone,
        buyerEmail: buyer.buyerEmail,
        buyerCompany: buyer.buyerCompany,
        ghlContactId: buyer.ghlContactId,
        isVip: buyer.isVip ? "true" : "false",
        notes: buyer.matchReason,
      });
      insertedCount++;
    } catch (err) {
      console.warn(`[MatchBuyers] Failed to insert buyer ${buyer.buyerName}:`, err);
    }
  }

  if (insertedCount > 0) {
    await logPropertyActivity(tenantId, propertyId, {
      eventType: "buyer_matched",
      title: `${insertedCount} buyers auto-matched from CRM`,
      description: `Matched based on buyer tags and market preferences`,
      metadata: JSON.stringify({ matchedCount: insertedCount }),
    });
  }

  return { matched: insertedCount, buyers: newBuyers };
}

// ─── ACTIVITY LOG ───

export async function logPropertyActivity(tenantId: number, propertyId: number, data: {
  eventType: InsertPropertyActivityLog["eventType"];
  title: string;
  description?: string;
  buyerName?: string;
  buyerActivityId?: number;
  offerId?: number;
  showingId?: number;
  sendId?: number;
  callId?: number;
  metadata?: string;
  performedByUserId?: number;
  performedByName?: string;
}) {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(propertyActivityLog).values({
      tenantId,
      propertyId,
      ...data,
    });
  } catch (err) {
    console.error("[ActivityLog] Failed to log activity:", err);
  }
}

export async function getPropertyActivityLog(tenantId: number, propertyId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(propertyActivityLog)
    .where(and(
      eq(propertyActivityLog.tenantId, tenantId),
      eq(propertyActivityLog.propertyId, propertyId),
    ))
    .orderBy(desc(propertyActivityLog.createdAt))
    .limit(limit);
}

export async function getPropertyActivityStats(tenantId: number, propertyId: number) {
  const db = await getDb();
  if (!db) return { totalEvents: 0, sendCount: 0, offerCount: 0, showingCount: 0 };

  const [stats] = await db.select({
    totalEvents: sql<number>`count(*)`,
    sendCount: sql<number>`SUM(CASE WHEN ${propertyActivityLog.eventType} = 'send' THEN 1 ELSE 0 END)`,
    offerCount: sql<number>`SUM(CASE WHEN ${propertyActivityLog.eventType} IN ('offer_received', 'offer_accepted', 'offer_rejected') THEN 1 ELSE 0 END)`,
    showingCount: sql<number>`SUM(CASE WHEN ${propertyActivityLog.eventType} IN ('showing_scheduled', 'showing_completed') THEN 1 ELSE 0 END)`,
  }).from(propertyActivityLog)
    .where(and(
      eq(propertyActivityLog.tenantId, tenantId),
      eq(propertyActivityLog.propertyId, propertyId),
    ));

  return {
    totalEvents: Number(stats?.totalEvents || 0),
    sendCount: Number(stats?.sendCount || 0),
    offerCount: Number(stats?.offerCount || 0),
    showingCount: Number(stats?.showingCount || 0),
  };
}

// ─── ENHANCED PROPERTY DETAIL (with buyers + activity) ───

export async function getPropertyDetail(tenantId: number, propertyId: number) {
  const db = await getDb();
  if (!db) return null;

  const [property] = await db.select().from(dispoProperties)
    .where(and(eq(dispoProperties.id, propertyId), eq(dispoProperties.tenantId, tenantId)));
  if (!property) return null;

  const [sends, offers, showings, buyers, activityLog, activityStats] = await Promise.all([
    db.select().from(dispoPropertySends)
      .where(eq(dispoPropertySends.propertyId, propertyId))
      .orderBy(desc(dispoPropertySends.sentAt)),
    db.select().from(dispoPropertyOffers)
      .where(eq(dispoPropertyOffers.propertyId, propertyId))
      .orderBy(desc(dispoPropertyOffers.offeredAt)),
    db.select().from(dispoPropertyShowings)
      .where(eq(dispoPropertyShowings.propertyId, propertyId))
      .orderBy(desc(dispoPropertyShowings.showingDate)),
    db.select().from(propertyBuyerActivity)
      .where(and(eq(propertyBuyerActivity.propertyId, propertyId), eq(propertyBuyerActivity.tenantId, tenantId)))
      .orderBy(desc(propertyBuyerActivity.updatedAt)),
    db.select().from(propertyActivityLog)
      .where(and(eq(propertyActivityLog.propertyId, propertyId), eq(propertyActivityLog.tenantId, tenantId)))
      .orderBy(desc(propertyActivityLog.createdAt))
      .limit(50),
    getPropertyActivityStats(tenantId, propertyId),
  ]);

  // Calculate days on market
  const daysOnMarket = property.marketedAt
    ? Math.floor((Date.now() - new Date(property.marketedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    ...property,
    sends,
    offers,
    showings,
    buyers,
    activityLog,
    activityStats,
    daysOnMarket,
  };
}
