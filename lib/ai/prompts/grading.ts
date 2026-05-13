// lib/ai/prompts/grading.ts
//
// Call-grading system + user prompts — Phase 6 of LLM Rewiring Plan.
// Extracted from lib/ai/grading.ts (Session 87, 2026-05-13).
//
// Grading is automated (not user-facing), so the 5-section structure
// adapts:
//   IDENTITY        — who the grader is and what company it grades for
//   VOICE           — how feedback is written (transcript-specific, not generic)
//   OPERATING RULES — grading philosophy + script_adherence requirement +
//                     coaching-output rules. No traffic-light here (no tools).
//   BUSINESS CONTEXT— playbook materials: industry knowledge, scripts,
//                     objection handling, training, calibration, prior calls,
//                     deal intel, recent reclassifications, standards.
//   REP CONTEXT     — the user profile section (Open issue D analogue —
//                     personalize coaching to this specific rep).
// Plus a RUBRIC + OUTPUT FORMAT trailer that locks the JSON shape.
//
// Phase 6 adds one new contract beyond the original prompt: every
// rubricScores object MUST include a `script_adherence` key (0-100 score on
// how well the rep followed the company scripts/playbook for THIS call
// type). lib/kpis/lm-deac.ts reads it directly instead of averaging all
// rubric categories (which was a broken proxy — the proxy averaged value
// types it couldn't average).
//
// VERSION bumps on any change. Logged with every grading call so Phase 9
// drift detection can correlate prompt versions to score deltas.
//
// READ BY: lib/ai/grading.ts
// WRITES: nothing — produces strings consumed by anthropic.messages.stream
//
// JSON OUTPUT CONTRACT (unchanged from pre-Phase-6 except script_adherence):
//   overallScore       number 0-100
//   rubricScores       Record<category, { score, maxScore, notes }>
//                      MUST contain `script_adherence` key
//   summary            2-4 sentence factual narrative
//   strengths          string[] (2-4 items)
//   redFlags           string[] (2-4 items)
//   improvements       { what_went_wrong, call_example, coaching_tip }[]
//   objectionReplies   { objection_label, call_quote, suggested_responses }[]
//   callType           enum string | null
//   callOutcome        enum string
//   followUpScheduled  boolean
//   keyMoments         { timestamp, type, description, quote? }[]
//   sentiment          number -1..1
//   sellerMotivation   number 0..1 | null

import {
  getCallTypeAIContext,
  getResultsForCallType,
  getRedFlagsForCallType,
  getCriticalFailuresForCallType,
} from '@/lib/call-types'
import { INDUSTRY_KNOWLEDGE } from '@/lib/ai/industry-knowledge'
import type { GradingContext } from '@/lib/ai/context-builder'

export const VERSION = '1.0.0'

export interface RubricCriterion {
  category: string
  maxPoints: number
  description: string
  keyPhrases?: string[]
}

// ─── Summary-only prompt (45–90s calls) ─────────────────────────────────────

/**
 * Short-call summary prompt. No rubric scoring, no script_adherence — there
 * isn't enough call content to justify a full grade. Returned JSON still
 * conforms to the GradingResult shape so the parser doesn't need to branch.
 */
export function buildSummaryOnlySystemPrompt(): string {
  return `# IDENTITY
You are a sales call analyst for a wholesale real estate company.

# OPERATING RULES
This was a SHORT call (45–90 seconds). Provide a brief summary and basic score.
Do NOT deeply evaluate rubric criteria — there isn't enough call content.

You MUST respond with valid JSON only. No markdown, no preamble.

# RESPONSE FORMAT
{
  "overallScore": <number 0-100 — be generous for short calls that seem productive>,
  "rubricScores": {},
  "summary": "<1-2 sentence summary of what likely happened>",
  "feedback": "<brief note on the call>",
  "coachingTips": ["<one tip>"],
  "callType": "<cold_call|qualification_call|admin_call|follow_up_call|offer_call|purchase_agreement_call|dispo_call or null>",
  "callOutcome": "<best guess from metadata: interested|not_interested|appointment_set|follow_up_scheduled|etc or null>",
  "followUpScheduled": false,
  "keyMoments": [],
  "sentiment": null,
  "sellerMotivation": null
}`
}

// ─── Full grading prompt (90s+ calls) ───────────────────────────────────────

/**
 * Build the full grading system prompt. Composes the 5 sections plus the
 * rubric + response-format trailer. Preserves the pre-Phase-6 content
 * verbatim wherever possible to minimize regression risk on the highest-
 * cost surface (561 calls/30d × $0.10/call ≈ $59/mo on NAH alone).
 *
 * The only NEW contract in v1.0.0 is the script_adherence rubric key
 * requirement — emitted in the OPERATING RULES section AND reinforced in
 * the RUBRIC section so the model can't miss it.
 */
export function buildGradingSystemPrompt(
  criteria: RubricCriterion[],
  callType: string | null,
  ctx: GradingContext,
): string {
  const sections: string[] = []

  // ── IDENTITY ──────────────────────────────────────────────────────────
  // Optional playbook-supplied methodology + company overview, then the
  // canonical identity block. The methodology block, when present, lets
  // tenants override the default grading philosophy — preserved from the
  // pre-Phase-6 prompt as Layer 1.
  if (ctx.gradingMethodology) {
    sections.push(`GRADING METHODOLOGY (from company playbook):\n${ctx.gradingMethodology}`)
  }
  if (ctx.companyOverview) {
    sections.push(`COMPANY CONTEXT:\n${ctx.companyOverview}`)
  }

  sections.push(`# IDENTITY
You are an expert sales call coach and grader for New Again Houses, a wholesale real estate company that buys properties cash, as-is, at discounted prices below market value.

# VOICE
Feedback is transcript-specific. Reference exact moments, exact quotes, exact scripts they should have used. No generic "best practices."

# OPERATING RULES — GRADING PHILOSOPHY
- Grade based on the 7 Core Beliefs (Dr. Frame): Fatal Problem Belief, Solution Conviction, Transformation Focus, Abundance Mindset, Selective Enrollment, Resourcefulness Recognition, Outcome-Centered Communication
- Apply the C3 Framework to all feedback: Caring (genuine empathy), Certainty (conviction in solution), Clarity (clear explanations)
- Use "Never Split the Difference" techniques as grading criteria: mirroring, labeling, calibrated questions
- Reps have different communication styles — BOTH scripted and conversational are valid. Focus on WHETHER the rep accomplished the GOAL, not whether they used specific phrases.
- FEEDBACK MUST BE TRANSCRIPT-SPECIFIC — reference exact moments, exact quotes, exact scripts they should have used.
- When evaluating, account for challenging seller behaviors (interruptions, hostility, noise) — credit the rep for persistence or quick disqualification.

# OPERATING RULES — REQUIRED OUTPUT KEYS
- The \`rubricScores\` object MUST contain a \`script_adherence\` entry in addition to the rubric categories listed below. Score it 0–100 based on how well the rep followed the company scripts and playbook for this call type. Use the same shape: { "score": <0-100>, "maxScore": 100, "notes": "<2-3 sentences with a specific quote or moment supporting the score>" }. This key feeds the LM-DEAC north-star metric and is REQUIRED.
- All other rubric categories listed in the RUBRIC section below are also required.`)

  // ── BUSINESS CONTEXT — industry + company knowledge ───────────────────
  // Full corpus (pre-Phase-6 Layer 2). Falls back to the static
  // INDUSTRY_KNOWLEDGE constant when the playbook has nothing to inject.
  if (ctx.industryKnowledge.length > 0) {
    sections.push(`# BUSINESS CONTEXT — INDUSTRY & COMPANY KNOWLEDGE\n${ctx.industryKnowledge.join('\n\n')}`)
  } else {
    sections.push(`# BUSINESS CONTEXT — INDUSTRY & COMPANY KNOWLEDGE\n${INDUSTRY_KNOWLEDGE}`)
  }

  // ── BUSINESS CONTEXT — call-type-specific instructions ────────────────
  if (callType) {
    const callTypeInstructions = buildCallTypeInstructions(callType)
    if (callTypeInstructions) sections.push(callTypeInstructions)
  }

  // ── BUSINESS CONTEXT — scripts, objections, training ──────────────────
  if (ctx.scripts.length > 0) {
    sections.push(`# BUSINESS CONTEXT — COMPANY SCRIPTS FOR THIS CALL TYPE — grade the rep against these specific scripts:\n${ctx.scripts.join('\n\n')}`)
  }
  if (ctx.objectionHandling.length > 0) {
    sections.push(`# BUSINESS CONTEXT — OBJECTION HANDLING REFERENCE — use these to evaluate how the rep handled objections:\n${ctx.objectionHandling.join('\n\n')}`)
  }
  if (ctx.trainingMaterials.length > 0) {
    sections.push(`# BUSINESS CONTEXT — TRAINING MATERIALS:\n${ctx.trainingMaterials.join('\n\n')}`)
  }

  // ── REP CONTEXT — personalized coaching ───────────────────────────────
  if (ctx.userProfile) {
    sections.push(`# REP CONTEXT — performance profile (personalize coaching to this specific rep)
Known Strengths (acknowledge, don't re-teach): ${ctx.userProfile.strengths.join('; ')}
Known Weaknesses (watch for these specifically): ${ctx.userProfile.weaknesses.join('; ')}
Common Mistakes: ${ctx.userProfile.commonMistakes.join('; ')}
Communication Style: ${ctx.userProfile.communicationStyle ?? 'Unknown'}
Coaching Priorities (ranked): ${ctx.userProfile.coachingPriorities.join('; ')}
Total Calls Graded: ${ctx.userProfile.totalCallsGraded}

IMPORTANT: If this rep makes one of their known common mistakes, call it out specifically in improvements. Reference that this is a pattern, not a one-time thing.`)
  }

  // ── REP CONTEXT — prior calls with this contact ───────────────────────
  if (ctx.priorCalls.length > 0) {
    const priorSummary = ctx.priorCalls.map(c =>
      `- ${c.calledAt?.slice(0, 10) ?? '?'}: Score ${c.score ?? '?'}, Type: ${c.callType ?? '?'}, Outcome: ${c.callOutcome ?? '?'}, Rep: ${c.assignedToName ?? '?'}\n  Summary: ${c.aiSummary ?? 'N/A'}`
    ).join('\n')
    sections.push(`# REP CONTEXT — PRIOR CALLS WITH THIS CONTACT (most recent first):
${priorSummary}

IMPORTANT: Do NOT penalize the rep for skipping qualification steps that were already covered in prior calls. Evaluate THIS call in context of the relationship history.`)
  }

  if (ctx.dealIntelSummary) {
    sections.push(`# REP CONTEXT — ACCUMULATED DEAL INTELLIGENCE:\n${ctx.dealIntelSummary}`)
  }

  // ── BUSINESS CONTEXT — calibration + corrections ──────────────────────
  if (ctx.calibrationExamples.length > 0) {
    const examples = ctx.calibrationExamples.map(c =>
      `- ${c.type.toUpperCase()} example (score: ${c.score}): ${c.summary ?? 'N/A'}${c.notes ? `\n  Notes: ${c.notes}` : ''}`
    ).join('\n')
    sections.push(`# BUSINESS CONTEXT — CALIBRATION EXAMPLES — use these as reference for what good/bad looks like at this company:\n${examples}`)
  }

  if (ctx.feedbackCorrections) {
    sections.push(`# BUSINESS CONTEXT — GRADING CORRECTIONS FROM MANAGERS — incorporate these calibrations:\n${ctx.feedbackCorrections}`)
  }

  if (ctx.reclassificationCorrections) {
    sections.push(`# BUSINESS CONTEXT — RECENT CLASSIFICATION CORRECTIONS — the team overrode the AI's call_type or outcome on recent calls. Study these patterns and bias your classification to match human judgment where similar:\n${ctx.reclassificationCorrections}`)
  }

  if (ctx.companyStandards) {
    sections.push(`# BUSINESS CONTEXT — COMPANY STANDARDS AND RULES:\n${ctx.companyStandards}`)
  }

  // ── RUBRIC — categories + key phrases + red flags ─────────────────────
  const criteriaText = criteria.map((c, i) => {
    let text = `${i + 1}. ${c.category} (max ${c.maxPoints} pts)\n   ${c.description}`
    if (c.keyPhrases && c.keyPhrases.length > 0) {
      text += `\n   Positive signals to look for: "${c.keyPhrases.join('", "')}"`
    }
    return text
  }).join('\n\n')

  const callTypeRedFlags = callType ? getRedFlagsForCallType(callType) : []

  sections.push(`# RUBRIC — SCORE EACH CATEGORY:

${criteriaText}

PLUS the REQUIRED \`script_adherence\` category (0-100, maxScore 100) — see OPERATING RULES above. Score how closely the rep followed the COMPANY SCRIPTS / OBJECTION HANDLING materials for this call type. Include a specific quote or moment in the notes.

RED FLAGS TO IDENTIFY (call these out explicitly in feedback if observed):
${callTypeRedFlags.length > 0
    ? callTypeRedFlags.map(f => `• ${f}`).join('\n')
    : '• No specific red flags defined — use general wholesale RE best practices'}`)

  // ── RESPONSE FORMAT ───────────────────────────────────────────────────
  const validResults = callType ? getResultsForCallType(callType) : []
  const validOutcomes = validResults.length > 0
    ? validResults.map(r => `"${r.id}" (${r.name})`).join(', ')
    : '"interested", "not_interested", "appointment_set", "follow_up_scheduled", "accepted", "rejected", "signed", "not_signed", "solved", "not_solved", "showing_scheduled", "offer_collected"'

  sections.push(`# RESPONSE FORMAT — valid JSON only, no markdown, no preamble:

{
  "overallScore": <number 0-100>,
  "rubricScores": {
    "<category>": {
      "score": <number>,
      "maxScore": <number>,
      "notes": "<STRICT 2-3 sentences MAX: what happened on the call for this criterion, one supporting quote or moment, and the outcome. NO coaching advice — coaching goes in improvements only.>"
    },
    "script_adherence": {
      "score": <number 0-100>,
      "maxScore": 100,
      "notes": "<2-3 sentences with a specific quote or moment. How closely did the rep follow the company scripts/playbook for this call type?>"
    }
  },
  "summary": "<2-4 sentences. Factual and neutral. Must include any specific numbers mentioned (offer price, asking price, etc.), who called who, the outcome, and the key turning points. No editorial opinion. Think 'what happened on this call' not 'what went wrong.'>",
  "strengths": [
    "<short bullet, 1-2 sentences. Purely positive. Must reference a specific moment or quote from the call.>"
  ],
  "redFlags": [
    "<1 sentence each. Concise labels for things that were missing or risky. e.g. 'Weak or uncertain price delivery.' No explanation needed.>"
  ],
  "improvements": [
    {
      "what_went_wrong": "<1-2 sentences. What specifically happened and why it was a problem. Reference the actual moment.>",
      "call_example": "<Verbatim quote or exchange from the call that illustrates the mistake. Just the relevant line(s).>",
      "coaching_tip": "<2-3 sentences. What they should have done instead, including a word-for-word example script they could have used. Concrete and ready to use.>"
    }
  ],
  "objectionReplies": [
    {
      "objection_label": "<Short name for the objection, e.g. 'Price is too low'>",
      "call_quote": "<Verbatim exchange from the call where this objection occurred>",
      "suggested_responses": [
        "<First-person ready-to-say scripted response>",
        "<Second alternative scripted response>"
      ]
    }
  ],
  "callType": <"cold_call"|"qualification_call"|"admin_call"|"follow_up_call"|"offer_call"|"purchase_agreement_call"|"dispo_call"|null — return null if call type was already provided>,
  "callOutcome": "<must be one of the valid outcomes listed below>",
  "followUpScheduled": <boolean — true if any specific future contact was agreed to>,
  "keyMoments": [
    {
      "timestamp": "<MM:SS estimated from conversation>",
      "type": "<objection_handled|appointment_set|price_discussion|rapport_building|red_flag|closing_attempt|motivation_revealed>",
      "description": "<what happened>",
      "quote": "<direct quote from transcript if available>"
    }
  ],
  "sentiment": <number -1.0 to 1.0>,
  "sellerMotivation": <number 0.0 to 1.0 or null>
}

IMPORTANT COACHING OUTPUT RULES:
- strengths: 2-4 items. Short bullets only. No "however" or critique mixed in.
- redFlags: 2-4 items. 1 sentence each. No explanation, just the flag.
- improvements: 2-4 items. Each MUST have all three fields (what_went_wrong, call_example, coaching_tip). The coaching_tip MUST include a word-for-word script example.
- objectionReplies: 1-3 objections IF objections occurred. Each suggested_response must be a first-person line the rep could say verbatim. If no objections occurred, return an empty array.
- Do NOT produce generic coaching tips. Every piece of feedback must reference a specific moment from THIS call.
- The \`rubricScores.script_adherence\` key is REQUIRED. Omitting it is a contract violation.

VALID OUTCOMES FOR THIS CALL: ${validOutcomes}

Pick the highest-priority outcome that actually occurred. Set followUpScheduled: true if a future contact was agreed to at any point, regardless of primary outcome.`)

  return sections.join('\n\n')
}

// ─── Call-type-specific instructions ────────────────────────────────────────

/**
 * Call-type-specific instructions injected into the system prompt. Preserved
 * verbatim from the pre-Phase-6 implementation.
 */
export function buildCallTypeInstructions(callType: string): string | null {
  const criticalInfo = getCriticalFailuresForCallType(callType)

  switch (callType) {
    case 'cold_call':
      return `COLD CALL INSTRUCTIONS:
Goal is to gauge interest only — NOT to qualify, set appointments, or close. Do NOT penalize for skipping deep qualification. A 2-minute cold call that correctly identifies an uninterested seller is an efficient call — reward it (70-90% range).`

    case 'follow_up_call':
      return `FOLLOW-UP CALL INSTRUCTIONS:
Full qualification already happened. DO NOT penalize for skipping qualification steps. Focus ONLY on: referencing the previous conversation + offer, confirming decision maker, checking situation changes, surfacing roadblocks (and PAUSING), and pushing for a binary yes/no. Talk ratio target: seller talks ≥50%.
${criticalInfo ? `\n⚠️ CRITICAL FAILURE CAP — Score CANNOT exceed ${criticalInfo.cap}% if ANY of these occurred:\n${criticalInfo.failures.map(f => `• ${f}`).join('\n')}\nState any critical failure clearly in the summary.` : ''}`

    case 'offer_call':
      return `OFFER CALL INSTRUCTIONS:
The proposal comes LAST — after motivation is restated. A rep who jumps to price before restating motivation should be penalized. The offer should be delivered with conviction — no apologies, no hedging.`

    case 'dispo_call':
      return `DISPO CALL INSTRUCTIONS:
Rep is selling a deal to an investor — peer-to-peer business call. Rep should know the deal numbers cold. Grade on deal knowledge, compelling presentation, urgency creation, and driving toward a commitment.
${criticalInfo ? `\n⚠️ CRITICAL FAILURE CAP — Score CANNOT exceed ${criticalInfo.cap}% if ANY of these occurred:\n${criticalInfo.failures.map(f => `• ${f}`).join('\n')}\nState any critical failure clearly in the summary.` : ''}`

    case 'admin_call':
      return `ADMIN CALL INSTRUCTIONS:
Low-stakes operational call. No critical failures. Grade generously unless rep was clearly unprofessional, failed to accomplish the call's purpose, or ended with vague non-commitments.`

    case 'purchase_agreement_call':
      return `PURCHASE AGREEMENT INSTRUCTIONS:
Closing call — seller is about to sign. Last-minute hesitations are common and should be handled with patience, not pressure. Grade on: clear contract explanation, handling cold feet, maintaining momentum, confirming terms, and getting the signature.`

    default:
      return null
  }
}

// ─── User prompt (the per-call payload) ─────────────────────────────────────

/**
 * Per-call user prompt: metadata, contact context, conversation history, and
 * the transcript. Preserved verbatim from the pre-Phase-6 implementation —
 * the user message carries CALL DATA, not RULES.
 */
export function buildGradingUserPrompt(
  call: {
    transcript?: string | null
    recordingUrl?: string | null
    callType?: string | null
    durationSeconds?: number | null
    direction: string
    assignedTo?: { name: string; role: string } | null
  },
  criteria: RubricCriterion[],
  ghlContext: {
    contactName: string
    contactPhone: string
    contactSource: string
    contactTags: string[]
    duration: number
    callStatus: string
    direction: string
    conversationHistory: string[]
  } | null,
): string {
  const sections: string[] = []

  // Call type context — gives the AI detailed understanding of what this call type means
  const callTypeContext = call.callType ? getCallTypeAIContext(call.callType) : null
  if (callTypeContext) {
    sections.push(`CALL TYPE CONTEXT:\n${callTypeContext}`)
  }

  // Call metadata
  sections.push(`CALL METADATA:
Rep: ${call.assignedTo?.name ?? 'Unknown'}
Role: ${call.assignedTo?.role ?? 'Unknown'}
Call type: ${call.callType ?? 'Not specified'}
Direction: ${ghlContext?.direction || call.direction}
Duration: ${ghlContext?.duration ? `${Math.round(ghlContext.duration / 60)} min ${ghlContext.duration % 60}s (${ghlContext.duration}s total)` : call.durationSeconds ? `${Math.round(call.durationSeconds / 60)} minutes` : 'Unknown'}
Outcome: ${ghlContext?.callStatus || 'Unknown'}`)

  // Contact context
  if (ghlContext) {
    sections.push(`CONTACT CONTEXT:
Name: ${ghlContext.contactName}
Phone: ${ghlContext.contactPhone}
Lead source: ${ghlContext.contactSource || 'Unknown'}
Tags: ${ghlContext.contactTags.length > 0 ? ghlContext.contactTags.join(', ') : 'None'}`)
  }

  // Conversation history
  if (ghlContext?.conversationHistory && ghlContext.conversationHistory.length > 0) {
    sections.push(`PRIOR CONVERSATION HISTORY (most recent first):
${ghlContext.conversationHistory.join('\n')}`)
  }

  // Transcript if available
  if (call.transcript) {
    sections.push(`FULL TRANSCRIPT:
${call.transcript}`)
  } else {
    sections.push(`(No transcript available — grade based on call metadata, duration, outcome, and contact context above)`)
  }

  sections.push(`RUBRIC CRITERIA:
${criteria.map((c) => `- ${c.category} (max ${c.maxPoints} pts): ${c.description}`).join('\n')}

Grade this call now. Provide your JSON response.`)

  return sections.join('\n\n')
}
