/**
 * GoHighLevel API Service
 * Handles fetching calls from GHL and syncing them to the local database
 */

import { ENV } from "./_core/env";
import { createCall, getTeamMembers, updateCall, getCallById, getCallByGhlId } from "./db";
import { processCall } from "./grading";

// GHL API Configuration
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_LOCATION_ID = "hmD7eWGQJE7EVFpJxj4q";
const GHL_API_KEY = "e8791cd3-d905-4fe9-993a-bd7bdea7eae7";

interface GHLCall {
  id: string;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  direction: "inbound" | "outbound";
  status: string;
  duration: number;
  recordingUrl?: string;
  userId?: string;
  userName?: string;
  dateAdded: string;
  dateUpdated?: string;
}

interface GHLCallsResponse {
  calls: GHLCall[];
  meta?: {
    total: number;
    currentPage: number;
    nextPage?: number;
  };
}

// Store last poll timestamp in memory (could be persisted to DB for production)
let lastPollTimestamp: Date | null = null;
let isPolling = false;
let pollInterval: NodeJS.Timeout | null = null;

/**
 * Fetch calls from GoHighLevel API
 */
export async function fetchGHLCalls(params: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<GHLCall[]> {
  const { startDate, endDate, limit = 100 } = params;

  const url = new URL(`${GHL_API_BASE}/conversations/calls`);
  url.searchParams.set("locationId", GHL_LOCATION_ID);
  url.searchParams.set("limit", limit.toString());
  
  if (startDate) {
    url.searchParams.set("startDate", startDate.toISOString());
  }
  if (endDate) {
    url.searchParams.set("endDate", endDate.toISOString());
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${GHL_API_KEY}`,
        "Version": "2021-07-28",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GHL] API error: ${response.status} - ${errorText}`);
      throw new Error(`GHL API error: ${response.status}`);
    }

    const data: GHLCallsResponse = await response.json();
    return data.calls || [];
  } catch (error) {
    console.error("[GHL] Error fetching calls:", error);
    throw error;
  }
}

/**
 * Match a GHL user ID to a team member
 */
async function matchTeamMember(ghlUserId?: string, userName?: string): Promise<{ id: number; name: string; role: string } | null> {
  if (!ghlUserId && !userName) return null;

  const teamMembers = await getTeamMembers();
  
  // First try to match by GHL User ID
  if (ghlUserId) {
    const byId = teamMembers.find(m => m.ghlUserId === ghlUserId);
    if (byId) return { id: byId.id, name: byId.name, role: byId.teamRole || "lead_manager" };
  }

  // Fall back to name matching
  if (userName) {
    const byName = teamMembers.find(m => 
      m.name.toLowerCase().includes(userName.toLowerCase()) ||
      userName.toLowerCase().includes(m.name.toLowerCase())
    );
    if (byName) return { id: byName.id, name: byName.name, role: byName.teamRole || "lead_manager" };
  }

  return null;
}

/**
 * Sync a single GHL call to the local database
 */
async function syncGHLCall(ghlCall: GHLCall): Promise<{ success: boolean; callId?: number; skipped?: boolean; reason?: string }> {
  // Skip calls without recordings
  if (!ghlCall.recordingUrl) {
    return { success: true, skipped: true, reason: "No recording URL" };
  }

  // Check if call already exists
  const existingCall = await getCallByGhlId(ghlCall.id);
  if (existingCall) {
    return { success: true, skipped: true, reason: "Call already synced" };
  }

  // Match team member
  const teamMember = await matchTeamMember(ghlCall.userId, ghlCall.userName);
  if (!teamMember) {
    console.log(`[GHL] Could not match team member for call ${ghlCall.id} (userId: ${ghlCall.userId}, userName: ${ghlCall.userName})`);
    return { success: true, skipped: true, reason: "Could not match team member" };
  }

  try {
    // Create the call record
    const call = await createCall({
      ghlCallId: ghlCall.id,
      contactName: ghlCall.contactName,
      contactPhone: ghlCall.contactPhone,
      recordingUrl: ghlCall.recordingUrl,
      duration: ghlCall.duration,
      callDirection: ghlCall.direction || "outbound", // Store inbound/outbound direction
      teamMemberId: teamMember.id,
      teamMemberName: teamMember.name,
      callType: teamMember.role === "acquisition_manager" ? "offer" : "qualification",
      status: "pending",
      callTimestamp: new Date(ghlCall.dateAdded),
    });

    if (call) {
      // Process the call asynchronously
      processCall(call.id).catch(err => {
        console.error(`[GHL] Error processing call ${call.id}:`, err);
      });

      return { success: true, callId: call.id };
    }

    return { success: false, reason: "Failed to create call record" };
  } catch (error) {
    console.error(`[GHL] Error syncing call ${ghlCall.id}:`, error);
    return { success: false, reason: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Poll for new calls from GHL
 */
export async function pollForNewCalls(): Promise<{
  success: boolean;
  synced: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  if (isPolling) {
    return { success: false, synced: 0, skipped: 0, failed: 0, errors: ["Polling already in progress"] };
  }

  isPolling = true;
  const results = { success: true, synced: 0, skipped: 0, failed: 0, errors: [] as string[] };

  try {
    // Fetch calls from the last poll time (or last 24 hours if first poll)
    const startDate = lastPollTimestamp || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = new Date();

    console.log(`[GHL] Polling for calls from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const ghlCalls = await fetchGHLCalls({ startDate, endDate });
    console.log(`[GHL] Found ${ghlCalls.length} calls`);

    for (const ghlCall of ghlCalls) {
      const result = await syncGHLCall(ghlCall);
      
      if (result.skipped) {
        results.skipped++;
      } else if (result.success) {
        results.synced++;
      } else {
        results.failed++;
        if (result.reason) {
          results.errors.push(`Call ${ghlCall.id}: ${result.reason}`);
        }
      }
    }

    // Update last poll timestamp
    lastPollTimestamp = endDate;

  } catch (error) {
    results.success = false;
    results.errors.push(error instanceof Error ? error.message : "Unknown error");
  } finally {
    isPolling = false;
  }

  console.log(`[GHL] Poll complete: ${results.synced} synced, ${results.skipped} skipped, ${results.failed} failed`);
  return results;
}

/**
 * Start automatic polling at the specified interval (in minutes)
 */
export function startPolling(intervalMinutes: number = 5): void {
  if (pollInterval) {
    console.log("[GHL] Polling already started");
    return;
  }

  console.log(`[GHL] Starting automatic polling every ${intervalMinutes} minutes`);
  
  // Do an initial poll
  pollForNewCalls().catch(err => console.error("[GHL] Initial poll error:", err));

  // Set up interval
  pollInterval = setInterval(() => {
    pollForNewCalls().catch(err => console.error("[GHL] Poll error:", err));
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop automatic polling
 */
export function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("[GHL] Polling stopped");
  }
}

/**
 * Get polling status
 */
export function getPollingStatus(): {
  isPolling: boolean;
  lastPollTime: Date | null;
  isAutoPollingEnabled: boolean;
} {
  return {
    isPolling,
    lastPollTime: lastPollTimestamp,
    isAutoPollingEnabled: pollInterval !== null,
  };
}

/**
 * Set the last poll timestamp (useful for initialization)
 */
export function setLastPollTimestamp(timestamp: Date): void {
  lastPollTimestamp = timestamp;
}
