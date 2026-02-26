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
import { createCall, getTeamMemberByName, getTeamMemberByGhlUserId, getCallByGhlId } from "./db";
import { processCall } from "./grading";
import { getTenantsWithCrm, parseCrmConfig } from "./tenant";
import type { CallEvent, OpportunityEvent } from "./crmEvents";
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
    const crmTenants = await getTenantsWithCrm();
    for (const t of crmTenants) {
      const config = parseCrmConfig(t);
      if (config.ghlLocationId === locationId) {
        const result = { tenantId: t.id, tenantName: t.name };
        tenantCache.set(locationId, { ...result, expiry: Date.now() + TENANT_CACHE_TTL_MS });
        return result;
      }
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
        setImmediate(async () => {
          try {
            await routeGHLEvent(eventType, payload);
            console.log(`[Webhook] Processed ${eventType} in ${Date.now() - startTime}ms`);
          } catch (error) {
            console.error(`[Webhook] Async processing error for ${eventType}:`, error);
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

    // Contact events (future use — log for now)
    case "ContactCreate":
    case "ContactUpdate":
    case "ContactDelete":
    case "ContactTagUpdate":
      console.log(`[Webhook] Contact event ${eventType} received — not yet handled`);
      break;

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
