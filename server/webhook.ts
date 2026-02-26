/**
 * GHL Webhook Receiver
 * 
 * Handles all incoming GoHighLevel webhook events:
 * - InboundMessage / OutboundMessage (calls, SMS, etc.)
 * - OpportunityCreate / OpportunityStageUpdate / OpportunityStatusUpdate
 * - ContactCreate / ContactUpdate
 * 
 * Architecture:
 * 1. Verify RSA signature (x-wh-signature header)
 * 2. Route by event type
 * 3. Normalize into CRM-agnostic events (CallEvent, OpportunityEvent, etc.)
 * 4. Process asynchronously, respond 200 immediately
 */

import express, { Request, Response, Router } from "express";
import crypto from "crypto";
import { createCall, getTeamMemberByName, getTeamMemberByGhlUserId, getCallByGhlId, getDb } from "./db";
import { processCall } from "./grading";
import { getTenantsWithCrm, parseCrmConfig } from "./tenant";
import type { CallEvent, OpportunityEvent, ContactEvent } from "./crmEvents";
import { webhookEvents, contactCache, tenants } from "../drizzle/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import PQueue from "p-queue";

// Shared processing queue for webhook-triggered calls
const webhookProcessingQueue = new PQueue({ concurrency: 5 });

// ============ GHL RSA PUBLIC KEY ============

const GHL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

// ============ DEDUPLICATION ============

// In-memory dedup set with TTL (keeps last 10,000 webhook IDs for 1 hour)
const processedWebhookIds = new Map<string, number>(); // webhookId -> timestamp
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEDUP_MAX_SIZE = 10_000;

function isDuplicate(webhookId: string): boolean {
  if (!webhookId) return false;
  
  // Clean old entries periodically
  if (processedWebhookIds.size > DEDUP_MAX_SIZE) {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    const entries = Array.from(processedWebhookIds.entries());
    for (const [id, ts] of entries) {
      if (ts < cutoff) processedWebhookIds.delete(id);
    }
  }
  
  if (processedWebhookIds.has(webhookId)) return true;
  processedWebhookIds.set(webhookId, Date.now());
  return false;
}

// ============ SIGNATURE VERIFICATION ============

/**
 * Verify the GHL webhook signature using RSA SHA256.
 * The raw request body must be used (not parsed JSON).
 */
export function verifyGHLSignature(rawBody: Buffer | string, signature: string): boolean {
  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(GHL_PUBLIC_KEY, signature, "base64");
  } catch (error) {
    console.error("[Webhook] Signature verification error:", error);
    return false;
  }
}

// ============ TENANT RESOLUTION ============

// Cache tenant lookups by locationId (5-minute TTL)
const tenantCache = new Map<string, { tenantId: number; tenantName: string; expiry: number }>();
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveTenantByLocationId(locationId: string): Promise<{ tenantId: number; tenantName: string } | null> {
  // Check cache first
  const cached = tenantCache.get(locationId);
  if (cached && cached.expiry > Date.now()) {
    return { tenantId: cached.tenantId, tenantName: cached.tenantName };
  }

  try {
    // Layer 1: Check crmConfig (legacy API key tenants)
    const crmTenants = await getTenantsWithCrm();
    for (const t of crmTenants) {
      const config = parseCrmConfig(t);
      if (config.ghlLocationId === locationId) {
        const result = { tenantId: t.id, tenantName: t.name };
        tenantCache.set(locationId, { ...result, expiry: Date.now() + TENANT_CACHE_TTL_MS });
        return result;
      }
    }

    // Layer 2: Check OAuth tokens table (Marketplace app tenants)
    const { findTenantByOAuthLocation } = await import("./ghlOAuth");
    const oauthTenantId = await findTenantByOAuthLocation(locationId);
    if (oauthTenantId) {
      // Look up tenant name
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(oauthTenantId);
      const result = { tenantId: oauthTenantId, tenantName: tenant?.name || `Tenant ${oauthTenantId}` };
      tenantCache.set(locationId, { ...result, expiry: Date.now() + TENANT_CACHE_TTL_MS });
      return result;
    }
  } catch (e) {
    console.error("[Webhook] Failed to resolve tenant from locationId:", e);
  }

  return null;
}

// ============ GHL PAYLOAD NORMALIZATION ============

/**
 * Normalize a GHL InboundMessage/OutboundMessage webhook into a CallEvent.
 * Only processes messageType "CALL" — ignores SMS, chat, etc.
 */
function normalizeGHLCallEvent(payload: Record<string, any>, direction: "inbound" | "outbound"): CallEvent | null {
  // Only process call messages
  const messageType = payload.messageType || payload.message_type;
  if (messageType !== "CALL") return null;

  // Skip voicemails and missed calls (no recording to process)
  const status = payload.callStatus || payload.status || "completed";
  if (status === "voicemail" || status === "missed" || status === "no-answer") {
    console.log(`[Webhook] Skipping ${status} call: ${payload.messageId}`);
    return null;
  }

  // Extract recording URL from attachments array or direct field
  let recordingUrl: string | undefined;
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    recordingUrl = payload.attachments[0];
  } else {
    recordingUrl = payload.recordingUrl || payload.recording_url || payload.recordingURL;
  }

  const callEvent: CallEvent = {
    source: "ghl",
    sourceCallId: payload.messageId || payload.id || payload.callId,
    sourceLocationId: payload.locationId || payload.location_id,
    contactId: payload.contactId || payload.contact_id,
    contactPhone: direction === "inbound" ? payload.from : payload.to,
    recordingUrl,
    duration: typeof payload.callDuration === "number" ? payload.callDuration : 
              typeof payload.callDuration === "string" ? parseInt(payload.callDuration, 10) : undefined,
    direction,
    status: status === "completed" ? "completed" : status,
    crmUserId: payload.userId || payload.user_id,
    callTimestamp: payload.dateAdded ? new Date(payload.dateAdded) : new Date(),
    rawPayload: payload,
  };

  return callEvent;
}

/**
 * Normalize a GHL Opportunity webhook into an OpportunityEvent.
 */
function normalizeGHLOpportunityEvent(
  payload: Record<string, any>,
  eventType: string
): OpportunityEvent | null {
  const typeMap: Record<string, OpportunityEvent["eventType"]> = {
    "OpportunityCreate": "created",
    "OpportunityStageUpdate": "stage_updated",
    "OpportunityStatusUpdate": "status_updated",
    "OpportunityAssignedToUpdate": "assigned_updated",
    "OpportunityMonetaryValueUpdate": "value_updated",
    "OpportunityDelete": "deleted",
    "OpportunityUpdate": "stage_updated", // generic update, treat as stage update
  };

  const mappedType = typeMap[eventType];
  if (!mappedType) return null;

  const oppEvent: OpportunityEvent = {
    source: "ghl",
    eventType: mappedType,
    sourceOpportunityId: payload.id || payload.opportunityId,
    sourceLocationId: payload.locationId || payload.location_id,
    contactId: payload.contactId || payload.contact_id,
    contactName: payload.contactName || payload.contact_name,
    pipelineId: payload.pipelineId || payload.pipeline_id,
    pipelineName: payload.pipelineName || payload.pipeline_name,
    stageId: payload.pipelineStageId || payload.stageId || payload.stage_id,
    stageName: payload.pipelineStageName || payload.stageName || payload.stage_name,
    status: payload.status,
    monetaryValue: payload.monetaryValue ? Math.round(parseFloat(payload.monetaryValue) * 100) : undefined,
    assignedTo: payload.assignedTo || payload.assigned_to,
    eventTimestamp: payload.dateAdded ? new Date(payload.dateAdded) : new Date(),
    rawPayload: payload,
  };

  return oppEvent;
}

// ============ EVENT PROCESSORS ============

/**
 * Process a normalized CallEvent — create call record and queue for grading.
 */
async function processCallEvent(event: CallEvent): Promise<void> {
  const logPrefix = `[Webhook:Call:${event.source}]`;

  // Resolve tenant
  if (!event.tenantId && event.sourceLocationId) {
    const tenant = await resolveTenantByLocationId(event.sourceLocationId);
    if (tenant) {
      event.tenantId = tenant.tenantId;
      console.log(`${logPrefix} Resolved tenant ${tenant.tenantId} (${tenant.tenantName}) from locationId ${event.sourceLocationId}`);
    }
  }

  if (!event.tenantId) {
    console.error(`${logPrefix} Cannot process call without tenantId (locationId: ${event.sourceLocationId})`);
    return;
  }

  // Check if we already have this call
  const existingCall = await getCallByGhlId(event.sourceCallId);
  if (existingCall) {
    console.log(`${logPrefix} Call ${event.sourceCallId} already exists (id: ${existingCall.id}), skipping`);
    return;
  }

  // Skip calls without recording
  if (!event.recordingUrl) {
    console.log(`${logPrefix} No recording URL for call ${event.sourceCallId}, skipping`);
    return;
  }

  // Resolve team member
  let teamMemberId: number | undefined;
  let teamMemberName: string | undefined;
  let callType: "cold_call" | "qualification" | "follow_up" | "offer" | "seller_callback" | "admin_callback" = "qualification";

  // Try GHL User ID first
  if (event.crmUserId) {
    const teamMember = await getTeamMemberByGhlUserId(event.crmUserId);
    if (teamMember) {
      teamMemberId = teamMember.id;
      teamMemberName = teamMember.name;
      callType = teamMember.teamRole === "lead_generator" ? "cold_call" : "qualification";
      console.log(`${logPrefix} Matched team member by CRM user ID: ${teamMember.name}`);
    }
  }

  // Fall back to name matching
  if (!teamMemberId && event.teamMemberName) {
    const teamMember = await getTeamMemberByName(event.teamMemberName, event.tenantId);
    if (teamMember) {
      teamMemberId = teamMember.id;
      teamMemberName = teamMember.name;
      callType = teamMember.teamRole === "lead_generator" ? "cold_call" : "qualification";
      console.log(`${logPrefix} Matched team member by name: ${teamMember.name}`);
    }
  }

  // Create the call record
  const call = await createCall({
    ghlCallId: event.sourceCallId,
    ghlContactId: event.contactId,
    ghlLocationId: event.sourceLocationId,
    contactName: event.contactName,
    contactPhone: event.contactPhone,
    propertyAddress: event.propertyAddress,
    recordingUrl: event.recordingUrl,
    duration: event.duration,
    callDirection: event.direction,
    teamMemberId,
    teamMemberName,
    callType,
    status: "pending",
    callTimestamp: event.callTimestamp,
    tenantId: event.tenantId,
    callSource: event.source === "ghl" ? "ghl" : "ghl", // extend when adding other CRMs
  });

  if (!call) {
    console.error(`${logPrefix} Failed to create call record for ${event.sourceCallId}`);
    return;
  }

  console.log(`${logPrefix} Created call ${call.id} from ${event.source} call ${event.sourceCallId}`);

  // Queue for processing (transcription + grading)
  webhookProcessingQueue.add(() => processCall(call.id)).catch(err => {
    console.error(`${logPrefix} Error processing call ${call.id}:`, err);
  });
}

/**
 * Process a normalized OpportunityEvent — update local opportunity records.
 */
async function processOpportunityEvent(event: OpportunityEvent): Promise<void> {
  const logPrefix = `[Webhook:Opp:${event.source}]`;

  // Resolve tenant
  if (!event.tenantId && event.sourceLocationId) {
    const tenant = await resolveTenantByLocationId(event.sourceLocationId);
    if (tenant) {
      event.tenantId = tenant.tenantId;
    }
  }

  if (!event.tenantId) {
    console.error(`${logPrefix} Cannot process opportunity without tenantId`);
    return;
  }

  console.log(`${logPrefix} Processing ${event.eventType} for opportunity ${event.sourceOpportunityId} (tenant: ${event.tenantId})`);

  try {
    // Import the opportunity sync functions dynamically to avoid circular deps
    const { getDb } = await import("./db");
    const { opportunities } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;

    if (event.eventType === "deleted") {
      // Soft-delete or mark as lost
      await db.update(opportunities)
        .set({ status: "dismissed", dismissReason: "other", dismissNote: "Deleted in GHL" })
        .where(eq(opportunities.ghlOpportunityId, event.sourceOpportunityId));
      console.log(`${logPrefix} Marked opportunity ${event.sourceOpportunityId} as dismissed (deleted in GHL)`);
      return;
    }

    // Check if opportunity exists
    const [existing] = await db.select()
      .from(opportunities)
      .where(eq(opportunities.ghlOpportunityId, event.sourceOpportunityId));

    if (existing) {
      // Update existing opportunity
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (event.stageId) updateData.currentStageId = event.stageId;
      if (event.stageName) updateData.currentStageName = event.stageName;
      if (event.pipelineId) updateData.pipelineId = event.pipelineId;
      if (event.pipelineName) updateData.pipelineName = event.pipelineName;
      if (event.status) updateData.status = event.status;
      if (event.monetaryValue !== undefined) updateData.monetaryValue = event.monetaryValue;

      await db.update(opportunities)
        .set(updateData)
        .where(eq(opportunities.id, existing.id));
      console.log(`${logPrefix} Updated opportunity ${event.sourceOpportunityId} (stage: ${event.stageName || "unchanged"})`);
    } else if (event.eventType === "created") {
      // Create new opportunity record
      // Note: The opportunities table is designed for detected opportunities with required fields
      // For webhook-created opportunities, we store the GHL data for reference
      await db.insert(opportunities).values({
        tenantId: event.tenantId,
        ghlOpportunityId: event.sourceOpportunityId,
        ghlContactId: event.contactId || null,
        contactName: event.contactName || null,
        ghlPipelineStageId: event.stageId || null,
        ghlPipelineStageName: event.stageName || null,
        tier: "possible",
        priorityScore: 50,
        triggerRules: ["webhook_created"],
        reason: `Opportunity created via GHL webhook (pipeline: ${event.pipelineName || "unknown"})`,
        suggestion: "Review this opportunity in your CRM pipeline.",
        detectionSource: "pipeline",
        status: "active",
      });
      console.log(`${logPrefix} Created opportunity ${event.sourceOpportunityId}`);
    }
  } catch (error) {
    console.error(`${logPrefix} Error processing opportunity event:`, error);
  }
}

// ============ CONTACT EVENT NORMALIZATION ============

/**
 * Normalize a GHL Contact webhook into a ContactEvent.
 */
function normalizeGHLContactEvent(
  payload: Record<string, any>,
  eventType: string
): ContactEvent | null {
  const typeMap: Record<string, ContactEvent["eventType"]> = {
    "ContactCreate": "created",
    "ContactUpdate": "updated",
    "ContactDelete": "deleted",
    "ContactTagUpdate": "tag_updated",
  };

  const mappedType = typeMap[eventType];
  if (!mappedType) return null;

  const contactEvent: ContactEvent = {
    source: "ghl",
    eventType: mappedType,
    sourceContactId: payload.id || payload.contactId || payload.contact_id,
    sourceLocationId: payload.locationId || payload.location_id,
    firstName: payload.firstName || payload.first_name,
    lastName: payload.lastName || payload.last_name,
    email: payload.email,
    phone: payload.phone,
    tags: Array.isArray(payload.tags) ? payload.tags : undefined,
    eventTimestamp: payload.dateAdded ? new Date(payload.dateAdded) : new Date(),
    rawPayload: payload,
  };

  return contactEvent;
}

// ============ CONTACT EVENT PROCESSOR ============

/**
 * Process a normalized ContactEvent — upsert into the contact_cache table.
 */
async function processContactEvent(event: ContactEvent): Promise<void> {
  const logPrefix = `[Webhook:Contact:${event.source}]`;

  // Resolve tenant
  if (!event.tenantId && event.sourceLocationId) {
    const tenant = await resolveTenantByLocationId(event.sourceLocationId);
    if (tenant) {
      event.tenantId = tenant.tenantId;
    }
  }

  if (!event.tenantId) {
    console.error(`${logPrefix} Cannot process contact without tenantId`);
    return;
  }

  if (!event.sourceContactId) {
    console.error(`${logPrefix} Cannot process contact without sourceContactId`);
    return;
  }

  try {
    const db = await getDb();
    if (!db) return;

    if (event.eventType === "deleted") {
      // Remove from cache
      await db.delete(contactCache)
        .where(
          and(
            eq(contactCache.tenantId, event.tenantId),
            eq(contactCache.ghlContactId, event.sourceContactId)
          )
        );
      console.log(`${logPrefix} Removed contact ${event.sourceContactId} from cache`);
      return;
    }

    // Build full name
    const fullName = [event.firstName, event.lastName].filter(Boolean).join(" ") || null;

    // Check if contact exists in cache
    const [existing] = await db.select()
      .from(contactCache)
      .where(
        and(
          eq(contactCache.tenantId, event.tenantId),
          eq(contactCache.ghlContactId, event.sourceContactId)
        )
      );

    if (existing) {
      // Update existing contact
      const updateData: Record<string, any> = {
        lastSyncedAt: new Date(),
      };
      if (event.firstName !== undefined) updateData.firstName = event.firstName;
      if (event.lastName !== undefined) updateData.lastName = event.lastName;
      if (fullName) updateData.name = fullName;
      if (event.email !== undefined) updateData.email = event.email;
      if (event.phone !== undefined) updateData.phone = event.phone;
      if (event.tags) updateData.tags = JSON.stringify(event.tags);

      await db.update(contactCache)
        .set(updateData)
        .where(eq(contactCache.id, existing.id));
      console.log(`${logPrefix} Updated contact ${event.sourceContactId} in cache (${fullName || existing.name})`);
    } else {
      // Insert new contact
      await db.insert(contactCache).values({
        tenantId: event.tenantId,
        ghlContactId: event.sourceContactId,
        ghlLocationId: event.sourceLocationId || null,
        firstName: event.firstName || null,
        lastName: event.lastName || null,
        name: fullName,
        email: event.email || null,
        phone: event.phone || null,
        tags: event.tags ? JSON.stringify(event.tags) : null,
        lastSyncedAt: new Date(),
      });
      console.log(`${logPrefix} Added contact ${event.sourceContactId} to cache (${fullName || "unnamed"})`);
    }
  } catch (error) {
    console.error(`${logPrefix} Error processing contact event:`, error);
  }
}

// ============ WEBHOOK EVENT LOGGING ============

/**
 * Log a webhook event to the webhook_events table for health monitoring.
 */
async function logWebhookEvent(
  provider: string,
  eventType: string,
  locationId: string | undefined,
  tenantId: number | undefined,
  status: "received" | "processed" | "skipped" | "failed",
  errorMessage?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(webhookEvents).values({
      provider,
      eventType,
      locationId: locationId || null,
      tenantId: tenantId || null,
      status,
      errorMessage: errorMessage || null,
      processedAt: status !== "received" ? new Date() : null,
    });
  } catch (error) {
    // Don't let logging failures break webhook processing
    console.error("[Webhook] Failed to log webhook event:", error);
  }
}

// ============ WEBHOOK HEALTH QUERIES ============

/**
 * Get webhook health stats for a tenant (or all tenants).
 * Used by the Webhook Health widget in Settings.
 */
export async function getWebhookHealthStats(tenantId?: number) {
  try {
    const db = await getDb();
    if (!db) return null;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Build where condition
    const whereCondition = tenantId
      ? and(eq(webhookEvents.tenantId, tenantId))
      : undefined;

    // Last event received
    const [lastEvent] = await db.select({
      eventType: webhookEvents.eventType,
      provider: webhookEvents.provider,
      status: webhookEvents.status,
      createdAt: webhookEvents.createdAt,
    })
      .from(webhookEvents)
      .where(whereCondition)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(1);

    // Events in the last hour
    const hourCondition = tenantId
      ? and(eq(webhookEvents.tenantId, tenantId), gte(webhookEvents.createdAt, oneHourAgo))
      : gte(webhookEvents.createdAt, oneHourAgo);

    const [hourStats] = await db.select({
      total: sql<number>`count(*)`,
      processed: sql<number>`sum(case when ${webhookEvents.status} = 'processed' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${webhookEvents.status} = 'failed' then 1 else 0 end)`,
      skipped: sql<number>`sum(case when ${webhookEvents.status} = 'skipped' then 1 else 0 end)`,
    })
      .from(webhookEvents)
      .where(hourCondition);

    // Events in the last 24 hours
    const dayCondition = tenantId
      ? and(eq(webhookEvents.tenantId, tenantId), gte(webhookEvents.createdAt, twentyFourHoursAgo))
      : gte(webhookEvents.createdAt, twentyFourHoursAgo);

    const [dayStats] = await db.select({
      total: sql<number>`count(*)`,
      processed: sql<number>`sum(case when ${webhookEvents.status} = 'processed' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${webhookEvents.status} = 'failed' then 1 else 0 end)`,
    })
      .from(webhookEvents)
      .where(dayCondition);

    // Events by type in last 24 hours
    const eventsByType = await db.select({
      eventType: webhookEvents.eventType,
      count: sql<number>`count(*)`,
    })
      .from(webhookEvents)
      .where(dayCondition)
      .groupBy(webhookEvents.eventType)
      .orderBy(desc(sql`count(*)`));

    // Determine webhook status
    const isActive = lastEvent && (now.getTime() - new Date(lastEvent.createdAt).getTime()) < 2 * 60 * 60 * 1000; // Active if event in last 2 hours
    const isHealthy = hourStats && (hourStats.failed || 0) < (hourStats.total || 1) * 0.1; // Healthy if <10% failures

    return {
      status: !lastEvent ? "never_connected" : isActive ? (isHealthy ? "healthy" : "degraded") : "inactive",
      lastEvent: lastEvent ? {
        eventType: lastEvent.eventType,
        provider: lastEvent.provider,
        status: lastEvent.status,
        receivedAt: lastEvent.createdAt,
      } : null,
      lastHour: {
        total: hourStats?.total || 0,
        processed: hourStats?.processed || 0,
        failed: hourStats?.failed || 0,
        skipped: hourStats?.skipped || 0,
      },
      last24Hours: {
        total: dayStats?.total || 0,
        processed: dayStats?.processed || 0,
        failed: dayStats?.failed || 0,
      },
      eventsByType: eventsByType.map(e => ({ type: e.eventType, count: e.count })),
    };
  } catch (error) {
    console.error("[Webhook] Error getting health stats:", error);
    return null;
  }
}

/**
 * Search the contact cache for a contact by name, phone, or email.
 * Used as a fast alternative to GHL API search.
 */
export async function searchContactCache(
  tenantId: number,
  query: string
): Promise<Array<{ ghlContactId: string; name: string | null; phone: string | null; email: string | null }>> {
  try {
    const db = await getDb();
    if (!db) return [];

    const results = await db.select({
      ghlContactId: contactCache.ghlContactId,
      name: contactCache.name,
      phone: contactCache.phone,
      email: contactCache.email,
    })
      .from(contactCache)
      .where(
        and(
          eq(contactCache.tenantId, tenantId),
          sql`(${contactCache.name} LIKE ${`%${query}%`} OR ${contactCache.phone} LIKE ${`%${query}%`} OR ${contactCache.email} LIKE ${`%${query}%`})`
        )
      )
      .limit(10);

    return results;
  } catch (error) {
    console.error("[ContactCache] Search error:", error);
    return [];
  }
}

// ============ MAIN WEBHOOK HANDLER ============

/**
 * Create the Express router for GHL webhooks.
 * Uses express.raw() to capture the raw body for signature verification.
 */
export function createGHLWebhookRouter(): Router {
  const router = Router();

  // Use raw body parser for signature verification
  router.post(
    "/api/webhook/ghl",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const startTime = Date.now();

      try {
        // Get raw body for signature verification
        const rawBody = req.body as Buffer;
        const payload = JSON.parse(rawBody.toString());

        // Verify signature (if present)
        const signature = req.headers["x-wh-signature"] as string | undefined;
        if (signature) {
          const isValid = verifyGHLSignature(rawBody, signature);
          if (!isValid) {
            console.warn("[Webhook] Invalid GHL signature — rejecting");
            res.status(401).json({ error: "Invalid signature" });
            return;
          }
        } else {
          // Log warning but still process (some GHL setups don't send signatures)
          console.log("[Webhook] No x-wh-signature header — processing without verification");
        }

        // Extract event type and webhook ID
        const eventType: string = payload.type || "unknown";
        const webhookId: string = payload.webhookId || payload.messageId || payload.id || `${eventType}-${Date.now()}`;

        // Deduplication check
        if (isDuplicate(webhookId)) {
          console.log(`[Webhook] Duplicate webhook ${webhookId}, skipping`);
          res.status(200).json({ message: "Already processed" });
          return;
        }

        console.log(`[Webhook] Received GHL event: ${eventType} (webhookId: ${webhookId})`);

        // Respond immediately (GHL best practice: don't block)
        res.status(200).json({ success: true, webhookId });

        // Process asynchronously based on event type
        const locationId = payload.locationId || payload.location_id;
        setImmediate(async () => {
          let resolvedTenantId: number | undefined;
          try {
            // Resolve tenant for logging
            if (locationId) {
              const tenant = await resolveTenantByLocationId(locationId);
              if (tenant) resolvedTenantId = tenant.tenantId;
            }

            await routeGHLEvent(eventType, payload);
            console.log(`[Webhook] Processed ${eventType} in ${Date.now() - startTime}ms`);

            // Auto-detect webhook activity: mark tenant as webhook-active on first event
            if (resolvedTenantId) {
              await markTenantWebhookActive(resolvedTenantId);
            }

            // Log successful event
            await logWebhookEvent("ghl", eventType, locationId, resolvedTenantId, "processed");
          } catch (error) {
            console.error(`[Webhook] Async processing error for ${eventType}:`, error);
            await logWebhookEvent("ghl", eventType, locationId, resolvedTenantId, "failed", String(error));
          }
        });

      } catch (error) {
        console.error("[Webhook] Error handling GHL webhook:", error);
        // Still return 200 per GHL best practices (prevents retries)
        res.status(200).json({ success: false, error: "Processing failed" });
      }
    }
  );

  return router;
}

/**
 * Route a GHL webhook event to the appropriate handler.
 */
async function routeGHLEvent(eventType: string, payload: Record<string, any>): Promise<void> {
  switch (eventType) {
    // Call events (messages with messageType "CALL")
    case "InboundMessage": {
      const callEvent = normalizeGHLCallEvent(payload, "inbound");
      if (callEvent) {
        await processCallEvent(callEvent);
      } else {
        // Not a call message (SMS, chat, etc.) — ignore for now
        console.log(`[Webhook] InboundMessage is not a call (messageType: ${payload.messageType}), skipping`);
      }
      break;
    }

    case "OutboundMessage": {
      const callEvent = normalizeGHLCallEvent(payload, "outbound");
      if (callEvent) {
        await processCallEvent(callEvent);
      } else {
        console.log(`[Webhook] OutboundMessage is not a call (messageType: ${payload.messageType}), skipping`);
      }
      break;
    }

    // Opportunity events
    case "OpportunityCreate":
    case "OpportunityStageUpdate":
    case "OpportunityStatusUpdate":
    case "OpportunityAssignedToUpdate":
    case "OpportunityMonetaryValueUpdate":
    case "OpportunityDelete":
    case "OpportunityUpdate": {
      const oppEvent = normalizeGHLOpportunityEvent(payload, eventType);
      if (oppEvent) {
        await processOpportunityEvent(oppEvent);
      }
      break;
    }

    // Contact events
    case "ContactCreate":
    case "ContactUpdate":
    case "ContactDelete":
    case "ContactTagUpdate": {
      const contactEvent = normalizeGHLContactEvent(payload, eventType);
      if (contactEvent) {
        await processContactEvent(contactEvent);
      }
      break;
    }

    // Note events (future use)
    case "NoteCreate":
    case "NoteUpdate":
    case "NoteDelete":
      console.log(`[Webhook] Note event ${eventType} received — not yet handled`);
      break;

    default:
      console.log(`[Webhook] Unknown GHL event type: ${eventType}`);
  }
}

// ============ LEGACY HANDLER (kept for backwards compatibility) ============

/**
 * Legacy handler for direct POST to /api/webhook/ghl with JSON body.
 * This is the old handler that processes pre-parsed JSON payloads.
 * Used as fallback when the new router-based handler isn't active.
 */
export async function handleGHLWebhook(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body;
    console.log("[Webhook:Legacy] Received GHL webhook:", JSON.stringify(payload, null, 2));

    const eventType: string = payload.type || "unknown";
    const webhookId: string = payload.webhookId || payload.messageId || payload.id || `${eventType}-${Date.now()}`;

    // Deduplication
    if (isDuplicate(webhookId)) {
      res.status(200).json({ message: "Already processed" });
      return;
    }

    // Respond immediately
    res.status(200).json({ success: true, webhookId });

    // Process asynchronously
    setImmediate(async () => {
      try {
        await routeGHLEvent(eventType, payload);
      } catch (error) {
        console.error("[Webhook:Legacy] Async processing error:", error);
      }
    });

  } catch (error) {
    console.error("[Webhook:Legacy] Error handling webhook:", error);
    res.status(200).json({ success: false, error: "Processing failed" });
  }
}

// Re-export for backwards compatibility
export { verifyGHLSignature as verifyWebhookSignature };

// ============ AUTO-DETECT WEBHOOK ACTIVITY ============

// In-memory set of tenants we've already marked as active (avoid repeated DB writes)
const tenantsMarkedActive = new Set<number>();

/**
 * Mark a tenant as webhook-active when we receive their first webhook event.
 * This enables adaptive polling (longer fallback intervals for webhook-active tenants).
 */
async function markTenantWebhookActive(tenantId: number): Promise<void> {
  // Skip if already marked in this process lifetime
  if (tenantsMarkedActive.has(tenantId)) return;

  try {
    const db = await getDb();
    if (!db) return;

    await db.update(tenants)
      .set({
        webhookActive: "true",
        lastWebhookAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    tenantsMarkedActive.add(tenantId);
    console.log(`[Webhook] Tenant ${tenantId} marked as webhook-active`);
  } catch (error) {
    console.error(`[Webhook] Failed to mark tenant ${tenantId} as webhook-active:`, error);
  }
}

/**
 * Mark a tenant as webhook-active from OAuth callback.
 * Marketplace apps get automatic webhooks from GHL, so we mark them active immediately.
 * Exported for use by the OAuth callback route.
 */
export async function markTenantWebhookActiveFromOAuth(tenantId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.update(tenants)
      .set({
        webhookActive: "true",
        lastWebhookAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    tenantsMarkedActive.add(tenantId);
    console.log(`[Webhook] Tenant ${tenantId} marked as webhook-active (OAuth Marketplace app)`);
  } catch (error) {
    console.error(`[Webhook] Failed to mark tenant ${tenantId} as webhook-active from OAuth:`, error);
  }
}

/**
 * Check if a tenant has active webhooks.
 * Used by polling to decide whether to use 2-hour or 6-hour fallback interval.
 */
export async function isTenantWebhookActive(tenantId: number): Promise<boolean> {
  // Check in-memory first
  if (tenantsMarkedActive.has(tenantId)) return true;

  try {
    const db = await getDb();
    if (!db) return false;

    const [tenant] = await db.select({ webhookActive: tenants.webhookActive })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const isActive = tenant?.webhookActive === "true";
    if (isActive) tenantsMarkedActive.add(tenantId);
    return isActive;
  } catch {
    return false;
  }
}

// ============ BATCH CONTACT IMPORT ============

/**
 * Batch import all contacts from GHL for a tenant.
 * Called once after initial CRM connection to populate the local contact cache.
 * Pages through the GHL contacts API (100 per page) with rate limit awareness.
 */
export async function batchImportContacts(tenantId: number): Promise<{ imported: number; skipped: number; errors: number }> {
  const { ghlCircuitBreaker } = await import("./ghlRateLimiter");
  const { getCredentialsForTenant } = await import("./ghlActions");
  
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) {
    throw new Error(`Tenant ${tenantId} has no GHL credentials (OAuth or API key)`);
  }

  const apiKey = creds.apiKey;
  const locationId = creds.locationId;
  const GHL_API_BASE = "https://services.leadconnectorhq.com";

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let startAfterId: string | undefined;
  let page = 0;
  const MAX_PAGES = 100; // Safety limit: 100 pages * 100 contacts = 10,000 contacts max

  console.log(`[ContactImport] Starting batch import for tenant ${tenantId} (location: ${locationId})`);

  while (page < MAX_PAGES) {
    // Check circuit breaker — use normal priority so we don't starve user actions
    if (!ghlCircuitBreaker.canProceed("normal")) {
      console.log(`[ContactImport] Circuit breaker open, pausing batch import at page ${page}`);
      break;
    }

    try {
      ghlCircuitBreaker.recordRequest();
      
      let url = `${GHL_API_BASE}/contacts/?locationId=${locationId}&limit=100`;
      if (startAfterId) {
        url += `&startAfterId=${startAfterId}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Version": "2021-07-28",
          "Accept": "application/json",
        },
      });

      if (response.status === 429) {
        ghlCircuitBreaker.record429();
        console.log(`[ContactImport] Rate limited at page ${page}, stopping batch import`);
        break;
      }

      if (!response.ok) {
        errors++;
        console.error(`[ContactImport] GHL API error ${response.status} at page ${page}`);
        break;
      }

      ghlCircuitBreaker.recordSuccess();
      const data = await response.json() as any;
      const contacts = data.contacts || [];

      if (contacts.length === 0) {
        console.log(`[ContactImport] No more contacts at page ${page}, import complete`);
        break;
      }

      // Upsert contacts into local cache
      const db = await getDb();
      if (!db) break;

      for (const c of contacts) {
        try {
          const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || null;
          
          // Check if contact already exists
          const [existing] = await db.select({ id: contactCache.id })
            .from(contactCache)
            .where(
              and(
                eq(contactCache.tenantId, tenantId),
                eq(contactCache.ghlContactId, c.id)
              )
            )
            .limit(1);

          if (existing) {
            // Update existing
            await db.update(contactCache)
              .set({
                name: fullName,
                firstName: c.firstName || null,
                lastName: c.lastName || null,
                phone: c.phone || null,
                email: c.email || null,
                tags: c.tags ? JSON.stringify(c.tags) : null,
                lastSyncedAt: new Date(),
              })
              .where(eq(contactCache.id, existing.id));
            skipped++;
          } else {
            // Insert new
            await db.insert(contactCache).values({
              tenantId,
              ghlContactId: c.id,
              ghlLocationId: locationId,
              name: fullName,
              firstName: c.firstName || null,
              lastName: c.lastName || null,
              phone: c.phone || null,
              email: c.email || null,
              tags: c.tags ? JSON.stringify(c.tags) : null,
              lastSyncedAt: new Date(),
            });
            imported++;
          }
        } catch (err) {
          errors++;
          console.error(`[ContactImport] Error importing contact ${c.id}:`, err);
        }
      }

      console.log(`[ContactImport] Page ${page}: ${contacts.length} contacts (imported: ${imported}, updated: ${skipped})`);

      // Check for next page
      if (data.meta?.nextPageUrl || data.meta?.startAfterId) {
        startAfterId = data.meta.startAfterId || contacts[contacts.length - 1]?.id;
      } else if (contacts.length < 100) {
        // Less than full page means we've reached the end
        break;
      } else {
        // Use last contact ID as cursor
        startAfterId = contacts[contacts.length - 1]?.id;
      }

      page++;

      // Rate limit: wait 1.5 seconds between pages to stay under GHL limits
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      errors++;
      console.error(`[ContactImport] Error at page ${page}:`, error);
      break;
    }
  }

  // Mark tenant as having imported contacts
  try {
    const db = await getDb();
    if (db) {
      await db.update(tenants)
        .set({ contactCacheImported: "true" })
        .where(eq(tenants.id, tenantId));
    }
  } catch (err) {
    console.error(`[ContactImport] Failed to mark tenant ${tenantId} as imported:`, err);
  }

  console.log(`[ContactImport] Batch import complete for tenant ${tenantId}: imported=${imported}, updated=${skipped}, errors=${errors}`);
  return { imported, skipped, errors };
}

/**
 * Check if a tenant needs contact cache import and trigger it if needed.
 * Called after CRM connection is saved.
 */
export async function triggerContactImportIfNeeded(tenantId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [tenant] = await db.select({ contactCacheImported: tenants.contactCacheImported })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant?.contactCacheImported === "true") {
      console.log(`[ContactImport] Tenant ${tenantId} already has contacts imported, skipping`);
      return;
    }

    // Run import in background (don't block the CRM save)
    console.log(`[ContactImport] Triggering background batch import for tenant ${tenantId}`);
    batchImportContacts(tenantId).catch(err => {
      console.error(`[ContactImport] Background import failed for tenant ${tenantId}:`, err);
    });
  } catch (error) {
    console.error(`[ContactImport] Error checking import status for tenant ${tenantId}:`, error);
  }
}
