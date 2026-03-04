/**
 * GoHighLevel API Service
 * Handles fetching calls from GHL and syncing them to the local database
 */

import { ENV } from "./_core/env";
import { createCall, getTeamMembers, updateCall, getCallById, getCallByGhlId, getCalls } from "./db";
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
import { startCorrectionMonitor, stopCorrectionMonitor } from "./correctionMonitor";
import { ghlCircuitBreaker } from "./ghlRateLimiter";
import { getValidAccessToken, proactiveRefreshAllTokens } from "./ghlOAuth";
import { loadGHLCredentials } from "./ghlCredentialHelper";
import { oauthAwareFetch } from "./ghlOAuthFetch";

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
  isOAuth: boolean;
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

  // Fail fast: skip if circuit breaker is open (still cache empty result to avoid re-fetching)
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[GHL] Circuit breaker open — skipping fetchGHLUserNames for tenant ${tenantId}`);
    ghlUserNameCache.set(tenantId, userMap);
    setTimeout(() => ghlUserNameCache.delete(tenantId), 2 * 60 * 1000); // shorter cache on failure
    return userMap;
  }

  try {
    const url = new URL(`${GHL_API_BASE}/users/search`);
    url.searchParams.set("locationId", creds.locationId);

    const response = await oauthAwareFetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });
    ghlCircuitBreaker.recordRequest();

    if (response.ok) {
      ghlCircuitBreaker.recordSuccess();
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
      if (response.status === 429) ghlCircuitBreaker.record429();
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
    
    // Also try to fetch the user's LC phone number from GHL
    let lcPhone: string | undefined;
    try {
      const creds = getActiveCredentials();
      const url = `${GHL_API_BASE}/users/${ghlUserId}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${creds.apiKey}`,
          "Version": "2021-07-28",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const userData = await resp.json();
        if (userData.lcPhone && typeof userData.lcPhone === 'object') {
          lcPhone = userData.lcPhone[creds.locationId] || undefined;
          if (lcPhone) {
            console.log(`[GHL] Found LC phone ${lcPhone} for user ${ghlUserId} (team member ${teamMemberId})`);
          }
        }
      }
    } catch (phoneErr) {
      // Non-critical: phone lookup failed, still link the ghlUserId
      console.warn(`[GHL] Failed to fetch phone for user ${ghlUserId}:`, phoneErr);
    }
    
    const updateData: any = { ghlUserId };
    if (lcPhone) updateData.lcPhone = lcPhone;
    
    await db.update(teamMembersTable).set(updateData).where(eqOp(teamMembersTable.id, teamMemberId));
    console.log(`[GHL] Auto-linked team member ${teamMemberId} to GHL userId ${ghlUserId}${lcPhone ? ` with phone ${lcPhone}` : ''}`);
  } catch (e) {
    console.warn(`[GHL] Failed to persist ghlUserId for team member ${teamMemberId}:`, e);
  }
}

// Store last poll timestamp in memory (could be persisted to DB for production)
let lastPollTimestamp: Date | null = null;
let isPolling = false;

// Track consecutive 401 failures per tenant to auto-skip broken tenants
const tenant401Failures = new Map<number, number>();
const MAX_CONSECUTIVE_401 = 3; // Skip tenant after 3 consecutive 401s
let pollInterval: NodeJS.Timeout | null = null;

/**
 * Fetch conversations with calls from GoHighLevel API
 */
async function fetchGHLConversations(params: {
  startDate?: Date;
  limit?: number;
  lastMessageType?: string;
  maxPages?: number;
  label?: string;
}): Promise<GHLConversation[]> {
  const { startDate, limit = 100, lastMessageType, maxPages = 3, label = "" } = params;
  const creds = getActiveCredentials();
  const allPhoneConversations: GHLConversation[] = [];
  let cursor: number | undefined = undefined;

  for (let page = 0; page < maxPages; page++) {
    // Fail fast: skip if circuit breaker is open
    if (!ghlCircuitBreaker.canProceed("normal")) {
      console.log(`[GHL]${label} Circuit breaker open — skipping fetchGHLConversations (page ${page})`);
      break;
    }

    const url = new URL(`${GHL_API_BASE}/conversations/search`);
    url.searchParams.set("locationId", creds.locationId);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("sortBy", "last_message_date");
    url.searchParams.set("sortOrder", "desc");
    if (lastMessageType) {
      url.searchParams.set("lastMessageType", lastMessageType);
    }
    if (cursor !== undefined) {
      url.searchParams.set("startAfterDate", cursor.toString());
    }

    // Rate-limit: add 1s delay between pages (not on first page)
    if (page > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    ghlCircuitBreaker.recordRequest();
    const response = await oauthAwareFetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });

    if (response.status === 429) {
      ghlCircuitBreaker.record429();
      console.log(`[GHL]${label} Rate limited (429) fetching conversations page ${page} — failing fast, returning what we have`);
      break;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GHL]${label} API error on page ${page}: ${response.status} - ${errorText}`);
      if (page === 0) {
        throw new Error(`GHL API error: ${response.status}`);
      }
      break;
    }

    ghlCircuitBreaker.recordSuccess();
    const data: GHLSearchResponse = await response.json();
    const conversations = data.conversations || [];
    const phoneConversations = conversations.filter(c => c.type === "TYPE_PHONE");
    allPhoneConversations.push(...phoneConversations);

    // Debug: log non-phone conversation types to see what we're filtering out
    const nonPhone = conversations.filter(c => c.type !== "TYPE_PHONE");
    if (nonPhone.length > 0) {
      console.log(`[GHL]${label} Page ${page}: Filtered out ${nonPhone.length} non-phone conversations`);
    }

    console.log(`[GHL]${label} Page ${page}: ${conversations.length} total, ${phoneConversations.length} phone (running total: ${allPhoneConversations.length})`);

    // Stop pagination if fewer results than limit (no more pages) or empty
    if (conversations.length < limit || conversations.length === 0) {
      console.log(`[GHL]${label} Pagination complete — got ${conversations.length} < ${limit} on page ${page}`);
      break;
    }

    // If we have a startDate, check if the oldest conversation on this page is already older
    if (startDate) {
      const oldestConv = conversations[conversations.length - 1];
      const oldestDate = oldestConv.lastMessageDate || oldestConv.dateUpdated || oldestConv.dateAdded;
      if (oldestDate && oldestDate < startDate.getTime()) {
        console.log(`[GHL]${label} Pagination complete — oldest conversation on page ${page} is before startDate`);
        break;
      }
    }

    // Set cursor for next page
    const lastConv = conversations[conversations.length - 1];
    const lastSortValue = lastConv.lastMessageDate || lastConv.dateUpdated || lastConv.dateAdded;
    if (!lastSortValue) {
      console.log(`[GHL]${label} Pagination complete — no sort value on last conversation of page ${page}`);
      break;
    }
    cursor = lastSortValue;
  }

  console.log(`[GHL]${label} Total phone conversations fetched: ${allPhoneConversations.length}`);
  return allPhoneConversations;
}

/**
 * Fetch messages (including call details) for a conversation
 */
async function fetchConversationMessages(conversationId: string): Promise<GHLMessage[]> {
  const url = new URL(`${GHL_API_BASE}/conversations/${conversationId}/messages`);
  const creds = getActiveCredentials();

  // Fail fast: skip if circuit breaker is open
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[GHL] Circuit breaker open — skipping fetchConversationMessages for ${conversationId}`);
    return [];
  }

  try {
    ghlCircuitBreaker.recordRequest();
    const response = await oauthAwareFetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Accept": "application/json",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });

    if (response.status === 429) {
      ghlCircuitBreaker.record429();
      console.log(`[GHL] Rate limited (429) fetching messages for ${conversationId} — failing fast`);
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GHL] Messages API error: ${response.status} - ${errorText}`);
      return [];
    }

    ghlCircuitBreaker.recordSuccess();
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
interface RecordingResult {
  buffer: Buffer;
  contentType: string;
}

async function fetchCallRecording(messageId: string): Promise<RecordingResult | null> {
  const creds = getActiveCredentials();
  const url = `${GHL_API_BASE}/conversations/messages/${messageId}/locations/${creds.locationId}/recording`;

  // Fail fast: skip if circuit breaker is open
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[GHL] Circuit breaker open — skipping fetchCallRecording for ${messageId}`);
    return null;
  }

  try {
    console.log(`[GHL] Fetching recording for message ${messageId}`);
    ghlCircuitBreaker.recordRequest();
    const response = await oauthAwareFetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-04-15",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });

    if (!response.ok) {
      if (response.status === 429) {
        ghlCircuitBreaker.record429();
        console.log(`[GHL] Rate limited (429) fetching recording for ${messageId} — failing fast`);
        return null;
      }
      if (response.status === 404) {
        console.log(`[GHL] No recording found for message ${messageId}`);
        return null;
      }
      const errorText = await response.text();
      console.error(`[GHL] Recording API error: ${response.status} - ${errorText}`);
      return null;
    }
    ghlCircuitBreaker.recordSuccess();

    // The API returns the audio file directly as binary data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Check if we got actual audio data (should be more than a few bytes)
    if (buffer.length < 1000) {
      console.log(`[GHL] Recording too small (${buffer.length} bytes), likely not a valid recording`);
      return null;
    }

    // Detect actual content type from response headers and magic bytes
    let contentType = response.headers.get('content-type') || 'audio/mpeg';
    // Detect format from magic bytes if content-type is generic
    if (contentType === 'application/octet-stream' || contentType === 'binary/octet-stream' || !contentType.startsWith('audio/')) {
      contentType = detectAudioFormat(buffer);
    }

    console.log(`[GHL] Successfully fetched recording (${buffer.length} bytes, type: ${contentType})`);
    return { buffer, contentType };
  } catch (error) {
    console.error(`[GHL] Error fetching recording for message ${messageId}:`, error);
    return null;
  }
}

/**
 * Detect audio format from magic bytes in the buffer
 */
function detectAudioFormat(buffer: Buffer): string {
  if (buffer.length < 12) return 'audio/mpeg';
  
  // WAV: starts with RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) {
    return 'audio/wav';
  }
  // OGG: starts with OggS
  if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return 'audio/ogg';
  }
  // FLAC: starts with fLaC
  if (buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43) {
    return 'audio/flac';
  }
  // MP4/M4A: has ftyp marker at offset 4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return 'audio/mp4';
  }
  // WebM: starts with 0x1A45DFA3 (EBML header)
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    return 'audio/webm';
  }
  // MP3: starts with ID3 tag or sync bytes (0xFF 0xFB/0xF3/0xF2)
  if ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer[0] === 0xFF && (buffer[1] === 0xFB || buffer[1] === 0xF3 || buffer[1] === 0xF2))) {
    return 'audio/mpeg';
  }
  // Default to WAV since GHL often returns WAV without proper headers
  console.log(`[GHL] Unknown audio format, first bytes: ${buffer.slice(0, 8).toString('hex')}, defaulting to audio/wav`);
  return 'audio/wav';
}

/**
 * Upload recording to S3 and return the URL
 */
async function uploadRecordingToS3(buffer: Buffer, callId: string, contentType: string = 'audio/mpeg'): Promise<string | null> {
  try {
    // Map content type to file extension
    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
      'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/x-wav': 'wav',
      'audio/ogg': 'ogg', 'audio/flac': 'flac',
      'audio/mp4': 'm4a', 'audio/m4a': 'm4a',
      'audio/webm': 'webm',
    };
    const ext = extMap[contentType] || 'wav';
    const filename = `ghl-recordings/${callId}-${Date.now()}.${ext}`;
    const result = await storagePut(filename, buffer, contentType);
    console.log(`[GHL] Uploaded recording to S3: ${result.url} (${contentType})`);
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
      
      // Include ALL calls regardless of duration — short calls and missed calls
      // still count as dial attempts for AM/PM tracking and activity visibility.
      // The grading pipeline handles short calls gracefully (creates "skipped" records).

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

  // Two-pass approach for comprehensive call coverage:
  // Pass 1 (TYPE_CALL): Conversations where the last message was a call.
  //   3 pages (300 convos) — catches calls that weren't followed by SMS/email.
  //   No startDate cutoff since the 100th conversation's lastMessageDate is often
  //   before startDate even though newer call conversations exist on later pages.
  // Pass 2 (ALL): Most recently active conversations regardless of message type.
  //   3 pages (300 convos) — catches calls followed by SMS/email activity,
  //   which is where GHL dialer calls often end up (call → auto-SMS follow-up).
  // Deduplicate by conversation ID to avoid processing the same conversation twice.
  // Note: 3+3 pages yields ~500-600 unique conversations, which takes ~13 min to process.
  // This fits within the 25-min tenant timeout with room to spare.

  console.log(`[GHL] Pass 1: Fetching TYPE_CALL conversations (3 pages)...`);
  const callConversations = await fetchGHLConversations({
    limit,
    lastMessageType: "TYPE_CALL",
    maxPages: 3,
    label: " [CALL]",
  });

  console.log(`[GHL] Pass 2: Fetching recent conversations - all types (3 pages)...`);
  const recentConversations = await fetchGHLConversations({
    startDate,
    limit,
    maxPages: 3,
    label: " [ALL]",
  });

  // Deduplicate: merge both sets, preferring unique conversation IDs
  const seenIds = new Set<string>();
  const conversations: typeof callConversations = [];
  for (const conv of [...callConversations, ...recentConversations]) {
    if (!seenIds.has(conv.id)) {
      seenIds.add(conv.id);
      conversations.push(conv);
    }
  }

  console.log(`[GHL] Combined: ${conversations.length} unique phone conversations (${callConversations.length} from TYPE_CALL + ${recentConversations.length} from recent, ${callConversations.length + recentConversations.length - conversations.length} duplicates removed)`);

  const allCalls: ProcessedGHLCall[] = [];
  let dateFilteredOut = 0;

  // Fetch messages for each conversation to find calls with recordings
  // Add spacing between requests to avoid GHL rate limiting (100 req/min limit)
  for (let convIdx = 0; convIdx < conversations.length; convIdx++) {
    const conv = conversations[convIdx];
    // Add 0.25s delay between conversation message fetches to stay under rate limit
    // GHL rate limit is 100 req/min = 0.6s/req, but we have burst capacity.
    // 0.25s keeps us under sustained rate while allowing ~450 conversations
    // within the 12-minute tenant timeout (450 × 0.25s = 112s + API time ≈ 450s).
    if (convIdx > 0) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    // Fail fast: stop fetching messages if circuit breaker tripped mid-loop
    if (!ghlCircuitBreaker.canProceed("normal")) {
      console.log(`[GHL] Circuit breaker tripped mid-fetch at conversation ${convIdx}/${conversations.length} — returning ${allCalls.length} calls found so far`);
      break;
    }

    const messages = await fetchConversationMessages(conv.id);
    const calls = extractCallsFromMessages(conv, messages);
    
    // Filter by date if needed
    if (startDate) {
      const startTime = startDate.getTime();
      for (const c of calls) {
        const callTime = new Date(c.dateAdded).getTime();
        if (callTime >= startTime) {
          allCalls.push(c);
        } else {
          dateFilteredOut++;
          if (dateFilteredOut <= 2) {
            console.log(`[GHL] Date filtered: call ${c.id} dateAdded=${c.dateAdded} (${new Date(c.dateAdded).toISOString()}) < startDate ${startDate.toISOString()}`);
          }
        }
      }
    } else {
      allCalls.push(...calls);
    }
  }

  console.log(`[GHL] Found ${allCalls.length} calls (all durations)${dateFilteredOut > 0 ? ` (${dateFilteredOut} filtered out by date)` : ''}`);
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
 * Fetch a GHL contact's address by contactId.
 * Returns a formatted property address string, or null if not available.
 */
async function fetchGHLContactDetails(contactId: string): Promise<{ address: string | null; name: string | null }> {
  // Fail fast: skip if circuit breaker is open
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[GHL] Circuit breaker open — skipping fetchGHLContactDetails for ${contactId}`);
    return { address: null, name: null };
  }

  try {
    const creds = getActiveCredentials();
    const url = `${GHL_API_BASE}/contacts/${contactId}`;
    const response = await oauthAwareFetch(url, {
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });
    ghlCircuitBreaker.recordRequest();
    if (!response.ok) {
      if (response.status === 429) ghlCircuitBreaker.record429();
      console.warn(`[GHL] Failed to fetch contact ${contactId}: ${response.status}`);
      return { address: null, name: null };
    }
    ghlCircuitBreaker.recordSuccess();
    const data = await response.json();
    const contact = data.contact || data;
    // Build address from available fields
    const parts: string[] = [];
    if (contact.address1) parts.push(contact.address1);
    if (contact.city) parts.push(contact.city);
    if (contact.state) {
      const stateZip = contact.postalCode ? `${contact.state} ${contact.postalCode}` : contact.state;
      parts.push(stateZip);
    }
    const address = parts.join(", ").trim();
    // Get contact name
    const name = contact.contactName || contact.name || 
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null;
    return { address: address || null, name };
  } catch (error) {
    console.warn(`[GHL] Error fetching contact details for ${contactId}:`, error);
    return { address: null, name: null };
  }
}

// Backward-compatible wrapper
async function fetchGHLContactAddress(contactId: string): Promise<string | null> {
  const { address } = await fetchGHLContactDetails(contactId);
  return address;
}

// Exported wrapper for contact name resolution (used by grading.ts retry)
export async function fetchGHLContactName(contactId: string): Promise<string | null> {
  const { name } = await fetchGHLContactDetails(contactId);
  return name;
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
    const skipReason = `Could not match team member (GHL userId: ${ghlCall.userId || 'none'}, userName: ${ghlCall.userName || 'unknown'})`;
    console.log(`[GHL] ${skipReason} for call ${ghlCall.id}`);
    // Create a skipped call record so it shows in Needs Review for admin visibility
    try {
      await createCall({
        ghlCallId: ghlCall.id,
        ghlContactId: ghlCall.contactId,
        contactName: ghlCall.contactName,
        contactPhone: ghlCall.contactPhone,
        duration: ghlCall.duration,
        callDirection: ghlCall.direction || "outbound",
        callType: "qualification",
        status: "skipped",
        classification: "pending",
        classificationReason: skipReason,
        callTimestamp: new Date(ghlCall.dateAdded),
        tenantId: creds.tenantId,
      });
      console.log(`[GHL] Created skipped call record for unmatched call ${ghlCall.id}`);
    } catch (e) {
      // Ignore duplicate key errors (call already recorded)
      const errMsg = e instanceof Error ? e.message : String(e);
      if (!errMsg.includes('Duplicate')) {
        console.warn(`[GHL] Failed to create skipped record for ${ghlCall.id}:`, e);
      }
    }
    return { success: true, skipped: true, reason: skipReason };
  }

  try {
    // Fetch the recording from GHL
    console.log(`[GHL] Fetching recording for call ${ghlCall.id}...`);
    const recordingResult = await fetchCallRecording(ghlCall.id);
    
    if (!recordingResult) {
      const skipReason = `No recording available from GHL (call ${ghlCall.duration}s with ${ghlCall.contactName || 'unknown contact'})`;
      console.log(`[GHL] ${skipReason} for call ${ghlCall.id}`);
      // Create a skipped call record so admins can see it in Needs Review
      try {
        await createCall({
          ghlCallId: ghlCall.id,
          ghlContactId: ghlCall.contactId,
          contactName: ghlCall.contactName,
          contactPhone: ghlCall.contactPhone,
          duration: ghlCall.duration,
          callDirection: ghlCall.direction || "outbound",
          teamMemberId: teamMember.id,
          teamMemberName: teamMember.name,
          callType: teamMember.role === "lead_generator" ? "cold_call" : "qualification",
          status: "skipped",
          classification: "pending",
          classificationReason: skipReason,
          callTimestamp: new Date(ghlCall.dateAdded),
          tenantId: teamMember.tenantId,
        });
        console.log(`[GHL] Created skipped call record for no-recording call ${ghlCall.id}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (!errMsg.includes('Duplicate')) {
          console.warn(`[GHL] Failed to create skipped record for ${ghlCall.id}:`, e);
        }
      }
      return { success: true, skipped: true, reason: skipReason };
    }

    // Upload to S3 with correct content type
    const recordingUrl = await uploadRecordingToS3(recordingResult.buffer, ghlCall.id, recordingResult.contentType);
    if (!recordingUrl) {
      return { success: false, reason: "Failed to upload recording to S3" };
    }

    // Fetch property address and contact name from GHL contact
    let propertyAddress: string | undefined;
    let resolvedContactName = ghlCall.contactName;
    if (ghlCall.contactId) {
      const contactDetails = await fetchGHLContactDetails(ghlCall.contactId);
      if (contactDetails.address) {
        propertyAddress = contactDetails.address;
        console.log(`[GHL] Got property address for contact ${ghlCall.contactId}: ${contactDetails.address}`);
      }
      // Fill in contact name if missing from conversation data
      if (!resolvedContactName && contactDetails.name) {
        resolvedContactName = contactDetails.name;
        console.log(`[GHL] Resolved contact name from API: ${resolvedContactName}`);
      }
    }

    // Create the call record with tenantId from team member
    const call = await createCall({
      ghlCallId: ghlCall.id,
      ghlContactId: ghlCall.contactId,
      contactName: resolvedContactName,
      contactPhone: ghlCall.contactPhone,
      propertyAddress: propertyAddress,
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
    // Check circuit breaker before making background GHL calls
    if (!ghlCircuitBreaker.canProceed("normal")) {
      const status = ghlCircuitBreaker.getStatus();
      console.log(`[GHL] Circuit breaker is ${status.state} — skipping background poll (cooldown: ${Math.round(status.cooldownRemainingMs / 1000)}s remaining)`);
      isPolling = false;
      return { success: true, synced: 0, skipped: 0, failed: 0, errors: ["Circuit breaker open, skipping poll"] };
    }

    // Proactively refresh any OAuth tokens that are close to expiry (within 2 hours)
    try {
      await proactiveRefreshAllTokens();
    } catch (err) {
      console.warn(`[GHL] Proactive token refresh error (non-fatal):`, err);
    }

    // Get all tenants with CRM connected
    const crmTenants = await getTenantsWithCrm();
    
    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      // Load credentials: OAuth tokens first, then legacy API key
      const pollingCreds = await loadGHLCredentials(tenant.id, tenant.name, config);
      if (!pollingCreds) {
        console.log(`[GHL] Tenant ${tenant.id} (${tenant.name}) no GHL credentials (OAuth or API key), skipping`);
        continue;
      }

      // Set active credentials for this tenant
      setActiveCredentials({
        apiKey: pollingCreds.apiKey,
        locationId: pollingCreds.locationId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        isOAuth: pollingCreds.isOAuth,
        dispoPipelineName: pollingCreds.dispoPipelineName,
        newDealStageName: pollingCreds.newDealStageName,
      });

      // Add delay between tenants to avoid GHL rate limiting
      if (crmTenants.indexOf(tenant) > 0) {
        console.log(`[GHL] Waiting 15s before polling next tenant to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }

      // Skip tenants with too many consecutive 401 failures (broken API keys)
      const consecutive401s = tenant401Failures.get(tenant.id) || 0;
      if (consecutive401s >= MAX_CONSECUTIVE_401) {
        console.log(`[GHL] Skipping tenant ${tenant.id} (${tenant.name}) — ${consecutive401s} consecutive 401 failures. Fix API key in Settings.`);
        continue;
      }

      try {
        const startDate = lastPollTimestamp || new Date(Date.now() - 72 * 60 * 60 * 1000);
        const endDate = new Date();

        console.log(`[GHL] Polling tenant ${tenant.id} (${tenant.name}) from ${startDate.toISOString()} to ${endDate.toISOString()}`);

        // Per-tenant timeout: 5 minutes max per tenant to prevent blocking
        const TENANT_TIMEOUT_MS = 25 * 60 * 1000; // 25 min to accommodate up to 600 conversations from 3+3 page passes
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
        // Reset 401 counter on success
        tenant401Failures.delete(tenant.id);
      } catch (tenantError) {
        const errMsg = tenantError instanceof Error ? tenantError.message : "Unknown error";
        console.error(`[GHL] Error polling tenant ${tenant.id} (${tenant.name}):`, tenantError);
        
        // Track 401 failures separately — don't let one bad tenant block others
        if (errMsg.includes("401")) {
          const count = (tenant401Failures.get(tenant.id) || 0) + 1;
          tenant401Failures.set(tenant.id, count);
          console.warn(`[GHL] Tenant ${tenant.id}: 401 failure #${count}/${MAX_CONSECUTIVE_401} — will auto-skip after ${MAX_CONSECUTIVE_401}`);
          // Don't count 401s as poll errors that block lastPollTimestamp advancement
          continue;
        }
        results.errors.push(`Tenant ${tenant.id}: ${errMsg}`);
      }
    }

    // Only update lastPollTimestamp if the poll completed without critical errors.
    // 401 errors from individual tenants are excluded (handled per-tenant above).
    // Only real failures (timeouts, rate limits) should block timestamp advancement.
    if (results.failed === 0 && results.errors.length === 0) {
      lastPollTimestamp = new Date();
      console.log(`[GHL] Poll successful — advancing lastPollTimestamp to ${lastPollTimestamp.toISOString()}`);
    } else {
      console.log(`[GHL] Poll had errors/failures — NOT advancing lastPollTimestamp (staying at ${lastPollTimestamp?.toISOString() || 'null'} to retry missed calls)`);
    }

  } catch (error) {
    results.success = false;
    results.errors.push(error instanceof Error ? error.message : "Unknown error");
    console.log(`[GHL] Poll threw error — NOT advancing lastPollTimestamp (staying at ${lastPollTimestamp?.toISOString() || 'null'})`);
  } finally {
    isPolling = false;
    activeCredentials = null; // Clear credentials after polling
  }

  console.log(`[GHL] Poll complete: ${results.synced} synced, ${results.skipped} skipped, ${results.failed} failed`);
  return results;
}

// Current polling interval in minutes
let currentIntervalMinutes: number = 5;

// Archival job interval (runs daily)
let archivalInterval: ReturnType<typeof setInterval> | null = null;
let lastArchivalTime: Date | null = null;

// Weekly insights generation (runs Monday mornings)
let insightsInterval: ReturnType<typeof setInterval> | null = null;
let lastInsightsTime: Date | null = null;

// Hourly opportunity detection
let opportunityDetectionInterval: ReturnType<typeof setInterval> | null = null;
let lastOpportunityDetectionTime: Date | null = null;

// Stuck call retry interval
let stuckCallRetryInterval: ReturnType<typeof setInterval> | null = null;

// GHL property address backfill interval (runs every 30 minutes)
let addressBackfillInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Automatically retry calls stuck in intermediate processing states (transcribing, classifying, grading)
 * for more than 1 hour. Resets them to pending and re-triggers processing.
 */
async function retryStuckCalls(): Promise<void> {
  try {
    const allTenants = await getAllTenants();
    let totalReset = 0;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Shorter backoff for pending calls that were never picked up - no reason to wait long
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    // Shorter backoff for 404 errors - recordings may become available within minutes
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

    for (const tenant of allTenants) {
      // Get all non-completed calls for this tenant (high limit to catch all stuck ones)
      const allCalls = await getCalls({ tenantId: tenant.id, limit: 500 });
      // Catch calls stuck in processing states (transcribing/classifying/grading) for >1 hour
      const stuckProcessing = allCalls.filter((call: any) =>
        (call.status === 'transcribing' || call.status === 'classifying' || call.status === 'grading') &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      // Also catch calls stuck at 'pending' for >10 min — these were never picked up
      // (reduced from 1 hour: pending calls should process immediately, so 10 min is plenty)
      const stuckPending = allCalls.filter((call: any) =>
        call.status === 'pending' &&
        call.recordingUrl && // Must have a recording to process
        call.updatedAt && new Date(call.updatedAt) < tenMinAgo
      );

      // Failed calls with 404 errors (recording not yet available) - retry after 15 min
      const failed404 = allCalls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl &&
        call.classificationReason &&
        (call.classificationReason.includes('HTTP 404') ||
         call.classificationReason.includes('recording not available')) &&
        call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo
      );

      // Other failed calls with recording/transcription issues - retry after 1 hour
      // (e.g., after fixing audio format detection, rate limits cleared)
      const failedOther = allCalls.filter((call: any) =>
        call.status === 'failed' &&
        call.recordingUrl && // Has a recording URL
        call.classificationReason && 
        !(call.classificationReason.includes('HTTP 404') || call.classificationReason.includes('recording not available')) &&
        (call.classificationReason.includes('Invalid file format') || 
         call.classificationReason.includes('Failed to download audio') ||
         call.classificationReason.includes('Transcription service request failed') ||
         call.classificationReason.includes('429 Too Many') ||
         call.classificationReason.includes('Voice transcription failed') ||
         call.classificationReason.includes('Invalid transcription response') ||
         call.classificationReason.includes('transient DB error')) &&
        call.updatedAt && new Date(call.updatedAt) < oneHourAgo
      );

      const failedRecording = [...failed404, ...failedOther];

      // Skipped calls with no recording but meaningful duration (>30s) — GHL may not have had
      // the recording ready at sync time. Retry after 15 min, up to 6 hours after creation.
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const skippedNoRecording = allCalls.filter((call: any) =>
        call.status === 'skipped' &&
        !call.recordingUrl &&
        call.ghlCallId && // Must be a GHL call to re-fetch
        call.duration && call.duration > 30 && // Only retry calls with meaningful duration
        call.classificationReason &&
        call.classificationReason.includes('No recording available') &&
        call.updatedAt && new Date(call.updatedAt) < fifteenMinAgo &&
        call.createdAt && new Date(call.createdAt) > sixHoursAgo // Only retry recent calls (within 6 hours)
      );

      const stuckCalls = [...stuckProcessing, ...stuckPending, ...failedRecording];

      for (const call of stuckCalls) {
        const isPending = call.status === 'pending';
        const isFailed = call.status === 'failed';
        console.log(`[StuckCallRetry] ${isFailed ? 'Retrying failed' : isPending ? 'Processing missed' : 'Resetting stuck'} call ${call.id} (${call.contactName}, status: ${call.status}, updated: ${call.updatedAt})`);
        if (!isPending) {
          await updateCall(call.id, {
            status: 'pending',
            classificationReason: isFailed 
              ? `Auto-retry from failed state — previous error: ${(call.classificationReason || '').substring(0, 100)}`
              : `Auto-reset from stuck '${call.status}' state — retrying processing`,
          });
        }
        callProcessingQueue.add(() => processCall(call.id)).catch((err: any) => {
          console.error(`[StuckCallRetry] Error reprocessing call ${call.id}:`, err);
        });
        totalReset++;
      }

      // Auto-retry skipped no-recording calls by re-fetching from GHL
      for (const call of skippedNoRecording) {
        console.log(`[StuckCallRetry] Re-fetching recording for skipped call ${call.id} (${call.contactName}, ${call.duration}s, created: ${call.createdAt})`);
        try {
          const result = await resyncCallRecording(call.id);
          if (result.success) {
            console.log(`[StuckCallRetry] Successfully re-synced recording for call ${call.id}: ${result.message}`);
            totalReset++;
          } else {
            // Update the updatedAt timestamp so we don't retry too aggressively
            await updateCall(call.id, {
              classificationReason: `No recording available from GHL (call ${call.duration}s with ${call.contactName || 'unknown'}) — auto-retry failed: ${result.message}`,
            });
            console.log(`[StuckCallRetry] Re-sync failed for call ${call.id}: ${result.message}`);
          }
        } catch (err) {
          console.error(`[StuckCallRetry] Error re-syncing call ${call.id}:`, err);
        }
      }
    }

    if (totalReset > 0) {
      console.log(`[StuckCallRetry] Reset and requeued ${totalReset} stuck calls`);
    }
  } catch (error) {
    console.error("[StuckCallRetry] Error:", error);
  }
}

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
            // Enforce max 50 char title to prevent UI truncation
            const truncatedTitle = item.title.length > 50 ? item.title.substring(0, 47) + '...' : item.title;
            await createTeamTrainingItem({
              tenantId: tenant.id,
              itemType: item.itemType,
              title: truncatedTitle,
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
export function startPolling(intervalMinutes: number = 5): void {
  if (pollInterval) {
    console.log("[GHL] Polling already started");
    return;
  }

  currentIntervalMinutes = intervalMinutes;
  const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  console.log(`[GHL] Starting polling mode (every 10 minutes)`);
  
  // Initial sync — fetch recent calls for all tenants immediately
  pollForNewCalls()
    .catch(err => console.error("[GHL] Initial sync error:", err));

  // Regular polling every 10 minutes
  const scheduleNextPoll = () => {
    pollInterval = setTimeout(async () => {
      console.log(`[GHL] Running scheduled poll (10-minute interval)`);
      try {
        await pollForNewCalls();
      } catch (err) {
        console.error("[GHL] Poll error:", err);
      }
      scheduleNextPoll(); // Schedule next iteration
    }, POLL_INTERVAL_MS);
  };
  scheduleNextPoll();

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

  // Start stuck call retry (every 10 minutes - fast enough to catch 404 retries for recent recordings)
  if (!stuckCallRetryInterval) {
    console.log("[StuckCallRetry] Starting automatic stuck call retry (every 10 minutes)");
    // Run initial check after 2 minutes
    setTimeout(() => {
      retryStuckCalls().catch(err => console.error("[StuckCallRetry] Initial run error:", err));
    }, 2 * 60 * 1000);

    // Then run every 10 minutes
    stuckCallRetryInterval = setInterval(() => {
      retryStuckCalls().catch(err => console.error("[StuckCallRetry] Scheduled run error:", err));
    }, 10 * 60 * 1000); // 10 minutes
  }

  // Start opportunity detection every 2 hours (reduced from 1 hour to save API quota)
  if (!opportunityDetectionInterval) {
    console.log("[OpportunityDetection] Starting opportunity detection scheduler (every 2 hours)");
    // Run initial detection after 15-minute delay (staggered from call sync and opportunity poll)
    setTimeout(() => {
      runOpportunityDetection()
        .then(result => {
          lastOpportunityDetectionTime = new Date();
          console.log(`[OpportunityDetection] Initial run: detected ${result.detected}, errors ${result.errors}`);
        })
        .catch(err => console.error("[OpportunityDetection] Initial run error:", err));
    }, 15 * 60 * 1000); // Wait 15 minutes after startup

    // Then run every 2 hours
    opportunityDetectionInterval = setInterval(() => {
      runOpportunityDetection()
        .then(result => {
          lastOpportunityDetectionTime = new Date();
          console.log(`[OpportunityDetection] Scheduled run: detected ${result.detected}, errors ${result.errors}`);
        })
        .catch(err => console.error("[OpportunityDetection] Scheduled run error:", err));
    }, 2 * 60 * 60 * 1000); // 2 hours
  }

  // Start GHL property address backfill (every 30 minutes)
  if (!addressBackfillInterval) {
    console.log("[GHL Backfill] Starting automatic address backfill (every 30 minutes)");
    // Run initial backfill after 5 minutes
    setTimeout(() => {
      backfillGHLPropertyAddresses()
        .then(result => {
          console.log(`[GHL Backfill] Initial run: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
        })
        .catch(err => console.error("[GHL Backfill] Initial run error:", err));
    }, 5 * 60 * 1000);

    // Then run every 30 minutes
    addressBackfillInterval = setInterval(() => {
      backfillGHLPropertyAddresses()
        .then(result => {
          console.log(`[GHL Backfill] Scheduled run: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
        })
        .catch(err => console.error("[GHL Backfill] Scheduled run error:", err));
    }, 30 * 60 * 1000); // 30 minutes
  }

  // Start daily correction pattern monitor
  startCorrectionMonitor();
}

/**
 * Stop automatic polling
 */
export function stopPolling(): void {
  // Stop opportunity polling
  stopOpportunityPolling();
  if (pollInterval) {
    clearTimeout(pollInterval);
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
  if (stuckCallRetryInterval) {
    clearInterval(stuckCallRetryInterval);
    stuckCallRetryInterval = null;
    console.log("[StuckCallRetry] Stopped");
  }
  stopCorrectionMonitor();
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

// Pipeline cache — pipelines rarely change, so cache for 60 minutes
const pipelineCache = new Map<string, { data: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>; expiresAt: number }>();
const PIPELINE_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

/**
 * Fetch opportunities from GHL
 */
async function fetchOpportunities(startDate?: Date): Promise<GHLOpportunity[]> {
  const creds = getActiveCredentials();

  // Fail fast: skip if circuit breaker is open
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[GHL Opportunities] Circuit breaker open — skipping fetchOpportunities`);
    return [];
  }

  try {
    const url = new URL(`${GHL_API_BASE}/opportunities/search`);
    url.searchParams.set("location_id", creds.locationId);
    
    const response = await oauthAwareFetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Content-Type": "application/json",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });
    ghlCircuitBreaker.recordRequest();
    
    if (!response.ok) {
      if (response.status === 429) ghlCircuitBreaker.record429();
      console.error(`[GHL Opportunities] API error: ${response.status}`);
      return [];
    }
    
    ghlCircuitBreaker.recordSuccess();
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
  const creds = getActiveCredentials();
  const cacheKey = `${creds.tenantId}-${creds.locationId}`;

  // Check pipeline cache first (pipelines rarely change)
  const cached = pipelineCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[GHL Pipelines] Using cached pipelines for tenant ${creds.tenantId} (${cached.data.length} pipelines)`);
    return cached.data;
  }

  // Fail fast: skip if circuit breaker is open
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[GHL Pipelines] Circuit breaker open — skipping getPipelines`);
    // Return stale cache if available rather than empty
    return cached?.data || [];
  }

  try {
    ghlCircuitBreaker.recordRequest();
    const response = await oauthAwareFetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${creds.locationId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.apiKey}`,
        "Version": "2021-07-28",
        "Content-Type": "application/json",
      },
    }, {
      tenantId: creds.tenantId,
      isOAuth: creds.isOAuth,
      apiKey: creds.apiKey,
      onTokenRefreshed: (t) => { creds.apiKey = t; },
    });

    if (response.status === 429) {
      ghlCircuitBreaker.record429();
      console.log(`[GHL Pipelines] Rate limited (429) — failing fast`);
      return cached?.data || [];
    }

    if (!response.ok) {
      console.error(`[GHL Pipelines] API error: ${response.status}`);
      return cached?.data || [];
    }

    ghlCircuitBreaker.recordSuccess();
    const data = await response.json();
    const pipelines = data.pipelines || [];

    // Cache the result for 60 minutes
    pipelineCache.set(cacheKey, { data: pipelines, expiresAt: Date.now() + PIPELINE_CACHE_TTL });
    console.log(`[GHL Pipelines] Cached ${pipelines.length} pipelines for tenant ${creds.tenantId}`);

    return pipelines;
  } catch (error) {
    console.error("[GHL Pipelines] Fetch error:", error);
    return cached?.data || [];
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
  
  // Check circuit breaker before background GHL calls
  if (!ghlCircuitBreaker.canProceed("normal")) {
    const status = ghlCircuitBreaker.getStatus();
    console.log(`[GHL Opportunities] Circuit breaker is ${status.state} — skipping opportunity poll (cooldown: ${Math.round(status.cooldownRemainingMs / 1000)}s remaining)`);
    return result;
  }

  try {
    // Get all tenants with CRM connected
    const crmTenants = await getTenantsWithCrm();
    
    for (const tenant of crmTenants) {
      const config = parseCrmConfig(tenant);
      // Load credentials: OAuth tokens first, then legacy API key
      const pollingCreds = await loadGHLCredentials(tenant.id, tenant.name, config);
      if (!pollingCreds) continue;

      // Add delay between tenants to avoid GHL rate limiting
      if (crmTenants.indexOf(tenant) > 0) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      setActiveCredentials({
        apiKey: pollingCreds.apiKey,
        locationId: pollingCreds.locationId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        isOAuth: pollingCreds.isOAuth,
        dispoPipelineName: pollingCreds.dispoPipelineName,
        newDealStageName: pollingCreds.newDealStageName,
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
 * Start opportunity polling (every 30 minutes)
 * Reduced from 5 min to 30 min to stay under GHL 100 req/min rate limit
 */
export function startOpportunityPolling(): void {
  if (opportunityPollInterval) {
    return; // Already running
  }
  
  console.log("[GHL Opportunities] Starting hybrid opportunity polling (initial sync + 2-hour fallback)");
  
  // HYBRID MODE:
  // 1. Initial poll after 10 min delay for onboarding
  // 2. Ongoing polling reduced to every 2 hours as fallback
  // 3. Primary real-time sync is handled by GHL webhooks (OpportunityCreate/Update events)
  
  // Initial poll after 10 min delay (staggered from call sync)
  setTimeout(() => {
    pollOpportunities().catch(err => console.error("[GHL Opportunities] Initial sync error:", err));
  }, 10 * 60 * 1000);
  
  // Adaptive fallback polling for opportunities (same logic as call sync)
  const OPP_BASE_FALLBACK_MS = 2 * 60 * 60 * 1000; // 2 hours
  const OPP_WEBHOOK_ACTIVE_FALLBACK_MS = 6 * 60 * 60 * 1000; // 6 hours
  let oppNextFallbackMs = OPP_BASE_FALLBACK_MS;

  const scheduleNextOppPoll = () => {
    opportunityPollInterval = setTimeout(async () => {
      console.log(`[GHL Opportunities] Running fallback poll (${oppNextFallbackMs / (60 * 60 * 1000)}-hour safety net)`);
      try {
        await pollOpportunities();
      } catch (err) {
        console.error("[GHL Opportunities] Fallback poll error:", err);
      }

      // Check webhook activity to adjust next interval
      try {
        const { isTenantWebhookActive } = await import("./webhook");
        const tenantsList = await getTenantsWithCrm();
        const anyWebhookActive = await Promise.all(
          tenantsList.map(t => isTenantWebhookActive(t.id))
        ).then(results => results.some(Boolean));
        oppNextFallbackMs = anyWebhookActive ? OPP_WEBHOOK_ACTIVE_FALLBACK_MS : OPP_BASE_FALLBACK_MS;
      } catch {
        oppNextFallbackMs = OPP_BASE_FALLBACK_MS;
      }

      scheduleNextOppPoll(); // Schedule next iteration
    }, oppNextFallbackMs);
  };
  scheduleNextOppPoll();
}

/**
 * Stop opportunity polling
 */
export function stopOpportunityPolling(): void {
  if (opportunityPollInterval) {
    clearTimeout(opportunityPollInterval);
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

    // Load tenant credentials for this call (OAuth first, then API key)
    if (call.tenantId) {
      const tenant = await getTenantById(call.tenantId);
      if (tenant) {
        const config = parseCrmConfig(tenant);
        const pollingCreds = await loadGHLCredentials(tenant.id, tenant.name, config);
        if (pollingCreds) {
          setActiveCredentials({
            apiKey: pollingCreds.apiKey,
            locationId: pollingCreds.locationId,
            tenantId: tenant.id,
            tenantName: tenant.name,
            isOAuth: pollingCreds.isOAuth,
            dispoPipelineName: pollingCreds.dispoPipelineName,
            newDealStageName: pollingCreds.newDealStageName,
          });
        }
      }
    }

    console.log(`[GHL Resync] Re-syncing recording for call ${callId} (GHL ID: ${call.ghlCallId})`);

    // Fetch fresh recording from GHL
    const recordingResult = await fetchCallRecording(call.ghlCallId);
    
    if (!recordingResult) {
      return { 
        success: false, 
        message: "Recording no longer available from GHL - the file may have been deleted or expired" 
      };
    }

    // Upload to S3 with correct content type
    const newRecordingUrl = await uploadRecordingToS3(recordingResult.buffer, call.ghlCallId, recordingResult.contentType);
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

/**
 * Backfill property addresses for existing GHL calls that don't have one.
 * Looks up the GHL contact for each call and fetches the address.
 */
export async function backfillGHLPropertyAddresses(): Promise<{
  updated: number;
  skipped: number;
  errors: number;
}> {
  const { isNull, isNotNull, and } = await import("drizzle-orm");
  const { calls: callsTable } = await import("../drizzle/schema");
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) return { updated: 0, skipped: 0, errors: 0 };

  const results = { updated: 0, skipped: 0, errors: 0 };

  try {
    // Find GHL calls without property addresses
    const callsWithoutAddress = await db
      .select({
        id: callsTable.id,
        ghlContactId: callsTable.ghlContactId,
        tenantId: callsTable.tenantId,
      })
      .from(callsTable)
      .where(
        and(
          isNotNull(callsTable.ghlContactId),
          isNull(callsTable.propertyAddress)
        )
      )
      .limit(200); // Process in batches

    console.log(`[GHL Backfill] Found ${callsWithoutAddress.length} calls without property addresses`);

    // Group by tenantId to load credentials once per tenant
    const byTenant = new Map<number, typeof callsWithoutAddress>();
    for (const call of callsWithoutAddress) {
      if (!call.tenantId) continue;
      const group = byTenant.get(call.tenantId) || [];
      group.push(call);
      byTenant.set(call.tenantId, group);
    }

    for (const [tenantId, tenantCalls] of Array.from(byTenant.entries())) {
      // Load tenant credentials (OAuth first, then API key)
      const tenant = await getTenantById(tenantId);
      if (!tenant) continue;
      const config = parseCrmConfig(tenant);
      const pollingCreds = await loadGHLCredentials(tenant.id, tenant.name, config);
      if (!pollingCreds) continue;

      setActiveCredentials({
        apiKey: pollingCreds.apiKey,
        locationId: pollingCreds.locationId,
        tenantId: tenant.id,
        tenantName: tenant.name,
        isOAuth: pollingCreds.isOAuth,
        dispoPipelineName: pollingCreds.dispoPipelineName,
        newDealStageName: pollingCreds.newDealStageName,
      });

      // Cache contact addresses to avoid duplicate lookups
      const addressCache = new Map<string, string | null>();

      for (const call of tenantCalls) {
        try {
          if (!call.ghlContactId) { results.skipped++; continue; }

          let address = addressCache.get(call.ghlContactId);
          if (address === undefined) {
            address = await fetchGHLContactAddress(call.ghlContactId);
            addressCache.set(call.ghlContactId, address);
          }

          if (address) {
            await updateCall(call.id, { propertyAddress: address });
            results.updated++;
            console.log(`[GHL Backfill] Updated call ${call.id} with address: ${address}`);
          } else {
            results.skipped++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          results.errors++;
          console.warn(`[GHL Backfill] Error for call ${call.id}:`, err);
        }
      }
    }

    console.log(`[GHL Backfill] Complete: ${results.updated} updated, ${results.skipped} skipped, ${results.errors} errors`);
  } catch (error) {
    console.error("[GHL Backfill] Fatal error:", error);
  }

  return results;
}
