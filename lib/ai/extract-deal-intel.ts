// lib/ai/extract-deal-intel.ts
// Extracts deal intelligence from call transcripts and proposes property updates.
// Runs after call grading. Receives current property data + existing dealIntel
// so it can UPDATE rather than replace — cumulative intelligence across all calls.

import { db } from '@/lib/db/client'
import type { DealIntel, ProposedDealIntelChange, DealIntelCategory } from '@/lib/types/deal-intel'
import { FIELD_LABELS, FIELD_CATEGORY } from '@/lib/types/deal-intel'
import { logFailure } from '@/lib/audit'
import { anthropic } from '@/config/anthropic'

export async function extractDealIntel(callId: string): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      property: {
        select: {
          id: true, address: true, city: true, state: true, zip: true,
          status: true, askingPrice: true, offerPrice: true, contractPrice: true,
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

  try {
    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()
    const userPrompt = buildExtractionUserPrompt({ ...call, property }, currentDealIntel, batchData)

    const DEAL_INTEL_MODEL = 'claude-opus-4-6'
    // Stream to avoid SDK v0.90 10-minute non-streaming preflight rejection
    const response = await anthropic.messages.stream({
      model: DEAL_INTEL_MODEL,
      max_tokens: 16000,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      system: buildExtractionSystemPrompt(learningContext),
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

function buildExtractionSystemPrompt(learningContext: string): string {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return `You are a deal intelligence extraction system for a real estate wholesaling company.

TODAY'S DATE: ${todayStr} — anchor all time-relative references to this date.

Your job: analyze a call transcript and extract EVERY data point mentioned that relates to the property, seller, deal status, or negotiation.

You are given:
1. The full call transcript
2. The current property data (what we already know)
3. The current deal intelligence (accumulated from previous calls)

YOUR TASK:
- Extract any NEW or UPDATED information from THIS call
- For single-value fields: propose an update if the new value is different or more specific
- For list/accumulated fields: propose ADDITIONS (new items to add to the existing list)
- For progress-semantic list fields (see below): propose the SHRUNK list — remove items that were addressed on this call
- Write a cumulative rolling deal summary incorporating ALL previous calls + this one
- Flag what topics STILL haven't been discussed
- ONLY propose changes for information actually mentioned in the call — do NOT fabricate or infer beyond what was said
- Include the EXACT quote from the transcript that supports each extraction

RECONCILIATION — how THIS call's info relates to prior state:
Every proposed change must include a "changeKind" field. Use it to tell the rep what kind of update this is:
  - "new"          — field was empty / unknown before; this is the first write
  - "refined"      — same direction as prior state, but more specific or quantified
                     (e.g. prior: "motivated", now: "motivation 8/10 due to foreclosure 90 days out")
  - "contradicted" — this call CONFLICTS with prior state (seller changed mind, earlier extraction
                     was wrong, or new facts invalidate old ones). In the evidence field, explicitly
                     note what changed and why. The rep needs to notice contradictions.
  - "resolved"     — this change REMOVES an item from a list because it was addressed on the call
                     (used for progress-semantic lists — see below)
When you emit a "contradicted" or "resolved" change, the evidence field should briefly explain the delta,
not just the new fact. Example:
  evidence: "Seller previously said 'no rush', now says 'actually we need to close within 30 days
             because we have a cash offer on the new house'. Timeline contradicted."

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
      "target": "<property|seller>",
      "currentValue": <what's currently stored, or null>,
      "proposedValue": <the new/updated value>,
      "confidence": "<high|medium|low>",
      "evidence": "<exact quote or close paraphrase from transcript; for contradicted/resolved, explain the delta>",
      "updateType": "<overwrite|accumulate>",
      "changeKind": "<new|refined|contradicted|resolved>"
    }
  ],
  "rollingDealSummary": "<cumulative paragraph summarizing ALL calls to date including this one>",
  "topicsNotYetDiscussed": ["<topics relevant to wholesaling that haven't come up yet>"],
  "dealHealthScore": <1-10 composite score based on all available data>,
  "dealRedFlags": ["<specific red flags>"],
  "dealGreenFlags": ["<specific green flags>"],
  "perCallExtractions": {
    "callPrimaryEmotion": "<anxious|hopeful|resigned|angry|grief|defensive|neutral>",
    "callVoiceEnergyLevel": "<high|medium|low|distressed>",
    "callTrustStep": "<distrustful|neutral|warming|trusting>",
    "callFollowupCommitment": "<the verbatim next step they agreed to, or null>",
    "callBestOfferMentioned": <highest dollar offer mentioned by any party on this call, or null>,
    "callDealkillersSurfaced": ["<structural|title|family_dispute|emotional|legal|tenant|pricing>"],
    "callCompetitorsMentioned": ["<names of other wholesalers/investors the seller mentioned>"]
  },
  "propertySellerExtractions": {
    "sellerResistanceLevel": "<eager|neutral|reluctant|hostile>",
    "lastConversationSummary": "<1-2 sentence summary of THIS call from the deal's perspective>",
    "nextFollowupDate": "<YYYY-MM-DD, or null>",
    "competingOffersCount": <number of competing offers seller is aware of, or null>,
    "sellerTimelineConstraint": "<asap|30_days|flexible|no_rush>",
    "estimatedDaysToDecision": <integer days estimated until seller decides, or null>,
    "currentObjections": ["<still-live objections on this deal, not historical>"],
    "negotiationStage": "<initial|anchored|compromising|accepted|declined>"
  }
}

The perCallExtractions and propertySellerExtractions blocks are ALWAYS required — these are observational reads of the call, not proposed changes. Use null for any value you cannot determine. Numbers must be numbers, not strings. Dates must be "YYYY-MM-DD". Do NOT propose these through proposedChanges — they write directly to typed columns for filtering.

CRITICAL EXTRACTION PRIORITIES (these are the most valuable for deal decisions):
1. costOfInaction — "What happens if they don't sell?" This is the #1 negotiating lever
2. painQuantification — Specific dollar/timeline pain: "losing $2k/month", "foreclosure in 90 days"
3. costOfInactionMonthly — Monthly cost of NOT selling (mortgage + taxes + insurance + repairs on vacant/unwanted property)
4. dealRedFlags — Anything that reduces deal probability
5. dealGreenFlags — Anything that increases deal probability
6. objectionsEncountered — Include whatWorked AND whatDidntWork for each objection

PROPOSAL TARGET — every proposedChange MUST set "target":

  - "target": "property"  — proposal writes to Property.dealIntel (JSON blob)
                            via the propose→edit→confirm UI. This is the
                            default for deal-state and property-condition fields.
  - "target": "seller"    — proposal writes directly to a typed column on
                            the linked Seller row when the rep approves.
                            Use this for cross-property person facts:
                            motivation, hardship, timeline, communication
                            style, person-level legal flags. v1.1 Wave 4
                            promotes these out of the JSON blob into typed
                            Seller columns. Only valid when this call has
                            a linked Seller (call.sellerId set in context);
                            you don't need to check that — emit the proposal
                            and the apply layer will gate.

  Rule of thumb: if the fact would still be true if THIS property sold
  tomorrow and the seller listed a different property next month, it's a
  Seller-targeted fact. If the fact only applies to this house/this deal,
  it's a Property-targeted fact.

VALID FIELD NAMES — Property-targeted (target: "property"):
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

VALID FIELD NAMES — Seller-targeted (target: "seller"):
These promote person-level facts out of the Property dealIntel blob into
typed Seller columns. Use exact field names; updateType is "overwrite"
(latest call wins) unless noted.

  Motivation & situation:
    motivationPrimary    — single string: inheritance | divorce | foreclosure | tired_landlord | relocation | health | financial | other
    motivationSecondary  — single string, same vocabulary
    situation            — free-text rolling summary of WHY they're selling
    urgencyScore         — integer 1-10
    urgencyLevel         — high | medium | low | unknown
    saleTimeline         — ASAP | 30_days | 60_days | 90_days | flexible
    hardshipType         — financial | divorce | death | relocation | tired_landlord | health | other
    emotionalState       — distressed | neutral | motivated | testing
    moveOutTimeline      — free text

  Person flags (latest-true sticks; do NOT propose flipping to false unless
  the seller explicitly retracts it on this call):
    isPreProbate, isRecentlyInherited, behindOnPayments, isTenantOccupied,
    isVacant, isListedWithAgent, isEvictionInProgress,
    willingToDoSellerFinancing, willingToDoSubjectTo

  Q5 LEGAL-DISTRESS MIRROR-WRITE (v1.1 Wave 4 — important):
    When the call mentions probate / divorce / bankruptcy, emit TWO
    proposedChanges with the SAME boolean value:
      - one with target: "property", field: "inProbate" / "inDivorce" / "inBankruptcy"
      - one with target: "seller",   field: "isProbate" / "isDivorce" / "isBankruptcy"
    Foreclosure has NO Property mirror — emit only target: "seller", field: "isForeclosure".
    Recent eviction has NO Seller mirror — emit only target: "property", field: "hasRecentEviction".
    Once true, never propose flipping to false unless the seller explicitly retracts.

  Communication & personality (only propose when 2+ separate calls support
  the same value — these are stable traits, not single-call observations):
    personalityType      — analytical | driver | expressive | amiable
    communicationStyle   — direct | indirect | data-driven | story-driven | terse | verbose
    priceSensitivity     — high | medium | low
    preferredContactMethod, preferredContactTime, bestDayToCall, bestTimeToCall, languagePreference

  Lists (additive — emit only NEW items observed on THIS call; rollup
  pass dedupes across the seller's history):
    objectionProfile     — strings or {label, whatWorked, whatDidntWork} objects
    redFlags             — short phrases
    positiveSignals      — short phrases

  Financial / asking (latest wins):
    sellerAskingPrice (Decimal), lowestAcceptablePrice (Decimal),
    amountNeededToClear (Decimal), askingReason (text)

  Notes:
    aiCoachingNotes      — text, rolling rep-facing playbook for THIS seller
    recommendedApproach  — text

DO NOT emit Seller-targeted proposals for fields that the rollup pass
computes itself — the helper at lib/v1_1/seller_rollup.ts handles these
post-grade and they should not appear in proposedChanges:
  motivationScore, likelihoodToSellScore, totalCallCount, lastContactDate,
  noAnswerStreak

If the call has no linked seller in the context, you can still emit
target: "seller" proposals — the apply layer will gate them. But prefer
target: "property" when uncertain.

IMPORTANT:
- Extract EVERYTHING mentioned. More data points = better. Don't leave value on the table.
- The rolling deal summary should read like a CRM note that gives anyone full context on the deal in 30 seconds.
- Be generous with extractions but honest with confidence levels.
- Do NOT propose a change if the exact same value is already stored.
- If a field was not discussed on this call and no change is warranted, OMIT it from proposedChanges entirely. Never emit "not discussed", "unknown", "n/a", or similar placeholder strings as a proposedValue — just leave the field out.
- For list/array fields (topics, green flags, red flags, etc.), use short clear items — each item should be a concise phrase, not a full sentence.

PROGRESS-SEMANTIC LIST FIELDS — these SHRINK as the deal progresses, they do not accumulate:
  - topicsNotYetDiscussed     — remove any topic that was addressed on this call
  - stickingPoints            — remove any that were resolved or removed by the seller
  - disqualificationRisks     — remove any that were mitigated / no longer in play
  - dealRedFlags              — remove any flag that was resolved (but KEEP flags that still apply)
When any of these are emitted:
  - updateType MUST be "overwrite" (not "accumulate")
  - proposedValue MUST be ONLY the still-outstanding items, not a cumulative list
  - changeKind: "refined" if items were removed since last call; "new" if the list is being written for the first time; "contradicted" if the seller reopened a previously-resolved item
  - The evidence field should briefly note WHICH items were removed/closed out this call so the rep sees the delta. Example:
      prior stickingPoints = ["asking price", "title cloud", "tenant eviction"]
      this call resolved title cloud →
        proposedValue: ["asking price", "tenant eviction"]
        updateType: "overwrite"
        changeKind: "refined"
        evidence: "Title cloud resolved — seller confirmed title work cleared Tuesday. Asking price and tenant eviction still open."

HISTORICAL LIST FIELDS — these NEVER shrink, they are permanent record:
  - objectionsEncountered, commitmentsWeMade, promisesTheyMade, promiseDeadlines
  - exactTriggerPhrases, toneShiftMoments, questionsSellerAskedUs, infoVolunteeredVsExtracted
  - sellerAskingHistory, counterOffers, offersWeHaveMade, competingOffers
  - walkthroughRepairList, titleIssuesMentioned, liensMentioned, legalComplications
  - whatNotToSay, triggerEvents
These use updateType="accumulate" — only propose NEW items to append.

TIME-RELATIVE FIELDS (sellerTimeline, sellerTimelineUrgency, promiseDeadlines, nextStepAgreed, triggerEvents, commitmentsWeMade, promisesTheyMade):
For these fields the proposedValue MUST be a structured object that resolves the relative phrase to absolute dates so downstream LLMs can correlate timing with revenue. Use this exact shape:
  {
    "label": "<the seller's verbatim phrasing, e.g. '3-6 months', 'ASAP', 'after tax season'>",
    "window": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "humanLabel": "<a short human description of the window, e.g. 'late summer 2026', 'by May 6, 2026', 'Q4 2026'>"
  }
Use the Call Date provided plus TODAY'S DATE anchor to compute the window. Examples (assuming today = 2026-04-22):
  - Seller says "3-6 months" → { label: "3-6 months", window: { start: "2026-07-22", end: "2026-10-22" }, humanLabel: "Jul–Oct 2026" }
  - Seller says "ASAP" → { label: "ASAP", window: { start: "2026-04-22", end: "2026-05-06" }, humanLabel: "by May 6, 2026" }
  - Seller says "end of year" → { label: "end of year", window: { start: "2026-10-01", end: "2026-12-31" }, humanLabel: "Q4 2026" }
For list-typed time fields (promiseDeadlines, triggerEvents, etc.) each array item should follow the same pattern — include the structured timing inside the item object alongside whatever other fields that item has (e.g. promiseDeadlines item: { what, label, window, humanLabel }).
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

// ─── Utilities ─────────────────────────────────────────────────────────────

function stripJsonFences(text: string): string {
  return text
    .replace(/^\s*```\s*json?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim()
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
