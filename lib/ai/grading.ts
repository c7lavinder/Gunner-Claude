// lib/ai/grading.ts
// Automatic call grading using Claude API
// Duration routing: <30s skip, 30-60s summary only, 60s+ full grading
// Transcribes via Deepgram when recording URL available

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { transcribeRecording } from '@/lib/ai/transcribe'
import { calculateTCP } from '@/lib/ai/scoring'
import { getCallTypeAIContext, getRubricForCallType, getResultsForCallType, getRedFlagsForCallType, getCriticalFailuresForCallType, CALL_TYPES } from '@/lib/call-types'
import { INDUSTRY_KNOWLEDGE } from '@/lib/ai/industry-knowledge'
import { awardCallXP } from '@/lib/gamification/xp'
import { triggerWorkflows } from '@/lib/workflows/engine'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── Main grading function ──────────────────────────────────────────────────

export async function gradeCall(callId: string): Promise<void> {
  await db.call.update({
    where: { id: callId },
    data: { gradingStatus: 'PROCESSING' },
  })

  try {
    const call = await db.call.findUnique({
      where: { id: callId },
      include: {
        assignedTo: { select: { id: true, name: true, role: true } },
        tenant: {
          select: {
            id: true,
            callTypes: true,
            callResults: true,
            ghlAccessToken: true,
            ghlLocationId: true,
            gradingMaterials: true,
          },
        },
      },
    })

    if (!call) throw new Error(`Call ${callId} not found`)

    const duration = call.durationSeconds ?? 0

    // Duration routing: <45s and 0s caught here
    // 45-90s: summary only (no rubric score)
    // 90s+: full grading with rubric score

    // Zero duration = no answer (GHL sends 0 when unanswered)
    if (duration === 0) {
      await db.call.update({
        where: { id: callId },
        data: {
          gradingStatus: 'FAILED',
          aiSummary: 'No answer — zero duration.',
          callResult: 'no_answer',
        },
      })
      return
    }

    // Under 45s = dial attempt or no answer — do not grade
    if (duration < 45) {
      await db.call.update({
        where: { id: callId },
        data: {
          gradingStatus: 'FAILED',
          aiSummary: 'No answer — call under 45 seconds.',
          callResult: 'no_answer',
        },
      })
      return
    }

    // Transcribe if recording URL exists
    let transcript = call.transcript
    if (!transcript && call.recordingUrl) {
      console.log(`[Call Grading] Transcribing recording for call ${callId}...`)
      const ghlToken = (call.tenant as { ghlAccessToken?: string | null }).ghlAccessToken ?? undefined
      const transcription = await transcribeRecording(call.recordingUrl, ghlToken ?? undefined)
      if (transcription.status === 'success' && transcription.transcript) {
        transcript = transcription.transcript
        // Save transcript to DB so we don't re-transcribe
        await db.call.update({
          where: { id: callId },
          data: { transcript },
        })
        console.log(`[Call Grading] Transcription complete: ${transcript.length} chars`)
      } else {
        console.warn(`[Call Grading] Transcription failed: ${transcription.error}`)
      }
    }

    // If no recording AND no transcript, don't grade — send to review queue.
    // Recording may still be processing in GHL. Poll-calls will retry later.
    if (!transcript && !call.recordingUrl) {
      await db.call.update({
        where: { id: callId },
        data: {
          gradingStatus: 'FAILED',
          aiSummary: 'No recording or transcript available — awaiting recording from GHL.',
        },
      })
      console.log(`[Call Grading] No recording/transcript for call ${callId} (${duration}s) — sent to review`)
      return
    }

    // Get rubric: call type rubric > tenant custom rubric > role default
    // Priority 1: Tenant custom rubric for this call type
    let rubricCriteria: RubricCriteria[] | null = null
    if (call.callType) {
      const customRubric = await db.callRubric.findFirst({
        where: {
          tenantId: call.tenantId,
          callType: call.callType,
          isDefault: true,
        },
      })
      if (customRubric) rubricCriteria = customRubric.criteria as unknown as RubricCriteria[]
    }
    // Priority 2: Tenant custom rubric for this role
    if (!rubricCriteria && call.assignedTo) {
      const roleRubric = await db.callRubric.findFirst({
        where: {
          tenantId: call.tenantId,
          role: call.assignedTo.role,
          isDefault: true,
        },
      })
      if (roleRubric) rubricCriteria = roleRubric.criteria as unknown as RubricCriteria[]
    }
    // Priority 3: Built-in call type rubric (from lib/call-types.ts)
    if (!rubricCriteria && call.callType) {
      rubricCriteria = getRubricForCallType(call.callType)
    }
    // Priority 4: Built-in role default
    if (!rubricCriteria) {
      rubricCriteria = getDefaultRubric(call.assignedTo?.role)
    }

    // Tenant-specific grading materials (scripts, processes, standards)
    const tenantMaterials = (call.tenant as { gradingMaterials?: string | null }).gradingMaterials ?? null

    // 30-60s calls: summary only, limited grading
    const isSummaryOnly = duration >= 45 && duration < 90

    // Enrich with GHL context if connected
    let ghlContext: GHLCallContext | null = null
    if (call.ghlCallId && call.tenant.ghlAccessToken) {
      ghlContext = await fetchGHLCallContext(call.tenantId, call.ghlCallId)
    }

    // Fetch recent feedback corrections to include in grading context
    const recentFeedback = await db.auditLog.findMany({
      where: {
        tenantId: call.tenantId,
        action: 'call.feedback',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { payload: true },
    })
    const feedbackContext = recentFeedback.length > 0
      ? recentFeedback.map(f => {
          const p = f.payload as { type?: string; details?: string } | null
          return p ? `- ${p.type}: ${p.details}` : null
        }).filter(Boolean).join('\n')
      : null

    // Build and send the grading prompt (3 layers: rubric + industry + tenant materials + feedback)
    const systemPrompt = isSummaryOnly
      ? buildSummaryOnlySystemPrompt()
      : buildGradingSystemPrompt(rubricCriteria, call.callType ?? null, tenantMaterials, feedbackContext)
    const callWithTranscript = { ...call, transcript }
    const userPrompt = buildGradingUserPrompt(callWithTranscript, rubricCriteria, ghlContext)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

    const grading = parseGradingResponse(content.text)

    // Update call with grading results + auto-classification
    await db.call.update({
      where: { id: callId },
      data: {
        gradingStatus: 'COMPLETED',
        score: grading.overallScore,
        rubricScores: grading.rubricScores,
        aiSummary: grading.summary,
        // Store structured coaching data as JSON string in aiFeedback
        aiFeedback: JSON.stringify({
          strengths: grading.strengths,
          redFlags: grading.redFlags,
          improvements: grading.improvements,
          objectionReplies: grading.objectionReplies,
        }),
        aiCoachingTips: grading.coachingTips,
        objections: grading.objectionReplies.length > 0 ? grading.objectionReplies : undefined,
        gradedAt: new Date(),
        // 3-tier call type: 1) manual (already set) → 2) AI detection → 3) role fallback
        ...(!call.callType ? { callType: grading.callType ?? inferCallTypeFromRole(call.assignedTo?.role) } : {}),
        // Auto-classify outcome — validate against call type's valid results
        callOutcome: validateOutcomeForType(
          grading.callOutcome,
          call.callType ?? grading.callType ?? inferCallTypeFromRole(call.assignedTo?.role),
        ),
        // Follow-up scheduled (separate from outcome)
        ...(grading.followUpScheduled !== undefined ? { callResult: grading.followUpScheduled ? 'follow_up_scheduled' : grading.callOutcome } : {}),
        // Key moments / highlights
        ...(grading.keyMoments?.length ? { keyMoments: grading.keyMoments } : {}),
        // Sentiment & motivation
        ...(grading.sentiment !== null && grading.sentiment !== undefined ? { sentiment: grading.sentiment } : {}),
        ...(grading.sellerMotivation !== null && grading.sellerMotivation !== undefined ? { sellerMotivation: grading.sellerMotivation } : {}),
        // Enrich from GHL
        ...(ghlContext?.duration && !call.durationSeconds && { durationSeconds: ghlContext.duration }),
        ...(ghlContext?.contactId && { ghlContactId: ghlContext.contactId }),
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: call.tenantId,
        action: 'call.graded',
        resource: 'call',
        resourceId: callId,
        source: 'SYSTEM',
        severity: 'INFO',
        payload: { score: grading.overallScore, userId: call.assignedToId, hasGHLContext: !!ghlContext, hasTranscript: !!transcript },
      },
    })

    // Award XP for the graded call
    if (call.assignedToId) {
      awardCallXP(call.tenantId, call.assignedToId, callId, grading.overallScore).catch((xpErr) => {
        console.warn(`[Call Grading] XP award failed for call ${callId}:`, xpErr)
      })
    }

    // Trigger call_graded workflows
    triggerWorkflows(call.tenantId, 'call_graded', {
      callId,
      contactId: call.ghlCallId ?? undefined,
      propertyId: call.propertyId ?? undefined,
      score: grading.overallScore,
    }).catch(() => {})

    // Auto-create milestone from AI-detected call outcome (source: 'AI', with dedup)
    if (call.propertyId && grading.callOutcome) {
      const OUTCOME_TO_MILESTONE: Record<string, string> = {
        appointment_set: 'APPOINTMENT_SET',
        showing_scheduled: 'APPOINTMENT_SET',
        offer_collected: 'OFFER_MADE',
        accepted: 'UNDER_CONTRACT',
        signed: 'UNDER_CONTRACT',
      }
      const milestoneType = OUTCOME_TO_MILESTONE[grading.callOutcome]
      if (milestoneType) {
        try {
          // Check if this milestone type already exists for this property (any date).
          // AI should not spam milestones — if we already made an offer, follow-up
          // calls about that offer should not create new OFFER_MADE milestones.
          const existing = await db.propertyMilestone.findFirst({
            where: {
              tenantId: call.tenantId,
              propertyId: call.propertyId,
              type: milestoneType as import('@prisma/client').MilestoneType,
            },
          })
          if (!existing) {
            await db.propertyMilestone.create({
              data: {
                tenantId: call.tenantId,
                propertyId: call.propertyId,
                type: milestoneType as import('@prisma/client').MilestoneType,
                loggedById: call.assignedToId,
                source: 'AI',
                notes: `Detected from call: ${grading.callOutcome}`,
              },
            })
            console.log(`[Call Grading] Auto-created ${milestoneType} milestone (AI) for property ${call.propertyId}`)
          }
        } catch (msErr) {
          console.warn('[Call Grading] AI milestone auto-create failed:', msErr instanceof Error ? msErr.message : msErr)
        }
      }
    }

    // Fire-and-forget: generate next steps in background
    generateAndSaveNextSteps(callId, call.tenantId, grading).catch(err =>
      console.error('[Grading] Next steps generation failed:', err)
    )

    // Recalculate TCP for the associated property
    if (call.propertyId) {
      calculateTCP(call.propertyId).catch((tcpErr) => {
        console.warn(`[Call Grading] TCP recalc failed for property ${call.propertyId}:`, tcpErr)
      })
    }
  } catch (err) {
    console.error(`[Call Grading] Error grading call ${callId}:`, err)

    await db.call.update({
      where: { id: callId },
      data: {
        gradingStatus: 'FAILED',
        aiFeedback: `Grading failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: (await db.call.findUnique({ where: { id: callId }, select: { tenantId: true } }))?.tenantId ?? '',
        action: 'call.grading.failed',
        resource: 'call',
        resourceId: callId,
        source: 'SYSTEM',
        severity: 'ERROR',
        payload: { error: err instanceof Error ? err.message : 'Unknown error' },
      },
    })
  }
}

// ─── GHL context enrichment ────────────────────────────────────────────────

interface GHLCallContext {
  contactId: string
  contactName: string
  contactPhone: string
  contactTags: string[]
  contactSource: string
  duration: number
  callStatus: string
  direction: string
  conversationHistory: string[]
  contactNotes: string[]
}

async function fetchGHLCallContext(tenantId: string, ghlConversationId: string): Promise<GHLCallContext | null> {
  try {
    const ghl = await getGHLClient(tenantId)

    // Get conversation details
    const convRes = await ghl.getConversations({ limit: 50 })
    const conv = (convRes.conversations ?? []).find(c => c.id === ghlConversationId)
    if (!conv) return null

    // Get messages in this conversation
    let messages: Array<{ direction: string; body?: string; messageType: string; meta?: { call?: { duration: number; status: string } }; dateAdded: string }> = []
    try {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { ghlAccessToken: true },
      })
      const msgRes = await fetch(`https://services.leadconnectorhq.com/conversations/${ghlConversationId}/messages?limit=20`, {
        headers: {
          'Authorization': `Bearer ${tenant?.ghlAccessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
      })
      if (msgRes.status === 200) {
        const msgData = await msgRes.json()
        messages = msgData.messages?.messages ?? []
      }
    } catch {
      // Messages endpoint may fail — continue without
    }

    // Extract call-specific data
    const callMessages = messages.filter(m => m.messageType === 'TYPE_CALL')
    const latestCall = callMessages[0]

    // Extract conversation history (non-call messages as context)
    const textMessages = messages
      .filter(m => m.body && m.messageType !== 'TYPE_CALL')
      .slice(0, 10)
      .map(m => `[${m.direction}] ${m.body}`)

    // Get contact details
    let contactTags: string[] = []
    let contactSource = ''
    try {
      const contact = await ghl.getContact(conv.contactId)
      contactTags = contact.tags ?? []
      contactSource = contact.source ?? ''
    } catch {
      // Contact fetch may fail — continue without
    }

    return {
      contactId: conv.contactId,
      contactName: conv.contactName || conv.fullName || 'Unknown',
      contactPhone: conv.phone || '',
      contactTags,
      contactSource,
      duration: latestCall?.meta?.call?.duration ?? 0,
      callStatus: latestCall?.meta?.call?.status ?? '',
      direction: conv.lastMessageDirection || '',
      conversationHistory: textMessages,
      contactNotes: [],
    }
  } catch (err) {
    console.warn('[Call Grading] Failed to fetch GHL context:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildSummaryOnlySystemPrompt(): string {
  return `You are a sales call analyst for a real estate wholesaling company.

This was a SHORT call (30-60 seconds). Provide a brief summary and basic score.
Do not deeply evaluate rubric criteria — there isn't enough call content.

You MUST respond with valid JSON only.

Response format:
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

function buildGradingSystemPrompt(
  criteria: RubricCriteria[],
  callType: string | null,
  tenantMaterials?: string | null,
  feedbackCorrections?: string | null
): string {
  const sections: string[] = []

  // Layer 1: Core role + grading philosophy
  sections.push(`You are an expert sales call coach and grader for a real estate wholesaling company.

Your job is to analyze sales calls and provide accurate, constructive scoring and feedback.

You grade based on FOUR sources of knowledge:
1. RUBRIC — the specific scoring criteria for this call type (determines the score)
2. INDUSTRY KNOWLEDGE — wholesale real estate best practices, coaching methodology, and psychology
3. COMPANY MATERIALS — this specific company's scripts, processes, and standards (if provided)
4. FEEDBACK CORRECTIONS — calibration from previous grades that users flagged as wrong

GRADING PHILOSOPHY:
Reps have different communication styles. Some follow scripts closely; others achieve the same goals conversationally. BOTH are valid. Focus on WHETHER the rep accomplished the GOAL of each criterion — not whether they used specific phrases. Award full points when the goal is clearly achieved. Award partial points when partially achieved. Only give zero when the behavior is completely absent.

FEEDBACK MUST BE TRANSCRIPT-SPECIFIC — never generic:
WRONG: "The rep failed to probe motivation effectively."
RIGHT: "When the seller said 'I just need to sell fast,' the rep immediately moved to price instead of asking 'What's been making speed the priority? How long has that been going on?'"

When no transcript is available, grade meaningfully on: call duration, outcome, contact context, and conversation history. A 5-minute completed outbound call to a warm lead is fundamentally different from a 10-second no-answer. Do NOT give a score of 0 unless the call was genuinely a failure.`)

  // Layer 2: Full industry knowledge (coaching methodology, DQ awareness, etc.)
  sections.push(INDUSTRY_KNOWLEDGE)

  // Layer 3: Call-type-specific critical instructions
  if (callType) {
    const callTypeInstructions = buildCallTypeInstructions(callType)
    if (callTypeInstructions) sections.push(callTypeInstructions)
  }

  // Layer 4: Rubric criteria with keyPhrases
  const criteriaText = criteria.map((c, i) => {
    let text = `${i + 1}. ${c.category} (max ${c.maxPoints} pts)\n   ${c.description}`
    if (c.keyPhrases && c.keyPhrases.length > 0) {
      text += `\n   Positive signals to look for: "${c.keyPhrases.join('", "')}"`
    }
    return text
  }).join('\n\n')

  const callTypeRedFlags = callType ? getRedFlagsForCallType(callType) : []

  sections.push(`GRADING RUBRIC — SCORE EACH CATEGORY:

${criteriaText}

RED FLAGS TO IDENTIFY (call these out explicitly in feedback if observed):
${callTypeRedFlags.length > 0
    ? callTypeRedFlags.map(f => `• ${f}`).join('\n')
    : '• No specific red flags defined — use general wholesale RE best practices'}`)

  // Layer 5: Tenant-specific materials
  if (tenantMaterials) {
    sections.push(`COMPANY-SPECIFIC MATERIALS:
The following are this company's own scripts, processes, and standards. Use these to inform grading — if the rep followed the company's specific process, note it positively.

${tenantMaterials}`)
  }

  // Layer 6: Recent feedback corrections
  if (feedbackCorrections) {
    sections.push(`GRADING CORRECTIONS FROM USERS:
The following feedback was submitted by managers on previous grades. Incorporate these calibrations:

${feedbackCorrections}`)
  }

  // Response format
  const validResults = callType ? getResultsForCallType(callType) : []
  const validOutcomes = validResults.length > 0
    ? validResults.map(r => `"${r.id}" (${r.name})`).join(', ')
    : '"interested", "not_interested", "appointment_set", "follow_up_scheduled", "accepted", "rejected", "signed", "not_signed", "solved", "not_solved", "showing_scheduled", "offer_collected"'

  sections.push(`RESPONSE FORMAT — valid JSON only, no markdown, no preamble:

{
  "overallScore": <number 0-100>,
  "rubricScores": {
    "<category>": {
      "score": <number>,
      "maxScore": <number>,
      "notes": "<STRICT 2-3 sentences MAX: what happened on the call for this criterion, one supporting quote or moment, and the outcome. NO coaching advice — coaching goes in improvements only.>"
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

VALID OUTCOMES FOR THIS CALL: ${validOutcomes}

Pick the highest-priority outcome that actually occurred. Set followUpScheduled: true if a future contact was agreed to at any point, regardless of primary outcome.`)

  return sections.join('\n\n')
}

// Call-type-specific critical instructions injected into the system prompt
function buildCallTypeInstructions(callType: string): string | null {
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

function buildGradingUserPrompt(
  call: {
    transcript?: string | null
    recordingUrl?: string | null
    callType?: string | null
    durationSeconds?: number | null
    direction: string
    assignedTo?: { name: string; role: string } | null
  },
  criteria: RubricCriteria[],
  ghlContext: GHLCallContext | null,
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

// ─── Response parser ────────────────────────────────────────────────────────

function parseGradingResponse(text: string): GradingResult {
  // Strip markdown fences and find the JSON object
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  // Extract from first { to last } in case there's extra text
  const firstBrace = clean.indexOf('{')
  const lastBrace = clean.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1)
  }

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(clean) as Record<string, unknown>
  } catch {
    try {
      const fixed = clean
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/[\x00-\x1f]/g, (ch) => ch === '\n' || ch === '\t' ? ch : ' ')
      raw = JSON.parse(fixed) as Record<string, unknown>
    } catch {
      throw new Error(`Failed to parse Claude grading response: ${text.substring(0, 200)}`)
    }
  }

  // Extract new structured fields with fallbacks for old format
  const strengths = Array.isArray(raw.strengths) ? raw.strengths as string[] : []
  const redFlags = Array.isArray(raw.redFlags) ? raw.redFlags as string[] : []
  const improvements = Array.isArray(raw.improvements)
    ? (raw.improvements as Array<{ what_went_wrong?: string; call_example?: string; coaching_tip?: string }>).map(i => ({
        what_went_wrong: i.what_went_wrong ?? '',
        call_example: i.call_example ?? '',
        coaching_tip: i.coaching_tip ?? '',
      }))
    : []
  const objectionReplies = Array.isArray(raw.objectionReplies)
    ? (raw.objectionReplies as Array<{ objection_label?: string; call_quote?: string; suggested_responses?: string[] }>).map(o => ({
        objection_label: o.objection_label ?? '',
        call_quote: o.call_quote ?? '',
        suggested_responses: Array.isArray(o.suggested_responses) ? o.suggested_responses : [],
      }))
    : []

  // Build legacy fields from new structure for backwards compatibility
  const feedback = strengths.length > 0
    ? strengths.join('\n')
    : (raw.feedback as string) ?? ''
  const coachingTips = improvements.length > 0
    ? improvements.map(i => i.coaching_tip)
    : Array.isArray(raw.coachingTips) ? raw.coachingTips as string[] : []

  return {
    overallScore: (raw.overallScore as number) ?? 0,
    rubricScores: (raw.rubricScores as GradingResult['rubricScores']) ?? {},
    summary: (raw.summary as string) ?? '',
    strengths,
    redFlags,
    improvements,
    objectionReplies,
    feedback,
    coachingTips,
    callType: (raw.callType as string) ?? null,
    callOutcome: (raw.callOutcome as string) ?? null,
    followUpScheduled: (raw.followUpScheduled as boolean) ?? false,
    keyMoments: Array.isArray(raw.keyMoments) ? raw.keyMoments as GradingResult['keyMoments'] : [],
    sentiment: (raw.sentiment as number) ?? null,
    sellerMotivation: (raw.sellerMotivation as number) ?? null,
  }
}

// ─── Role-based call type fallback (tier 3 of 3-tier classification) ────────

function inferCallTypeFromRole(role?: string): string {
  switch (role) {
    case 'LEAD_MANAGER': return 'qualification_call'
    case 'ACQUISITION_MANAGER': return 'offer_call'
    case 'DISPOSITION_MANAGER': return 'dispo_call'
    case 'TEAM_LEAD': return 'follow_up_call'
    default: return 'cold_call'
  }
}

// ─── Default outcome fallback (when AI returns null) ────────────────────────

/**
 * Validates that an AI-returned outcome is valid for the given call type.
 * If invalid, falls back to the first valid result for that type (the default).
 */
function validateOutcomeForType(outcome: string | null, callType: string): string {
  const validResults = getResultsForCallType(callType)
  if (validResults.length === 0) {
    // Unknown call type — accept whatever the AI returned or use generic fallback
    return outcome ?? inferDefaultOutcome(callType)
  }
  const validIds = validResults.map(r => r.id)
  if (outcome && validIds.includes(outcome)) return outcome
  // Outcome is null or not in the valid list — use the default for this type
  return inferDefaultOutcome(callType)
}

function inferDefaultOutcome(callType: string): string {
  switch (callType) {
    case 'cold_call': return 'not_interested'
    case 'qualification_call': return 'follow_up_scheduled'
    case 'admin_call': return 'solved'
    case 'follow_up_call': return 'not_interested'
    case 'offer_call': return 'follow_up_scheduled'
    case 'purchase_agreement_call': return 'follow_up_scheduled'
    case 'dispo_call': return 'not_interested'
    default: return 'not_interested'
  }
}

// ─── Default rubric ─────────────────────────────────────────────────────────

function getDefaultRubric(role?: string): RubricCriteria[] {
  if (role === 'LEAD_MANAGER') {
    return [
      { category: 'Opening', maxPoints: 15, description: 'Strong opening, built rapport quickly, stated purpose clearly' },
      { category: 'Qualifying', maxPoints: 25, description: 'Asked the right qualifying questions about the property and seller motivation' },
      { category: 'Listening', maxPoints: 20, description: 'Actively listened, did not interrupt, reflected back what was heard' },
      { category: 'Objection handling', maxPoints: 20, description: 'Handled objections professionally without being pushy' },
      { category: 'Next steps', maxPoints: 20, description: 'Set a clear next step or appointment before ending the call' },
    ]
  }

  if (role === 'ACQUISITION_MANAGER') {
    return [
      { category: 'Rapport building', maxPoints: 15, description: 'Built genuine rapport and trust with the seller' },
      { category: 'Motivation discovery', maxPoints: 25, description: 'Uncovered the seller\'s true motivation for selling' },
      { category: 'Property info', maxPoints: 20, description: 'Gathered all necessary property details (condition, timeline, liens, etc.)' },
      { category: 'Offer delivery', maxPoints: 25, description: 'Presented offer confidently, explained value clearly' },
      { category: 'Close or follow up', maxPoints: 15, description: 'Moved the deal forward — appointment, signed contract, or clear follow-up plan' },
    ]
  }

  return [
    { category: 'Professionalism', maxPoints: 20, description: 'Tone, pace, and professional demeanor throughout' },
    { category: 'Communication', maxPoints: 30, description: 'Clear, concise communication — no filler words, no rambling' },
    { category: 'Knowledge', maxPoints: 25, description: 'Demonstrated knowledge of the process and company' },
    { category: 'Outcome', maxPoints: 25, description: 'Achieved a clear outcome or next step' },
  ]
}

// ─── Auto-generate next steps after grading ─────────────────────────────────

async function generateAndSaveNextSteps(callId: string, tenantId: string, gradingResult: GradingResult) {
  try {
    const call = await db.call.findUnique({
      where: { id: callId },
      select: { aiSummary: true, callOutcome: true, callType: true, transcript: true, property: { select: { address: true, sellerMotivation: true, sellerTimeline: true, propertyCondition: true, sellerAskingReason: true } } },
    })
    if (!call) return

    const transcriptExcerpt = call.transcript ? call.transcript.slice(0, 500) : 'No transcript available'

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a real estate wholesaling CRM assistant. Based on this graded call, generate 3-5 specific next step actions the rep should take.

Call summary: ${gradingResult.summary}
Call outcome: ${call.callOutcome ?? 'Unknown'}
Call type: ${call.callType ?? 'Unknown'}
Property: ${call.property?.address ?? 'Unknown'}
Seller Motivation: ${call.property?.sellerMotivation ?? 'Unknown'}
Seller Timeline: ${call.property?.sellerTimeline ?? 'Unknown'}
Property Condition: ${call.property?.propertyCondition ?? 'Unknown'}
Seller Price Reason: ${call.property?.sellerAskingReason ?? 'Unknown'}
Score: ${gradingResult.overallScore}/100
Feedback: ${gradingResult.feedback}
Transcript excerpt: ${transcriptExcerpt}

Return JSON array only:
[{ "type": "add_note"|"create_task"|"send_sms"|"create_appointment"|"change_stage"|"check_off_task", "label": "specific action description", "reasoning": "why this action matters" }]`,
      }],
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const steps = JSON.parse(jsonMatch[0]) as Array<{ type: string; label: string; reasoning: string }>
    const stepsWithStatus = steps.map(s => ({ ...s, status: 'pending', pushedAt: null }))

    await db.call.update({
      where: { id: callId },
      data: { aiNextSteps: stepsWithStatus },
    })
    console.log(`[Grading] Generated ${steps.length} next steps for call ${callId}`)
  } catch (err) {
    console.error('[Grading] Next steps generation error:', err instanceof Error ? err.message : err)
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RubricCriteria {
  category: string
  maxPoints: number
  description: string
  keyPhrases?: string[]
}

export interface GradingResult {
  overallScore: number
  rubricScores: Record<string, { score: number; maxScore: number; notes: string }>
  summary: string
  // New structured coaching fields
  strengths: string[]
  redFlags: string[]
  improvements: Array<{ what_went_wrong: string; call_example: string; coaching_tip: string }>
  objectionReplies: Array<{ objection_label: string; call_quote: string; suggested_responses: string[] }>
  // Legacy fields — populated from new structure for backwards compatibility
  feedback: string
  coachingTips: string[]
  // Auto-classification
  callType: string | null
  callOutcome: string | null
  followUpScheduled: boolean
  // Highlights with timestamps
  keyMoments: Array<{ timestamp: string; type: string; description: string; quote?: string }>
  // Sentiment & motivation
  sentiment: number | null        // -1.0 to 1.0
  sellerMotivation: number | null  // 0.0 to 1.0
}
