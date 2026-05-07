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

export interface GenerateDispoResult {
  status: 'success' | 'error'
  text?: string
  reason?: string
}

interface DispoContext {
  // Property facts the prompts pull from. Minimal projection — we don't
  // load the full Property here because we only need 20-ish fields.
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
  // Comps (from PropertyComp table) — only used by listing prompt
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

// ─── Context loader ──────────────────────────────────────────────────

async function loadContext(propertyId: string, tenantId: string): Promise<DispoContext | null> {
  const property = await db.property.findUnique({
    where: { id: propertyId, tenantId },
    select: {
      address: true, city: true, state: true,
      beds: true, baths: true, sqft: true, yearBuilt: true, lotSize: true,
      propertyType: true, propertyCondition: true,
      arv: true, dispoAskingPrice: true, contractPrice: true, assignmentFee: true,
      dealBlastArvOverride: true,
      description: true, neighborhoodSummary: true,
      repairEstimate: true, rentalEstimate: true,
      // Intangibles → infer pros + work-needed for the prompts
      comparableRisk: true, basementStatus: true, curbAppeal: true,
      neighborsGrade: true, parkingType: true, yardGrade: true,
      roofCondition: true, windowsCondition: true, sidingCondition: true,
      exteriorCondition: true,
      locationGrade: true,
      // PropertyComp rows — used only by listing prompt
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
    propertyCondition: property.propertyCondition,
    arv,
    askingPrice: property.dispoAskingPrice?.toString() ?? null,
    contractPrice: property.contractPrice?.toString() ?? null,
    assignmentFee: property.assignmentFee?.toString() ?? null,
    description: property.description,
    neighborhoodSummary: property.neighborhoodSummary,
    repairEstimate: property.repairEstimate?.toString() ?? null,
    rentalEstimate: property.rentalEstimate?.toString() ?? null,
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
  // Shared tone rules carved out so all 3 generators share the same
  // floor. Specific format is in the user prompt.
  const shared = `TONE RULES (apply to all output):
- Professional, factual, trustworthy. Investor audience.
- Simple, direct language. No fluff.
- Do NOT use hype words: "steal", "gem", "massive", "explosive", "insane", "amazing", "incredible".
- Do NOT use emojis.
- Always close with the assigned Disposition Manager's name + phone number as the call to action.`

  if (kind === 'description') {
    return `${shared}

OUTPUT: A short, clean opening paragraph (2-4 sentences) for a property listing.
- Target: real estate investors.
- Create mild curiosity. Clearly state the opportunity.
- Mention the most important positives + the main work needed.
- End with: "Contact [Dispo Manager Name] at [phone] for details."
- Output ONLY the paragraph. No headers, no extra commentary.`
  }

  if (kind === 'listing') {
    return `${shared}

OUTPUT: A property listing post in this EXACT structure:

[Opening paragraph - 2-4 sentences, professional and factual]

## Property Details
- Beds/Baths: X / X
- Sqft: XXX
- Condition: [short description]
- ARV: $XXX,000+
- Location: [City], [State]
- Pros: [3-5 bullet points of key advantages]

## Comps
- [Full address or street] – $XXX,000
- [Full address or street] – $XXX,000
(keep comps short, no extra text)

[Closing block: 2-3 sentences with funding link, collaboration note, and disposition manager contact (name + phone). The funding link should be presented as an invitation to learn about the house-flipping franchise.]

Output ONLY the post. No commentary, no surrounding quotes.`
  }

  // social
  return `${shared}

OUTPUT: A Facebook Marketplace / social media post for cash investors and rehabbers.
- Under 180 words total.
- Short paragraphs (2-3 lines max each).
- Highlight the best 2-3 features, the work needed, the ARV or rental potential.
- Conversational but professional — not stiff, not hyped.
- Clear call to action with disposition manager's name + phone.
- Output ONLY the post.`
}

function buildPrompt(kind: DispoArtifactKind, ctx: DispoContext): string {
  const facts = [
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
    ctx.rentalEstimate ? `Rental estimate: $${formatNum(ctx.rentalEstimate)}/mo` : null,
    ctx.neighborhoodSummary ? `Neighborhood: ${ctx.neighborhoodSummary}` : null,
    ctx.description ? `Existing description (rewrite/refine): ${ctx.description}` : null,
    ctx.pros.length > 0 ? `Pros: ${ctx.pros.join(', ')}` : null,
    ctx.workNeeded.length > 0 ? `Work needed: ${ctx.workNeeded.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const closing = `\nDisposition Manager: ${ctx.dispoManagerName}${ctx.dispoManagerPhone ? ` (${ctx.dispoManagerPhone})` : ''}\nFunding link (for the closing block — house-flipping franchise the rep owns): ${ctx.fundingLink}`

  if (kind === 'listing') {
    const comps = ctx.comps.length > 0
      ? '\n\nComps (use these in the ## Comps block — pick 2-4 most relevant):\n' + ctx.comps.map(c => {
          const parts = [c.address]
          if (c.price) parts.push(`$${formatNum(c.price)}`)
          if (c.status) parts.push(c.status)
          if (c.condition) parts.push(c.condition)
          return `- ${parts.join(' | ')}`
        }).join('\n')
      : '\n\n(No comps logged — omit the ## Comps block entirely.)'
    return `Property facts:\n${facts}${closing}${comps}`
  }

  return `Property facts:\n${facts}${closing}`
}

function formatNum(s: string | null | undefined): string {
  if (!s) return '—'
  const n = Number(s)
  return isNaN(n) ? s : n.toLocaleString()
}
