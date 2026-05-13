// lib/ai/grading.ts
// Automatic call grading using Claude API
// Duration routing: <30s skip, 30-60s summary only, 60s+ full grading
// Transcribes via Deepgram when recording URL available

import { db } from '@/lib/db/client'
import { getGHLClient } from '@/lib/ghl/client'
import { transcribeRecording } from '@/lib/ai/transcribe'
import { calculateTCP } from '@/lib/ai/scoring'
import { getRubricForCallType, getResultsForCallType } from '@/lib/call-types'
import { awardCallXP } from '@/lib/gamification/xp'
import { triggerWorkflows } from '@/lib/workflows/engine'
import { logFailure } from '@/lib/audit'
import { anthropic } from '@/config/anthropic'
import { effectiveStageName, PROPERTY_LANE_SELECT } from '@/lib/property-status'
import { stripJsonFences, extractFirstJsonArray } from '@/lib/ai/json-utils'
import {
  buildGradingSystemPrompt,
  buildSummaryOnlySystemPrompt,
  buildGradingUserPrompt,
  VERSION as GRADING_PROMPT_VERSION,
} from '@/lib/ai/prompts/grading'

export { GRADING_PROMPT_VERSION }

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

    // Defense-in-depth: if a caller invokes gradeCall() before a recording
    // exists AND there's no transcript, route to SKIPPED instead of falling
    // through to the FAILED branch below. The cron processors are supposed
    // to gate this, but historical callsites (poll-calls HTTP endpoint,
    // sync scripts) sometimes called gradeCall() on freshly-created rows
    // and produced thousands of FAILED "No recording or transcript available"
    // shells. Routing here means even a misuse stops being destructive.
    if (!call.recordingUrl && !call.transcript) {
      await db.call.update({
        where: { id: callId },
        data: {
          gradingStatus: 'SKIPPED',
          callResult: 'no_answer',
          aiSummary: 'No answer — no recording produced.',
        },
      })
      console.log(`[Call Grading] No recording for call ${callId} (${duration}s) — marked SKIPPED`)
      return
    }

    // Duration routing is handled by the cron processor (SKIPPED for <45s).
    // gradeCall() focuses on transcription + AI grading.
    // 45-90s: summary only (no rubric score)
    // 90s+: full grading with rubric score

    // Transcribe if recording URL exists
    let transcript = call.transcript
    if (!transcript && call.recordingUrl) {
      console.log(`[Call Grading] Transcribing recording for call ${callId}...`)
      const ghlToken = (call.tenant as { ghlAccessToken?: string | null }).ghlAccessToken ?? undefined
      const transcription = await transcribeRecording(call.recordingUrl, ghlToken ?? undefined)
      if (transcription.status === 'success' && transcription.transcript) {
        transcript = transcription.transcript
        // Save transcript + real duration from Deepgram
        await db.call.update({
          where: { id: callId },
          data: {
            transcript,
            ...(transcription.duration ? { durationSeconds: transcription.duration } : {}),
          },
        })
        console.log(`[Call Grading] Transcription complete: ${transcript.length} chars, duration=${transcription.duration ?? '?'}s`)

        // Now we know the real duration — skip short calls instead of wasting a Claude call
        const realDuration = transcription.duration ?? call.durationSeconds ?? 0
        if (realDuration > 0 && realDuration < 45) {
          await db.call.update({
            where: { id: callId },
            data: { gradingStatus: 'SKIPPED', aiSummary: `Short call (${realDuration}s) — skipped.`, callResult: 'short_call' },
          })
          console.log(`[Call Grading] Short call detected after transcription (${realDuration}s) — skipped`)
          return
        }
      } else {
        console.warn(`[Call Grading] Transcription failed: ${transcription.error}`)
        // Deepgram fails on short/silent audio. If the probed audio length is
        // <45s, classify as short_call (SKIPPED) instead of a retryable FAILED.
        const probedDur = transcription.duration ?? 0
        if (probedDur > 0 && probedDur < 45) {
          await db.call.update({
            where: { id: callId },
            data: {
              gradingStatus: 'SKIPPED',
              callResult: 'short_call',
              durationSeconds: probedDur,
              aiSummary: `Short call (${probedDur}s) — skipped.`,
            },
          })
          console.log(`[Call Grading] Short call detected from audio probe (${probedDur}s) — skipped`)
          return
        }
      }
    }

    // If no transcript available, mark FAILED. The cron processor will retry
    // by calling gradeCall() again on the next cycle (if recording exists).
    if (!transcript) {
      await db.call.update({
        where: { id: callId },
        data: {
          gradingStatus: 'FAILED',
          aiSummary: call.recordingUrl
            ? 'Transcription failed — cron will retry.'
            : 'No recording or transcript available.',
        },
      })
      console.log(`[Call Grading] No transcript for call ${callId} (${duration}s, recording: ${call.recordingUrl ? 'yes' : 'no'})`)
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

    // 30-60s calls: summary only, limited grading
    const isSummaryOnly = duration >= 45 && duration < 90

    // Enrich with GHL context if connected
    let ghlContext: GHLCallContext | null = null
    if (call.ghlCallId && call.tenant.ghlAccessToken) {
      ghlContext = await fetchGHLCallContext(call.tenantId, call.ghlCallId)
    }

    // ── Build full knowledge context from playbook + user profiles + cross-call data ──
    const { buildGradingContext } = await import('@/lib/ai/context-builder')
    const knowledgeContext = await buildGradingContext({
      tenantId: call.tenantId,
      userId: call.assignedToId ?? undefined,
      callType: call.callType,
      userRole: call.assignedTo?.role ?? null,
      contactId: call.ghlContactId ?? ghlContext?.contactId ?? null,
      propertyId: call.propertyId ?? undefined,
    })

    // Build and send the grading prompt with full playbook knowledge
    const systemPrompt = isSummaryOnly
      ? buildSummaryOnlySystemPrompt()
      : buildGradingSystemPrompt(rubricCriteria, call.callType ?? null, knowledgeContext)
    const callWithTranscript = { ...call, transcript }
    const userPrompt = buildGradingUserPrompt(callWithTranscript, rubricCriteria, ghlContext)

    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()

    // Opus 4.6 with extended thinking. Originally wired to Opus 4.7 (commit
    // c58b695), reverted 8 minutes later to 4.6 (598f852) — see PENDING D-0XX
    // in docs/AUDIT_PLAN.md. The 4.7-era prompt expansion (32k tokens, 16k
    // thinking budget, 50 prior calls of context) is intentionally retained.
    // Per-call cost is meaningful, but each call origination costs hundreds;
    // pulling maximum signal out of every graded call is the right trade.
    const GRADING_MODEL = 'claude-opus-4-6'
    // SDK v0.90 refuses non-streaming requests whose worst-case runtime could
    // exceed 10 minutes (max_tokens + thinking budget). Opus + 32k/16k trips
    // the preflight, so we stream and collect the final message.
    const response = await anthropic.messages.stream({
      model: GRADING_MODEL,
      max_tokens: 32000,
      thinking: { type: 'enabled', budget_tokens: 16000 },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }).finalMessage()

    // Extended thinking prepends a thinking block — grab the first text block,
    // not content[0], which would be the thinking.
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block in Claude grading response')
    }
    const responseText = textBlock.text

    // Log the AI call
    logAiCall({
      tenantId: call.tenantId,
      userId: call.assignedToId,
      type: 'call_grading',
      pageContext: `call:${callId}`,
      input: userPrompt.slice(0, 5000),
      output: responseText.slice(0, 5000),
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      durationMs: timer(),
      model: GRADING_MODEL,
    }).catch((err) => {
      logFailure(call.tenantId, 'grading.ai_log_failed', `call:${callId}`, err)
    })

    const grading = parseGradingResponse(responseText)

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
        // Auto-classify outcome — UNLESS a human has explicitly locked it via Reclassify.
        ...(call.outcomeManualOverride
          ? {}
          : {
              callOutcome: validateOutcomeForType(
                grading.callOutcome,
                call.callType ?? grading.callType ?? inferCallTypeFromRole(call.assignedTo?.role),
              ),
            }),
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
    }).catch((err) => {
      logFailure(call.tenantId, 'grading.workflows_trigger_failed', callId, err)
    })

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

    // v1.1 Wave 4 — auto-link Call.sellerId via (propertyId, ghlContactId)
    // BEFORE the extract / TCP / rollup fan-out, so downstream consumers see
    // the linked Seller. await intentionally — we want sellerId set before
    // the rollup fires below. autolinkCallSeller is idempotent + cheap (one
    // findMany on a small join table) and a no-op when sellerId is already
    // set or when no unique (propertyId, ghlContactId) match exists.
    let resolvedSellerId = call.sellerId
    try {
      const { autolinkCallSeller } = await import('@/lib/v1_1/call_seller_autolink')
      const linkResult = await autolinkCallSeller(call.tenantId, callId)
      if (linkResult.status === 'linked' && linkResult.sellerId) {
        resolvedSellerId = linkResult.sellerId
        console.log(`[Grading] Auto-linked call ${callId} to seller ${linkResult.sellerId}`)
      }
    } catch (err) {
      console.error('[Grading] Auto-link failed:', err instanceof Error ? err.message : err)
    }

    // Fire-and-forget: extract deal intelligence from transcript
    if (call.propertyId && transcript) {
      import('@/lib/ai/extract-deal-intel').then(({ extractDealIntel }) =>
        extractDealIntel(callId).catch(err =>
          console.error('[Grading] Deal intel extraction failed:', err instanceof Error ? err.message : err)
        )
      )
    }

    // Recalculate TCP for the associated property. Class-4 hardened —
    // calculateTCP now requires tenantId so its internal Property + Seller
    // queries scope correctly even when called from an untrusted boundary.
    if (call.propertyId) {
      calculateTCP(call.tenantId, call.propertyId).catch((tcpErr) => {
        console.warn(`[Call Grading] TCP recalc failed for property ${call.propertyId}:`, tcpErr)
      })
    }

    // v1.1 Wave 4 — fire-and-forget seller rollup. Recomputes the
    // Seller's motivationScore, likelihoodToSellScore, totalCallCount,
    // lastContactDate, noAnswerStreak, and additive lists (objection
    // profile, red/green flags) from the seller's full call history.
    // Idempotent. Uses the auto-linked sellerId from the pre-extract step
    // above — so newly auto-linked calls trigger the rollup on their own.
    if (resolvedSellerId) {
      import('@/lib/v1_1/seller_rollup').then(({ rollupSellerFromCalls }) =>
        rollupSellerFromCalls(call.tenantId, resolvedSellerId!, { dryRun: false }).catch(err =>
          console.error('[Grading] Seller rollup failed:', err instanceof Error ? err.message : err)
        )
      )
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
// Moved to lib/ai/prompts/grading.ts (Phase 6 of LLM Rewiring Plan, Session 87).
// VERSION export re-exported above as GRADING_PROMPT_VERSION for traceability.

// ─── Response parser ────────────────────────────────────────────────────────

export function parseGradingResponse(text: string): GradingResult {
  // Strip markdown fences and find the JSON object
  let clean = stripJsonFences(text)

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
    sentiment: coerceSentiment(raw.sentiment),
    sellerMotivation: coerceNumber(raw.sellerMotivation),
  }
}

// Claude occasionally returns sentiment/sellerMotivation in shapes Prisma's
// Float column rejects: word labels ("positive"), prose with a number embedded
// ("0.7 — they really want to sell"), objects with a `.value`/`.score` field,
// or single-element arrays. Bug #21 fix (Session 79) widens the coercion to
// handle all of these. Anything still non-numeric returns null so the update
// silently drops the field instead of failing the whole grade.
function coerceSentiment(v: unknown): number | null {
  const n = coerceToFloat(v)
  if (n !== null) return Math.max(-1, Math.min(1, n))
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (/(very\s+positive|positive)/.test(s)) return 1
    if (/(very\s+negative|negative)/.test(s)) return -1
    if (/neutral/.test(s)) return 0
  }
  return null
}

function coerceNumber(v: unknown): number | null {
  const n = coerceToFloat(v)
  if (n === null) return null
  return Math.max(0, Math.min(1, n))
}

// Drill into common Claude response shapes and pull a finite number out.
// Returns null when nothing usable is found; the caller is responsible for
// any range clamping.
function coerceToFloat(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean' || v === null || v === undefined) return null
  if (Array.isArray(v)) return v.length > 0 ? coerceToFloat(v[0]) : null
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    return coerceToFloat(obj.value ?? obj.score ?? obj.rating ?? null)
  }
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (!trimmed) return null
    const direct = Number(trimmed)
    if (Number.isFinite(direct)) return direct
    // Prose with a number embedded — "0.7 - high motivation", "score: 0.85".
    const match = trimmed.match(/-?\d+(?:\.\d+)?/)
    if (match) {
      const parsed = Number(match[0])
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
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
      select: {
        aiSummary: true, callOutcome: true, callType: true, transcript: true, contactName: true,
        calledAt: true,
        assignedTo: { select: { name: true, role: true } },
        property: { select: { address: true, city: true, state: true, propertyCondition: true, ...PROPERTY_LANE_SELECT } },
      },
    })
    if (!call) return

    // Today's date anchors relative references in the transcript ("Friday",
    // "Monday", "next week") to real dates. Without this the model defaults
    // to training-data-stale dates and we end up with appointmentTime in the
    // past (e.g. "2025-01-24" on a 2026 call).
    const anchorDate = call.calledAt ?? new Date()
    const todayIso = anchorDate.toISOString().slice(0, 10)
    const todayDow = anchorDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })
    // Rep name + role so the model signs SMS messages as the actual rep, not
    // a random name pulled from context. Was hallucinating "Carl" on a
    // Kyle-assigned call before this landed.
    const repName = call.assignedTo?.name ?? 'the rep'
    const repFirst = repName.split(/\s+/)[0] ?? repName
    const repRole = call.assignedTo?.role ?? 'Unknown'

    // Feed the FULL transcript — reps often reference specific quotes/timestamps
    // we want surfaced. Opus handles long context well.
    const fullTranscript = call.transcript ?? 'No transcript available'

    // Load tenant-configured appointment types + GHL pipelines so the AI can
    // emit explicit calendarId / pipelineId / stageId values instead of names.
    // Rule 2: IDs, never fuzzy names.
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    })
    const appointmentTypes = (((tenant?.config ?? {}) as { appointmentTypes?: Array<{ id: string; label: string; calendarId: string; defaultDurationMin?: number; titleTemplate?: string }> }).appointmentTypes) ?? []

    let pipelinesBlock = ''
    try {
      const { getGHLClient } = await import('@/lib/ghl/client')
      const ghl = await getGHLClient(tenantId)
      const pipelinesResp = await ghl.getPipelines()
      const lines: string[] = []
      for (const p of pipelinesResp.pipelines ?? []) {
        lines.push(`- pipelineId="${p.id}" name="${p.name}"`)
        for (const s of p.stages ?? []) {
          lines.push(`    stageId="${s.id}" name="${s.name}"`)
        }
      }
      pipelinesBlock = lines.join('\n')
    } catch {
      pipelinesBlock = '(pipelines unavailable)'
    }

    const appointmentTypesBlock = appointmentTypes.length === 0
      ? '(none configured — do NOT emit create_appointment without calendarId)'
      : appointmentTypes
          .map(t => `- id="${t.id}" label="${t.label}" calendarId="${t.calendarId}" defaultDurationMin=${t.defaultDurationMin ?? 30}${t.titleTemplate ? ` titleTemplate="${t.titleTemplate}"` : ''}`)
          .join('\n')

    const contactName = call.contactName ?? 'the contact'
    const propertyAddress = call.property?.address
      ? `${call.property.address}${call.property.city ? ', ' + call.property.city : ''}`
      : 'Unknown'

    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const nsTimer = startTimer()

    const NEXT_STEPS_MODEL = 'claude-opus-4-6'
    const res = await anthropic.messages.stream({
      model: NEXT_STEPS_MODEL,
      // Bumped from 8000 → 16000: the prompt now carries the full pipelines+stages
      // dump (all stages across all pipelines) plus the appointmentTypes block,
      // so responses with 4-5 actions each carrying a full smsBody + verbose
      // reasoning can easily hit the old cap and truncate mid-JSON.
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: `You are a real estate wholesaling CRM assistant. Based on this graded call, generate 3-5 specific next step actions the rep should take.

TODAY'S DATE: ${todayIso} (${todayDow}, America/Chicago). Any appointmentTime or sendAt you produce MUST be at or after today — past dates are a bug.

THE REP ON THIS CALL: ${repFirst} (${repName}, role ${repRole}). Any SMS you write is FROM ${repFirst} — sign it with their first name, not a placeholder or a hallucinated name.

CRITICAL RULES:
- Each action type can only appear ONCE. Do NOT generate two actions of the same type.
- Every label must be specific with real names, addresses, and details from the call.
- Only suggest actions the call actually supports.
- For add_note: "label" is a short action-card title like "Follow-up call with {contactName} — walkthrough scheduled". "noteBody" is the FULL paragraph in first person as ${repFirst} that gets pushed to GHL as the CRM note — include exact numbers (prices, dates, percentages), seller name, property address, key outcomes, and what was discussed. noteBody must be the full narrative; label is just the Gunner card title. Never duplicate the short label into noteBody.
- For create_task: Write a specific title like "Contact Name: Follow up on Address after outcome". The reasoning should serve as the task description.

- For send_sms: The "label" field is a short summary shown on the action card. The "smsBody" field MUST contain the actual message text the contact will receive — written as ${repFirst} in first person, casual/friendly but professional. Sign off as ${repFirst}, not anyone else. Do not put the SMS copy in the label field.
- For create_appointment: ONLY emit this type if a matching appointment type exists below. Set "appointmentTypeId" to the matching id, "calendarId" to that type's calendarId, and "appointmentTime" to an ISO datetime AT OR AFTER ${todayIso}. If the transcript mentions a day like "Friday", resolve it to the NEXT ${todayIso}-or-later Friday — never a past date. Weekdays only, 10am or 2pm local default. Set "label" using the type's titleTemplate if given, otherwise "{typeLabel} at {address} w/ {contactName}".
- For change_stage: ALWAYS emit explicit "pipelineId" AND "stageId" picked from the pipelines list below. If no appropriate stage exists, do NOT emit change_stage. Never return stage names instead of IDs.

AVAILABLE APPOINTMENT TYPES (use these exact ids and calendarIds):
${appointmentTypesBlock}

AVAILABLE PIPELINES AND STAGES (use these exact ids for change_stage):
${pipelinesBlock}

Contact name: ${contactName}
Property: ${propertyAddress}
Property Condition: ${call.property?.propertyCondition ?? 'Unknown'}
Current pipeline stage: ${call.property ? (effectiveStageName(call.property) ?? 'Unknown') : 'Unknown'}
Current pipeline id: Unknown
Call summary: ${gradingResult.summary}
Call outcome: ${call.callOutcome ?? 'Unknown'}
Call type: ${call.callType ?? 'Unknown'}
Score: ${gradingResult.overallScore}/100
Feedback: ${gradingResult.feedback}

Full transcript:
${fullTranscript}

Return JSON array only:
[{
  "type": "add_note"|"create_task"|"send_sms"|"create_appointment"|"change_stage"|"check_off_task",
  "label": "specific action description",
  "reasoning": "why this action matters",
  "noteBody": "only for add_note — the full paragraph pushed to GHL as the CRM note",
  "smsBody": "only for send_sms — the actual SMS text",
  "appointmentTypeId": "only for create_appointment",
  "calendarId": "only for create_appointment",
  "appointmentTime": "only for create_appointment — ISO datetime",
  "durationMin": 30,
  "pipelineId": "only for change_stage",
  "stageId": "only for change_stage"
}]`,
      }],
    }).finalMessage()

    const nsTextBlock = res.content.find(b => b.type === 'text')
    const text = nsTextBlock && nsTextBlock.type === 'text' ? nsTextBlock.text : '[]'

    logAiCall({
      tenantId, type: 'next_steps', pageContext: `call:${callId}`,
      input: `Next steps for call ${callId}`, output: text.slice(0, 2000),
      tokensIn: res.usage?.input_tokens, tokensOut: res.usage?.output_tokens,
      durationMs: nsTimer(), model: NEXT_STEPS_MODEL,
    }).catch((err) => {
      logFailure(tenantId, 'grading.next_steps_log_failed', `call:${callId}`, err)
    })

    const stripped = stripJsonFences(text)
    const arrayText = extractFirstJsonArray(stripped)
    if (!arrayText) {
      const stopReason = (res as { stop_reason?: string }).stop_reason ?? 'unknown'
      console.error(`[Grading] No balanced JSON array in next_steps output. stop_reason=${stopReason} head=${stripped.slice(0, 200)}`)
      logFailure(tenantId, 'grading.next_steps_no_json', `call:${callId}`, new Error('No balanced JSON array in response'), {
        stopReason,
        outputHead: stripped.slice(0, 500),
        outputLength: stripped.length,
      })
      return
    }

    let steps: Array<{
      type: string; label: string; reasoning: string
      noteBody?: string
      smsBody?: string; sendAt?: string; timezone?: string
      appointmentTypeId?: string; calendarId?: string; appointmentTime?: string; durationMin?: number
      pipelineId?: string; stageId?: string
    }>
    try {
      steps = JSON.parse(arrayText)
    } catch (parseErr) {
      console.error(`[Grading] JSON.parse failed on next_steps: ${parseErr instanceof Error ? parseErr.message : parseErr}`)
      logFailure(tenantId, 'grading.next_steps_parse_error', `call:${callId}`, parseErr, {
        jsonHead: arrayText.slice(0, 500),
        jsonLength: arrayText.length,
      })
      return
    }

    // Legacy collapse: schedule_sms → send_sms with sendAt preserved.
    // Keeps old data in sync with the merged single-type model.
    for (const s of steps) {
      if (s.type === 'schedule_sms') s.type = 'send_sms'
    }

    // Server-side dedup: only keep one action per type
    const seenTypes = new Set<string>()
    const dedupedSteps = steps.filter(s => {
      if (seenTypes.has(s.type)) return false
      seenTypes.add(s.type)
      return true
    })

    const stepsWithStatus = dedupedSteps.map(s => ({ ...s, status: 'pending', pushedAt: null }))

    await db.call.update({
      where: { id: callId },
      data: { aiNextSteps: stepsWithStatus },
    })
    console.log(`[Grading] Generated ${dedupedSteps.length} next steps for call ${callId} (${steps.length - dedupedSteps.length} duplicates removed)`)
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
