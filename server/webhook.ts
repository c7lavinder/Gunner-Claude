import { Request, Response } from "express";
import { createCall, getTeamMemberByName, getTeamMemberByGhlUserId, getCallByGhlId } from "./db";
import { processCall } from "./grading";
import { getTenantsWithCrm, parseCrmConfig } from "./tenant";
import PQueue from "p-queue";

// Shared processing queue for webhook-triggered calls
const webhookProcessingQueue = new PQueue({ concurrency: 5 });

/**
 * Webhook payload from GoHighLevel when a call ends
 * The exact structure may vary - this handles common fields
 */
interface GHLCallWebhookPayload {
  // Call identifiers
  id?: string;
  callId?: string;
  call_id?: string;
  
  // Location/account
  locationId?: string;
  location_id?: string;
  
  // Contact info
  contactId?: string;
  contact_id?: string;
  contactName?: string;
  contact_name?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  phone?: string;
  contactPhone?: string;
  contact_phone?: string;
  
  // Call details
  recordingUrl?: string;
  recording_url?: string;
  recordingURL?: string;
  duration?: number | string;
  callDuration?: number | string;
  call_duration?: number | string;
  direction?: string;
  callDirection?: string;
  call_direction?: string;
  
  // User/team member who handled the call
  userId?: string;
  user_id?: string;
  userName?: string;
  user_name?: string;
  assignedTo?: string;
  assigned_to?: string;
  
  // Property info (if available in custom fields)
  propertyAddress?: string;
  property_address?: string;
  address?: string;
  
  // Timestamps
  timestamp?: string;
  createdAt?: string;
  created_at?: string;
  dateAdded?: string;
  date_added?: string;
}

/**
 * Extract a value from the payload, checking multiple possible field names
 */
function extractField<T>(payload: GHLCallWebhookPayload, ...fields: (keyof GHLCallWebhookPayload)[]): T | undefined {
  for (const field of fields) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== "") {
      return value as T;
    }
  }
  return undefined;
}

/**
 * Handle incoming webhook from GoHighLevel
 */
export async function handleGHLWebhook(req: Request, res: Response): Promise<void> {
  try {
    const payload: GHLCallWebhookPayload = req.body;
    
    console.log("[Webhook] Received GHL webhook:", JSON.stringify(payload, null, 2));

    // Extract call ID
    const ghlCallId = extractField<string>(payload, "id", "callId", "call_id");
    if (!ghlCallId) {
      console.warn("[Webhook] No call ID in payload");
      res.status(400).json({ error: "Missing call ID" });
      return;
    }

    // Check if we already processed this call
    const existingCall = await getCallByGhlId(ghlCallId);
    if (existingCall) {
      console.log(`[Webhook] Call ${ghlCallId} already exists, skipping`);
      res.status(200).json({ message: "Call already processed", callId: existingCall.id });
      return;
    }

    // Extract recording URL
    const recordingUrl = extractField<string>(payload, "recordingUrl", "recording_url", "recordingURL");
    if (!recordingUrl) {
      console.warn("[Webhook] No recording URL in payload");
      res.status(400).json({ error: "Missing recording URL" });
      return;
    }

    // Extract other fields
    const ghlContactId = extractField<string>(payload, "contactId", "contact_id");
    const ghlLocationId = extractField<string>(payload, "locationId", "location_id");
    
    // Build contact name
    const firstName = extractField<string>(payload, "firstName", "first_name");
    const lastName = extractField<string>(payload, "lastName", "last_name");
    const contactName = extractField<string>(payload, "contactName", "contact_name") 
      || (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName);
    
    const contactPhone = extractField<string>(payload, "phone", "contactPhone", "contact_phone");
    const propertyAddress = extractField<string>(payload, "propertyAddress", "property_address", "address");
    
    // Parse duration
    const durationRaw = extractField<number | string>(payload, "duration", "callDuration", "call_duration");
    const duration = typeof durationRaw === "string" ? parseInt(durationRaw, 10) : durationRaw;
    
    // Call direction
    const directionRaw = extractField<string>(payload, "direction", "callDirection", "call_direction");
    const callDirection = directionRaw?.toLowerCase() === "inbound" ? "inbound" : "outbound";
    
    // Team member identification - try GHL User ID first, then fall back to name
    const ghlUserId = extractField<string>(payload, "userId", "user_id", "assignedTo", "assigned_to");
    const teamMemberName = extractField<string>(payload, "userName", "user_name");
    let teamMemberId: number | undefined;
    let resolvedTeamMemberName: string | undefined = teamMemberName;
    let callType: "cold_call" | "qualification" | "follow_up" | "offer" | "seller_callback" | "admin_callback" = "qualification";
    let tenantId: number | null = null;
    
    // First try to match by GHL User ID
    if (ghlUserId) {
      const teamMember = await getTeamMemberByGhlUserId(ghlUserId);
      if (teamMember) {
        teamMemberId = teamMember.id;
        resolvedTeamMemberName = teamMember.name;
        callType = teamMember.teamRole === "acquisition_manager" ? "offer" : teamMember.teamRole === "lead_generator" ? "cold_call" : "qualification";
        tenantId = teamMember.tenantId;
        console.log(`[Webhook] Matched team member by GHL User ID: ${teamMember.name} (${ghlUserId})`);
      }
    }
    
    // If we still don't have a tenantId, try to resolve from GHL locationId
    if (!tenantId && ghlLocationId) {
      try {
        const crmTenants = await getTenantsWithCrm();
        for (const t of crmTenants) {
          const config = parseCrmConfig(t);
          if (config.ghlLocationId === ghlLocationId) {
            tenantId = t.id;
            console.log(`[Webhook] Resolved tenant ${t.id} (${t.name}) from GHL locationId ${ghlLocationId}`);
            break;
          }
        }
      } catch (e) {
        console.error(`[Webhook] Failed to resolve tenant from locationId:`, e);
      }
    }

    // Fall back to name matching if GHL User ID didn't match — now scoped to tenant
    if (!teamMemberId && teamMemberName) {
      const teamMember = await getTeamMemberByName(teamMemberName, tenantId ?? undefined);
      if (teamMember) {
        teamMemberId = teamMember.id;
        callType = teamMember.teamRole === "acquisition_manager" ? "offer" : teamMember.teamRole === "lead_generator" ? "cold_call" : "qualification";
        if (!tenantId) tenantId = teamMember.tenantId;
        console.log(`[Webhook] Matched team member by name: ${teamMember.name} (tenant: ${tenantId})`);
      }
    }

    // Parse timestamp
    const timestampRaw = extractField<string>(payload, "timestamp", "createdAt", "created_at", "dateAdded", "date_added");
    const callTimestamp = timestampRaw ? new Date(timestampRaw) : new Date();

    // Ensure we have a tenantId before creating the call
    if (!tenantId) {
      console.error("[Webhook] Cannot create call without tenantId");
      res.status(400).json({ error: "Could not determine tenant for this call" });
      return;
    }

    // Create the call record with tenantId from team member
    const call = await createCall({
      ghlCallId,
      ghlContactId,
      ghlLocationId,
      contactName,
      contactPhone,
      propertyAddress,
      recordingUrl,
      duration,
      callDirection,
      teamMemberId,
      teamMemberName: resolvedTeamMemberName,
      callType,
      status: "pending",
      callTimestamp,
      tenantId, // Inherit tenantId from team member
    });

    if (!call) {
      console.error("[Webhook] Failed to create call record");
      res.status(500).json({ error: "Failed to create call record" });
      return;
    }

    console.log(`[Webhook] Created call ${call.id} from GHL call ${ghlCallId}`);

    // Process the call via concurrency-limited queue
    webhookProcessingQueue.add(() => processCall(call.id)).catch(err => {
      console.error(`[Webhook] Error processing call ${call.id}:`, err);
    });

    res.status(200).json({ 
      message: "Call received and queued for processing",
      callId: call.id,
      ghlCallId,
    });

  } catch (error) {
    console.error("[Webhook] Error handling webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Verify webhook signature (if GHL provides one)
 * This is a placeholder - implement based on GHL's actual signature method
 */
export function verifyWebhookSignature(req: Request): boolean {
  // GHL may send a signature header - implement verification if needed
  // For now, we accept all webhooks
  return true;
}
