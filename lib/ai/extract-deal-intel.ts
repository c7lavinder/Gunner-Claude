// lib/ai/extract-deal-intel.ts
// Extracts deal intelligence from call transcripts and proposes property updates.
// Runs after call grading. Receives current property data + existing dealIntel
// so it can UPDATE rather than replace — cumulative intelligence across all calls.

import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db/client'
import type { DealIntel, ProposedDealIntelChange, DealIntelCategory } from '@/lib/types/deal-intel'
import { FIELD_LABELS, FIELD_CATEGORY } from '@/lib/types/deal-intel'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function extractDealIntel(callId: string): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
    select: {
      id: true, transcript: true, aiSummary: true, callOutcome: true, callType: true,
      durationSeconds: true, direction: true, calledAt: true, score: true,
      sentiment: true, sellerMotivation: true, contactName: true,
      assignedTo: { select: { id: true, name: true } },
      property: {
        select: {
          id: true, address: true, city: true, state: true, zip: true,
          status: true, askingPrice: true, offerPrice: true, contractPrice: true,
          sellerMotivation: true, sellerTimeline: true, propertyCondition: true,
          sellerAskingReason: true, occupancy: true, dealIntel: true,
          sellerMotivationLevel: true, timelineUrgency: true, decisionMakersConfirmed: true,
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

  try {
    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()
    const userPrompt = buildExtractionUserPrompt({ ...call, property }, currentDealIntel, batchData)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      system: buildExtractionSystemPrompt(learningContext),
      messages: [{ role: 'user', content: userPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    logAiCall({
      tenantId: call.tenant.id, userId: call.assignedTo?.id, type: 'deal_intel',
      pageContext: `call:${callId}`, input: userPrompt.slice(0, 3000), output: content.text.slice(0, 3000),
      tokensIn: response.usage?.input_tokens, tokensOut: response.usage?.output_tokens,
      durationMs: timer(), model: 'claude-sonnet-4-20250514',
    }).catch(() => {})

    const proposedChanges = parseExtractionResponse(content.text, callId)

    // Store proposed changes on the call record
    await db.call.update({
      where: { id: callId },
      data: { dealIntelHistory: proposedChanges as unknown as import('@prisma/client').Prisma.InputJsonValue },
    })

    console.log(`[Deal Intel] Extracted ${proposedChanges.length} proposed changes for call ${callId}`)
  } catch (err) {
    console.error(`[Deal Intel] Extraction failed for call ${callId}:`, err instanceof Error ? err.message : err)
  }
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildExtractionSystemPrompt(learningContext: string): string {
  return `You are a deal intelligence extraction system for a real estate wholesaling company.

Your job: analyze a call transcript and extract EVERY data point mentioned that relates to the property, seller, deal status, or negotiation.

You are given:
1. The full call transcript
2. The current property data (what we already know)
3. The current deal intelligence (accumulated from previous calls)

YOUR TASK:
- Extract any NEW or UPDATED information from THIS call
- For single-value fields: propose an update if the new value is different or more specific
- For list/accumulated fields: propose ADDITIONS (new items to add to the existing list)
- Write a cumulative rolling deal summary incorporating ALL previous calls + this one
- Flag what topics STILL haven't been discussed
- ONLY propose changes for information actually mentioned in the call — do NOT fabricate or infer beyond what was said
- Include the EXACT quote from the transcript that supports each extraction

CONFIDENCE LEVELS:
- high: seller stated it directly ("I owe $120,000 on the mortgage")
- medium: strongly implied or partially stated ("we've been here since the kids were born" → long ownership)
- low: inferred from context ("seller seems emotional" → not directly stated)

RESPONSE FORMAT — valid JSON only, no markdown:
{
  "proposedChanges": [
    {
      "field": "<exact field name from the schema>",
      "label": "<human-readable label>",
      "category": "<seller_profile|decision_making|price_negotiation|property_condition|legal_title|communication_intel|deal_status|marketing>",
      "currentValue": <what's currently stored, or null>,
      "proposedValue": <the new/updated value>,
      "confidence": "<high|medium|low>",
      "evidence": "<exact quote or close paraphrase from transcript>",
      "updateType": "<overwrite|accumulate>"
    }
  ],
  "rollingDealSummary": "<cumulative paragraph summarizing ALL calls to date including this one>",
  "topicsNotYetDiscussed": ["<topics relevant to wholesaling that haven't come up yet>"],
  "dealHealthScore": <1-10 composite score based on all available data>,
  "dealRedFlags": ["<specific red flags>"],
  "dealGreenFlags": ["<specific green flags>"]
}

CRITICAL EXTRACTION PRIORITIES (these are the most valuable for deal decisions):
1. costOfInaction — "What happens if they don't sell?" This is the #1 negotiating lever
2. painQuantification — Specific dollar/timeline pain: "losing $2k/month", "foreclosure in 90 days"
3. costOfInactionMonthly — Monthly cost of NOT selling (mortgage + taxes + insurance + repairs on vacant/unwanted property)
4. dealRedFlags — Anything that reduces deal probability
5. dealGreenFlags — Anything that increases deal probability
6. objectionsEncountered — Include whatWorked AND whatDidntWork for each objection

VALID FIELD NAMES (use these exact strings):
sellerMotivationLevel, sellerMotivationReason, statedVsImpliedMotivation, sellerWhySelling,
sellerTimeline, sellerTimelineUrgency, sellerKnowledgeLevel, sellerCommunicationStyle,
sellerContactPreference, sellerPersonalityProfile, sellerEmotionalTriggers, sellerFamilySituation,
sellerPreviousInvestorContact, sellerAlternativePlan,
costOfInaction, costOfInactionMonthly, painQuantification,
decisionMakers (include hasVetoPower, presentOnCalls, separateMotivation), decisionMakersConfirmed, decisionMakerNotes, documentReadiness,
sellerAskingHistory, offersWeHaveMade, competingOffers (include terms), priceAnchors, stickingPoints,
counterOffers (include from: us|seller|buyer, termsChanged, whyRejected),
conditionNotesFromSeller, repairItemsMentioned, accessSituation, gateCodeAccessNotes,
tenantSituation (include leaseEnd, rentAmount, cooperative, moveOutCost, evictionRisk), utilityStatus,
environmentalConcerns, unpermittedWork, permitHistoryFromSeller,
insuranceSituation, neighborhoodComplaints, previousDealFellThrough,
walkthroughNotes, walkthroughRepairList (include severity: minor|moderate|major, estimatedCost),
walkthroughConditionVsSeller, walkthroughPhotosNotes,
titleIssuesMentioned, legalComplications, liensMentioned, backTaxesMentioned, hoaMentioned, mortgageBalanceMentioned,
whatNotToSay, toneShiftMoments, exactTriggerPhrases, questionsSellerAskedUs,
infoVolunteeredVsExtracted, silencePausePatterns, appointmentLogisticsPreferences, bestApproachNotes,
commitmentsWeMade, promisesTheyMade, promiseDeadlines, nextStepAgreed, triggerEvents,
objectionsEncountered (include whatWorked, whatDidntWork, effectivenessRating: resolved|partially|unresolved),
relationshipRapportLevel, bestRepForThisSeller,
dealRedFlags, dealGreenFlags, dealHealthTrajectory (improving|stable|declining), dealRiskLevel (low|medium|high),
howTheyFoundUs, referralSource, referralChain, firstMarketingPieceReceived, whichMarketingMessageResonated,
leadGrade (A|B|C|D|F — composite based on motivation + timeline + equity + responsiveness + deal viability),
leadQualityScore (1-100 composite), sellerResponsiveness (highly_responsive|responsive|slow|ghosting|unknown),
financialDistressLevel (none|mild|moderate|severe|foreclosure_imminent), financialDistressDetails,
disqualificationRisks, isDisqualified (true only if deal is clearly dead), disqualificationReason,
qualificationCallCompleted (boolean), qualificationOutcome (qualified|nurture|disqualified|no_contact)

IMPORTANT:
- Extract EVERYTHING mentioned. More data points = better. Don't leave value on the table.
- The rolling deal summary should read like a CRM note that gives anyone full context on the deal in 30 seconds.
- Be generous with extractions but honest with confidence levels.
- Do NOT propose a change if the exact same value is already stored.
- For any deadline or time-relative field (promiseDeadlines, sellerTimeline, nextStepAgreed), ALWAYS include the actual date, not just "same day" or "tomorrow". Use the Call Date provided to calculate absolute dates.
- For list/array fields (topics, green flags, red flags, etc.), use short clear items — each item should be a concise phrase, not a full sentence.
${learningContext}`
}

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
      sellerMotivation: string | null; sellerTimeline: string | null
      propertyCondition: string | null; sellerAskingReason: string | null
      occupancy: string | null; sellerMotivationLevel: number | null
      timelineUrgency: string | null; decisionMakersConfirmed: boolean | null
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
- Seller Motivation (text): ${call.property.sellerMotivation ?? 'Not set'}
- Seller Motivation Level: ${call.property.sellerMotivationLevel ?? 'Not set'}
- Timeline: ${call.property.sellerTimeline ?? 'Not set'} (Urgency: ${call.property.timelineUrgency ?? 'Not set'})
- Condition: ${call.property.propertyCondition ?? 'Not set'}
- Occupancy: ${call.property.occupancy ?? 'Not set'}
- Decision Makers Confirmed: ${call.property.decisionMakersConfirmed ?? 'Not set'}`)

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

function parseExtractionResponse(text: string, callId: string): ProposedDealIntelChange[] {
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
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
      return []
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

  return proposedChanges
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
