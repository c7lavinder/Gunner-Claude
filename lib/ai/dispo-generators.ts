// lib/ai/dispo-generators.ts
// Three generators powering Section 2 of the Disposition Journey:
//
//   1. description   — 2-4 sentence opener for the deal blast
//   2. listing       — full structured property-listing-site post
//   3. social        — under-180-word FB Marketplace / social post
//
// Prompts are locked verbatim from the owner's spec (Session 77). All
// three share a tone profile: no hype words ("steal", "gem", "massive",
// "explosive", "insane"), no emojis, professional, trustworthy. Each
// closes with the assigned Disposition Manager's name + GHL phone as
// the call to action.
//
// Persistence: artifacts land in Property.dispoArtifacts (JSON):
//   { description, listingPost, socialPost,
//     generatedAt: { description, listingPost, socialPost } }
//
// The rep can edit the text in-place via the Section 2 UI; edits flow
// through the same column (no separate "edited" copy). Re-generate
// overwrites whatever's there.

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { anthropic } from '@/config/anthropic'
import { logFailure } from '@/lib/audit'
import { isDispoManagerRole } from '@/lib/disposition/property-details-readiness'

const DISPO_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1500

export type DispoArtifactKind = 'description' | 'listing' | 'social'

export const BUYER_TIERS = ['priority', 'qualified', 'jv', 'unqualified', 'realtor'] as const
export type BuyerTier = typeof BUYER_TIERS[number]

export interface TierMessage {
  emailSubject: string
  emailBody: string
  smsBody: string
}

export type TierMessages = Partial<Record<BuyerTier, TierMessage>>

export interface GenerateDispoResult {
  status: 'success' | 'error'
  text?: string
  reason?: string
}

export interface GenerateTiersResult {
  status: 'success' | 'error'
  tiers?: TierMessages
  reason?: string
}

interface DispoContext {
  // Property facts the prompts pull from. Minimal projection — we don't
  // load the full Property here because we only need 30-ish fields.
  address: string
  city: string | null
  state: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: string | null
  propertyType: string | null
  propertyCondition: string | null
  arv: string | null            // investor-visible (Property.arv or override)
  askingPrice: string | null    // investor-facing — Property.dispoAskingPrice
  contractPrice: string | null
  assignmentFee: string | null
  description: string | null    // existing description (if rep wrote one)
  neighborhoodSummary: string | null
  repairEstimate: string | null
  rentalEstimate: string | null
  // Session 78 — which offer type the rep is leading the blast with.
  // Drives the description voice (Cash buyers care about repair cost +
  // close speed; Sub-to / Novation buyers care about terms + monthly
  // payment + spread; etc.). Read from dispoArtifacts.primaryOfferType.
  primaryOfferType: string
  // ── Session 80 — vendor-derived investor finance context ────────────
  // All optional. Only populated when PropertyRadar / BatchData enrichment
  // returned the field. Prompts MUST NOT invent these — if a value is null
  // here, it doesn't go into the prompt at all.
  mortgageBalance: string | null    // openMortgageBalance from PR — what the seller still owes
  mortgageRate: string | null       // PR LoanInterestRate — for sub-to math
  mortgagePayment: string | null    // PR estimatedMortgagePayment — monthly principal+interest
  equityPercent: string | null      // PR available equity %
  availableEquity: string | null    // PR availableEquity dollars
  underwater: boolean | null
  // MLS activity — sub-to / novation / retail-buyer context
  mlsStatus: string | null
  mlsListingPrice: string | null
  mlsDaysOnMarket: number | null
  // Distress flags — surface only the ones that are TRUE so we don't echo
  // false negatives. Empty array means no known distress signals.
  distressSignals: string[]
  // Tax + HOA
  annualTax: string | null
  taxDelinquentAmount: string | null
  hoaDues: string | null            // monthly
  // Last sale — comp anchoring
  lastSalePrice: string | null
  lastSaleDate: string | null       // ISO YYYY-MM-DD
  // Suggested rent (HUD FMR) — for rental-spread pitches when no rep estimate
  suggestedRent: string | null
  // ── End vendor-derived ────────────────────────────────────────────────
  // Comps (from PropertyComp table) — used by ALL prompts now (Session 80).
  // Description + social + listing all consider comps when relevant.
  comps: Array<{
    address: string
    price: string | null
    status: string | null
    condition: string | null
    beds: number | null
    baths: number | null
    sqft: number | null
  }>
  // Pros / cons inferred from condition + intangibles
  pros: string[]
  workNeeded: string[]
  // Closing block facts
  fundingLink: string
  dispoManagerName: string
  dispoManagerPhone: string | null
}

export async function generateDispoArtifact(
  propertyId: string,
  tenantId: string,
  kind: DispoArtifactKind,
  generatedByUserId: string,
): Promise<GenerateDispoResult> {
  const ctx = await loadContext(propertyId, tenantId)
  if (!ctx) return { status: 'error', reason: 'property not found or context unavailable' }
  if (!ctx.dispoManagerName) {
    return { status: 'error', reason: 'no Disposition Manager assigned — see Section 1 readiness' }
  }

  const userPrompt = buildPrompt(kind, ctx)
  const systemPrompt = systemPromptFor(kind)

  try {
    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()

    const response = await anthropic.messages.create({
      model: DISPO_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    if (!text) return { status: 'error', reason: 'empty response from model' }

    logAiCall({
      tenantId,
      type: `dispo_${kind}`,
      pageContext: `property:${propertyId}`,
      input: userPrompt.slice(0, 3000),
      output: text.slice(0, 3000),
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      durationMs: timer(),
      model: DISPO_MODEL,
    }).catch(err => {
      logFailure(tenantId, `dispo_${kind}.ai_log_failed`, `property:${propertyId}`, err).catch(() => {})
    })

    // Persist into dispoArtifacts JSON, preserving the other artifacts.
    const property = await db.property.findUnique({
      where: { id: propertyId, tenantId },
      select: { dispoArtifacts: true },
    })
    const current = (property?.dispoArtifacts ?? {}) as Record<string, unknown>
    const generatedAt = (current.generatedAt ?? {}) as Record<string, string>
    const generatedBy = (current.generatedBy ?? {}) as Record<string, string>

    const fieldKey = kind === 'description' ? 'description'
                    : kind === 'listing' ? 'listingPost'
                    : 'socialPost'

    const updatedArtifacts = {
      ...current,
      [fieldKey]: text,
      generatedAt: { ...generatedAt, [fieldKey]: new Date().toISOString() },
      generatedBy: { ...generatedBy, [fieldKey]: generatedByUserId },
    }
    await db.property.update({
      where: { id: propertyId, tenantId },
      data: {
        // Round-trip through JSON to drop any `unknown` types Prisma's
        // strict InputJsonValue won't accept directly.
        dispoArtifacts: JSON.parse(JSON.stringify(updatedArtifacts)) as Prisma.InputJsonValue,
      },
    })

    return { status: 'success', text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Dispo Generator] ${kind} failed for ${propertyId}:`, msg)
    await logFailure(tenantId, `dispo_${kind}.generate_failed`, `property:${propertyId}`, err).catch(() => {})
    return { status: 'error', reason: msg }
  }
}

// ─── Per-tier messages (Session 77 round 2) ─────────────────────────
// Generates 5 tier-specific email + SMS pairs in ONE AI call. Persists
// under dispoArtifacts.tierMessages. Used by the Section-3 SendModal's
// "auto-tier" mode where each recipient gets the message tailored to
// their buyer.tier.

export async function generateTierMessages(
  propertyId: string,
  tenantId: string,
  generatedByUserId: string,
): Promise<GenerateTiersResult> {
  const ctx = await loadContext(propertyId, tenantId)
  if (!ctx) return { status: 'error', reason: 'property not found or context unavailable' }
  if (!ctx.dispoManagerName) {
    return { status: 'error', reason: 'no Disposition Manager assigned — see Section 1 readiness' }
  }

  const userPrompt = buildPrompt('listing', ctx)  // re-use the structured fact dump
    + `\n\nGenerate one (email_subject, email_body, sms_body) trio for each of these 5 buyer tiers. Each tier sees the SAME facts above, but the message MUST highlight what that buyer actually cares about. Use only facts from above — never invent finance, distress, or rental numbers.

PRIORITY (top proven cash buyers, first access):
  Tone: brief, urgent, exclusive. They've seen lots of deals — get to the point.
  Lead with: deal math. The spread between asking and ARV. Repair estimate. Net cash-on-cash math is what they want.
  Skip generic neighborhood praise. Anchor every claim in a number from the facts.

QUALIFIED (verified proof of funds, ready to close):
  Tone: professional, factual, deal-focused.
  Lead with: same math as priority, plus close timeline / contract terms. More room to lay out the math step by step.
  If MLS / distress signals are in the facts, mention the most relevant one.

JV (co-investment partners):
  Tone: collaborative, terms-forward, partner-oriented.
  Lead with: hold strategy + rental spread (rental estimate vs PITI if mortgage payment is in facts). Talk about split / capital required only if the rep set those.
  If suggested rent or rep-set rental estimate is in facts, compare to mortgage payment and call out the cashflow.
  If sub-to / novation finance terms are in the facts (existing mortgage balance / rate / payment), highlight as a long-hold opportunity.

UNQUALIFIED (newer / unverified buyers):
  Tone: warm, plain-English, low-commitment.
  Lead with: 1-2 highlights + one concrete number. End with "happy to share full numbers" rather than dumping everything.
  Do not include distress signals here.

REALTOR (agents who'd list or refer):
  Tone: collegial. Highlight the spread between asking and likely retail (ARV) — that's their commission room.
  If MLS data is in the facts, reference it. Mention novation / co-list option only if primary offer type is Novation.
  Never reference our assignment fee directly to a realtor.

Return ONLY valid JSON in this exact shape:
{
  "priority":    { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "qualified":   { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "jv":          { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "unqualified": { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "realtor":     { "email_subject": "...", "email_body": "...", "sms_body": "..." }
}

Per-message rules:
- email_body: 3-5 sentences, plain English. Close with the dispo manager's name + phone.
- sms_body: 1-2 sentences, under 320 characters. Close with name + phone. No links.
- email_subject: short, factual, no clickbait. Reference the city + bed/bath or address number when it fits.
- No hype words ("steal", "gem", "massive", "explosive", "insane").
- No emojis.
- No invented numbers, ranges, or percentages — only what's in the facts above.
- No internal codes or enum names.`

  const systemPrompt = `You are generating per-tier outreach messages for a wholesale real estate deal blast. Output ONLY a JSON object — no commentary, no markdown fences, no surrounding text. The JSON must parse with JSON.parse on first try. Plain English only. Never invent numbers or facts that aren't in the property facts.`

  try {
    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()

    const response = await anthropic.messages.create({
      model: DISPO_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    if (!raw) return { status: 'error', reason: 'empty response from model' }

    // Tolerant JSON extraction — strip markdown fences if model adds them.
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    const jsonText = jsonStart >= 0 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw

    let parsed: Record<string, { email_subject: string; email_body: string; sms_body: string }>
    try {
      parsed = JSON.parse(jsonText)
    } catch (err) {
      return { status: 'error', reason: `failed to parse model JSON: ${err instanceof Error ? err.message : String(err)}` }
    }

    const tiers: TierMessages = {}
    for (const tier of BUYER_TIERS) {
      const t = parsed[tier]
      if (!t) continue
      tiers[tier] = {
        emailSubject: t.email_subject ?? '',
        emailBody: t.email_body ?? '',
        smsBody: t.sms_body ?? '',
      }
    }

    logAiCall({
      tenantId,
      type: 'blast_gen',
      pageContext: `property:${propertyId}`,
      input: userPrompt.slice(0, 3000),
      output: raw.slice(0, 3000),
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      durationMs: timer(),
      model: DISPO_MODEL,
    }).catch(err => {
      logFailure(tenantId, `dispo_tiers.ai_log_failed`, `property:${propertyId}`, err).catch(() => {})
    })

    // Persist into dispoArtifacts.tierMessages
    const property = await db.property.findUnique({
      where: { id: propertyId, tenantId },
      select: { dispoArtifacts: true },
    })
    const current = (property?.dispoArtifacts ?? {}) as Record<string, unknown>
    const generatedAt = (current.generatedAt ?? {}) as Record<string, string>
    const generatedBy = (current.generatedBy ?? {}) as Record<string, string>
    const updatedArtifacts = {
      ...current,
      tierMessages: tiers,
      generatedAt: { ...generatedAt, tierMessages: new Date().toISOString() },
      generatedBy: { ...generatedBy, tierMessages: generatedByUserId },
    }
    await db.property.update({
      where: { id: propertyId, tenantId },
      data: {
        dispoArtifacts: JSON.parse(JSON.stringify(updatedArtifacts)) as Prisma.InputJsonValue,
      },
    })

    return { status: 'success', tiers }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Dispo Generator] tiers failed for ${propertyId}:`, msg)
    await logFailure(tenantId, `dispo_tiers.generate_failed`, `property:${propertyId}`, err).catch(() => {})
    return { status: 'error', reason: msg }
  }
}

// ─── Context loader ──────────────────────────────────────────────────

async function loadContext(propertyId: string, tenantId: string): Promise<DispoContext | null> {
  const property = await db.property.findUnique({
    where: { id: propertyId, tenantId },
    select: {
      address: true, city: true, state: true,
      beds: true, baths: true, sqft: true, yearBuilt: true, lotSize: true,
      propertyType: true, propertyCondition: true,
      // Fallbacks when the rep hasn't set propertyCondition — PR's
      // ImprovementCondition / BuildingQuality describe the same thing.
      improvementCondition: true, buildingQuality: true,
      arv: true, dispoAskingPrice: true, contractPrice: true, assignmentFee: true,
      dealBlastArvOverride: true,
      description: true, neighborhoodSummary: true,
      // constructionEstimate is the rep-set value in the Property Details
      // panel ("Construction" row). It takes precedence over the AI-derived
      // repairEstimate so the artifact prompt always uses what the rep
      // sees on the panel.
      constructionEstimate: true,
      repairEstimate: true, rentalEstimate: true,
      // Session 78 — primary offer type lives in dispoArtifacts JSON.
      dispoArtifacts: true,
      // Intangibles → infer pros + work-needed for the prompts
      comparableRisk: true, basementStatus: true, curbAppeal: true,
      neighborsGrade: true, parkingType: true, yardGrade: true,
      roofCondition: true, windowsCondition: true, sidingCondition: true,
      exteriorCondition: true,
      locationGrade: true,
      // ── Session 80 — vendor-derived investor finance + distress ──────
      openMortgageBalance: true, mortgageRate: true, estimatedMortgagePayment: true,
      equityPercent: true, availableEquity: true, underwater: true,
      mlsStatus: true, mlsListingPrice: true, mlsDaysOnMarket: true,
      mlsActive: true, mlsPending: true, mlsSold: true,
      preForeclosure: true, bankOwned: true, inBankruptcy: true, inProbate: true,
      inDivorce: true, hasRecentEviction: true, taxDelinquent: true,
      annualTax: true, taxDelinquentAmount: true, hoaDues: true,
      lastSalePrice: true, dataLastUpdated: true,
      suggestedRent: true, deedDate: true,
      // PropertyComp rows — used by ALL prompts now (description / listing / social).
      comps: {
        orderBy: { sortOrder: 'asc' },
        select: {
          address: true, price: true, status: true, condition: true,
          beds: true, baths: true, sqft: true,
        },
      },
      // Tenant funding link
      tenant: { select: { dispositionFundingLink: true } },
      // Property team — load all members; we filter for the Dispo Manager
      // role in JS via isDispoManagerRole() because the role string can
      // be 'DISPOSITION_MANAGER' OR 'Disposition Manager' depending on
      // which UI saved it (legacy + current).
      teamMembers: {
        include: { user: { select: { name: true, phone: true } } },
      },
    },
  })

  if (!property) return null

  const dispoManagerMember = property.teamMembers.find(tm => isDispoManagerRole(tm.role))
  const dispoManager = dispoManagerMember?.user
  const arv = (property.dealBlastArvOverride ?? property.arv)?.toString() ?? null

  // Build distress signals list — only TRUE flags, in plain English. We never
  // emit negatives ("not in foreclosure") because the prompt can't safely
  // disclaim what isn't in the data.
  const distress: string[] = []
  if (property.preForeclosure) distress.push('In pre-foreclosure')
  if (property.bankOwned) distress.push('Bank owned (REO)')
  if (property.inBankruptcy) distress.push('Owner in bankruptcy')
  if (property.inProbate) distress.push('Property in probate')
  if (property.inDivorce) distress.push('Owner in divorce')
  if (property.hasRecentEviction) distress.push('Recent eviction filed')
  if (property.taxDelinquent) distress.push('Property taxes delinquent')

  // Resolve MLS status to a single plain-English label (the boolean flags
  // duplicate the string column for filtering — pick the freshest signal).
  const mlsLabel = property.mlsActive ? 'Active on MLS'
    : property.mlsPending ? 'Pending on MLS'
    : property.mlsSold ? 'Sold on MLS'
    : property.mlsStatus ?? null

  return {
    address: property.address,
    city: property.city,
    state: property.state,
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
    yearBuilt: property.yearBuilt,
    lotSize: property.lotSize,
    propertyType: property.propertyType,
    propertyCondition: property.propertyCondition ?? property.improvementCondition ?? property.buildingQuality ?? null,
    arv,
    askingPrice: property.dispoAskingPrice?.toString() ?? null,
    contractPrice: property.contractPrice?.toString() ?? null,
    assignmentFee: property.assignmentFee?.toString() ?? null,
    description: property.description,
    neighborhoodSummary: property.neighborhoodSummary,
    // Panel's Construction Estimate wins over the AI-derived repair number.
    repairEstimate: property.constructionEstimate?.toString() ?? property.repairEstimate?.toString() ?? null,
    rentalEstimate: property.rentalEstimate?.toString() ?? null,
    // Session 80 — vendor-derived finance/MLS/distress
    mortgageBalance: property.openMortgageBalance?.toString() ?? null,
    mortgageRate: property.mortgageRate?.toString() ?? null,
    mortgagePayment: property.estimatedMortgagePayment?.toString() ?? null,
    equityPercent: property.equityPercent?.toString() ?? null,
    availableEquity: property.availableEquity?.toString() ?? null,
    underwater: property.underwater,
    mlsStatus: mlsLabel,
    mlsListingPrice: property.mlsListingPrice?.toString() ?? null,
    mlsDaysOnMarket: property.mlsDaysOnMarket,
    distressSignals: distress,
    annualTax: property.annualTax?.toString() ?? null,
    taxDelinquentAmount: property.taxDelinquentAmount?.toString() ?? null,
    hoaDues: property.hoaDues?.toString() ?? null,
    lastSalePrice: property.lastSalePrice?.toString() ?? null,
    lastSaleDate: property.deedDate ? property.deedDate.toISOString().slice(0, 10) : null,
    suggestedRent: property.suggestedRent?.toString() ?? null,
    comps: property.comps.map(c => ({
      address: c.address,
      price: c.price?.toString() ?? null,
      status: c.status,
      condition: c.condition,
      beds: c.beds,
      baths: c.baths,
      sqft: c.sqft,
    })),
    pros: inferPros(property),
    workNeeded: inferWorkNeeded(property),
    fundingLink: property.tenant.dispositionFundingLink ?? 'https://franchise.newagainhouses.com/',
    dispoManagerName: dispoManager?.name ?? '',
    dispoManagerPhone: dispoManager?.phone ?? null,
    primaryOfferType:
      ((property.dispoArtifacts ?? {}) as { primaryOfferType?: string }).primaryOfferType
      ?? 'Cash',
  }
}

// ─── Pros / work-needed inference from intangibles ──────────────────

interface InferenceSnapshot {
  curbAppeal: string | null
  basementStatus: string | null
  neighborsGrade: string | null
  parkingType: string | null
  yardGrade: string | null
  comparableRisk: string | null
  roofCondition: string | null
  windowsCondition: string | null
  sidingCondition: string | null
  exteriorCondition: string | null
  locationGrade: string | null
}

function inferPros(p: InferenceSnapshot): string[] {
  // Plus/Neutral/Negative dropdowns — "Plus" rolls up to pros.
  // Numeric grades 4-5 also count as a pro.
  const out: string[] = []
  if (p.curbAppeal === 'Plus') out.push('Strong curb appeal')
  if (p.basementStatus === 'Plus') out.push('Solid basement')
  if (p.neighborsGrade === 'Plus') out.push('Good neighbors')
  if (p.parkingType === 'Plus') out.push('Good parking')
  if (p.yardGrade === 'Plus') out.push('Good yard')
  if (p.comparableRisk === 'Plus') out.push('Strong comps in area')
  const grade = p.locationGrade ? Number(p.locationGrade) : null
  if (grade != null && grade >= 4) out.push('Strong location')
  return out
}

function inferWorkNeeded(p: InferenceSnapshot): string[] {
  const out: string[] = []
  if (p.roofCondition && /needs|replac|bad|poor|fail/i.test(p.roofCondition)) out.push('Roof work')
  if (p.windowsCondition && /needs|replac|bad|poor/i.test(p.windowsCondition)) out.push('Windows')
  if (p.sidingCondition && /needs|replac|bad|poor/i.test(p.sidingCondition)) out.push('Siding')
  if (p.exteriorCondition && /needs|replac|bad|poor/i.test(p.exteriorCondition)) out.push('Exterior repairs')
  return out
}

// ─── Prompt builders ────────────────────────────────────────────────

function systemPromptFor(kind: DispoArtifactKind): string {
  // Shared tone + truthfulness rules carved out so all 3 generators share
  // the same floor. Specific format is in the user prompt.
  const shared = `TONE RULES (apply to all output):
- Professional, factual, trustworthy. Investor audience.
- Plain English only. Simple, direct. No fluff.
- Do NOT use hype words: "steal", "gem", "massive", "explosive", "insane", "amazing", "incredible", "unbelievable".
- Do NOT use emojis.
- Always close with the assigned Disposition Manager's name + phone number as the call to action.

STRICT FACT RULE — most important rule, read carefully:
- Use ONLY facts present in the property facts above. Every dollar amount, percentage, date, condition note, or distress flag must come from the structured input.
- Do NOT estimate, infer, guess, round, or invent any number. If repair estimate is missing, say "repair scope to be confirmed" — do NOT make one up.
- Do NOT add filler claims like "great rental area", "rates around 6.5%", "should rent for $1,800+" unless those exact values appear in the facts.
- Do NOT mention distress (foreclosure, probate, bankruptcy, liens, eviction, tax delinquency) UNLESS it's listed under "Distress signals" in the facts.
- If a section has no data, leave it out silently.
- Plain English: never use internal codes or enum names ("DISPO_NEW", "preForeclosure", "ownerOccupied=false"). Translate to natural language.`

  if (kind === 'description') {
    return `${shared}

OUTPUT: A short, clean opening paragraph (2-4 sentences) for a property listing.
- Target: real estate investors.
- Create mild curiosity. Clearly state the opportunity in concrete terms (the actual numbers from the facts).
- Mention the most important positives + the main work needed (only if listed in the facts).
- If finance / distress signals are in the facts and relevant to the primary offer type, weave them in.
- End with: "Contact [Dispo Manager Name] at [phone] for details."
- Output ONLY the paragraph. No headers, no extra commentary.`
  }

  if (kind === 'listing') {
    return `${shared}

OUTPUT: A property listing post in this EXACT structure:

[Opening paragraph - 2-4 sentences, professional and factual, with concrete numbers from the facts]

## Property Details
- Beds/Baths: X / X
- Sqft: XXX
- Year built: XXXX
- Condition: [short description from facts]
- ARV: $XXX,XXX
- Asking: $XXX,XXX
- Repair estimate: $XXX,XXX  (omit this line if no estimate in facts)
- Location: [City], [State]
- Pros: [bullets — only items in the facts]
- Work needed: [bullets — only items in the facts]

## Finance & Status  (omit this section entirely if NONE of the lines below have data)
- Existing mortgage balance: $XXX,XXX  (only if in facts)
- Mortgage rate: X.X%  (only if in facts)
- Available equity: $XXX,XXX (X%)  (only if in facts)
- MLS status: [status text from facts]  (only if in facts)
- Distress: [comma-list from facts]  (only if facts include any distress signals)

## Comps
- [Address] – $XXX,XXX
- [Address] – $XXX,XXX
(omit the entire ## Comps section if no comps were provided)

[Closing block: 2-3 sentences with funding link, collaboration note, and disposition manager contact (name + phone). The funding link is an invitation to learn about the house-flipping franchise.]

Output ONLY the post. No commentary, no surrounding quotes.`
  }

  // social
  return `${shared}

OUTPUT: A Facebook Marketplace / social media post for cash investors and rehabbers.
- Under 180 words total.
- Short paragraphs (2-3 lines max each).
- Highlight the best 2-3 features, the work needed (if listed), and the spread (ARV vs asking) using the actual numbers.
- If a relevant distress signal is in the facts AND fits the primary offer type, mention it once in plain English.
- Conversational but professional — not stiff, not hyped.
- Clear call to action with disposition manager's name + phone.
- Output ONLY the post.`
}

// Voice hint per offer type. Keeps the AI focused on what the buying
// audience actually cares about for that strategy. New types fall back
// to the cash voice — safest default for cold buyer audiences.
function offerTypeVoice(type: string): string {
  const t = type.trim().toLowerCase()
  if (t === 'cash' || t === '') {
    return 'Lead with cash-friendly numbers (purchase price, repair estimate, ARV, spread). Audience: cash flippers and rental investors. Tone: direct, deal-math forward.'
  }
  if (t.includes('sub') && t.includes('to')) {
    return 'Lead with terms (existing loan balance, monthly payment, interest rate, equity remaining). Audience: creative-finance investors. Skip cash-spread framing — they care about long-hold cashflow.'
  }
  if (t.includes('novation')) {
    return 'Lead with novation upside (retail-buyer ARV vs purchase, listing strategy). Audience: agent-friendly investors comfortable listing on MLS. Mention agent commission room.'
  }
  if (t.includes('partner') || t === 'jv') {
    return 'Lead with JV terms (split, capital required, exit strategy). Audience: co-investment partners — collaborative, not transactional.'
  }
  return `Lead with the angle most relevant to a ${type} buyer. Tone: professional, deal-focused.`
}

function buildPrompt(kind: DispoArtifactKind, ctx: DispoContext): string {
  const facts = [
    `Primary offer type for this blast: ${ctx.primaryOfferType}`,
    `Address: ${ctx.address}${ctx.city ? `, ${ctx.city}` : ''}${ctx.state ? `, ${ctx.state}` : ''}`,
    ctx.beds != null ? `Beds: ${ctx.beds}` : null,
    ctx.baths != null ? `Baths: ${ctx.baths}` : null,
    ctx.sqft != null ? `Sqft: ${ctx.sqft.toLocaleString()}` : null,
    ctx.yearBuilt != null ? `Year built: ${ctx.yearBuilt}` : null,
    ctx.lotSize ? `Lot size: ${ctx.lotSize}` : null,
    ctx.propertyType ? `Type: ${ctx.propertyType}` : null,
    ctx.propertyCondition ? `Condition: ${ctx.propertyCondition}` : null,
    ctx.arv ? `ARV: $${formatNum(ctx.arv)}` : null,
    ctx.askingPrice ? `Investor asking price: $${formatNum(ctx.askingPrice)}` : null,
    ctx.contractPrice ? `Our contract price: $${formatNum(ctx.contractPrice)}` : null,
    ctx.assignmentFee ? `Assignment fee: $${formatNum(ctx.assignmentFee)}` : null,
    ctx.repairEstimate ? `Repair estimate: $${formatNum(ctx.repairEstimate)}` : null,
    ctx.rentalEstimate ? `Rep-set rental estimate: $${formatNum(ctx.rentalEstimate)}/mo` : null,
    // Session 80 — vendor-derived facts. Only included when present so the
    // model has nothing to hallucinate.
    ctx.mortgageBalance ? `Existing mortgage balance: $${formatNum(ctx.mortgageBalance)}` : null,
    ctx.mortgageRate ? `Existing mortgage rate: ${ctx.mortgageRate}%` : null,
    ctx.mortgagePayment ? `Estimated monthly mortgage payment: $${formatNum(ctx.mortgagePayment)}` : null,
    ctx.equityPercent ? `Equity: ${ctx.equityPercent}%${ctx.availableEquity ? ` ($${formatNum(ctx.availableEquity)})` : ''}` : null,
    ctx.underwater === true ? `Mortgage status: underwater (owe more than value)` : null,
    ctx.mlsStatus ? `MLS status: ${ctx.mlsStatus}${ctx.mlsListingPrice ? ` at $${formatNum(ctx.mlsListingPrice)}` : ''}${ctx.mlsDaysOnMarket != null ? `, ${ctx.mlsDaysOnMarket} days on market` : ''}` : null,
    ctx.distressSignals.length > 0 ? `Distress signals: ${ctx.distressSignals.join(', ')}` : null,
    ctx.annualTax ? `Annual property tax: $${formatNum(ctx.annualTax)}` : null,
    ctx.taxDelinquentAmount ? `Tax delinquent amount: $${formatNum(ctx.taxDelinquentAmount)}` : null,
    ctx.hoaDues ? `HOA dues: $${formatNum(ctx.hoaDues)}/mo` : null,
    ctx.lastSalePrice && ctx.lastSaleDate ? `Last sale: $${formatNum(ctx.lastSalePrice)} on ${ctx.lastSaleDate}` : null,
    ctx.suggestedRent ? `HUD fair-market rent for area: $${formatNum(ctx.suggestedRent)}/mo` : null,
    ctx.neighborhoodSummary ? `Neighborhood: ${ctx.neighborhoodSummary}` : null,
    ctx.description ? `Existing description (rewrite/refine): ${ctx.description}` : null,
    ctx.pros.length > 0 ? `Pros: ${ctx.pros.join(', ')}` : null,
    ctx.workNeeded.length > 0 ? `Work needed: ${ctx.workNeeded.join(', ')}` : null,
    `\nVoice for ${ctx.primaryOfferType}: ${offerTypeVoice(ctx.primaryOfferType)}`,
  ].filter(Boolean).join('\n')

  const closing = `\nDisposition Manager: ${ctx.dispoManagerName}${ctx.dispoManagerPhone ? ` (${ctx.dispoManagerPhone})` : ''}\nFunding link (for the closing block — house-flipping franchise the rep owns): ${ctx.fundingLink}`

  // Session 80 — comps surfaced to ALL three generators. Listing renders
  // them in the ## Comps block; description and social use them as anchor
  // points (e.g. "comps in the area at $X") only if useful, never as a list.
  const compsBlock = ctx.comps.length > 0
    ? '\n\nComps (logged manually for this property — pull 2-4 most relevant):\n' + ctx.comps.map(c => {
        const parts = [c.address]
        if (c.price) parts.push(`$${formatNum(c.price)}`)
        if (c.status) parts.push(c.status)
        if (c.condition) parts.push(c.condition)
        if (c.beds != null && c.baths != null) parts.push(`${c.beds}/${c.baths}`)
        if (c.sqft != null) parts.push(`${c.sqft.toLocaleString()} sf`)
        return `- ${parts.join(' | ')}`
      }).join('\n')
    : '\n\n(No comps logged for this property.)'

  return `Property facts:\n${facts}${closing}${compsBlock}`
}

function formatNum(s: string | null | undefined): string {
  if (!s) return '—'
  const n = Number(s)
  return isNaN(n) ? s : n.toLocaleString()
}
