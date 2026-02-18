/**
 * GoHighLevel API Service
 * Handles fetching calls from GHL and syncing them to the local database
 */

import { ENV } from "./_core/env";
import { createCall, getTeamMembers, updateCall, getCallById, getCallByGhlId } from "./db";
import { processCall } from "./grading";
import PQueue from "p-queue";

// Processing queue: limits concurrent LLM-heavy processCall operations
// Each processCall makes 2-4 LLM calls, so limit concurrency to prevent overload
const callProcessingQueue = new PQueue({ concurrency: 5 });
import { storagePut } from "./storage";
import { runArchivalJob } from "./archival";
import { generateTeamInsights } from "./insights";
import { getAllTenants } from "./tenant";
import { createTeamTrainingItem } from "./db";
import { getTenantsWithCrm, parseCrmConfig, getTenantById, type TenantCrmConfig } from "./tenant";
import { runOpportunityDetection } from "./opportunityDetection";

// GHL API Configuration
const GHL_API_BASE = "https://services.leadconnectorhq.com";

/**
 * Tenant-specific GHL credentials used by all API calls.
 * Loaded from tenant.crmConfig at poll time.
 */
interface GHLCredentials {
  apiKey: string;
  locationId: string;
  tenantId: number;
  tenantName: string;
  dispoPipelineName?: string;
  newDealStageName?: string;
}

// Active credentials for the current polling cycle
let activeCredentials: GHLCredentials | null = null;

/**
 * Set the active GHL credentials for the current polling cycle
 */
function setActiveCredentials(creds: GHLCredentials): void {
  activeCredentials = creds;
}

/**
 * Get the active GHL credentials (throws if not set)
 */
function getActiveCredentials(): GHLCredentials {
  if (!activeCredentials) {
    throw new Error("[GHL] No active credentials set. Call setActiveCredentials() first.");
  }
  return activeCredentials;
}

// GHL Conversation from search API
interface GHLConversation {
  id: string;
  locationId: string;
  contactId: string;
  fullName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  assignedTo?: string;
  type: string;
  lastMessageType?: string;
  lastMessageDate?: number;
  dateAdded: number;
  dateUpdated?: number;
}

// GHL Message (call details)
interface GHLMessage {
  id: string;
  type: number;
  messageType?: string;
  direction: string;
  status: string;
  contentType?: string;
  body?: string;
  attachments?: Array<{
    url: string;
    type: string;
  }>;
  meta?: {
    call?: {
      duration?: number;
      status?: string;
    };
    duration?: number;
    recordingUrl?: string;
    callStatus?: string;
  };
  userId?: string;
  from?: string;
  to?: string;
  dateAdded: string;
}

interface GHLSearchResponse {
  conversations: GHLConversation[];
  total: number;
}

interface GHLMessagesResponse {
  messages: {
    messages: GHLMessage[];
  };
}

// Processed call structure
interface ProcessedGHLCall {
  id: string;
  conversationId: string;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
  direction: "inbound" | "outbound";
  status: string;
  duration: number;
  hasRecording: boolean;
  userId?: string;
  userName?: string; // GHL user's display name for name-based matching
  dateAdded: string;
}

// Cache of GHL user ID → name mappings per tenant
const ghlUserNameCache = new Map<number, Map<string, string>>();

/**
 * Fetch GHL users for a location to get userId → name mappings.
 * Uses the GHL Users API: GET /users/search?locationId=xxx
 */
async function fetchGHLUserNames(tenantId: number): Promise<Map<string, string>> {
  // Return cached if available
  if (ghlUserNameCache.has(tenantId)) {
    return ghlUserNameCache.get(tenantId)!;
  }

  const creds = getActiveCredentials();
  const userMap = new Map<string, string>();

  try {
    const url = new URL(`${GHL_API_BASE}/users/search`);
    url.searchParams.set("locationId", creds.locationId);

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
      },
    });

    if (response.ok) {
      const data = await response.json() as { users?: Array<{ id: string; name?: string; firstName?: string; lastName?: string }> };
      if (data.users) {
        for (const user of data.users) {
          const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ");
          if (name && user.id) {
            userMap.set(user.id, name);
          }
        }
        console.log(`[GHL] Fetched ${userMap.size} user names for tenant ${tenantId}`);
      }
    } else {
      console.warn(`[GHL] Failed to fetch users for tenant ${tenantId}: ${response.status}`);
    }
  } catch (e) {
    console.warn(`[GHL] Error fetching users for tenant ${tenantId}:`, e);
  }

  ghlUserNameCache.set(tenantId, userMap);
  // Clear cache after 10 minutes
  setTimeout(() => ghlUserNameCache.delete(tenantId), 10 * 60 * 1000);
  return userMap;
}

/**
 * Persist ghlUserId on a team member after a successful name match.
 * This ensures future lookups are instant by GHL user ID.
 * Uses dynamic imports to avoid circular dependency with schema imports.
 */
async function linkTeamMemberGhlUserId(teamMemberId: number, ghlUserId: string): Promise<void> {
  try {
    const { getDb: getDatabase } = await import("./db");
    const { teamMembers: teamMembersTable } = await import("../drizzle/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    const db = await getDatabase();
    if (!db) return;
    await db.update(teamMembersTable).set({ ghlUserId }).where(eqOp(teamMembersTable.id, teamMemberId));
    console.log(`[GHL] Auto-linked team member ${teamMemberId} to GHL userId ${ghlUserId}`);
  } catch (e) {
    console.warn(`[GHL] Failed to persist ghlUserId for team member ${teamMemberId}:`, e);
  }
}

// Store last poll timestamp in memory (could be persisted to DB for production)
let lastPollTimestamp: Date | null = null;
let isPolling = false;
let pollInterval: NodeJS.Timeout | null = null;

/**
 * Fetch conversations with calls from GoHighLevel API
 */
async function fetchGHLConversations(params: {
  startDate?: Date;
  limit?: number;
}): Promise<GHLConversation[]> {
  const { startDate, limit = 100 } = params;

  const url = new URL(`${GHL_API_BASE}/conversations/search`);
  const creds = getActiveCredentials();
  url.searchParams.set("locationId", creds.locationId);
  url.searchParams.set("limit", limit.toString());
  // Sort by last message date to get recent conversations with calls
  url.searchParams.set("sortBy", "last_message_date");
  url.searchParams.set("sortOrder", "desc");
  
  // Note: We don't use startAfterDate here because it filters by conversation creation date,
  // not by message date. We filter calls by date after fetching messages instead.

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GHL] API error: ${response.status} - ${errorText}`);
      throw new Error(`GHL API error: ${response.status}`);
    }

    const data: GHLSearchResponse = await response.json();
    
    // Filter for phone type conversations
    const phoneConversations = data.conversations?.filter(c => c.type === "TYPE_PHONE") || [];
    return phoneConversations;
  } catch (error) {
    console.error("[GHL] Error fetching conversations:", error);
    throw error;
  }
}

/**
 * Fetch messages (including call details) for a conversation
 */
async function fetchConversationMessages(conversationId: string): Promise<GHLMessage[]> {
  const url = new URL(`${GHL_API_BASE}/conversations/${conversationId}/messages`);
  const creds = getActiveCredentials();

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GHL] Messages API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data: GHLMessagesResponse = await response.json();
    return data.messages?.messages || [];
  } catch (error) {
    console.error(`[GHL] Error fetching messages for conversation ${conversationId}:`, error);
    return [];
  }
}

/**
 * Fetch recording for a specific message using the correct GHL API endpoint
 * Returns the recording as a Buffer, or null if not available
 */
async function fetchCallRecording(messageId: string): Promise<Buffer | null> {
  const creds = getActiveCredentials();
  // Correct endpoint format: /conversations/messages/:messageId/locations/:locationId/recording
  const url = `${GHL_API_BASE}/conversations/messages/${messageId}/locations/${creds.locationId}/recording`;

  try {
    console.log(`[GHL] Fetching recording for message ${messageId}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-04-15", // This endpoint requires version 2021-04-15
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[GHL] No recording found for message ${messageId}`);
        return null;
      }
      const errorText = await response.text();
      console.error(`[GHL] Recording API error: ${response.status} - ${errorText}`);
      return null;
    }

    // The API returns the audio file directly as binary data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Check if we got actual audio data (should be more than a few bytes)
    if (buffer.length < 1000) {
      console.log(`[GHL] Recording too small (${buffer.length} bytes), likely not a valid recording`);
      return null;
    }

    console.log(`[GHL] Successfully fetched recording (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error(`[GHL] Error fetching recording for message ${messageId}:`, error);
    return null;
  }
}

/**
 * Upload recording to S3 and return the URL
 */
async function uploadRecordingToS3(buffer: Buffer, callId: string): Promise<string | null> {
  try {
    const filename = `ghl-recordings/${callId}-${Date.now()}.mp3`;
    const result = await storagePut(filename, buffer, "audio/mpeg");
    console.log(`[GHL] Uploaded recording to S3: ${result.url}`);
    return result.url;
  } catch (error) {
    console.error(`[GHL] Error uploading recording to S3:`, error);
    return null;
  }
}

/**
 * Extract call information from conversation messages
 */
function extractCallsFromMessages(
  conversation: GHLConversation, 
  messages: GHLMessage[]
): ProcessedGHLCall[] {
  const calls: ProcessedGHLCall[] = [];

  for (const msg of messages) {
    // Call messages have messageType "TYPE_CALL" or type 1
    const isCall = msg.messageType === "TYPE_CALL" || msg.type === 1;

    if (isCall) {
      // Get duration from meta.call.duration
      const duration = msg.meta?.call?.duration || msg.meta?.duration || 0;
      
      console.log(`[GHL] Found call message: id=${msg.id}, type=${msg.type}, messageType=${msg.messageType}, duration=${duration}`);
      
      // Only include calls with meaningful duration (more than 10 seconds)
      if (duration < 10) {
        console.log(`[GHL] Skipping call ${msg.id} - duration too short (${duration}s)`);
        continue;
      }

      calls.push({
        id: msg.id,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        contactName: conversation.fullName || conversation.contactName,
        contactPhone: conversation.phone || msg.to || msg.from,
        direction: msg.direction === "inbound" ? "inbound" : "outbound",
        status: msg.meta?.call?.status || msg.status || "completed",
        duration,
        hasRecording: true, // We'll try to fetch the recording
        userId: msg.userId || conversation.assignedTo,
        dateAdded: msg.dateAdded,
      });
    }
  }

  return calls;
}

/**
 * Fetch all calls from GHL (combines conversations and messages)
 */
export async function fetchGHLCalls(params: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<ProcessedGHLCall[]> {
  const { startDate, limit = 100 } = params;

  console.log(`[GHL] Fetching conversations...`);
  const conversations = await fetchGHLConversations({ startDate, limit });
  console.log(`[GHL] Found ${conversations.length} phone conversations`);
  
  // Debug: Check if Joyce's conversation is in the list
  const joyceConv = conversations.find(c => c.id === '0LgsID8DjHifNZp89VQv');
  if (joyceConv) {
    console.log(`[GHL] DEBUG: Found Joyce Garvin's conversation: ${joyceConv.id}`);
  } else {
    console.log(`[GHL] DEBUG: Joyce Garvin's conversation NOT found in ${conversations.length} conversations`);
  }

  const allCalls: ProcessedGHLCall[] = [];

  // Fetch messages for each conversation to find calls with recordings
  for (const conv of conversations) {
    const messages = await fetchConversationMessages(conv.id);
    const calls = extractCallsFromMessages(conv, messages);
    
    // Filter by date if needed
    if (startDate) {
      const startTime = startDate.getTime();
      for (const c of calls) {
        const callTime = new Date(c.dateAdded).getTime();
        if (callTime >= startTime) {
          allCalls.push(c);
          console.log(`[GHL] Including call ${c.id} (${c.duration}s) from ${c.dateAdded}`);
        } else {
          console.log(`[GHL] Filtering out call ${c.id} - date ${c.dateAdded} is before ${startDate.toISOString()}`);
        }
      }
    } else {
      allCalls.push(...calls);
    }
  }

  console.log(`[GHL] Found ${allCalls.length} calls with duration > 10 seconds`);
  return allCalls;
}

/**
 * Match a GHL user ID to a team member
 */
async function matchTeamMember(ghlUserId?: string, userName?: string, tenantId?: number): Promise<{ id: number; name: string; role: string; tenantId: number } | null> {
  if (!ghlUserId && !userName) return null;

  const teamMembers = await getTeamMembers(tenantId);
  
  // First try to match by GHL User ID
  if (ghlUserId) {
    const byId = teamMembers.find(m => m.ghlUserId === ghlUserId);
    if (byId) return { id: byId.id, name: byId.name, role: byId.teamRole || "lead_manager", tenantId: byId.tenantId };
  }

  // Fall back to name matching
  if (userName) {
    const byName = teamMembers.find(m => 
      m.name.toLowerCase().includes(userName.toLowerCase()) ||
      userName.toLowerCase().includes(m.name.toLowerCase())
    );
    if (byName) return { id: byName.id, name: byName.name, role: byName.teamRole || "lead_manager", tenantId: byName.tenantId };
  }

  return null;
}

/**
 * Sync a single GHL call to the local database
 */
async function syncGHLCall(ghlCall: ProcessedGHLCall): Promise<{ success: boolean; callId?: number; skipped?: boolean; reason?: string }> {
  // Check if call already exists
  const existingCall = await getCallByGhlId(ghlCall.id);
  if (existingCall) {
    return { success: true, skipped: true, reason: "Call already synced" };
  }

  // Match team member (scoped to the active tenant)
  // Try by GHL user ID first, then fall back to name matching
  const creds = getActiveCredentials();
  let teamMember = await matchTeamMember(ghlCall.userId, undefined, creds.tenantId);
  
  // If no match by userId, try name matching using the GHL user's display name
  if (!teamMember && ghlCall.userId) {
    const userName = ghlCall.userName || (await fetchGHLUserNames(creds.tenantId)).get(ghlCall.userId);
    if (userName) {
      teamMember = await matchTeamMember(undefined, userName, creds.tenantId);
      // Auto-persist the ghlUserId so future lookups are instant
      if (teamMember) {
        await linkTeamMemberGhlUserId(teamMember.id, ghlCall.userId);
      }
    }
  }
  
  if (!teamMember) {
    console.log(`[GHL] Could not match team member for call ${ghlCall.id} (userId: ${ghlCall.userId}, userName: ${ghlCall.userName || 'unknown'})`);
    return { success: true, skipped: true, reason: "Could not match team member" };
  }

  try {
    // Fetch the recording from GHL
    console.log(`[GHL] Fetching recording for call ${ghlCall.id}...`);
    const recordingBuffer = await fetchCallRecording(ghlCall.id);
    
    if (!recordingBuffer) {
      console.log(`[GHL] No recording available for call ${ghlCall.id}`);
      return { success: true, skipped: true, reason: "No recording available" };
    }

    // Upload to S3
    const recordingUrl = await uploadRecordingToS3(recordingBuffer, ghlCall.id);
    if (!recordingUrl) {
      return { success: false, reason: "Failed to upload recording to S3" };
    }

    // Create the call record with tenantId from team member
    const call = await createCall({
      ghlCallId: ghlCall.id,
      ghlContactId: ghlCall.contactId,
      contactName: ghlCall.contactName,
      contactPhone: ghlCall.contactPhone,
      recordingUrl: recordingUrl,
      duration: ghlCall.duration,
      callDirection: ghlCall.direction || "outbound",
      teamMemberId: teamMember.id,
      teamMemberName: teamMember.name,
      // Don't pre-assign "offer" based on role — AI detection in processCall will determine the real type.
      callType: teamMember.role === "lead_generator" ? "cold_call" : "qualification",
      status: "pending",
      callTimestamp: new Date(ghlCall.dateAdded),
      tenantId: teamMember.tenantId, // Inherit tenantId from team member
    });

    if (call) {
      console.log(`[GHL] Created call record ${call.id}, starting processing...`);
      // Process the call via concurrency-limited queue
      callProcessingQueue.add(() => processCall(call.id)).catch(err => {
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
/**
 * Poll for new calls across all tenants with CRM connected.
 * Loads each tenant's credentials from crmConfig and polls their GHL account.
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
    // Get all tenants with CRM connected
    const crmTenants = await getTenantsWithCrm();
    
    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      if (!config.ghlApiKey || !config.ghlLocationId) {
        console.log(`[GHL] Tenant ${tenant.id} (${tenant.name}) missing GHL credentials, skipping`);
        continue;
      }

      // Set active credentials for this tenant
      setActiveCredentials({
        apiKey: config.ghlApiKey,
        locationId: config.ghlLocationId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        dispoPipelineName: config.dispoPipelineName,
        newDealStageName: config.newDealStageName,
      });

      try {
        const startDate = lastPollTimestamp || new Date(Date.now() - 72 * 60 * 60 * 1000);
        const endDate = new Date();

        console.log(`[GHL] Polling tenant ${tenant.id} (${tenant.name}) from ${startDate.toISOString()} to ${endDate.toISOString()}`);

        // Per-tenant timeout: 5 minutes max per tenant to prevent blocking
        const TENANT_TIMEOUT_MS = 5 * 60 * 1000;
        const tenantPoll = async () => {
          const ghlCalls = await fetchGHLCalls({ startDate, endDate });
          console.log(`[GHL] Tenant ${tenant.id}: Found ${ghlCalls.length} calls to process`);

          for (const ghlCall of ghlCalls) {
            const result = await syncGHLCall(ghlCall);
            
            if (result.skipped) {
              results.skipped++;
            } else if (result.success) {
              results.synced++;
              console.log(`[GHL] Tenant ${tenant.id}: Synced call ${ghlCall.id} -> ${result.callId}`);
            } else {
              results.failed++;
              if (result.reason) {
                results.errors.push(`Tenant ${tenant.id} call ${ghlCall.id}: ${result.reason}`);
              }
            }
          }
        };

        await Promise.race([
          tenantPoll(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Tenant ${tenant.id} polling timed out after ${TENANT_TIMEOUT_MS / 1000}s`)), TENANT_TIMEOUT_MS)),
        ]);

        // Record successful sync timestamp
        const { updateTenantSettings } = await import("./tenant");
        await updateTenantSettings(tenant.id, { lastGhlSync: new Date() });
        console.log(`[GHL] Tenant ${tenant.id}: Recorded sync timestamp`);
      } catch (tenantError) {
        console.error(`[GHL] Error polling tenant ${tenant.id} (${tenant.name}):`, tenantError);
        results.errors.push(`Tenant ${tenant.id}: ${tenantError instanceof Error ? tenantError.message : "Unknown error"}`);
      }
    }

    // Update last poll timestamp
    lastPollTimestamp = new Date();

  } catch (error) {
    results.success = false;
    results.errors.push(error instanceof Error ? error.message : "Unknown error");
  } finally {
    isPolling = false;
    activeCredentials = null; // Clear credentials after polling
  }

  console.log(`[GHL] Poll complete: ${results.synced} synced, ${results.skipped} skipped, ${results.failed} failed`);
  return results;
}

// Current polling interval in minutes
let currentIntervalMinutes: number = 30;

// Archival job interval (runs daily)
let archivalInterval: ReturnType<typeof setInterval> | null = null;
let lastArchivalTime: Date | null = null;

// Weekly insights generation (runs Monday mornings)
let insightsInterval: ReturnType<typeof setInterval> | null = null;
let lastInsightsTime: Date | null = null;

// Hourly opportunity detection
let opportunityDetectionInterval: ReturnType<typeof setInterval> | null = null;
let lastOpportunityDetectionTime: Date | null = null;

/**
 * Check if it's Monday morning (6 AM) and run insights generation
 */
async function checkAndRunWeeklyInsights(): Promise<void> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
  const hour = now.getHours();
  
  // Run on Monday between 6-7 AM
  if (dayOfWeek === 1 && hour >= 6 && hour < 7) {
    // Check if we already ran today
    if (lastInsightsTime) {
      const lastRunDate = lastInsightsTime.toDateString();
      const todayDate = now.toDateString();
      if (lastRunDate === todayDate) {
        return; // Already ran today
      }
    }
    
    console.log("[Insights] Running weekly AI insights generation (Monday morning)");
    try {
      // Iterate over all tenants to generate insights per-tenant
      const allTenants = await getAllTenants();
      let totalSavedCount = 0;
      
      for (const tenant of allTenants) {
        try {
          console.log(`[Insights] Generating insights for tenant ${tenant.id} (${tenant.name})`);
          const insights = await generateTeamInsights(tenant.id);
          
          // Save all generated insights scoped to this tenant
          let savedCount = 0;
          const allItems = [
            ...insights.skills.map(s => ({ ...s, itemType: "skill" as const })),
            ...insights.issues.map(i => ({ ...i, itemType: "issue" as const })),
            ...insights.wins.map(w => ({ ...w, itemType: "win" as const })),
            ...insights.agenda.map(a => ({ ...a, itemType: "agenda" as const })),
          ];
          
          for (const item of allItems) {
            await createTeamTrainingItem({
              tenantId: tenant.id,
              itemType: item.itemType,
              title: item.title,
              description: item.description,
              targetBehavior: (item as any).targetBehavior,
              priority: item.priority,
              status: "active",
              teamMemberId: item.teamMemberId,
              sourceCallIds: item.sourceCallIds ? JSON.stringify(item.sourceCallIds) : null,
            });
            savedCount++;
          }
          
          totalSavedCount += savedCount;
          console.log(`[Insights] Tenant ${tenant.id}: saved ${savedCount} insights`);
        } catch (tenantErr) {
          console.error(`[Insights] Error generating insights for tenant ${tenant.id}:`, tenantErr);
        }
      }
      
      lastInsightsTime = new Date();
      console.log(`[Insights] Weekly generation complete. Saved ${totalSavedCount} insights across ${allTenants.length} tenants.`);
    } catch (err) {
      console.error("[Insights] Weekly generation error:", err);
    }
  }
}

/**
 * Start automatic polling at the specified interval (in minutes)
 */
export function startPolling(intervalMinutes: number = 30): void {
  if (pollInterval) {
    console.log("[GHL] Polling already started");
    return;
  }

  currentIntervalMinutes = intervalMinutes;
  console.log(`[GHL] Starting automatic polling every ${intervalMinutes} minutes`);
  
  // Do an initial poll, then opportunity poll (sequential to avoid credential race condition)
  pollForNewCalls()
    .then(() => pollOpportunities())
    .catch(err => console.error("[GHL] Initial poll error:", err));

  // Set up interval — run call poll then opportunity poll sequentially
  pollInterval = setInterval(() => {
    pollForNewCalls()
      .then(() => pollOpportunities())
      .catch(err => console.error("[GHL] Poll error:", err));
  }, intervalMinutes * 60 * 1000);

  // Start daily archival job (runs every 24 hours)
  if (!archivalInterval) {
    console.log("[Archival] Starting daily archival job");
    // Run archival job once at startup (after a short delay)
    setTimeout(() => {
      runArchivalJob()
        .then(result => {
          lastArchivalTime = new Date();
          console.log(`[Archival] Initial run: archived ${result.totalArchived} calls`);
        })
        .catch(err => console.error("[Archival] Initial run error:", err));
    }, 60000); // Wait 1 minute after startup

    // Then run every 24 hours
    archivalInterval = setInterval(() => {
      runArchivalJob()
        .then(result => {
          lastArchivalTime = new Date();
          console.log(`[Archival] Daily run: archived ${result.totalArchived} calls`);
        })
        .catch(err => console.error("[Archival] Daily run error:", err));
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  // Start weekly insights generation check (checks every hour if it's Monday 6 AM)
  if (!insightsInterval) {
    console.log("[Insights] Starting weekly insights scheduler (Monday 6 AM)");
    // Check immediately at startup
    checkAndRunWeeklyInsights().catch(err => console.error("[Insights] Initial check error:", err));
    
    // Then check every hour
    insightsInterval = setInterval(() => {
      checkAndRunWeeklyInsights().catch(err => console.error("[Insights] Hourly check error:", err));
    }, 60 * 60 * 1000); // 1 hour
  }

  // Start hourly opportunity detection
  if (!opportunityDetectionInterval) {
    console.log("[OpportunityDetection] Starting hourly opportunity detection scheduler");
    // Run initial detection after a 5-minute delay (let other services settle)
    setTimeout(() => {
      runOpportunityDetection()
        .then(result => {
          lastOpportunityDetectionTime = new Date();
          console.log(`[OpportunityDetection] Initial run: detected ${result.detected}, errors ${result.errors}`);
        })
        .catch(err => console.error("[OpportunityDetection] Initial run error:", err));
    }, 5 * 60 * 1000); // Wait 5 minutes after startup

    // Then run every hour
    opportunityDetectionInterval = setInterval(() => {
      runOpportunityDetection()
        .then(result => {
          lastOpportunityDetectionTime = new Date();
          console.log(`[OpportunityDetection] Hourly run: detected ${result.detected}, errors ${result.errors}`);
        })
        .catch(err => console.error("[OpportunityDetection] Hourly run error:", err));
    }, 60 * 60 * 1000); // 1 hour
  }
}

/**
 * Stop automatic polling
 */
export function stopPolling(): void {
  // Stop opportunity polling
  stopOpportunityPolling();
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("[GHL] Polling stopped");
  }
  if (archivalInterval) {
    clearInterval(archivalInterval);
    archivalInterval = null;
    console.log("[Archival] Daily archival job stopped");
  }
  if (insightsInterval) {
    clearInterval(insightsInterval);
    insightsInterval = null;
    console.log("[Insights] Weekly insights scheduler stopped");
  }
  if (opportunityDetectionInterval) {
    clearInterval(opportunityDetectionInterval);
    opportunityDetectionInterval = null;
    console.log("[OpportunityDetection] Hourly detection stopped");
  }
}

/**
 * Get polling status
 */
export function getPollingStatus(): {
  isPolling: boolean;
  lastPollTime: Date | null;
  isAutoPollingEnabled: boolean;
  intervalMinutes: number;
} {
  return {
    isPolling,
    lastPollTime: lastPollTimestamp,
    isAutoPollingEnabled: pollInterval !== null,
    intervalMinutes: currentIntervalMinutes,
  };
}

/**
 * Set the last poll timestamp (useful for initialization)
 */
export function setLastPollTimestamp(timestamp: Date): void {
  lastPollTimestamp = timestamp;
}


// ============ OPPORTUNITY POLLING FOR CLOSER BADGE ============

import { deals, calls, teamMembers } from "../drizzle/schema";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { updateBadgeProgress, awardBadge, ALL_BADGES } from "./gamification";

// GHL Opportunity interface
interface GHLOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  contactId: string;
  assignedTo?: string;
  monetaryValue?: number;
  createdAt: string;
  updatedAt: string;
}

// Track last opportunity poll
let lastOpportunityPollTimestamp: Date | null = null;
let opportunityPollInterval: ReturnType<typeof setInterval> | null = null;

// Dispo Pipeline configuration (now loaded from tenant crmConfig)
// Defaults for backwards compatibility
const DEFAULT_DISPO_PIPELINE_NAME = "dispo pipeline";
const DEFAULT_NEW_DEAL_STAGE_NAME = "new deal";

/**
 * Fetch opportunities from GHL
 */
async function fetchOpportunities(startDate?: Date): Promise<GHLOpportunity[]> {
  const creds = getActiveCredentials();
  try {
    const url = new URL(`${GHL_API_BASE}/opportunities/search`);
    url.searchParams.set("location_id", creds.locationId);
    
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      console.error(`[GHL Opportunities] API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.opportunities || [];
  } catch (error) {
    console.error("[GHL Opportunities] Fetch error:", error);
    return [];
  }
}

/**
 * Get pipelines to find the Dispo Pipeline ID
 */
async function getPipelines(): Promise<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>> {
  try {
    const creds = getActiveCredentials();
    const response = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${creds.locationId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      console.error(`[GHL Pipelines] API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.pipelines || [];
  } catch (error) {
    console.error("[GHL Pipelines] Fetch error:", error);
    return [];
  }
}

/**
 * Process a new deal opportunity and credit the Closer badge
 */
async function processNewDeal(opportunity: GHLOpportunity): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  // Check if we've already processed this opportunity
  const [existing] = await db.select().from(deals).where(eq(deals.ghlOpportunityId, opportunity.id));
  if (existing) {
    return false; // Already processed
  }
  
  // Find the offer call that matches this contact
  const [matchingCall] = await db
    .select()
    .from(calls)
    .where(eq(calls.ghlContactId, opportunity.contactId));
  
  if (!matchingCall || !matchingCall.teamMemberId) {
    console.log(`[GHL Opportunities] No matching call found for contact ${opportunity.contactId}`);
    // Still record the deal even without a matching call
    await db.insert(deals).values({
      ghlOpportunityId: opportunity.id,
      ghlContactId: opportunity.contactId,
      dealValue: opportunity.monetaryValue ? opportunity.monetaryValue * 100 : null,
      tenantId: 1, // Default tenant when no matching call found
    });
    return false;
  }
  
  // Record the deal with the team member
  await db.insert(deals).values({
    ghlOpportunityId: opportunity.id,
    ghlContactId: opportunity.contactId,
    teamMemberId: matchingCall.teamMemberId,
    callId: matchingCall.id,
    dealValue: opportunity.monetaryValue ? opportunity.monetaryValue * 100 : null,
    tenantId: matchingCall.tenantId ?? 1,
  });
  
  console.log(`[GHL Opportunities] New deal recorded for team member ${matchingCall.teamMemberId}`);
  
  // Update Closer badge progress
  const newCount = await updateBadgeProgress(matchingCall.teamMemberId, "closer", 1);
  
  // Check if any tier was earned
  const closerBadge = ALL_BADGES.find(b => b.code === "closer");
  if (closerBadge) {
    if (newCount >= closerBadge.tiers.gold.count) {
      await awardBadge(matchingCall.teamMemberId, "closer", "gold");
    } else if (newCount >= closerBadge.tiers.silver.count) {
      await awardBadge(matchingCall.teamMemberId, "closer", "silver");
    } else if (newCount >= closerBadge.tiers.bronze.count) {
      await awardBadge(matchingCall.teamMemberId, "closer", "bronze");
    }
  }
  
  return true;
}

/**
 * Poll for new opportunities in the Dispo Pipeline
 */
/**
 * Poll for new opportunities across all tenants with CRM connected.
 */
export async function pollOpportunities(): Promise<{ processed: number; errors: number }> {
  const result = { processed: 0, errors: 0 };
  
  try {
    // Get all tenants with CRM connected
    const crmTenants = await getTenantsWithCrm();
    
    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      if (!config.ghlApiKey || !config.ghlLocationId) continue;

      setActiveCredentials({
        apiKey: config.ghlApiKey,
        locationId: config.ghlLocationId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        dispoPipelineName: config.dispoPipelineName,
        newDealStageName: config.newDealStageName,
      });

      try {
        await pollOpportunitiesForTenant(result);
      } catch (tenantError) {
        console.error(`[GHL Opportunities] Error polling tenant ${tenant.id}:`, tenantError);
        result.errors++;
      }
    }
    
    lastOpportunityPollTimestamp = new Date();
    activeCredentials = null;
  } catch (error) {
    console.error("[GHL Opportunities] Poll error:", error);
    result.errors++;
  }
  
  return result;
}

async function pollOpportunitiesForTenant(result: { processed: number; errors: number }): Promise<void> {
    // Get pipelines to find Dispo Pipeline
    const pipelines = await getPipelines();
    const creds = getActiveCredentials();
    const pipelineName = (creds.dispoPipelineName || DEFAULT_DISPO_PIPELINE_NAME).toLowerCase();
    const dispoPipeline = pipelines.find(p => p.name.toLowerCase() === pipelineName);
    
    if (!dispoPipeline) {
      console.log(`[GHL Opportunities] Dispo pipeline not found`);
      return;
    }
    
    const stageName = (creds.newDealStageName || DEFAULT_NEW_DEAL_STAGE_NAME).toLowerCase();
    const newDealStage = dispoPipeline.stages.find(s => s.name.toLowerCase() === stageName);
    if (!newDealStage) {
      console.log(`[GHL Opportunities] New Deal stage not found in Dispo pipeline`);
      return;
    }
    
    // Fetch opportunities
    const opportunities = await fetchOpportunities(lastOpportunityPollTimestamp || undefined);
    
    // Filter to only Dispo Pipeline / New Deal stage
    const newDeals = opportunities.filter(
      opp => opp.pipelineId === dispoPipeline.id && opp.pipelineStageId === newDealStage.id
    );
    
    console.log(`[GHL Opportunities] Tenant ${creds.tenantId}: Found ${newDeals.length} opportunities in New Deal stage`);
    
    // Process each new deal
    for (const opp of newDeals) {
      try {
        const processed = await processNewDeal(opp);
        if (processed) {
          result.processed++;
        }
      } catch (error) {
        console.error(`[GHL Opportunities] Error processing opportunity ${opp.id}:`, error);
        result.errors++;
      }
    }
}

/**
 * Start opportunity polling (every 5 minutes)
 */
export function startOpportunityPolling(): void {
  if (opportunityPollInterval) {
    return; // Already running
  }
  
  console.log("[GHL Opportunities] Starting opportunity polling (every 5 minutes)");
  
  // Initial poll
  pollOpportunities().catch(err => console.error("[GHL Opportunities] Initial poll error:", err));
  
  // Set up interval
  opportunityPollInterval = setInterval(() => {
    pollOpportunities().catch(err => console.error("[GHL Opportunities] Poll error:", err));
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Stop opportunity polling
 */
export function stopOpportunityPolling(): void {
  if (opportunityPollInterval) {
    clearInterval(opportunityPollInterval);
    opportunityPollInterval = null;
    console.log("[GHL Opportunities] Polling stopped");
  }
}


/**
 * Re-sync a call's recording from GHL
 * Fetches a fresh recording from GHL and updates the database
 */
export async function resyncCallRecording(callId: number): Promise<{
  success: boolean;
  message: string;
  newRecordingUrl?: string;
}> {
  try {
    // Get the call from database
    const call = await getCallById(callId);
    if (!call) {
      return { success: false, message: "Call not found" };
    }

    // Check if we have a GHL call ID
    if (!call.ghlCallId) {
      return { success: false, message: "Call does not have a GHL call ID - cannot re-sync" };
    }

    // Load tenant credentials for this call
    if (call.tenantId) {
      const tenant = await getTenantById(call.tenantId);
      if (tenant) {
        const config = parseCrmConfig(tenant);
        if (config.ghlApiKey && config.ghlLocationId) {
          setActiveCredentials({
            apiKey: config.ghlApiKey,
            locationId: config.ghlLocationId,
            tenantId: tenant.id,
            tenantName: tenant.name,
            dispoPipelineName: config.dispoPipelineName,
            newDealStageName: config.newDealStageName,
          });
        }
      }
    }

    console.log(`[GHL Resync] Re-syncing recording for call ${callId} (GHL ID: ${call.ghlCallId})`);

    // Fetch fresh recording from GHL
    const recordingBuffer = await fetchCallRecording(call.ghlCallId);
    
    if (!recordingBuffer) {
      return { 
        success: false, 
        message: "Recording no longer available from GHL - the file may have been deleted or expired" 
      };
    }

    // Upload to S3
    const newRecordingUrl = await uploadRecordingToS3(recordingBuffer, call.ghlCallId);
    if (!newRecordingUrl) {
      return { success: false, message: "Failed to upload recording to S3" };
    }

    // Update the call with new recording URL and reset status
    await updateCall(callId, {
      recordingUrl: newRecordingUrl,
      status: "pending",
      classification: "pending", // Reset classification to re-evaluate
    });

    console.log(`[GHL Resync] Successfully re-synced call ${callId} with new recording URL: ${newRecordingUrl}`);

    // Start processing the call again via concurrency-limited queue
    callProcessingQueue.add(() => processCall(callId)).catch(err => {
      console.error(`[GHL Resync] Error processing call ${callId}:`, err);
    });

    return { 
      success: true, 
      message: "Recording re-synced successfully, call is now being processed",
      newRecordingUrl 
    };
  } catch (error) {
    console.error(`[GHL Resync] Error re-syncing call ${callId}:`, error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : "Unknown error during re-sync" 
    };
  }
}
