// lib/ai/grading.ts
// Automatic call grading using Claude API
// Triggered immediately when a call ends via GHL webhook

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── Main grading function ──────────────────────────────────────────────────

export async function gradeCall(callId: string): Promise<void> {
  // Mark as processing
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
          },
        },
      },
    })

    if (!call) throw new Error(`Call ${callId} not found`)

    // Get the appropriate rubric for this user's role
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

    // Build the grading prompt — works with transcript, recording URL, or metadata only
    const systemPrompt = buildGradingSystemPrompt(rubricCriteria)
    const userPrompt = buildGradingUserPrompt(call, rubricCriteria)

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

    // Parse the structured JSON response from Claude
    const grading = parseGradingResponse(content.text)

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
        payload: { score: grading.overallScore, userId: call.assignedToId },
      },
    })
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

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildGradingSystemPrompt(criteria: RubricCriteria[]): string {
  return `You are an expert sales call coach and grader for a real estate wholesaling company.

Your job is to analyze sales calls and provide accurate, constructive scoring and feedback.

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
  call: { transcript?: string | null; recordingUrl?: string | null; callType?: string | null; durationSeconds?: number | null; direction: string; assignedTo?: { name: string; role: string } | null },
  criteria: RubricCriteria[],
): string {
  return `Grade this sales call.

Rep: ${call.assignedTo?.name ?? 'Unknown'}
Role: ${call.assignedTo?.role ?? 'Unknown'}
Call type: ${call.callType ?? 'Not specified'}
Direction: ${call.direction}
Duration: ${call.durationSeconds ? `${Math.round(call.durationSeconds / 60)} minutes` : 'Unknown'}

${call.transcript ? `TRANSCRIPT:\n${call.transcript}` : '(Transcript not available — grade based on available metadata only and note this in feedback)'}

Evaluate against these criteria:
${criteria.map((c) => `- ${c.category}: ${c.description}`).join('\n')}

Provide your JSON grading response now.`
}

// ─── Response parser ────────────────────────────────────────────────────────

function parseGradingResponse(text: string): GradingResult {
  try {
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as GradingResult
  } catch {
    throw new Error(`Failed to parse Claude grading response: ${text.substring(0, 200)}`)
  }
}

// ─── Default rubric (used when no tenant rubric is configured) ──────────────

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

  // Default for all other roles
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
