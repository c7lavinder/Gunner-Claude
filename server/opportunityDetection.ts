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
import { getDb } from "./db";
import { calls, callGrades, opportunities, teamMembers } from "../drizzle/schema";
import { eq, and, desc, gte, isNull, inArray, sql, not, lt } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { getTenantsWithCrm, parseCrmConfig, type TenantCrmConfig } from "./tenant";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

// ============ TYPES ============

interface GHLCredentials {
  apiKey: string;
  locationId: string;
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
  detectionSource: "pipeline" | "conversation" | "transcript" | "hybrid";
  lastActivityAt: Date | null;
  lastStageChangeAt: Date | null;
  transcriptExcerpt: string;
}

// ============ SALES PROCESS PIPELINE STAGE CLASSIFICATION ============

// TODO (S19): Move these stage classifications to a tenant-configurable table
// so each client can define their own pipeline stages and signal rules.
// For now, these defaults work for real estate flipping businesses.
// These stage names are matched case-insensitively
const ACTIVE_DEAL_STAGES = [
  "new lead", "warm leads", "sms warm leads", "hot leads",
  "pending apt", "walkthrough apt scheduled", "offer apt scheduled",
  "made offer", "under contract", "purchased"
];

const FOLLOW_UP_STAGES = [
  "1 month follow up", "4 month follow up", "1 year follow up",
  "follow up", "new offer", "new walkthrough"
];

const DEAD_STAGES = [
  "ghosted lead", "ghosted", "agreement not closed", "do not want",
  "sold", "trash"
];

function classifyStage(stageName: string): "active" | "follow_up" | "dead" | "unknown" {
  const lower = stageName.toLowerCase();
  if (ACTIVE_DEAL_STAGES.some(s => lower.includes(s.toLowerCase()))) return "active";
  if (FOLLOW_UP_STAGES.some(s => lower.includes(s.toLowerCase()))) return "follow_up";
  if (DEAD_STAGES.some(s => lower.includes(s.toLowerCase()))) return "dead";
  return "unknown";
}

function isHighValueStage(stageName: string): boolean {
  const lower = stageName.toLowerCase();
  return ["warm leads", "hot leads", "pending apt", "walkthrough apt scheduled", "offer apt scheduled", "made offer"].some(
    s => lower.includes(s.toLowerCase())
  );
}

function isOfferOrBeyond(stageName: string): boolean {
  const lower = stageName.toLowerCase();
  return ["made offer", "offer apt scheduled"].some(s => lower.includes(s.toLowerCase()));
}

function isWalkthroughStage(stageName: string): boolean {
  return stageName.toLowerCase().includes("walkthrough");
}

// ============ GHL API HELPERS ============

async function ghlFetch(creds: GHLCredentials, path: string): Promise<any> {
  const url = `${GHL_API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${creds.apiKey}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`GHL API ${response.status}: ${await response.text()}`);
  }
  return response.json();
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
  tenantId: number
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
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: "",
  };
}

// Rule 2: Repeat inbound from same seller (2+ in a week) not prioritized
async function detectRepeatInbound(
  conversation: GHLConversation,
  creds: GHLCredentials,
  db: any,
  tenantId: number
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

  // Check if team responded (outbound call after the inbound)
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

  if (responseCall.length > 0) return null; // Team responded

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
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: null,
    detectionSource: "conversation",
    lastActivityAt: new Date(conversation.lastMessageDate),
    lastStageChangeAt: null,
    transcriptExcerpt: "",
  };
}

// Rule 3: Inbound from Follow Up lead unanswered within 4 hours
async function detectFollowUpInboundIgnored(
  conversation: GHLConversation,
  opp: GHLPipelineOpportunity | null,
  stageName: string | null,
  db: any,
  tenantId: number
): Promise<DetectedOpportunity | null> {
  if (conversation.lastMessageDirection !== "inbound") return null;
  if (!stageName || classifyStage(stageName) !== "follow_up") return null;

  const lastMsgTime = new Date(conversation.lastMessageDate);
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  
  // Only flag if the inbound was more than 4 hours ago and still unanswered
  if (lastMsgTime > fourHoursAgo) return null; // Still within SLA

  // Check if there was a response
  if (conversation.unreadCount === 0) return null; // Already read/responded

  return {
    tier: "missed",
    triggerRules: ["followup_inbound_ignored"],
    priorityScore: 85,
    contactName: conversation.fullName || conversation.contactName || null,
    contactPhone: conversation.phone || null,
    propertyAddress: null,
    ghlContactId: conversation.contactId,
    ghlOpportunityId: opp?.id || null,
    ghlPipelineStageId: opp?.pipelineStageId || null,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp?.assignedTo || null,
    detectionSource: "conversation",
    lastActivityAt: lastMsgTime,
    lastStageChangeAt: null,
    transcriptExcerpt: conversation.lastMessageBody || "",
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
  tenantId: number
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
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp?.assignedTo || null,
    detectionSource: "conversation",
    lastActivityAt: lastMsgTime,
    lastStageChangeAt: opp?.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null,
    transcriptExcerpt: excerpt,
  };
}

// Rule 4: Offer made but no counter/follow-up within 48h
async function detectOfferNoFollowUp(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number
): Promise<DetectedOpportunity | null> {
  if (!isOfferOrBeyond(stageName)) return null;

  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null;
  if (!stageChangeAt) return null;

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  if (stageChangeAt > fortyEightHoursAgo) return null; // Still within window

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

  if (recentOutbound.length > 0) return null; // There was follow-up

  return {
    tier: "missed",
    triggerRules: ["offer_no_followup"],
    priorityScore: 80,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: "",
  };
}

// Rule 5: New lead with no first call within 15 min SLA
async function detectNewLeadSLABreach(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number
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
    tier: "missed",
    triggerRules: ["new_lead_sla_breach"],
    priorityScore: 70,
    contactName: opp.name || opp.contact?.name || null,
    contactPhone: opp.contact?.phone || null,
    propertyAddress: null,
    ghlContactId: opp.contactId,
    ghlOpportunityId: opp.id,
    ghlPipelineStageId: opp.pipelineStageId,
    ghlPipelineStageName: stageName,
    relatedCallId: null,
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: createdAt,
    lastStageChangeAt: null,
    transcriptExcerpt: "",
  };
}

// Rule 6: Seller stated price but no follow-up within 48h (transcript-enriched)
async function detectPriceStatedNoFollowUp(
  db: any,
  tenantId: number
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

    results.push({
      tier: "missed",
      triggerRules: ["price_stated_no_followup"],
      priorityScore: 85,
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
  tenantId: number
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

    // Check total calls to this contact
    const allCalls = await db
      .select({ id: calls.id })
      .from(calls)
      .where(
        and(
          eq(calls.tenantId, tenantId),
          eq(calls.ghlContactId, call.ghlContactId)
        )
      );

    if (allCalls.length > 1) continue; // Multiple calls exist

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
      ghlPipelineStageName: null,
      relatedCallId: call.id,
      teamMemberId: call.teamMemberId,
      teamMemberName: call.teamMemberName,
      assignedTo: null,
      detectionSource: "hybrid",
      lastActivityAt: call.callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: call.transcript.substring(0, 500),
    });
  }

  return results;
}

// Rule 8: Lead in Pending Apt/Walkthrough 5+ days with no activity
async function detectStaleActiveStage(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number
): Promise<DetectedOpportunity | null> {
  const lower = stageName.toLowerCase();
  const isStaleCandidate = lower.includes("pending apt") || lower.includes("walkthrough");
  if (!isStaleCandidate) return null;

  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : new Date(opp.updatedAt);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  
  if (stageChangeAt > fiveDaysAgo) return null; // Not stale yet

  // Check for any recent activity (calls)
  const recentActivity = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.ghlContactId, opp.contactId),
        gte(calls.callTimestamp, fiveDaysAgo)
      )
    )
    .limit(1);

  if (recentActivity.length > 0) return null; // There's been activity

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
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: "",
  };
}

// Rule 9: Lead marked dead/DQ'd but transcript had real selling signals
async function detectDeadWithSignals(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number
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
    teamMemberId: contactCalls[0]?.teamMemberId || null,
    teamMemberName: contactCalls[0]?.teamMemberName || null,
    assignedTo: opp.assignedTo || null,
    detectionSource: "hybrid",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: excerpt,
  };
}

// Rule 10: Walkthrough completed but no offer sent within 24h
async function detectWalkthroughNoOffer(
  opp: GHLPipelineOpportunity,
  stageName: string,
  db: any,
  tenantId: number
): Promise<DetectedOpportunity | null> {
  if (!isWalkthroughStage(stageName)) return null;

  const stageChangeAt = opp.lastStageChangeAt ? new Date(opp.lastStageChangeAt) : null;
  if (!stageChangeAt) return null;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (stageChangeAt > twentyFourHoursAgo) return null; // Still within window

  // Check if they've moved to offer stage or beyond — if so, no issue
  // Since we're checking the current stage and it's still walkthrough, that means no progression

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
    teamMemberId: null,
    teamMemberName: null,
    assignedTo: opp.assignedTo || null,
    detectionSource: "pipeline",
    lastActivityAt: stageChangeAt,
    lastStageChangeAt: stageChangeAt,
    transcriptExcerpt: "",
  };
}

// Rule 11: Multiple leads from same property address
async function detectDuplicateProperty(
  db: any,
  tenantId: number
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
      teamMemberId: null,
      teamMemberName: null,
      assignedTo: null,
      detectionSource: "pipeline",
      lastActivityAt: propertyCalls[0].callTimestamp,
      lastStageChangeAt: null,
      transcriptExcerpt: `${dup.count} different contacts called about this property`,
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

    results.push({
      tier: "possible",
      triggerRules: ["missed_callback_request"],
      priorityScore: 50,
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
  tenantId: number
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
    tier: "missed"
  },
  offer_no_followup: {
    label: "Offer Made — No Follow Up Logged",
    context: "An offer was made and 48+ hours have passed. No follow-up call or message has been logged since the offer.",
    tier: "missed"
  },
  new_lead_sla_breach: {
    label: "New Lead — No Call Within 15 Min",
    context: "A new lead entered the pipeline. No outbound call was logged within the 15-minute SLA window.",
    tier: "missed"
  },
  price_stated_no_followup: {
    label: "Seller Stated Price — No Follow Up Logged",
    context: "During a call, the seller mentioned a specific price they would accept. No follow-up has been logged in the 48 hours since.",
    tier: "at_risk"
  },
  motivated_one_and_done: {
    label: "Motivated Seller — Only 1 Call Attempt",
    context: "The seller showed motivation signals (life event, timeline, urgency) during the call. Only one call attempt has been logged with no follow-up in 72 hours.",
    tier: "at_risk"
  },
  stale_active_stage: {
    label: "Stale in Active Stage",
    context: "This lead has been in an active stage (Pending Apt or Walkthrough) for 5+ days. No recent activity has been logged.",
    tier: "at_risk"
  },
  dead_with_selling_signals: {
    label: "DQ'd Lead Had Selling Signals",
    context: "This lead was moved to dead/ghosted status. However, the call transcript contains selling signals such as timeline mentions, property condition details, or life events.",
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
    tier: "possible"
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
};

async function generateAIReason(detection: DetectedOpportunity): Promise<{ reason: string; suggestion: string }> {
  const ruleDesc = RULE_DESCRIPTIONS[detection.triggerRules[0]];
  const tierLabel = ruleDesc?.tier === "missed" ? "Missed (urgent)" : ruleDesc?.tier === "at_risk" ? "At Risk" : "Worth a Look";
  
  // Build a factual timeline from available data
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
  
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You write brief signal descriptions for a real estate wholesaling team's pipeline review tool.

CRITICAL RULES:
- ONLY state facts that are provided in the data below. NEVER assume or infer what happened.
- Use phrases like "no follow-up has been logged" instead of "we completely missed it" or "the team dropped the ball."
- If you don't know whether the team took action, say "no activity was logged" — do NOT say they failed or missed it.
- The tone should be neutral and informative, like a CRM status update — not accusatory or dramatic.
- Tier context: "${tierLabel}" — ${ruleDesc?.tier === "missed" ? "This appears to be a gap that needs attention." : ruleDesc?.tier === "at_risk" ? "This lead may need re-engagement." : "This is flagged for the owner to review and potentially help the team."}
- Reason: 1-2 factual sentences about what the data shows. Reference the contact name.
- Suggestion: 1 sentence with a specific next action.
- Keep it concise and professional.`
        },
        {
          role: "user",
          content: `Signal type: ${ruleDesc?.label || detection.triggerRules[0]}
What the data shows: ${ruleDesc?.context || ""}
Tier: ${tierLabel}

Facts from the system:
${facts.join("\n")}

Transcript excerpt (if available): ${detection.transcriptExcerpt ? detection.transcriptExcerpt.substring(0, 400) : "No transcript available"}

Generate JSON with "reason" and "suggestion" fields. Remember: ONLY state what the data shows, never assume.`
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
              reason: { type: "string", description: "1-2 factual sentences about what the data shows" },
              suggestion: { type: "string", description: "1 sentence specific next action" }
            },
            required: ["reason", "suggestion"],
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
    suggestion: `Review ${detection.contactName || "this lead"} and determine if follow-up is needed.`
  };
}

// ============ DEDUPLICATION ============

async function isAlreadyFlagged(
  db: any,
  tenantId: number,
  ghlContactId: string | null,
  triggerRule: string
): Promise<boolean> {
  if (!ghlContactId) return false;

  // Check if this contact already has an active or recently handled/dismissed opportunity with the same rule
  const existing = await db
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

  return existing.length > 0;
}

// ============ MAIN DETECTION LOOP ============

export async function runOpportunityDetection(tenantId?: number): Promise<{ detected: number; errors: number }> {
  const result = { detected: 0, errors: 0 };
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
  if (!config.ghlApiKey || !config.ghlLocationId) return;

  const creds: GHLCredentials = {
    apiKey: config.ghlApiKey,
    locationId: config.ghlLocationId,
  };

  const detections: DetectedOpportunity[] = [];

  // ========== PHASE 1: GHL PIPELINE SCAN ==========
  console.log(`[OpportunityDetection] Phase 1: Scanning GHL pipelines for tenant ${tenantId}`);

  try {
    const pipelines = await fetchPipelines(creds);
    
    // Find the Sales Process pipeline (main acquisition pipeline)
    const salesPipeline = pipelines.find(p => p.name.toLowerCase().includes("sales process"));
    
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

        // Rule 1: Backward movement — DISABLED (too noisy without GHL stage history)
        // Will revisit once we can reliably determine prior stage
        // const backward = await detectBackwardMovement(opp, stageName, db, tenantId);
        // if (backward) detections.push(backward);

        // Rule 4: Offer no follow-up
        const offerStale = await detectOfferNoFollowUp(opp, stageName, db, tenantId);
        if (offerStale) detections.push(offerStale);

        // Rule 5: New lead SLA breach
        const slaBreach = await detectNewLeadSLABreach(opp, stageName, db, tenantId);
        if (slaBreach) detections.push(slaBreach);

        // Rule 8: Stale active stage
        const stale = await detectStaleActiveStage(opp, stageName, db, tenantId);
        if (stale) detections.push(stale);

        // Rule 9: Dead with signals
        const deadSignals = await detectDeadWithSignals(opp, stageName, db, tenantId);
        if (deadSignals) detections.push(deadSignals);

        // Rule 10: Walkthrough no offer
        const walkthrough = await detectWalkthroughNoOffer(opp, stageName, db, tenantId);
        if (walkthrough) detections.push(walkthrough);
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
    const salesPipelineConv = pipelinesForConv.find(p => p.name.toLowerCase().includes("sales process"));
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

      // Rule 2: Repeat inbound
      const repeat = await detectRepeatInbound(conv, creds, db, tenantId);
      if (repeat) detections.push(repeat);

      // Rule 3: Follow-up inbound ignored
      const followUpIgnored = await detectFollowUpInboundIgnored(
        conv,
        oppInfo?.opp || null,
        oppInfo?.stageName || null,
        db,
        tenantId
      );
      if (followUpIgnored) detections.push(followUpIgnored);

      // Rule 14: Active negotiation in follow-up stage
      const activeNegotiation = await detectActiveNegotiationInFollowUp(
        conv,
        oppInfo?.opp || null,
        oppInfo?.stageName || null,
        creds,
        db,
        tenantId
      );
      if (activeNegotiation) detections.push(activeNegotiation);
    }
  } catch (convError) {
    console.error(`[OpportunityDetection] Conversation scan error:`, convError);
    result.errors++;
  }

  // ========== PHASE 3: TRANSCRIPT-ENRICHED DETECTION ==========
  console.log(`[OpportunityDetection] Phase 3: Transcript-enriched detection for tenant ${tenantId}`);

  try {
    // Rule 6: Price stated no follow-up
    const priceDetections = await detectPriceStatedNoFollowUp(db, tenantId);
    detections.push(...priceDetections);

    // Rule 7: Motivated one-and-done
    const motivatedDetections = await detectMotivatedOneDone(db, tenantId);
    detections.push(...motivatedDetections);

    // Rule 11: Duplicate property
    const dupDetections = await detectDuplicateProperty(db, tenantId);
    detections.push(...dupDetections);

    // Rule 12: Missed callback (now also checks GHL conversation for outbound follow-up)
    const callbackDetections = await detectMissedCallback(db, tenantId, creds);
    detections.push(...callbackDetections);

    // Rule 13: High talk-time DQ
    const talkTimeDetections = await detectHighTalkTimeDQ(db, tenantId);
    detections.push(...talkTimeDetections);

    // Rule 15: Timeline offered, no commitment set
    const timelineDetections = await detectTimelineNoCommitment(db, tenantId);
    detections.push(...timelineDetections);
  } catch (transcriptError) {
    console.error(`[OpportunityDetection] Transcript scan error:`, transcriptError);
    result.errors++;
  }

  // ========== PHASE 4: DEDUPLICATE & SAVE ==========
  console.log(`[OpportunityDetection] Phase 4: Saving ${detections.length} potential detections for tenant ${tenantId}`);

  // In-memory dedup: prevent same contact+rule from being saved multiple times in one scan
  const seenInThisScan = new Set<string>();

  for (const detection of detections) {
    try {
      // Skip if already flagged
      const primaryRule = detection.triggerRules[0];
      const dedupKey = `${detection.ghlContactId || detection.contactPhone || detection.contactName}::${primaryRule}`;
      if (seenInThisScan.has(dedupKey)) continue;
      seenInThisScan.add(dedupKey);

      if (await isAlreadyFlagged(db, tenantId, detection.ghlContactId, primaryRule)) {
        continue;
      }

      // Generate AI reason
      const { reason, suggestion } = await generateAIReason(detection);

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
        detectionSource: detection.detectionSource,
        relatedCallId: detection.relatedCallId,
        teamMemberId,
        teamMemberName,
        assignedTo: detection.assignedTo,
        lastActivityAt: detection.lastActivityAt,
        lastStageChangeAt: detection.lastStageChangeAt,
      });

      result.detected++;
    } catch (saveError) {
      console.error(`[OpportunityDetection] Error saving detection:`, saveError);
      result.errors++;
    }
  }
}
