import { invokeLLM } from "./_core/llm";

// ============ GRADING RUBRICS ============

export const LEAD_MANAGER_RUBRIC = {
  name: "Lead Manager Qualification Call Rubric",
  description: "For Lead Managers - Qualification/Diagnosis calls. The goal is to qualify leads, extract motivation, discuss price, and set appointments for walkthroughs.",
  criteria: [
    {
      name: "Introduction & Rapport",
      maxPoints: 10,
      description: "Proper introduction, verified correct person, confirmed good time, professional tone",
      keyPhrases: ["I probably caught you at a bad time", "Is this a good time for a 5-10 minute conversation?"],
    },
    {
      name: "Setting Expectations",
      maxPoints: 10,
      description: "Set expectations for the call — either explicitly (explaining call structure, what info will be gathered, comfort with saying 'not a good fit') OR conversationally (framing the call as a mutual fit check, asking for a few minutes, establishing a collaborative tone). Both scripted and natural approaches count. Award full credit if the seller clearly understands the purpose and feels comfortable. Award partial credit if the rep sets a conversational frame but doesn't detail the call structure.",
      keyPhrases: ["Let me explain what this call will look like", "comfortable saying not a good fit", "good fit to work together", "couple of minutes to chat", "see if we can help", "want to learn about your situation", "just want to ask a few questions"],
    },
    {
      name: "Property Condition",
      maxPoints: 10,
      description: "Gathered beds/baths, property condition, confirmed or updated previous info",
      keyPhrases: ["number of bedrooms", "condition of the property"],
    },
    {
      name: "Roadblock Identification",
      maxPoints: 10,
      description: "Identified decision makers, timeline, other obstacles",
      keyPhrases: ["other decision makers", "If we could agree on a price today", "within 30 days"],
    },
    {
      name: "Motivation Extraction",
      maxPoints: 20,
      description: "MOST IMPORTANT - Identified true motivation, asked follow-up questions, pulled emotional pain points",
      keyPhrases: ["Why do you want to sell?", "How long has that been going on?", "Can you tell me more?", "What have you tried?"],
    },
    {
      name: "Price Discussion",
      maxPoints: 15,
      description: "Did NOT give price first, got seller's price, used price anchor (50-60% Zillow), asked 'What were you hoping I would say?'",
      keyPhrases: ["What were you hoping I would at least say?", "other investors are paying around"],
    },
    {
      name: "Tonality & Empathy",
      maxPoints: 10,
      description: "Matched seller's pace/tone, soft tone during motivation, genuine empathy, professional bearing",
      keyPhrases: [],
    },
    {
      name: "Objection Handling",
      maxPoints: 10,
      description: "Addressed objections appropriately, used third party stories, didn't get defensive",
      keyPhrases: ["I had a seller just like you", "We've helped people in similar situations"],
    },
    {
      name: "Call Outcome",
      maxPoints: 5,
      description: "Appropriate disqualification or proper appointment setting, clear next steps",
      keyPhrases: ["schedule a walkthrough", "within 48 hours"],
    },
  ],
  redFlags: [
    "Giving price before seller",
    "Not price anchoring",
    "Rushing through motivation",
    "Not asking follow-up questions",
    "Getting defensive with angry sellers",
    "Not confirming all decision makers",
    "Not setting any expectations or frame for the call (neither explicit structure nor conversational framing)",
    "Talking too fast or too slow",
    "Not matching seller's tone",
    "Weak objection handling",
    "Seller offered a timeline or availability window but agent left the conversation open-ended without locking in a follow-up date",
  ],
  disqualificationTarget: "Under 4 minutes for clear disqualifications",
};

export const ACQUISITION_MANAGER_RUBRIC = {
  name: "Acquisition Manager Offer Call Rubric",
  description: "For Acquisition Managers - Offer/Closing calls",
  criteria: [
    {
      name: "Intro & Confirmation",
      maxPoints: 10,
      description: "Confirmed scheduled time works, professional greeting",
      keyPhrases: ["Is this still a good time?", "Thank you for taking my call"],
    },
    {
      name: "Setting the Stage",
      maxPoints: 10,
      description: "Explained what happens if they move forward, confirmed email review capability",
      keyPhrases: ["Let me explain what happens next", "review the agreement via email"],
    },
    {
      name: "Roadblock Confirmation",
      maxPoints: 15,
      description: "Confirmed all decision makers present, asked 'In a perfect world, if we agree on price, what would happen next?'",
      keyPhrases: ["all decision makers present", "In a perfect world", "what would happen next"],
    },
    {
      name: "Motivation Restatement",
      maxPoints: 20,
      description: "Revisited their motivation, used empathy phrases, mirrored their words",
      keyPhrases: ["How long has that been going on?", "How has that impacted you?", "Seems like", "Feels like", "Sounds like"],
    },
    {
      name: "Offer Setup",
      maxPoints: 15,
      description: "Reminded of benefits: no closing costs, no commissions, as-is, no repairs, no cleaning",
      keyPhrases: ["no closing costs", "no commissions", "as-is condition", "no repairs needed", "solving your problem"],
    },
    {
      name: "Price Delivery",
      maxPoints: 15,
      description: "Gave specific number, stated it's what they walk away with, confident delivery",
      keyPhrases: ["walk away with", "in your pocket"],
    },
    {
      name: "Tonality & Confidence",
      maxPoints: 10,
      description: "Confident but empathetic tone, professional bearing, matched energy appropriately",
      keyPhrases: [],
    },
    {
      name: "Closing Technique",
      maxPoints: 5,
      description: "Asked for commitment, handled final objections, clear next steps",
      keyPhrases: ["confident yes or no", "What questions do you have?"],
    },
  ],
  redFlags: [
    "Not confirming all decision makers",
    "Skipping motivation restatement",
    "Rushing to the price",
    "Not explaining benefits before price",
    "Weak or uncertain price delivery",
    "Not asking for commitment",
    "Getting defensive on objections",
    "Not using empathy phrases",
  ],
};

export const LEAD_GENERATOR_RUBRIC = {
  name: "Lead Generator Cold Call Rubric",
  description: "For Lead Generators - Cold calling to generate seller interest and identify motivated sellers. The goal is NOT to set appointments — it is to get the homeowner to express interest in selling so a Lead Manager can follow up and qualify the lead.",
  criteria: [
    {
      name: "Introduction & Permission",
      maxPoints: 15,
      description: "Professional greeting, stated name and company, asked permission to continue the conversation",
      keyPhrases: ["My name is", "calling from", "Do you have a quick minute?", "Is this a good time?"],
    },
    {
      name: "Interest Discovery",
      maxPoints: 25,
      description: "Asked if the homeowner has any interest in selling, gauged motivation level, identified potential sellers",
      keyPhrases: ["interested in selling", "thought about selling", "open to an offer", "considering selling", "looking to sell"],
    },
    {
      name: "Building Rapport",
      maxPoints: 20,
      description: "Built a connection with the homeowner, showed genuine interest, kept the conversation natural and friendly",
      keyPhrases: ["How long have you lived there?", "Tell me about", "That makes sense", "I appreciate your time"],
    },
    {
      name: "Objection Handling",
      maxPoints: 15,
      description: "Addressed concerns appropriately, didn't get defensive, acknowledged and kept the conversation going",
      keyPhrases: ["I understand", "That makes sense", "Many people feel that way", "No pressure at all"],
    },
    {
      name: "Warm Transfer / Handoff Setup",
      maxPoints: 15,
      description: "Successfully identified interest and set up the lead for a Lead Manager follow-up call. Mentioned that a manager will call to discuss further details.",
      keyPhrases: ["my manager will follow up", "someone from our team will call", "we'd love to learn more", "can we have someone reach out"],
    },
    {
      name: "Professional Tone",
      maxPoints: 10,
      description: "Friendly but professional, respectful, not pushy, good pacing, conversational",
      keyPhrases: [],
    },
  ],
  redFlags: [
    "Talking too fast or rushing",
    "Being pushy or aggressive",
    "Not asking permission to continue",
    "Skipping interest discovery questions",
    "Trying to set appointments instead of generating interest",
    "Getting defensive with objections",
    "Not mentioning Lead Manager follow-up",
    "Unprofessional language or tone",
  ],
};

// ============ FOLLOW-UP CALL RUBRIC ============

export const FOLLOW_UP_RUBRIC = {
  name: "Follow-Up Call Rubric",
  description: "For re-engagement calls where the lead went cold, said 'call me later', or needs nurturing. Full qualification already happened — this is about restarting the conversation and advancing the deal. Based on the NAH Follow-Up Script.",
  criteria: [
    {
      name: "Referenced Previous Conversation & Property",
      maxPoints: 10,
      description: "Mentioned date of last call, address, what was discussed. Shows the seller they're not just another number.",
      keyPhrases: ["last time we spoke", "we talked about", "your property at", "when we last connected"],
    },
    {
      name: "Anchored the Previous Offer",
      maxPoints: 15,
      description: "'We put an offer on the table at $X.' Most reps skip this and dance around price. Script leads with it deliberately.",
      keyPhrases: ["put an offer", "we offered", "the number was", "our offer of"],
    },
    {
      name: "Re-confirmed Decision Maker",
      maxPoints: 10,
      description: "'Is it still just you making the call, or is anyone else involved?' Deals die when you're talking to the wrong person on follow-up.",
      keyPhrases: ["still just you", "anyone else involved", "decision maker", "spouse", "partner"],
    },
    {
      name: "Re-qualified Motivation/Timeline",
      maxPoints: 15,
      description: "'You mentioned [motivation]. Is that still the situation? Has anything changed?' Not full re-qualification — just checking for shifts.",
      keyPhrases: ["you mentioned", "still the situation", "has anything changed", "still looking to", "timeline"],
    },
    {
      name: "Surfaced Roadblocks",
      maxPoints: 15,
      description: "'What's been the biggest thing holding you back?' Then PAUSED and let them speak. The pause is critical — score whether the rep fills silence or lets the seller process.",
      keyPhrases: ["holding you back", "what's been stopping", "what's preventing", "biggest concern"],
    },
    {
      name: "Pushed for a Decision",
      maxPoints: 20,
      description: "The reality check close — 'Is that a yes or a no for you today?' Binary by design. Score whether the rep actually asked for the decision, not just 'set a next step.'",
      keyPhrases: ["yes or no", "where do you stand", "are you ready", "what's your decision", "move forward"],
    },
    {
      name: "Handled Objection / Set Concrete Next Step",
      maxPoints: 15,
      description: "If no → 'What would need to change for this to make sense?' If not ready → 'When I check back in, what should I come prepared with?' Must be specific, not vague.",
      keyPhrases: ["what would need to change", "what should I come prepared with", "next step", "specific date"],
    },
  ],
  redFlags: [
    "Never referenced the previous offer amount",
    "Never asked for a decision",
    "Talked through the seller's silence after the roadblock question",
    "Didn't identify/confirm who the decision maker is",
    "Ran a full qualification script instead of a targeted follow-up",
    "No concrete next step set",
    "Seller offered a timeline or availability window but agent left the conversation open-ended without locking in a follow-up date",
  ],
  criticalFailures: [
    "Never referenced the previous offer amount",
    "Never asked for a decision",
    "Talked through the seller's silence after the roadblock question",
    "Didn't identify/confirm who the decision maker is",
  ],
  criticalFailureCap: 50, // Cap score at 50% if any critical failure
  talkRatioTarget: 50, // Seller should talk ≥50% of the time
};

// ============ SELLER CALLBACK RUBRIC ============

export const SELLER_CALLBACK_RUBRIC = {
  name: "Seller Callback Rubric",
  description: "For inbound calls where the seller called YOU back. This is a high-intent signal — they're ready to talk, have questions, or want to move. The goal is to capitalize on their momentum and lock down next steps.",
  criteria: [
    {
      name: "Acknowledged They Called Back",
      maxPoints: 10,
      description: "'Thanks for calling back' or 'Glad you reached out.' Don't treat it like a cold call.",
      keyPhrases: ["thanks for calling", "glad you reached out", "appreciate you calling", "good to hear from you"],
    },
    {
      name: "Asked What Prompted the Callback",
      maxPoints: 15,
      description: "'What made you reach out?' Reveals their current headspace — got another offer? Ready to move? Just had questions? Huge intel.",
      keyPhrases: ["what made you", "what prompted", "what's going on", "what can I help with", "why are you calling"],
    },
    {
      name: "Matched Energy to Their Intent",
      maxPoints: 10,
      description: "If they're ready to go, don't slow them down with a full qualification script. If they have questions, answer them. Read the room.",
      keyPhrases: [],
    },
    {
      name: "Filled Gaps in Info",
      maxPoints: 15,
      description: "They called back, but you might still be missing property details, timeline, price expectations. Get what you need without interrogating.",
      keyPhrases: ["can you tell me about", "what's the situation with", "timeline", "price", "condition"],
    },
    {
      name: "Moved Toward Commitment",
      maxPoints: 20,
      description: "Appointment, offer, walkthrough, contract. They called YOU — the momentum is there. Don't waste it.",
      keyPhrases: ["schedule", "walkthrough", "offer", "next step", "move forward", "appointment"],
    },
    {
      name: "Handled Their Specific Questions/Concerns",
      maxPoints: 15,
      description: "They usually call back with something specific on their mind. Did the rep address it directly?",
      keyPhrases: [],
    },
    {
      name: "Set Firm Next Step with Timeline",
      maxPoints: 10,
      description: "Not 'we'll be in touch.' A date, a time, a specific action.",
      keyPhrases: ["specific date", "tomorrow at", "this week", "I'll send", "by Friday"],
    },
    {
      name: "Talk Ratio — Seller Talks More",
      maxPoints: 5,
      description: "They called for a reason. Let them tell you what it is.",
      keyPhrases: [],
    },
  ],
  redFlags: [
    "Ran a full cold call script on someone who called back",
    "Didn't ask why they're calling",
    "Let them hang up without a next step",
    "Talked over the seller",
    "Missed the seller's urgency signals",
    "Seller offered a timeline or availability window but agent left the conversation open-ended without locking in a follow-up date",
  ],
  criticalFailures: [
    "Ran a full cold call script on someone who called back",
    "Didn't ask why they're calling",
    "Let them hang up without a next step",
  ],
  criticalFailureCap: 50, // Cap score at 50% if any critical failure
  talkRatioTarget: 60, // Seller should talk ≥60% of the time
};

// ============ ADMIN CALLBACK RUBRIC ============

export const ADMIN_CALLBACK_RUBRIC = {
  name: "Admin Callback Rubric",
  description: "For operational calls about documents, scheduling, closing details, title info, walkthrough times. These are NOT sales calls — they're task execution. Scored on a simple checklist. Scores are tracked but can be excluded from the main leaderboard rankings.",
  criteria: [
    {
      name: "Stated Purpose of Call Clearly",
      maxPoints: 20,
      description: "Got to the point — 'I'm calling about [specific thing].'",
      keyPhrases: ["I'm calling about", "reason for my call", "following up on", "wanted to check on"],
    },
    {
      name: "Got the Info/Action Needed",
      maxPoints: 30,
      description: "Did the call accomplish its objective? Did they get the document, answer, confirmation, or scheduling done?",
      keyPhrases: [],
    },
    {
      name: "Confirmed Next Step + Timeline",
      maxPoints: 25,
      description: "Clear on what happens next and when. 'We'll have the contract over by Thursday' not 'we'll send it soon.'",
      keyPhrases: ["by Thursday", "tomorrow", "this week", "next step is", "I'll send", "you'll receive"],
    },
    {
      name: "Professional Tone",
      maxPoints: 10,
      description: "Courteous, clear, not rushed or dismissive.",
      keyPhrases: [],
    },
    {
      name: "Kept It Tight",
      maxPoints: 15,
      description: "Didn't ramble, go off-topic, or waste the seller's time. Admin calls should be efficient.",
      keyPhrases: [],
    },
  ],
  redFlags: [
    "Rambling or going off-topic",
    "Not confirming next steps",
    "Vague timeline ('soon', 'when we can')",
    "Dismissive or rushed tone",
  ],
  // No critical failures for admin callbacks — low-stakes calls
  criticalFailures: [] as string[],
  criticalFailureCap: 0, // Not applicable
  excludeFromLeaderboard: true, // Track but don't weight in rep scores
};

// ============ GRADING FUNCTION ============

// Must match the callOutcome enum in drizzle/schema.ts
export type CallOutcome = "none" | "appointment_set" | "offer_made" | "offer_rejected" | "callback_scheduled" | "interested" | "left_vm" | "no_answer" | "not_interested" | "dead";

export interface ObjectionHandlingItem {
  objection: string; // The objection identified (e.g., "Price too high", "Need to think about it")
  context: string; // Quote or context from transcript where objection occurred
  suggestedResponses: string[]; // 2-3 script responses they could have used
}

export interface GradingResult {
  overallScore: number;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  criteriaScores: Array<{
    name: string;
    score: number;
    maxPoints: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  coachingTips: string[];
  redFlags: string[];
  objectionHandling: ObjectionHandlingItem[];
  summary: string;
  callOutcome: CallOutcome;
  followUpScheduled: boolean;
}

function getGradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export type GradableCallType = "cold_call" | "qualification" | "follow_up" | "offer" | "seller_callback" | "admin_callback";

export async function gradeCall(
  transcript: string,
  callType: GradableCallType,
  teamMemberName: string,
  context?: {
    trainingMaterials?: { title: string; content: string | null; category: string | null }[];
    gradingRules?: { title: string; ruleText: string | null; priority: number | null }[];
    recentFeedback?: { feedbackType: string | null; explanation: string | null; correctBehavior: string | null }[];
    companyName?: string;
    industry?: string;
    tenantRubrics?: { name: string; description: string | null; criteria: string; callType?: string | null; redFlags?: string | null }[];
  }
): Promise<GradingResult> {
  // Rubric mapping (6 call types → 6 rubrics):
  // cold_call → Lead Generator rubric (generating interest, NOT setting appointments)
  // qualification → Lead Manager rubric (qualifying leads, setting appointments)
  // follow_up → Follow-Up rubric (re-engagement, anchoring previous offer, pushing for decision)
  // offer → Acquisition Manager rubric (presenting offers, closing deals)
  // seller_callback → Seller Callback rubric (inbound high-intent, capitalize on momentum)
  // admin_callback → Admin Callback rubric (operational task execution, simple checklist)
  const rubricMap: Record<GradableCallType, { name: string; description: string; criteria: { name: string; maxPoints: number; description: string; keyPhrases: string[] }[]; redFlags: string[]; criticalFailures?: string[]; criticalFailureCap?: number; talkRatioTarget?: number; disqualificationTarget?: string; excludeFromLeaderboard?: boolean }> = {
    cold_call: LEAD_GENERATOR_RUBRIC,
    qualification: LEAD_MANAGER_RUBRIC,
    follow_up: FOLLOW_UP_RUBRIC,
    offer: ACQUISITION_MANAGER_RUBRIC,
    seller_callback: SELLER_CALLBACK_RUBRIC,
    admin_callback: ADMIN_CALLBACK_RUBRIC,
  };
  let rubric = rubricMap[callType] || LEAD_MANAGER_RUBRIC;

  // S13: Override with tenant-specific rubric if available
  if (context?.tenantRubrics && context.tenantRubrics.length > 0) {
    // First try exact callType match, then fall back to name-based matching
    const tenantRubric = context.tenantRubrics.find(r => r.callType === callType) ||
      context.tenantRubrics.find(r => 
        r.name.toLowerCase().includes(callType.replace('_', ' ')) ||
        r.name.toLowerCase().includes(callType.replace('_', '-'))
      );
    if (tenantRubric) {
      try {
        const parsedCriteria = JSON.parse(tenantRubric.criteria);
        // Ensure each criterion has keyPhrases array (tenant rubrics may not include them)
        const normalizedCriteria = parsedCriteria.map((c: any) => ({
          ...c,
          keyPhrases: Array.isArray(c.keyPhrases) ? c.keyPhrases : [],
        }));
        const parsedRedFlags = tenantRubric.redFlags ? JSON.parse(tenantRubric.redFlags) : undefined;
        rubric = {
          ...rubric,
          name: tenantRubric.name,
          description: tenantRubric.description || rubric.description,
          criteria: normalizedCriteria,
          ...(parsedRedFlags ? { redFlags: parsedRedFlags } : {}),
        };
        console.log(`[Grading] Using tenant-specific rubric: ${tenantRubric.name} (callType: ${tenantRubric.callType || 'name-match'})`);
      } catch (e) {
        console.error(`[Grading] Failed to parse tenant rubric criteria, using default`);
      }
    }
  }

  // Build training materials context
  let trainingContext = "";
  if (context?.trainingMaterials && context.trainingMaterials.length > 0) {
    trainingContext = `\n\nADDITIONAL TRAINING MATERIALS TO CONSIDER:\n${context.trainingMaterials.map(m => 
      `--- ${m.title} (${m.category}) ---\n${m.content || "(No content)"}`
    ).join("\n\n")}`;
  }

  // Build custom grading rules context
  let rulesContext = "";
  if (context?.gradingRules && context.gradingRules.length > 0) {
    const sortedRules = [...context.gradingRules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    rulesContext = `\n\nCUSTOM GRADING RULES (apply these in addition to standard criteria):\n${sortedRules.map(r => 
      `- ${r.title}: ${r.ruleText}`
    ).join("\n")}`;
  }

  // Build feedback learning context
  let feedbackContext = "";
  if (context?.recentFeedback && context.recentFeedback.length > 0) {
    feedbackContext = `\n\nLEARNINGS FROM PREVIOUS FEEDBACK (avoid these mistakes):\n${context.recentFeedback.map(f => 
      `- ${f.feedbackType}: ${f.explanation}${f.correctBehavior ? ` (Correct approach: ${f.correctBehavior})` : ""}`
    ).join("\n")}`;
  }

  const companyName = context?.companyName || "the company";
  const industry = context?.industry || "real estate wholesaling/investing";
  const systemPrompt = `You are an expert sales coach for a ${industry} company called ${companyName}. 
Your job is to analyze phone call transcripts and grade them based on a specific rubric.

You are grading a ${callType === "cold_call" ? "Cold Call (Lead Generation)" : callType === "qualification" ? "Qualification/Diagnosis" : callType === "follow_up" ? "Follow-Up" : callType === "seller_callback" ? "Seller Callback (Inbound)" : callType === "admin_callback" ? "Admin Callback (Operational)" : "Offer"} call made by ${teamMemberName}.
${callType === "cold_call" ? "\nIMPORTANT: This is a Lead Generator cold call. The goal of this call is NOT to set appointments. The goal is to identify motivated sellers and generate interest in selling their property. A Lead Manager will follow up to qualify and set appointments. Grade accordingly." : ""}
${callType === "follow_up" ? "\nIMPORTANT: This is a Follow-Up call. The rep is re-engaging a known lead who went cold or said 'call me later.' Full qualification already happened. Do NOT penalize for skipping qualification steps. Focus on: referencing the previous conversation, anchoring the previous offer, surfacing roadblocks (and PAUSING to let the seller speak), and pushing for a binary decision. Talk ratio target: seller should talk ≥50%.\n\nCRITICAL FAILURES (cap score at 50% max if any of these occur):\n- Never referenced the previous offer amount\n- Never asked for a decision\n- Talked through the seller's silence after the roadblock question\n- Didn't identify/confirm who the decision maker is" : ""}
${callType === "seller_callback" ? "\nIMPORTANT: This is a Seller Callback — the seller called US back. This is a high-intent signal. The dynamic is completely different from outbound calls. Do NOT run a cold call or full qualification script. Focus on: acknowledging they called back, asking what prompted the callback, matching energy to their intent, and moving toward commitment. Talk ratio target: seller should talk ≥60%.\n\nCRITICAL FAILURES (cap score at 50% max if any of these occur):\n- Ran a full cold call script on someone who called back\n- Didn't ask why they're calling\n- Let them hang up without a next step" : ""}
${callType === "admin_callback" ? "\nIMPORTANT: This is an Admin Callback — an operational call about documents, scheduling, closing details, or other administrative tasks. This is NOT a sales call. Score on task execution: did they state the purpose clearly, get what they needed, confirm next steps with a timeline, maintain professional tone, and keep it efficient? No critical failures — these are low-stakes calls." : ""}

RUBRIC: ${rubric.name}
${rubric.description}

GRADING PHILOSOPHY:
Reps have different communication styles. Some follow scripts closely; others achieve the same goals conversationally. Both approaches are valid. When evaluating criteria, focus on WHETHER the rep accomplished the goal of each criterion, not just whether they used specific scripted phrases. A rep who naturally sets expectations through conversational framing (e.g., "Do you have a couple minutes? Just want to see if we're a good fit to work together") should receive credit for Setting Expectations, even if they didn't use the exact scripted approach. Award full points when the goal is clearly achieved regardless of style. Award partial points when the goal is partially achieved. Only give zero when the behavior is completely absent.

EARLY DISQUALIFICATION AWARENESS — THIS IS CRITICAL:
Efficient disqualification is one of the MOST IMPORTANT skills in sales. A rep who quickly identifies a dead lead and moves on to the next call is MORE valuable than one who wastes 15 minutes qualifying a deal that was never going to work. Grade DQ calls accordingly — a clean, fast, correct DQ is an A/B-level performance, NOT a failure.

Common legitimate DQ reasons: property not in buybox (manufactured home, commercial, land-only, fully remodeled, too expensive), seller has zero motivation (just curious, going to list with agent, not interested at all), property not in service area, seller's price expectations are wildly above what works for an investor, wrong number, or seller is hostile/uncooperative.

When a call is a legitimate early DQ:
- DO NOT penalize for skipping deep qualification steps. If the deal is clearly dead, there is NO reason to run the full script. Skipping Property Condition, Motivation Extraction, Price Discussion, etc. on a dead lead is the CORRECT behavior.
- For criteria that were intentionally skipped because the call was a DQ, give 75-90% of max points with feedback like "Not applicable — call was correctly disqualified. Skipping this step was the right call." Do NOT give 0 or 50% for correctly skipping irrelevant steps.
- A 2-4 minute DQ call that correctly identifies a dead lead should score 70-90% overall (B to A range), not 30-50%.
- Grade DQ calls on THESE factors instead: (1) Did the rep correctly identify WHY the lead doesn't work? (2) Was the exit professional and respectful? (3) Did they leave the door open where appropriate? (4) Was the call efficient — did they avoid wasting time once the DQ was clear?
- Probing questions before DQ are nice-to-have, NOT required. If the seller says "I'm going to list with my realtor friend, the house is fully renovated" — the rep does NOT need to ask "are you sure?" or "what if we could close quickly?" The DQ reason is already obvious. Only penalize for lack of probing when the DQ reason is genuinely ambiguous.
- HOWEVER, if the transcript shows the rep gave up on a lead that actually HAD potential (e.g., seller expressed some motivation but rep didn't explore it), that IS a legitimate area for improvement. The key question is: Was the DQ CORRECT? If yes, reward it.

Examples of GOOD DQ behavior (should score B+ or higher):
- Seller says property is fully remodeled and they want $400K → rep recognizes it's not in buybox → ends call politely. Score: 80-90%.
- Seller has no motivation, just got a mailer and was curious → rep confirms no interest → moves on. Score: 75-85%.
- Property is out of service area or wrong property type → rep identifies quickly → exits professionally. Score: 80-90%.
- Seller's price expectation is 2x what works for investor, no flexibility → rep recognizes the gap → disengages respectfully. Score: 75-90%.

PRIOR CONTEXT AWARENESS:
Reps often have information from previous conversations, text messages, CRM notes, or prior calls with the same lead. When the transcript shows evidence of prior context:
- Look for phrases like: "based on what you told me before", "from our text conversation", "I see in my notes", "last time we spoke", "you mentioned", "I already have your info", "we texted about this", "from the information you sent", "I already know about the property"
- DO NOT penalize for "not gathering" information that was clearly already known. If the rep references prior knowledge (e.g., already knows beds/baths, already knows the situation), give full credit for those information-gathering criteria.
- Text leads and inbound leads often come with pre-filled information. A rep who says "I see you're at 123 Main St, 3 bed 2 bath — is that still accurate?" is confirming prior info, not skipping the question.
- The key question is: Does the rep HAVE the information (from any source), not whether they asked for it on THIS specific call.

CRITERIA TO EVALUATE:
${rubric.criteria.map((c, i) => `
${i + 1}. ${c.name} (${c.maxPoints} points max)
   - ${c.description}
   - Key phrases to look for (examples, not requirements): ${c.keyPhrases.length > 0 ? c.keyPhrases.join(", ") : "N/A - evaluate based on tone and approach"}
`).join("\n")}

RED FLAGS TO IDENTIFY:
${rubric.redFlags.map(f => `- ${f}`).join("\n")}

TIMELINE COMMITMENT CHECK (applies to all sales call types):
Watch for this specific pattern — it is a CRITICAL coaching opportunity:
1. The seller offers a concrete timeline or availability window. Examples:
   - "I'll be in town in March"
   - "Call me in a few weeks"
   - "After my mother passes / goes to assisted living"
   - "I'll know more by next month"
   - "I'm available next week"
   - "Once the tenant moves out"
2. The agent responds with open-ended, non-committal language instead of locking in a specific next step. Examples:
   - "Feel free to reach out anytime"
   - "I can be on standby"
   - "Just let us know"
   - "Give us a call when you're ready"
   - "Keep us in mind"

If this pattern is detected:
- Add it as a RED FLAG: "Seller offered a timeline/availability window but agent left the conversation open-ended without locking in a specific follow-up date"
- Add it as a COACHING TIP with a specific script alternative. For example: "When a seller says 'I'll be in town in March,' don't say 'feel free to reach out.' Instead say: 'Perfect — let me put something on the calendar for the first week of March so we can connect when you're here. Does March 3rd or 4th work better?' Always convert a seller's timeline into a calendar commitment."
- Penalize the Call Outcome criterion — the call should NOT get full marks if the seller gave an opening and the agent didn't lock it down.

${callType === "qualification" ? `DISQUALIFICATION TARGET: ${(rubric as any).disqualificationTarget || LEAD_MANAGER_RUBRIC.disqualificationTarget}` : ""}${trainingContext}${rulesContext}${feedbackContext}

Analyze the transcript and provide:
1. A score for each criterion (0 to max points)
2. Specific feedback for each criterion — MUST include direct quotes from the transcript
3. Overall strengths (what they did well)
4. Areas for improvement
5. Specific coaching tips based on the training methodology
6. Any red flags identified
7. OBJECTION HANDLING: Identify any objections the seller raised (price concerns, timing, need to think about it, talking to other investors, etc.) and provide 2-3 specific script responses they could have used. Include the context/quote where the objection occurred.
8. A brief summary of the call performance
9. The call outcome - determine what happened at the end of the call

CRITICAL REQUIREMENT — TRANSCRIPT-REFERENCED FEEDBACK:
Every piece of feedback MUST reference specific details from the actual transcript. Do NOT give generic coaching advice.

- **Summary**: Must mention specific dollar amounts, property details, timelines, and outcomes discussed. Example: "Kyle followed up on the previous $85,000 offer on the Elm St property. The seller mentioned needing at least $120,000 but Kyle did not counter or anchor."
- **Strengths**: Each strength MUST include a direct quote or specific moment. Example: "Kyle built rapport by acknowledging the seller's emotional attachment: 'I understand this has been in your family for years, and that means something.'"
- **Areas for Improvement**: Each improvement MUST cite the exact moment where the rep fell short, including what the seller said and what the rep should have said instead. Example: "When the seller said 'I'll think about it and maybe reach out later,' Kyle responded with 'Sounds good, feel free to call anytime.' Instead, he should have said: 'I totally understand — what specifically do you need to think about? Is it the price, the timeline, or something else?'"
- **Coaching Tips**: Must reference the specific situation from THIS call, not generic advice. Include the exact quote that triggered the coaching moment.
- **Criteria Feedback**: Must quote the relevant transcript section that justifies the score given.

If a dollar amount, property address, timeline, or specific number was mentioned in the call, it MUST appear in the relevant feedback sections. Never say "the seller mentioned a price concern" — say "the seller said 'I was hoping for at least $200,000' but the rep's offer was $150,000, a $50,000 gap."

Do NOT use placeholder examples. Use ONLY actual content from the transcript provided.`;

  const userPrompt = `Please analyze this call transcript and provide a detailed grade:

TRANSCRIPT:
${transcript}

Respond with a JSON object in this exact format:
{
  "criteriaScores": [
    {"name": "criterion name", "score": number, "maxPoints": number, "feedback": "specific feedback"}
  ],
  "strengths": ["Kyle effectively anchored the previous offer early: 'Last time we talked, we were at $85,000 — has anything changed on your end?'", "strength with quote 2"],
  "improvements": ["When the seller said 'I need to talk to my wife,' Kyle said 'No problem, take your time.' He should have said: 'Absolutely — would it help if I put together the numbers so you can show her exactly what this looks like?'", "improvement with quote 2"],
  "coachingTips": ["At 1:45 when the seller mentioned '$120,000 minimum,' Kyle went silent. Script: 'I hear you at $120k. Help me understand — is that based on what you owe, what a neighbor sold for, or what you need to walk away with?'", "tip with quote 2"],
  "redFlags": ["red flag 1"] or [],
  "objectionHandling": [
    {"objection": "Price too high", "context": "Seller said: 'I was hoping for at least $200k'", "suggestedResponses": ["Response 1", "Response 2"]}
  ],
  "summary": "brief overall summary",
  "callOutcome": "offer_rejected" or "offer_made" or "appointment_set" or "not_interested" or "interested" or "callback_scheduled" or "left_vm" or "no_answer" or "dead" or "none" (see PRIORITY HIERARCHY below — outcome reflects the DEAL STATUS, not follow-up logistics. 'callback_scheduled' is almost never correct for real conversations),
  "followUpScheduled": true or false (SEPARATE from callOutcome — set to true if a callback or follow-up was agreed to at ANY point during the call, regardless of what the primary outcome is. Example: offer was rejected but they said 'call me next week' → callOutcome='offer_rejected', followUpScheduled=true)
}

CALL OUTCOME DEFINITIONS — PRIORITY HIERARCHY:
The outcome must reflect the SUBSTANTIVE RESULT of the call (what was decided about the deal), NOT the follow-up logistics. Almost every call ends with scheduling a callback — that does NOT make the outcome "callback_scheduled". The outcome captures what happened BEFORE the "let's talk again" part.

Use this priority order — pick the FIRST one that matches:

1. offer_rejected (HIGHEST for rejected offers): A specific dollar amount was presented and the seller clearly rejected, declined, or refused it. Signs: seller saying "no", "that's too low", "I'm not interested at that price", "absolutely not", or any clear refusal. EVEN IF a callback is scheduled after the rejection, the outcome is STILL "offer_rejected" because that's what happened on the call. Example: "I can't do $85k... but yeah, call me next week" → outcome is "offer_rejected", NOT "callback_scheduled".

2. offer_made: A specific dollar amount was presented and the seller did NOT reject it — they're considering it, said they'd think about it, or didn't give a clear yes/no. EVEN IF a callback is scheduled to discuss further, the outcome is "offer_made". Example: "Let me think about the $95k... call me Thursday" → outcome is "offer_made".

3. appointment_set: A walkthrough, meeting, or in-person appointment was scheduled with a SPECIFIC date/time. The seller and agent agreed on an exact day and time to meet. Vague statements like "call me next week" do NOT count.

4. not_interested: The seller clearly stated they are not interested in selling, even if they were polite about it. EVEN IF they said "call me in 6 months", if the current answer is clearly NO, use "not_interested".

5. interested: The seller expressed interest in selling or hearing more, but no specific appointment or offer was made. USE THIS when the conversation was positive but ended without a firm deal-related next step. This includes: seller asking questions about the process, seller saying "maybe" or "I might be interested", seller giving property details willingly, seller saying "call me back" without a specific time. This is the DEFAULT for positive conversations.

6. callback_scheduled (LOWEST priority among live conversations): ONLY use this when literally nothing else happened on the call except agreeing to talk at a specific time. The seller explicitly agreed to receive a call back at a SPECIFIC date/time (e.g., "Call me Tuesday at 3pm") AND no offer was made, no offer was rejected, no appointment was set, and no clear interest/disinterest was expressed. This is RARE. If ANY substantive outcome occurred on the call, use that outcome instead, even if a callback was also scheduled.
   These do NOT qualify as callback_scheduled:
   * "I'll call you back" or "We'll follow up" (agent-initiated, no seller agreement to specific time)
   * "Call me sometime next week" (no specific time)
   * "I'll think about it and get back to you" (seller will initiate, not a scheduled callback)
   * "Feel free to reach out" (open-ended, no commitment)
   * The agent saying they will follow up (unless the seller agreed to a specific time)
   * ANY call where an offer was discussed (use offer_made or offer_rejected instead)
   * ANY call where the seller expressed clear interest or disinterest (use interested or not_interested)

7. left_vm: The rep left a voicemail message (no live conversation occurred)
8. no_answer: The call went unanswered or was very brief with no real conversation
9. dead: Wrong number, disconnected, or the lead is completely dead
10. none: The call ended without any clear outcome — the conversation was neutral with no interest expressed either way

CRITICAL RULE: "callback_scheduled" should almost NEVER be used for calls where a real conversation happened. If the seller and agent talked about the deal, the property, pricing, motivation, or anything substantive, the outcome should reflect THAT conversation — not the fact that they agreed to talk again. Default to "interested" over "callback_scheduled" when in doubt.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_grade",
          strict: true,
          schema: {
            type: "object",
            properties: {
              criteriaScores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    score: { type: "number" },
                    maxPoints: { type: "number" },
                    feedback: { type: "string" },
                  },
                  required: ["name", "score", "maxPoints", "feedback"],
                  additionalProperties: false,
                },
              },
              strengths: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } },
              coachingTips: { type: "array", items: { type: "string" } },
              redFlags: { type: "array", items: { type: "string" } },
              objectionHandling: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    objection: { type: "string" },
                    context: { type: "string" },
                    suggestedResponses: { type: "array", items: { type: "string" } },
                  },
                  required: ["objection", "context", "suggestedResponses"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
              callOutcome: { 
                type: "string", 
                enum: ["none", "appointment_set", "offer_made", "offer_rejected", "callback_scheduled", "interested", "left_vm", "no_answer", "not_interested", "dead"] 
              },
              followUpScheduled: { type: "boolean" },
            },
            required: ["criteriaScores", "strengths", "improvements", "coachingTips", "redFlags", "objectionHandling", "summary", "callOutcome", "followUpScheduled"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error("No response from LLM");
    }

    const parsed = JSON.parse(content);
    
    // Calculate overall score
    const totalPoints = parsed.criteriaScores.reduce((sum: number, c: any) => sum + c.score, 0);
    const maxPoints = parsed.criteriaScores.reduce((sum: number, c: any) => sum + c.maxPoints, 0);
    let overallScore = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

    // Apply critical failure cap if applicable
    // Some rubrics (Follow-Up, Seller Callback) cap the score at 50% if critical failures are detected
    const rubricWithCriticalFailures = rubric;
    const critFailures = rubricWithCriticalFailures.criticalFailures;
    const critCap = rubricWithCriticalFailures.criticalFailureCap;
    if (critFailures && critFailures.length > 0 && critCap && critCap > 0) {
      const detectedRedFlags = parsed.redFlags || [];
      const hasCriticalFailure = critFailures.some((cf: string) =>
        detectedRedFlags.some((rf: string) => rf.toLowerCase().includes(cf.toLowerCase().substring(0, 30)))
      );
      if (hasCriticalFailure && overallScore > critCap) {
        console.log(`[Grading] Critical failure detected for ${callType} call. Capping score from ${overallScore.toFixed(1)}% to ${critCap}%`);
        overallScore = critCap;
      }
    }

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      overallGrade: getGradeFromScore(overallScore),
      criteriaScores: parsed.criteriaScores,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      coachingTips: parsed.coachingTips,
      redFlags: parsed.redFlags,
      objectionHandling: parsed.objectionHandling || [],
      summary: parsed.summary,
      callOutcome: parsed.callOutcome,
      followUpScheduled: parsed.followUpScheduled === true,
    };
  } catch (error) {
    console.error("[Grading] Error grading call:", error);
    throw error;
  }
}

// ============ TRANSCRIPTION FUNCTION ============

import { transcribeAudio } from "./_core/voiceTranscription";

export async function transcribeCallRecording(recordingUrl: string): Promise<{ text: string; durationSeconds?: number }> {
  try {
    const result = await transcribeAudio({
      audioUrl: recordingUrl,
      language: "en",
      prompt: "Real estate sales call between a lead manager and a property seller discussing selling their home",
    });

    // Check if it's an error response
    if ('error' in result) {
      throw new Error(result.error + (result.details ? `: ${result.details}` : ''));
    }

    // Extract duration from Whisper segments if available
    let durationSeconds: number | undefined;
    if (result.segments && result.segments.length > 0) {
      const lastSegment = result.segments[result.segments.length - 1];
      if (lastSegment.end) {
        durationSeconds = Math.round(lastSegment.end);
      }
    }

    return { text: result.text, durationSeconds };
  } catch (error) {
    console.error("[Transcription] Error transcribing call:", error);
    throw error;
  }
}

// ============ CALL CLASSIFICATION ============

const MINIMUM_CALL_DURATION_SECONDS = 60; // Calls under 60 seconds are auto-skipped

export type CallClassification = 
  | "conversation"      // Real conversation - should be graded
  | "voicemail"         // Left a voicemail
  | "no_answer"         // No one answered
  | "callback_request"  // Brief "call me back" type call
  | "wrong_number"      // Wrong number or disconnected
  | "too_short"         // Under minimum duration threshold
  | "admin_call";       // Administrative call (scheduling, follow-ups, etc.) - N/A for grading

export interface ClassificationResult {
  classification: CallClassification;
  reason: string;
  shouldGrade: boolean;
  summary?: string; // For admin_call: brief description of what the call was about
}

/**
 * Classify a call based on duration and transcript content
 * Returns whether the call should be graded or skipped
 */
export async function classifyCall(
  transcript: string,
  durationSeconds: number | null | undefined,
  industry?: string
): Promise<ClassificationResult> {
  // First check: Duration filter
  if (durationSeconds && durationSeconds < MINIMUM_CALL_DURATION_SECONDS) {
    return {
      classification: "too_short",
      reason: `Call duration (${durationSeconds}s) is under the ${MINIMUM_CALL_DURATION_SECONDS}s minimum threshold`,
      shouldGrade: false,
    };
  }

  // Second check: AI classification based on transcript content
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a call classification system for a ${industry || "real estate wholesaling/investing"} company.
Analyze the transcript and classify the call into one of these categories:

1. "conversation" - A SALES conversation where the rep is actively selling. This includes:
   - Initial qualification calls - asking about property, situation, motivation, timeline
   - Offer presentation calls - presenting an offer price for the FIRST TIME
   - Negotiation calls - discussing price, terms, counteroffers
   - Objection handling - addressing concerns about the offer or process
   - Appointment setting calls - scheduling meetings to discuss the property
   - Lead generation cold calls - calling homeowners to gauge interest in selling
   
2. "admin_call" - Post-sale or administrative calls with NO active selling:
   - POST-OFFER calls: Walking someone through signing documents AFTER an offer was already accepted
   - POST-OFFER NEXT STEPS: Discussing sending a purchase agreement for review/signature, explaining the closing process, scheduling construction partner visits, coordinating what happens AFTER the deal
   - Document/paperwork calls: Helping with e-signatures, DocuSign, purchase agreements, contracts
   - Technical support: Helping someone access emails, open documents, use platforms
   - Follow-up calls: Checking on status after offer was made, answering questions about closing
   - Scheduling logistics: Coordinating inspection times, closing dates, move-out dates
   - Vendor calls: Title companies, inspectors, attorneys
   - Internal team calls
   
   KEY INDICATOR: If the call is about SIGNING or REVIEWING a purchase agreement that was already presented, it's admin_call, NOT conversation.
   KEY INDICATOR: If the rep says they will SEND the purchase agreement for the seller to review/sign, and the call is about next steps after the offer, it's admin_call.
   KEY INDICATOR: If the rep is confirming property details (mortgage, ownership, deed) to PREPARE paperwork rather than to NEGOTIATE, it's admin_call.
   
3. "voicemail" - The rep left a voicemail message (one-sided, no response)

4. "no_answer" - Call went unanswered or disconnected quickly

5. "callback_request" - Very brief call (under 2 minutes) where someone just said "call me back" with no conversation

6. "wrong_number" - ONLY if the person explicitly says "wrong number" or "I don't own this property"

IMPORTANT RULES:
- If the call mentions "purchase agreement", "sign", "DocuSign", "e-signature", "contract to sign" - and the rep is HELPING them sign (not presenting an offer), it's admin_call
- If the rep says they will SEND a purchase agreement via email for the seller to review and sign, it's admin_call — the offer was already accepted
- If the call discusses next steps AFTER a deal (construction partner visit, closing timeline, title work), it's admin_call
- If the rep is confirming mortgage amounts, ownership details, or deed information to PREPARE the purchase agreement (not to negotiate price), it's admin_call
- If the call is troubleshooting email/technical issues related to receiving documents, it's admin_call
- If the offer price is being PRESENTED for the first time and actively negotiated, it's conversation
- If the offer was already made and they're discussing signing/reviewing/sending paperwork, it's admin_call
- Rapport-building (talking about personal topics) is a SALES TECHNIQUE when part of a sales call
- Only use "wrong_number" if explicitly stated

Respond with JSON only:
{
  "classification": "conversation" | "admin_call" | "voicemail" | "no_answer" | "callback_request" | "wrong_number",
  "reason": "Brief explanation of why this classification was chosen",
  "shouldGrade": true/false (only true for "conversation"),
  "summary": "For admin_call only: A 1-2 sentence summary of what the call was about (e.g., 'Helped seller sign purchase agreement via DocuSign. Resolved email access issues.'). For other classifications, leave empty string."
}`,
        },
        {
          role: "user",
          content: `Classify this call transcript:\n\n${transcript.substring(0, 3000)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              classification: {
                type: "string",
                enum: ["conversation", "admin_call", "voicemail", "no_answer", "callback_request", "wrong_number"],
              },
              reason: { type: "string" },
              shouldGrade: { type: "boolean" },
              summary: { type: "string" },
            },
            required: ["classification", "reason", "shouldGrade", "summary"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      // Default to conversation if classification fails
      return {
        classification: "conversation",
        reason: "Classification failed, defaulting to conversation",
        shouldGrade: true,
      };
    }

    const parsed = JSON.parse(content);
    return {
      classification: parsed.classification,
      reason: parsed.reason,
      shouldGrade: parsed.shouldGrade,
      summary: parsed.summary || undefined,
    };
  } catch (error) {
    console.error("[Classification] Error classifying call:", error);
    // Default to conversation if classification fails
    return {
      classification: "conversation",
      reason: "Classification error, defaulting to conversation",
      shouldGrade: true,
    };
  }
}

// ============ AI CALL TYPE DETECTION ============

/**
 * Detect call type from transcript content using AI
 * Returns a suggested call type based on what actually happened in the conversation
 */
export async function detectCallType(
  transcript: string,
  teamMemberRole?: string,
  industry?: string
): Promise<{ callType: GradableCallType; confidence: number; reason: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a call type classifier for a ${industry || "real estate wholesaling/investing"} company. Analyze the transcript and determine what type of call this is.

CALL TYPES:
1. "cold_call" - First contact with a homeowner. The caller is reaching out to someone who hasn't spoken with the company before. The goal is to gauge interest in selling, NOT to set appointments. Signs: introducing the company/themselves for the first time, asking if they've thought about selling, no prior relationship mentioned, caller explains why they're calling. IMPORTANT: A cold call does NOT stop being a cold call just because the seller engages or shares property details. If this is the FIRST conversation between the rep and the seller, it is a cold call — even if the seller talks about property condition, price history, motivation, or vacancy. Lead generators are expected to gather this information on cold calls.

2. "qualification" - A Lead Manager conducting a SCHEDULED follow-up qualification/diagnosis call with a lead who has ALREADY been contacted before and expressed interest. This is typically a Lead Manager calling back a lead that was generated by a Lead Generator. Signs: references to a previous conversation ("my colleague spoke with you", "you talked to someone on our team"), scheduled callback from a prior cold call, deeper qualification questions AFTER initial interest was already established. The key distinction from cold_call is that there was a PRIOR interaction — someone else (or the same person) already made first contact.
   IMPORTANT: "qualification" is specifically for Lead Managers qualifying leads. If an Acquisition Manager references a prior conversation with a colleague ("you spoke with my partner Dan"), this does NOT make it a qualification call — the AM is picking up where the lead generator left off to PRESENT AN OFFER. That is an "offer" call.

3. "follow_up" - Re-engaging a known lead after a PREVIOUS OFFER was already discussed or presented. The caller is checking in on a prior offer, referencing a previous offer amount, or trying to get a decision on an offer that was already made. Signs: "just following up", "checking in", references to a SPECIFIC previous offer amount ("we offered $X"), "last time we spoke about the offer", anchoring a previous price, seller rejecting or reconsidering a previously-made offer.
   CRITICAL: If the seller immediately references or rejects a PREVIOUS offer amount (e.g., "you offered $160,000" or "we'll have to pass on that"), this is a follow_up — NOT an offer. The offer was already made in a prior call. Even if the call is short, if it revolves around a previously-presented price, it is follow_up.

4. "offer" - The Acquisition Manager is PRESENTING an offer, NEGOTIATING price/terms, or BUILDING TOWARD an offer for the first time with this seller. This is the call where the AM discusses property value, repair costs, comparable sales, ARV, and/or states a specific dollar amount. Signs: discussing what the company can pay, property valuation, repair estimates, contract discussion, closing language, first-time price presentation or negotiation.
   KEY DISTINCTION FROM QUALIFICATION: When an Acquisition Manager calls a lead that was previously contacted by a Lead Generator or Lead Manager, and the AM is now discussing the property in detail to BUILD TOWARD or PRESENT an offer — this is an "offer" call, NOT "qualification". The AM's job is to make offers. If the AM references a prior conversation with a colleague ("you spoke with my partner", "Dan told me about your property") and then proceeds to discuss the property, gather details needed for pricing, or present an offer — this is "offer".
   KEY DISTINCTION FROM FOLLOW_UP: If no specific offer price was previously presented to the seller and this is the first time price/terms are being discussed, this is "offer" — even if there was a prior cold call or qualification call.
   CRITICAL: The word "offer" appearing in the transcript does NOT automatically make this an offer call if the context is about a PREVIOUSLY-MADE offer being referenced.

5. "seller_callback" - INBOUND call where the seller called the company back. High-intent signal. Signs: seller says "I got your letter/postcard/voicemail", "you called me earlier", seller is asking questions, seller initiated the contact. The rep should acknowledge the callback and capitalize on momentum.

6. "admin_callback" - OUTBOUND operational call about documents, scheduling, closing details, title info, walkthrough times, or scheduling a callback. NOT a sales call. Signs: discussing DocuSign, purchase agreements to sign/review, scheduling inspections, coordinating closing dates, helping with paperwork, vendor coordination, or simply scheduling a time to call back because the person is busy/unavailable. No active selling happening.
   POST-OFFER ADMIN CALLS: If the rep is discussing SENDING a purchase agreement for the seller to review/sign, walking through the signing process, explaining what happens after they sign, or following up on a deal that's already in progress — this is admin_callback, NOT offer. The offer was already made in a PREVIOUS call. Key phrases: "send you the purchase agreement", "review and sign", "get this signed", "email you the contract", "construction partner visit", "closing process".

CRITICAL RULES FOR CALL TYPE:
- "offer" includes ANY call where the acquisition manager is PRESENTING an offer price, BUILDING TOWARD an offer (gathering property details, discussing repairs, ARV, comps), or ACTIVELY NEGOTIATING price/terms with the seller. If the AM is on the call to eventually make an offer and is doing the groundwork for it, it IS an offer call.
- A SPECIFIC DOLLAR AMOUNT is NOT required to classify as "offer". Discussion of price ranges, comparable sales, repair costs, ARV, property condition assessment, or any financial negotiation qualifies.
- OFFER vs QUALIFICATION: If an Acquisition Manager is calling a lead that was previously contacted by someone else (Lead Generator or Lead Manager), and the AM is now gathering property details, discussing motivation, or building rapport to PRESENT AN OFFER — this is "offer", NOT "qualification". The qualification stage already happened. The AM is in the offer stage of the pipeline.
- OFFER vs FOLLOW_UP: If a SPECIFIC DOLLAR AMOUNT was already presented in a PREVIOUS call and this call references that amount (e.g., seller says "you offered $160,000", or rep says "the offer we discussed last time"), this is "follow_up" — NOT "offer". The offer was already made. Even short calls where the seller immediately rejects a previously-stated price are "follow_up".
- POST-OFFER vs OFFER: If the offer was already made in a previous call and this call is about NEXT STEPS (sending purchase agreement, getting signatures, scheduling inspections, coordinating closing), this is "admin_callback" — NOT "offer". Look for clues: "I'll send you the purchase agreement", "review and sign", "get the contract over to you", discussing what happens AFTER the deal is agreed upon.
- If the rep discusses mortgage amounts, property details, or ownership just to CONFIRM information for the purchase agreement (not to negotiate), it's admin_callback.
- If the person is busy/unavailable and the rep just schedules a callback, this is "admin_callback" — NOT "offer", "qualification", or "follow_up".
- If the call is very short (under 2 minutes) and consists only of scheduling a callback time, it is "admin_callback".
- If the rep mentions wanting to "discuss an offer" but the other person is unavailable and no offer is actually presented, it is "admin_callback".

ROLE-BASED GUIDANCE:
The team member's role is: ${teamMemberRole || "unknown"}.
- If the role is "acquisition_manager", DEFAULT to "offer" unless the transcript clearly shows it is an admin_callback, follow_up, wrong_number, or the AM is doing someone else's job (e.g., cold calling a new lead). Acquisition managers are in the offer stage of the pipeline — their calls are offer calls unless proven otherwise.
  EXCEPTIONS for acquisition_manager:
  - "admin_callback": AM is discussing sending a purchase agreement for signature, walking through closing steps, or coordinating post-offer logistics — the offer phase is OVER and this is now administrative.
  - "follow_up": AM is referencing a SPECIFIC DOLLAR AMOUNT that was already offered in a PREVIOUS call and the seller is responding to that previous offer (accepting, rejecting, countering). The key signal is that a specific price was already stated before this call.
  - DO NOT classify an AM's call as "qualification" just because the AM references a prior conversation with a colleague. When an AM says "you spoke with my partner Dan" or "my colleague told me about your property", this means the lead was GENERATED by someone else and the AM is now doing their job: making an offer. This is "offer".
- If the role is "lead_manager", DEFAULT to "qualification" unless the transcript clearly shows a different type.
- If the role is "lead_generator", DEFAULT to "cold_call" with HIGH confidence (0.8+). Lead generators make cold calls — that is their job. A lead generator's call should almost ALWAYS be classified as "cold_call". The ONLY exceptions are: (1) the transcript explicitly references a previous conversation with this specific seller, (2) the call is clearly an admin_callback (scheduling only, no selling). Do NOT classify a lead generator's call as "qualification" just because the seller engaged, shared property details, or discussed price history — that is normal cold call behavior.
- The transcript can override the role-based default, but only with STRONG clear evidence (e.g., explicit reference to a prior conversation, or LM presenting a specific offer price). A lead generator asking about property condition, motivation, or price on a first call is NOT qualification — it IS cold calling.

Respond with JSON only.`,
        },
        {
          role: "user",
          content: `Classify this call transcript (first 2000 chars):\n\n${transcript.substring(0, 2000)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_type_detection",
          strict: true,
          schema: {
            type: "object",
            properties: {
              callType: {
                type: "string",
                enum: ["cold_call", "qualification", "follow_up", "offer", "seller_callback", "admin_callback"],
              },
              confidence: {
                type: "number",
                description: "Confidence score from 0.0 to 1.0",
              },
              reason: {
                type: "string",
                description: "Brief explanation of why this call type was chosen",
              },
            },
            required: ["callType", "confidence", "reason"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { callType: "qualification", confidence: 0.3, reason: "AI detection failed, defaulting to qualification" };
    }

    const parsed = JSON.parse(content);
    return {
      callType: parsed.callType as GradableCallType,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      reason: parsed.reason,
    };
  } catch (error) {
    console.error("[CallTypeDetection] Error:", error);
    return { callType: "qualification", confidence: 0.3, reason: "AI detection error, defaulting to qualification" };
  }
}

// ============ PROCESS CALL FUNCTION ============

import { getCallById, updateCall, createCallGrade, getCallGradeByCallId, getTeamMemberById, getGradingContext } from "./db";
import { processCallViewRewards, evaluateBadgesForCall } from "./gamification";
import { canProcessCall } from "./planLimits";
import { getTenantById } from "./tenant";
import { sendCallGradedWebhook } from "./gunnerEngineWebhook";

export async function processCall(callId: number): Promise<void> {
  const call = await getCallById(callId);
  if (!call) {
    console.error(`[ProcessCall] Call ${callId} not found`);
    return;
  }

  if (!call.recordingUrl) {
    console.error(`[ProcessCall] Call ${callId} has no recording URL`);
    await updateCall(callId, { status: "failed" });
    return;
  }

  // Resolve missing contact name from GHL if we have a contactId
  if (!call.contactName && call.ghlContactId) {
    try {
      const { fetchGHLContactName } = await import('./ghlService');
      const name = await fetchGHLContactName(call.ghlContactId);
      if (name) {
        await updateCall(callId, { contactName: name });
        (call as any).contactName = name;
        console.log(`[ProcessCall] Resolved missing contact name for call ${callId}: ${name}`);
      }
    } catch (e) {
      // Non-critical, continue processing
      console.warn(`[ProcessCall] Could not resolve contact name for call ${callId}:`, e);
    }
  }

  // Prevent duplicate grades
  const existingGrade = await getCallGradeByCallId(callId);
  if (existingGrade) {
    console.log(`[ProcessCall] Call ${callId} already has a grade (id=${existingGrade.id}), skipping`);
    if (call.status !== 'completed') {
      await updateCall(callId, { status: 'completed' });
    }
    return;
  }

  // Check plan limits before processing
  if (call.tenantId) {
    const limitCheck = await canProcessCall(call.tenantId);
    if (!limitCheck.allowed) {
      console.log(`[ProcessCall] Call ${callId} skipped - tenant ${call.tenantId} has reached call limit`);
      await updateCall(callId, {
        status: "skipped",
        classification: "limit_reached",
        classificationReason: limitCheck.reason || "Monthly call grading limit reached. Please upgrade your plan.",
      });
      return;
    }
  }

  try {
    // Step 1: Check duration first (quick filter)
    // Under 30s: instant skip, no transcription needed
    // 30-60s: transcribe and generate a short summary, but still skip grading
    // 60s+: proceed to full classification and grading
    // Get tenant industry from crmConfig for LLM prompts (needed for summaries and classification)
    let tenantIndustry: string | undefined;
    if (call.tenantId) {
      const { parseCrmConfig } = await import("./tenant");
      const tenantForIndustry = await getTenantById(call.tenantId);
      if (tenantForIndustry) {
        const crmConfig = parseCrmConfig(tenantForIndustry);
        tenantIndustry = crmConfig.industry;
      }
    }

    if (call.duration && call.duration < 30) {
      console.log(`[ProcessCall] Call ${callId} is very short (${call.duration}s), skipping without transcription`);
      await updateCall(callId, {
        status: "skipped",
        classification: "too_short",
        classificationReason: `Call duration (${call.duration}s) is under 30s — too short for meaningful content`,
      });
      return;
    }

    if (call.duration && call.duration < MINIMUM_CALL_DURATION_SECONDS) {
      console.log(`[ProcessCall] Call ${callId} is short (${call.duration}s), transcribing for summary`);
      try {
        await updateCall(callId, { status: "transcribing" });
        const shortResult = await transcribeCallRecording(call.recordingUrl);
        const shortTranscript = shortResult.text;
        const shortUpdates: any = { transcript: shortTranscript };
        if (!call.duration && shortResult.durationSeconds) {
          shortUpdates.duration = shortResult.durationSeconds;
          console.log(`[ProcessCall] Updated null duration for call ${callId} from transcription: ${shortResult.durationSeconds}s`);
        }
        await updateCall(callId, shortUpdates);

        // Generate a brief summary of what happened
        if (shortTranscript && shortTranscript.length > 20) {
          const summaryResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You summarize phone calls for a ${tenantIndustry || "real estate wholesaling/investing"} company. Write a 1-2 sentence summary of what happened on this short call. Be specific and concise. Examples:
- "Left voicemail for homeowner about selling their property on Oak St."
- "Callback request — seller asked to be called back next Tuesday."
- "Brief conversation, homeowner said they're not interested in selling right now."
- "Wrong number — person does not own the property."
- "Seller answered but was busy, asked to call back later."`
              },
              {
                role: "user",
                content: `This was a short call (${call.duration}s). Summarize what happened:\n\n${shortTranscript.substring(0, 2000)}`
              }
            ],
          });
          const summary = summaryResponse.choices[0]?.message?.content;
          if (summary && typeof summary === 'string') {
            await updateCall(callId, {
              status: "skipped",
              classification: "too_short",
              classificationReason: summary.trim(),
            });
            console.log(`[ProcessCall] Short call ${callId} summarized: ${summary.trim().substring(0, 80)}...`);
            return;
          }
        }
      } catch (err) {
        console.error(`[ProcessCall] Failed to transcribe/summarize short call ${callId}:`, err);
      }

      // Fallback if transcription/summary fails
      await updateCall(callId, {
        status: "skipped",
        classification: "too_short",
        classificationReason: `Call duration (${call.duration}s) is under the ${MINIMUM_CALL_DURATION_SECONDS}s minimum threshold`,
      });
      return;
    }

    // Step 2: Transcribe
    await updateCall(callId, { status: "transcribing" });
    const transcriptionResult = await transcribeCallRecording(call.recordingUrl);
    const transcript = transcriptionResult.text;
    const transcriptUpdates: any = { transcript };
    // Update duration from transcription if it was null (e.g., GHL didn't provide it)
    if (!call.duration && transcriptionResult.durationSeconds) {
      transcriptUpdates.duration = transcriptionResult.durationSeconds;
      console.log(`[ProcessCall] Updated null duration for call ${callId} from transcription: ${transcriptionResult.durationSeconds}s`);
    }
    await updateCall(callId, transcriptUpdates);

    // Handle empty transcripts (silent recordings, dial tones, etc.)
    if (!transcript || transcript.trim().length < 10) {
      console.log(`[ProcessCall] Call ${callId} has empty/minimal transcript (${transcript?.length || 0} chars), skipping as too_short`);
      await updateCall(callId, {
        status: "skipped",
        classification: "too_short",
        classificationReason: transcript
          ? `Recording contained minimal speech: "${transcript.trim().substring(0, 100)}"`
          : "Recording contained no detectable speech (silent or empty audio)",
      });
      return;
    }

    // Step 2.5: Resolve contact name — check cache, then GHL API, then LLM transcript extraction
    const nameIsMissing = !call.contactName || !call.contactName.includes(' ');
    if (nameIsMissing) {
      const currentName = call.contactName || '';
      let resolvedName: string | null = null;

      // Try 1: Check contact_cache for full name
      if (call.ghlContactId) {
        try {
          const { getDb } = await import('./db');
          const { contactCache } = await import('../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          const dbConn = await getDb();
          if (!dbConn) throw new Error('No DB connection');
          const [cached] = await dbConn.select().from(contactCache).where(eq(contactCache.ghlContactId, call.ghlContactId)).limit(1);
          if (cached?.name && cached.name.includes(' ')) {
            resolvedName = cached.name;
            console.log(`[ProcessCall] Resolved full name from contact cache for call ${callId}: ${resolvedName}`);
          } else if (cached?.firstName && cached?.lastName) {
            resolvedName = `${cached.firstName} ${cached.lastName}`;
            console.log(`[ProcessCall] Resolved full name from cache first+last for call ${callId}: ${resolvedName}`);
          }
        } catch (e) {
          console.warn(`[ProcessCall] Contact cache lookup failed for call ${callId}:`, e);
        }
      }

      // Try 2: Fetch from GHL Contact API
      if (!resolvedName && call.ghlContactId) {
        try {
          const { fetchGHLContactName } = await import('./ghlService');
          const ghlName = await fetchGHLContactName(call.ghlContactId);
          if (ghlName && ghlName.includes(' ')) {
            resolvedName = ghlName;
            console.log(`[ProcessCall] Resolved full name from GHL API for call ${callId}: ${resolvedName}`);
          }
        } catch (e) {
          console.warn(`[ProcessCall] GHL contact name lookup failed for call ${callId}:`, e);
        }
      }

      // Try 3: Extract from transcript via LLM
      if (!resolvedName) {
        try {
          const nameResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `Extract the contact/lead/seller's FULL NAME (first AND last name) from this phone call transcript. The caller (sales rep) is ${call.teamMemberName || 'the rep'}. Return ONLY the other person's full name. You MUST include both first and last name if they are mentioned anywhere in the conversation. If only a first name is used, still try to find the last name from context. If you truly cannot determine the last name, return just the first name. If you cannot determine any name, return "Unknown".`
              },
              {
                role: "user",
                content: transcript.substring(0, 3000)
              }
            ],
          });
          const rawContent = nameResponse.choices[0]?.message?.content;
          const extractedName = typeof rawContent === 'string' ? rawContent.trim() : undefined;
          if (extractedName && extractedName !== "Unknown" && extractedName.length < 60) {
            // Only use LLM name if it's better than what we have
            if (!currentName || extractedName.includes(' ') || !currentName.includes(' ')) {
              resolvedName = extractedName;
              console.log(`[ProcessCall] Extracted contact name from transcript for call ${callId}: ${resolvedName}`);
            }
          }
        } catch (e) {
          console.warn(`[ProcessCall] Could not extract contact name from transcript for call ${callId}:`, e);
        }
      }

      // Apply the resolved name if we found something better
      if (resolvedName && resolvedName !== currentName) {
        await updateCall(callId, { contactName: resolvedName });
        (call as any).contactName = resolvedName;
        console.log(`[ProcessCall] Updated contact name for call ${callId}: "${currentName}" -> "${resolvedName}"`);
      }
    }

    // Step 3: Classify the call
    await updateCall(callId, { status: "classifying" });
    const classificationResult = await classifyCall(transcript, call.duration, tenantIndustry);
    
    await updateCall(callId, {
      classification: classificationResult.classification,
      classificationReason: classificationResult.reason,
    });

    // If not a real conversation, handle accordingly
    if (!classificationResult.shouldGrade) {
      // Admin calls get auto-graded with the admin_callback rubric
      if (classificationResult.classification === "admin_call") {
        console.log(`[ProcessCall] Call ${callId} classified as admin_call, auto-grading with admin rubric`);
        
        // Save summary to classificationReason
        if (classificationResult.summary) {
          await updateCall(callId, { classificationReason: classificationResult.summary });
        }
        
        // Proceed to grade with admin_callback rubric (don't return — fall through to grading)
        await updateCall(callId, { status: "grading" });
        
        let teamMemberName = call.teamMemberName || "Team Member";
        if (call.teamMemberId) {
          const teamMember = await getTeamMemberById(call.teamMemberId);
          if (teamMember) teamMemberName = teamMember.name;
        }
        
        // Get tenant company name and grading context (including tenant rubrics)
        let companyName: string | undefined;
        if (call.tenantId) {
          const tenant = await getTenantById(call.tenantId);
          if (tenant) companyName = tenant.name;
        }
        
        // Fetch grading context so tenant-specific rubrics are used for admin_callback too
        const adminGradingContext = await getGradingContext("qualification", call.tenantId ?? undefined);
        
        const gradeResult = await gradeCall(transcript, "admin_callback", teamMemberName, {
          companyName,
          industry: tenantIndustry,
          trainingMaterials: adminGradingContext.trainingMaterials.map(m => ({
            title: m.title,
            content: m.content,
            category: m.category,
          })),
          gradingRules: adminGradingContext.gradingRules.map(r => ({
            title: r.title,
            ruleText: r.ruleText,
            priority: r.priority,
          })),
          recentFeedback: adminGradingContext.recentFeedback.map(f => ({
            feedbackType: f.feedbackType,
            explanation: f.explanation,
            correctBehavior: f.correctBehavior,
          })),
          tenantRubrics: adminGradingContext.tenantRubrics,
        });
        
        await createCallGrade({
          callId: call.id,
          overallScore: gradeResult.overallScore.toString(),
          overallGrade: gradeResult.overallGrade,
          criteriaScores: gradeResult.criteriaScores,
          strengths: gradeResult.strengths,
          improvements: gradeResult.improvements,
          coachingTips: gradeResult.coachingTips,
          redFlags: gradeResult.redFlags,
          objectionHandling: gradeResult.objectionHandling || [],
          summary: gradeResult.summary,
          rubricType: "admin_callback",
          tenantId: call.tenantId ?? 1,
        });
        
        await updateCall(callId, {
          status: "completed",
          callType: "admin_callback",
          callTypeSource: "auto",
          classification: "admin_call",
          callOutcome: gradeResult.callOutcome,
          followUpScheduled: gradeResult.followUpScheduled ? "true" : "false",
        });
        
        console.log(`[ProcessCall] Admin call ${callId} auto-graded: ${gradeResult.overallGrade} (${gradeResult.overallScore}%)`);

        // Step: Fire webhook to Gunner Engine for admin_callback grading
        try {
          await sendCallGradedWebhook({
            callId: call.id.toString(),
            contactId: call.ghlContactId || "",
            teamMember: teamMemberName,
            grade: gradeResult.overallGrade,
            score: gradeResult.overallScore,
            transcript: transcript.substring(0, 10000),
            coachingFeedback: [
              ...(gradeResult.strengths || []).map((s: string) => `Strength: ${s}`),
              ...(gradeResult.improvements || []).map((i: string) => `Improve: ${i}`),
              ...(gradeResult.coachingTips || []),
            ].join('\n'),
            callType: "admin_callback",
            duration: call.duration || 0,
            propertyAddress: call.propertyAddress || undefined,
            phone: call.contactPhone || "",
            timestamp: call.callTimestamp?.toISOString() || new Date().toISOString(),
          }, call.tenantId, call.id);
        } catch (webhookError) {
          console.error(`[ProcessCall] Webhook failed for admin call ${callId}:`, webhookError);
          // Don't block grading if webhook fails
        }

        return;
      }
      
      // All other non-gradable classifications (voicemail, no_answer, etc.) get skipped
      console.log(`[ProcessCall] Call ${callId} classified as ${classificationResult.classification}, skipping grading`);
      
      // Generate a brief summary for skipped calls over 30 seconds (they had some conversation)
      if (call.duration && call.duration >= 30 && transcript && transcript.length > 50) {
        try {
          const summaryResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You summarize phone calls for a ${tenantIndustry || "real estate wholesaling/investing"} company. Write a 1-2 sentence summary of what happened on this call. Be specific and concise. Examples:
- "Left voicemail for homeowner about selling their property on Oak St."
- "Callback request — seller asked to be called back next Tuesday."
- "Brief conversation, homeowner said they're not interested in selling right now."
- "Wrong number — person does not own the property."`
              },
              {
                role: "user",
                content: `Classification: ${classificationResult.classification}\nReason: ${classificationResult.reason}\n\nTranscript:\n${transcript.substring(0, 2000)}`
              }
            ],
          });
          const summary = summaryResponse.choices[0]?.message?.content;
          if (summary && typeof summary === 'string') {
            await updateCall(callId, { classificationReason: summary.trim() });
            console.log(`[ProcessCall] Generated summary for skipped call ${callId}: ${summary.trim().substring(0, 80)}...`);
          }
        } catch (err) {
          console.error(`[ProcessCall] Failed to generate summary for skipped call ${callId}:`, err);
          // Non-critical — don't block the skip
        }
      }
      
      await updateCall(callId, { status: "skipped" });
      return;
    }

    // Step 4: Grade (only for real conversations)
    await updateCall(callId, { status: "grading" });
    
    // Determine call type using a 3-tier approach:
    // 1. If manually set (callTypeSource === "manual"), use it as-is
    // 2. Otherwise, use AI detection from transcript
    // 3. Fall back to team member role-based inference
    let callType: GradableCallType = (call.callType as GradableCallType) || "qualification";
    let callTypeSource = call.callTypeSource || "ai_suggested";
    let teamMemberName = call.teamMemberName || "Team Member";
    let teamMemberRole: string | undefined;
    
    if (call.teamMemberId) {
      const teamMember = await getTeamMemberById(call.teamMemberId);
      if (teamMember) {
        teamMemberName = teamMember.name;
        teamMemberRole = teamMember.teamRole;
      }
    }

    // Only auto-detect if not manually set
    if (callTypeSource !== "manual") {
      // Try AI detection from transcript
      const aiDetection = await detectCallType(transcript, teamMemberRole, tenantIndustry);
      console.log(`[ProcessCall] AI detected call type: ${aiDetection.callType} (confidence: ${aiDetection.confidence}, reason: ${aiDetection.reason})`);
      
      if (aiDetection.confidence >= 0.6) {
        // High confidence: use AI suggestion
        callType = aiDetection.callType;
        callTypeSource = "ai_suggested";
      } else if (aiDetection.confidence >= 0.4) {
        // Medium confidence: use AI suggestion but log it
        callType = aiDetection.callType;
        callTypeSource = "ai_suggested";
        console.log(`[ProcessCall] Using medium-confidence AI detection for call ${callId}: ${aiDetection.callType} (${aiDetection.confidence})`);
      } else {
        // Low confidence: fall back to role-based inference
        if (teamMemberRole === "lead_generator") {
          callType = "cold_call";
        } else if (teamMemberRole === "acquisition_manager") {
          // Acquisition managers are in the offer stage — default to offer
          callType = "offer";
        } else {
          // Default to qualification for lead_managers
          callType = "qualification";
        }
        callTypeSource = "auto";
        console.log(`[ProcessCall] Low confidence AI detection for call ${callId}, using role-based fallback: ${callType} (role: ${teamMemberRole})`);
      }
    }

    // Map callType to grading context type for fetching training materials
    const gradingContextType = callType === "cold_call" ? "lead_generation" as const
      : callType === "offer" ? "offer" as const
      : "qualification" as const;

    // Fetch grading context (training materials, rules, feedback)
    const gradingContext = await getGradingContext(gradingContextType, call.tenantId ?? undefined);
    
    // Get tenant company name for grading prompt
    let companyName: string | undefined;
    if (call.tenantId) {
      const tenant = await getTenantById(call.tenantId);
      if (tenant) companyName = tenant.name;
    }

    const gradeResult = await gradeCall(transcript, callType, teamMemberName, {
      trainingMaterials: gradingContext.trainingMaterials.map(m => ({
        title: m.title,
        content: m.content,
        category: m.category,
      })),
      gradingRules: gradingContext.gradingRules.map(r => ({
        title: r.title,
        ruleText: r.ruleText,
        priority: r.priority,
      })),
      recentFeedback: gradingContext.recentFeedback.map(f => ({
        feedbackType: f.feedbackType,
        explanation: f.explanation,
        correctBehavior: f.correctBehavior,
      })),
      companyName,
      industry: tenantIndustry,
      tenantRubrics: gradingContext.tenantRubrics,
    });

    // Map callType to rubricType for storage
    const rubricType = callType === "cold_call" ? "lead_generator" as const
      : callType === "offer" ? "acquisition_manager" as const
      : callType === "follow_up" ? "follow_up" as const
      : callType === "seller_callback" ? "seller_callback" as const
      : callType === "admin_callback" ? "admin_callback" as const
      : "lead_manager" as const;

    // Step 5: Save grade
    await createCallGrade({
      callId: call.id,
      overallScore: gradeResult.overallScore.toString(),
      overallGrade: gradeResult.overallGrade,
      criteriaScores: gradeResult.criteriaScores,
      strengths: gradeResult.strengths,
      improvements: gradeResult.improvements,
      coachingTips: gradeResult.coachingTips,
      redFlags: gradeResult.redFlags,
      objectionHandling: gradeResult.objectionHandling || [],
      summary: gradeResult.summary,
      rubricType,
      tenantId: call.tenantId ?? 1,
    });

    // Step 6: Mark complete and save outcome
    await updateCall(callId, { 
      status: "completed", 
      callType,
      callTypeSource,
      classification: "conversation",
      callOutcome: gradeResult.callOutcome,
      followUpScheduled: gradeResult.followUpScheduled ? "true" : "false",
    });

    // Step 7: Award XP automatically
    if (call.teamMemberId) {
      try {
        const xpResult = await processCallViewRewards(call.teamMemberId, call.id);
        if (xpResult.xpEarned > 0) {
          console.log(`[ProcessCall] Awarded ${xpResult.xpEarned} XP to team member ${call.teamMemberId} for call ${callId}`);
        }
      } catch (xpError) {
        console.error(`[ProcessCall] Failed to award XP for call ${callId}:`, xpError);
        // Don't fail the whole process if XP award fails
      }
    }

    // Step 8: Evaluate badges at grading time (based on chronological call order)
    if (call.teamMemberId) {
      try {
        const badgesEarned = await evaluateBadgesForCall(call.teamMemberId, call.id);
        if (badgesEarned.length > 0) {
          console.log(`[ProcessCall] Badges earned for team member ${call.teamMemberId}: ${badgesEarned.join(', ')}`);
        }
      } catch (badgeError) {
        console.error(`[ProcessCall] Failed to evaluate badges for call ${callId}:`, badgeError);
        // Don't fail the whole process if badge evaluation fails
      }
    }

    // Step 9: Fire webhook to Gunner Engine
    try {
      await sendCallGradedWebhook({
        callId: call.id.toString(),
        contactId: call.ghlContactId || "",
        teamMember: teamMemberName,
        grade: gradeResult.overallGrade,
        score: gradeResult.overallScore,
        transcript: (call.transcript || transcript).substring(0, 10000),
        coachingFeedback: [
          ...(gradeResult.strengths || []).map((s: string) => `Strength: ${s}`),
          ...(gradeResult.improvements || []).map((i: string) => `Improve: ${i}`),
          ...(gradeResult.coachingTips || []),
        ].join('\n'),
        callType: callType,
        duration: call.duration || 0,
        propertyAddress: call.propertyAddress || undefined,
        phone: call.contactPhone || "",
        timestamp: call.callTimestamp?.toISOString() || new Date().toISOString(),
      }, call.tenantId, call.id);
    } catch (webhookError) {
      console.error(`[ProcessCall] Webhook failed for call ${callId}:`, webhookError);
      // Don't block grading if webhook fails
    }

    // Step 10: Auto-generate next steps so they're ready when user opens the call
    try {
      await generateAndStoreNextSteps(callId);
      console.log(`[ProcessCall] Next steps generated for call ${callId}`);
    } catch (nextStepsError) {
      console.error(`[ProcessCall] Failed to generate next steps for call ${callId}:`, nextStepsError);
      // Don't fail the whole process if next steps generation fails
    }

    console.log(`[ProcessCall] Successfully processed call ${callId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ProcessCall] Error processing call ${callId}:`, errorMsg);
    
    // For transient DB errors (DrizzleQueryError / connection issues), truncate the error message
    // to avoid storing the full transcript text in classificationReason
    let storedError = errorMsg;
    if (errorMsg.startsWith('Failed query:')) {
      // DrizzleQueryError includes the full query + params in the message
      // Just store the query part, not the params (which may contain the full transcript)
      const paramsIdx = errorMsg.indexOf('\nparams:');
      storedError = paramsIdx > 0 
        ? errorMsg.substring(0, paramsIdx) + ' (transient DB error — will auto-retry)'
        : errorMsg.substring(0, 200) + '... (truncated)';
    }
    
    await updateCall(callId, { status: "failed", classificationReason: storedError });
  }
}


// ============ AUTO-GENERATE NEXT STEPS ============

async function generateAndStoreNextSteps(callId: number): Promise<void> {
  const call = await getCallById(callId);
  if (!call) return;

  const grade = await getCallGradeByCallId(callId);
  const tenantId = call.tenantId;

  // 1. Fetch prior calls for same contact
  let priorCallsSummary = "";
  if (call.ghlContactId) {
    try {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (db) {
        const { calls: callsTable } = await import("../drizzle/schema");
        const { eq, and, ne, desc } = await import("drizzle-orm");
        const priorCalls = await db.select()
          .from(callsTable)
          .where(and(
            eq(callsTable.ghlContactId, call.ghlContactId!),
            ne(callsTable.id, call.id)
          ))
          .orderBy(desc(callsTable.callTimestamp))
          .limit(5);

        if (priorCalls.length > 0) {
          priorCallsSummary = "\n\nPRIOR CALLS WITH THIS CONTACT:\n";
          for (const pc of priorCalls) {
            priorCallsSummary += `- ${pc.callTimestamp ? new Date(pc.callTimestamp).toLocaleDateString() : 'Unknown date'}`;
            priorCallsSummary += ` | ${pc.callType || 'unknown'} | Outcome: ${pc.callOutcome || 'none'}`;
            priorCallsSummary += ` | ${pc.teamMemberName || 'Unknown'}\n`;
          }
        }
      }
    } catch (e) {
      console.error("[NextSteps-Auto] Failed to fetch prior calls:", e);
    }
  }

  // 2. Fetch GHL SMS history
  let smsHistory = "";
  if (call.ghlContactId && tenantId) {
    try {
      const { getCredentialsForTenant, ghlFetch } = await import("./ghlActions");
      const creds = await getCredentialsForTenant(tenantId);
      if (creds) {
        const searchData = await ghlFetch(
          creds,
          `/conversations/search?locationId=${creds.locationId}&contactId=${call.ghlContactId}`
        );
        const conversations = searchData.conversations || [];
        if (conversations.length > 0) {
          const convId = conversations[0].id;
          const msgData = await ghlFetch(creds, `/conversations/${convId}/messages`);
          const messages = msgData.messages?.messages || msgData.messages || [];
          const recentMsgs = messages.slice(-10);
          if (recentMsgs.length > 0) {
            smsHistory = "\n\nRECENT SMS HISTORY:\n";
            for (const msg of recentMsgs) {
              const dir = msg.direction === 1 ? "SENT" : "RECEIVED";
              const date = msg.dateAdded ? new Date(msg.dateAdded).toLocaleString() : 'Unknown';
              smsHistory += `[${dir}] ${date}: ${msg.body || '(no text)'}\n`;
            }
          }
        }
      }
    } catch (e) {
      console.error("[NextSteps-Auto] Failed to fetch SMS history:", e);
    }
  }

  // 3. Fetch existing tasks
  let existingTasks = "";
  if (call.ghlContactId && tenantId) {
    try {
      const { getTasksForContact } = await import("./ghlActions");
      const tasks = await getTasksForContact(tenantId, call.ghlContactId);
      if (tasks.length > 0) {
        existingTasks = "\n\nEXISTING TASKS:\n";
        for (const t of tasks) {
          existingTasks += `- ${t.title} | Due: ${t.dueDate || 'No date'} | ${t.completed ? 'COMPLETED' : 'PENDING'}\n`;
        }
      }
    } catch (e) {
      console.error("[NextSteps-Auto] Failed to fetch tasks:", e);
    }
  }

  // 4. Fetch recent action patterns
  let recentActionPatterns = "";
  if (tenantId) {
    try {
      const { getDb: getDb2 } = await import("./db");
      const db2 = await getDb2();
      if (db2) {
        const { coachActionLog } = await import("../drizzle/schema");
        const { eq, and, desc } = await import("drizzle-orm");
        const recentActions = await db2.select()
          .from(coachActionLog)
          .where(and(
            eq(coachActionLog.tenantId, tenantId),
            eq(coachActionLog.status, "executed")
          ))
          .orderBy(desc(coachActionLog.createdAt))
          .limit(30);

        if (recentActions.length > 0) {
          recentActionPatterns = "\n\nRECENT ACTION PATTERNS:\n";
          for (const a of recentActions) {
            const payload = a.payload as any;
            recentActionPatterns += `- ${a.actionType} for ${a.targetContactName || 'unknown'}`;
            if (payload?.stageName) recentActionPatterns += ` → Stage: ${payload.stageName}`;
            if (payload?.pipelineName) recentActionPatterns += ` in ${payload.pipelineName}`;
            if (payload?.dueDate) recentActionPatterns += ` | Due: ${payload.dueDate}`;
            if (payload?.title) recentActionPatterns += ` | Title: ${payload.title}`;
            recentActionPatterns += "\n";
          }
        }
      }
    } catch (e) {
      console.error("[NextSteps-Auto] Failed to fetch action patterns:", e);
    }
  }

  // 5. Fetch current pipeline stage for this contact
  let currentStageInfo = "";
  let currentStageName = "";
  let currentPipelineName = "";
  let currentStageIndex = -1;
  let allStageNames: string[] = [];
  if (call.ghlContactId && tenantId) {
    try {
      const { findAllOpportunitiesByContact, getPipelinesForTenant } = await import("./ghlActions");
      const opps = await findAllOpportunitiesByContact(tenantId, call.ghlContactId).catch(() => []);
      const pipelines = await getPipelinesForTenant(tenantId).catch(() => [] as any[]);
      
      if (opps.length > 0 && pipelines.length > 0) {
        const currentOpp = opps[0]; // most recently updated
        for (const p of pipelines) {
          const stageMatch = p.stages.find((s: any) => s.id === currentOpp.stageId);
          if (stageMatch) {
            currentPipelineName = p.name;
            currentStageName = stageMatch.name;
            allStageNames = p.stages.map((s: any) => s.name);
            currentStageIndex = p.stages.findIndex((s: any) => s.id === currentOpp.stageId);
            currentStageInfo = `\n\nCURRENT PIPELINE POSITION:\n- Pipeline: "${p.name}"\n- Current Stage: "${stageMatch.name}" (position ${currentStageIndex + 1} of ${p.stages.length})\n- Stage Order: ${p.stages.map((s: any, i: number) => i === currentStageIndex ? `[${s.name}] ← CURRENT` : s.name).join(" → ")}\n`;
            break;
          }
        }
      }
    } catch (e) {
      console.warn("[NextSteps-Auto] Current stage fetch error (non-blocking):", e);
    }
  }

  // 6. Fetch available pipelines and workflows (each wrapped individually to prevent one failure from blocking the other)
  let availableOptions = "";
  if (tenantId) {
    try {
      const { getPipelinesForTenant } = await import("./ghlActions");
      const pipelines = await getPipelinesForTenant(tenantId).catch((e: any) => {
        console.warn("[NextSteps-Auto] Pipeline fetch failed (non-blocking):", e?.message || e);
        return [] as any[];
      });
      if (pipelines.length > 0) {
        availableOptions += "\n\nAVAILABLE PIPELINES AND STAGES:\n";
        for (const p of pipelines) {
          availableOptions += `Pipeline: "${p.name}" → Stages: ${p.stages.map((s: any) => `"${s.name}"`).join(", ")}\n`;
        }
      }
    } catch (e) {
      console.warn("[NextSteps-Auto] Pipeline fetch error (non-blocking):", e);
    }
    try {
      const { getWorkflowsForTenant } = await import("./ghlActions");
      const workflows = await getWorkflowsForTenant(tenantId).catch((e: any) => {
        console.warn("[NextSteps-Auto] Workflow fetch failed (non-blocking):", e?.message || e);
        return [] as any[];
      });
      if (workflows.length > 0) {
        availableOptions += "\nAVAILABLE WORKFLOWS:\n";
        for (const w of workflows) {
          availableOptions += `- "${w.name}"\n`;
        }
      }
    } catch (e) {
      console.warn("[NextSteps-Auto] Workflow fetch error (non-blocking):", e);
    }
  }

  const systemPrompt = `You are an AI assistant for a real estate flipping/wholesaling business. Analyze the call transcript and all context to suggest specific, actionable next steps.

RULES:
- Only suggest actions clearly warranted by the call content and communication history
- Learn from recent action patterns — match what the team typically does
- Use EXACT pipeline stage names and workflow names from available options
- For tasks, suggest realistic due dates based on what was discussed
- For SMS, draft messages referencing specific call details (property, price, concerns)
- Do NOT suggest redundant actions (check existing tasks first)
- Do NOT suggest actions contradicting the call outcome
- Each action needs a clear reason WHY based on the call context
- Keep note content comprehensive but concise — include call summary, key details, and motivation type

PIPELINE STAGE CHANGE RULES (CRITICAL):
- ALWAYS check the CURRENT PIPELINE POSITION before suggesting any stage change
- NEVER suggest moving to the stage the contact is ALREADY in — that's pointless
- NEVER suggest moving BACKWARD in the pipeline unless the deal fell apart completely
- Only suggest moving FORWARD (to a later stage) based on what happened on the call
- If the contact is already at or past "Made Offer", do NOT suggest "Made Offer" again
- If an offer was REJECTED: move to a follow-up stage (e.g., "Follow Up", "Nurture", "Long Term Follow Up") — NOT back to "Made Offer"
- If an offer was ACCEPTED: move forward past "Made Offer" to the next stage (e.g., "Under Contract", "Closing", "Pending")
- If the seller needs time to think: keep them at current stage or move to follow-up, do NOT re-suggest the same stage
- If the call was just a follow-up check-in with no new developments: do NOT suggest any stage change
- Think about it: what stage should this contact ACTUALLY be in based on where they are NOW and what happened on THIS call?

Return JSON with "actions" array. Each action:
- actionType: "check_off_task" | "update_task" | "create_task" | "add_note" | "create_appointment" | "change_pipeline_stage" | "send_sms" | "schedule_sms" | "add_to_workflow" | "remove_from_workflow"
- reason: 1-2 sentence explanation
- suggested: boolean
- payload: object with ALL of these fields (set unused ones to empty string ""):
  noteBody, title, description, dueDate, taskKeyword, message, scheduledDate, scheduledTime, pipelineName, stageName, workflowName, startTime, endTime, calendarName
  For add_note: fill noteBody with the actual note content. For create_task: fill title, description, dueDate. For change_pipeline_stage: fill pipelineName and stageName. For send_sms: fill message. Etc.`;

  const userPrompt = `CALL DETAILS:
- Contact: ${call.contactName || 'Unknown'}
- Phone: ${call.contactPhone || 'Unknown'}
- Property: ${call.propertyAddress || 'Unknown'}
- Call Type: ${call.callType || 'Unknown'}
- Call Outcome: ${call.callOutcome || 'None'}
- Team Member: ${call.teamMemberName || 'Unknown'}
- Duration: ${call.duration ? Math.floor(call.duration / 60) + 'm ' + (call.duration % 60) + 's' : 'Unknown'}
- Date: ${call.callTimestamp ? new Date(call.callTimestamp).toLocaleString() : 'Unknown'}

GRADE: ${grade?.summary || 'No grade available'}

TRANSCRIPT:
${(call.transcript || 'No transcript').substring(0, 8000)}
${priorCallsSummary}${smsHistory}${existingTasks}${recentActionPatterns}${currentStageInfo}${availableOptions}

Suggest the most relevant next steps for this lead. Remember: check the CURRENT PIPELINE POSITION before suggesting any stage changes — never suggest the stage they're already in.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "next_steps",
        strict: true,
        schema: {
          type: "object",
          properties: {
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  actionType: { type: "string" },
                  reason: { type: "string" },
                  suggested: { type: "boolean" },
                  payload: {
                    type: "object",
                    properties: {
                      noteBody: { type: "string", description: "Full note content for add_note actions" },
                      title: { type: "string", description: "Task or appointment title" },
                      description: { type: "string", description: "Task description or details" },
                      dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
                      taskKeyword: { type: "string", description: "Keyword to find existing task" },
                      message: { type: "string", description: "SMS message text" },
                      scheduledDate: { type: "string", description: "Scheduled send date YYYY-MM-DD" },
                      scheduledTime: { type: "string", description: "Scheduled send time HH:mm" },
                      pipelineName: { type: "string", description: "Exact pipeline name" },
                      stageName: { type: "string", description: "Exact stage name" },
                      workflowName: { type: "string", description: "Exact workflow name" },
                      startTime: { type: "string", description: "Appointment start time ISO" },
                      endTime: { type: "string", description: "Appointment end time ISO" },
                      calendarName: { type: "string", description: "Calendar name" },
                    },
                    required: ["noteBody", "title", "description", "dueDate", "taskKeyword", "message", "scheduledDate", "scheduledTime", "pipelineName", "stageName", "workflowName", "startTime", "endTime", "calendarName"],
                    additionalProperties: false,
                  },
                },
                required: ["actionType", "reason", "suggested", "payload"],
                additionalProperties: false,
              },
            },
          },
          required: ["actions"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) return;

  try {
    const parsed = JSON.parse(content as string);
    const VALID_TYPES = [
      "check_off_task", "update_task", "create_task", "add_note",
      "create_appointment", "change_pipeline_stage", "send_sms",
      "schedule_sms", "add_to_workflow", "remove_from_workflow",
    ];
    const validActions = (parsed.actions || []).filter((a: any) =>
      VALID_TYPES.includes(a.actionType)
    );

    if (validActions.length > 0) {
      const { getDb: getDb3 } = await import("./db");
      const db3 = await getDb3();
      if (db3) {
        const { callNextSteps } = await import("../drizzle/schema");
        for (const action of validActions) {
          await db3.insert(callNextSteps).values({
            callId,
            tenantId: tenantId || undefined,
            actionType: action.actionType,
            reason: action.reason,
            suggested: action.suggested ? "true" : "false",
            payload: action.payload,
            status: "pending",
          });
        }
        console.log(`[NextSteps-Auto] Stored ${validActions.length} next steps for call ${callId}`);
      }
    }
  } catch (e) {
    console.error("[NextSteps-Auto] Failed to parse/store next steps:", e);
  }
}
