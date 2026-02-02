/**
 * GoHighLevel API Service
 * Handles fetching calls from GHL and syncing them to the local database
 */

import { ENV } from "./_core/env";
import { createCall, getTeamMembers, updateCall, getCallById, getCallByGhlId } from "./db";
import { processCall } from "./grading";
import { storagePut } from "./storage";

// GHL API Configuration
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_LOCATION_ID = "hmD7eWGQJE7EVFpJxj4q";
const GHL_API_KEY = "pit-bfb8f738-3530-4385-b40f-86a5a1275f35";

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
  dateAdded: string;
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
  url.searchParams.set("locationId", GHL_LOCATION_ID);
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
        "Authorization": `Bearer ${GHL_API_KEY}`,
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

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${GHL_API_KEY}`,
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
  // Correct endpoint format: /conversations/messages/:messageId/locations/:locationId/recording
  const url = `${GHL_API_BASE}/conversations/messages/${messageId}/locations/${GHL_LOCATION_ID}/recording`;

  try {
    console.log(`[GHL] Fetching recording for message ${messageId}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${GHL_API_KEY}`,
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
async function syncGHLCall(ghlCall: ProcessedGHLCall): Promise<{ success: boolean; callId?: number; skipped?: boolean; reason?: string }> {
  // Check if call already exists
  const existingCall = await getCallByGhlId(ghlCall.id);
  if (existingCall) {
    return { success: true, skipped: true, reason: "Call already synced" };
  }

  // Match team member
  const teamMember = await matchTeamMember(ghlCall.userId);
  if (!teamMember) {
    console.log(`[GHL] Could not match team member for call ${ghlCall.id} (userId: ${ghlCall.userId})`);
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

    // Create the call record
    const call = await createCall({
      ghlCallId: ghlCall.id,
      contactName: ghlCall.contactName,
      contactPhone: ghlCall.contactPhone,
      recordingUrl: recordingUrl,
      duration: ghlCall.duration,
      callDirection: ghlCall.direction || "outbound",
      teamMemberId: teamMember.id,
      teamMemberName: teamMember.name,
      callType: teamMember.role === "acquisition_manager" ? "offer" : "qualification",
      status: "pending",
      callTimestamp: new Date(ghlCall.dateAdded),
    });

    if (call) {
      console.log(`[GHL] Created call record ${call.id}, starting processing...`);
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
    // Fetch calls from the last poll time (or last 72 hours if first poll)
    const startDate = lastPollTimestamp || new Date(Date.now() - 72 * 60 * 60 * 1000);
    const endDate = new Date();

    console.log(`[GHL] Polling for calls from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const ghlCalls = await fetchGHLCalls({ startDate, endDate });
    console.log(`[GHL] Found ${ghlCalls.length} calls to process`);

    for (const ghlCall of ghlCalls) {
      const result = await syncGHLCall(ghlCall);
      
      if (result.skipped) {
        results.skipped++;
        console.log(`[GHL] Skipped call ${ghlCall.id}: ${result.reason}`);
      } else if (result.success) {
        results.synced++;
        console.log(`[GHL] Synced call ${ghlCall.id} -> ${result.callId}`);
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

// Current polling interval in minutes
let currentIntervalMinutes: number = 30;

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
