/**
 * Opportunity Detection Engine
 * Scans calls and GHL data to detect missed, warning, and possible opportunities.
 * Runs hourly via scheduler.
 */
import { getDb } from "./db";
import { calls, callGrades, opportunities, teamMembers } from "../drizzle/schema";
import { eq, and, desc, gte, isNull, inArray, sql, not } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { getTenantsWithCrm, parseCrmConfig, type TenantCrmConfig } from "./tenant";

// ============ DETECTION RULES ============

interface DetectionResult {
  tier: "missed" | "warning" | "possible";
  triggerRules: string[];
  priorityScore: number;
  contactName: string | null;
  contactPhone: string | null;
  propertyAddress: string | null;
  ghlContactId: string | null;
  relatedCallId: number;
  teamMemberId: number | null;
  teamMemberName: string | null;
  transcriptExcerpt: string;
  callScore: string | null;
  callType: string | null;
  redFlags: string[];
  strengths: string[];
}

// ============ TIER 1: MISSED (RED) ============

const MOTIVATION_KEYWORDS = [
  "divorce", "divorcing", "separated",
  "foreclosure", "pre-foreclosure", "behind on payments", "can't afford",
  "death", "passed away", "inherited", "estate",
  "relocating", "moving", "transferred",
  "tired of landlording", "bad tenants", "tenant issues",
  "code violations", "condemned", "fire damage",
  "tax lien", "tax sale", "back taxes",
  "health issues", "hospital", "medical",
  "downsizing", "retirement",
  "job loss", "laid off", "unemployed"
];

const OBJECTION_KEYWORDS = [
  "not interested", "no thanks", "don't call",
  "too low", "that's insulting", "worth more",
  "need to think", "let me think", "talk to my",
  "not ready", "maybe later", "call back",
  "already listed", "have an agent", "realtor",
  "just looking", "just curious"
];

const URGENCY_KEYWORDS = [
  "need to sell fast", "need to sell quick", "asap",
  "moving next month", "closing date", "deadline",
  "can't wait", "urgent", "immediately",
  "foreclosure date", "auction", "sheriff sale"
];

function detectMissedOpportunities(
  call: any,
  grade: any,
  transcript: string
): { triggers: string[]; score: number } {
  const triggers: string[] = [];
  let score = 0;
  const lowerTranscript = transcript.toLowerCase();

  // Rule 1: Premature DQ — call ended quickly despite motivation signals
  const motivationFound = MOTIVATION_KEYWORDS.filter(k => lowerTranscript.includes(k));
  if (motivationFound.length > 0) {
    // Check if the call was short (under 3 min) or ended abruptly
    if (call.duration && call.duration < 180) {
      triggers.push("premature_dq");
      score += 30;
    }
    // Check if the grade flagged issues
    if (grade?.overallScore && parseFloat(grade.overallScore) < 60) {
      triggers.push("low_score_with_motivation");
      score += 20;
    }
  }

  // Rule 2: Unexplored motivation — seller mentioned motivation but rep didn't dig deeper
  if (motivationFound.length > 0) {
    // Check if rep asked follow-up questions about the motivation
    const followUpPhrases = ["tell me more", "can you explain", "what happened", "how long", "when did"];
    const hasFollowUp = followUpPhrases.some(p => lowerTranscript.includes(p));
    if (!hasFollowUp) {
      triggers.push("unexplored_motivation");
      score += 25;
    }
  }

  // Rule 3: Unaddressed objection — seller objected and rep didn't handle it
  const objectionsFound = OBJECTION_KEYWORDS.filter(k => lowerTranscript.includes(k));
  if (objectionsFound.length > 0 && grade?.redFlags && Array.isArray(grade.redFlags) && grade.redFlags.length > 0) {
    triggers.push("unaddressed_objection");
    score += 20;
  }

  // Rule 4: Missed urgency — seller expressed urgency but no appointment was set
  const urgencyFound = URGENCY_KEYWORDS.filter(k => lowerTranscript.includes(k));
  if (urgencyFound.length > 0 && call.callOutcome !== "appointment_set") {
    triggers.push("missed_urgency");
    score += 35;
  }

  // Rule 5: Poor grade on a warm/hot lead call
  if (grade?.overallScore && parseFloat(grade.overallScore) < 50) {
    triggers.push("very_low_score");
    score += 15;
  }

  return { triggers, score };
}

// ============ TIER 2: WARNING (YELLOW) ============

function detectWarningOpportunities(
  call: any,
  grade: any,
  transcript: string,
  recentCallsForContact: any[]
): { triggers: string[]; score: number } {
  const triggers: string[] = [];
  let score = 0;
  const lowerTranscript = transcript.toLowerCase();

  // Rule 1: Slow response — inbound call not returned within 24h
  // (This would need call history comparison — simplified here)
  if (call.callDirection === "inbound" && call.callOutcome === "no_answer") {
    // Check if there's a follow-up outbound call within 24h
    const callTime = call.callTimestamp ? new Date(call.callTimestamp).getTime() : 0;
    const hasFollowUp = recentCallsForContact.some(c => {
      if (c.callDirection !== "outbound" || c.id === call.id) return false;
      const cTime = c.callTimestamp ? new Date(c.callTimestamp).getTime() : 0;
      return cTime > callTime && cTime - callTime < 24 * 60 * 60 * 1000;
    });
    if (!hasFollowUp) {
      triggers.push("slow_response");
      score += 20;
    }
  }

  // Rule 2: Unanswered callback — seller requested callback but none logged
  if (call.callOutcome === "callback_scheduled") {
    const callTime = call.callTimestamp ? new Date(call.callTimestamp).getTime() : 0;
    const hasCallback = recentCallsForContact.some(c => {
      if (c.id === call.id) return false;
      const cTime = c.callTimestamp ? new Date(c.callTimestamp).getTime() : 0;
      return cTime > callTime;
    });
    if (!hasCallback) {
      triggers.push("unanswered_callback");
      score += 25;
    }
  }

  // Rule 3: Declining engagement — multiple calls with decreasing scores
  if (recentCallsForContact.length >= 2) {
    // Check if scores are declining
    const scores = recentCallsForContact
      .filter(c => c.grade?.overallScore)
      .map(c => parseFloat(c.grade.overallScore))
      .slice(0, 3);
    if (scores.length >= 2 && scores[0] < scores[scores.length - 1] - 10) {
      triggers.push("declining_engagement");
      score += 15;
    }
  }

  // Rule 4: Interested but no follow-up — seller showed interest but no next step
  if (call.callOutcome === "interested" || lowerTranscript.includes("send me an offer") || lowerTranscript.includes("what can you offer")) {
    if (call.callOutcome !== "appointment_set" && call.callOutcome !== "offer_made") {
      triggers.push("interested_no_followup");
      score += 20;
    }
  }

  return { triggers, score };
}

// ============ TIER 3: POSSIBLE (GREEN) ============

function detectPossibleOpportunities(
  call: any,
  grade: any,
  transcript: string
): { triggers: string[]; score: number } {
  const triggers: string[] = [];
  let score = 0;
  const lowerTranscript = transcript.toLowerCase();

  // Rule 1: Hidden motivation — subtle signals in transcript
  const subtleSignals = [
    "might sell", "thinking about selling", "considering",
    "what would you pay", "what's it worth", "market value",
    "how does this work", "what's the process",
    "my neighbor sold", "friend sold their house",
    "property is vacant", "not living there", "renting it out"
  ];
  const subtleFound = subtleSignals.filter(s => lowerTranscript.includes(s));
  if (subtleFound.length > 0) {
    triggers.push("hidden_motivation");
    score += 15;
  }

  // Rule 2: Re-engage candidate — old lead with no recent contact
  // (This is more of a batch check, handled in the main detection loop)

  // Rule 3: High-value property signals
  if (lowerTranscript.includes("multiple properties") || lowerTranscript.includes("portfolio") || lowerTranscript.includes("several houses")) {
    triggers.push("multi_property_owner");
    score += 20;
  }

  // Rule 4: Positive sentiment despite no commitment
  if (grade?.strengths && Array.isArray(grade.strengths) && grade.strengths.length >= 2) {
    if (call.callOutcome === "none" || call.callOutcome === "callback_scheduled") {
      triggers.push("positive_no_commitment");
      score += 10;
    }
  }

  return { triggers, score };
}

// ============ AI REASON GENERATION ============

async function generateAIReason(detection: DetectionResult): Promise<{ reason: string; suggestion: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a real estate wholesaling sales manager reviewing missed opportunities. 
Generate a brief explanation and actionable suggestion for a flagged opportunity.

RULES:
- Reason: 1-2 sentences explaining WHY this is a missed opportunity
- Suggestion: 1-2 sentences with a SPECIFIC next action to take
- Be direct and actionable, not generic
- Reference the specific trigger rules and call details provided
- Use a professional but urgent tone`
        },
        {
          role: "user",
          content: `Opportunity detected:
Tier: ${detection.tier}
Contact: ${detection.contactName || "Unknown"}
Property: ${detection.propertyAddress || "Unknown"}
Call type: ${detection.callType || "Unknown"}
Call score: ${detection.callScore || "N/A"}
Trigger rules: ${detection.triggerRules.join(", ")}
Red flags from grading: ${detection.redFlags.join(", ") || "None"}
Transcript excerpt (first 500 chars): ${detection.transcriptExcerpt.substring(0, 500)}

Generate a JSON response with "reason" and "suggestion" fields.`
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
              reason: { type: "string", description: "1-2 sentence explanation of why this is a missed opportunity" },
              suggestion: { type: "string", description: "1-2 sentence specific actionable next step" }
            },
            required: ["reason", "suggestion"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return { reason: parsed.reason, suggestion: parsed.suggestion };
    }
  } catch (error) {
    console.error("[OpportunityDetection] LLM error:", error);
  }

  // Fallback to template-based reason
  return generateTemplateReason(detection);
}

function generateTemplateReason(detection: DetectionResult): { reason: string; suggestion: string } {
  const ruleReasons: Record<string, { reason: string; suggestion: string }> = {
    premature_dq: {
      reason: `Call with ${detection.contactName || "this seller"} ended too quickly (under 3 min) despite motivation signals in the conversation.`,
      suggestion: "Call back within 24 hours and ask about their situation. Lead with empathy and re-explore their motivation to sell."
    },
    unexplored_motivation: {
      reason: `Seller mentioned motivation to sell but the rep didn't ask follow-up questions to understand their timeline or urgency.`,
      suggestion: "Call back and dig deeper into their situation. Ask 'What's driving your decision to sell?' and 'What's your ideal timeline?'"
    },
    unaddressed_objection: {
      reason: `Seller raised objections that weren't properly addressed, leaving potential value on the table.`,
      suggestion: "Prepare responses for the specific objections raised, then call back with a tailored approach."
    },
    missed_urgency: {
      reason: `Seller expressed urgency to sell but no appointment was set during the call.`,
      suggestion: "Call back immediately and offer a specific appointment time. Their urgency means they're likely talking to other buyers."
    },
    slow_response: {
      reason: `Inbound call from seller went unanswered and no follow-up was made within 24 hours.`,
      suggestion: "Call back immediately. Every hour of delay reduces contact rate by 10%. Prioritize this lead."
    },
    unanswered_callback: {
      reason: `Seller requested a callback but no follow-up call has been logged yet.`,
      suggestion: "Make the callback today. The seller is expecting your call and may lose interest if you don't follow through."
    },
    interested_no_followup: {
      reason: `Seller showed clear interest but no concrete next step was established.`,
      suggestion: "Call back with a specific offer or appointment time. Don't leave interested sellers without a clear next step."
    },
    hidden_motivation: {
      reason: `Subtle signals suggest this seller may be more motivated than they initially let on.`,
      suggestion: "Schedule a follow-up call focused on building rapport and gently exploring their situation."
    },
    multi_property_owner: {
      reason: `Seller mentioned multiple properties, indicating potential for multiple deals.`,
      suggestion: "Prioritize this contact — ask about all their properties and offer a portfolio deal."
    },
    declining_engagement: {
      reason: `Call quality scores are declining with this contact, suggesting the relationship is cooling.`,
      suggestion: "Change the approach — try a different team member or adjust the pitch to re-engage."
    },
    positive_no_commitment: {
      reason: `Call went well with positive rapport but no commitment was secured.`,
      suggestion: "Follow up with a soft touch — send a text or leave a voicemail referencing the positive conversation."
    },
    very_low_score: {
      reason: `Call received a very low grade, indicating significant room for improvement and a potentially lost lead.`,
      suggestion: "Review the call recording with the team member for coaching, then have a senior rep call the seller back."
    },
    low_score_with_motivation: {
      reason: `Despite the seller showing motivation to sell, the call scored poorly — indicating the rep may have mishandled the conversation.`,
      suggestion: "Have a more experienced team member call back and re-engage. Review the original call for coaching."
    }
  };

  const primaryRule = detection.triggerRules[0] || "unexplored_motivation";
  return ruleReasons[primaryRule] || ruleReasons.unexplored_motivation;
}

// ============ MAIN DETECTION LOOP ============

export async function runOpportunityDetection(tenantId?: number): Promise<{ detected: number; errors: number }> {
  const result = { detected: 0, errors: 0 };
  const db = await getDb();
  if (!db) return result;

  try {
    // Get tenants to scan
    let tenantsToScan: Array<{ id: number; name: string }>;
    if (tenantId) {
      tenantsToScan = [{ id: tenantId, name: "specified" }];
    } else {
      const allTenants = await getTenantsWithCrm();
      tenantsToScan = allTenants.map(t => ({ id: t.id, name: t.name }));
    }

    for (const tenant of tenantsToScan) {
      try {
        // Get recent graded calls from the last 24 hours that haven't been flagged yet
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const recentCalls = await db
          .select({
            call: calls,
            grade: callGrades,
            member: teamMembers,
          })
          .from(calls)
          .leftJoin(callGrades, eq(calls.id, callGrades.callId))
          .leftJoin(teamMembers, eq(calls.teamMemberId, teamMembers.id))
          .where(
            and(
              eq(calls.tenantId, tenant.id),
              eq(calls.status, "completed"),
              gte(calls.createdAt, oneDayAgo),
              // Only look at conversation calls (not voicemails, no-answers, etc.)
              eq(calls.classification, "conversation")
            )
          )
          .orderBy(desc(calls.createdAt))
          .limit(100);

        // Check which calls already have opportunities flagged
        const callIds = recentCalls.map((c: any) => c.call.id);
        if (callIds.length === 0) continue;

        const existingOpps = await db
          .select({ relatedCallId: opportunities.relatedCallId })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.tenantId, tenant.id),
              inArray(opportunities.relatedCallId, callIds)
            )
          );
        const flaggedCallIds = new Set(existingOpps.map((o: any) => o.relatedCallId));

        for (const { call, grade, member } of recentCalls) {
          if (flaggedCallIds.has(call.id)) continue;
          if (!call.transcript) continue;

          const transcript = call.transcript;

          // Get other calls for this contact (for warning detection)
          let contactCalls: any[] = [];
          if (call.ghlContactId) {
            const otherCalls = await db
              .select({ call: calls, grade: callGrades })
              .from(calls)
              .leftJoin(callGrades, eq(calls.id, callGrades.callId))
              .where(
                and(
                  eq(calls.tenantId, tenant.id),
                  eq(calls.ghlContactId, call.ghlContactId)
                )
              )
              .orderBy(desc(calls.createdAt))
              .limit(10);
            contactCalls = otherCalls.map((c: any) => ({ ...c.call, grade: c.grade }));
          }

          // Run all three tier detections
          const missed = detectMissedOpportunities(call, grade, transcript);
          const warning = detectWarningOpportunities(call, grade, transcript, contactCalls);
          const possible = detectPossibleOpportunities(call, grade, transcript);

          // Determine the highest tier triggered
          let tier: "missed" | "warning" | "possible" | null = null;
          let triggers: string[] = [];
          let score = 0;

          if (missed.triggers.length > 0) {
            tier = "missed";
            triggers = missed.triggers;
            score = missed.score;
          } else if (warning.triggers.length > 0) {
            tier = "warning";
            triggers = warning.triggers;
            score = warning.score;
          } else if (possible.triggers.length > 0) {
            tier = "possible";
            triggers = possible.triggers;
            score = possible.score;
          }

          if (!tier) continue;

          // Build detection result for AI reason generation
          const detection: DetectionResult = {
            tier,
            triggerRules: triggers,
            priorityScore: Math.min(score, 100),
            contactName: call.contactName,
            contactPhone: call.contactPhone,
            propertyAddress: call.propertyAddress,
            ghlContactId: call.ghlContactId,
            relatedCallId: call.id,
            teamMemberId: call.teamMemberId,
            teamMemberName: call.teamMemberName || member?.name || null,
            transcriptExcerpt: transcript.substring(0, 1000),
            callScore: grade?.overallScore?.toString() || null,
            callType: call.callType,
            redFlags: (grade?.redFlags as string[]) || [],
            strengths: (grade?.strengths as string[]) || [],
          };

          // Generate AI reason and suggestion
          const { reason, suggestion } = await generateAIReason(detection);

          // Insert the opportunity
          await db.insert(opportunities).values({
            tenantId: tenant.id,
            contactName: call.contactName,
            contactPhone: call.contactPhone,
            propertyAddress: call.propertyAddress,
            ghlContactId: call.ghlContactId,
            tier,
            priorityScore: Math.min(score, 100),
            triggerRules: triggers,
            reason,
            suggestion,
            relatedCallId: call.id,
            teamMemberId: call.teamMemberId,
            teamMemberName: call.teamMemberName || member?.name || null,
          });

          result.detected++;
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
