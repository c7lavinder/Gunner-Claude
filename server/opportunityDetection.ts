/**
 * Opportunity Detection Engine V2 — Pipeline Manager
 * 
 * Architecture: GHL-event-first, transcript-enriched.
 * Primary data sources: GHL pipeline opportunities, conversations, contact activity.
 * Secondary enrichment: call transcripts from Gunner's database.
 * 
 * This engine thinks like an Acquisition Manager reviewing the pipeline,
 * NOT a call coach reviewing technique.
 */
import { getDb, getGhlUserIdMap } from "./db";
import { calls, callGrades, opportunities, teamMembers, coachMessages, users } from "../drizzle/schema";
import { eq, and, desc, gte, isNull, inArray, sql, not, lt } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { getTenantsWithCrm, parseCrmConfig, type TenantCrmConfig } from "./tenant";
import { oppCircuitBreaker as ghlCircuitBreaker } from "./ghlRateLimiter";
import { loadGHLCredentials } from "./ghlCredentialHelper";
import { oauthAwareFetch } from "./ghlOAuthFetch";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

/**
 * Calculate business hours elapsed (excludes weekends).
 * If the time window spans a weekend, add 48 hours of grace.
 * This prevents false "no follow-up" signals on Friday evening through Monday morning.
 */
function includesWeekend(since: Date): boolean {
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 1) {
    // Check if the period crosses a weekend day
    const sinceDay = since.getDay(); // 0=Sun, 6=Sat
    const nowDay = now.getDay();
    return sinceDay === 0 || sinceDay === 6 || nowDay === 0 || nowDay === 6;
  }
  // For multi-day periods, any span > 2 days likely includes a weekend
  return daysSince >= 2;
}

/**
 * Get a weekend-adjusted threshold. If the time window includes a weekend,
 * add 48 hours of grace to the threshold to avoid false positives.
 */
function weekendAdjustedThreshold(baseHours: number, since: Date | null): Date {
  const adjustedHours = since && includesWeekend(since) ? baseHours + 48 : baseHours;
  return new Date(Date.now() - adjustedHours * 60 * 60 * 1000);
}

// ============ TYPES ============

interface GHLCredentials {
  apiKey: string;
  locationId: string;
  tenantId?: number;
  isOAuth?: boolean;
}

interface GHLPipelineOpportunity {
  id: string;
  name: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  assignedTo?: string;
  monetaryValue?: number;
  createdAt: string;
  updatedAt: string;
  lastStageChangeAt?: string;
  lastStatusChangeAt?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    tags?: string[];
  };
}

interface GHLConversation {
  id: string;
  contactId: string;
  lastMessageDate: number;
  lastMessageType: string;
  lastMessageDirection: string;
  lastMessageBody?: string;
  unreadCount: number;
  fullName?: string;
  contactName?: string;
  phone?: string;
  tags?: string[];
}

interface PipelineStage {
  id: string;
  name: string;
  position: number;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface DetectedOpportunity {
  tier: "missed" | "warning" | "possible";
  triggerRules: string[];
  priorityScore: number;
  contactName: string | null;
  contactPhone: string | null;
  propertyAddress: string | null;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  ghlPipelineStageId: string | null;
  ghlPipelineStageName: string | null;
  relatedCallId: number | null;
  teamMemberId: number | null;
  teamMemberName: string | null;
  assignedTo: string | null;
  detectionSource: "pipeline" | "conversation" | "transcript" | "hybrid" | "call_grade" | "system";
  lastActivityAt: Date | null;
  lastStageChangeAt: Date | null;
  transcriptExcerpt: string;
  // Price data extracted from transcripts
  ourOffer: number | null;
  sellerAsk: number | null;
  priceGap: number | null;
}

/** Default price fields for detections that don't have price data */
const NO_PRICE_DATA = { ourOffer: null, sellerAsk: null, priceGap: null };

/**
 * Extract dollar amounts from a transcript using LLM for accurate context understanding.
 * Falls back to regex-based extraction if LLM fails.
 * Returns { ourOffer, sellerAsk, priceGap } with values in whole dollars.
 */
async function extractPricesFromTranscriptLLM(transcript: string): Promise<{ ourOffer: number | null; sellerAsk: number | null; priceGap: number | null }> {
  if (!transcript) return NO_PRICE_DATA;
  
  // Use a larger excerpt to catch prices mentioned later in the call
  const excerpt = transcript.substring(0, 4000);
  
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You extract price information from real estate call transcripts. Identify:
1. "our_offer" — the price OUR TEAM (the buyer/wholesaler/investor) offered or would pay for the property
2. "seller_ask" — the price the SELLER wants, is asking for, or would accept

RULES:
- Only extract prices that are clearly about the property purchase/sale price
- Do NOT extract: taxes, repairs, rent, mortgage payments, ARV, renovation costs, closing costs, commissions
- Numbers may be stated as "105 thousand", "one-oh-five", "105k", "$105,000", etc.
- If a number is ambiguous or you're not sure which side it belongs to, return null for that field
- It's better to return null than a wrong number
- Return whole dollar amounts (no cents)`
        },
        {
          role: "user",
          content: `Extract the offer and asking prices from this transcript excerpt:\n\n${excerpt}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "price_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              our_offer: { type: ["number", "null"], description: "Our team's offer price in whole dollars, or null if not mentioned" },
              seller_ask: { type: ["number", "null"], description: "Seller's asking price in whole dollars, or null if not mentioned" }
            },
            required: ["our_offer", "seller_ask"],
            additionalProperties: false
          }
        }
      }
    });
    
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    const ourOffer = typeof parsed.our_offer === "number" ? parsed.our_offer : null;
    const sellerAsk = typeof parsed.seller_ask === "number" ? parsed.seller_ask : null;
    const priceGap = (ourOffer !== null && sellerAsk !== null) ? Math.abs(sellerAsk - ourOffer) : null;
    
    return { ourOffer, sellerAsk, priceGap };
  } catch (error) {
    console.warn("[OpportunityDetection] LLM price extraction failed, falling back to regex:", error);
    return extractPricesFromTranscriptRegex(transcript);
  }
}

/**
 * Regex-based fallback for price extraction.
 * Used when LLM is unavailable or fails.
 */
function extractPricesFromTranscriptRegex(transcript: string): { ourOffer: number | null; sellerAsk: number | null; priceGap: number | null } {
  if (!transcript) return NO_PRICE_DATA;

  // Find all dollar amounts in the transcript
  const amountPattern = /\$(\d[\d,]*(?:\.\d{2})?)|(\ d[\d,]*(?:\.\d{2})?)\s*(?:thousand|k\b)/gi;
  const amounts: { value: number; context: string; index: number }[] = [];

  let match;
  while ((match = amountPattern.exec(transcript)) !== null) {
    let raw = match[1] || match[2];
    if (!raw) continue;
    let value = parseFloat(raw.replace(/,/g, ""));
    if (match[0].toLowerCase().includes("thousand") || match[0].toLowerCase().endsWith("k")) {
      value *= 1000;
    }
    if (value < 10_000 || value > 10_000_000) continue;
    const start = Math.max(0, match.index - 100);
    const end = Math.min(transcript.length, match.index + match[0].length + 100);
    const context = transcript.substring(start, end).toLowerCase();
    
    const nonPriceContext = /\b(tax|taxes|rent|rental|income|mortgage|payment|repair|renovation|assessment|insurance|hoa|fee|dues|deposit|earnest|closing cost|commission|arv|after repair|monthly|per month|year|annual|square foot|per sq)\b/;
    if (nonPriceContext.test(context) && !/(asking|offer|want|need|take|pay|price|worth|value|sell for|buy for|looking for)/.test(context)) {
      continue;
    }
    
    amounts.push({ value, context, index: match.index });
  }

  if (amounts.length === 0) return NO_PRICE_DATA;

  let ourOffer: number | null = null;
  let sellerAsk: number | null = null;

  const ourPatterns = /\b((?:we|our|i)(?:'d| would| can| could)? (?:offer|pay|do|go|come in at)|our offer|we offered|offered (?:him|her|them)|came in at|we(?:'re| are) at)/;
  const sellerPatterns = /\b((?:want|need|asking|looking for|hoping for|at least|minimum|bottom line|won't go below|won't take less|i(?:'d| would) take|my price|i want|i need|they want|(?:he|she) wants?|(?:he|she) (?:is |was )?asking|seller(?:'s)? ask|asking price))/;

  for (const amt of amounts) {
    if (sellerPatterns.test(amt.context) && !sellerAsk) {
      sellerAsk = amt.value;
    } else if (ourPatterns.test(amt.context) && !ourOffer) {
      ourOffer = amt.value;
    }
  }

  const priceGap = (ourOffer !== null && sellerAsk !== null) ? Math.abs(sellerAsk - ourOffer) : null;

  return { ourOffer, sellerAsk, priceGap };
}

/**
 * Synchronous wrapper that uses regex extraction.
 * Used ONLY as a fallback when async is not available.
 * Prefer extractPricesFromTranscriptLLM() for accurate results.
 */
function extractPricesFromTranscriptSync(transcript: string): { ourOffer: number | null; sellerAsk: number | null; priceGap: number | null } {
  return extractPricesFromTranscriptRegex(transcript);
}

/**
 * Check if there's been recent outbound activity (calls, SMS, emails) in GHL conversations
 * for a given contact since a specific date. This prevents false "team went silent" signals
 * when the team has been actively working the lead through GHL but activity isn't in Gunner's DB.
 */
async function hasRecentGHLOutboundActivity(
  creds: GHLCredentials | null,
  contactId: string | null,
  sinceDate: Date
): Promise<{ hasActivity: boolean; outboundCount: number; inboundCount: number; lastOutboundAt: Date | null; summary: string | null }> {
  const noActivity = { hasActivity: false, outboundCount: 0, inboundCount: 0, lastOutboundAt: null, summary: null };
  if (!creds || !contactId) return noActivity;
  
  try {
    const conversations = await ghlFetch(
      creds,
      `/conversations/search?locationId=${creds.locationId}&contactId=${contactId}`
    );
    const convList = conversations.conversations || [];
    if (convList.length === 0) return noActivity;
    
    const conv = convList[0];
    const lastMsgDate = new Date(conv.lastMessageDate);
    
    // If no messages since the cutoff date, no recent activity
    if (lastMsgDate < sinceDate) return noActivity;
    
    // Fetch recent messages and filter to those after sinceDate
    const messages = await fetchConversationMessages(creds, conv.id, 30);
    const recentMessages = messages.filter((m: GHLMessageDetail) => {
      const msgDate = new Date(m.dateAdded);
      return msgDate > sinceDate;
    });
    
    if (recentMessages.length === 0) return noActivity;
    
    const outbound = recentMessages.filter((m: GHLMessageDetail) => m.direction === "outbound");
    const inbound = recentMessages.filter((m: GHLMessageDetail) => m.direction === "inbound");
    const lastOutbound = outbound.length > 0 ? new Date(outbound[0].dateAdded) : null;
    
    const parts: string[] = [];
    if (outbound.length > 0) parts.push(`${outbound.length} outbound message${outbound.length > 1 ? "s" : ""}`);
    if (inbound.length > 0) parts.push(`${inbound.length} inbound message${inbound.length > 1 ? "s" : ""}`);
    const summary = parts.length > 0 ? `GHL shows ${parts.join(" and ")} since ${sinceDate.toLocaleDateString()}.` : null;
    
    return {
      hasActivity: outbound.length > 0,
      outboundCount: outbound.length,
      inboundCount: inbound.length,
      lastOutboundAt: lastOutbound,
      summary
    };
  } catch (err) {
    console.error(`[OpportunityDetection] Error checking GHL activity for contact ${contactId}:`, err);
    return noActivity;
  }
}

// ============ GHL USER ID → TEAM MEMBER RESOLVER ============

type GhlUserIdMap = Map<string, { id: number; name: string }>;

/**
 * Resolve a GHL assignedTo user ID to a Gunner team member.
 * Returns { teamMemberId, teamMemberName } or nulls if not found.
 */
function resolveGhlAssignee(
  ghlUserId: string | undefined | null,
  ghlMap: GhlUserIdMap
): { teamMemberId: number | null; teamMemberName: string | null } {
  if (!ghlUserId || !ghlMap.has(ghlUserId)) {
    return { teamMemberId: null, teamMemberName: null };
  }
  const member = ghlMap.get(ghlUserId)!;
  return { teamMemberId: member.id, teamMemberName: member.name };
}

// ============ SALES PROCESS PIPELINE STAGE CLASSIFICATION ============

// Default stage classifications — used when tenant has no custom stageClassification in crmConfig.
// These are broad keyword patterns that match common real estate CRM setups.
const DEFAULT_ACTIVE_PATTERNS = [
  "new lead", "warm", "hot", "pending", "walkthrough", "apt scheduled",
  "appointment", "offer", "under contract", "purchased", "qualified",
  "interested", "active", "engaged", "scheduled"
];

const DEFAULT_FOLLOW_UP_PATTERNS = [
  "follow up", "follow-up", "followup", "nurture", "drip",
  "month", "year", "later", "callback", "re-engage",
  "new offer", "new walkthrough"
];

const DEFAULT_DEAD_PATTERNS = [
  "ghost", "dead", "lost", "closed lost", "do not", "dnc",
  "not interested", "sold", "trash", "junk", "disqualified",
  "agreement not closed", "removed", "unqualified"
];

const DEFAULT_HIGH_VALUE_PATTERNS = [
  "warm", "hot", "pending", "walkthrough", "apt scheduled",
  "appointment", "offer", "qualified"
];

const DEFAULT_OFFER_PATTERNS = [
  "offer", "under contract", "closing"
];

/**
 * Per-tenant stage classification config stored in crmConfig.stageClassification.
 * If present, these arrays of stage names (case-insensitive) override the defaults.
 */
export interface StageClassificationConfig {
  activeStages?: string[];
  followUpStages?: string[];
  deadStages?: string[];
  highValueStages?: string[];
  offerStages?: string[];
}

// Module-level tenant stage config cache — set per-scan via setTenantStageConfig()
let _tenantStageConfig: StageClassificationConfig | null = null;

export function setTenantStageConfig(config: StageClassificationConfig | null) {
  _tenantStageConfig = config;
}

function matchesAny(stageName: string, patterns: string[]): boolean {
  const lower = stageName.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

function classifyStage(stageName: string): "active" | "follow_up" | "dead" | "unknown" {
  // Use tenant-specific config if available, otherwise use smart defaults
  if (_tenantStageConfig) {
    if (_tenantStageConfig.activeStages?.length && matchesAny(stageName, _tenantStageConfig.activeStages)) return "active";
    if (_tenantStageConfig.followUpStages?.length && matchesAny(stageName, _tenantStageConfig.followUpStages)) return "follow_up";
    if (_tenantStageConfig.deadStages?.length && matchesAny(stageName, _tenantStageConfig.deadStages)) return "dead";
    // If tenant config exists but stage doesn't match any category, fall through to defaults
  }
  if (matchesAny(stageName, DEFAULT_DEAD_PATTERNS)) return "dead";
  if (matchesAny(stageName, DEFAULT_FOLLOW_UP_PATTERNS)) return "follow_up";
  if (matchesAny(stageName, DEFAULT_ACTIVE_PATTERNS)) return "active";
  return "unknown";
}

function isHighValueStage(stageName: string): boolean {
  if (_tenantStageConfig?.highValueStages?.length) {
    return matchesAny(stageName, _tenantStageConfig.highValueStages);
  }
  return matchesAny(stageName, DEFAULT_HIGH_VALUE_PATTERNS);
}

function isOfferOrBeyond(stageName: string): boolean {
  if (_tenantStageConfig?.offerStages?.length) {
    return matchesAny(stageName, _tenantStageConfig.offerStages);
  }
  return matchesAny(stageName, DEFAULT_OFFER_PATTERNS);
}

function isWalkthroughStage(stageName: string): boolean {
  return stageName.toLowerCase().includes("walkthrough") || stageName.toLowerCase().includes("walk-through");
}

// ============ GHL API HELPERS ============

async function ghlFetch(creds: GHLCredentials, path: string, _retries = 1): Promise<any> {
  const url = `${GHL_API_BASE}${path}`;

  // Fail fast: skip if circuit breaker is open
  if (!ghlCircuitBreaker.canProceed("normal")) {
    console.log(`[OpportunityDetection] Circuit breaker open — skipping ${path}`);
    throw new Error("CRM is temporarily busy due to rate limiting.");
  }

  ghlCircuitBreaker.recordRequest();
  const response = await oauthAwareFetch(url, {
    headers: {
      "Authorization": `Bearer ${creds.apiKey}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
    },
  }, {
    tenantId: creds.tenantId || 0,
    isOAuth: creds.isOAuth || false,
    apiKey: creds.apiKey,
    onTokenRefreshed: (t) => { creds.apiKey = t; },
  });

  if (response.ok) {
    ghlCircuitBreaker.recordSuccess();
    return response.json();
  }

  const text = await response.text();
  if (response.status === 429) {
    ghlCircuitBreaker.record429();
    console.log(`[OpportunityDetection] Rate limited (429) on ${path} — failing fast`);
    throw new Error("CRM is temporarily busy due to rate limiting.");
  }

  throw new Error(`GHL API ${response.status}: ${text}`);
}

async function fetchPipelines(creds: GHLCredentials): Promise<Pipeline[]> {
  const data = await ghlFetch(creds, `/opportunities/pipelines?locationId=${creds.locationId}`);
  return data.pipelines || [];
}

async function fetchPipelineOpportunities(
  creds: GHLCredentials,
  pipelineId: string,
  stageId?: string,
  maxResults = 100
): Promise<GHLPipelineOpportunity[]> {
  const allOpps: GHLPipelineOpportunity[] = [];
  const pageSize = Math.min(maxResults, 100); // GHL max is 100 per page
  let startAfter: string | number | undefined;
  let startAfterId: string | undefined;
  let fetched = 0;

  while (fetched < maxResults) {
    let path = `/opportunities/search?location_id=${creds.locationId}&pipeline_id=${pipelineId}&limit=${pageSize}`;
    if (stageId) path += `&pipeline_stage_id=${stageId}`;
    if (startAfter && startAfterId) path += `&startAfter=${startAfter}&startAfterId=${startAfterId}`;
    const data = await ghlFetch(creds, path);
    const opps = data.opportunities || [];
    allOpps.push(...opps);
    fetched += opps.length;
    if (opps.length < pageSize) break; // No more pages
    // Use meta pagination cursors from GHL response
    const meta = data.meta;
    if (meta?.startAfter && meta?.startAfterId) {
      startAfter = meta.startAfter;
      startAfterId = meta.startAfterId;
    } else {
      break; // No more pages
    }
  }

  return allOpps.slice(0, maxResults);
}

async function fetchRecentConversations(
  creds: GHLCredentials,
  limit = 200
): Promise<GHLConversation[]> {
  const data = await ghlFetch(
    creds,
    `/conversations/search?locationId=${creds.locationId}&limit=${limit}&sort=desc&sortBy=last_message_date`
  );
  return data.conversations || [];
}

// Fetch individual messages from a conversation (for content analysis)
interface GHLMessageDetail {
  id: string;
  body?: string;
  direction: string;
  type: number;
  messageType?: string;
  contentType?: string;
  dateAdded: string;
  contactId?: string;
}

async function fetchConversationMessages(
  creds: GHLCredentials,
  conversationId: string,
  limit = 20
): Promise<GHLMessageDetail[]> {
  try {
    const data = await ghlFetch(
      creds,
      `/conversations/${conversationId}/messages`
    );
    const messages = data.messages?.messages || data.messages || [];
    return messages.slice(0, limit);
  } catch (error) {
    console.error(`[OpportunityDetection] Error fetching messages for conversation ${conversationId}:`, error);
    return [];
  }
}

async function fetchContactById(creds: GHLCredentials, contactId: string): Promise<any> {
  try {
    const data = await ghlFetch(creds, `/contacts/${contactId}`);
    return data.contact || data;
  } catch {
    return null;
  }
}

// ============ APPOINTMENT & OFFER AWARENESS HELPERS ============

/**
 * Fetch appointments for a contact from GHL.
 * Returns an array of appointment objects with startTime.
 */
async function fetchContactAppointments(creds: GHLCredentials, contactId: string): Promise<any[]> {
  try {
    const data = await ghlFetch(creds, `/contacts/${contactId}/appointments`);
    return data.events || data.appointments || [];
  } catch {
    return [];
  }
}

/**
 * Check if a contact has open (uncompleted) tasks in GHL — if so, the team has a follow-up planned.
 */
async function hasOpenFollowUpTask(creds: GHLCredentials | null, contactId: string | null): Promise<boolean> {
  if (!creds || !contactId) return false;
  try {
    const data = await ghlFetch(creds, `/contacts/${contactId}/tasks`);
    const tasks = data.tasks || [];
    return tasks.some((t: any) => !t.completed);
  } catch {
    return false;
  }
}

async function hasUpcomingAppointment(creds: GHLCredentials | null, contactId: string | null): Promise<boolean> {
  if (!creds || !contactId) return false;
  try {
    const appointments = await fetchContactAppointments(creds, contactId);
    const now = Date.now();
    return appointments.some((apt: any) => {
      const startTime = apt.startTime || apt.start_time || apt.appointmentDate || apt.date;
      if (!startTime) return false;
      return new Date(startTime).getTime() > now;
    });
  } catch {
    return false;
  }
}

/**
 * Check if any call transcript for a contact mentions an offer being discussed.
 * This catches cases where an offer was discussed verbally but not recorded
 * in the callOutcome field (e.g., "we offered $230,000" in transcript).
 */
async function hasOfferInTranscripts(db: any, tenantId: number, ghlContactId: string): Promise<boolean> {
  try {
    const contactCalls = await db
      .select({ transcript: calls.transcript })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, ghlContactId),
          sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
        )
      )
      .orderBy(sql`${calls.callTimestamp} DESC`)
      .limit(5);

    const OFFER_PATTERNS = [
      /(?:we|i|our team)\s+(?:offered|can offer|could offer|would offer|came in at|put in an offer)/i,
      /(?:offer|offered)\s+(?:of\s+)?\$[\d,]+/i,
      /\$[\d,]+\s+(?:offer|was our offer)/i,
      /(?:send|sent|sending)\s+(?:you\s+)?(?:an\s+)?offer/i,
      /(?:put|putting)\s+(?:together|in)\s+(?:an\s+)?offer/i,
      /(?:present|presented|presenting)\s+(?:an\s+)?offer/i,
      /(?:made|make|making)\s+(?:an\s+)?offer/i,
      /(?:verbal|written)\s+offer/i,
      /offer\s+(?:price|amount|number)\s+(?:is|was|of)/i,
    ];

    for (const call of contactCalls) {
      if (!call.transcript) continue;
      if (OFFER_PATTERNS.some(p => p.test(call.transcript))) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a contact has progressed through the pipeline beyond initial stages.
 * Returns the highest stage reached (e.g., "walkthrough", "offer", "under_contract").
 * Used to suppress false positives like "only 1 call" when the deal has actually progressed.
 */
async function getContactPipelineProgression(
  creds: GHLCredentials | null,
  contactId: string | null,
  contactOppMap?: Map<string, { opp: GHLPipelineOpportunity; stageName: string }>
): Promise<{ hasProgressed: boolean; currentStage: string | null; isWalkthroughOrBeyond: boolean; isOfferOrBeyond: boolean }> {
  const noProgression = { hasProgressed: false, currentStage: null, isWalkthroughOrBeyond: false, isOfferOrBeyond: false };
  if (!contactId) return noProgression;

  // Check from the pre-built map if available
  if (contactOppMap && contactOppMap.has(contactId)) {
    const info = contactOppMap.get(contactId)!;
    const stageName = info.stageName;
    const lower = stageName.toLowerCase();
    const isWalkthrough = lower.includes("walkthrough") || lower.includes("walk-through") || lower.includes("pending") || lower.includes("scheduled");
    const isOffer = lower.includes("offer") || lower.includes("made offer") || lower.includes("under contract") || lower.includes("purchased");
    return {
      hasProgressed: isWalkthrough || isOffer || lower.includes("hot lead"),
      currentStage: stageName,
      isWalkthroughOrBeyond: isWalkthrough || isOffer,
      isOfferOrBeyond: isOffer,
    };
  }

  return noProgression;
}

// ============ DETECTION RULES ============

/**
 * TIER 1 — MISSED DEALS (urgent, money left on table)
 */

// Rule 1: Lead moved to Follow Up without any calls or communication
// Simple rule: if a lead is now in a Follow Up stage, the move was recent (7 days),
// and there were ZERO calls (inbound or outbound) in the 48 hours before the move,
// then nobody talked to this person before shelving them.
async function detectBackwardMovement(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap
): Promise<DetectedOpportunity | null> {
  const stageClass = classifyStage(stageName);
  if (stageClass !== "follow_up") return null;

  // Must have a recent stage change (within 7 days)
  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null;
  if (!stageChangeAt) return null;
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (stageChangeAt < sevenDaysAgo) return null;

  // Check if there was ANY call (inbound or outbound) in the 48 hours before the move
  const recentCalls = await db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        gte(calls.callTimestamp, new Date(stageChangeAt.getTime() - 48 * 60 * 60 * 1000)),
        sql`${calls.callTimestamp} <= ${stageChangeAt}`
      )
    )
    .limit(1);

  if (recentCalls.length > 0) return null; // Someone talked to them before moving — that's fine

  return {
    tier: "missed",
    triggerRules: ["backward_movement_no_call"],
    priorityScore: 80,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp.assignedTo, ghlMap),
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: "",
    ...NO_PRICE_DATA,
  };
}

// Rule 2: Repeat inbound from same seller (2+ in a week) not prioritized
async function detectRepeatInbound(
  conversation: GHLConversation,
  creds: GHLCredentials,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap,
  opp: GHLPipelineOpportunity | null
): Promise<DetectedOpportunity | null> {
  if (conversation.lastMessageDirection !== "inbound") return null;

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  // Check how many inbound calls/messages from this contact in the last week
  const recentInbound = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, conversation.contactId),
        eq(calls.callDirection, "inbound"),
        gte(calls.callTimestamp, oneWeekAgo)
      )
    );

  if (recentInbound.length < 2) return null;

  // Check if any of the inbound calls were actually answered (completed with a real conversation)
  // An answered inbound call means the team DID respond — they picked up the phone
  const answeredInbound = recentInbound.filter(
    (c: any) => c.status === "completed" && c.classification === "conversation" && c.duration && c.duration > 60
  );
  if (answeredInbound.length > 0) return null; // Team answered inbound calls — not ignored

  // Also check if team made an outbound call after the latest inbound
  const latestInbound = recentInbound[0];
  const responseCall = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, conversation.contactId),
        eq(calls.callDirection, "outbound"),
        gte(calls.callTimestamp, latestInbound.callTimestamp)
      )
    )
    .limit(1);

  if (responseCall.length > 0) return null; // Team responded with outbound call

  return {
    tier: "missed",
    triggerRules: ["repeat_inbound_ignored"],
    priorityScore: 80,
    contactName: conversation.fullName || conversation.contactName || null,
    contactPhone: conversation.phone || null,
    propertyAddress: null,
    ghlContactId: conversation.contactId,
    ghlOpportunityId: null,
    ghlPipelineStageId: null,
    ghlPipelineStageName: null,
    relatedCallId: latestInbound?.id || null,
    ...resolveGhlAssignee(opp?.assignedTo, ghlMap),
    assignedTo: opp?.assignedTo || null,
    detectionSource: "conversation",
    lastActivityAt: new Date(conversation.lastMessageDate),
    lastStageChangeAt: null,
    transcriptExcerpt: "",
    ...NO_PRICE_DATA,
  };
}

// Rule 3: Inbound from Follow Up lead unanswered within 4 hours
async function detectFollowUpInboundIgnored(
  conversation: GHLConversation,
  opp: GHLPipelineOpportunity | null,
  stageName: string | null,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity | null> {
  if (conversation.lastMessageDirection !== "inbound") return null;
  if (!stageName || classifyStage(stageName) !== "follow_up") return null;

  const lastMsgTime = new Date(conversation.lastMessageDate);
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  
  // Only flag if the inbound was more than 4 hours ago and still unanswered
  if (lastMsgTime > fourHoursAgo) return null; // Still within SLA

  // Check if there was a response
  if (conversation.unreadCount === 0) return null; // Already read/responded

  // Check if any recent inbound calls from this contact were actually answered (completed conversations)
  // If the team picked up the phone and had a real conversation, this is NOT ignored
  const fourHoursAgoDate = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, conversation.contactId),
        gte(calls.callTimestamp, fourHoursAgoDate)
      )
    );
  
  // If any call (inbound answered OR outbound) was a completed conversation, not ignored
  const answeredCall = recentCalls.find(
    (c: any) => c.status === "completed" && c.classification === "conversation" && c.duration && c.duration > 60
  );
  if (answeredCall) return null; // Team engaged with this contact recently

  // CHECK GHL CONVERSATIONS — team may be texting/calling through GHL without it showing in Gunner
  const ghlActivity = await hasRecentGHLOutboundActivity(creds, conversation.contactId, fourHoursAgoDate);
  if (ghlActivity.hasActivity) {
    return null; // Team has been actively working this lead through GHL — not ignored
  }

  // DQ SUPPRESSION: If the last call was a proper DQ conversation (not interested, not selling, etc.),
  // don't flag the inbound as "ignored" — the lead was properly disqualified
  const lastCallForContact = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, conversation.contactId)
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(1);
  
  if (lastCallForContact.length > 0) {
    const lastCall = lastCallForContact[0];
    const dqClassifications = ["not interested", "not selling", "wrong number", "do not call", "dnc"];
    if (lastCall.classification && dqClassifications.includes(lastCall.classification.toLowerCase())) {
      return null; // Last call was a proper DQ — inbound from a DQ'd lead doesn't need urgent response
    }
  }

  return {
    tier: "warning",
    triggerRules: ["followup_inbound_ignored"],
    priorityScore: 80,
    contactName: conversation.fullName || conversation.contactName || null,
    contactPhone: conversation.phone || null,
    propertyAddress: null,
    ghlContactId: conversation.contactId,
    ghlOpportunityId: opp?.id || null,
    ghlPipelineStageId: opp?.pipelineStageId || null,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp?.assignedTo, ghlMap),
    assignedTo: opp?.assignedTo || null,
    detectionSource: "conversation",
    lastActivityAt: lastMsgTime,
    lastStageChangeAt: null,
    transcriptExcerpt: conversation.lastMessageBody || "",
    ...NO_PRICE_DATA,
  };
}

// Rule 14: Active negotiation/engagement in follow-up stage
// Catches contacts who are in follow-up stages but have recent inbound SMS/messages
// showing active engagement or negotiation. This is the "still talking but got shelved" pattern.
// Unlike Rule 3 (which only catches unread messages >4h old), this rule:
// - Looks at actual message content for negotiation keywords
// - Works even if messages were "read" but not acted on
// - Checks the last 72 hours of message history
const NEGOTIATION_KEYWORDS = [
  // Direct negotiation signals
  "consider", "counter", "counteroffer", "negotiate", "negotiating",
  "lower", "come down", "meet in the middle", "split the difference",
  "best offer", "final offer", "bottom line", "lowest",
  // Price/offer discussion
  "what if", "how about", "would you", "willing to",
  "offer", "price", "amount", "number",
  // Active consideration
  "think about it", "thinking about", "considering", "might accept",
  "let me talk to", "talk to my", "discuss with",
  "husband", "wife", "partner", "family",
  // Engagement signals (seller is still warm)
  "interested", "still interested", "want to sell", "ready to",
  "when can", "how soon", "next step", "move forward",
  "send me", "send over", "paperwork", "contract",
  // Re-engagement after silence
  "changed my mind", "reconsidered", "thought about",
  "calling back", "reaching out", "following up",
];

async function detectActiveNegotiationInFollowUp(
  conversation: GHLConversation,
  opp: GHLPipelineOpportunity | null,
  stageName: string | null,
  creds: GHLCredentials,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap
): Promise<DetectedOpportunity | null> {
  // Must be in a follow-up stage
  if (!stageName || classifyStage(stageName) !== "follow_up") return null;

  // Check if last message was recent (within 72 hours)
  const lastMsgTime = new Date(conversation.lastMessageDate);
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
  if (lastMsgTime < seventyTwoHoursAgo) return null; // No recent activity

  // Fetch actual message history to analyze content
  let messages: GHLMessageDetail[] = [];
  try {
    messages = await fetchConversationMessages(creds, conversation.id, 20);
  } catch {
    // If we can't fetch messages, fall back to lastMessageBody
  }

  // Collect recent inbound message bodies (last 72 hours)
  const recentInboundBodies: string[] = [];

  for (const msg of messages) {
    if (!msg.body) continue;
    if (msg.direction !== "inbound") continue;
    const msgDate = new Date(msg.dateAdded);
    if (msgDate < seventyTwoHoursAgo) continue;
    recentInboundBodies.push(msg.body);
  }

  // Fallback: if we couldn't fetch messages but have lastMessageBody and it's inbound
  if (recentInboundBodies.length === 0 && conversation.lastMessageBody && conversation.lastMessageDirection === "inbound") {
    recentInboundBodies.push(conversation.lastMessageBody);
  }

  if (recentInboundBodies.length === 0) return null; // No recent inbound messages

  // Check for negotiation/engagement keywords in the messages
  const allText = recentInboundBodies.join(" ").toLowerCase();
  const matchedKeywords = NEGOTIATION_KEYWORDS.filter(kw => allText.includes(kw.toLowerCase()));

  // Need at least 1 negotiation keyword match to trigger
  if (matchedKeywords.length === 0) return null;

  // Build a meaningful excerpt from the inbound messages
  const excerpt = recentInboundBodies.slice(0, 3).join(" | ").substring(0, 500);

  // Calculate priority based on keyword strength
  // Worth a Look tier: base 50, scales up to 65 with more keyword matches
  const basePriority = 50;
  const keywordBonus = Math.min(matchedKeywords.length * 3, 15);
  const priorityScore = Math.min(basePriority + keywordBonus, 65);

  return {
    tier: "possible",
    triggerRules: ["active_negotiation_in_followup"],
    priorityScore,
    contactName: conversation.fullName || conversation.contactName || opp?.name || null,
    contactPhone: conversation.phone || opp?.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: conversation.contactId,
    ghlOpportunityId: opp?.id || null,
    ghlPipelineStageId: opp?.pipelineStageId || null,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp?.assignedTo, ghlMap),
    assignedTo: opp?.assignedTo || null,
    detectionSource: "conversation",
    lastActivityAt: lastMsgTime,
    lastStageChangeAt: opp?.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null,
    transcriptExcerpt: excerpt,
    ...NO_PRICE_DATA,
  };
}

// Rule 4: Offer made but no counter/follow-up within 48h
async function detectOfferNoFollowUp(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity | null> {
  if (!isOfferOrBeyond(stageName)) return null;

  // If the stage explicitly says an appointment is scheduled, the team is actively on it — skip
  const lower = stageName.toLowerCase();
  if (lower.includes("apt scheduled") || lower.includes("appointment scheduled") || lower.includes("under contract") || lower.includes("purchased")) {
    return null;
  }

  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null;
  if (!stageChangeAt) return null;

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  if (stageChangeAt > fortyEightHoursAgo) return null; // Still within window

  // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the team has a next step planned
  const hasFutureApt = await hasUpcomingAppointment(creds, opp.contactId);
  if (hasFutureApt) return null; // Appointment scheduled — team is working it
  const hasTask = await hasOpenFollowUpTask(creds, opp.contactId);
  if (hasTask) return null; // Open task exists — team has follow-up planned

  // Check if there's been any outbound activity since the offer
  const recentOutbound = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        eq(calls.callDirection, "outbound"),
        gte(calls.callTimestamp, stageChangeAt)
      )
    )
    .limit(1);

  if (recentOutbound.length > 0) return null; // There was follow-up in Gunner DB

  // CHECK GHL CONVERSATIONS — team may be calling/texting through GHL without it showing in Gunner
  const ghlActivity = await hasRecentGHLOutboundActivity(creds, opp.contactId, stageChangeAt);
  if (ghlActivity.hasActivity) {
    return null; // Team has been actively working this lead through GHL — not silent
  }

  return {
    tier: "warning",
    triggerRules: ["offer_no_followup"],
    priorityScore: 78,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp.assignedTo, ghlMap),
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: ghlActivity.lastOutboundAt || stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: ghlActivity.summary || "",
    ...NO_PRICE_DATA,
  };
}

// Rule 5: New lead with no first call within 15 min SLA
async function detectNewLeadSLABreach(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap
): Promise<DetectedOpportunity | null> {
  const lower = stageName.toLowerCase();
  if (!lower.includes("new lead")) return null;

  const createdAt = new Date(opp.createdAt);
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  
  if (createdAt > fifteenMinAgo) return null; // Still within SLA

  // Check if there's been any outbound call
  const outboundCall = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        gte(calls.callTimestamp, createdAt)
      )
    )
    .limit(1);

  if (outboundCall.length > 0) return null; // Call was made

  // Only flag if lead is still in New Lead stage (hasn't progressed)
  if (opp.pipelineStageId !== opp.pipelineStageId) return null; // redundant but safe

  return {
    tier: "warning",
    triggerRules: ["new_lead_sla_breach"],
    priorityScore: 60,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp.assignedTo, ghlMap),
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: createdAt,
    lastStageChangeAt: null,
    transcriptExcerpt: "",
    ...NO_PRICE_DATA,
  };
}

// Rule 6: Seller stated price but no follow-up within 48h (transcript-enriched)
async function detectPriceStatedNoFollowUp(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null,
  contactOppMap?: Map<string, { opp: GHLPipelineOpportunity; stageName: string }>
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

  // Get recent calls with transcripts
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        gte(calls.callTimestamp, fourDaysAgo),
        lt(calls.callTimestamp, twoDaysAgo)
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(50);

  const pricePatterns = [
    /i(?:'d|would)\s+take\s+\$?[\d,]+/i,
    /asking\s+(?:price\s+)?(?:is\s+)?\$?[\d,]+/i,
    /i\s+want\s+\$?[\d,]+/i,
    /(?:need|want)\s+at\s+least\s+\$?[\d,]+/i,
    /\$[\d,]+\s*(?:thousand|k)/i,
    /bottom\s+(?:line|dollar)\s+(?:is\s+)?\$?[\d,]+/i,
  ];

  for (const call of recentCalls) {
    if (!call.transcript || !call.ghlContactId) continue;

    const hasPriceMention = pricePatterns.some(p => p.test(call.transcript));
    if (!hasPriceMention) continue;

    // Check if there was a follow-up call after this one
    const followUp = await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp)
        )
      )
      .limit(2);

    if (followUp.length > 1) continue; // There was a follow-up

    // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the team has a next step planned
    const hasFutureApt = await hasUpcomingAppointment(creds, call.ghlContactId);
    if (hasFutureApt) continue; // Appointment scheduled — team is working it
    const hasTask = await hasOpenFollowUpTask(creds, call.ghlContactId);
    if (hasTask) continue; // Open task exists — team has follow-up planned

    // PIPELINE CHECK: If contact is in an advanced stage, suppress
    const progression = await getContactPipelineProgression(creds, call.ghlContactId, contactOppMap);
    if (progression.isOfferOrBeyond) continue; // Already in offer stage — price discussion led to action

    // Extract actual dollar amounts from the transcript using LLM
    const priceData = await extractPricesFromTranscriptLLM(call.transcript);

    results.push({
      tier: "possible",
      triggerRules: ["price_stated_no_followup"],
      priorityScore: 70,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "hybrid",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: call.transcript.substring(0, 500),
      ...priceData,
    });
  }

  return results;
}

/**
 * TIER 2 — AT RISK (needs attention soon)
 */

// Rule 7: Motivated seller with only 1 call, no 2nd attempt in 72h
async function detectMotivatedOneDone(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null,
  contactOppMap?: Map<string, { opp: GHLPipelineOpportunity; stageName: string }>
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const MOTIVATION_KEYWORDS = [
    "divorce", "foreclosure", "inherited", "estate", "relocating",
    "tired of landlording", "bad tenants", "code violations", "fire damage",
    "tax lien", "back taxes", "health issues", "downsizing", "job loss",
    "need to sell fast", "need to sell quick", "asap", "deadline",
    "can't afford", "behind on payments", "passed away", "death"
  ];

  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        gte(calls.callTimestamp, sevenDaysAgo),
        lt(calls.callTimestamp, threeDaysAgo)
      )
    )
    .limit(50);

  for (const call of recentCalls) {
    if (!call.transcript || !call.ghlContactId) continue;

    const lower = call.transcript.toLowerCase();
    const hasMotivation = MOTIVATION_KEYWORDS.some(k => lower.includes(k));
    if (!hasMotivation) continue;

    // Check total calls to this contact — get full history with details
    const allCalls = await db
      .select({
        id: calls.id,
        callType: calls.callType,
        callOutcome: calls.callOutcome,
        callTimestamp: calls.callTimestamp,
        classification: calls.classification,
        teamMemberName: calls.teamMemberName,
      })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId)
        )
      )
      .orderBy(calls.callTimestamp);

    // If there are multiple calls with conversations, this isn't a "one and done" situation
    const conversationCalls = allCalls.filter((c: any) => c.classification === "conversation");
    if (conversationCalls.length > 1) continue;

    // Check if any call had a positive outcome (appointment, offer, callback) — means they're working it
    const hasPositiveOutcome = allCalls.some((c: any) => 
      ["appointment_set", "offer_made", "callback_scheduled", "interested"].includes(c.callOutcome)
    );
    if (hasPositiveOutcome) continue; // Team is actively working this lead

    // PIPELINE PROGRESSION CHECK: If the contact has moved to walkthrough/offer/advanced stage
    // in GHL, the team IS working this deal even if only 1 call is logged in Gunner.
    // This is the William Thompson fix — he had walkthrough scheduled, so not "one and done".
    const progression = await getContactPipelineProgression(creds, call.ghlContactId, contactOppMap);
    if (progression.hasProgressed) continue; // Deal has progressed in pipeline

    // FOLLOW-UP STAGE SUPPRESSION: If the lead is in a follow-up or dead stage AND
    // the last call was a proper conversation (not just voicemail/no answer), the team
    // made an informed decision to move them there. Examples: Sara Prinzi (not motivated,
    // wants crazy high price), Matthew Golden (no equity, listing is best option).
    if (progression.currentStage) {
      const stageLower = progression.currentStage.toLowerCase();
      const isFollowUpOrDead = stageLower.includes("follow up") || stageLower.includes("followup") ||
        stageLower.includes("dead") || stageLower.includes("ghost") || stageLower.includes("dq") ||
        stageLower.includes("1 year");
      if (isFollowUpOrDead) {
        // The call was already filtered to classification === "conversation" above,
        // so if they're in follow-up after a real conversation, the team intentionally DQ'd them.
        // Check call outcome — if it's not_interested, dead, or no_answer, suppress.
        const dqOutcomes = ["not_interested", "dead", "no_answer", "left_vm", "none"];
        if (call.callOutcome && dqOutcomes.includes(call.callOutcome)) {
          continue; // Properly DQ'd after real conversation — not a missed opportunity
        }
        // Even without a specific DQ outcome, if the conversation was 60+ seconds
        // and they moved to follow-up, the team made an informed decision
        if (call.duration && call.duration >= 60) {
          continue; // Real conversation + moved to follow-up = intentional DQ
        }
      }
    }

    // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the team has a next step planned
    const hasFutureApt = await hasUpcomingAppointment(creds, call.ghlContactId);
    if (hasFutureApt) continue; // Appointment scheduled — team is working it
    const hasTask = await hasOpenFollowUpTask(creds, call.ghlContactId);
    if (hasTask) continue; // Open task exists — team has follow-up planned

    // Check if any call was an offer or walkthrough type
    const hasAdvancedCallType = allCalls.some((c: any) => 
      ["offer", "seller_callback"].includes(c.callType)
    );
    if (hasAdvancedCallType) continue; // Deal has progressed beyond initial call

    // Find the specific motivation keywords that matched for the summary
    const matchedMotivations = MOTIVATION_KEYWORDS.filter(k => lower.includes(k));

    results.push({
      tier: "warning",
      triggerRules: ["motivated_one_and_done"],
      priorityScore: 65,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: progression.currentStage || null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "hybrid",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      // Include motivation keywords in transcript excerpt so AI reason can be specific
      transcriptExcerpt: `[Motivation signals detected: ${matchedMotivations.join(", ")}] ` + call.transcript.substring(0, 500),
      ...(await extractPricesFromTranscriptLLM(call.transcript)),
    });
  }

  return results;
}

// Rule 8: Lead in Pending Apt/Walkthrough 5+ days with no activity
async function detectStaleActiveStage(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity | null> {
  const lower = stageName.toLowerCase();
  const isStaleCandidate = lower.includes("pending") || lower.includes("walkthrough") || lower.includes("scheduled");
  if (!isStaleCandidate) return null;

  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : new Date(opp.updatedAt);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  
  if (stageChangeAt > fiveDaysAgo) return null; // Not stale yet

  // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the stage isn't really stale
  const hasFutureApt = await hasUpcomingAppointment(creds, opp.contactId);
  if (hasFutureApt) return null; // Appointment scheduled — stage is active
  const hasTask = await hasOpenFollowUpTask(creds, opp.contactId);
  if (hasTask) return null; // Open task exists — team has follow-up planned

  // Check for any recent activity (calls in Gunner DB)
  const recentCalls = await db
    .select({
      callTimestamp: calls.callTimestamp,
      teamMemberName: calls.teamMemberName,
      callType: calls.callType,
      classification: calls.classification,
      duration: calls.duration,
    })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        gte(calls.callTimestamp, fiveDaysAgo)
      )
    )
    .orderBy(desc(calls.callTimestamp));

  if (recentCalls.length > 0) return null; // There's been call activity in Gunner DB

  // CHECK GHL CONVERSATIONS for recent outbound activity (calls, SMS, emails)
  // This catches activity that isn't in Gunner's call DB (e.g., outbound texts, short calls not recorded)
  let ghlActivitySummary: string | null = null;
  let lastGhlActivityAt: Date | null = null;
  if (creds) {
    try {
      const conversations = await ghlFetch(
        creds,
        `/conversations/search?locationId=${creds.locationId}&contactId=${opp.contactId}`
      );
      const convList = conversations.conversations || [];
      if (convList.length > 0) {
        const conv = convList[0];
        const lastMsgDate = new Date(conv.lastMessageDate);
        
        // If there's been ANY message activity since the stage was set, this isn't truly stale
        if (lastMsgDate > stageChangeAt) {
          // Check the actual messages to build an activity summary
          const messages = await fetchConversationMessages(creds, conv.id, 20);
          const recentMessages = messages.filter((m: GHLMessageDetail) => {
            const msgDate = new Date(m.dateAdded);
            return msgDate > stageChangeAt;
          });
          
          if (recentMessages.length > 0) {
            const outboundCount = recentMessages.filter((m: GHLMessageDetail) => m.direction === "outbound").length;
            const inboundCount = recentMessages.filter((m: GHLMessageDetail) => m.direction === "inbound").length;
            
            // If there's been outbound activity within the last 3 business days, suppress entirely
            const lastOutbound = recentMessages.find((m: GHLMessageDetail) => m.direction === "outbound");
            if (lastOutbound) {
              const lastOutDate = new Date(lastOutbound.dateAdded);
              const businessDaysSinceOut = countBusinessDays(lastOutDate, new Date());
              if (businessDaysSinceOut < 3) {
                return null; // Team is actively working this — not stale
              }
            }
            
            // There's been activity but it's been more than 3 business days since last outbound
            // Still flag it, but with accurate activity description
            const activityParts: string[] = [];
            if (outboundCount > 0) activityParts.push(`${outboundCount} outbound message${outboundCount > 1 ? "s" : ""}`);
            if (inboundCount > 0) activityParts.push(`${inboundCount} inbound message${inboundCount > 1 ? "s" : ""}`);
            ghlActivitySummary = `GHL conversation shows ${activityParts.join(" and ")} since stage was set, but no outbound activity in 3+ business days.`;
            lastGhlActivityAt = lastMsgDate;
          }
        }
      }
    } catch (err) {
      // Non-critical — continue without GHL conversation check
      console.error(`[OpportunityDetection] Error checking GHL conversations for stale stage:`, err);
    }
  }

  // Build transcript excerpt with activity context
  let excerpt = "";
  if (ghlActivitySummary) {
    excerpt = ghlActivitySummary;
  }

  return {
    tier: "warning",
    triggerRules: ["stale_active_stage"],
    priorityScore: 60,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp.assignedTo, ghlMap),
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: lastGhlActivityAt || stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: excerpt,
    ...NO_PRICE_DATA,
  };
}

// Rule 9: Lead marked dead/DQ'd but transcript had real selling signals
async function detectDeadWithSignals(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap
): Promise<DetectedOpportunity | null> {
  if (classifyStage(stageName) !== "dead") return null;

  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null;
  if (!stageChangeAt) return null;

  // Only check recently dead leads (within 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  if (stageChangeAt < fourteenDaysAgo) return null;

  // Find calls for this contact with transcripts
  const contactCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        eq(calls.classification, "conversation")
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(3);

  if (contactCalls.length === 0) return null;

  const SELLING_SIGNALS = [
    "timeline", "moving", "relocating", "need to sell",
    "divorce", "inherited", "estate", "foreclosure",
    "fire damage", "condemned", "vacant", "not living there",
    "how does this work", "what would you pay", "send me an offer",
    "what can you offer", "interested", "thinking about selling",
    "might sell", "considering", "what's it worth"
  ];

  let hasSignals = false;
  let excerpt = "";
  let relatedCallId: number | null = null;

  for (const call of contactCalls) {
    if (!call.transcript) continue;
    const lower = call.transcript.toLowerCase();
    const signals = SELLING_SIGNALS.filter(s => lower.includes(s));
    if (signals.length >= 2) {
      hasSignals = true;
      excerpt = call.transcript.substring(0, 500);
      relatedCallId = call.id;
      break;
    }
  }

  if (!hasSignals) return null;

  return {
    tier: "warning",
    triggerRules: ["dead_with_selling_signals"],
    priorityScore: 70,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId,
    // Prefer call data for team member, fall back to GHL assignedTo mapping
    teamMemberId: contactCalls[0]?.teamMemberId || resolveGhlAssignee(opp.assignedTo, ghlMap).teamMemberId,
    teamMemberName: contactCalls[0]?.teamMemberName || resolveGhlAssignee(opp.assignedTo, ghlMap).teamMemberName,
    assignedTo: opp.assignedTo || null,
    detectionSource: "hybrid",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: excerpt,
    ...NO_PRICE_DATA,
  };
}

// Rule 10: Walkthrough completed but no offer sent within 24h
async function detectWalkthroughNoOffer(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity | null> {
  if (!isWalkthroughStage(stageName)) return null;

  // STAGE AWARENESS: "Walkthrough Apt Scheduled" means the walkthrough is UPCOMING.
  // Only fire if the walkthrough has actually been completed OR enough time has passed.
  const lowerStage = stageName.toLowerCase();
  const isScheduledNotDone = lowerStage.includes("scheduled") || lowerStage.includes("apt scheduled");
  
  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null;
  if (!stageChangeAt) return null;

  if (isScheduledNotDone) {
    // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the team has a plan — suppress.
    const hasFutureApt = await hasUpcomingAppointment(creds, opp.contactId);
    if (hasFutureApt) return null; // Walkthrough is scheduled for the future — not a problem
    const hasTask = await hasOpenFollowUpTask(creds, opp.contactId);
    if (hasTask) return null; // Open task exists — team has follow-up planned

    // For scheduled walkthroughs with no future appointment, only flag if 5+ days have passed
    // (increased from 3 to reduce false positives — gives time for walkthrough + offer prep)
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    if (stageChangeAt > fiveDaysAgo) return null; // Walkthrough likely hasn't happened yet
  } else {
    // For completed walkthrough stages, use the 48-hour window (increased from 24h)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    if (stageChangeAt > fortyEightHoursAgo) return null;
  }

  // CHECK 1: Offer in callOutcome or callType fields
  if (opp.contactId) {
    const offerCalls = await db
      .select({ id: calls.id, callOutcome: calls.callOutcome, callType: calls.callType })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, opp.contactId),
          sql`(${calls.callOutcome} = 'offer_made' OR ${calls.callType} = 'offer')`
        )
      )
      .limit(1);
    
    if (offerCalls.length > 0) return null; // Offer already discussed/made
  }

  // CHECK 2: Offer discussed in transcript content (catches verbal offers not recorded in fields)
  if (opp.contactId) {
    const offerInTranscript = await hasOfferInTranscripts(db, tenantId, opp.contactId);
    if (offerInTranscript) return null; // Offer was discussed on a call — not a valid signal
  }

  // CHECK 3: Pipeline stage already at or beyond offer stage
  if (isOfferOrBeyond(stageName)) return null; // Already in offer stage

  return {
    tier: "warning",
    triggerRules: ["walkthrough_no_offer"],
    priorityScore: 65,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    ...resolveGhlAssignee(opp.assignedTo, ghlMap),
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: "",
    ...NO_PRICE_DATA,
  };
}

// Rule 11: Multiple leads from same property address
async function detectDuplicateProperty(
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Find property addresses that appear in multiple calls with different contacts
  const duplicates = await db
    .select({
      propertyAddress: calls.propertyAddress,
      count: sql<number>`COUNT(DISTINCT ${calls.ghlContactId})`,
    })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, thirtyDaysAgo),
        sql`${calls.propertyAddress} IS NOT NULL AND ${calls.propertyAddress} != ''`,
        sql`${calls.ghlContactId} IS NOT NULL`
      )
    )
    .groupBy(calls.propertyAddress)
    .having(sql`COUNT(DISTINCT ${calls.ghlContactId}) >= 2`);

  for (const dup of duplicates) {
    // Get the calls for this property
    const propertyCalls = await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.propertyAddress, dup.propertyAddress)
        )
      )
      .orderBy(desc(calls.callTimestamp))
      .limit(5);

    if (propertyCalls.length < 2) continue;

    results.push({
      tier: "warning",
      triggerRules: ["duplicate_property_address"],
      priorityScore: 55,
      contactName: propertyCalls[0].contactName,
      contactPhone: propertyCalls[0].contactPhone,
      propertyAddress: dup.propertyAddress,
      ghlContactId: propertyCalls[0].ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: propertyCalls[0].id,
      teamMemberId: propertyCalls[0].teamMemberId || null,
      teamMemberName: propertyCalls[0].teamMemberName || null,
      assignedTo: null,
      detectionSource: "pipeline",
      lastActivityAt: propertyCalls[0].callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `${dup.count} different contacts called about this property`,
    ...NO_PRICE_DATA,
    });
  }

  return results;
}

/**
 * TIER 3 — WORTH A LOOK
 */

// Rule 12: Seller said "call me back in [timeframe]" — check if callback happened
// Now also checks GHL conversation messages for outbound activity (calls + SMS)
// to avoid false positives when team followed up but calls were too short to be logged
async function detectMissedCallback(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        gte(calls.callTimestamp, sevenDaysAgo)
      )
    )
    .limit(50);

  const callbackPatterns = [
    /call\s+(?:me\s+)?back\s+(?:in\s+)?(?:a\s+)?(?:few|couple|two|three|2|3)?\s*(?:days?|weeks?|hours?|minutes?)/i,
    /(?:try|call)\s+(?:me\s+)?(?:back\s+)?(?:tomorrow|next week|monday|tuesday|wednesday|thursday|friday)/i,
    /(?:i'll|i will)\s+be\s+(?:available|free|around)\s+(?:tomorrow|next|on)/i,
    /(?:reach|get)\s+(?:back\s+)?(?:to\s+)?me\s+(?:later|tomorrow|next)/i,
  ];

  for (const call of recentCalls) {
    if (!call.transcript || !call.ghlContactId) continue;

    const hasCallbackRequest = callbackPatterns.some(p => p.test(call.transcript));
    if (!hasCallbackRequest) continue;

    // Check 1: Was there a follow-up call in our database?
    const followUp = await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp)
        )
      )
      .limit(2);

    if (followUp.length > 1) continue; // Callback was made (logged in our DB)

    // Check 2: Check GHL conversation for outbound activity after the callback request
    // This catches short calls that were filtered out + outbound SMS follow-ups
    let hasOutboundFollowUp = false;
    if (creds) {
      try {
        // Search for the contact's conversation
        const conversations = await ghlFetch(
          creds,
          `/conversations/search?locationId=${creds.locationId}&contactId=${call.ghlContactId}`
        );
        const convList = conversations.conversations || [];
        if (convList.length > 0) {
          const convId = convList[0].id;
          const messages = await fetchConversationMessages(creds, convId, 30);
          const callTimestamp = new Date(call.callTimestamp).getTime();

          for (const msg of messages) {
            if (msg.direction !== "outbound") continue;
            const msgTime = new Date(msg.dateAdded).getTime();
            // Only count outbound activity AFTER the callback request call
            if (msgTime <= callTimestamp) continue;
            // Found outbound activity (call or SMS) after the callback request
            hasOutboundFollowUp = true;
            break;
          }
        }
      } catch (err) {
        // If GHL check fails, fall through to the DB-only check result
        console.warn(`[OpportunityDetection] GHL conversation check failed for contact ${call.ghlContactId}:`, err);
      }
    }

    if (hasOutboundFollowUp) continue; // Team followed up via GHL (calls/SMS)

    // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the callback was effectively handled
    const hasFutureApt = await hasUpcomingAppointment(creds, call.ghlContactId);
    if (hasFutureApt) continue; // Appointment scheduled — callback was addressed
    const hasTask = await hasOpenFollowUpTask(creds, call.ghlContactId);
    if (hasTask) continue; // Open task exists — callback was addressed

    results.push({
      tier: "warning",
      triggerRules: ["missed_callback_request"],
      priorityScore: 72,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "hybrid",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: call.transcript.substring(0, 500),
    ...(await extractPricesFromTranscriptLLM(call.transcript)),
    });
  }

  return results;
}

// Rule 13: High seller talk-time ratio but got DQ'd
async function detectHighTalkTimeDQ(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Get calls that were marked as dead/not interested but had long duration
  const dqdCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        inArray(calls.callOutcome, ["not_interested", "dead"]),
        gte(calls.callTimestamp, fourteenDaysAgo),
        gte(calls.duration, 180) // 3+ minute calls — seller was talking
      )
    )
    .limit(30);

  for (const call of dqdCalls) {
    if (!call.transcript || !call.ghlContactId) continue;

    // Simple heuristic: if transcript is long (seller talked a lot), motivation was likely there
    // A truly uninterested seller hangs up quickly
    if (call.transcript.length < 1000) continue; // Short transcript = short conversation

    // Check if there's only 1 call to this contact (one-and-done DQ)
    const allCalls = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId)
        )
      );

    if (allCalls.length > 1) continue; // Multiple attempts were made

    results.push({
      tier: "possible",
      triggerRules: ["high_talk_time_dq"],
      priorityScore: 45,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "hybrid",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: call.transcript.substring(0, 500),
    ...NO_PRICE_DATA,
    });
  }

  return results;
}

// Rule 15: Seller offered a concrete timeline/meeting window but agent left it open-ended
// Catches the pattern: seller says "I'll be in town in March" or "call me in a few weeks"
// and the agent responds with "feel free to reach out" instead of locking in a next step.
// This is distinct from Rule 12 (explicit callback request not followed up on).
// Rule 15 is about the agent's RESPONSE — they had an opening and didn't commit.

const TIMELINE_PATTERNS = [
  // Specific future dates/months
  /(?:i'll|i will|we'll|we will|i'm|i am)\s+(?:be\s+)?(?:in\s+town|back|there|around|available|free|here|home|ready)\s+(?:in|around|by|first\s+(?:part|week)\s+of|beginning\s+of|end\s+of|middle\s+of|early|late|sometime\s+in)?\s*(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next\s+(?:week|month|year)|a\s+(?:few|couple)\s+(?:weeks?|months?)|\d+\s+(?:weeks?|months?|days?))/i,
  // "After X happens" patterns (life events)
  /(?:after|once|when)\s+(?:my|the|her|his)\s+(?:mother|mom|father|dad|parent|spouse|husband|wife)\s+(?:passes|goes|moves|is\s+(?:in|at)|gets\s+into)/i,
  /(?:after|once|when)\s+(?:we|i|they)\s+(?:get\s+(?:through|past|done)|finish|close|settle|figure\s+out|know\s+(?:more|what))/i,
  // Timeframe mentions
  /(?:in\s+(?:a\s+)?(?:few|couple|two|three|four|2|3|4|5|6)\s+(?:weeks?|months?))/i,
  /(?:(?:maybe|probably|likely)\s+(?:in|around|by)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|fall|winter))/i,
  // "I don't know if that's weeks or months" — uncertain but real timeline
  /(?:don't|do\s+not|doesn't|does\s+not)\s+know\s+(?:if|whether)\s+(?:that's|it's|it\s+(?:will|would)\s+be)\s+(?:weeks?|months?|days?)/i,
  // "I'll know more in..."
  /(?:i'll|i will|we'll|we will)\s+(?:know\s+more|have\s+(?:a\s+)?(?:better|more|clearer)\s+(?:idea|picture|answer|sense))\s+(?:in|by|around|within)/i,
  // Willingness to meet in the future
  /(?:i'd|i\s+would|we'd|we\s+would)\s+(?:be\s+(?:happy|glad|willing|open|down)|like|love|want)\s+to\s+(?:meet|show|walk|let\s+you|have\s+you)\s+(?:when|once|after|if)/i,
];

const OPEN_ENDED_AGENT_PATTERNS = [
  // "Reach out anytime" patterns
  /(?:feel\s+free|don't\s+hesitate|you're\s+welcome)\s+to\s+(?:reach\s+out|call|contact|give\s+(?:us|me)\s+a\s+(?:call|ring|shout))/i,
  /(?:reach\s+out|call\s+(?:us|me)|give\s+(?:us|me)\s+a\s+(?:call|ring))\s+(?:anytime|whenever|any\s+time|at\s+any\s+time|when\s+you're\s+ready)/i,
  /(?:we'll|i'll|we\s+will|i\s+will)\s+be\s+(?:here|around|on\s+standby|standing\s+by|ready)/i,
  /(?:keep\s+(?:us|me)\s+in\s+mind|let\s+(?:us|me)\s+know|just\s+(?:let\s+(?:us|me)\s+know|give\s+(?:us|me)\s+a\s+call))/i,
  /(?:whenever\s+you're\s+ready|when\s+the\s+time\s+(?:comes|is\s+right)|no\s+rush|no\s+pressure|take\s+your\s+time)/i,
];

const COMMITMENT_PATTERNS = [
  // Agent locked in a next step
  /(?:i'll|i\s+will|let\s+me|i'm\s+going\s+to|we'll|we\s+will)\s+(?:call\s+you|follow\s+up|reach\s+out|check\s+(?:in|back)|touch\s+base|set\s+(?:a|an)|schedule|put\s+(?:it|that|this)\s+(?:on|in))\s+(?:on|in|around|the\s+first|early|next|before|after|by)?/i,
  /(?:let's|let\s+us)\s+(?:schedule|set\s+up|plan|book|lock\s+in|pencil\s+in|put\s+(?:something|a\s+time|a\s+date))/i,
  /(?:i'll|i\s+will|let\s+me)\s+(?:set\s+a\s+reminder|mark\s+(?:my|the)\s+calendar|add\s+(?:it|that|this)\s+to\s+(?:my|the)\s+calendar)/i,
  /(?:how\s+about|what\s+about|would)\s+(?:the\s+first|early|late|mid|beginning|end)\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|next\s+(?:week|month))/i,
];

async function detectTimelineNoCommitment(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Get recent completed conversation calls with transcripts
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        gte(calls.callTimestamp, fourteenDaysAgo),
        lt(calls.callTimestamp, oneDayAgo)
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(50);

  for (const call of recentCalls) {
    if (!call.transcript || !call.ghlContactId) continue;
    // Need a decent-length transcript to analyze conversation flow
    if (call.transcript.length < 300) continue;

    const transcript = call.transcript;

    // Step 1: Check if the seller offered a timeline
    const hasTimeline = TIMELINE_PATTERNS.some(p => p.test(transcript));
    if (!hasTimeline) continue;

    // Step 2: Check if the agent responded with open-ended language
    const hasOpenEnded = OPEN_ENDED_AGENT_PATTERNS.some(p => p.test(transcript));
    if (!hasOpenEnded) continue;

    // Step 3: Check if the agent ALSO made a commitment (if so, they handled it)
    const hasCommitment = COMMITMENT_PATTERNS.some(p => p.test(transcript));
    if (hasCommitment) continue; // Agent locked in a next step — good

    // Step 4: Check if there's been a follow-up call since
    const followUp = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp)
        )
      )
      .limit(2);

    if (followUp.length > 1) continue; // A follow-up call was made

    // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, the team locked in a next step
    const hasFutureApt = await hasUpcomingAppointment(creds, call.ghlContactId);
    if (hasFutureApt) continue; // Appointment scheduled — commitment was made
    const hasTask = await hasOpenFollowUpTask(creds, call.ghlContactId);
    if (hasTask) continue; // Open task exists — team has follow-up planned

    // Extract the timeline mention for the excerpt
    let timelineExcerpt = "";
    for (const pattern of TIMELINE_PATTERNS) {
      const match = transcript.match(pattern);
      if (match) {
        // Get surrounding context (100 chars before and after)
        const idx = match.index || 0;
        const start = Math.max(0, idx - 100);
        const end = Math.min(transcript.length, idx + match[0].length + 100);
        timelineExcerpt = transcript.substring(start, end);
        break;
      }
    }

    results.push({
      tier: "warning",
      triggerRules: ["timeline_offered_no_commitment"],
      priorityScore: 70,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: timelineExcerpt || transcript.substring(0, 500),
    ...NO_PRICE_DATA,
    });
  }

  return results;
}

// Rule 16: Post-walkthrough ghosting — seller went silent after walkthrough was completed
// Detects when a contact progressed to/past walkthrough stage but then went silent.
// Checks: (1) contact is in or past walkthrough stage, (2) walkthrough happened 3+ business days ago,
// (3) no inbound messages/calls from seller since, (4) no recent outbound messages/calls from team,
// (5) outbound follow-up attempts didn't result in conversation.

// Count business days (Mon-Fri) between two dates
function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);
  while (current < endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++; // Skip Sunday (0) and Saturday (6)
    current.setDate(current.getDate() + 1);
  }
  return count;
}

async function detectPostWalkthroughGhosting(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null,
  contactOppMap?: Map<string, { opp: GHLPipelineOpportunity; stageName: string }>
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const now = new Date();
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

  // Strategy: Find contacts who had walkthrough-related calls (callType includes walkthrough,
  // or transcript mentions walkthrough) in the last 21 days but 3+ days ago,
  // then check if the seller has gone silent.

  // Approach 1: Check pipeline — contacts in offer-related stages (post-walkthrough)
  // who have gone silent
  if (contactOppMap) {
    for (const [contactId, { opp, stageName }] of Array.from(contactOppMap.entries())) {
      const lower = stageName.toLowerCase();
      // Look for stages that indicate walkthrough was done: "Offer" stages, "Under Contract", etc.
      // Also check "Walkthrough Completed" or similar
      const isPostWalkthrough = lower.includes("offer") || lower.includes("under contract") ||
        lower.includes("walkthrough completed") || lower.includes("walkthrough done");
      // Also check: contact is in walkthrough stage but walkthrough happened a while ago
      const isStaleWalkthrough = (lower.includes("walkthrough") && !lower.includes("scheduled"));

      if (!isPostWalkthrough && !isStaleWalkthrough) continue;

      const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : new Date(opp.updatedAt);
      // Must be 3+ BUSINESS days since stage change but within 21 calendar days
      const businessDaysSinceChange = countBusinessDays(stageChangeAt, now);
      if (businessDaysSinceChange < 3 || stageChangeAt < twentyOneDaysAgo) continue;

      // Check for any recent activity (inbound from seller OR outbound from team)
      let hasRecentActivity = false;
      if (creds) {
        try {
          const conversations = await fetchRecentConversations(creds, 100);
          const contactConv = conversations.find((c: any) => c.contactId === contactId);
          if (contactConv) {
            const lastMsgDate = new Date(contactConv.lastMessageDate);
            // If the last message was inbound and recent (after stage change), seller is responding
            if (contactConv.lastMessageDirection === "inbound" && lastMsgDate > stageChangeAt) {
              hasRecentActivity = true;
            }
            // If the last message was outbound and within 3 business days, team is actively working it
            if (contactConv.lastMessageDirection === "outbound") {
              const businessDaysSinceOutbound = countBusinessDays(lastMsgDate, now);
              if (businessDaysSinceOutbound < 3) {
                hasRecentActivity = true;
              }
            }
          }
        } catch (err) {
          // Non-critical
        }
      }
      if (hasRecentActivity) continue; // Team or seller is still communicating

      // Also check for recent outbound calls from the team (within 3 business days)
      const recentOutboundCalls = await db
        .select({ id: calls.id, callTimestamp: calls.callTimestamp })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, contactId),
            gte(calls.callTimestamp, stageChangeAt),
            eq(calls.callDirection, "outbound")
          )
        )
        .orderBy(desc(calls.callTimestamp))
        .limit(1);

      if (recentOutboundCalls.length > 0) {
        const lastOutboundDate = new Date(recentOutboundCalls[0].callTimestamp);
        const businessDaysSinceOutbound = countBusinessDays(lastOutboundDate, now);
        if (businessDaysSinceOutbound < 3) continue; // Team made a recent outbound call
      }

      // Check for any calls after the walkthrough stage change
      const postWalkthroughCalls = await db
        .select({
          id: calls.id,
          classification: calls.classification,
          callOutcome: calls.callOutcome,
          callTimestamp: calls.callTimestamp,
        })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, contactId),
            gte(calls.callTimestamp, stageChangeAt)
          )
        )
        .orderBy(desc(calls.callTimestamp));

      // If there's been a conversation call after walkthrough, seller isn't ghosting
      const hasPostConversation = postWalkthroughCalls.some(
        (c: any) => c.classification === "conversation"
      );
      if (hasPostConversation) continue;

      // Count outbound attempts that didn't result in conversation (no answer, voicemail)
      const outboundAttempts = postWalkthroughCalls.filter(
        (c: any) => c.classification !== "conversation"
      ).length;

      // APPOINTMENT/TASK CHECK: If there's a future appointment or open task, they're not ghosting
      const hasFutureApt = await hasUpcomingAppointment(creds, contactId);
      if (hasFutureApt) continue;
      const hasTask = await hasOpenFollowUpTask(creds, contactId);
      if (hasTask) continue; // Open task exists — team has follow-up planned

      // Get the most recent transcript for context
      const latestTranscript = await db
        .select({ transcript: calls.transcript, id: calls.id })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, contactId),
            sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
          )
        )
        .orderBy(desc(calls.callTimestamp))
        .limit(1);

      const excerpt = latestTranscript.length > 0
        ? `[Post-walkthrough: ${outboundAttempts} follow-up attempt(s) with no conversation since ${stageChangeAt.toLocaleDateString()}] ` +
          latestTranscript[0].transcript.substring(0, 400)
        : `Post-walkthrough: ${outboundAttempts} follow-up attempt(s) with no conversation since ${stageChangeAt.toLocaleDateString()}`;

      // Get the latest call for this contact for team member info
      const latestCall = await db
        .select({ teamMemberId: calls.teamMemberId, teamMemberName: calls.teamMemberName })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, contactId)
          )
        )
        .orderBy(desc(calls.callTimestamp))
        .limit(1);

      const ghlMap = await getGhlUserIdMap(tenantId);

      results.push({
        tier: "warning",
        triggerRules: ["post_walkthrough_ghosting"],
        priorityScore: 70,
        contactName: opp.name || opp.contact?.name || null,
        contactPhone: opp.contact?.phone || null,
        propertyAddress: null,
        ghlContactId: contactId,
        ghlOpportunityId: opp.id,
        ghlPipelineStageId: opp.pipelineStageId,
        ghlPipelineStageName: stageName,
        relatedCallId: latestTranscript.length > 0 ? latestTranscript[0].id : null,
        teamMemberId: latestCall.length > 0 ? latestCall[0].teamMemberId : null,
        teamMemberName: latestCall.length > 0 ? latestCall[0].teamMemberName : null,
        assignedTo: opp.assignedTo || null,
        detectionSource: "hybrid",
        lastActivityAt: stageChangeAt,
        lastStageChangeAt: stageChangeAt,
        transcriptExcerpt: excerpt,
        ...(await extractPricesFromTranscriptLLM(latestTranscript.length > 0 ? latestTranscript[0].transcript : "")),
      });
    }
  }

  // Approach 2: Check transcript-based — find calls where walkthrough was discussed
  // but no follow-up conversation happened
  const walkthroughCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        gte(calls.callTimestamp, twentyOneDaysAgo),
        lt(calls.callTimestamp, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(50);

  const WALKTHROUGH_DONE_PATTERNS = [
    /(?:walked|walk)\s+(?:through|thru)\s+(?:the|your|this|that)\s+(?:house|property|home|place)/i,
    /(?:walkthrough|walk-through)\s+(?:was|went|looked|is)\s+(?:good|great|fine|done|complete)/i,
    /(?:saw|seen|looked at|checked out|inspected)\s+(?:the|your|this|that)\s+(?:house|property|home|place)/i,
    /(?:after|since|from)\s+(?:the|our|my)\s+(?:walkthrough|walk-through|walk\s+through|visit|inspection)/i,
    /(?:we|i)\s+(?:came|went|drove|stopped)\s+(?:out|by|over)\s+(?:to|and)\s+(?:see|look|check|inspect|walk)/i,
  ];

  // Track contacts already detected via pipeline approach to avoid duplicates
  const alreadyDetected = new Set(results.map(r => r.ghlContactId));

  for (const call of walkthroughCalls) {
    if (!call.ghlContactId || alreadyDetected.has(call.ghlContactId)) continue;

    const hasWalkthroughMention = WALKTHROUGH_DONE_PATTERNS.some(p => p.test(call.transcript));
    if (!hasWalkthroughMention) continue;

    // Business day check: must be 3+ business days since the walkthrough call
    const callDate = new Date(call.callTimestamp);
    const businessDaysSinceCall = countBusinessDays(callDate, now);
    if (businessDaysSinceCall < 3) continue;

    // Check for any follow-up conversation after this call
    const followUpConversations = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp),
          eq(calls.classification, "conversation")
        )
      )
      .limit(2);

    if (followUpConversations.length > 1) continue; // There was a follow-up conversation

    // Check for recent outbound calls from team (within 3 business days)
    const recentTeamOutbound = await db
      .select({ id: calls.id, callTimestamp: calls.callTimestamp })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, callDate),
          eq(calls.callDirection, "outbound")
        )
      )
      .orderBy(desc(calls.callTimestamp))
      .limit(1);

    if (recentTeamOutbound.length > 0) {
      const lastOutDate = new Date(recentTeamOutbound[0].callTimestamp);
      if (countBusinessDays(lastOutDate, now) < 3) continue; // Team recently reached out
    }

    // Check for recent outbound messages via GHL conversations
    if (creds) {
      try {
        const conversations = await fetchRecentConversations(creds, 100);
        const contactConv = conversations.find((c: any) => c.contactId === call.ghlContactId);
        if (contactConv) {
          const lastMsgDate = new Date(contactConv.lastMessageDate);
          // If team sent an outbound message within 3 business days, they're on it
          if (contactConv.lastMessageDirection === "outbound" && countBusinessDays(lastMsgDate, now) < 3) continue;
          // If seller responded inbound after the walkthrough call, not ghosting
          if (contactConv.lastMessageDirection === "inbound" && lastMsgDate > callDate) continue;
        }
      } catch (err) {
        // Non-critical
      }
    }

    // APPOINTMENT/TASK CHECK
    const hasFutureApt = await hasUpcomingAppointment(creds, call.ghlContactId);
    if (hasFutureApt) continue;
    const hasTask = await hasOpenFollowUpTask(creds, call.ghlContactId);
    if (hasTask) continue; // Open task exists — team has follow-up planned

    // Count outbound attempts
    const outboundAttempts = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp),
          sql`${calls.classification} != 'conversation'`
        )
      );

    alreadyDetected.add(call.ghlContactId);

    results.push({
      tier: "warning",
      triggerRules: ["post_walkthrough_ghosting"],
      priorityScore: 68,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "hybrid",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `[Post-walkthrough: ${outboundAttempts.length} follow-up attempt(s) with no conversation since ${new Date(call.callTimestamp).toLocaleDateString()}] ` +
        call.transcript.substring(0, 400),
      ...(await extractPricesFromTranscriptLLM(call.transcript)),
    });
  }

  return results;
}

// ============ AI REASON GENERATION ============

const RULE_DESCRIPTIONS: Record<string, { label: string; context: string; tier: string }> = {
  backward_movement_no_call: {
    label: "Lead Moved to Follow Up Without a Call",
    context: "This lead was moved from an active pipeline stage to follow-up. No outbound call was logged before the move.",
    tier: "missed"
  },
  repeat_inbound_ignored: {
    label: "Repeat Inbound — No Response Yet",
    context: "This seller has sent multiple inbound messages in the past week. No outbound response has been logged yet.",
    tier: "missed"
  },
  followup_inbound_ignored: {
    label: "Follow Up Lead Reached Out — Awaiting Response",
    context: "A lead in the follow-up pipeline sent an inbound message. It has been 4+ hours without a logged response.",
    tier: "at_risk"
  },
  offer_no_followup: {
    label: "Offer Made — No Follow Up Logged",
    context: "An offer was made and 48+ hours have passed. No follow-up call or message has been logged since the offer.",
    tier: "at_risk"
  },
  new_lead_sla_breach: {
    label: "New Lead — No Call Within 15 Min",
    context: "A new lead entered the pipeline. No outbound call was logged within the 15-minute SLA window.",
    tier: "at_risk"
  },
  price_stated_no_followup: {
    label: "Seller Stated Price — Worth a Look",
    context: "During a call, the seller mentioned a specific price they would accept. This lead has deal potential worth reviewing. No follow-up has been logged in the 48 hours since.",
    tier: "possible"
  },
  motivated_one_and_done: {
    label: "Motivated Seller — Only 1 Call Attempt",
    context: "The seller showed motivation signals (life event, timeline, urgency) during the call. Only one call attempt has been logged with no follow-up in 72 hours. This is a critical SOP failure — motivated sellers need aggressive follow-up.",
    tier: "at_risk"
  },
  stale_active_stage: {
    label: "Stale in Active Stage",
    context: "This lead has been sitting in an active pipeline stage (Pending Apt, Walkthrough Scheduled, etc.) for 5+ days with no recent outbound activity. Deals die when they stall — this needs immediate attention.",
    tier: "at_risk"
  },
  dead_with_selling_signals: {
    label: "DQ'd Lead Had Selling Signals",
    context: "This lead was moved to dead/ghosted status, but the call transcript contains real selling signals — timeline mentions, property condition details, life events, or price discussion. Someone may have made a bad DQ call.",
    tier: "at_risk"
  },
  walkthrough_no_offer: {
    label: "Walkthrough Done — No Offer Sent Yet",
    context: "A walkthrough was completed for this property. No offer has been logged in the 24 hours since.",
    tier: "at_risk"
  },
  duplicate_property_address: {
    label: "Multiple Contacts — Same Property",
    context: "Multiple contacts have been associated with the same property address. This may indicate different household members reaching out separately.",
    tier: "possible"
  },
  missed_callback_request: {
    label: "Seller Asked for Callback — No Follow Up Logged",
    context: "During a call, the seller requested a callback at a specific time. No subsequent outbound call or message has been logged after that request.",
    tier: "at_risk"
  },
  high_talk_time_dq: {
    label: "Long Conversation — DQ'd After One Attempt",
    context: "This was a 3+ minute call where the seller did significant talking, suggesting engagement. The lead was DQ'd after this single attempt.",
    tier: "possible"
  },
  active_negotiation_in_followup: {
    label: "Active Engagement in Follow Up",
    context: "This contact is in a follow-up stage and has recent inbound messages showing active engagement or negotiation language. The team is communicating — this is flagged for owner review to potentially help with negotiation strategy or assess the property's potential.",
    tier: "possible"
  },
  timeline_offered_no_commitment: {
    label: "Seller Gave Timeline — No Next Step Locked In",
    context: "During a call, the seller offered a concrete timeline or availability window (e.g., 'I'll be in town in March,' 'after my mother passes,' 'in a few weeks'). The agent responded with open-ended language ('feel free to reach out,' 'I can be on standby') instead of locking in a specific follow-up date, appointment, or calendar commitment. No follow-up call has been logged since.",
    tier: "at_risk"
  },
  post_walkthrough_ghosting: {
    label: "Post-Walkthrough Ghosting — Seller Went Silent",
    context: "A walkthrough was completed (the contact moved through or past the walkthrough stage) but the seller has gone silent. No inbound messages or calls have been received from the seller in 72+ hours after the walkthrough, and outbound follow-up attempts have not resulted in a conversation.",
    tier: "at_risk"
  },
  short_call_actionable_intel: {
    label: "Short Call / Voicemail \u2014 Actionable Info Captured",
    context: "A short call, voicemail, or callback request was auto-skipped from grading, but the transcript contains actionable intelligence: contact info for an alternate person (email, phone), a referral to a decision-maker (spouse, partner, attorney), a callback/scheduling request, or clear interest signals. This call needs manual review to capture the lead.",
    tier: "possible"
  },
  sms_deal_lost: {
    label: "Seller Communicated Deal Lost via SMS",
    context: "The seller sent an SMS/text message indicating they sold the property, went with another buyer, or are no longer interested. This deal was lost and needs review to understand what went wrong and prevent similar losses.",
    tier: "missed"
  },
  delayed_scheduled_callback: {
    label: "Scheduled Callback Was Delayed",
    context: "A callback was scheduled during a previous call, but the follow-up call was made late. The agent acknowledged the delay in the transcript (apologized for being late, mentioned running behind, etc.). This may have damaged rapport with the seller.",
    tier: "at_risk"
  },
  skipped_walkthrough: {
    label: "Skipped Walkthrough \u2014 Went Straight to Offer",
    context: "This contact progressed from qualification/appointment directly to the offer stage without evidence of an in-person walkthrough. In-person walkthroughs significantly improve conversion rates. The seller may have declined the walkthrough or the team skipped it.",
    tier: "possible"
  },
  deal_fell_through: {
    label: "Previous Deal Fell Through — Re-engagement Window",
    context: "The seller mentioned that a previous buyer's deal, contract, or financing fell through. The property is back on the market and the seller is likely more motivated to close quickly. This is a prime re-engagement opportunity — they've already been through the process once.",
    tier: "possible"
  },
  // ===== NEW RULES =====
  deal_lost_on_call: {
    label: "Deal Lost — Seller Confirmed on Call",
    context: "During a phone call, the seller explicitly stated they already sold the property, listed with an agent, went with another investor, or are no longer selling. This deal is lost and needs post-mortem review.",
    tier: "missed"
  },
  bad_call_performance: {
    label: "Very Bad Call Performance — Grade D/F",
    context: "A recent call was graded D or F (score below 40). The rep performed very poorly on key areas like qualification, rapport, motivation extraction, or offer presentation. This is a coaching emergency.",
    tier: "at_risk"
  },
  missed_appointment: {
    label: "Appointment Missed — No Activity at Scheduled Time",
    context: "An appointment was scheduled with this seller but no call or activity was logged around the scheduled time. Missing appointments destroys credibility and kills deals.",
    tier: "at_risk"
  },
  extreme_motivation: {
    label: "Extreme Seller Motivation Detected",
    context: "The seller expressed high-urgency motivation signals during a call: foreclosure with timeline, divorce with property division, death in family, tax sale deadline, code violation deadline, or health emergency forcing sale. This seller is under real pressure to sell.",
    tier: "possible"
  },
  close_on_price: {
    label: "Close on Price — Gap Under $30K",
    context: "Our offer and the seller's asking price are within $30,000 of each other. This deal could close with one more conversation. The numbers are workable.",
    tier: "possible"
  },
  seller_re_engagement: {
    label: "Seller Came Back After Long Silence",
    context: "A contact in follow-up (30+ days old) suddenly has new inbound activity — the seller reached back out. Follow-up leads that re-engage are significantly more likely to convert because they've had time to think and are now ready.",
    tier: "possible"
  },
  seller_texted_number: {
    label: "Seller Proactively Shared Contact Info via SMS",
    context: "The seller sent an inbound text message containing a phone number, email address, or explicitly asked to be called. This is a warm signal — they want to be contacted and are actively engaged.",
    tier: "possible"
  },
  seller_out_of_agreement: {
    label: "Seller Just Got Out of Agreement",
    context: "The seller mentioned their listing agreement expired, their agent contract ended, a previous buyer backed out, or they just got out of an agreement with someone else. They're back on the market and may be frustrated with the traditional process.",
    tier: "possible"
  },
  ai_coach_inactive: {
    label: "Team Member Not Using AI Coach",
    context: "This team member hasn't accessed the AI coaching features in 7+ days. Consistent coaching usage correlates with call quality improvement. This is a team development signal for the owner.",
    tier: "possible"
  },
  consistent_call_weakness: {
    label: "Consistent Weakness Across Multiple Calls",
    context: "This team member has scored below average on the same call category across 5+ recent calls. This is a pattern, not a one-off — they need targeted coaching on this specific skill area.",
    tier: "possible"
  },
  bad_temperament: {
    label: "Unprofessional Tone Detected on Call",
    context: "The call transcript shows signs of frustration, rudeness, dismissive language, talking over the seller, or unprofessional tone. This is a coaching opportunity — sellers pick up on attitude and it kills deals.",
    tier: "possible"
  },
};

async function generateAIReason(detection: DetectedOpportunity, db: any, tenantId: number): Promise<{ reason: string; suggestion: string; missedItems?: string[] }> {
  const ruleDesc = RULE_DESCRIPTIONS[detection.triggerRules[0]];
  const tierLabel = ruleDesc?.tier === "missed" ? "Missed (urgent)" : ruleDesc?.tier === "at_risk" ? "At Risk" : ruleDesc?.tier === "warning" ? "At Risk" : "Worth a Look";
  
  // Build a rich factual timeline from available data
  const facts: string[] = [];
  if (detection.contactName) facts.push(`Contact: ${detection.contactName}`);
  if (detection.ghlPipelineStageName) facts.push(`Current pipeline stage: ${detection.ghlPipelineStageName}`);
  if (detection.teamMemberName) facts.push(`Assigned to / last handled by: ${detection.teamMemberName}`);
  if (detection.lastActivityAt) {
    const hoursAgo = Math.round((Date.now() - new Date(detection.lastActivityAt).getTime()) / (1000 * 60 * 60));
    facts.push(`Last logged activity: ${hoursAgo} hours ago (${new Date(detection.lastActivityAt).toLocaleDateString()})`);
  }
  if (detection.lastStageChangeAt) {
    const daysAgo = Math.round((Date.now() - new Date(detection.lastStageChangeAt).getTime()) / (1000 * 60 * 60 * 24));
    facts.push(`Stage changed: ${daysAgo} days ago`);
  }
  if (detection.propertyAddress) facts.push(`Property: ${detection.propertyAddress}`);

  // Add price data if available
  if (detection.ourOffer) facts.push(`Our offer: $${detection.ourOffer.toLocaleString()}`);
  if (detection.sellerAsk) facts.push(`Seller's asking price: $${detection.sellerAsk.toLocaleString()}`);
  if (detection.priceGap) facts.push(`Price gap: $${detection.priceGap.toLocaleString()}`);

  // ===== CONTACT TIMELINE ENRICHMENT =====
  // Fetch full call history + pipeline stage + appointments + motivation extraction
  if (detection.ghlContactId) {
    try {
      // 1. Full call history with transcript snippets for motivation extraction
      const contactCalls = await db
        .select({
          callType: calls.callType,
          callOutcome: calls.callOutcome,
          callTimestamp: calls.callTimestamp,
          classification: calls.classification,
          teamMemberName: calls.teamMemberName,
          duration: calls.duration,
          transcript: calls.transcript,
        })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, detection.ghlContactId)
          )
        )
        .orderBy(calls.callTimestamp);

      if (contactCalls.length > 0) {
        const timelineEntries = contactCalls.map((c: any, i: number) => {
          const date = new Date(c.callTimestamp).toLocaleDateString();
          const direction = c.callType === "seller_callback" ? "Inbound" : "Outbound";
          const type = c.callType ? c.callType.replace(/_/g, " ") : "unknown";
          const outcome = c.callOutcome ? c.callOutcome.replace(/_/g, " ") : "unknown";
          const who = c.teamMemberName || "team";
          const dur = c.duration ? `${Math.round(c.duration / 60)}min` : "";
          const cls = c.classification || "";
          return `  ${i + 1}. ${date}: ${direction} ${type} call by ${who} (${dur}, outcome: ${outcome}, classified: ${cls})`;
        });
        facts.push(`\nFull call timeline (${contactCalls.length} calls):\n${timelineEntries.join("\n")}`);

        // 2. Extract specific motivations from ALL transcripts
        const MOTIVATION_MAP: Record<string, string> = {
          "divorce": "going through a divorce",
          "foreclosure": "facing foreclosure",
          "inherited": "inherited the property",
          "estate": "dealing with an estate/probate situation",
          "relocating": "relocating",
          "tired of landlording": "tired of being a landlord",
          "bad tenants": "dealing with problem tenants",
          "code violations": "has code violations on the property",
          "fire damage": "property has fire damage",
          "tax lien": "has a tax lien on the property",
          "back taxes": "behind on property taxes",
          "health issues": "dealing with health issues",
          "downsizing": "looking to downsize",
          "job loss": "experienced job loss",
          "need to sell fast": "needs to sell quickly",
          "can't afford": "can't afford the property",
          "behind on payments": "behind on mortgage payments",
          "passed away": "a family member passed away",
          "death": "dealing with a death in the family",
          "vacant": "property is vacant",
          "condemned": "property is condemned",
          "medical bills": "facing medical bills",
          "financial hardship": "experiencing financial hardship",
        };

        const detectedMotivations: string[] = [];
        for (const c of contactCalls) {
          if (!c.transcript) continue;
          const lower = c.transcript.toLowerCase();
          for (const [keyword, description] of Object.entries(MOTIVATION_MAP)) {
            if (lower.includes(keyword) && !detectedMotivations.includes(description)) {
              detectedMotivations.push(description);
            }
          }
        }
        if (detectedMotivations.length > 0) {
          facts.push(`\nSeller motivations detected in transcripts: ${detectedMotivations.join(", ")}`);
        }

        // 3. Extract key negotiation moments from transcripts
        const negotiationMoments: string[] = [];
        for (const c of contactCalls) {
          if (!c.transcript) continue;
          const lower = c.transcript.toLowerCase();
          if (lower.includes("send me an offer") || lower.includes("what can you offer") || lower.includes("what would you pay")) {
            negotiationMoments.push(`Seller asked for an offer on ${new Date(c.callTimestamp).toLocaleDateString()}`);
          }
          if (lower.includes("i'd take") || lower.includes("i would take") || lower.includes("bottom line") || lower.includes("at least")) {
            negotiationMoments.push(`Seller stated their price on ${new Date(c.callTimestamp).toLocaleDateString()}`);
          }
          if (lower.includes("walkthrough") || lower.includes("walk through") || lower.includes("come look") || lower.includes("come see")) {
            negotiationMoments.push(`Walkthrough discussed on ${new Date(c.callTimestamp).toLocaleDateString()}`);
          }
        }
        if (negotiationMoments.length > 0) {
          facts.push(`\nKey negotiation moments:\n${negotiationMoments.map(m => `  - ${m}`).join("\n")}`);
        }
      } else {
        facts.push("No calls found in system for this contact.");
      }
    } catch (err) {
      // Non-critical — continue without timeline
    }

    // 4. GHL pipeline stage progression (if we have creds from the calling context)
    // Note: We can't access creds here directly, but the pipeline stage is already in the detection.
    // Add stage context interpretation
    if (detection.ghlPipelineStageName) {
      const stage = detection.ghlPipelineStageName.toLowerCase();
      if (stage.includes("offer") && stage.includes("scheduled")) {
        facts.push("Pipeline context: Offer appointment is scheduled — team is actively working this deal.");
      } else if (stage.includes("walkthrough") && stage.includes("scheduled")) {
        facts.push("Pipeline context: Walkthrough appointment is scheduled — team has a next step planned.");
      } else if (stage.includes("under contract")) {
        facts.push("Pipeline context: Property is under contract.");
      } else if (stage.includes("follow up") || stage.includes("followup")) {
        facts.push("Pipeline context: Lead is in follow-up stage — not actively being worked.");
      } else if (stage.includes("dead") || stage.includes("ghost") || stage.includes("dq")) {
        facts.push("Pipeline context: Lead has been marked as dead/DQ'd.");
      }
    }

    // 5. Price gap context
    if (detection.priceGap && detection.sellerAsk) {
      const gapPercent = Math.round((detection.priceGap / detection.sellerAsk) * 100);
      if (detection.priceGap < 30_000 || gapPercent < 20) {
        facts.push(`\nPrice gap analysis: The $${detection.priceGap.toLocaleString()} gap (${gapPercent}% of ask) is small — this deal is likely closeable with negotiation.`);
      } else if (detection.priceGap < 75_000 || gapPercent < 40) {
        facts.push(`\nPrice gap analysis: The $${detection.priceGap.toLocaleString()} gap (${gapPercent}% of ask) is moderate — may require creative structuring.`);
      }
      // Note: gaps > $100k or > 50% of ask are filtered out entirely before reaching this point
    }
  }
  
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You write brief, specific signal descriptions for a real estate wholesaling team's pipeline review tool.

CRITICAL RULES:
- ONLY state facts that are provided in the data below. NEVER assume or infer what happened.
- Use phrases like "no follow-up has been logged" instead of "we completely missed it" or "the team dropped the ball."
- If you don't know whether the team took action, say "no activity was logged" — do NOT say they failed or missed it.
- The tone should be neutral and informative, like a CRM status update — not accusatory or dramatic.
- Tier context: "${tierLabel}" — ${ruleDesc?.tier === "missed" ? "This is a deal we LOST — seller sold, went with a competitor, or we couldn't close. Focus on what happened and what we can learn." : (ruleDesc?.tier === "at_risk" || ruleDesc?.tier === "warning") ? "This is a RED FLAG in our process — SOP failure, missed appointment, bad call, slow response, or stale pipeline. Focus on what went wrong and what needs to happen immediately." : "This is a SUBTLE OPPORTUNITY or team insight worth investigating — possible deal, interesting seller situation, coaching opportunity, or pattern the owner should see. Focus on why this is worth the owner's time."}

SPECIFICITY REQUIREMENTS:
- If the transcript mentions a MOTIVATION (divorce, foreclosure, tax lien, death in family, job relocation, inheritance, vacant property, code violations, financial hardship, medical bills, behind on payments, tired landlord, etc.), you MUST name the specific motivation in the reason. Say "seller mentioned going through a divorce" NOT "seller showed motivation signals."
- If dollar amounts are provided (our offer, seller's ask, price gap), you MUST include the exact numbers. Say "we offered $230,000, seller is asking $350,000 — a $120,000 gap" NOT "a specific price was mentioned."
- If the pipeline stage indicates an appointment was scheduled, acknowledge it. Say "offer appointment was scheduled" NOT "no follow-up logged" when the stage shows otherwise.
- If call attempts are mentioned, be specific: "Daniel attempted to reach Greg but got no answer" NOT "only one call attempt."
- Reference the contact by name.
- Reason: 1-2 factual, specific sentences. Lead with the most important detail (motivation, price, or situation).
- Suggestion: 1 sentence with a specific next action.
- Keep it concise and professional.

MISSED ITEMS (CRITICAL — the owner needs these so they don't have to read the full transcript):
- For "Worth a Look" tier signals: Focus on WHY this deal has potential (seller's situation, price point, motivation, timeline) rather than what the rep did wrong. Frame items as deal insights: "Seller asking $150k and doesn't have time for updates — potential negotiation leverage" rather than "Rep didn't ask about timeline."
- For "Missed" and "At Risk" tier signals: Analyze the transcript excerpt for specific things the rep missed, failed to ask, or should have said differently.
- SPECIAL CASE — Ghosted/Dead/DQ'd leads (dead_with_selling_signals, post_walkthrough_ghosting, or pipeline stage containing 'ghost', 'dead', 'dq', '1 year'):
  • Do NOT list basic qualification questions as missed items (e.g., "didn't ask about timeline").
  • Instead, focus on OUTREACH CONTEXT and RE-ENGAGEMENT POTENTIAL:
    - How many call/text attempts were made before the lead went cold?
    - What was the seller's last known position or interest level?
    - What re-engagement angle could work (price change, new approach, different team member)?
  • Examples for ghosted leads:
    - "12 outbound attempts over 2 weeks with no response — seller may have found another buyer"
    - "Seller was interested at $130k but went silent after our $103k offer — price gap may be the issue"
    - "Last conversation showed interest but seller stopped responding — try a different channel (text vs call)"
    - "Property still shows as active listing — seller may still be motivated"
  • If the lead was properly DQ'd (not interested, wrong number, etc.), return an empty array.
- Each item should be a short, specific, actionable phrase the owner can immediately understand.
- Examples of good missed items (for active leads):
  • "Didn't ask about seller's timeline or urgency"
  • "Seller said 'small developer' — rep didn't probe what that means or ask about other properties"
  • "Seller showed hesitation ('I'm not sure') — rep moved to DQ instead of exploring the objection"
  • "No follow-up question after seller mentioned the property needs work"
  • "Rep didn't ask about the seller's motivation for selling"
  • "Seller mentioned a price — rep didn't counter or anchor with a range"
  • "Rep ended the call without scheduling a next step"
  • "Didn't ask who else is on the title or if there's a mortgage"
- Only include items that are clearly supported by the transcript. If no transcript is available, return an empty array.
- Return 1-4 items maximum. Quality over quantity.`
        },
        {
          role: "user",
          content: `Signal type: ${ruleDesc?.label || detection.triggerRules[0]}
What the data shows: ${ruleDesc?.context || ""}
Tier: ${tierLabel}

Facts from the system:
${facts.join("\n")}

Transcript excerpt (if available): ${detection.transcriptExcerpt ? detection.transcriptExcerpt.substring(0, 600) : "No transcript available"}

Generate JSON with "reason", "suggestion", and "missedItems" fields. Be SPECIFIC — name the exact motivation, dollar amounts, and situation from the transcript. Never use generic phrases like "showed motivation signals" or "mentioned a specific price." For missedItems, list 1-4 specific things the rep missed or should have done differently based on the transcript. If no transcript is available, return an empty array.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "opportunity_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              reason: { type: "string", description: "1-2 specific factual sentences with exact details from transcript" },
              suggestion: { type: "string", description: "1 sentence specific next action" },
              missedItems: {
                type: "array",
                items: { type: "string" },
                description: "1-4 specific things the rep missed or should have said/asked, based on the transcript. Empty array if no transcript available."
              }
            },
            required: ["reason", "suggestion", "missedItems"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("[OpportunityDetection] LLM error:", error);
  }

  // Fallback: use the factual context string directly
  return {
    reason: ruleDesc?.context || `${detection.triggerRules[0]} detected for ${detection.contactName || "this lead"}.`,
    suggestion: `Review ${detection.contactName || "this lead"} and determine if follow-up is needed.`,
    missedItems: []
  };
}

// Rule 17: Short Call — Actionable Intel
// Scans too_short / skipped calls for actionable content that would otherwise be missed:
// - Contact info provided (email, phone for alternate person)
// - Referral to decision-maker (spouse, partner, attorney)
// - Callback / scheduling requests
// - Interest signals in brief exchanges

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

const REFERRAL_PATTERNS = [
  // Redirect to another person
  /(?:talk|speak|call|reach|contact|email|text|send)\s+(?:to|with)?\s*(?:my|her|his|the)\s+(?:husband|wife|spouse|partner|son|daughter|brother|sister|attorney|lawyer|agent|realtor|mom|mother|dad|father)/i,
  /(?:my|her|his|the)\s+(?:husband|wife|spouse|partner|son|daughter|brother|sister|attorney|lawyer|agent|realtor|mom|mother|dad|father)\s+(?:handles|manages|deals with|takes care of|makes|is\s+(?:the|in\s+charge))/i,
  // "Email him/her instead"
  /(?:email|call|text|contact|reach out to)\s+(?:him|her|them)\s+(?:instead|rather|about)/i,
  // "He/she is the one you need to talk to"
  /(?:he|she|they)\s+(?:is|are)\s+(?:the\s+one|who)\s+(?:you\s+(?:need|should|want)\s+to|to)\s+(?:talk|speak|deal)/i,
  // "Let me give you his/her number/email"
  /(?:let\s+me|here's|here\s+is|i'll)\s+(?:give\s+you|send\s+you)?\s*(?:his|her|their|my\s+(?:husband|wife|spouse|partner)'s)\s+(?:number|email|contact|phone)/i,
  // Suggested emailing someone ("suggested emailing her husband")
  /(?:suggest(?:ed)?|try|better|best)\s+(?:to\s+)?(?:email(?:ing)?|call(?:ing)?|text(?:ing)?|contact(?:ing)?|reach(?:ing)?)\s+(?:my|her|his|the)/i,
  // "emailing her husband instead" — participle form
  /(?:email(?:ing)?|call(?:ing)?|text(?:ing)?)\s+(?:my|her|his|the)\s+(?:husband|wife|spouse|partner|son|daughter|brother|sister|attorney|lawyer|agent|realtor|mom|mother|dad|father)/i,
];

const CALLBACK_PATTERNS = [
  /(?:call|try|reach)\s+(?:me|us|back|again)\s+(?:later|tomorrow|next\s+week|in\s+the\s+morning|in\s+the\s+afternoon|in\s+the\s+evening|tonight|this\s+weekend|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
  /(?:i'm|i\s+am)\s+(?:busy|at\s+work|driving|in\s+a\s+meeting|not\s+available)\s+(?:right\s+now|now|at\s+the\s+moment)/i,
  /(?:can\s+you|could\s+you|would\s+you)\s+(?:call|try|reach)\s+(?:me|us|back)\s+(?:at|around|after|before|in|on|later|tomorrow)/i,
  /(?:not\s+a\s+good\s+time|bad\s+time|give\s+me\s+a\s+(?:call|ring)\s+(?:later|back|tomorrow))/i,
  // "Call me back on Monday" — direct request with day
  /call\s+(?:me\s+)?back\s+on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  // "try me again tomorrow" — retry request
  /(?:try|call|reach)\s+(?:me|us)\s+(?:again|back)\s+(?:later|tomorrow|next|in\s+the|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
];

const INTEREST_PATTERNS = [
  /(?:i\s+might|i\s+may|i'm\s+(?:thinking|considering)|we're\s+(?:thinking|considering))\s+(?:be\s+)?(?:interested|selling|looking\s+to\s+sell)/i,
  // "I'm thinking about selling"
  /(?:i'm|i\s+am|we're|we\s+are)\s+(?:thinking|considering)\s+(?:about|of)\s+(?:selling|listing|getting\s+rid)/i,
  /(?:send|give)\s+(?:me|us)\s+(?:some\s+)?(?:info|information|details|an\s+offer|a\s+number|your\s+offer)/i,
  /(?:what\s+(?:would|could|can)\s+you)\s+(?:offer|pay|give\s+me)/i,
  /(?:how\s+much|what's\s+it\s+worth|what\s+do\s+you\s+think)/i,
];

async function detectShortCallActionableIntel(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get recent short/skipped calls AND voicemails that have transcripts
  const shortCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        sql`${calls.classification} IN ('too_short', 'voicemail', 'callback_request')`,
        gte(calls.callTimestamp, sevenDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(50);

  for (const call of shortCalls) {
    if (!call.ghlContactId) continue;
    const transcript = call.transcript;
    if (!transcript || transcript.length < 20) continue;

    // Check for actionable patterns
    const signals: string[] = [];
    let priorityBoost = 0;

    // 1. Email address provided
    const emailMatch = transcript.match(EMAIL_PATTERN);
    if (emailMatch) {
      signals.push(`Email provided: ${emailMatch[0]}`);
      priorityBoost += 15;
    }

    // 2. Phone number for alternate contact or callback number
    const hasReferral = REFERRAL_PATTERNS.some(p => p.test(transcript));
    const phoneMatch = transcript.match(PHONE_PATTERN);
    if (hasReferral) {
      signals.push("Referred to another person (decision-maker/family member)");
      priorityBoost += 10;
      if (phoneMatch) {
        signals.push(`Alternate phone provided: ${phoneMatch[0]}`);
        priorityBoost += 5;
      }
    } else if (phoneMatch) {
      // Standalone phone number in voicemail — seller left a callback number
      signals.push(`Callback phone provided: ${phoneMatch[0]}`);
      priorityBoost += 5;
    }

    // 3. Callback / scheduling request
    const hasCallback = CALLBACK_PATTERNS.some(p => p.test(transcript));
    if (hasCallback) {
      signals.push("Callback or scheduling request detected");
      priorityBoost += 5;
    }

    // 4. Interest signals
    const hasInterest = INTEREST_PATTERNS.some(p => p.test(transcript));
    if (hasInterest) {
      signals.push("Interest or selling intent mentioned");
      priorityBoost += 10;
    }

    // Only flag if we found at least one actionable signal
    if (signals.length === 0) continue;

    // Check if there's been a follow-up call or outbound activity since this short call
    const followUpCalls = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp),
          not(eq(calls.id, call.id))
        )
      )
      .limit(1);

    if (followUpCalls.length > 0) continue; // There's been follow-up activity

    // Check GHL conversations for outbound follow-up
    if (creds) {
      try {
        const conversations = await fetchRecentConversations(creds, 100);
        const contactConv = conversations.find((c: any) => c.contactId === call.ghlContactId);
        if (contactConv) {
          const lastMsgDate = new Date(contactConv.lastMessageDate);
          const callDate = new Date(call.callTimestamp);
          // If team sent an outbound message after the short call, they're on it
          if (contactConv.lastMessageDirection === "outbound" && lastMsgDate > callDate) continue;
        }
      } catch (err) {
        // Non-critical
      }
    }

    // Build excerpt with the classification reason (AI summary) and signals
    const summary = call.classificationReason || "";
    const callTypeLabel = call.classification === "voicemail" ? "Voicemail" : call.classification === "callback_request" ? "Callback" : `Short call ${call.duration || "?"}s`;
    const excerpt = `[${callTypeLabel} \u2014 ${signals.join("; ")}] ${summary}`.substring(0, 500); results.push({
      tier: "possible",
      triggerRules: ["short_call_actionable_intel"],
      priorityScore: Math.min(50 + priorityBoost, 80),
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: excerpt,
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// Rule 18: SMS Deal Lost — Seller communicated via SMS that they sold, went with another buyer, etc.
// Scans GHL conversations for inbound messages indicating the deal is lost.
async function detectSMSDealLost(
  conversation: GHLConversation,
  opp: GHLPipelineOpportunity | null,
  stageName: string | null,
  creds: GHLCredentials,
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap
): Promise<DetectedOpportunity | null> {
  // Only check conversations with recent inbound messages (last 7 days)
  const lastMsgTime = new Date(conversation.lastMessageDate);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (lastMsgTime < sevenDaysAgo) return null;
  if (conversation.lastMessageDirection !== "inbound") return null;

  // Skip contacts already in terminal stages
  if (stageName) {
    const lower = stageName.toLowerCase();
    if (lower.includes("purchased") || lower.includes("closed won")) return null;
  }

  // Fetch recent messages to scan for deal-lost keywords
  let messages: GHLMessageDetail[] = [];
  try {
    messages = await fetchConversationMessages(creds, conversation.id, 20);
  } catch {
    return null;
  }

  const DEAL_LOST_PATTERNS = [
    /(?:already|just|recently)\s+(?:sold|accepted|signed|closed|went\s+with)/i,
    /(?:sold|selling)\s+(?:the|my|our|this)\s+(?:house|property|home|place)/i,
    /(?:went|going)\s+with\s+(?:another|a\s+different|someone\s+else|other)/i,
    /(?:found|have|got)\s+(?:a|another)\s+(?:buyer|offer|deal)/i,
    /(?:no\s+longer|not\s+(?:interested|selling|looking)|changed\s+(?:my|our)\s+mind)/i,
    /(?:took|accepted|signed)\s+(?:an|another|their|the)\s+(?:offer|deal|contract)/i,
    /(?:under\s+contract|in\s+escrow)\s+(?:with|already|now)/i,
    /(?:listed|listing)\s+(?:with|through)\s+(?:a|an|my|another)\s+(?:agent|realtor|broker)/i,
    /(?:deal|sale)\s+(?:is|already)\s+(?:done|closed|finalized|complete)/i,
    /(?:house|property|home)\s+(?:is|already)\s+(?:sold|under\s+contract|pending)/i,
  ];

  // Check recent inbound messages for deal-lost signals
  const recentInbound = messages.filter(m => {
    if (m.direction !== "inbound" || !m.body) return false;
    const msgDate = new Date(m.dateAdded);
    return msgDate >= sevenDaysAgo;
  });

  let matchedBody = "";
  for (const msg of recentInbound) {
    if (!msg.body) continue;
    const matched = DEAL_LOST_PATTERNS.some(p => p.test(msg.body!));
    if (matched) {
      matchedBody = msg.body;
      break;
    }
  }

  if (!matchedBody) return null;

  // Get the latest call for team member info
  const latestCall = await db
    .select({ teamMemberId: calls.teamMemberId, teamMemberName: calls.teamMemberName, propertyAddress: calls.propertyAddress, id: calls.id })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, conversation.contactId)
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(1);

  return {
    tier: "missed",
    triggerRules: ["sms_deal_lost"],
    priorityScore: 90,
    contactName: conversation.fullName || conversation.contactName || null,
    contactPhone: conversation.phone || null,
    propertyAddress: latestCall.length > 0 ? latestCall[0].propertyAddress : null,
    ghlContactId: conversation.contactId,
    ghlOpportunityId: opp?.id || null,
    ghlPipelineStageId: opp?.pipelineStageId || null,
    ghlPipelineStageName: stageName,
    relatedCallId: latestCall.length > 0 ? latestCall[0].id : null,
    teamMemberId: latestCall.length > 0 ? latestCall[0].teamMemberId : null,
    teamMemberName: latestCall.length > 0 ? latestCall[0].teamMemberName : null,
    assignedTo: opp?.assignedTo || null,
    detectionSource: "conversation",
    lastActivityAt: lastMsgTime,
    lastStageChangeAt: null,
    transcriptExcerpt: `[SMS from seller]: ${matchedBody.substring(0, 500)}`,
    ...NO_PRICE_DATA,
  };
}

// Rule 19: Delayed Scheduled Callback — Agent acknowledged being late to a scheduled call
// Detects when a callback was scheduled but the follow-up call happened late (agent apologizes for delay)
async function detectDelayedScheduledCallback(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find calls where outcome was callback_scheduled
  const callbackCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.callOutcome, "callback_scheduled"),
        gte(calls.callTimestamp, sevenDaysAgo)
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(30);

  for (const call of callbackCalls) {
    if (!call.ghlContactId) continue;

    // Find the next call to this contact after the callback was scheduled
    const followUpCalls = await db
      .select()
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId),
          gte(calls.callTimestamp, call.callTimestamp),
          eq(calls.classification, "conversation")
        )
      )
      .orderBy(calls.callTimestamp)
      .limit(3);

    // Skip the original call itself
    const nextCalls = followUpCalls.filter((c: any) => c.id !== call.id);
    if (nextCalls.length === 0) continue; // No follow-up call yet — Rule 12 handles this

    const nextCall = nextCalls[0];

    // Check if the follow-up call transcript contains apology/delay language
    if (!nextCall.transcript) continue;

    const DELAY_PATTERNS = [
      /(?:sorry|apologize|apologies)\s+(?:for|about)\s+(?:the|being|my|this)?\s*(?:delay|late|wait|hold|getting\s+(?:back|to\s+you))/i,
      /(?:sorry|apologize)\s+(?:it|i)\s+(?:took|been)\s+(?:so\s+long|a\s+while|this\s+long)/i,
      /(?:just\s+now|finally)\s+(?:getting\s+(?:to|around\s+to)|able\s+to\s+(?:call|reach))/i,
      /(?:meant|supposed|should\s+have)\s+(?:to\s+)?(?:call|reach|get\s+(?:back|to))\s+(?:you\s+)?(?:earlier|sooner|yesterday|before)/i,
      /(?:running|ran)\s+(?:behind|late)/i,
      /(?:back[\s-]to[\s-]back|slammed|swamped|crazy\s+(?:day|week|busy))/i,
    ];

    const hasDelayLanguage = DELAY_PATTERNS.some(p => p.test(nextCall.transcript));
    if (!hasDelayLanguage) continue;

    // Calculate the delay between scheduled callback and actual follow-up
    const scheduledTime = new Date(call.callTimestamp).getTime();
    const actualTime = new Date(nextCall.callTimestamp).getTime();
    const delayHours = Math.round((actualTime - scheduledTime) / (1000 * 60 * 60));

    // Check if the follow-up resulted in a negative outcome (makes it more concerning)
    const negativeOutcomes = ["not_interested", "dead", "no_answer"];
    const isNegativeOutcome = nextCall.callOutcome && negativeOutcomes.includes(nextCall.callOutcome);

    const excerpt = `[Callback scheduled on ${new Date(call.callTimestamp).toLocaleDateString()} by ${call.teamMemberName || "team"}. Follow-up call ${delayHours}h later by ${nextCall.teamMemberName || "team"} — agent acknowledged delay. Outcome: ${nextCall.callOutcome || "unknown"}] ${nextCall.transcript.substring(0, 400)}`;

    results.push({
      tier: "warning",
      triggerRules: ["delayed_scheduled_callback"],
      priorityScore: isNegativeOutcome ? 80 : 65,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress || nextCall.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: nextCall.id,
      teamMemberId: nextCall.teamMemberId,
      teamMemberName: nextCall.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: nextCall.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: excerpt,
      ...(await extractPricesFromTranscriptLLM(nextCall.transcript)),
    });
  }

  return results;
}

// Rule 20: Skipped Walkthrough — Pipeline jumped from qualification/appointment to offer without walkthrough
// Detects when a contact's pipeline stage progression skips the walkthrough stage
async function detectSkippedWalkthrough(
  opp: GHLPipelineOpportunity,
  stageName: string,
  salesPipelineStages: PipelineStage[],
  db: any,
  tenantId: number,
  ghlMap: GhlUserIdMap,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity | null> {
  // Only flag if currently in an offer stage
  if (!isOfferOrBeyond(stageName)) return null;

  // Check if there's a walkthrough stage in this pipeline
  const walkthroughStage = salesPipelineStages.find(s => isWalkthroughStage(s.name));
  if (!walkthroughStage) return null; // No walkthrough stage in pipeline — can't skip what doesn't exist

  // Check if the contact has any calls where walkthrough was discussed or completed
  const walkthroughCalls = await db
    .select({ id: calls.id, transcript: calls.transcript, callTimestamp: calls.callTimestamp })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        eq(calls.classification, "conversation"),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(10);

  // Check transcripts for evidence of an in-person walkthrough
  const WALKTHROUGH_EVIDENCE = [
    /(?:walked|walk)\s+(?:through|thru)\s+(?:the|your|this|that)\s+(?:house|property|home|place)/i,
    /(?:walkthrough|walk-through)\s+(?:was|went|looked|is)\s+(?:good|great|fine|done|complete)/i,
    /(?:saw|seen|looked at|checked out|inspected)\s+(?:the|your|this|that)\s+(?:house|property|home|place)/i,
    /(?:came|went|drove|stopped)\s+(?:out|by|over)\s+(?:to|and)\s+(?:see|look|check|inspect|walk)/i,
    /(?:met|meeting)\s+(?:at|with)\s+(?:the|your)\s+(?:house|property|home|place)/i,
  ];

  // Check for walkthrough REFUSAL patterns — seller said no to walkthrough
  const WALKTHROUGH_SKIP_PATTERNS = [
    /(?:don't|do\s+not|doesn't|can't|cannot)\s+(?:need|want|have\s+to|require)\s+(?:a\s+)?(?:walkthrough|walk-through|walk\s+through|to\s+(?:come|see|look|walk))/i,
    /(?:no\s+(?:need|reason)\s+(?:for|to)\s+(?:a\s+)?(?:walkthrough|walk-through|come\s+(?:out|by|look)))/i,
    /(?:just|can\s+you\s+just|why\s+don't\s+you\s+just)\s+(?:send|give|make)\s+(?:me|us)\s+(?:an\s+)?(?:offer|number|price)/i,
    /(?:skip|bypass|don't\s+(?:need|bother\s+with))\s+(?:the\s+)?(?:walkthrough|walk-through|inspection|visit)/i,
    /(?:sight\s+unseen|without\s+(?:seeing|looking|visiting|walking))/i,
  ];

  let hasWalkthroughEvidence = false;
  let hasSkipPattern = false;
  let skipExcerpt = "";

  for (const call of walkthroughCalls) {
    if (!call.transcript) continue;
    if (WALKTHROUGH_EVIDENCE.some(p => p.test(call.transcript))) {
      hasWalkthroughEvidence = true;
      break;
    }
    if (WALKTHROUGH_SKIP_PATTERNS.some(p => p.test(call.transcript))) {
      hasSkipPattern = true;
      skipExcerpt = call.transcript.substring(0, 500);
    }
  }

  // If walkthrough happened, no issue
  if (hasWalkthroughEvidence) return null;

  // If no skip pattern found either, check if there are any calls at all
  // If there are calls but no walkthrough evidence and we're at offer stage, flag it
  if (!hasSkipPattern && walkthroughCalls.length === 0) return null;

  // Also check GHL appointments for walkthrough-type appointments
  if (creds) {
    try {
      const appointments = await fetchContactAppointments(creds, opp.contactId);
      const walkthroughApt = appointments.find((a: any) => {
        const title = (a.title || a.name || "").toLowerCase();
        return title.includes("walkthrough") || title.includes("walk-through") || title.includes("showing") || title.includes("inspection");
      });
      if (walkthroughApt) return null; // Walkthrough appointment exists
    } catch {
      // Non-critical
    }
  }

  const latestCall = walkthroughCalls.length > 0 ? walkthroughCalls[0] : null;

  return {
    tier: "possible",
    triggerRules: ["skipped_walkthrough"],
    priorityScore: 60,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: latestCall?.id || null,
    ...resolveGhlAssignee(opp.assignedTo, ghlMap),
    assignedTo: opp.assignedTo || null,
    detectionSource: "hybrid",
    lastActivityAt: latestCall ? new Date(latestCall.callTimestamp) : null,
    lastStageChangeAt: opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null,
    transcriptExcerpt: hasSkipPattern
      ? `[Seller appears to have declined walkthrough — went straight to offer] ${skipExcerpt}`
      : `[No walkthrough evidence found in ${walkthroughCalls.length} calls — contact is now at offer stage]`,
    ...NO_PRICE_DATA,
  };
}

// Rule 21: Deal Fell Through — Seller mentions previous buyer/deal fell through, sale didn't close
// This is a re-engagement opportunity: the seller was under contract but it fell apart
async function detectDealFellThrough(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null,
  contactOppMap: Map<string, { opp: GHLPipelineOpportunity; stageName: string }>
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Scan recent completed conversations for deal-fell-through language
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, "completed"),
        eq(calls.classification, "conversation"),
        gte(calls.callTimestamp, fourteenDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(50);

  const DEAL_FELL_THROUGH_PATTERNS = [
    /(?:deal|sale|contract|closing|buyer|offer)\s+(?:fell|fall|falling)\s+(?:through|apart)/i,
    /(?:buyer|deal|contract|sale)\s+(?:backed|back)\s+(?:out|off|away)/i,
    /(?:buyer|deal|contract)\s+(?:didn't|did\s+not|didn't)\s+(?:go\s+through|close|work\s+out|happen|pan\s+out)/i,
    /(?:previous|last|other|first)\s+(?:buyer|deal|offer|contract)\s+(?:fell|didn't|did\s+not|backed|failed)/i,
    /(?:back\s+(?:on|to)\s+(?:the\s+)?market|relisted|re-listed)/i,
    /(?:contract|deal|sale)\s+(?:was|got)\s+(?:cancelled|canceled|terminated|voided)/i,
    /(?:financing|loan|mortgage)\s+(?:fell\s+through|didn't\s+(?:go|work)|was\s+denied|got\s+denied)/i,
    /(?:inspection|appraisal)\s+(?:killed|failed|didn't\s+(?:pass|go)|fell\s+through)/i,
    /(?:they|buyer)\s+(?:couldn't|could\s+not|can't)\s+(?:get\s+(?:financing|approved|the\s+loan)|close|perform)/i,
    /(?:still|again|back\s+to)\s+(?:looking|trying|wanting)\s+to\s+sell/i,
  ];

  // Also scan GHL conversations for SMS mentions
  const smsContactsToCheck: string[] = [];

  for (const call of recentCalls) {
    if (!call.transcript || !call.ghlContactId) continue;

    const hasDealFellThrough = DEAL_FELL_THROUGH_PATTERNS.some(p => p.test(call.transcript));
    if (!hasDealFellThrough) continue;

    // Check if contact is in a terminal stage (already closed) — skip if so
    const oppInfo = contactOppMap.get(call.ghlContactId);
    if (oppInfo) {
      const lower = oppInfo.stageName.toLowerCase();
      if (lower.includes("purchased") || lower.includes("closed won") || lower.includes("under contract")) continue;
    }

    results.push({
      tier: "possible",
      triggerRules: ["deal_fell_through"],
      priorityScore: 70,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: oppInfo?.opp?.id || null,
      ghlPipelineStageId: oppInfo?.opp?.pipelineStageId || null,
      ghlPipelineStageName: oppInfo?.stageName || null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: oppInfo?.opp?.assignedTo || null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `[Seller mentioned previous deal fell through] ${call.transcript.substring(0, 500)}`,
      ...(await extractPricesFromTranscriptLLM(call.transcript)),
    });
  }

  // Also scan GHL SMS conversations for deal-fell-through signals
  if (creds) {
    try {
      const conversations = await fetchRecentConversations(creds, 50);
      for (const conv of conversations) {
        if (conv.lastMessageDirection !== "inbound") continue;
        const lastMsgTime = new Date(conv.lastMessageDate);
        if (lastMsgTime < fourteenDaysAgo) continue;

        // Check if already detected via call transcript
        if (results.some(r => r.ghlContactId === conv.contactId)) continue;

        // Fetch messages
        let messages: GHLMessageDetail[] = [];
        try {
          messages = await fetchConversationMessages(creds, conv.id, 15);
        } catch { continue; }

        const recentInbound = messages.filter(m => {
          if (m.direction !== "inbound" || !m.body) return false;
          return new Date(m.dateAdded) >= fourteenDaysAgo;
        });

        let matchedBody = "";
        for (const msg of recentInbound) {
          if (!msg.body) continue;
          if (DEAL_FELL_THROUGH_PATTERNS.some(p => p.test(msg.body!))) {
            matchedBody = msg.body;
            break;
          }
        }

        if (!matchedBody) continue;

        const oppInfo = contactOppMap.get(conv.contactId);
        if (oppInfo) {
          const lower = oppInfo.stageName.toLowerCase();
          if (lower.includes("purchased") || lower.includes("closed won")) continue;
        }

        const latestCall = await db
          .select({ teamMemberId: calls.teamMemberId, teamMemberName: calls.teamMemberName, propertyAddress: calls.propertyAddress, id: calls.id })
          .from(calls)
          .where(
            and(
              eq(calls.tenantId, tenantId),
              eq(calls.ghlContactId, conv.contactId)
            )
          )
          .orderBy(desc(calls.callTimestamp))
          .limit(1);

        results.push({
          tier: "possible",
          triggerRules: ["deal_fell_through"],
          priorityScore: 70,
          contactName: conv.fullName || conv.contactName || null,
          contactPhone: conv.phone || null,
          propertyAddress: latestCall.length > 0 ? latestCall[0].propertyAddress : null,
          ghlContactId: conv.contactId,
          ghlOpportunityId: oppInfo?.opp?.id || null,
          ghlPipelineStageId: oppInfo?.opp?.pipelineStageId || null,
          ghlPipelineStageName: oppInfo?.stageName || null,
          relatedCallId: latestCall.length > 0 ? latestCall[0].id : null,
          teamMemberId: latestCall.length > 0 ? latestCall[0].teamMemberId : null,
          teamMemberName: latestCall.length > 0 ? latestCall[0].teamMemberName : null,
          assignedTo: oppInfo?.opp?.assignedTo || null,
          detectionSource: "conversation",
          lastActivityAt: lastMsgTime,
          lastStageChangeAt: null,
          transcriptExcerpt: `[SMS from seller]: ${matchedBody.substring(0, 500)}`,
          ...NO_PRICE_DATA,
        });
      }
    } catch (err) {
      // Non-critical
    }
  }

  return results;
}

// ============ NEW RULE: Deal Lost on Call ============
// Scans recent transcripts for seller explicitly stating they sold, listed, or went with competitor

const DEAL_LOST_ON_CALL_PATTERNS = [
  /(?:i|we)\s+(?:already|just|recently)\s+(?:sold|listed|closed)/i,
  /(?:went|going)\s+with\s+(?:another|a\s+different|someone\s+else|other)\s+(?:investor|buyer|company|offer)/i,
  /(?:listed|listing)\s+(?:it\s+)?with\s+(?:an?\s+)?(?:agent|realtor|real\s+estate)/i,
  /(?:not|no\s+longer)\s+(?:selling|interested|looking\s+to\s+sell)/i,
  /(?:someone\s+else|another\s+(?:buyer|investor))\s+(?:already\s+)?(?:bought|purchased|closed)/i,
  /(?:took|accepted|went\s+with)\s+(?:another|a\s+different|their|someone)\s+(?:offer|deal)/i,
  /(?:property|house|home)\s+(?:is\s+)?(?:already\s+)?(?:sold|under\s+contract|pending)/i,
  /(?:i|we)\s+(?:decided|chose)\s+(?:to\s+)?(?:go\s+with|list\s+with|use)\s+(?:a|an|another|someone)/i,
  /(?:signed|signing)\s+(?:a\s+)?(?:listing|contract|agreement)\s+with/i,
];

async function detectDealLostOnCall(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Get recent calls with transcripts
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, fourteenDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`,
        sql`LENGTH(${calls.transcript}) > 100`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(100);

  for (const call of recentCalls) {
    if (!call.ghlContactId) continue;
    const transcript = call.transcript;
    if (!transcript) continue;

    // Check for deal-lost patterns
    const matchedPattern = DEAL_LOST_ON_CALL_PATTERNS.find(p => p.test(transcript));
    if (!matchedPattern) continue;

    // Extract the matching excerpt for context
    const match = transcript.match(matchedPattern);
    const excerptStart = Math.max(0, (match?.index || 0) - 100);
    const excerptEnd = Math.min(transcript.length, (match?.index || 0) + (match?.[0]?.length || 0) + 200);
    const excerpt = transcript.substring(excerptStart, excerptEnd);

    results.push({
      tier: "missed",
      triggerRules: ["deal_lost_on_call"],
      priorityScore: 92,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: excerpt.substring(0, 500),
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// ============ NEW RULE: Bad Call Performance ============
// Flags calls graded D or F (score below 40) — very bad performance needing coaching

async function detectBadCallPerformance(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get recent calls with bad grades
  const badCalls = await db
    .select({
      call: calls,
      grade: callGrades,
    })
    .from(callGrades)
    .innerJoin(calls, eq(calls.id, callGrades.callId))
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, sevenDaysAgo),
        sql`(${callGrades.overallGrade} IN ('D', 'F') OR ${callGrades.overallScore} < 40)`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(20);

  for (const { call, grade } of badCalls) {
    if (!call.ghlContactId) continue;

    // Extract weak areas from criteriaScores
    let weakAreas: string[] = [];
    try {
      const criteria = typeof grade.criteriaScores === 'string' ? JSON.parse(grade.criteriaScores) : grade.criteriaScores;
      if (criteria && typeof criteria === 'object') {
        for (const [key, val] of Object.entries(criteria)) {
          const score = typeof val === 'object' && val !== null ? (val as any).score : val;
          if (typeof score === 'number' && score < 5) {
            weakAreas.push(key.replace(/_/g, ' '));
          }
        }
      }
    } catch (e) { /* non-critical */ }

    const weakAreasText = weakAreas.length > 0 ? ` Weak areas: ${weakAreas.join(', ')}.` : '';

    results.push({
      tier: "warning",
      triggerRules: ["bad_call_performance"],
      priorityScore: 75,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "call_grade",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `Grade: ${grade.overallGrade} (${grade.overallScore}/100).${weakAreasText} ${(call.transcript || '').substring(0, 300)}`,
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// ============ NEW RULE: Extreme Motivation ============
// Detects high-urgency motivation signals regardless of call count

const EXTREME_MOTIVATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /foreclos(?:ure|ing|ed)/i, label: "foreclosure" },
  { pattern: /(?:tax\s+(?:sale|lien|deed)|delinquent\s+taxes|back\s+taxes.*deadline)/i, label: "tax sale/lien" },
  { pattern: /(?:divorce|divorcing|separated.*(?:sell|split))/i, label: "divorce" },
  { pattern: /(?:passed\s+away|death\s+in|died|deceased|probate|estate\s+(?:sale|settlement))/i, label: "death/probate" },
  { pattern: /(?:code\s+violation|condemned|uninhabitable).*(?:deadline|fine|must)/i, label: "code violation deadline" },
  { pattern: /(?:hospital|cancer|surgery|terminal|disabled).*(?:sell|need\s+money|can't\s+(?:afford|maintain))/i, label: "health emergency" },
  { pattern: /(?:evict|sheriff|marshal).*(?:sale|auction|deadline)/i, label: "eviction/auction" },
  { pattern: /(?:bankruptcy|chapter\s+(?:7|11|13)).*(?:sell|liquidat)/i, label: "bankruptcy" },
  { pattern: /(?:need|have)\s+to\s+sell.*(?:immediately|asap|right\s+away|this\s+(?:week|month)|by\s+(?:monday|tuesday|wednesday|thursday|friday|end\s+of))/i, label: "urgent timeline" },
  { pattern: /(?:relocat|moving|transfer).*(?:next\s+(?:week|month)|already|soon|immediately)/i, label: "urgent relocation" },
];

async function detectExtremeMotivation(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, fourteenDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`,
        sql`LENGTH(${calls.transcript}) > 200`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(100);

  // Group by contact to avoid duplicate signals
  const contactMotivations = new Map<string, { call: any; motivations: string[]; excerpt: string }>();

  for (const call of recentCalls) {
    if (!call.ghlContactId) continue;
    const transcript = call.transcript;
    if (!transcript) continue;

    const foundMotivations: string[] = [];
    let bestExcerpt = '';

    for (const { pattern, label } of EXTREME_MOTIVATION_PATTERNS) {
      const match = transcript.match(pattern);
      if (match) {
        foundMotivations.push(label);
        if (!bestExcerpt) {
          const start = Math.max(0, (match.index || 0) - 100);
          const end = Math.min(transcript.length, (match.index || 0) + match[0].length + 200);
          bestExcerpt = transcript.substring(start, end);
        }
      }
    }

    if (foundMotivations.length === 0) continue;

    // Only flag if we found 2+ motivation signals OR 1 very strong one
    const strongMotivations = ['foreclosure', 'tax sale/lien', 'death/probate', 'eviction/auction', 'bankruptcy', 'health emergency'];
    const hasStrong = foundMotivations.some(m => strongMotivations.includes(m));
    if (foundMotivations.length < 2 && !hasStrong) continue;

    const existing = contactMotivations.get(call.ghlContactId);
    if (!existing || foundMotivations.length > existing.motivations.length) {
      contactMotivations.set(call.ghlContactId, { call, motivations: foundMotivations, excerpt: bestExcerpt });
    }
  }

  for (const [contactId, { call, motivations, excerpt }] of Array.from(contactMotivations.entries())) {
    results.push({
      tier: "possible",
      triggerRules: ["extreme_motivation"],
      priorityScore: 68,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: contactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `[Motivations: ${motivations.join(', ')}] ${excerpt.substring(0, 400)}`,
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// ============ NEW RULE: Close on Price ============
// Flags leads where our offer and seller ask are within $30k

async function detectCloseOnPrice(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get recent calls with transcripts that might have price info
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, thirtyDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`,
        sql`LENGTH(${calls.transcript}) > 200`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(80);

  // Group by contact — only need one signal per contact
  const contactPrices = new Map<string, { call: any; ourOffer: number; sellerAsk: number; gap: number }>();

  for (const call of recentCalls) {
    if (!call.ghlContactId) continue;
    if (contactPrices.has(call.ghlContactId)) continue; // Already found for this contact

    try {
      const prices = await extractPricesFromTranscriptLLM(call.transcript);
      if (prices.ourOffer && prices.sellerAsk) {
        const gap = Math.abs(prices.sellerAsk - prices.ourOffer);
        if (gap <= 30000 && gap > 0) {
          contactPrices.set(call.ghlContactId, {
            call,
            ourOffer: prices.ourOffer,
            sellerAsk: prices.sellerAsk,
            gap,
          });
        }
      }
    } catch (e) { /* non-critical */ }
  }

  for (const [contactId, { call, ourOffer, sellerAsk, gap }] of Array.from(contactPrices.entries())) {
    results.push({
      tier: "possible",
      triggerRules: ["close_on_price"],
      priorityScore: 72,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: contactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `Our offer: $${ourOffer.toLocaleString()}, Seller ask: $${sellerAsk.toLocaleString()}, Gap: $${gap.toLocaleString()}. ${(call.transcript || '').substring(0, 300)}`,
      ourOffer,
      sellerAsk,
      priceGap: gap,
    });
  }

  return results;
}

// ============ NEW RULE: Seller Re-engagement ============
// Detects follow-up leads (30+ days old) with new inbound activity

async function detectSellerReEngagement(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  if (!creds) return results;

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Get recent conversations with inbound messages
    const conversations = await ghlFetch(
      creds,
      `/conversations/search?locationId=${creds.locationId}&sort=desc&limit=50`
    );
    const convList = conversations.conversations || [];

    for (const conv of convList) {
      if (!conv.contactId) continue;
      // Must have recent inbound message
      const lastMsgTime = conv.lastMessageDate ? new Date(conv.lastMessageDate) : null;
      if (!lastMsgTime || lastMsgTime < threeDaysAgo) continue;
      if (conv.lastMessageDirection !== 'inbound') continue;

      // Check if this contact has old calls (30+ days ago) but the most recent activity is new
      const oldCalls = await db
        .select({ id: calls.id, callTimestamp: calls.callTimestamp })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, conv.contactId),
            lt(calls.callTimestamp, thirtyDaysAgo)
          )
        )
        .limit(1);

      if (oldCalls.length === 0) continue; // Not an old lead

      // Make sure there's no recent call (within 7 days) — they truly went silent and came back
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentCalls = await db
        .select({ id: calls.id })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, conv.contactId),
            gte(calls.callTimestamp, sevenDaysAgo)
          )
        )
        .limit(1);

      if (recentCalls.length > 0) continue; // Already being worked

      // Get the latest call for context
      const latestCall = await db
        .select()
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.ghlContactId, conv.contactId)
          )
        )
        .orderBy(desc(calls.callTimestamp))
        .limit(1);

      const call = latestCall[0];
      const daysSinceLastCall = call ? Math.round((Date.now() - new Date(call.callTimestamp).getTime()) / (1000 * 60 * 60 * 24)) : 30;

      results.push({
        tier: "possible",
        triggerRules: ["seller_re_engagement"],
        priorityScore: 65,
        contactName: conv.fullName || conv.contactName || call?.contactName || null,
        contactPhone: conv.phone || call?.contactPhone || null,
        propertyAddress: call?.propertyAddress || null,
        ghlContactId: conv.contactId,
        ghlOpportunityId: null,
        ghlPipelineStageId: null,
        ghlPipelineStageName: null,
        relatedCallId: call?.id || null,
        teamMemberId: call?.teamMemberId || null,
        teamMemberName: call?.teamMemberName || null,
        assignedTo: null,
        detectionSource: "conversation",
        lastActivityAt: lastMsgTime,
        lastStageChangeAt: null,
        transcriptExcerpt: `Seller came back after ${daysSinceLastCall} days of silence. Last inbound: "${(conv.lastMessageBody || '').substring(0, 300)}"`,
        ...NO_PRICE_DATA,
      });
    }
  } catch (err) {
    // Non-critical
  }

  return results;
}

// ============ NEW RULE: Seller Texted Number ============
// Detects when seller proactively shares contact info via SMS

const SELLER_SHARED_CONTACT_PATTERNS = [
  /(?:call|reach|text|contact)\s+me\s+(?:at|on)\s+\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i,
  /(?:my|the)\s+(?:number|cell|phone|mobile)\s+(?:is|:)\s+\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i,
  /(?:email|reach)\s+me\s+(?:at|on)\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
  /(?:my|the)\s+(?:email|e-mail)\s+(?:is|:)\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
  /(?:give\s+me\s+a\s+call|call\s+me\s+back|please\s+call)/i,
  /(?:here'?s?\s+my\s+(?:number|cell|phone|email))/i,
];

async function detectSellerTextedNumber(
  db: any,
  tenantId: number,
  creds: GHLCredentials | null
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  if (!creds) return results;

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  try {
    const conversations = await ghlFetch(
      creds,
      `/conversations/search?locationId=${creds.locationId}&sort=desc&limit=50`
    );
    const convList = conversations.conversations || [];

    for (const conv of convList) {
      if (!conv.contactId) continue;
      const lastMsgTime = conv.lastMessageDate ? new Date(conv.lastMessageDate) : null;
      if (!lastMsgTime || lastMsgTime < threeDaysAgo) continue;

      // Get recent inbound messages
      try {
        const messages = await fetchConversationMessages(creds, conv.id, 15);
        const recentInbound = messages.filter((m: GHLMessageDetail) => {
          if (m.direction !== 'inbound') return false;
          const msgTime = m.dateAdded ? new Date(m.dateAdded) : null;
          return msgTime && msgTime >= threeDaysAgo;
        });

        for (const msg of recentInbound) {
          if (!msg.body) continue;
          const matched = SELLER_SHARED_CONTACT_PATTERNS.some(p => p.test(msg.body!));
          if (!matched) continue;

          // Check if there's been an outbound response after this message
          const msgTime = new Date(msg.dateAdded);
          const hasResponse = messages.some((m: GHLMessageDetail) => {
            if (m.direction !== 'outbound') return false;
            const outTime = m.dateAdded ? new Date(m.dateAdded) : null;
            return outTime && outTime > msgTime;
          });

          if (hasResponse) continue; // Already responded

          const latestCall = await db
            .select()
            .from(calls)
            .where(
              and(
                eq(calls.tenantId, tenantId),
                eq(calls.ghlContactId, conv.contactId)
              )
            )
            .orderBy(desc(calls.callTimestamp))
            .limit(1);

          const call = latestCall[0];

          results.push({
            tier: "possible",
            triggerRules: ["seller_texted_number"],
            priorityScore: 62,
            contactName: conv.fullName || conv.contactName || call?.contactName || null,
            contactPhone: conv.phone || call?.contactPhone || null,
            propertyAddress: call?.propertyAddress || null,
            ghlContactId: conv.contactId,
            ghlOpportunityId: null,
            ghlPipelineStageId: null,
            ghlPipelineStageName: null,
            relatedCallId: call?.id || null,
            teamMemberId: call?.teamMemberId || null,
            teamMemberName: call?.teamMemberName || null,
            assignedTo: null,
            detectionSource: "conversation",
            lastActivityAt: lastMsgTime,
            lastStageChangeAt: null,
            transcriptExcerpt: `[Seller SMS]: ${msg.body.substring(0, 500)}`,
            ...NO_PRICE_DATA,
          });

          break; // One signal per conversation
        }
      } catch (msgErr) {
        // Non-critical
      }
    }
  } catch (err) {
    // Non-critical
  }

  return results;
}

// ============ NEW RULE: Seller Out of Agreement ============
// Detects when seller mentions they just got out of a listing/agreement

const OUT_OF_AGREEMENT_PATTERNS = [
  /(?:listing|contract|agreement)\s+(?:expired|ended|ran\s+out|is\s+up|just\s+ended)/i,
  /(?:agent|realtor|broker)\s+(?:contract|agreement|listing)\s+(?:expired|ended|is\s+up|ran\s+out)/i,
  /(?:just|recently)\s+(?:got\s+out|came\s+out|finished|ended)\s+(?:of|with)\s+(?:a|an|my|the)\s+(?:listing|contract|agreement)/i,
  /(?:fired|dropped|let\s+go)\s+(?:of\s+)?(?:my|the|our)\s+(?:agent|realtor|broker)/i,
  /(?:didn't|did\s+not|couldn't|could\s+not)\s+(?:sell|close|get\s+an\s+offer)\s+(?:with|through)\s+(?:my|the|our|an?)\s+(?:agent|realtor)/i,
  /(?:took\s+it|taking\s+it|pulled\s+it)\s+off\s+(?:the\s+)?(?:market|mls|listing)/i,
  /(?:previous|last|other)\s+(?:buyer|investor|deal)\s+(?:backed\s+out|fell\s+through|didn't\s+close|walked\s+away)/i,
];

async function detectSellerOutOfAgreement(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, fourteenDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`,
        sql`LENGTH(${calls.transcript}) > 100`
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(100);

  const seenContacts = new Set<string>();

  for (const call of recentCalls) {
    if (!call.ghlContactId || seenContacts.has(call.ghlContactId)) continue;
    const transcript = call.transcript;
    if (!transcript) continue;

    const matchedPattern = OUT_OF_AGREEMENT_PATTERNS.find(p => p.test(transcript));
    if (!matchedPattern) continue;

    seenContacts.add(call.ghlContactId);

    const match = transcript.match(matchedPattern);
    const excerptStart = Math.max(0, (match?.index || 0) - 100);
    const excerptEnd = Math.min(transcript.length, (match?.index || 0) + (match?.[0]?.length || 0) + 200);
    const excerpt = transcript.substring(excerptStart, excerptEnd);

    results.push({
      tier: "possible",
      triggerRules: ["seller_out_of_agreement"],
      priorityScore: 66,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      propertyAddress: call.propertyAddress,
      ghlContactId: call.ghlContactId,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "transcript",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: excerpt.substring(0, 500),
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// ============ NEW RULE: AI Coach Inactive ============
// Flags team members who haven't used AI coach in 7+ days

async function detectAICoachInactive(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get all active team members for this tenant
  const members = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.tenantId, tenantId),
        eq(teamMembers.isActive, "true")
      )
    );

  for (const member of members) {
    if (!member.userId) continue;

    // Check if they have any coach messages in the last 7 days
    const recentCoachActivity = await db
      .select({ id: coachMessages.id })
      .from(coachMessages)
      .where(
        and(
          eq(coachMessages.tenantId, tenantId),
          eq(coachMessages.userId, member.userId),
          gte(coachMessages.createdAt, sevenDaysAgo)
        )
      )
      .limit(1);

    if (recentCoachActivity.length > 0) continue; // Active user

    // Check if they've EVER used the coach (don't flag brand new users)
    const anyCoachActivity = await db
      .select({ id: coachMessages.id })
      .from(coachMessages)
      .where(
        and(
          eq(coachMessages.tenantId, tenantId),
          eq(coachMessages.userId, member.userId)
        )
      )
      .limit(1);

    if (anyCoachActivity.length === 0) continue; // Never used coach — not a re-engagement signal

    // Get last coach activity date
    const lastActivity = await db
      .select({ createdAt: coachMessages.createdAt })
      .from(coachMessages)
      .where(
        and(
          eq(coachMessages.tenantId, tenantId),
          eq(coachMessages.userId, member.userId)
        )
      )
      .orderBy(desc(coachMessages.createdAt))
      .limit(1);

    const lastDate = lastActivity[0]?.createdAt;
    const daysSince = lastDate ? Math.round((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 7;

    results.push({
      tier: "possible",
      triggerRules: ["ai_coach_inactive"],
      priorityScore: 40,
      contactName: member.name || `Team Member #${member.id}`,
      contactPhone: null,
      propertyAddress: null,
      ghlContactId: null,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: null,
      teamMemberId: member.id,
      teamMemberName: member.name,
      assignedTo: null,
      detectionSource: "system",
      lastActivityAt: lastDate || null,
      lastStageChangeAt: null,
      transcriptExcerpt: `${member.name} hasn't used the AI Coach in ${daysSince} days. Last session: ${lastDate ? new Date(lastDate).toLocaleDateString() : 'unknown'}.`,
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// ============ NEW RULE: Consistent Call Weakness ============
// Detects team members with the same low-scoring category across 5+ calls

async function detectConsistentCallWeakness(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get all team members
  const members = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.tenantId, tenantId),
        eq(teamMembers.isActive, "true")
      )
    );

  for (const member of members) {
    // Get recent graded calls for this team member
    const gradedCalls = await db
      .select({
        criteriaScores: callGrades.criteriaScores,
      })
      .from(callGrades)
      .innerJoin(calls, eq(calls.id, callGrades.callId))
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.teamMemberId, member.id),
          gte(calls.callTimestamp, thirtyDaysAgo)
        )
      )
      .orderBy(desc(calls.callTimestamp))
      .limit(10);

    if (gradedCalls.length < 5) continue; // Not enough data

    // Aggregate scores by category
    const categoryScores: Record<string, number[]> = {};
    for (const { criteriaScores } of gradedCalls) {
      try {
        const criteria = typeof criteriaScores === 'string' ? JSON.parse(criteriaScores) : criteriaScores;
        if (!criteria || typeof criteria !== 'object') continue;
        for (const [key, val] of Object.entries(criteria)) {
          const score = typeof val === 'object' && val !== null ? (val as any).score : val;
          if (typeof score === 'number') {
            if (!categoryScores[key]) categoryScores[key] = [];
            categoryScores[key].push(score);
          }
        }
      } catch (e) { /* non-critical */ }
    }

    // Find categories where the average is below 5/10 across 5+ calls
    const weakCategories: Array<{ name: string; avg: number; count: number }> = [];
    for (const [category, scores] of Object.entries(categoryScores)) {
      if (scores.length < 5) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < 5) {
        weakCategories.push({ name: category.replace(/_/g, ' '), avg: Math.round(avg * 10) / 10, count: scores.length });
      }
    }

    if (weakCategories.length === 0) continue;

    // Sort by worst average
    weakCategories.sort((a, b) => a.avg - b.avg);
    const worstCategory = weakCategories[0];

    results.push({
      tier: "possible",
      triggerRules: ["consistent_call_weakness"],
      priorityScore: 45,
      contactName: member.name || `Team Member #${member.id}`,
      contactPhone: null,
      propertyAddress: null,
      ghlContactId: null,
      ghlOpportunityId: null,
      ghlPipelineStageId: null,
      ghlPipelineStageName: null,
      relatedCallId: null,
      teamMemberId: member.id,
      teamMemberName: member.name,
      assignedTo: null,
      detectionSource: "call_grade",
      lastActivityAt: null,
      lastStageChangeAt: null,
      transcriptExcerpt: `${member.name} consistently scores low on "${worstCategory.name}" (avg ${worstCategory.avg}/10 across ${worstCategory.count} calls). ${weakCategories.length > 1 ? `Also weak on: ${weakCategories.slice(1).map(c => `${c.name} (${c.avg}/10)`).join(', ')}.` : ''}`,
      ...NO_PRICE_DATA,
    });
  }

  return results;
}

// ============ NEW RULE: Bad Temperament ============
// Uses LLM to detect frustration, rudeness, or unprofessional tone

async function detectBadTemperament(
  db: any,
  tenantId: number
): Promise<DetectedOpportunity[]> {
  const results: DetectedOpportunity[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get recent calls with transcripts — focus on longer calls where tone matters
  const recentCalls = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.callTimestamp, sevenDaysAgo),
        sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`,
        sql`LENGTH(${calls.transcript}) > 500`,
        sql`${calls.duration} > 120` // 2+ minute calls
      )
    )
    .orderBy(desc(calls.callTimestamp))
    .limit(30);

  // Quick pre-filter with regex before sending to LLM
  const TEMPERAMENT_PREFILTER = [
    /(?:i\s+(?:don't|do\s+not)\s+(?:care|give\s+a)|whatever\s+(?:man|dude|lady|sir))/i,
    /(?:that's\s+(?:not\s+my|your)\s+problem|figure\s+it\s+out\s+yourself)/i,
    /(?:look,?\s+(?:i\s+(?:already|just)|you\s+(?:need|have)\s+to)|listen\s+(?:here|to\s+me))/i,
    /(?:(?:are\s+you|you)\s+(?:serious|kidding|joking)\s+(?:right\s+now|me))/i,
    /(?:(?:sigh|ugh|oh\s+my\s+god|come\s+on)\s)/i,
    /(?:(?:hung\s+up|cut.*off|interrupted|talked\s+over))/i,
  ];

  for (const call of recentCalls) {
    if (!call.ghlContactId) continue;
    const transcript = call.transcript;
    if (!transcript) continue;

    // Quick pre-filter — only send to LLM if there are potential indicators
    const hasIndicators = TEMPERAMENT_PREFILTER.some(p => p.test(transcript));
    if (!hasIndicators) continue;

    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You analyze call transcripts between a real estate acquisition team member and a property seller. Detect if the TEAM MEMBER (not the seller) showed unprofessional behavior: frustration, rudeness, dismissiveness, talking over the seller, impatience, condescension, or aggressive tone. Sellers being rude is normal and expected — only flag issues with OUR team member's behavior. Return JSON.`
          },
          {
            role: "user",
            content: `Analyze this transcript for unprofessional behavior by the TEAM MEMBER (our rep, not the seller):

${transcript.substring(0, 2000)}

Return JSON: { "detected": true/false, "severity": "mild"|"moderate"|"severe", "description": "brief description of what happened", "excerpt": "the specific problematic exchange" }`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "temperament_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                detected: { type: "boolean" },
                severity: { type: "string", description: "mild, moderate, or severe" },
                description: { type: "string" },
                excerpt: { type: "string" }
              },
              required: ["detected", "severity", "description", "excerpt"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') continue;
      const analysis = JSON.parse(content as string);
      if (!analysis.detected) continue;
      if (analysis.severity === 'mild') continue; // Only flag moderate+ issues

      results.push({
        tier: "possible",
        triggerRules: ["bad_temperament"],
        priorityScore: analysis.severity === 'severe' ? 70 : 55,
        contactName: call.contactName,
        contactPhone: call.contactPhone,
        propertyAddress: call.propertyAddress,
        ghlContactId: call.ghlContactId,
        ghlOpportunityId: null,
        ghlPipelineStageId: null,
        ghlPipelineStageName: null,
        relatedCallId: call.id,
        teamMemberId: call.teamMemberId,
        teamMemberName: call.teamMemberName,
        assignedTo: null,
        detectionSource: "transcript",
        lastActivityAt: call.callTimestamp,
        lastStageChangeAt: null,
        transcriptExcerpt: `[${analysis.severity.toUpperCase()} tone issue] ${analysis.description}. Excerpt: ${analysis.excerpt.substring(0, 400)}`,
        ...NO_PRICE_DATA,
      });
    } catch (e) {
      // Non-critical — LLM analysis failed
    }
  }

  return results;
}

// ============ DEDUPLICATION ============

async function isAlreadyFlagged(
  db: any,
  tenantId: number,
  ghlContactId: string | null,
  triggerRule: string,
  teamMemberId?: number | null
): Promise<boolean> {
  // For team-level signals (no ghlContactId), deduplicate by teamMemberId + rule
  if (!ghlContactId && teamMemberId) {
    const existingTeamSignal = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, tenantId),
          eq(opportunities.teamMemberId, teamMemberId),
          sql`JSON_CONTAINS(${opportunities.triggerRules}, ${JSON.stringify(triggerRule)})`,
          sql`(${opportunities.status} = 'active' OR (${opportunities.status} IN ('handled', 'dismissed') AND ${opportunities.resolvedAt} > DATE_SUB(NOW(), INTERVAL 7 DAY)))`
        )
      )
      .limit(1);
    return existingTeamSignal.length > 0;
  }

  if (!ghlContactId) return false;

  // Check 1: Same contact + same rule — active or recently handled/dismissed
  const existingSameRule = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.ghlContactId, ghlContactId),
        sql`JSON_CONTAINS(${opportunities.triggerRules}, ${JSON.stringify(triggerRule)})`,
        // Don't re-flag if active, or handled/dismissed in last 30 days
        sql`(${opportunities.status} = 'active' OR (${opportunities.status} IN ('handled', 'dismissed') AND ${opportunities.resolvedAt} > DATE_SUB(NOW(), INTERVAL 30 DAY)))`
      )
    )
    .limit(1);

  if (existingSameRule.length > 0) return true;

  // Check 2: Same contact dismissed as "not_a_deal" or "false_positive" with ANY rule
  // in the last 60 days — if the owner said this contact is not a deal, don't re-flag
  // with a different rule either (e.g., don't flag "price_stated" after dismissing "motivated_one_and_done")
  const dismissedContact = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.ghlContactId, ghlContactId),
        eq(opportunities.status, "dismissed"),
        sql`${opportunities.dismissReason} IN ('not_a_deal', 'false_positive')`,
        sql`${opportunities.resolvedAt} > DATE_SUB(NOW(), INTERVAL 60 DAY)`
      )
    )
    .limit(1);

  return dismissedContact.length > 0;
}

// ============ MAIN DETECTION LOOP ============

export async function runOpportunityDetection(tenantId?: number): Promise<{ detected: number; errors: number }> {
  const result = { detected: 0, errors: 0 };

  // When called manually (with specific tenantId), use high priority to bypass circuit breaker
  // When called by background scheduler (no tenantId), respect circuit breaker
  const isManualTrigger = !!tenantId;
  const priority = isManualTrigger ? "high" : "normal";
  if (!ghlCircuitBreaker.canProceed(priority)) {
    const status = ghlCircuitBreaker.getStatus();
    console.log(`[OpportunityDetection] Circuit breaker is ${status.state} — skipping detection run (cooldown: ${Math.round(status.cooldownRemainingMs / 1000)}s remaining)`);
    return result;
  }

  const db = await getDb();
  if (!db) return result;

  try {
    let tenantsToScan: Array<{ id: number; name: string }>;
    if (tenantId) {
      tenantsToScan = [{ id: tenantId, name: "specified" }];
    } else {
      const allTenants = await getTenantsWithCrm();
      tenantsToScan = allTenants.map(t => ({ id: t.id, name: t.name }));
    }

    for (const tenant of tenantsToScan) {
      try {
        await scanTenant(db, tenant.id, result);
        // Build creds for re-evaluation (SMS price scanning needs GHL API access)
        const allTenantsForCreds = await getTenantsWithCrm();
        const tenantForCreds = allTenantsForCreds.find(t => t.id === tenant.id);
        let reEvalCreds: GHLCredentials | null = null;
        if (tenantForCreds) {
          const cfg = parseCrmConfig(tenantForCreds);
          if (cfg.ghlApiKey && cfg.ghlLocationId) {
            reEvalCreds = { apiKey: cfg.ghlApiKey, locationId: cfg.ghlLocationId, tenantId: tenantForCreds.id, isOAuth: false };
          }
        }
        // After scanning for new opportunities, re-evaluate existing active ones
        const refreshed = await reEvaluateActiveOpportunities(db, tenant.id, reEvalCreds);
        if (refreshed > 0) {
          console.log(`[OpportunityDetection] Refreshed ${refreshed} active opportunity summaries for tenant ${tenant.id}`);
        }
      } catch (tenantError) {
        console.error(`[OpportunityDetection] Error scanning tenant ${tenant.id}:`, tenantError);
        result.errors++;
      }
    }
  } catch (error) {
    console.error("[OpportunityDetection] Fatal error:", error);
    result.errors++;
  }

  console.log(`[OpportunityDetection] Scan complete. Detected: ${result.detected}, Errors: ${result.errors}`);
  return result;
}

// ============ DYNAMIC RE-EVALUATION ============
// Refreshes active opportunity summaries with the latest call history, pipeline data, and pricing

async function reEvaluateActiveOpportunities(db: any, tenantId: number, creds: GHLCredentials | null = null): Promise<number> {
  let refreshed = 0;
  try {
    // Get all active opportunities for this tenant
    const activeOpps = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, tenantId),
          eq(opportunities.status, "active")
        )
      );

    if (activeOpps.length === 0) return 0;
    console.log(`[OpportunityDetection] Re-evaluating ${activeOpps.length} active opportunities for tenant ${tenantId}`);

    for (const opp of activeOpps) {
      try {
        // Build a DetectedOpportunity-like object from the stored data
        const detection: DetectedOpportunity = {
          tier: opp.tier as "missed" | "warning" | "possible",
          triggerRules: opp.triggerRules || [],
          priorityScore: opp.priorityScore,
          contactName: opp.contactName,
          contactPhone: opp.contactPhone,
          propertyAddress: opp.propertyAddress,
          ghlContactId: opp.ghlContactId,
          ghlOpportunityId: opp.ghlOpportunityId,
          ghlPipelineStageId: opp.ghlPipelineStageId,
          ghlPipelineStageName: opp.ghlPipelineStageName,
          relatedCallId: opp.relatedCallId,
          teamMemberId: opp.teamMemberId,
          teamMemberName: opp.teamMemberName,
          assignedTo: opp.assignedTo,
          detectionSource: opp.detectionSource as any,
          lastActivityAt: opp.lastActivityAt,
          lastStageChangeAt: opp.lastStageChangeAt,
          transcriptExcerpt: "",
          ...NO_PRICE_DATA,
        };

        // Fetch the latest transcript excerpt from the most recent call
        if (opp.ghlContactId) {
          const latestCall = await db
            .select({
              transcript: calls.transcript,
              callTimestamp: calls.callTimestamp,
            })
            .from(calls)
            .where(
              and(
                eq(calls.tenantId, tenantId),
                eq(calls.ghlContactId, opp.ghlContactId),
                sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
              )
            )
            .orderBy(sql`${calls.callTimestamp} DESC`)
            .limit(1);

          if (latestCall.length > 0) {
            detection.transcriptExcerpt = latestCall[0].transcript.substring(0, 500);
            // Update lastActivityAt if there's a newer call
            if (latestCall[0].callTimestamp && (!detection.lastActivityAt || new Date(latestCall[0].callTimestamp) > new Date(detection.lastActivityAt))) {
              detection.lastActivityAt = latestCall[0].callTimestamp;
            }
            // Extract prices from latest transcript
            const prices = await extractPricesFromTranscriptLLM(latestCall[0].transcript);
            detection.ourOffer = prices.ourOffer;
            detection.sellerAsk = prices.sellerAsk;
            detection.priceGap = prices.priceGap;
          }
        }

        // Also scan GHL SMS conversations for price data (negotiations often happen over text)
        if (creds && detection.ghlContactId && (!detection.ourOffer || !detection.sellerAsk)) {
          try {
            const convSearch = await ghlFetch(
              creds,
              `/conversations/search?locationId=${creds.locationId}&contactId=${detection.ghlContactId}`
            );
            const convList = convSearch.conversations || [];
            if (convList.length > 0) {
              const messages = await fetchConversationMessages(creds, convList[0].id, 30);
              const smsText = messages
                .filter((m: GHLMessageDetail) => m.body && m.body.trim())
                .map((m: GHLMessageDetail) => {
                  const prefix = m.direction === "outbound" ? "[our team]:" : "[seller]:";
                  return `${prefix} ${m.body}`;
                })
                .join("\n");
              if (smsText) {
                const smsPrices = await extractPricesFromTranscriptLLM(smsText);
                if (smsPrices.ourOffer) detection.ourOffer = smsPrices.ourOffer;
                if (smsPrices.sellerAsk) detection.sellerAsk = smsPrices.sellerAsk;
                if (detection.ourOffer && detection.sellerAsk) {
                  detection.priceGap = Math.abs(detection.sellerAsk - detection.ourOffer);
                }
              }
            }
          } catch (smsErr) {
            // Non-critical
          }
        }

        // Re-generate the AI reason with full timeline context
        const { reason, suggestion, missedItems } = await generateAIReason(detection, db, tenantId);

        // Only update if the reason actually changed meaningfully
        if (reason !== opp.reason) {
          await db.update(opportunities)
            .set({
              reason,
              suggestion,
              missedItems: missedItems && missedItems.length > 0 ? missedItems : undefined,
              lastActivityAt: detection.lastActivityAt,
            })
            .where(eq(opportunities.id, opp.id));
          refreshed++;
        }
      } catch (oppError) {
        console.error(`[OpportunityDetection] Error re-evaluating opportunity ${opp.id}:`, oppError);
      }
    }

    if (refreshed > 0) {
      console.log(`[OpportunityDetection] Refreshed ${refreshed}/${activeOpps.length} opportunity summaries for tenant ${tenantId}`);
    }
  } catch (error) {
    console.error(`[OpportunityDetection] Error in re-evaluation for tenant ${tenantId}:`, error);
  }
  return refreshed;
}

async function scanTenant(
  db: any,
  tenantId: number,
  result: { detected: number; errors: number }
): Promise<void> {
  // Get tenant CRM credentials
  const allTenants = await getTenantsWithCrm();
  const tenant = allTenants.find(t => t.id === tenantId);
  if (!tenant) return;

  const config = parseCrmConfig(tenant);
  // Load credentials: OAuth tokens first, then legacy API key
  const pollingCreds = await loadGHLCredentials(tenant.id, tenant.name, config);
  if (!pollingCreds) return;

  const creds: GHLCredentials = {
    apiKey: pollingCreds.apiKey,
    locationId: pollingCreds.locationId,
    tenantId: tenant.id,
    isOAuth: pollingCreds.isOAuth,
  };

  // Set tenant-specific stage classification if configured
  setTenantStageConfig(config.stageClassification || null);

  const detections: DetectedOpportunity[] = [];

  // Build GHL user ID → team member mapping once per tenant scan
  const ghlMap = await getGhlUserIdMap(tenantId);
  console.log(`[OpportunityDetection] GHL user ID map: ${ghlMap.size} mapped team members for tenant ${tenantId}`);

  // ========== PHASE 1: GHL PIPELINE SCAN ==========
  console.log(`[OpportunityDetection] Phase 1: Scanning GHL pipelines for tenant ${tenantId}`);

  try {
    const pipelines = await fetchPipelines(creds);
    
    // Find the main acquisition pipeline using tenant's configured name, or smart-match
    const pipelineSearchName = config.dispoPipelineName || "sales process";
    const salesPipeline = pipelines.find(p => p.name.toLowerCase().includes(pipelineSearchName.toLowerCase()))
      || pipelines.find(p => {
        const lower = p.name.toLowerCase();
        return lower.includes("sales") || lower.includes("acquisition") || lower.includes("deal") || lower.includes("main");
      });
    
    if (salesPipeline) {
      // Build stage name lookup
      const stageMap = new Map<string, string>();
      for (const stage of salesPipeline.stages) {
        stageMap.set(stage.id, stage.name);
      }

      // Scan all stages for pipeline-based rules
      const allOpps = await fetchPipelineOpportunities(creds, salesPipeline.id, undefined, 200);
      
      for (const opp of allOpps) {
        const stageName = stageMap.get(opp.pipelineStageId) || "Unknown";

        // GLOBAL SUPPRESSION: Skip leads in terminal/closed stages
        // Under Contract, Purchased, Closed Won = deal is done, no signals needed
        // 1 Year Follow Up with proper DQ = properly disqualified, not a missed opportunity
        const lowerStage = stageName.toLowerCase();
        if (
          lowerStage.includes("under contract") ||
          lowerStage.includes("purchased") ||
          lowerStage.includes("closed won") ||
          lowerStage.includes("closed lost") ||
          lowerStage.includes("agreement not closed")
        ) {
          continue; // Terminal stage — no opportunity signals needed
        }

        // DQ SUPPRESSION: If the lead is in a follow-up stage AND the last call was a proper DQ,
        // this is a properly disqualified lead, not a missed opportunity.
        // Examples: Arthur Stuck in "1 Year Follow Up" after being DQ'd for not being in buy box.
        if (classifyStage(stageName) === "follow_up" || classifyStage(stageName) === "dead") {
          const lastCallForOpp = await db
            .select({ classification: calls.classification, callOutcome: calls.callOutcome, duration: calls.duration })
            .from(calls)
            .where(
              and(
                eq(calls.tenantId, tenantId),
                eq(calls.ghlContactId, opp.contactId)
              )
            )
            .orderBy(desc(calls.callTimestamp))
            .limit(1);

          if (lastCallForOpp.length > 0) {
            const lastCall = lastCallForOpp[0];
            const dqOutcomes = ["not_interested", "not_selling", "wrong_number", "do_not_call", "dnc", "dead", "disqualified", "not_in_area", "not_in_buybox"];
            if (lastCall.callOutcome && dqOutcomes.includes(lastCall.callOutcome.toLowerCase())) {
              continue; // Properly DQ'd lead in follow-up/dead stage — not a missed opportunity
            }
          }
        }

        // Rule 1: Backward movement — DISABLED (too noisy without GHL stage history)
        // Will revisit once we can reliably determine prior stage
        // const backward = await detectBackwardMovement(opp, stageName, db, tenantId, ghlMap);
        // if (backward) detections.push(backward);

        // Rule 4: Offer no follow-up
        const offerStale = await detectOfferNoFollowUp(opp, stageName, db, tenantId, ghlMap, creds);
        if (offerStale) detections.push(offerStale);

        // Rule 5: New lead SLA breach
        const slaBreach = await detectNewLeadSLABreach(opp, stageName, db, tenantId, ghlMap);
        if (slaBreach) detections.push(slaBreach);

        // Rule 8: Stale active stage
        const stale = await detectStaleActiveStage(opp, stageName, db, tenantId, ghlMap, creds);
        if (stale) detections.push(stale);

        // Rule 9: Dead with signals
        const deadSignals = await detectDeadWithSignals(opp, stageName, db, tenantId, ghlMap);
        if (deadSignals) detections.push(deadSignals);

        // Rule 10: Walkthrough no offer
        const walkthrough = await detectWalkthroughNoOffer(opp, stageName, db, tenantId, ghlMap, creds);
        if (walkthrough) detections.push(walkthrough);

        // Rule 20: Skipped walkthrough — went straight to offer
        const skippedWalk = await detectSkippedWalkthrough(opp, stageName, salesPipeline.stages, db, tenantId, ghlMap, creds);
        if (skippedWalk) detections.push(skippedWalk);
      }
    }

    // Also check Follow Up pipeline for inbound signals
    const followUpPipeline = pipelines.find(p => p.name.toLowerCase().includes("follow up"));
    if (followUpPipeline) {
      const followUpStageMap = new Map<string, string>();
      for (const stage of followUpPipeline.stages) {
        followUpStageMap.set(stage.id, stage.name);
      }

      // We'll use conversations to detect inbound from follow-up leads
      // Build a set of follow-up contactIds for cross-referencing
      const followUpOpps = await fetchPipelineOpportunities(creds, followUpPipeline.id, undefined, 100);
      const followUpContactMap = new Map<string, { opp: GHLPipelineOpportunity; stageName: string }>();
      for (const opp of followUpOpps) {
        const stageName = followUpStageMap.get(opp.pipelineStageId) || "Unknown";
        followUpContactMap.set(opp.contactId, { opp, stageName });
      }

      // Note: backward movement check only runs on Sales Process pipeline
      // Follow Up pipeline leads are expected to be in follow-up stages
    }
  } catch (pipelineError) {
    console.error(`[OpportunityDetection] Pipeline scan error:`, pipelineError);
    result.errors++;
  }

  // ========== PHASE 2: CONVERSATION SCAN ==========
  console.log(`[OpportunityDetection] Phase 2: Scanning recent conversations for tenant ${tenantId}`);

  // Reuse pipeline data from Phase 1 — build contactOppMap from already-fetched pipelines
  const contactOppMap = new Map<string, { opp: GHLPipelineOpportunity; stageName: string }>();

  try {
    // Fetch pipelines once for cross-referencing (lightweight — just Sales Process + Follow Up)
    const pipelinesForConv = await fetchPipelines(creds);
    const pipelineSearchNameConv = config.dispoPipelineName || "sales process";
    const salesPipelineConv = pipelinesForConv.find(p => p.name.toLowerCase().includes(pipelineSearchNameConv.toLowerCase()))
      || pipelinesForConv.find(p => {
        const lower = p.name.toLowerCase();
        return lower.includes("sales") || lower.includes("acquisition") || lower.includes("deal") || lower.includes("main");
      });
    const followUpPipelineConv = pipelinesForConv.find(p => p.name.toLowerCase().includes("follow up"));
    
    for (const pipeline of [salesPipelineConv, followUpPipelineConv].filter(Boolean) as any[]) {
      const stageMap = new Map<string, string>();
      for (const stage of pipeline.stages) {
        stageMap.set(stage.id, stage.name);
      }
      const opps = await fetchPipelineOpportunities(creds, pipeline.id, undefined, 100);
      for (const opp of opps) {
        contactOppMap.set(opp.contactId, { opp, stageName: stageMap.get(opp.pipelineStageId) || "Unknown" });
      }
    }

    const conversations = await fetchRecentConversations(creds, 50);

    for (const conv of conversations) {
      const oppInfo = contactOppMap.get(conv.contactId);

      // GLOBAL SUPPRESSION: Skip contacts in terminal/closed pipeline stages
      if (oppInfo) {
        const convStageLower = oppInfo.stageName.toLowerCase();
        if (
          convStageLower.includes("under contract") ||
          convStageLower.includes("purchased") ||
          convStageLower.includes("closed won") ||
          convStageLower.includes("closed lost") ||
          convStageLower.includes("agreement not closed")
        ) {
          continue; // Terminal stage — no opportunity signals needed
        }
      }

      // Rule 2: Repeat inbound
      const repeat = await detectRepeatInbound(conv, creds, db, tenantId, ghlMap, oppInfo?.opp || null);
      if (repeat) detections.push(repeat);

      // Rule 3: Follow-up inbound ignored
      const followUpIgnored = await detectFollowUpInboundIgnored(
        conv,
        oppInfo?.opp || null,
        oppInfo?.stageName || null,
        db,
        tenantId,
        ghlMap,
        creds
      );
      if (followUpIgnored) detections.push(followUpIgnored);

      // Rule 14: Active negotiation in follow-up stage
      const activeNegotiation = await detectActiveNegotiationInFollowUp(
        conv,
        oppInfo?.opp || null,
        oppInfo?.stageName || null,
        creds,
        db,
        tenantId,
        ghlMap
      );
      if (activeNegotiation) detections.push(activeNegotiation);

      // Rule 18: SMS deal lost — seller communicated they sold/went with another buyer
      const smsLost = await detectSMSDealLost(
        conv,
        oppInfo?.opp || null,
        oppInfo?.stageName || null,
        creds,
        db,
        tenantId,
        ghlMap
      );
      if (smsLost) detections.push(smsLost);
    }
  } catch (convError) {
    console.error(`[OpportunityDetection] Conversation scan error:`, convError);
    result.errors++;
  }

  // ========== PHASE 3: TRANSCRIPT-ENRICHED DETECTION ==========
  console.log(`[OpportunityDetection] Phase 3: Transcript-enriched detection for tenant ${tenantId}`);

  // Build a set of terminal-stage contactIds for suppression in transcript rules
  const terminalStageContactIds = new Set<string>();
  for (const [contactId, { stageName: sn }] of Array.from(contactOppMap.entries())) {
    const sl = sn.toLowerCase();
    if (sl.includes("under contract") || sl.includes("purchased") || sl.includes("closed won") || sl.includes("closed lost") || sl.includes("agreement not closed")) {
      terminalStageContactIds.add(contactId);
    }
  }

  try {
    // Rule 6: Price stated no follow-up (now checks appointments + pipeline)
    const priceDetections = await detectPriceStatedNoFollowUp(db, tenantId, creds, contactOppMap);
    // Filter out detections for contacts in terminal stages
    const filteredPriceDetections = priceDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredPriceDetections);

    // Rule 7: Motivated one-and-done (now checks GHL pipeline progression + appointments)
    const motivatedDetections = await detectMotivatedOneDone(db, tenantId, creds, contactOppMap);
    const filteredMotivatedDetections = motivatedDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredMotivatedDetections);

    // Rule 11: Duplicate property
    const dupDetections = await detectDuplicateProperty(db, tenantId, ghlMap);
    detections.push(...dupDetections);

    // Rule 12: Missed callback (now also checks GHL conversation for outbound follow-up)
    const callbackDetections = await detectMissedCallback(db, tenantId, creds);
    detections.push(...callbackDetections);

    // Rule 13: High talk-time DQ
    const talkTimeDetections = await detectHighTalkTimeDQ(db, tenantId);
    detections.push(...talkTimeDetections);

    // Rule 15: Timeline offered, no commitment set
    const timelineDetections = await detectTimelineNoCommitment(db, tenantId, creds);
    detections.push(...timelineDetections);

    // Rule 16: Post-walkthrough ghosting — seller went silent after walkthrough
    const ghostingDetections = await detectPostWalkthroughGhosting(db, tenantId, creds, contactOppMap);
    detections.push(...ghostingDetections);

    // Rule 17: Short call actionable intel — scan too_short calls for emails, referrals, callbacks
    const shortCallDetections = await detectShortCallActionableIntel(db, tenantId, creds);
    detections.push(...shortCallDetections);
    if (shortCallDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 17: Found ${shortCallDetections.length} short calls with actionable intel`);
    }

    // Rule 19: Delayed scheduled callback — agent acknowledged being late
    const delayedCallbackDetections = await detectDelayedScheduledCallback(db, tenantId, creds);
    detections.push(...delayedCallbackDetections);
    if (delayedCallbackDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 19: Found ${delayedCallbackDetections.length} delayed scheduled callbacks`);
    }

    // Rule 21: Deal fell through — seller mentions previous deal/buyer fell through
    const dealFellDetections = await detectDealFellThrough(db, tenantId, creds, contactOppMap);
    const filteredDealFellDetections = dealFellDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredDealFellDetections);
    if (filteredDealFellDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 21: Found ${filteredDealFellDetections.length} deals that fell through`);
    }

    // ===== NEW RULES =====

    // Rule 22: Deal lost on call — seller explicitly said they sold/listed/went with competitor
    const dealLostOnCallDetections = await detectDealLostOnCall(db, tenantId, creds);
    const filteredDealLostOnCall = dealLostOnCallDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredDealLostOnCall);
    if (filteredDealLostOnCall.length > 0) {
      console.log(`[OpportunityDetection] Rule 22: Found ${filteredDealLostOnCall.length} deals lost on call`);
    }

    // Rule 23: Bad call performance — D/F grade or score below 40
    const badCallDetections = await detectBadCallPerformance(db, tenantId);
    detections.push(...badCallDetections);
    if (badCallDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 23: Found ${badCallDetections.length} bad call performances`);
    }

    // Rule 24: Extreme motivation — foreclosure, divorce, death, tax sale, etc.
    const extremeMotivationDetections = await detectExtremeMotivation(db, tenantId);
    const filteredExtremeMotivation = extremeMotivationDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredExtremeMotivation);
    if (filteredExtremeMotivation.length > 0) {
      console.log(`[OpportunityDetection] Rule 24: Found ${filteredExtremeMotivation.length} extreme motivation signals`);
    }

    // Rule 25: Close on price — offer and ask within $30k
    const closeOnPriceDetections = await detectCloseOnPrice(db, tenantId);
    const filteredCloseOnPrice = closeOnPriceDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredCloseOnPrice);
    if (filteredCloseOnPrice.length > 0) {
      console.log(`[OpportunityDetection] Rule 25: Found ${filteredCloseOnPrice.length} close-on-price opportunities`);
    }

    // Rule 26: Seller re-engagement — follow-up lead came back after 30+ days
    const reEngagementDetections = await detectSellerReEngagement(db, tenantId, creds);
    detections.push(...reEngagementDetections);
    if (reEngagementDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 26: Found ${reEngagementDetections.length} seller re-engagements`);
    }

    // Rule 27: Seller texted number — proactively shared contact info via SMS
    const sellerTextedDetections = await detectSellerTextedNumber(db, tenantId, creds);
    detections.push(...sellerTextedDetections);
    if (sellerTextedDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 27: Found ${sellerTextedDetections.length} sellers who texted contact info`);
    }

    // Rule 28: Seller out of agreement — listing expired, agent contract ended, etc.
    const outOfAgreementDetections = await detectSellerOutOfAgreement(db, tenantId);
    const filteredOutOfAgreement = outOfAgreementDetections.filter(d => !d.ghlContactId || !terminalStageContactIds.has(d.ghlContactId));
    detections.push(...filteredOutOfAgreement);
    if (filteredOutOfAgreement.length > 0) {
      console.log(`[OpportunityDetection] Rule 28: Found ${filteredOutOfAgreement.length} sellers out of agreement`);
    }

    // Rule 29: Bad temperament — unprofessional tone detected on call
    const badTemperamentDetections = await detectBadTemperament(db, tenantId);
    detections.push(...badTemperamentDetections);
    if (badTemperamentDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 29: Found ${badTemperamentDetections.length} bad temperament signals`);
    }
  } catch (transcriptError) {
    console.error(`[OpportunityDetection] Transcript scan error:`, transcriptError);
    result.errors++;
  }

  // ========== PHASE 3.5B: TEAM-LEVEL DETECTION (not contact-specific) ==========
  try {
    // Rule 30: AI coach inactive — team member hasn't used coach in 7+ days
    const coachInactiveDetections = await detectAICoachInactive(db, tenantId);
    detections.push(...coachInactiveDetections);
    if (coachInactiveDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 30: Found ${coachInactiveDetections.length} inactive AI coach users`);
    }

    // Rule 31: Consistent call weakness — same category low across 5+ calls
    const weaknessDetections = await detectConsistentCallWeakness(db, tenantId);
    detections.push(...weaknessDetections);
    if (weaknessDetections.length > 0) {
      console.log(`[OpportunityDetection] Rule 31: Found ${weaknessDetections.length} consistent call weaknesses`);
    }
  } catch (teamError) {
    console.error(`[OpportunityDetection] Team-level detection error:`, teamError);
    result.errors++;
  }

  // ========== PHASE 3.5: AUTO-RESOLVE TERMINAL STAGE OPPORTUNITIES ==========
  // If a contact has moved to Under Contract, Purchased, etc., auto-resolve any active opportunities
  if (terminalStageContactIds.size > 0) {
    try {
      const terminalContactArray = Array.from(terminalStageContactIds);
      // Process in batches to avoid SQL limits
      for (let i = 0; i < terminalContactArray.length; i += 50) {
        const batch = terminalContactArray.slice(i, i + 50);
        const autoResolved = await db.update(opportunities)
          .set({
            status: "handled",
            resolvedAt: new Date(),
          })
          .where(
            and(
              eq(opportunities.tenantId, tenantId),
              eq(opportunities.status, "active"),
              inArray(opportunities.ghlContactId, batch)
            )
          );
      }
      console.log(`[OpportunityDetection] Auto-resolved opportunities for ${terminalContactArray.length} contacts in terminal stages`);
    } catch (autoResolveErr) {
      console.error(`[OpportunityDetection] Error auto-resolving terminal stage opportunities:`, autoResolveErr);
    }
  }

  // ========== PHASE 4: DEDUPLICATE & SAVE ==========
  console.log(`[OpportunityDetection] Phase 4: Saving ${detections.length} potential detections for tenant ${tenantId}`);

  // DAILY CAP: Only allow ~5 new signals per tenant per day
  // Check how many were already created today
  const DAILY_SIGNAL_CAP = 5;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [todayCountResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        gte(opportunities.createdAt, todayStart)
      )
    );
  const alreadyCreatedToday = Number(todayCountResult?.count || 0);
  const remainingSlots = Math.max(0, DAILY_SIGNAL_CAP - alreadyCreatedToday);

  if (remainingSlots === 0) {
    console.log(`[OpportunityDetection] Daily cap reached (${DAILY_SIGNAL_CAP}) for tenant ${tenantId}. Skipping new signals.`);
    return;
  }

  // Sort detections by priority (highest first) so we save the most important ones
  // Tier priority: missed > warning > possible
  const tierWeight: Record<string, number> = { missed: 300, warning: 200, possible: 100 };
  detections.sort((a, b) => {
    const aScore = (tierWeight[a.tier] || 0) + a.priorityScore;
    const bScore = (tierWeight[b.tier] || 0) + b.priorityScore;
    return bScore - aScore;
  });

  // In-memory dedup: prevent same contact+rule from being saved multiple times in one scan
  const seenInThisScan = new Set<string>();
  let savedThisScan = 0;

  for (const detection of detections) {
    // Enforce daily cap
    if (savedThisScan >= remainingSlots) {
      console.log(`[OpportunityDetection] Reached remaining daily slots (${remainingSlots}) for tenant ${tenantId}. Stopping.`);
      break;
    }

    try {
      // Skip if already flagged
      const primaryRule = detection.triggerRules[0];
      const dedupKey = `${detection.ghlContactId || detection.contactPhone || detection.contactName}::${primaryRule}`;
      if (seenInThisScan.has(dedupKey)) continue;
      seenInThisScan.add(dedupKey);

      if (await isAlreadyFlagged(db, tenantId, detection.ghlContactId, primaryRule, detection.teamMemberId)) {
        continue;
      }

      // ===== PRICE GAP LOGIC =====
      // If we have price data, enrich the detection from ALL transcripts for this contact
      if (detection.ghlContactId && (!detection.ourOffer || !detection.sellerAsk)) {
        try {
          const allTranscripts = await db
            .select({ transcript: calls.transcript })
            .from(calls)
            .where(
              and(
                eq(calls.tenantId, tenantId),
                eq(calls.ghlContactId, detection.ghlContactId),
                sql`${calls.transcript} IS NOT NULL AND ${calls.transcript} != ''`
              )
            )
            .orderBy(desc(calls.callTimestamp))
            .limit(5);

          // Merge price data from all transcripts (latest takes priority)
          for (const row of allTranscripts) {
            const prices = await extractPricesFromTranscriptLLM(row.transcript);
            if (!detection.ourOffer && prices.ourOffer) detection.ourOffer = prices.ourOffer;
            if (!detection.sellerAsk && prices.sellerAsk) detection.sellerAsk = prices.sellerAsk;
          }

          // Also scan GHL SMS conversations for price mentions
          // Real negotiations often happen over text, not just phone calls
          if (creds && (!detection.ourOffer || !detection.sellerAsk)) {
            try {
              const convSearch = await ghlFetch(
                creds,
                `/conversations/search?locationId=${creds.locationId}&contactId=${detection.ghlContactId}`
              );
              const convList = convSearch.conversations || [];
              if (convList.length > 0) {
                const messages = await fetchConversationMessages(creds, convList[0].id, 30);
                // Combine all message bodies into a single text for price extraction
                const smsText = messages
                  .filter((m: GHLMessageDetail) => m.body && m.body.trim())
                  .map((m: GHLMessageDetail) => {
                    const prefix = m.direction === "outbound" ? "[our team]:" : "[seller]:";
                    return `${prefix} ${m.body}`;
                  })
                  .join("\n");
                if (smsText) {
                const smsPrices = await extractPricesFromTranscriptLLM(smsText);
                // SMS prices override transcript prices since SMS negotiations are more recent/explicit
                if (smsPrices.ourOffer) detection.ourOffer = smsPrices.ourOffer;
                if (smsPrices.sellerAsk) detection.sellerAsk = smsPrices.sellerAsk;
              }
            }
          } catch (smsErr) {
            // Non-critical — continue without SMS price enrichment
          }
        }

          // Recalculate gap
          if (detection.ourOffer && detection.sellerAsk) {
            detection.priceGap = Math.abs(detection.sellerAsk - detection.ourOffer);
          }
        } catch (err) {
          // Non-critical — continue without price enrichment
        }
      }

      // PRICE GAP FILTER: Skip signals entirely if the price gap is too large to be viable.
      // Corey's feedback: "if we are 120k off the price, it is not worth a look"
      // Rule: Skip if gap > $100k OR gap > 50% of seller's asking price
      const LARGE_GAP_THRESHOLD = 100_000;
      if (detection.priceGap && detection.sellerAsk) {
        const gapPercent = detection.priceGap / detection.sellerAsk;
        if (detection.priceGap >= LARGE_GAP_THRESHOLD || gapPercent >= 0.5) {
          console.log(`[Signals] Skipping ${detection.contactName}: price gap $${detection.priceGap.toLocaleString()} (${(gapPercent * 100).toFixed(0)}% of ask) exceeds threshold`);
          continue; // Skip this signal entirely
        }
      }

      // Generate AI reason
      const { reason, suggestion, missedItems } = await generateAIReason(detection, db, tenantId);

      // Enrich with property address from calls if missing
      let propertyAddress = detection.propertyAddress;
      if (!propertyAddress && detection.ghlContactId) {
        const contactCall = await db
          .select({ propertyAddress: calls.propertyAddress })
          .from(calls)
          .where(
            and(
              eq(calls.tenantId, tenantId),
              eq(calls.ghlContactId, detection.ghlContactId),
              sql`${calls.propertyAddress} IS NOT NULL AND ${calls.propertyAddress} != ''`
            )
          )
          .limit(1);
        if (contactCall.length > 0) {
          propertyAddress = contactCall[0].propertyAddress;
        }
      }

      // Enrich with team member from calls if missing
      let teamMemberId = detection.teamMemberId;
      let teamMemberName = detection.teamMemberName;
      if (!teamMemberId && detection.ghlContactId) {
        const contactCall = await db
          .select({ teamMemberId: calls.teamMemberId, teamMemberName: calls.teamMemberName })
          .from(calls)
          .where(
            and(
              eq(calls.tenantId, tenantId),
              eq(calls.ghlContactId, detection.ghlContactId)
            )
          )
          .orderBy(desc(calls.callTimestamp))
          .limit(1);
        if (contactCall.length > 0) {
          teamMemberId = contactCall[0].teamMemberId;
          teamMemberName = contactCall[0].teamMemberName;
        }
      }

      // Final fallback: resolve from GHL assignedTo → team member mapping
      if (!teamMemberId && detection.assignedTo) {
        const resolved = resolveGhlAssignee(detection.assignedTo, ghlMap);
        if (resolved.teamMemberId) {
          teamMemberId = resolved.teamMemberId;
          teamMemberName = resolved.teamMemberName;
        }
      }

      await db.insert(opportunities).values({
        tenantId,
        contactName: detection.contactName,
        contactPhone: detection.contactPhone,
        propertyAddress,
        ghlContactId: detection.ghlContactId,
        ghlOpportunityId: detection.ghlOpportunityId,
        ghlPipelineStageId: detection.ghlPipelineStageId,
        ghlPipelineStageName: detection.ghlPipelineStageName,
        tier: detection.tier,
        priorityScore: Math.min(detection.priorityScore, 100),
        triggerRules: detection.triggerRules,
        reason,
        suggestion,
        missedItems: missedItems && missedItems.length > 0 ? missedItems : undefined,
        detectionSource: detection.detectionSource,
        relatedCallId: detection.relatedCallId,
        teamMemberId,
        teamMemberName,
        assignedTo: detection.assignedTo,
        ourOffer: detection.ourOffer,
        sellerAsk: detection.sellerAsk,
        priceGap: detection.priceGap,
        lastActivityAt: detection.lastActivityAt,
        lastStageChangeAt: detection.lastStageChangeAt,
      });

      result.detected++;
      savedThisScan++;
    } catch (saveError) {
      console.error(`[OpportunityDetection] Error saving detection:`, saveError);
      result.errors++;
    }
  }
}
