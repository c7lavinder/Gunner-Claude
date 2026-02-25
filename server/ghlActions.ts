/**
 * GHL Actions Service
 * Executes CRM actions in GoHighLevel on behalf of the AI Coach.
 * Supports: notes, pipeline stage changes, SMS, tasks, tags, field updates.
 */
import { getDb, getTeamMemberByUserId, getTeamMembers } from "./db";
import { coachActionLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { parseCrmConfig, getTenantById, type TenantCrmConfig } from "./tenant";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

interface GHLActionCredentials {
  apiKey: string;
  locationId: string;
}

export async function getCredentialsForTenant(tenantId: number): Promise<GHLActionCredentials | null> {
  const tenant = await getTenantById(tenantId);
  if (!tenant || !tenant.crmConfig) return null;
  
  const config = parseCrmConfig(tenant);
  if (!config?.ghlApiKey || !config?.ghlLocationId) return null;
  
  return {
    apiKey: config.ghlApiKey,
    locationId: config.ghlLocationId,
  };
}

export async function ghlFetch(
  creds: GHLActionCredentials,
  path: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const url = `${GHL_API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${creds.apiKey}`,
    "Version": "2021-07-28",
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GHL API error: ${response.status} - ${text}`);
  }

  return response.json();
}

// ============ CONTACT SEARCH ============

export async function searchContacts(
  tenantId: number,
  query: string
): Promise<Array<{ id: string; name: string; phone: string; email: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured for this tenant");

  try {
    const data = await ghlFetch(
      creds,
      `/contacts/?locationId=${creds.locationId}&query=${encodeURIComponent(query)}&limit=10`,
      "GET"
    );
    
    return (data.contacts || []).map((c: any) => ({
      id: c.id,
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown",
      phone: c.phone || "",
      email: c.email || "",
    }));
  } catch (error) {
    console.error("[GHLActions] Contact search error:", error);
    throw error;
  }
}

// ============ GET CONTACT BY ID ============

export async function getContact(
  tenantId: number,
  contactId: string
): Promise<{ id: string; name: string; phone: string; email: string; assignedTo?: string } | null> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return null;

  try {
    const data = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
    const c = data.contact || data;
    return {
      id: c.id,
      name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown",
      phone: c.phone || "",
      email: c.email || "",
      assignedTo: c.assignedTo || undefined,
    };
  } catch (error) {
    console.error(`[GHLActions] getContact error for ${contactId}:`, error);
    return null;
  }
}

// ============ ACTION 1: ADD NOTE TO CONTACT ============

export async function addNoteToContact(
  tenantId: number,
  contactId: string,
  noteBody: string
): Promise<{ success: boolean; noteId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const data = await ghlFetch(
    creds,
    `/contacts/${contactId}/notes`,
    "POST",
    { body: noteBody }
  );

  return { success: true, noteId: data.note?.id || data.id };
}

// ============ ACTION 2: ADD NOTE TO OPPORTUNITY ============

// GHL has no separate opportunity notes API — notes are always on contacts.
// This function adds a note to the contact (same as addNoteToContact).
export async function addNoteToOpportunity(
  tenantId: number,
  contactId: string,
  noteBody: string
): Promise<{ success: boolean; noteId?: string }> {
  return addNoteToContact(tenantId, contactId, noteBody);
}

// ============ OPPORTUNITY LOOKUP BY CONTACT ============

/**
 * Find ALL opportunities for a contact (across all pipelines).
 * Returns them sorted by most recently updated first.
 */
export async function findAllOpportunitiesByContact(
  tenantId: number,
  contactId: string
): Promise<Array<{ opportunityId: string; pipelineId: string; stageId: string; name: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/opportunities/search?location_id=${creds.locationId}&contact_id=${contactId}&limit=20`,
      "GET"
    );
    const opps = data.opportunities || [];
    if (opps.length === 0) return [];

    const sorted = opps.sort((a: any, b: any) => 
      new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    return sorted.map((opp: any) => ({
      opportunityId: opp.id,
      pipelineId: opp.pipelineId,
      stageId: opp.pipelineStageId,
      name: opp.name || opp.contactName || "Unknown",
    }));
  } catch (error) {
    console.error("[GHLActions] All opportunities lookup by contact error:", error);
    return [];
  }
}

export async function findOpportunityByContact(
  tenantId: number,
  contactId: string
): Promise<{ opportunityId: string; pipelineId: string; stageId: string; name: string } | null> {
  const opps = await findAllOpportunitiesByContact(tenantId, contactId);
  return opps.length > 0 ? opps[0] : null;
}

// ============ PIPELINE & STAGE RESOLUTION ============

export async function getPipelinesForTenant(
  tenantId: number
): Promise<Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/opportunities/pipelines?locationId=${creds.locationId}`,
      "GET"
    );
    return (data.pipelines || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
    }));
  } catch (error) {
    console.error("[GHLActions] Pipeline fetch error:", error);
    return [];
  }
}

// Common abbreviation mappings for real estate pipeline stages
const ABBREVIATION_MAP: Record<string, string[]> = {
  "apt": ["appointment", "appt", "call"],
  "appt": ["appointment", "apt", "call"],
  "appointment": ["apt", "appt", "call"],
  "call": ["apt", "appt", "appointment"],
  "qual": ["qualified", "qualification"],
  "qualified": ["qual"],
  "dq": ["disqualified", "disqualify", "dq'd"],
  "dq'd": ["disqualified", "disqualify", "dq"],
  "disqualified": ["dq", "dq'd"],
  "disqualify": ["dq", "dq'd"],
  "sched": ["scheduled"],
  "scheduled": ["sched"],
  "cxl": ["cancelled", "canceled"],
  "cancelled": ["cxl"],
  "canceled": ["cxl"],
  "prop": ["property"],
  "property": ["prop"],
  "neg": ["negotiation", "negotiating"],
  "negotiation": ["neg"],
  "insp": ["inspection"],
  "inspection": ["insp"],
  "ctr": ["contract"],
  "contract": ["ctr"],
  "pend": ["pending"],
  "pending": ["pend"],
  "fup": ["follow up", "followup"],
  "follow up": ["fup", "followup"],
  "followup": ["fup", "follow up"],
};

/**
 * Strip parenthetical content like "(3)" or "(New)" from stage names
 */
function stripParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

/**
 * Expand a word into all its possible abbreviation variants
 */
function expandWord(word: string): string[] {
  const lower = word.toLowerCase();
  const variants = [lower];
  if (ABBREVIATION_MAP[lower]) {
    variants.push(...ABBREVIATION_MAP[lower]);
  }
  return variants;
}

/**
 * Check if two strings are a fuzzy match considering abbreviations.
 * Splits both into words, expands abbreviations, and checks if all words
 * from one string have a match in the other.
 */
/**
 * Check if two words match, allowing substring matching only for short abbreviations (<=4 chars)
 * to prevent false positives like "disqualified" matching "qualified"
 */
function wordsMatch(word1: string, word2: string): boolean {
  if (word1 === word2) return true;
  // Only allow substring matching for short abbreviations
  const minLen = Math.min(word1.length, word2.length);
  if (minLen <= 4) {
    // Short word: allow it to be a prefix of the longer word
    const shorter = word1.length <= word2.length ? word1 : word2;
    const longer = word1.length <= word2.length ? word2 : word1;
    return longer.startsWith(shorter);
  }
  return false;
}

// Compound words that should be treated as equivalent
const COMPOUND_NORMALIZATIONS: Record<string, string> = {
  "followup": "follow up",
  "follow-up": "follow up",
  "setup": "set up",
  "set-up": "set up",
  "callback": "call back",
  "call-back": "call back",
  "walkthrough": "walk through",
  "walk-through": "walk through",
};

function normalizeCompounds(text: string): string {
  let result = text.toLowerCase();
  for (const [compound, expanded] of Object.entries(COMPOUND_NORMALIZATIONS)) {
    result = result.replace(new RegExp(`\\b${compound}\\b`, "g"), expanded);
  }
  return result;
}

function fuzzyStageMatch(userInput: string, actualName: string): boolean {
  // Normalize compound words before splitting
  const normalizedInput = normalizeCompounds(userInput);
  const normalizedActual = normalizeCompounds(actualName);
  
  const inputWords = normalizedInput.split(/\s+/).filter(Boolean);
  const actualWords = normalizedActual.split(/\s+/).filter(Boolean);

  // Filter out common filler words that shouldn't affect matching
  const fillerWords = new Set(["stage", "the", "to", "in", "a", "an"]);
  const filteredInput = inputWords.filter(w => !fillerWords.has(w));
  const filteredActual = actualWords.filter(w => !fillerWords.has(w));

  if (filteredInput.length === 0 || filteredActual.length === 0) return false;

  // Check if every actual word (or its abbreviation) matches some input word (or its abbreviation)
  const actualMatchesInput = filteredActual.every(aw => {
    const aVariants = expandWord(aw);
    return aVariants.some(av => {
      return filteredInput.some(iw => {
        const iVariants = expandWord(iw);
        return iVariants.some(iv => wordsMatch(av, iv));
      });
    });
  });

  // Check if every input word (or its abbreviation) matches some actual word (or its abbreviation)
  const inputMatchesActual = filteredInput.every(iw => {
    const iVariants = expandWord(iw);
    return iVariants.some(iv => {
      return filteredActual.some(aw => {
        const aVariants = expandWord(aw);
        return aVariants.some(av => wordsMatch(iv, av));
      });
    });
  });

  // Both directions must match to prevent false positives
  return actualMatchesInput && inputMatchesActual;
}

export function resolveStageByName(
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>,
  stageName: string,
  pipelineName?: string
): { pipelineId: string; stageId: string; pipelineName: string; stageName: string } | null {
  const normalizedStage = stageName.toLowerCase().trim();
  const normalizedPipeline = pipelineName?.toLowerCase().trim();

  // If pipeline name is specified, search only that pipeline
  // Use fuzzy word matching: "sales pipeline" should match "Sales Process" (both contain "sales")
  // Also handles exact substring match as fallback
  const targetPipelines = normalizedPipeline
    ? pipelines.filter(p => {
        const pName = p.name.toLowerCase();
        // Exact substring match
        if (pName.includes(normalizedPipeline) || normalizedPipeline.includes(pName)) return true;
        // Fuzzy word match: check if any significant word from the input matches any word in the pipeline name
        const inputWords = normalizedPipeline.split(/\s+/).filter(w => !['pipeline', 'pipe', 'the', 'a', 'in'].includes(w));
        const pipelineWords = pName.split(/\s+/).filter(w => !['pipeline', 'pipe', 'the', 'a', 'in'].includes(w));
        // At least one significant word must match
        return inputWords.some(iw => pipelineWords.some(pw => pw.includes(iw) || iw.includes(pw)));
      })
    : pipelines;

  // If pipeline filter returned no results but a name was specified, fall back to searching all pipelines
  // This prevents complete failure when the LLM gives an incorrect pipeline name
  const searchPipelines = targetPipelines.length > 0 ? targetPipelines : pipelines;

  // Pass 1: Exact match on raw name
  for (const pipeline of searchPipelines) {
    const stage = pipeline.stages.find(s => s.name.toLowerCase() === normalizedStage);
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 2: Exact match after stripping parenthetical content (e.g., "Pending Apt(3)" → "Pending Apt")
  for (const pipeline of searchPipelines) {
    const stage = pipeline.stages.find(s => stripParenthetical(s.name).toLowerCase() === normalizedStage);
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 3: Fuzzy match with abbreviation expansion (e.g., "pending appointment" ↔ "Pending Apt(3)")
  // This runs BEFORE substring includes to prevent false positives like "disqualified" matching "Qualified"
  for (const pipeline of searchPipelines) {
    const stage = pipeline.stages.find(s => {
      const strippedActual = stripParenthetical(s.name);
      return fuzzyStageMatch(normalizedStage, strippedActual);
    });
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  // Pass 4: Abbreviation-expanded word match — require majority of input words to match stage words
  // e.g., "disqualified" → abbreviation "dq" matches stage "DQ'd" → abbreviation "dq"
  // Requires at least 50% of input words to match to prevent false positives from single shared words
  for (const pipeline of searchPipelines) {
    const fillerWords = new Set(["stage", "the", "to", "in", "a", "an"]);
    const inputWords = normalizedStage.split(/\s+/).filter(w => !fillerWords.has(w));
    let bestMatch: typeof pipeline.stages[0] | null = null;
    let bestScore = 0;
    for (const s of pipeline.stages) {
      const strippedActual = stripParenthetical(s.name).toLowerCase();
      const actualWords = strippedActual.split(/\s+/).filter(w => !fillerWords.has(w));
      const actualVariants = new Set(actualWords.flatMap(w => expandWord(w)));
      // Count how many input words match
      let matchCount = 0;
      for (const iw of inputWords) {
        const iVariants = expandWord(iw);
        if (iVariants.some(iv => actualVariants.has(iv))) matchCount++;
      }
      // Require at least 50% of input words to match
      const matchRatio = matchCount / inputWords.length;
      if (matchRatio >= 0.5 && matchCount > bestScore) {
        bestScore = matchCount;
        bestMatch = s;
      }
    }
    if (bestMatch) {
      const pipeline2 = searchPipelines.find(p => p.stages.some(s => s.id === bestMatch!.id))!;
      return { pipelineId: pipeline2.id, stageId: bestMatch.id, pipelineName: pipeline2.name, stageName: bestMatch.name };
    }
  }

  // Pass 5: Includes match — only allow when the shorter string is a meaningful prefix/substring
  // Require the shorter string to be at least 60% the length of the longer to prevent false positives
  for (const pipeline of searchPipelines) {
    const strippedInput = stripParenthetical(normalizedStage);
    const stage = pipeline.stages.find(s => {
      const strippedActual = stripParenthetical(s.name).toLowerCase();
      if (strippedActual.includes(strippedInput) || strippedInput.includes(strippedActual)) {
        const shorter = Math.min(strippedActual.length, strippedInput.length);
        const longer = Math.max(strippedActual.length, strippedInput.length);
        // Only match if the shorter string is at least 60% the length of the longer
        return shorter / longer >= 0.6;
      }
      return false;
    });
    if (stage) {
      return { pipelineId: pipeline.id, stageId: stage.id, pipelineName: pipeline.name, stageName: stage.name };
    }
  }

  return null;
}

// ============ ACTION 3: CHANGE PIPELINE STAGE ============

export async function changePipelineStage(
  tenantId: number,
  opportunityId: string,
  pipelineId: string,
  stageId: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  await ghlFetch(
    creds,
    `/opportunities/${opportunityId}`,
    "PUT",
    {
      pipelineId,
      pipelineStageId: stageId,
    }
  );

  return { success: true };
}

// ============ ACTION 4: SEND SMS ============

/**
 * Get the phone number assigned to a specific GHL user.
 * Looks up active phone numbers for the location and finds the one assigned to the userId.
 */
export async function getUserPhoneNumber(
  tenantId: number,
  ghlUserId: string
): Promise<string | null> {
  // Fast path: check cached lcPhone in team_members table first
  try {
    const { getDb } = await import("./db");
    const { teamMembers } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const [member] = await db.select({ lcPhone: teamMembers.lcPhone })
        .from(teamMembers)
        .where(eq(teamMembers.ghlUserId, ghlUserId))
        .limit(1);
      if (member?.lcPhone) {
        console.log(`[getUserPhoneNumber] Using cached lcPhone ${member.lcPhone} for user ${ghlUserId}`);
        return member.lcPhone;
      }
    }
  } catch (cacheErr) {
    // Non-critical: fall through to GHL API
  }

  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return null;

  try {
    // Use the GHL Users API to get the user's LC phone number.
    // The response includes an `lcPhone` object mapping locationId → phone number.
    const userData = await ghlFetch(
      creds,
      `/users/${ghlUserId}`,
      "GET"
    );
    
    // Extract phone from lcPhone map: { locationId: "+1XXXXXXXXXX" }
    if (userData.lcPhone && typeof userData.lcPhone === 'object') {
      const phoneNumber = userData.lcPhone[creds.locationId];
      if (phoneNumber) {
        console.log(`[getUserPhoneNumber] Found LC phone ${phoneNumber} for user ${ghlUserId} (${userData.name || 'unknown'}) at location ${creds.locationId}`);
        // Cache the phone number in team_members for future fast lookups
        try {
          const { getDb } = await import("./db");
          const { teamMembers } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const db = await getDb();
          if (db) {
            await db.update(teamMembers).set({ lcPhone: phoneNumber }).where(eq(teamMembers.ghlUserId, ghlUserId));
          }
        } catch (cacheErr) { /* non-critical */ }
        return phoneNumber;
      }
    }
    
    // Fallback: check phone field on the user object
    if (userData.phone) {
      console.log(`[getUserPhoneNumber] Using user phone field ${userData.phone} for user ${ghlUserId}`);
      return userData.phone;
    }
    
    console.log(`[getUserPhoneNumber] No phone number found for user ${ghlUserId} (${userData.name || 'unknown'}) at location ${creds.locationId}. lcPhone:`, JSON.stringify(userData.lcPhone));
    return null;
  } catch (err: any) {
    console.error(`[getUserPhoneNumber] Error looking up phone number for user ${ghlUserId}: ${err.message}`);
    return null;
  }
}

export async function sendSms(
  tenantId: number,
  contactId: string,
  message: string,
  userId?: string, // GHL user ID — routes SMS from that user's assigned phone number
  fromNumber?: string // Explicit phone number to send from
): Promise<{ success: boolean; messageId?: string; fromNumber?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  // If we have a userId but no fromNumber, try to look up the user's phone number
  let resolvedFromNumber = fromNumber;
  if (userId && !resolvedFromNumber) {
    resolvedFromNumber = await getUserPhoneNumber(tenantId, userId) || undefined;
  }

  const body: any = {
    type: "SMS",
    contactId,
    message,
  };
  // Pass fromNumber to explicitly control which phone number sends the SMS
  if (resolvedFromNumber) {
    body.fromNumber = resolvedFromNumber;
    console.log(`[sendSms] Using explicit fromNumber: ${resolvedFromNumber}`);
  }
  // Also pass userId as fallback routing
  if (userId) {
    body.userId = userId;
  }

  console.log(`[sendSms] Sending SMS to contact ${contactId} with userId=${userId || 'none'}, fromNumber=${resolvedFromNumber || 'none (will use GHL default routing)'}`);

  const data = await ghlFetch(
    creds,
    `/conversations/messages`,
    "POST",
    body
  );

  return { success: true, messageId: data.messageId || data.id, fromNumber: resolvedFromNumber };
}

/**
 * Check the delivery status of an SMS message by searching the contact's conversation.
 * GHL messages have a `status` field: pending, sent, delivered, failed, undelivered, etc.
 */
export async function getMessageStatus(
  tenantId: number,
  contactId: string,
  messageId: string
): Promise<{ status: string; found: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return { status: "unknown", found: false };

  try {
    // Search for the contact's conversation
    const searchData = await ghlFetch(
      creds,
      `/conversations/search?locationId=${creds.locationId}&contactId=${contactId}`
    );
    const conversations = searchData.conversations || [];
    if (conversations.length === 0) return { status: "unknown", found: false };

    // Get messages from the first conversation
    const convId = conversations[0].id;
    const msgData = await ghlFetch(
      creds,
      `/conversations/${convId}/messages`
    );
    const messages = msgData.messages?.messages || msgData.messages || [];

    // Find our specific message by ID
    const msg = messages.find((m: any) => m.id === messageId);
    if (msg) {
      return { status: msg.status || "sent", found: true };
    }

    return { status: "pending", found: false };
  } catch (err: any) {
    console.error(`[getMessageStatus] Error checking message ${messageId}:`, err.message);
    return { status: "unknown", found: false };
  }
}
// ============ HELPER: Parse relative date strings =============

function parseRelativeDate(dateStr: string): string {
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();
  
  // Handle "next monday", "next tuesday", etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      const target = new Date(now);
      const currentDay = target.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7; // Always go to NEXT occurrence
      target.setDate(target.getDate() + daysUntil);
      target.setHours(10, 0, 0, 0); // Default to 10am
      return target.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
  }
  
  // Handle "tomorrow"
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  
  // Handle "X days/weeks/months from now"
  const relMatch = lower.match(/(\d+)\s*(day|week|month)s?\s*(from\s*now|later|out)?/);
  if (relMatch) {
    const amount = parseInt(relMatch[1]);
    const unit = relMatch[2];
    const target = new Date(now);
    if (unit === 'day') target.setDate(target.getDate() + amount);
    else if (unit === 'week') target.setDate(target.getDate() + amount * 7);
    else if (unit === 'month') target.setMonth(target.getMonth() + amount);
    target.setHours(10, 0, 0, 0);
    return target.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  
  // Handle "in X days/weeks/months"
  const inMatch = lower.match(/in\s*(\d+)\s*(day|week|month)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const target = new Date(now);
    if (unit === 'day') target.setDate(target.getDate() + amount);
    else if (unit === 'week') target.setDate(target.getDate() + amount * 7);
    else if (unit === 'month') target.setMonth(target.getMonth() + amount);
    target.setHours(10, 0, 0, 0);
    return target.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  
  // Fallback: try Date.parse one more time, or default to tomorrow
  const lastTry = new Date(dateStr);
  if (!isNaN(lastTry.getTime())) {
    return lastTry.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  
  // Ultimate fallback: tomorrow at 10am
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(10, 0, 0, 0);
  console.warn(`[createTask] Could not parse dueDate "${dateStr}", defaulting to tomorrow`);
  return fallback.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ============ ACTION 5: CREATE TASK ============

export async function createTask(
  tenantId: number,
  contactId: string,
  title: string,
  description: string,
  dueDate?: string,
  assignedTo?: string // GHL user ID to assign the task to
): Promise<{ success: boolean; taskId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  // Normalize dueDate to ISO 8601 format required by GHL: YYYY-MM-DDTHH:mm:ssZ
  let normalizedDueDate: string;
  if (dueDate && dueDate.trim()) {
    try {
      const parsed = new Date(dueDate);
      if (!isNaN(parsed.getTime())) {
        // Valid date — format without milliseconds for GHL
        normalizedDueDate = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
      } else {
        // Could not parse — try relative date parsing
        normalizedDueDate = parseRelativeDate(dueDate);
      }
    } catch {
      normalizedDueDate = parseRelativeDate(dueDate);
    }
  } else {
    // Default: tomorrow at 10am UTC
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    normalizedDueDate = tomorrow.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  const body: any = {
    title,
    body: description || "",
    dueDate: normalizedDueDate,
    completed: false,
  };
  // Assign to specific GHL user if provided
  if (assignedTo) {
    body.assignedTo = assignedTo;
  }

  console.log(`[createTask] Creating task for contact ${contactId}: title="${title}", dueDate=${normalizedDueDate}, assignedTo=${assignedTo || "none"}`);

  try {
    const data = await ghlFetch(
      creds,
      `/contacts/${contactId}/tasks`,
      "POST",
      body
    );
    return { success: true, taskId: data.task?.id || data.id };
  } catch (err: any) {
    console.error(`[createTask] GHL API error: ${err.message}. Body sent:`, JSON.stringify(body));
    throw err;
  }
}

// ============ ACTION 6: ADD TAG ============

export async function addTag(
  tenantId: number,
  contactId: string,
  tags: string[]
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  // First get existing tags
  const contact = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
  const existingTags = contact.contact?.tags || [];
  const newTags = Array.from(new Set([...existingTags, ...tags]));

  await ghlFetch(
    creds,
    `/contacts/${contactId}`,
    "PUT",
    { tags: newTags }
  );

  return { success: true };
}

// ============ ACTION 7: REMOVE TAG ============

export async function removeTag(
  tenantId: number,
  contactId: string,
  tags: string[]
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const contact = await ghlFetch(creds, `/contacts/${contactId}`, "GET");
  const existingTags: string[] = contact.contact?.tags || [];
  const newTags = existingTags.filter((t: string) => !tags.includes(t));

  await ghlFetch(
    creds,
    `/contacts/${contactId}`,
    "PUT",
    { tags: newTags }
  );

  return { success: true };
}

// ============ ACTION 8: UPDATE CUSTOM FIELD ============

export async function updateContactField(
  tenantId: number,
  contactId: string,
  fieldKey: string,
  fieldValue: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  await ghlFetch(
    creds,
    `/contacts/${contactId}`,
    "PUT",
    { customFields: [{ key: fieldKey, value: fieldValue }] }
  );

  return { success: true };
}

// ============ ACTION 9: LIST TASKS FOR CONTACT ============

export async function getTasksForContact(
  tenantId: number,
  contactId: string
): Promise<Array<{ id: string; title: string; body: string; dueDate: string; completed: boolean; assignedTo?: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const data = await ghlFetch(
    creds,
    `/contacts/${contactId}/tasks`,
    "GET"
  );

  return (data.tasks || []).map((t: any) => ({
    id: t.id,
    title: t.title || "",
    body: t.body || "",
    dueDate: t.dueDate || "",
    completed: !!t.completed,
    assignedTo: t.assignedTo,
  }));
}

// ============ ACTION 10: UPDATE TASK ============

export async function updateTask(
  tenantId: number,
  contactId: string,
  taskId: string,
  updates: { title?: string; body?: string; dueDate?: string; completed?: boolean; assignedTo?: string }
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.body !== undefined) body.body = updates.body;
  if (updates.assignedTo !== undefined) body.assignedTo = updates.assignedTo;
  if (updates.dueDate !== undefined) {
    // Normalize the due date
    try {
      const parsed = new Date(updates.dueDate);
      if (!isNaN(parsed.getTime())) {
        body.dueDate = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
      } else {
        body.dueDate = parseRelativeDate(updates.dueDate);
      }
    } catch {
      body.dueDate = parseRelativeDate(updates.dueDate);
    }
  }
  // Handle completion separately — GHL has a dedicated endpoint for this
  const needsCompletion = updates.completed === true;
  
  // Only include non-completion fields in the general update body
  console.log(`[GHL] updateTask: contactId=${contactId}, taskId=${taskId}, body=${JSON.stringify(body)}, needsCompletion=${needsCompletion}`);
  
  if (Object.keys(body).length === 0 && !needsCompletion) {
    throw new Error("No update fields to send to GHL. The update body is empty.");
  }

  // Step 1: Update task fields (title, body, dueDate) if any
  if (Object.keys(body).length > 0) {
    const resp = await ghlFetch(
      creds,
      `/contacts/${contactId}/tasks/${taskId}`,
      "PUT",
      body
    );
    console.log(`[GHL] updateTask field update response: ${JSON.stringify(resp)}`);
  }

  // Step 2: Mark as completed using the dedicated endpoint
  if (needsCompletion) {
    console.log(`[GHL] updateTask: Marking task ${taskId} as completed via /completed endpoint`);
    const compResp = await ghlFetch(
      creds,
      `/contacts/${contactId}/tasks/${taskId}/completed`,
      "PUT",
      { completed: true }
    );
    console.log(`[GHL] updateTask completion response: ${JSON.stringify(compResp)}`);
  }

  return { success: true };
}

/**
 * Find the best matching task for a contact given a keyword/title hint.
 * Returns the task ID and details, or null if no match.
 */
export async function findTaskByKeyword(
  tenantId: number,
  contactId: string,
  keyword?: string
): Promise<{ id: string; title: string; dueDate: string } | null> {
  const tasks = await getTasksForContact(tenantId, contactId);
  if (tasks.length === 0) return null;

  // Filter to incomplete tasks only
  const incomplete = tasks.filter(t => !t.completed);
  const searchPool = incomplete.length > 0 ? incomplete : tasks;

  if (!keyword || keyword.trim() === "") {
    // No keyword — return the most recent incomplete task (or the first task)
    // Sort by dueDate descending to get the most relevant upcoming task
    const sorted = [...searchPool].sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return da - db; // earliest due date first
    });
    const t = sorted[0];
    return { id: t.id, title: t.title, dueDate: t.dueDate };
  }

  const lower = keyword.toLowerCase();

  // Exact title match
  const exact = searchPool.find(t => t.title.toLowerCase() === lower);
  if (exact) return { id: exact.id, title: exact.title, dueDate: exact.dueDate };

  // Substring match
  const sub = searchPool.find(t => t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase()));
  if (sub) return { id: sub.id, title: sub.title, dueDate: sub.dueDate };

  // Word overlap match
  const keywordWords = lower.split(/\s+/).filter(w => w.length > 2);
  let bestMatch: typeof searchPool[0] | null = null;
  let bestScore = 0;
  for (const task of searchPool) {
    const titleWords = task.title.toLowerCase().split(/\s+/);
    const overlap = keywordWords.filter(kw => titleWords.some(tw => tw.includes(kw) || kw.includes(tw))).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = task;
    }
  }
  if (bestMatch && bestScore > 0) {
    return { id: bestMatch.id, title: bestMatch.title, dueDate: bestMatch.dueDate };
  }

  // Fallback: return the first incomplete task
  const t = searchPool[0];
  return { id: t.id, title: t.title, dueDate: t.dueDate };
}

// ============ ACTION 11: ADD CONTACT TO WORKFLOW ============

export async function addContactToWorkflow(
  tenantId: number,
  contactId: string,
  workflowId: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  await ghlFetch(
    creds,
    `/contacts/${contactId}/workflow/${workflowId}`,
    "POST"
  );

  return { success: true };
}

// ============ ACTION 12: REMOVE CONTACT FROM WORKFLOW ============

export async function removeContactFromWorkflow(
  tenantId: number,
  contactId: string,
  workflowId: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  await ghlFetch(
    creds,
    `/contacts/${contactId}/workflow/${workflowId}`,
    "DELETE"
  );

  return { success: true };
}

// ============ WORKFLOW RESOLUTION ============

export async function getWorkflowsForTenant(
  tenantId: number
): Promise<Array<{ id: string; name: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/workflows/?locationId=${creds.locationId}`,
      "GET"
    );
    return (data.workflows || []).map((w: any) => ({
      id: w.id,
      name: w.name || "Unnamed Workflow",
    }));
  } catch (error) {
    console.error("[GHLActions] Workflow fetch error:", error);
    return [];
  }
}

/**
 * Fuzzy-match a workflow name to a workflow ID.
 * Similar to stage resolution but simpler — just name matching.
 */
export function resolveWorkflowByName(
  workflows: Array<{ id: string; name: string }>,
  workflowName: string
): { workflowId: string; workflowName: string } | null {
  const normalized = workflowName.toLowerCase().trim();

  // Pass 1: Exact match
  const exact = workflows.find(w => w.name.toLowerCase() === normalized);
  if (exact) return { workflowId: exact.id, workflowName: exact.name };

  // Pass 2: Substring match (either direction)
  const sub = workflows.find(w => {
    const wName = w.name.toLowerCase();
    return wName.includes(normalized) || normalized.includes(wName);
  });
  if (sub) return { workflowId: sub.id, workflowName: sub.name };

  // Pass 3: Word overlap — at least 50% of input words must match
  const inputWords = normalized.split(/\s+/).filter(w => w.length > 2 && !['the', 'a', 'an', 'to', 'for', 'and'].includes(w));
  let bestMatch: typeof workflows[0] | null = null;
  let bestScore = 0;
  for (const wf of workflows) {
    const wfWords = wf.name.toLowerCase().split(/\s+/);
    const overlap = inputWords.filter(iw => wfWords.some(ww => ww.includes(iw) || iw.includes(ww))).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = wf;
    }
  }
  if (bestMatch && bestScore > 0 && bestScore >= inputWords.length * 0.5) {
    return { workflowId: bestMatch.id, workflowName: bestMatch.name };
  }

  return null;
}

// ============ CALENDAR / APPOINTMENT FUNCTIONS ============

/**
 * Get all calendars for a tenant's GHL location.
 */
export async function getCalendarsForTenant(
  tenantId: number
): Promise<Array<{ id: string; name: string; description?: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    const data = await ghlFetch(
      creds,
      `/calendars/?locationId=${creds.locationId}`,
      "GET"
    );
    return (data.calendars || []).map((c: any) => ({
      id: c.id,
      name: c.name || "Unnamed Calendar",
      description: c.description || "",
    }));
  } catch (error) {
    console.error("[GHLActions] Calendar fetch error:", error);
    return [];
  }
}

/**
 * Fuzzy-match a calendar name to a calendar ID.
 * Similar to workflow resolution.
 */
export function resolveCalendarByName(
  calendars: Array<{ id: string; name: string }>,
  calendarName: string
): { calendarId: string; calendarName: string } | null {
  const normalized = calendarName.toLowerCase().trim();

  // Pass 1: Exact match
  const exact = calendars.find(c => c.name.toLowerCase() === normalized);
  if (exact) return { calendarId: exact.id, calendarName: exact.name };

  // Pass 2: Substring match (either direction)
  const sub = calendars.find(c => {
    const cName = c.name.toLowerCase();
    return cName.includes(normalized) || normalized.includes(cName);
  });
  if (sub) return { calendarId: sub.id, calendarName: sub.name };

  // Pass 3: Word overlap
  const inputWords = normalized.split(/\s+/).filter(w => w.length > 2 && !['the', 'a', 'an', 'to', 'for', 'and'].includes(w));
  let bestMatch: typeof calendars[0] | null = null;
  let bestScore = 0;
  for (const cal of calendars) {
    const calWords = cal.name.toLowerCase().split(/\s+/);
    const overlap = inputWords.filter(iw => calWords.some(cw => cw.includes(iw) || iw.includes(cw))).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = cal;
    }
  }
  if (bestMatch && bestScore > 0 && bestScore >= inputWords.length * 0.5) {
    return { calendarId: bestMatch.id, calendarName: bestMatch.name };
  }

  return null;
}

/**
 * Create an appointment on a GHL calendar for a contact.
 */
export async function createAppointment(
  tenantId: number,
  calendarId: string,
  contactId: string,
  startTime: string,
  endTime: string,
  title: string,
  notes?: string,
  assignedUserId?: string,
  selectedTimezone?: string
): Promise<{ success: boolean; appointmentId?: string }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {
    calendarId,
    locationId: creds.locationId,
    contactId,
    startTime,
    endTime,
    title,
    appointmentStatus: "confirmed",
    ignoreFreeSlotValidation: true,
  };

  if (notes) body.notes = notes;
  if (assignedUserId) body.assignedUserId = assignedUserId;
  if (selectedTimezone) body.selectedTimezone = selectedTimezone;

  console.log(`[createAppointment] Creating appointment on calendar ${calendarId} for contact ${contactId}: "${title}" at ${startTime}`);

  const data = await ghlFetch(
    creds,
    `/calendars/events/appointments`,
    "POST",
    body
  );

  return { success: true, appointmentId: data?.id || data?.event?.id || data?.appointment?.id };
}

/**
 * Get upcoming appointments for a contact by searching calendar events.
 * Searches across all calendars for the next 90 days.
 */
export async function getAppointmentsForContact(
  tenantId: number,
  contactId: string
): Promise<Array<{ id: string; title: string; startTime: string; endTime: string; calendarId: string; appointmentStatus: string }>> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) return [];

  try {
    // Get all calendars first
    const calendars = await getCalendarsForTenant(tenantId);
    if (calendars.length === 0) return [];

    const now = new Date();
    // Search from 30 days ago to 90 days ahead to catch recent and upcoming
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const allAppointments: Array<{ id: string; title: string; startTime: string; endTime: string; calendarId: string; appointmentStatus: string }> = [];

    // Search each calendar for events
    for (const cal of calendars) {
      try {
        const data = await ghlFetch(
          creds,
          `/calendars/events?locationId=${creds.locationId}&calendarId=${cal.id}&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}`,
          "GET"
        );

        const events = data?.events || data?.data || [];
        for (const evt of events) {
          // Filter by contactId
          if (evt.contactId === contactId && evt.appointmentStatus !== "cancelled") {
            allAppointments.push({
              id: evt.id,
              title: evt.title || "Untitled Appointment",
              startTime: evt.startTime,
              endTime: evt.endTime,
              calendarId: evt.calendarId || cal.id,
              appointmentStatus: evt.appointmentStatus || "confirmed",
            });
          }
        }
      } catch (err) {
        console.error(`[GHLActions] Error fetching events for calendar ${cal.id}:`, err);
      }
    }

    // Sort by startTime ascending (soonest first)
    allAppointments.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    console.log(`[getAppointmentsForContact] Found ${allAppointments.length} appointments for contact ${contactId}`);
    return allAppointments;
  } catch (error) {
    console.error("[GHLActions] Appointment fetch error:", error);
    return [];
  }
}

/**
 * Fuzzy-match an appointment by title or find the next upcoming one.
 */
export function resolveAppointmentByTitle(
  appointments: Array<{ id: string; title: string; startTime: string }>,
  searchTitle?: string
): { appointmentId: string; appointmentTitle: string; startTime: string } | null {
  if (appointments.length === 0) return null;

  // If no search title, return the next upcoming appointment
  if (!searchTitle) {
    const now = new Date();
    const upcoming = appointments.find(a => new Date(a.startTime) >= now);
    if (upcoming) return { appointmentId: upcoming.id, appointmentTitle: upcoming.title, startTime: upcoming.startTime };
    // If no upcoming, return the most recent
    return { appointmentId: appointments[appointments.length - 1].id, appointmentTitle: appointments[appointments.length - 1].title, startTime: appointments[appointments.length - 1].startTime };
  }

  const normalized = searchTitle.toLowerCase().trim();

  // Pass 1: Exact title match
  const exact = appointments.find(a => a.title.toLowerCase() === normalized);
  if (exact) return { appointmentId: exact.id, appointmentTitle: exact.title, startTime: exact.startTime };

  // Pass 2: Substring match
  const sub = appointments.find(a => {
    const aTitle = a.title.toLowerCase();
    return aTitle.includes(normalized) || normalized.includes(aTitle);
  });
  if (sub) return { appointmentId: sub.id, appointmentTitle: sub.title, startTime: sub.startTime };

  // Pass 3: Word overlap
  const inputWords = normalized.split(/\s+/).filter(w => w.length > 2 && !['the', 'a', 'an', 'to', 'for', 'and', 'with'].includes(w));
  let bestMatch: typeof appointments[0] | null = null;
  let bestScore = 0;
  for (const appt of appointments) {
    const apptWords = appt.title.toLowerCase().split(/\s+/);
    const overlap = inputWords.filter(iw => apptWords.some(aw => aw.includes(iw) || iw.includes(aw))).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = appt;
    }
  }
  if (bestMatch && bestScore > 0) {
    return { appointmentId: bestMatch.id, appointmentTitle: bestMatch.title, startTime: bestMatch.startTime };
  }

  // If nothing matched by title, return the next upcoming
  const now = new Date();
  const upcoming = appointments.find(a => new Date(a.startTime) >= now);
  if (upcoming) return { appointmentId: upcoming.id, appointmentTitle: upcoming.title, startTime: upcoming.startTime };

  return null;
}

/**
 * Update an existing appointment (reschedule, change title, etc.).
 */
export async function updateAppointment(
  tenantId: number,
  eventId: string,
  updates: {
    startTime?: string;
    endTime?: string;
    title?: string;
    notes?: string;
    appointmentStatus?: string;
    selectedTimezone?: string;
  }
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  const body: any = {};
  if (updates.startTime) body.startTime = updates.startTime;
  if (updates.endTime) body.endTime = updates.endTime;
  if (updates.title) body.title = updates.title;
  if (updates.notes) body.notes = updates.notes;
  if (updates.appointmentStatus) body.appointmentStatus = updates.appointmentStatus;
  if (updates.selectedTimezone) body.selectedTimezone = updates.selectedTimezone;
  body.ignoreFreeSlotValidation = true;

  console.log(`[updateAppointment] Updating appointment ${eventId}:`, JSON.stringify(body));

  await ghlFetch(
    creds,
    `/calendars/events/appointments/${eventId}`,
    "PUT",
    body
  );

  return { success: true };
}

/**
 * Cancel an appointment by setting its status to "cancelled".
 */
export async function cancelAppointment(
  tenantId: number,
  eventId: string
): Promise<{ success: boolean }> {
  const creds = await getCredentialsForTenant(tenantId);
  if (!creds) throw new Error("No GHL credentials configured");

  console.log(`[cancelAppointment] Cancelling appointment ${eventId}`);

  await ghlFetch(
    creds,
    `/calendars/events/appointments/${eventId}`,
    "PUT",
    { appointmentStatus: "cancelled" }
  );

  return { success: true };
}

// ============ ACTION LOG HELPERS ============

export async function createActionLog(params: {
  tenantId: number;
  requestedBy: number;
  requestedByName: string;
  actionType: string;
  requestText: string;
  targetContactId?: string;
  targetContactName?: string;
  targetOpportunityId?: string;
  payload?: any;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(coachActionLog).values({
    tenantId: params.tenantId,
    requestedBy: params.requestedBy,
    requestedByName: params.requestedByName,
    actionType: params.actionType as any,
    requestText: params.requestText,
    targetContactId: params.targetContactId,
    targetContactName: params.targetContactName,
    targetOpportunityId: params.targetOpportunityId,
    payload: params.payload,
    status: "pending",
  });

  return (result as any).insertId;
}

export async function confirmAction(actionId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(coachActionLog)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(coachActionLog.id, actionId));
}

export async function executeAction(actionId: number): Promise<{ success: boolean; error?: string; smsMessageId?: string; smsSenderName?: string; smsFromNumber?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [action] = await db.select().from(coachActionLog).where(eq(coachActionLog.id, actionId));
  if (!action) throw new Error("Action not found");
  if (action.status !== "confirmed") throw new Error("Action must be confirmed before execution");

  const payload = action.payload as any;
  // Use targetContactId from the action log as the authoritative contact ID
  // (payload.contactId from LLM may be empty; the real ID is resolved during contact search)
  let contactId = action.targetContactId || payload.contactId;
  const opportunityId = action.targetOpportunityId || payload.opportunityId;

  // Auto-resolve contactId by searching GHL if we have a contact name but no ID
  if (!contactId && (action.targetContactName || payload.contactName)) {
    const searchName = action.targetContactName || payload.contactName;
    console.log(`[GHLActions] Auto-resolving contact ID for name: "${searchName}"`);
    try {
      const contacts = await searchContacts(action.tenantId, searchName);
      if (contacts.length > 0) {
        contactId = contacts[0].id;
        console.log(`[GHLActions] Auto-resolved contact "${searchName}" to ID: ${contactId}`);
        // Update the action log with the resolved contact ID for future reference
        await db.update(coachActionLog)
          .set({ targetContactId: contactId })
          .where(eq(coachActionLog.id, actionId));
      } else {
        console.log(`[GHLActions] No contacts found for name: "${searchName}"`);
      }
    } catch (err) {
      console.error(`[GHLActions] Failed to auto-resolve contact "${searchName}":`, err);
    }
  }

  // Resolve the requesting user's GHL user ID for SMS routing and task default assignment
  let requestingUserGhlId: string | undefined;
  try {
    const teamMember = await getTeamMemberByUserId(action.requestedBy);
    if (teamMember?.ghlUserId) {
      requestingUserGhlId = teamMember.ghlUserId;
    }
  } catch { /* non-critical */ }

  // Resolve assignee GHL user ID for tasks (from assigneeName in payload)
  let taskAssigneeGhlId: string | undefined;
  if (action.actionType === "create_task" && payload.assigneeName) {
    try {
      const members = await getTeamMembers(action.tenantId);
      const match = members.find(m => 
        m.name.toLowerCase().includes(payload.assigneeName.toLowerCase()) ||
        payload.assigneeName.toLowerCase().includes(m.name.split(" ")[0].toLowerCase())
      );
      if (match?.ghlUserId) {
        taskAssigneeGhlId = match.ghlUserId;
      }
    } catch { /* non-critical */ }
  }
  // Default task assignment: named person > creator
  const finalTaskAssignee = taskAssigneeGhlId || requestingUserGhlId;
  
  try {
    let result: any;

    switch (action.actionType) {
      case "add_note":
      case "add_note_contact":
      case "add_note_opportunity":
        // All note types use the same GHL endpoint: POST /contacts/{contactId}/notes
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await addNoteToContact(action.tenantId, contactId, payload.noteBody);
        break;
      case "change_pipeline_stage": {
        let resolvedOppId = opportunityId;
        let resolvedPipelineId = payload.pipelineId;
        let resolvedStageId = payload.stageId;
        let currentPipelineName: string | undefined;

        // Fetch ALL opportunities for this contact upfront (needed for cross-pipeline moves)
        let allOpps: Array<{ opportunityId: string; pipelineId: string; stageId: string; name: string }> = [];
        if (contactId) {
          allOpps = await findAllOpportunitiesByContact(action.tenantId, contactId);
          console.log(`[GHLActions] Found ${allOpps.length} opportunities for contact ${contactId}`);
        }

        // Auto-resolve opportunity ID from contact if not provided
        if (!resolvedOppId && contactId) {
          console.log(`[GHLActions] No opportunity ID — looking up opportunities for contact ${contactId}`);
          if (allOpps.length > 0) {
            const opp = allOpps[0]; // most recently updated
            resolvedOppId = opp.opportunityId;
            if (!resolvedPipelineId) resolvedPipelineId = opp.pipelineId;
            console.log(`[GHLActions] Found opportunity ${resolvedOppId} in pipeline ${resolvedPipelineId}`);
          }
        }

        if (!resolvedOppId && allOpps.length === 0) {
          throw new Error("No opportunity found for this contact. The contact may not have a deal in any pipeline yet.");
        }

        // Auto-resolve stage ID from stage name if not provided or if LLM gave a name instead of ID
        if ((!resolvedStageId || !resolvedPipelineId) && payload.stageName) {
          console.log(`[GHLActions] Resolving stage name "${payload.stageName}" to pipeline/stage IDs`);
          const pipelines = await getPipelinesForTenant(action.tenantId);

          // IMPORTANT: When we already know the contact's current pipeline from the opportunity lookup,
          // prefer searching that pipeline first. Only use the LLM's pipelineName if no pipeline was
          // resolved from the opportunity. This prevents moving contacts to the wrong pipeline when
          // multiple pipelines have stages with the same name (e.g. "Made Offer" in both Sales Process
          // and Buyer Pipeline).
          let preferredPipelineName = payload.pipelineName;

          // Check for user's stored pipeline preference if no pipeline specified
          if (!preferredPipelineName && action.requestedBy) {
            try {
              const { getDefaultPipeline } = await import("./userInstructions");
              const userDefaultPipeline = await getDefaultPipeline(action.requestedBy);
              if (userDefaultPipeline) {
                preferredPipelineName = userDefaultPipeline;
                console.log(`[GHLActions] Using user's stored pipeline preference: "${userDefaultPipeline}"`);
              }
            } catch { /* preference lookup is optional */ }
          }

          if (resolvedPipelineId && !payload.pipelineName) {
            // Look up the current pipeline's name to pass to resolveStageByName
            const currentPipeline = pipelines.find(p => p.id === resolvedPipelineId);
            if (currentPipeline) {
              preferredPipelineName = currentPipeline.name;
              currentPipelineName = currentPipeline.name;
              console.log(`[GHLActions] Preferring contact's current pipeline: "${preferredPipelineName}"`);
            }
          }

          // First try: resolve within the preferred pipeline (contact's current pipeline)
          let resolved = resolveStageByName(pipelines, payload.stageName, preferredPipelineName);

          // If the stage wasn't found in the preferred pipeline but was found elsewhere,
          // and the user didn't explicitly specify a pipeline, try all pipelines as fallback
          if (!resolved && preferredPipelineName && !payload.pipelineName) {
            console.log(`[GHLActions] Stage "${payload.stageName}" not found in current pipeline "${preferredPipelineName}", searching all pipelines`);
            resolved = resolveStageByName(pipelines, payload.stageName);
          }

          if (resolved) {
            resolvedPipelineId = resolved.pipelineId;
            resolvedStageId = resolved.stageId;
            console.log(`[GHLActions] Resolved to pipeline "${resolved.pipelineName}" stage "${resolved.stageName}"`);
          } else {
            throw new Error(`Could not find a pipeline stage matching "${payload.stageName}". Please check the stage name and try again.`);
          }
        }

        if (!resolvedPipelineId || !resolvedStageId) {
          throw new Error("Could not determine the target pipeline stage. Please specify the stage name more clearly.");
        }

        // CROSS-PIPELINE DUPLICATE PREVENTION:
        // If the target pipeline is different from the current opportunity's pipeline,
        // check if the contact already has an opportunity in the target pipeline.
        // If so, update THAT opportunity instead of trying to move the current one
        // (which would cause GHL's "Can not create duplicate opportunity" error).
        const currentOpp = allOpps.find(o => o.opportunityId === resolvedOppId);
        if (currentOpp && currentOpp.pipelineId !== resolvedPipelineId) {
          console.log(`[GHLActions] Cross-pipeline move detected: current pipeline ${currentOpp.pipelineId} → target pipeline ${resolvedPipelineId}`);
          const existingInTarget = allOpps.find(o => o.pipelineId === resolvedPipelineId);
          if (existingInTarget) {
            console.log(`[GHLActions] Contact already has opportunity ${existingInTarget.opportunityId} in target pipeline — updating that one instead to avoid duplicate`);
            resolvedOppId = existingInTarget.opportunityId;
          } else {
            console.log(`[GHLActions] No existing opportunity in target pipeline — will move current opportunity across pipelines`);
          }
        }

        result = await changePipelineStage(action.tenantId, resolvedOppId, resolvedPipelineId, resolvedStageId);
        break;
      }
      case "send_sms": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        // Check for sender override in payload, otherwise use the logged-in user
        let smsUserId = requestingUserGhlId;
        let senderName = action.requestedByName || "Unknown";
        if (payload.senderOverrideGhlId) {
          smsUserId = payload.senderOverrideGhlId;
          senderName = payload.senderOverrideName || senderName;
          console.log(`[GHLActions] SMS sender override: using ${senderName} (GHL: ${smsUserId}) instead of ${action.requestedByName}`);
        }
        console.log(`[GHLActions] SMS action: requestedBy=${action.requestedBy} (${action.requestedByName}), sending as ${senderName} (GHL userId=${smsUserId || 'NONE'})`);
        result = await sendSms(action.tenantId, contactId, payload.message, smsUserId);
        // Store SMS metadata for delivery tracking
        if (result.messageId) {
          try {
            await db.update(coachActionLog)
              .set({ resultMeta: { messageId: result.messageId, fromNumber: result.fromNumber, senderName, senderGhlId: smsUserId } })
              .where(eq(coachActionLog.id, actionId));
          } catch { /* non-critical metadata storage */ }
        }
        break;
      }
      case "create_task":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await createTask(action.tenantId, contactId, payload.title, payload.description, payload.dueDate, payload.assignedTo || finalTaskAssignee);
        break;
      case "add_tag":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await addTag(action.tenantId, contactId, payload.tags);
        break;
      case "remove_tag":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await removeTag(action.tenantId, contactId, payload.tags);
        break;
      case "update_field":
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        result = await updateContactField(action.tenantId, contactId, payload.fieldKey, payload.fieldValue);
        break;
      case "check_off_task": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        // Find the task to check off
        let checkOffTaskId = payload.taskId;
        if (!checkOffTaskId) {
          const matchedTask = await findTaskByKeyword(action.tenantId, contactId, payload.taskKeyword || payload.title);
          if (!matchedTask) throw new Error("No tasks found for this contact.");
          checkOffTaskId = matchedTask.id;
          console.log(`[GHLActions] Resolved task to check off: "${matchedTask.title}" (${checkOffTaskId})`);
        }
        
        console.log(`[GHLActions] check_off_task: contactId=${contactId}, taskId=${checkOffTaskId}`);
        result = await updateTask(action.tenantId, contactId, checkOffTaskId, { completed: true });
        break;
      }
      case "update_task": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        // Find the task to update
        let taskId = payload.taskId;
        if (!taskId) {
          // Auto-resolve task by keyword/title
          const matched = await findTaskByKeyword(action.tenantId, contactId, payload.taskKeyword || payload.title);
          if (!matched) throw new Error("No tasks found for this contact.");
          taskId = matched.id;
          console.log(`[GHLActions] Resolved task: "${matched.title}" (${taskId})`);
        }

        const updates: { title?: string; body?: string; dueDate?: string; completed?: boolean; assignedTo?: string } = {};
        // Map from LLM payload field names to updateTask parameter names
        if (payload.dueDate) updates.dueDate = payload.dueDate;
        if (payload.newDueDate) updates.dueDate = payload.newDueDate; // fallback alias
        if (payload.description) updates.body = payload.description;
        if (payload.newBody !== undefined) updates.body = payload.newBody; // fallback alias
        if (payload.newTitle) updates.title = payload.newTitle;
        if (payload.assignedTo) updates.assignedTo = payload.assignedTo;
        // Handle taskStatus from LLM ("completed" string) → completed boolean
        if (payload.taskStatus === "completed") updates.completed = true;
        if (payload.completed !== undefined) updates.completed = payload.completed; // fallback alias
        
        // Validate that at least one update field is set
        if (Object.keys(updates).length === 0) {
          throw new Error("No update fields provided. Please specify what to change (due date, title, description, or status).");
        }
        
        console.log(`[GHLActions] update_task: contactId=${contactId}, taskId=${taskId}, updates=${JSON.stringify(updates)}`);

        result = await updateTask(action.tenantId, contactId, taskId, updates);
        break;
      }
      case "add_to_workflow": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        let workflowId = payload.workflowId;
        if (!workflowId && payload.workflowName) {
          const workflows = await getWorkflowsForTenant(action.tenantId);
          const resolved = resolveWorkflowByName(workflows, payload.workflowName);
          if (!resolved) throw new Error(`Could not find a workflow matching "${payload.workflowName}". Please check the workflow name.`);
          workflowId = resolved.workflowId;
          console.log(`[GHLActions] Resolved workflow: "${resolved.workflowName}" (${workflowId})`);
        }
        if (!workflowId) throw new Error("No workflow specified. Please provide a workflow name.");
        
        result = await addContactToWorkflow(action.tenantId, contactId, workflowId);
        break;
      }
      case "remove_from_workflow": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        let workflowId = payload.workflowId;
        if (!workflowId && payload.workflowName) {
          const workflows = await getWorkflowsForTenant(action.tenantId);
          const resolved = resolveWorkflowByName(workflows, payload.workflowName);
          if (!resolved) throw new Error(`Could not find a workflow matching "${payload.workflowName}". Please check the workflow name.`);
          workflowId = resolved.workflowId;
          console.log(`[GHLActions] Resolved workflow: "${resolved.workflowName}" (${workflowId})`);
        }
        if (!workflowId) throw new Error("No workflow specified. Please provide a workflow name.");
        
        result = await removeContactFromWorkflow(action.tenantId, contactId, workflowId);
        break;
      }
      case "create_appointment": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        // Resolve calendar by name if no calendarId provided
        let calendarId = payload.calendarId;
        if (!calendarId && payload.calendarName) {
          const calendars = await getCalendarsForTenant(action.tenantId);
          const resolved = resolveCalendarByName(calendars, payload.calendarName);
          if (!resolved) {
            // If only one calendar exists, use it as default
            if (calendars.length === 1) {
              calendarId = calendars[0].id;
              console.log(`[GHLActions] Only one calendar found, using: "${calendars[0].name}" (${calendarId})`);
            } else {
              throw new Error(`Could not find a calendar matching "${payload.calendarName}". Available calendars: ${calendars.map(c => c.name).join(", ")}`);
            }
          } else {
            calendarId = resolved.calendarId;
            console.log(`[GHLActions] Resolved calendar: "${resolved.calendarName}" (${calendarId})`);
          }
        }
        
        // If still no calendarId, try to use the first/default calendar
        if (!calendarId) {
          const calendars = await getCalendarsForTenant(action.tenantId);
          if (calendars.length === 0) throw new Error("No calendars found in your GHL account. Please create a calendar first.");
          calendarId = calendars[0].id;
          console.log(`[GHLActions] No calendar specified, using default: "${calendars[0].name}" (${calendarId})`);
        }
        
        if (!payload.startTime) throw new Error("No appointment time specified. Please provide a date and time.");
        
        // Calculate endTime if not provided (default 1 hour)
        let endTime = payload.endTime;
        if (!endTime) {
          const start = new Date(payload.startTime);
          start.setHours(start.getHours() + 1);
          endTime = start.toISOString();
        }
        
        const appointmentTitle = payload.title || `Appointment with ${action.targetContactName || 'Contact'}`;
        
        result = await createAppointment(
          action.tenantId,
          calendarId,
          contactId,
          payload.startTime,
          endTime,
          appointmentTitle,
          payload.notes || payload.description,
          requestingUserGhlId,
          payload.selectedTimezone || "America/New_York"
        );
        break;
      }
      case "update_appointment": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        // Find the appointment to update
        const contactAppointments = await getAppointmentsForContact(action.tenantId, contactId);
        if (contactAppointments.length === 0) {
          throw new Error(`No appointments found for this contact. Please create an appointment first.`);
        }
        
        // Resolve which appointment to update
        const resolvedAppt = resolveAppointmentByTitle(contactAppointments, payload.title || payload.appointmentTitle);
        if (!resolvedAppt) {
          throw new Error(`Could not find a matching appointment. Available appointments: ${contactAppointments.map(a => `"${a.title}" on ${new Date(a.startTime).toLocaleDateString()}`).join(", ")}`);
        }
        
        console.log(`[GHLActions] Resolved appointment: "${resolvedAppt.appointmentTitle}" (${resolvedAppt.appointmentId})`);
        
        // Build update object
        const apptUpdates: any = {};
        if (payload.startTime) {
          apptUpdates.startTime = payload.startTime;
          // If startTime changed but no endTime, calculate new endTime (same duration as original)
          if (!payload.endTime) {
            const originalAppt = contactAppointments.find(a => a.id === resolvedAppt.appointmentId);
            if (originalAppt) {
              const originalDuration = new Date(originalAppt.endTime).getTime() - new Date(originalAppt.startTime).getTime();
              apptUpdates.endTime = new Date(new Date(payload.startTime).getTime() + originalDuration).toISOString();
            } else {
              // Default 1 hour
              const start = new Date(payload.startTime);
              start.setHours(start.getHours() + 1);
              apptUpdates.endTime = start.toISOString();
            }
          }
        }
        if (payload.endTime) apptUpdates.endTime = payload.endTime;
        if (payload.notes) apptUpdates.notes = payload.notes;
        if (payload.appointmentTitle || (payload.title && payload.title !== resolvedAppt.appointmentTitle)) {
          apptUpdates.title = payload.appointmentTitle || payload.title;
        }
        if (payload.selectedTimezone) apptUpdates.selectedTimezone = payload.selectedTimezone;
        
        result = await updateAppointment(action.tenantId, resolvedAppt.appointmentId, apptUpdates);
        break;
      }
      case "cancel_appointment": {
        if (!contactId) throw new Error("No contact ID available. Please search for the contact first.");
        
        // Find the appointment to cancel
        const apptsToCancelFrom = await getAppointmentsForContact(action.tenantId, contactId);
        if (apptsToCancelFrom.length === 0) {
          throw new Error(`No appointments found for this contact.`);
        }
        
        // Resolve which appointment to cancel
        const apptToCancel = resolveAppointmentByTitle(apptsToCancelFrom, payload.title || payload.appointmentTitle);
        if (!apptToCancel) {
          throw new Error(`Could not find a matching appointment. Available appointments: ${apptsToCancelFrom.map(a => `"${a.title}" on ${new Date(a.startTime).toLocaleDateString()}`).join(", ")}`);
        }
        
        console.log(`[GHLActions] Cancelling appointment: "${apptToCancel.appointmentTitle}" (${apptToCancel.appointmentId})`);
        
        result = await cancelAppointment(action.tenantId, apptToCancel.appointmentId);
        break;
      }
      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }

    await db.update(coachActionLog)
      .set({ status: "executed", executedAt: new Date() })
      .where(eq(coachActionLog.id, actionId));

    // For SMS, return extra metadata for the frontend
    if (action.actionType === "send_sms" && result?.messageId) {
      return { success: true, smsMessageId: result.messageId, smsSenderName: (payload.senderOverrideName || action.requestedByName || "Unknown"), smsFromNumber: result.fromNumber || undefined };
    }
    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || "Unknown error";
    await db.update(coachActionLog)
      .set({ status: "failed", error: errorMsg })
      .where(eq(coachActionLog.id, actionId));

    return { success: false, error: errorMsg };
  }
}

export async function cancelAction(actionId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(coachActionLog)
    .set({ status: "cancelled" })
    .where(eq(coachActionLog.id, actionId));
}
