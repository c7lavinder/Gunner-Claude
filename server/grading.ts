import { invokeLLM } from "./_core/llm";

// ============ GRADING RUBRICS ============

export const LEAD_MANAGER_RUBRIC = {
  name: "Lead Manager Qualification Call Rubric",
  description: "For Chris and Daniel - Qualification/Diagnosis calls",
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
  callType: "qualification" | "offer",
  teamMemberName: string,
  context?: {
    trainingMaterials?: { title: string; content: string | null; category: string | null }[];
    gradingRules?: { title: string; ruleText: string | null; priority: number | null }[];
    recentFeedback?: { feedbackType: string | null; explanation: string | null; correctBehavior: string | null }[];
  }
): Promise<GradingResult> {
  const rubric = callType === "qualification" ? LEAD_MANAGER_RUBRIC : ACQUISITION_MANAGER_RUBRIC;

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

You are grading a ${callType === "qualification" ? "Qualification/Diagnosis" : "Offer"} call made by ${teamMemberName}.

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
- follow_up: A follow-up call was scheduled but no appointment for in-person meeting
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

1. "conversation" - A real sales conversation with substantive discussion about selling a property. This includes:
   - Discussion of property details, condition, or location
   - Discussion of seller's situation or motivation
   - Price discussion or negotiation
   - Qualification questions about the property or seller
   - Objection handling related to selling
   
2. "admin_call" - An administrative or non-sales call. This includes:
   - Scheduling or rescheduling appointments (without sales discussion)
   - Follow-up calls just to confirm times/dates
   - Calls about paperwork, contracts, or closing logistics
   - Calls to title companies, inspectors, or other vendors
   - Internal team calls
   - Calls where the main purpose is NOT qualifying or making an offer
   
3. "voicemail" - The rep left a voicemail message (one-sided, no response from other party)

4. "no_answer" - Call went unanswered, straight to voicemail, or disconnected quickly

5. "callback_request" - Very brief call where someone just said "call me back", "not a good time", "I'm busy", etc. with no substantive conversation

6. "wrong_number" - Wrong number, disconnected number, or person says they don't own the property

IMPORTANT: If the call is primarily about scheduling, confirming appointments, or administrative matters WITHOUT substantive sales discussion (qualification, motivation, price), classify it as "admin_call".

Respond with JSON only:
{
  "classification": "conversation" | "admin_call" | "voicemail" | "no_answer" | "callback_request" | "wrong_number",
  "reason": "Brief explanation of why this classification was chosen",
  "shouldGrade": true/false (only true for "conversation")
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
            },
            required: ["classification", "reason", "shouldGrade"],
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
      await updateCall(callId, { status: "skipped" });
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

    console.log(`[ProcessCall] Successfully processed call ${callId}`);
  } catch (error) {
    console.error(`[ProcessCall] Error processing call ${callId}:`, error);
    await updateCall(callId, { status: "failed" });
  }
}
