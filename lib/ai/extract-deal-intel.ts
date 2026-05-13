// lib/ai/extract-deal-intel.ts
// Extracts deal intelligence from call transcripts and proposes property updates.
// Runs after call grading. Receives current property data + existing dealIntel
// so it can UPDATE rather than replace — cumulative intelligence across all calls.

import { db } from '@/lib/db/client'
import type { DealIntel, ProposedDealIntelChange, DealIntelCategory } from '@/lib/types/deal-intel'
import { FIELD_LABELS, FIELD_CATEGORY } from '@/lib/types/deal-intel'
import { logFailure } from '@/lib/audit'
import { anthropic } from '@/config/anthropic'
import { effectiveStatus, PROPERTY_LANE_SELECT } from '@/lib/property-status'
import { stripJsonFences } from '@/lib/ai/json-utils'
import {
  buildDealIntelSystemPrompt,
  VERSION as DEAL_INTEL_PROMPT_VERSION,
} from '@/lib/ai/prompts/deal-intel'
import {
  buildSettingsContext,
  formatSettingsForPrompt,
} from '@/lib/ai/settings-context'

export { DEAL_INTEL_PROMPT_VERSION }

export async function extractDealIntel(callId: string): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      property: {
        select: {
          id: true, address: true, city: true, state: true, zip: true,
          ...PROPERTY_LANE_SELECT,
          askingPrice: true, offerPrice: true, contractPrice: true,
          propertyCondition: true, occupancy: true, dealIntel: true,
          zillowData: true,
        },
      },
      tenant: { select: { id: true, config: true } },
    },
  })

  if (!call || !call.transcript || !call.property) {
    console.log(`[Deal Intel] Skipping call ${callId}: no transcript or no linked property`)
    return
  }

  const property = call.property
  const currentDealIntel = (property.dealIntel ?? {}) as DealIntel
  const batchData = ((property.zillowData as Record<string, unknown>)?.batchData ?? {}) as Record<string, unknown>

  // Fetch recent approval/edit/skip history for this tenant (AI learning)
  const recentDecisions = await db.call.findMany({
    where: { tenantId: call.tenant.id, dealIntelHistory: { not: undefined } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { dealIntelHistory: true },
  })

  const learningContext = buildLearningContext(recentDecisions)

  // Phase 6 of LLM Rewiring (Session 87): inject tenant settings (markets,
  // KPI vocab, call types). The deal-intel prompt already lists every field
  // name + wholesaling vocabulary inline, so settings is additive context
  // — helps the model resolve geographic and goal references. Best-effort:
  // if settings fetch fails, fall through with no block.
  let settingsBlock: string | undefined
  try {
    const settings = await buildSettingsContext({
      tenantId: call.tenant.id,
      userId: call.assignedTo?.id,
    })
    settingsBlock = formatSettingsForPrompt(settings, 2000)
  } catch (err) {
    logFailure(call.tenant.id, 'extract_deal_intel.settings_load_failed', `call:${callId}`, err)
  }

  try {
    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()
    const userPrompt = buildExtractionUserPrompt(
      { ...call, property: { ...property, status: effectiveStatus(property) } },
      currentDealIntel,
      batchData,
    )

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const DEAL_INTEL_MODEL = 'claude-opus-4-6'
    // Stream to avoid SDK v0.90 10-minute non-streaming preflight rejection
    const response = await anthropic.messages.stream({
      model: DEAL_INTEL_MODEL,
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      system: buildDealIntelSystemPrompt({ todayStr, learningContext, settingsBlock }),
      messages: [{ role: 'user', content: userPrompt }],
    }).finalMessage()

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text block in deal-intel response')
    const responseText = textBlock.text

    logAiCall({
      tenantId: call.tenant.id, userId: call.assignedTo?.id, type: 'deal_intel',
      pageContext: `call:${callId}`, input: userPrompt.slice(0, 3000), output: responseText.slice(0, 3000),
      tokensIn: response.usage?.input_tokens, tokensOut: response.usage?.output_tokens,
      durationMs: timer(), model: DEAL_INTEL_MODEL,
      promptVersion: DEAL_INTEL_PROMPT_VERSION,
    }).catch((err) => {
      logFailure(call.tenant.id, 'extract_deal_intel.ai_log_failed', `call:${callId}`, err)
    })

    const { proposedChanges, perCallExtractions, propertySellerExtractions } =
      parseExtractionResponse(responseText, callId)

    // Store proposed changes on the call record + the per-call promoted fields.
    // Per-call promoted fields write directly (no approval flow) — they're
    // observational reads of the transcript, not deal state the user negotiates.
    await db.call.update({
      where: { id: callId },
      data: {
        dealIntelHistory: proposedChanges as unknown as import('@prisma/client').Prisma.InputJsonValue,
        ...(perCallExtractions ?? {}),
      },
    })

    // Upsert PropertySeller deal-state for THIS (propertyId, sellerId) pair.
    // Requires a linked seller on the call; otherwise skip silently.
    if (propertySellerExtractions && call.propertyId && call.sellerId) {
      await db.propertySeller.update({
        where: { propertyId_sellerId: { propertyId: call.propertyId, sellerId: call.sellerId } },
        data: propertySellerExtractions,
      }).catch((err) => {
        console.error(`[Deal Intel] PropertySeller upsert failed for call ${callId}:`, err instanceof Error ? err.message : err)
      })
    }

    console.log(`[Deal Intel] Extracted ${proposedChanges.length} proposed changes + per-call promoted fields for call ${callId}`)
  } catch (err) {
    console.error(`[Deal Intel] Extraction failed for call ${callId}:`, err instanceof Error ? err.message : err)
  }
}

// ─── Prompt builders ────────────────────────────────────────────────────────
// System prompt extracted to lib/ai/prompts/deal-intel.ts (Phase 6, Session 87).
// User-prompt assembly stays here — it's data formatting, not prompt content.


function buildExtractionUserPrompt(
  call: {
    id: string; transcript: string | null; aiSummary: string | null
    callOutcome: string | null; callType: string | null; direction: string
    durationSeconds: number | null; contactName: string | null; calledAt: Date | string | null
    sentiment: number | null; sellerMotivation: number | null
    assignedTo: { id: string; name: string } | null
    property: {
      address: string; city: string; state: string; zip: string; status: string
      askingPrice: unknown; offerPrice: unknown; contractPrice: unknown
      propertyCondition: string | null
      occupancy: string | null
    }
  },
  currentDealIntel: DealIntel,
  batchData: Record<string, unknown>,
): string {
  const sections: string[] = []

  const callDate = call.calledAt ? new Date(call.calledAt) : new Date()
  const callDateStr = `${callDate.getFullYear()}-${String(callDate.getMonth() + 1).padStart(2, '0')}-${String(callDate.getDate()).padStart(2, '0')}`

  sections.push(`CALL DETAILS:
- Contact: ${call.contactName ?? 'Unknown'}
- Rep: ${call.assignedTo?.name ?? 'Unknown'}
- Call Date: ${callDateStr}
- Type: ${call.callType ?? 'Unknown'} | Direction: ${call.direction} | Duration: ${call.durationSeconds ?? 0}s
- Outcome: ${call.callOutcome ?? 'Unknown'}
- Call Score: ${call.sentiment !== null ? `Sentiment ${call.sentiment}` : 'N/A'}
- Summary: ${call.aiSummary ?? 'No summary'}`)

  sections.push(`PROPERTY RECORD:
- Address: ${call.property.address}, ${call.property.city}, ${call.property.state} ${call.property.zip}
- Status: ${call.property.status}
- Asking Price: ${call.property.askingPrice ?? 'Not set'}
- Offer Price: ${call.property.offerPrice ?? 'Not set'}
- Contract Price: ${call.property.contractPrice ?? 'Not set'}
- Condition: ${call.property.propertyCondition ?? 'Not set'}
- Occupancy: ${call.property.occupancy ?? 'Not set'}`)

  // Include relevant BatchData
  if (Object.keys(batchData).length > 0) {
    const relevant = ['estimatedValue', 'mortgageAmount', 'equityPercent', 'taxAssessedValue',
      'ownerName', 'ownershipLength', 'preforeclosure', 'taxDefault', 'vacant', 'zoning']
    const batchInfo = relevant
      .filter(k => batchData[k] != null)
      .map(k => `- ${k}: ${batchData[k]}`)
      .join('\n')
    if (batchInfo) sections.push(`PUBLIC RECORDS (BatchData):\n${batchInfo}`)
  }

  // Include current deal intel summary
  if (Object.keys(currentDealIntel).length > 0) {
    const summary = currentDealIntel.rollingDealSummary?.value
    if (summary) sections.push(`PREVIOUS DEAL SUMMARY:\n${summary}`)

    // List what we already know so AI doesn't re-propose same values
    const known: string[] = []
    for (const [key, val] of Object.entries(currentDealIntel)) {
      if (!val) continue
      if ('value' in (val as Record<string, unknown>)) {
        known.push(`- ${FIELD_LABELS[key] ?? key}: ${JSON.stringify((val as { value: unknown }).value)}`)
      } else if ('items' in (val as Record<string, unknown>)) {
        const items = (val as { items: unknown[] }).items
        known.push(`- ${FIELD_LABELS[key] ?? key}: ${items.length} items`)
      }
    }
    if (known.length > 0) sections.push(`CURRENTLY KNOWN DEAL INTEL:\n${known.join('\n')}`)
  }

  sections.push(`FULL TRANSCRIPT:\n${call.transcript}`)

  return sections.join('\n\n')
}

// ─── Response parser ────────────────────────────────────────────────────────

interface PerCallExtractionFields {
  callPrimaryEmotion?: string | null
  callVoiceEnergyLevel?: string | null
  callTrustStep?: string | null
  callFollowupCommitment?: string | null
  callBestOfferMentioned?: number | string | null
  callDealkillersSurfaced?: string[]
  callCompetitorsMentioned?: string[]
}

interface PropertySellerExtractionFields {
  sellerResistanceLevel?: string | null
  lastConversationSummary?: string | null
  nextFollowupDate?: Date | null
  competingOffersCount?: number
  sellerTimelineConstraint?: string | null
  estimatedDaysToDecision?: number | null
  currentObjections?: string[]
  negotiationStage?: string | null
}

interface ParsedExtraction {
  proposedChanges: ProposedDealIntelChange[]
  perCallExtractions: PerCallExtractionFields | null
  propertySellerExtractions: PropertySellerExtractionFields | null
}

function parseExtractionResponse(text: string, callId: string): ParsedExtraction {
  let clean = stripJsonFences(text)
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
      const fixed = clean.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']').replace(/[\x00-\x1f]/g, ch => ch === '\n' || ch === '\t' ? ch : ' ')
      raw = JSON.parse(fixed) as Record<string, unknown>
    } catch {
      console.error(`[Deal Intel] Failed to parse response: ${text.slice(0, 200)}`)
      return { proposedChanges: [], perCallExtractions: null, propertySellerExtractions: null }
    }
  }

  const proposedChanges = (Array.isArray(raw.proposedChanges) ? raw.proposedChanges : []) as ProposedDealIntelChange[]

  // Add rolling summary, topics, and health score as special proposed changes
  if (raw.rollingDealSummary) {
    proposedChanges.push({
      field: 'rollingDealSummary',
      label: 'Deal Summary',
      category: 'deal_status',
      currentValue: null,
      proposedValue: raw.rollingDealSummary,
      confidence: 'high',
      evidence: 'Cumulative summary from all calls',
      updateType: 'overwrite',
    })
  }
  if (Array.isArray(raw.topicsNotYetDiscussed) && raw.topicsNotYetDiscussed.length > 0) {
    proposedChanges.push({
      field: 'topicsNotYetDiscussed',
      label: 'Topics Not Yet Discussed',
      category: 'deal_status',
      currentValue: null,
      proposedValue: raw.topicsNotYetDiscussed,
      confidence: 'high',
      evidence: 'Derived from conversation coverage analysis',
      updateType: 'overwrite',
    })
  }
  if (typeof raw.dealHealthScore === 'number') {
    proposedChanges.push({
      field: 'dealHealthScore',
      label: 'Deal Health Score',
      category: 'deal_status',
      currentValue: null,
      proposedValue: raw.dealHealthScore,
      confidence: 'high',
      evidence: 'Composite score from all available data',
      updateType: 'overwrite',
    })
  }
  if (Array.isArray(raw.dealRedFlags)) {
    proposedChanges.push({
      field: 'dealRedFlags',
      label: 'Deal Red Flags',
      category: 'deal_status',
      currentValue: null,
      proposedValue: raw.dealRedFlags,
      confidence: 'high',
      evidence: 'Derived from call analysis',
      updateType: 'overwrite',
    })
  }
  if (Array.isArray(raw.dealGreenFlags)) {
    proposedChanges.push({
      field: 'dealGreenFlags',
      label: 'Deal Green Flags',
      category: 'deal_status',
      currentValue: null,
      proposedValue: raw.dealGreenFlags,
      confidence: 'high',
      evidence: 'Derived from call analysis',
      updateType: 'overwrite',
    })
  }

  // Ensure all changes have the right category from our mapping
  for (const change of proposedChanges) {
    if (!change.category && FIELD_CATEGORY[change.field]) {
      change.category = FIELD_CATEGORY[change.field]
    }
  }

  // Parse the per-call promoted fields. Guard every cast so a malformed block
  // never takes down the whole extraction — missing fields become null/omitted.
  const pce = raw.perCallExtractions as Record<string, unknown> | undefined
  const perCallExtractions: PerCallExtractionFields | null = pce && typeof pce === 'object' ? {
    callPrimaryEmotion: typeof pce.callPrimaryEmotion === 'string' ? pce.callPrimaryEmotion : null,
    callVoiceEnergyLevel: typeof pce.callVoiceEnergyLevel === 'string' ? pce.callVoiceEnergyLevel : null,
    callTrustStep: typeof pce.callTrustStep === 'string' ? pce.callTrustStep : null,
    callFollowupCommitment: typeof pce.callFollowupCommitment === 'string' ? pce.callFollowupCommitment : null,
    callBestOfferMentioned: typeof pce.callBestOfferMentioned === 'number'
      ? pce.callBestOfferMentioned
      : (typeof pce.callBestOfferMentioned === 'string' && pce.callBestOfferMentioned.trim()
          ? pce.callBestOfferMentioned
          : null),
    callDealkillersSurfaced: Array.isArray(pce.callDealkillersSurfaced)
      ? (pce.callDealkillersSurfaced as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    callCompetitorsMentioned: Array.isArray(pce.callCompetitorsMentioned)
      ? (pce.callCompetitorsMentioned as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  } : null

  // Parse the PropertySeller deal-state block. nextFollowupDate comes in as
  // YYYY-MM-DD; parse to a Date if valid, else null.
  const pse = raw.propertySellerExtractions as Record<string, unknown> | undefined
  let parsedFollowup: Date | null = null
  if (pse && typeof pse.nextFollowupDate === 'string') {
    const t = Date.parse(pse.nextFollowupDate)
    if (!Number.isNaN(t)) parsedFollowup = new Date(t)
  }
  const propertySellerExtractions: PropertySellerExtractionFields | null = pse && typeof pse === 'object' ? {
    sellerResistanceLevel: typeof pse.sellerResistanceLevel === 'string' ? pse.sellerResistanceLevel : null,
    lastConversationSummary: typeof pse.lastConversationSummary === 'string' ? pse.lastConversationSummary : null,
    nextFollowupDate: parsedFollowup,
    competingOffersCount: typeof pse.competingOffersCount === 'number' ? pse.competingOffersCount : 0,
    sellerTimelineConstraint: typeof pse.sellerTimelineConstraint === 'string' ? pse.sellerTimelineConstraint : null,
    estimatedDaysToDecision: typeof pse.estimatedDaysToDecision === 'number' ? pse.estimatedDaysToDecision : null,
    currentObjections: Array.isArray(pse.currentObjections)
      ? (pse.currentObjections as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    negotiationStage: typeof pse.negotiationStage === 'string' ? pse.negotiationStage : null,
  } : null

  return { proposedChanges, perCallExtractions, propertySellerExtractions }
}

// ─── Learning context builder ───────────────────────────────────────────────

function buildLearningContext(
  recentDecisions: Array<{ dealIntelHistory: unknown }>,
): string {
  const edits: string[] = []
  const skips: string[] = []

  for (const d of recentDecisions) {
    const history = d.dealIntelHistory as ProposedDealIntelChange[] | null
    if (!history) continue
    for (const change of history) {
      if (change.decision === 'edited' && change.editedValue !== undefined) {
        edits.push(`- ${change.label}: AI suggested "${JSON.stringify(change.proposedValue).slice(0, 80)}" → User changed to "${JSON.stringify(change.editedValue).slice(0, 80)}"`)
      }
      if (change.decision === 'skipped') {
        skips.push(`- ${change.label}: AI suggested "${JSON.stringify(change.proposedValue).slice(0, 80)}" → User skipped`)
      }
    }
  }

  if (edits.length === 0 && skips.length === 0) return ''

  let context = '\n\nLEARNING FROM PAST DECISIONS — adapt your extractions based on these patterns:'
  if (edits.length > 0) {
    context += `\n\nUser edits (match this formatting/precision):\n${edits.slice(0, 10).join('\n')}`
  }
  if (skips.length > 0) {
    context += `\n\nUser skips (avoid suggesting these unless clearly mentioned):\n${skips.slice(0, 10).join('\n')}`
  }
  return context
}
