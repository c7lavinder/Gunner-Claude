import { invokeLLM } from "./_core/llm";

// ============ GRADING RUBRICS ============

export const LEAD_MANAGER_RUBRIC = {
  name: "Lead Manager Qualification Call Rubric",
  description: "For Lead Managers (Chris and Daniel) - Qualification/Diagnosis calls. The goal is to qualify leads, extract motivation, discuss price, and set appointments for walkthroughs.",
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
  ],
  disqualificationTarget: "Under 4 minutes for clear disqualifications",
};

export const ACQUISITION_MANAGER_RUBRIC = {
  name: "Acquisition Manager Offer Call Rubric",
  description: "For Kyle - Offer/Closing calls",
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
  description: "For Lead Generators (Alex, Efren, and Mirna) - Cold calling to generate seller interest and identify motivated sellers. The goal is NOT to set appointments — it is to get the homeowner to express interest in selling so a Lead Manager can follow up and qualify the lead.",
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

// ============ GRADING FUNCTION ============

// Must match the callOutcome enum in drizzle/schema.ts
export type CallOutcome = "none" | "appointment_set" | "offer_accepted" | "offer_rejected" | "follow_up" | "disqualified";

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

export async function gradeCall(
  transcript: string,
  callType: "qualification" | "offer" | "lead_generation",
  teamMemberName: string,
  context?: {
    trainingMaterials?: { title: string; content: string | null; category: string | null }[];
    gradingRules?: { title: string; ruleText: string | null; priority: number | null }[];
    recentFeedback?: { feedbackType: string | null; explanation: string | null; correctBehavior: string | null }[];
  }
): Promise<GradingResult> {
  const rubric = callType === "lead_generation" ? LEAD_GENERATOR_RUBRIC : (callType === "qualification" ? LEAD_MANAGER_RUBRIC : ACQUISITION_MANAGER_RUBRIC);

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

  const systemPrompt = `You are an expert sales coach for a real estate wholesaling company called Nashville Area Home Buyers. 
Your job is to analyze phone call transcripts and grade them based on a specific rubric.

You are grading a ${callType === "lead_generation" ? "Lead Generation Cold Call" : callType === "qualification" ? "Qualification/Diagnosis" : "Offer"} call made by ${teamMemberName}.
${callType === "lead_generation" ? "\nIMPORTANT: This is a Lead Generator cold call. The goal of this call is NOT to set appointments. The goal is to identify motivated sellers and generate interest in selling their property. A Lead Manager will follow up to qualify and set appointments. Grade accordingly." : ""}

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
  "callOutcome": "appointment_set" or "offer_accepted" or "offer_rejected" or "follow_up" or "disqualified" or "none"
}

CALL OUTCOME DEFINITIONS:
- appointment_set: A walkthrough, meeting, or follow-up appointment was scheduled with a specific date/time
- offer_accepted: The seller accepted an offer or verbally agreed to the deal
- offer_rejected: An offer was made but the seller declined
- follow_up: ${callType === "lead_generation" ? "The seller expressed interest and a Lead Manager follow-up was set up" : "A follow-up call was scheduled but no appointment for in-person meeting"}
- disqualified: The lead was disqualified (price too high, not motivated, etc.)
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
                enum: ["none", "appointment_set", "offer_accepted", "offer_rejected", "follow_up", "disqualified"] 
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
    const overallScore = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

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

// ============ PROCESS CALL FUNCTION ============

import { getCallById, updateCall, createCallGrade, getTeamMemberById, getGradingContext } from "./db";
import { processCallViewRewards } from "./gamification";
import { canProcessCall } from "./planLimits";

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
    if (call.duration && call.duration < MINIMUM_CALL_DURATION_SECONDS) {
      console.log(`[ProcessCall] Call ${callId} is too short (${call.duration}s), skipping`);
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

    // If not a real conversation, skip grading
    if (!classificationResult.shouldGrade) {
      console.log(`[ProcessCall] Call ${callId} classified as ${classificationResult.classification}, skipping grading`);
      // For admin calls, save the summary as the classificationReason for display
      const updateData: any = { status: "skipped" };
      if (classificationResult.classification === "admin_call" && classificationResult.summary) {
        updateData.classificationReason = classificationResult.summary;
      }
      await updateCall(callId, updateData);
      return;
    }

    // Step 4: Grade (only for real conversations)
    await updateCall(callId, { status: "grading" });
    
    // Determine call type based on team member role
    let callType: "qualification" | "offer" = "qualification";
    let teamMemberName = call.teamMemberName || "Team Member";
    
    if (call.teamMemberId) {
      const teamMember = await getTeamMemberById(call.teamMemberId);
      if (teamMember) {
        teamMemberName = teamMember.name;
        // Lead generators use the same grading as lead managers (qualification calls)
        callType = teamMember.teamRole === "acquisition_manager" ? "offer" : "qualification";
      }
    }

    // Fetch grading context (training materials, rules, feedback)
    const gradingContext = await getGradingContext(callType);
    
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
    });

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
      rubricType: callType === "qualification" ? "lead_manager" : "acquisition_manager",
    });

    // Step 6: Mark complete and save outcome
    await updateCall(callId, { 
      status: "completed", 
      callType,
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

    console.log(`[ProcessCall] Successfully processed call ${callId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ProcessCall] Error processing call ${callId}:`, errorMsg);
    await updateCall(callId, { status: "failed", classificationReason: errorMsg });
  }
}
