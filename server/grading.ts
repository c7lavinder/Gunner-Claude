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
      description: "Explained call structure, working together process, comfort with saying 'not a good fit'",
      keyPhrases: ["Let me explain what this call will look like", "comfortable saying not a good fit"],
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
    "Not setting clear expectations",
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
export type CallOutcome = "none" | "appointment_set" | "offer_made" | "callback_scheduled" | "interested" | "left_vm" | "no_answer" | "not_interested" | "dead";

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
    tenantRubrics?: { name: string; description: string | null; criteria: string }[];
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
    const tenantRubric = context.tenantRubrics.find(r => 
      r.name.toLowerCase().includes(callType.replace('_', ' ')) ||
      r.name.toLowerCase().includes(callType.replace('_', '-'))
    );
    if (tenantRubric) {
      try {
        const parsedCriteria = JSON.parse(tenantRubric.criteria);
        rubric = {
          ...rubric,
          name: tenantRubric.name,
          description: tenantRubric.description || rubric.description,
          criteria: parsedCriteria,
        };
        console.log(`[Grading] Using tenant-specific rubric: ${tenantRubric.name}`);
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
  const systemPrompt = `You are an expert sales coach for a real estate wholesaling company called ${companyName}. 
Your job is to analyze phone call transcripts and grade them based on a specific rubric.

You are grading a ${callType === "cold_call" ? "Cold Call (Lead Generation)" : callType === "qualification" ? "Qualification/Diagnosis" : callType === "follow_up" ? "Follow-Up" : callType === "seller_callback" ? "Seller Callback (Inbound)" : callType === "admin_callback" ? "Admin Callback (Operational)" : "Offer"} call made by ${teamMemberName}.
${callType === "cold_call" ? "\nIMPORTANT: This is a Lead Generator cold call. The goal of this call is NOT to set appointments. The goal is to identify motivated sellers and generate interest in selling their property. A Lead Manager will follow up to qualify and set appointments. Grade accordingly." : ""}
${callType === "follow_up" ? "\nIMPORTANT: This is a Follow-Up call. The rep is re-engaging a known lead who went cold or said 'call me later.' Full qualification already happened. Do NOT penalize for skipping qualification steps. Focus on: referencing the previous conversation, anchoring the previous offer, surfacing roadblocks (and PAUSING to let the seller speak), and pushing for a binary decision. Talk ratio target: seller should talk ≥50%.\n\nCRITICAL FAILURES (cap score at 50% max if any of these occur):\n- Never referenced the previous offer amount\n- Never asked for a decision\n- Talked through the seller's silence after the roadblock question\n- Didn't identify/confirm who the decision maker is" : ""}
${callType === "seller_callback" ? "\nIMPORTANT: This is a Seller Callback — the seller called US back. This is a high-intent signal. The dynamic is completely different from outbound calls. Do NOT run a cold call or full qualification script. Focus on: acknowledging they called back, asking what prompted the callback, matching energy to their intent, and moving toward commitment. Talk ratio target: seller should talk ≥60%.\n\nCRITICAL FAILURES (cap score at 50% max if any of these occur):\n- Ran a full cold call script on someone who called back\n- Didn't ask why they're calling\n- Let them hang up without a next step" : ""}
${callType === "admin_callback" ? "\nIMPORTANT: This is an Admin Callback — an operational call about documents, scheduling, closing details, or other administrative tasks. This is NOT a sales call. Score on task execution: did they state the purpose clearly, get what they needed, confirm next steps with a timeline, maintain professional tone, and keep it efficient? No critical failures — these are low-stakes calls." : ""}

RUBRIC: ${rubric.name}
${rubric.description}

CRITERIA TO EVALUATE:
${rubric.criteria.map((c, i) => `
${i + 1}. ${c.name} (${c.maxPoints} points max)
   - ${c.description}
   - Key phrases to look for: ${c.keyPhrases.length > 0 ? c.keyPhrases.join(", ") : "N/A - evaluate based on tone and approach"}
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

${callType === "qualification" ? `DISQUALIFICATION TARGET: ${LEAD_MANAGER_RUBRIC.disqualificationTarget}` : ""}${trainingContext}${rulesContext}${feedbackContext}

Analyze the transcript and provide:
1. A score for each criterion (0 to max points)
2. Specific feedback for each criterion
3. Overall strengths (what they did well)
4. Areas for improvement
5. Specific coaching tips based on the training methodology
6. Any red flags identified
7. OBJECTION HANDLING: Identify any objections the seller raised (price concerns, timing, need to think about it, talking to other investors, etc.) and provide 2-3 specific script responses they could have used. Include the context/quote where the objection occurred.
8. A brief summary of the call performance
9. The call outcome - determine what happened at the end of the call

Be specific and reference actual quotes from the transcript when possible.`;

  const userPrompt = `Please analyze this call transcript and provide a detailed grade:

TRANSCRIPT:
${transcript}

Respond with a JSON object in this exact format:
{
  "criteriaScores": [
    {"name": "criterion name", "score": number, "maxPoints": number, "feedback": "specific feedback"}
  ],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "coachingTips": ["tip 1", "tip 2"],
  "redFlags": ["red flag 1"] or [],
  "objectionHandling": [
    {"objection": "Price too high", "context": "Seller said: 'I was hoping for at least $200k'", "suggestedResponses": ["Response 1", "Response 2"]}
  ],
  "summary": "brief overall summary",
  "callOutcome": "appointment_set" or "offer_made" or "callback_scheduled" or "interested" or "left_vm" or "no_answer" or "not_interested" or "dead" or "none"
}

CALL OUTCOME DEFINITIONS:
- appointment_set: A walkthrough, meeting, or follow-up appointment was scheduled with a specific date/time
- offer_made: An offer was presented to the seller (regardless of whether accepted or rejected)
- callback_scheduled: The seller agreed to a callback or follow-up call at a specific time
- interested: The seller expressed interest in selling but no firm commitment was made
- left_vm: The rep left a voicemail message
- no_answer: The call went unanswered or was very brief with no real conversation
- not_interested: The seller clearly stated they are not interested in selling
- dead: Wrong number, disconnected, or the lead is completely dead
- none: The call ended without a clear outcome or next step`;

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
                enum: ["none", "appointment_set", "offer_made", "callback_scheduled", "interested", "left_vm", "no_answer", "not_interested", "dead"] 
              },
            },
            required: ["criteriaScores", "strengths", "improvements", "coachingTips", "redFlags", "objectionHandling", "summary", "callOutcome"],
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
    };
  } catch (error) {
    console.error("[Grading] Error grading call:", error);
    throw error;
  }
}

// ============ TRANSCRIPTION FUNCTION ============

import { transcribeAudio } from "./_core/voiceTranscription";

export async function transcribeCallRecording(recordingUrl: string): Promise<string> {
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

    return result.text;
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
  durationSeconds: number | null | undefined
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
          content: `You are a call classification system for a real estate investment company.
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
   - Document/paperwork calls: Helping with e-signatures, DocuSign, purchase agreements, contracts
   - Technical support: Helping someone access emails, open documents, use platforms
   - Follow-up calls: Checking on status after offer was made, answering questions about closing
   - Scheduling logistics: Coordinating inspection times, closing dates, move-out dates
   - Vendor calls: Title companies, inspectors, attorneys
   - Internal team calls
   
   KEY INDICATOR: If the call is about SIGNING or REVIEWING a purchase agreement that was already presented, it's admin_call, NOT conversation.
   
3. "voicemail" - The rep left a voicemail message (one-sided, no response)

4. "no_answer" - Call went unanswered or disconnected quickly

5. "callback_request" - Very brief call (under 2 minutes) where someone just said "call me back" with no conversation

6. "wrong_number" - ONLY if the person explicitly says "wrong number" or "I don't own this property"

IMPORTANT RULES:
- If the call mentions "purchase agreement", "sign", "DocuSign", "e-signature", "contract to sign" - and the rep is HELPING them sign (not presenting an offer), it's admin_call
- If the call is troubleshooting email/technical issues related to receiving documents, it's admin_call
- If the offer price is being PRESENTED for the first time, it's conversation
- If the offer was already made and they're just reviewing/signing paperwork, it's admin_call
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
  teamMemberRole?: string
): Promise<{ callType: GradableCallType; confidence: number; reason: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a call type classifier for a real estate wholesaling company. Analyze the transcript and determine what type of call this is.

CALL TYPES:
1. "cold_call" - First contact with a homeowner. The caller is reaching out to someone who hasn't spoken with the company before. The goal is to gauge interest in selling, NOT to set appointments. Signs: introducing the company, asking if they've thought about selling, no prior relationship mentioned.

2. "qualification" - A qualification/diagnosis call with a lead who has already expressed some interest. The caller is digging deeper into motivation, property condition, timeline, price expectations, and potentially setting an appointment for a walkthrough. Signs: detailed questions about property/situation, price discussion, appointment setting.

3. "follow_up" - Re-engaging a known lead after a previous conversation where an offer was already discussed. The caller is checking in, referencing a previous offer, or trying to get a decision. Signs: "just following up", "checking in", references to previous offer amount, "last time we spoke", anchoring a previous price.

4. "offer" - Presenting a formal offer to the seller for the FIRST TIME. The caller is delivering a specific price, discussing terms, and trying to close. Signs: specific dollar amounts, "walk away with", contract discussion, closing language, first-time price presentation.

5. "seller_callback" - INBOUND call where the seller called the company back. High-intent signal. Signs: seller says "I got your letter/postcard/voicemail", "you called me earlier", seller is asking questions, seller initiated the contact. The rep should acknowledge the callback and capitalize on momentum.

6. "admin_callback" - OUTBOUND operational call about documents, scheduling, closing details, title info, walkthrough times. NOT a sales call. Signs: discussing DocuSign, purchase agreements, scheduling inspections, coordinating closing dates, helping with paperwork, vendor coordination. No active selling happening.

The team member's role is: ${teamMemberRole || "unknown"}. Use this as a hint but let the transcript content be the primary signal.

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
        const shortTranscript = await transcribeCallRecording(call.recordingUrl);
        await updateCall(callId, { transcript: shortTranscript });

        // Generate a brief summary of what happened
        if (shortTranscript && shortTranscript.length > 20) {
          const summaryResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You summarize phone calls for a real estate investment company. Write a 1-2 sentence summary of what happened on this short call. Be specific and concise. Examples:
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
    const transcript = await transcribeCallRecording(call.recordingUrl);
    await updateCall(callId, { transcript });

    // Step 3: Classify the call
    await updateCall(callId, { status: "classifying" });
    const classificationResult = await classifyCall(transcript, call.duration);
    
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
        
        // Get tenant company name
        let companyName: string | undefined;
        if (call.tenantId) {
          const tenant = await getTenantById(call.tenantId);
          if (tenant) companyName = tenant.name;
        }
        
        const gradeResult = await gradeCall(transcript, "admin_callback", teamMemberName, { companyName });
        
        await createCallGrade({
          callId: call.id,
          overallScore: gradeResult.overallScore.toString(),
          overallGrade: gradeResult.overallGrade,
          criteriaScores: gradeResult.criteriaScores,
          strengths: gradeResult.strengths,
          improvements: gradeResult.improvements,
          coachingTips: gradeResult.coachingTips,
          redFlags: gradeResult.redFlags,
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
        });
        
        console.log(`[ProcessCall] Admin call ${callId} auto-graded: ${gradeResult.overallGrade} (${gradeResult.overallScore}%)`);
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
                content: `You summarize phone calls for a real estate investment company. Write a 1-2 sentence summary of what happened on this call. Be specific and concise. Examples:
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
      const aiDetection = await detectCallType(transcript, teamMemberRole);
      console.log(`[ProcessCall] AI detected call type: ${aiDetection.callType} (confidence: ${aiDetection.confidence}, reason: ${aiDetection.reason})`);
      
      if (aiDetection.confidence >= 0.6) {
        // High confidence: use AI suggestion
        callType = aiDetection.callType;
        callTypeSource = "ai_suggested";
      } else {
        // Low confidence: fall back to role-based inference
        if (teamMemberRole === "acquisition_manager") {
          callType = "offer";
        } else if (teamMemberRole === "lead_generator") {
          callType = "cold_call";
        } else {
          callType = "qualification";
        }
        callTypeSource = "auto";
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

    console.log(`[ProcessCall] Successfully processed call ${callId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ProcessCall] Error processing call ${callId}:`, errorMsg);
    await updateCall(callId, { status: "failed", classificationReason: errorMsg });
  }
}
