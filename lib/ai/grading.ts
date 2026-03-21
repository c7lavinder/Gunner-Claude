// lib/ai/grading.ts
// Automatic call grading using Claude API
// Duration routing: <30s skip, 30-60s summary only, 60s+ full grading
// Transcribes via Deepgram when recording URL available

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { transcribeRecording } from '@/lib/ai/transcribe'
import { calculateTCP } from '@/lib/ai/scoring'
import { getCallTypeAIContext, getRubricForCallType } from '@/lib/call-types'
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
      : buildGradingSystemPrompt(rubricCriteria, tenantMaterials, feedbackContext)
    const callWithTranscript = { ...call, transcript }
    const userPrompt = buildGradingUserPrompt(callWithTranscript, rubricCriteria, ghlContext)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
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
        aiFeedback: grading.feedback,
        aiCoachingTips: grading.coachingTips,
        gradedAt: new Date(),
        // 3-tier call type: 1) manual (already set) → 2) AI detection → 3) role fallback
        ...(!call.callType ? { callType: grading.callType ?? inferCallTypeFromRole(call.assignedTo?.role) } : {}),
        // Auto-classify outcome
        ...(grading.callOutcome ? { callOutcome: grading.callOutcome } : {}),
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

function buildGradingSystemPrompt(criteria: RubricCriteria[], tenantMaterials?: string | null, feedbackCorrections?: string | null): string {
  const sections: string[] = []

  // Layer 1: Core grading instructions
  sections.push(`You are an expert sales call coach and grader for a real estate wholesaling company.

Your job is to analyze sales calls and provide accurate, constructive scoring and feedback.
You grade based on THREE sources of knowledge:
1. RUBRIC — the specific scoring criteria for this call type (most important — this determines the score)
2. INDUSTRY KNOWLEDGE — wholesale real estate best practices and standards
3. COMPANY MATERIALS — this specific company's scripts, processes, and standards (if provided)

You grade based on ALL available information — transcripts, call metadata, contact context, and conversation history.

When a transcript is not available, you MUST still grade meaningfully based on:
- Call duration (longer completed calls generally indicate better engagement)
- Call outcome (completed vs no-answer vs voicemail)
- Contact context (tags, source, conversation history)
- Direction and patterns

A 5-minute completed outbound call to a warm lead is fundamentally different from a 10-second no-answer. Grade accordingly.

Do NOT give a score of 0 unless the call was genuinely a failure (no-answer, immediate hangup, etc.)

You MUST respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON.`)

  // Layer 2: Industry knowledge
  sections.push(INDUSTRY_KNOWLEDGE)

  // Layer 3: Tenant-specific materials
  if (tenantMaterials) {
    sections.push(`COMPANY-SPECIFIC MATERIALS:
The following are this company's own scripts, processes, and standards. Use these to inform your grading — if the rep followed the company's specific process, that should positively affect the score. If they deviated from it, note that in feedback.

${tenantMaterials}`)
  }

  // Layer 4: Recent feedback corrections from users
  if (feedbackCorrections) {
    sections.push(`RECENT GRADING CORRECTIONS FROM USERS:
The following feedback was submitted by managers on previous grades. Adjust your grading behavior accordingly:

${feedbackCorrections}

Use these corrections to calibrate your scoring. If users said scores were too high, be stricter. If they said criteria were wrong, pay closer attention to those areas.`)
  }

  // Rubric criteria
  sections.push(`GRADING RUBRIC (score each category):
${criteria.map((c) => `- ${c.category} (max ${c.maxPoints} pts): ${c.description}`).join('\n')}

Response format:
{
  "overallScore": <number 0-100>,
  "rubricScores": {
    "<category>": {
      "score": <number>,
      "maxScore": <number>,
      "notes": "<brief note>"
    }
  },
  "summary": "<2-3 sentence call summary>",
  "feedback": "<specific, actionable feedback paragraph>",
  "coachingTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "callType": "<one of: cold_call, qualification_call, admin_call, follow_up_call, offer_call, purchase_agreement_call, dispo_call — or null if the call type was already set>",
  "callOutcome": "<one of: not_interested, interested, appointment_set, follow_up_scheduled, not_qualified, solved, not_solved, accepted, rejected, signed, not_signed, showing_scheduled, offer_collected — pick the HIGHEST priority outcome that actually occurred>",
  "followUpScheduled": <boolean — true if a specific follow-up was agreed to, regardless of outcome>,
  "keyMoments": [
    {
      "timestamp": "<MM:SS format — estimate from conversation flow if no exact timestamp>",
      "type": "<objection_handled|appointment_set|price_discussion|rapport_building|red_flag|closing_attempt|motivation_revealed>",
      "description": "<what happened at this moment>",
      "quote": "<direct quote from transcript if available>"
    }
  ],
  "sentiment": <number -1.0 to 1.0 — overall seller sentiment. Negative = hostile/frustrated, 0 = neutral, positive = warm/cooperative>,
  "sellerMotivation": <number 0.0 to 1.0 — how motivated is the seller to sell? 0 = not at all, 1 = desperate to sell immediately. null if not a seller call>
}

CALL TYPE CLASSIFICATION RULES:
- If the call type is already set in the metadata, set callType to null (don't override manual classification)
- If NOT set, determine the type from the conversation content:
  - cold_call: first contact, outbound, seller doesn't know the caller
  - qualification_call: inbound lead or first meaningful conversation, qualifying fit
  - admin_call: scheduling, updates, logistics, problem solving
  - follow_up_call: re-engaging someone previously contacted
  - offer_call: presenting a price/offer to buy the property
  - purchase_agreement_call: walking through contract signing
  - dispo_call: talking to a buyer/investor about a deal

CALL OUTCOME PRIORITY (pick the highest that applies):
accepted > signed > offer_collected > appointment_set > showing_scheduled > interested > follow_up_scheduled > not_interested > rejected > not_qualified > not_signed > not_solved > solved`)

  return sections.join('\n\n')
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
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as GradingResult
  } catch {
    throw new Error(`Failed to parse Claude grading response: ${text.substring(0, 200)}`)
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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RubricCriteria {
  category: string
  maxPoints: number
  description: string
}

export interface GradingResult {
  overallScore: number
  rubricScores: Record<string, { score: number; maxScore: number; notes: string }>
  summary: string
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
