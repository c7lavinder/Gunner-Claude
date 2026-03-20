// lib/ai/grading.ts
// Automatic call grading using Claude API
// Duration routing: <30s skip, 30-60s summary only, 60s+ full grading
// Transcribes via Deepgram when recording URL available

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { transcribeRecording } from '@/lib/ai/transcribe'
import { calculateTCP } from '@/lib/ai/scoring'

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
          },
        },
      },
    })

    if (!call) throw new Error(`Call ${callId} not found`)

    const duration = call.durationSeconds ?? 0

    // Duration routing: <30s should not reach here (filtered by webhook handler)
    // But handle defensively
    if (duration > 0 && duration < 30) {
      await db.call.update({
        where: { id: callId },
        data: { gradingStatus: 'COMPLETED', score: 0, aiSummary: 'Dial attempt — call under 30 seconds.' },
      })
      return
    }

    // Transcribe if recording URL exists
    let transcript = call.transcript
    if (!transcript && call.recordingUrl) {
      console.log(`[Call Grading] Transcribing recording for call ${callId}...`)
      const transcription = await transcribeRecording(call.recordingUrl)
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

    // Get rubric for this user's role
    const rubric = call.assignedTo
      ? await db.callRubric.findFirst({
          where: {
            tenantId: call.tenantId,
            role: call.assignedTo.role,
            isDefault: true,
          },
        })
      : null

    const rubricCriteria = rubric?.criteria as RubricCriteria[] | null ?? getDefaultRubric(call.assignedTo?.role)

    // 30-60s calls: summary only, limited grading
    const isSummaryOnly = duration > 0 && duration < 60

    // Enrich with GHL context if connected
    let ghlContext: GHLCallContext | null = null
    if (call.ghlCallId && call.tenant.ghlAccessToken) {
      ghlContext = await fetchGHLCallContext(call.tenantId, call.ghlCallId)
    }

    // Build and send the grading prompt
    const systemPrompt = isSummaryOnly
      ? buildSummaryOnlySystemPrompt()
      : buildGradingSystemPrompt(rubricCriteria)
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

    // Update call with enriched data from GHL
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
        ...(ghlContext?.duration && !call.durationSeconds && { durationSeconds: ghlContext.duration }),
        ...(ghlContext?.callStatus && { callResult: ghlContext.callStatus }),
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
  "coachingTips": ["<one tip>"]
}`
}

function buildGradingSystemPrompt(criteria: RubricCriteria[]): string {
  return `You are an expert sales call coach and grader for a real estate wholesaling company.

Your job is to analyze sales calls and provide accurate, constructive scoring and feedback.
You grade based on ALL available information — transcripts, call metadata, contact context, and conversation history.

When a transcript is not available, you MUST still grade meaningfully based on:
- Call duration (longer completed calls generally indicate better engagement)
- Call outcome (completed vs no-answer vs voicemail)
- Contact context (tags, source, conversation history)
- Direction and patterns

A 5-minute completed outbound call to a warm lead is fundamentally different from a 10-second no-answer. Grade accordingly.

Do NOT give a score of 0 unless the call was genuinely a failure (no-answer, immediate hangup, etc.)

You MUST respond with valid JSON only — no markdown, no preamble, no explanation outside the JSON.

Grading criteria:
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
  "coachingTips": ["<tip 1>", "<tip 2>", "<tip 3>"]
}`
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
}
