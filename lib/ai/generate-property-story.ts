// lib/ai/generate-property-story.ts
// Property Story: AI-generated narrative paragraph that updates over time.
// Invoked after each call grading + nightly cron for properties with activity.
//
// Inputs (pulled here, not denormalized):
//   - Property facts + BatchData enrichment (zillowData.batchData)
//   - Sellers (names/roles)
//   - Milestones (dates + notes)
//   - Last ~10 graded calls' aiSummary + selected dealIntel fields
//   - Buyer matches (PropertyBuyerStage) + blast history (DealBlast)
//   - Outreach logs (sends, offers, showings)
//   - Lead source + ad campaign
//
// Output: single ~180-260 word paragraph in `property.story`.
// Cost target: ~$0.01–0.02 per regeneration with Sonnet.

import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'
import { logFailure } from '@/lib/audit'
import { anthropic } from '@/config/anthropic'
import { effectiveStatus } from '@/lib/property-status'
const STORY_MODEL = 'claude-sonnet-4-6'
const MAX_CALLS_IN_CONTEXT = 10
const MAX_TOKENS = 700

export interface GenerateStoryResult {
  status: 'success' | 'skipped' | 'error'
  reason?: string
  story?: string
}

export async function generatePropertyStory(
  propertyId: string,
  tenantId: string,
): Promise<GenerateStoryResult> {
  // Scoped on tenantId — caller is no longer load-bearing for tenant boundary.
  const property = await db.property.findFirst({
    where: { id: propertyId, tenantId },
    include: {
      tenant: { select: { id: true } },
      assignedTo: { select: { name: true, role: true } },
      market: { select: { name: true } },
      sellers: {
        include: { seller: { select: { name: true, phone: true, email: true } } },
        orderBy: { isPrimary: 'desc' },
      },
      milestones: { orderBy: { createdAt: 'asc' }, take: 40 },
      calls: {
        where: { gradingStatus: 'COMPLETED', aiSummary: { not: null } },
        orderBy: { gradedAt: 'desc' },
        take: MAX_CALLS_IN_CONTEXT,
        select: {
          id: true, calledAt: true, durationSeconds: true, direction: true,
          callType: true, score: true, aiSummary: true, sentiment: true,
          assignedTo: { select: { name: true } },
        },
      },
      outreachLogs: {
        orderBy: { loggedAt: 'desc' },
        take: 20,
        select: {
          type: true, channel: true, recipientName: true, notes: true,
          offerAmount: true, offerStatus: true, showingDate: true,
          showingStatus: true, source: true, loggedAt: true,
        },
      },
      buyerStages: {
        orderBy: { updatedAt: 'desc' },
        take: 40,
        select: {
          stage: true, responseIntent: true, responseAt: true,
          buyer: { select: { name: true } },
        },
      },
      dealBlasts: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          channel: true, status: true, createdAt: true, sentAt: true,
          recipients: { select: { response: true } },
        },
      },
    },
  })

  if (!property) return { status: 'error', reason: 'property not found' }

  const hasSignal = property.calls.length > 0 || property.milestones.length > 0 || property.sellers.length > 0
  if (!hasSignal) {
    return { status: 'skipped', reason: 'not enough signal yet (no calls, milestones, or sellers)' }
  }

  const bd = ((property.zillowData as Record<string, unknown> | null)?.batchData ?? {}) as Record<string, unknown>
  const dealIntel = (property.dealIntel ?? {}) as Record<string, unknown>

  const userPrompt = buildStoryPrompt({ ...property, status: effectiveStatus(property) }, bd, dealIntel)

  try {
    const { logAiCall, startTimer } = await import('@/lib/ai/log')
    const timer = startTimer()

    const response = await anthropic.messages.create({
      model: STORY_MODEL,
      max_tokens: MAX_TOKENS,
      system: STORY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const story = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    if (!story) {
      return { status: 'error', reason: 'empty response from model' }
    }

    logAiCall({
      tenantId: property.tenant.id,
      type: 'property_story',
      pageContext: `property:${propertyId}`,
      input: userPrompt.slice(0, 3000),
      output: story.slice(0, 3000),
      tokensIn: response.usage?.input_tokens,
      tokensOut: response.usage?.output_tokens,
      durationMs: timer(),
      model: STORY_MODEL,
    }).catch(err => {
      logFailure(property.tenant.id, 'property_story.ai_log_failed', `property:${propertyId}`, err)
    })

    await db.property.update({
      where: { id: propertyId, tenantId },
      data: {
        story,
        storyUpdatedAt: new Date(),
        storyVersion: { increment: 1 },
      },
    })

    return { status: 'success', story }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Property Story] Generation failed for ${propertyId}:`, msg)
    await logFailure(property.tenant.id, 'property_story.generate_failed', `property:${propertyId}`, err).catch(() => {})
    return { status: 'error', reason: msg }
  }
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const STORY_SYSTEM_PROMPT = `You are writing the Deal Story for a real estate wholesaling CRM. The story is a single, readable paragraph of 180-260 words that gives an internal team member a full situational picture of a property deal in under a minute.

TONE: Direct, specific, and factual. Reference names, dollar amounts, dates, and concrete quotes when they exist. Do not editorialize or use marketing language. Do not add hedges like "it appears" or "it seems" — if the data shows it, state it.

STRUCTURE (single paragraph, no headings, no bullets):
1. Open with how and when the lead came in (source, campaign if known, days ago)
2. Property + seller facts (address, condition, beds/baths, equity posture if known; who the seller is and what their situation is)
3. Conversation arc — what reps have learned across calls, where motivation stands, objections, commitments, key quotes
4. Deal state — current stage, recent milestones, offers made, negotiation posture
5. Buyer activity — matched buyers, blasts sent, responses received, movement through buyer kanban
6. What matters most right now — the one or two things a team member should watch or act on

RULES:
- If a section has no data, skip it silently — do not write "No buyer activity yet."
- Never make up data that wasn't in the input.
- Keep it to ONE paragraph. No headings, no lists, no markdown.
- Write in past tense for history and present tense for current state.
- If no meaningful signal exists in a section, shorten the paragraph — length should reflect data available.`

interface StoryPromptInput {
  address: string; city: string; state: string; zip: string
  status: string; dispoStatus: string | null
  createdAt: Date
  leadSource: string | null
  leadSubSource: string | null
  market: { name: string } | null
  assignedTo: { name: string | null; role: string | null } | null
  beds: number | null; baths: number | null; sqft: number | null
  yearBuilt: number | null; lotSize: string | null
  propertyType: string | null; occupancy: string | null
  propertyCondition: string | null
  arv: Prisma.Decimal | null
  askingPrice: Prisma.Decimal | null
  mao: Prisma.Decimal | null
  contractPrice: Prisma.Decimal | null
  assignmentFee: Prisma.Decimal | null
  currentOffer: Prisma.Decimal | null
  highestOffer: Prisma.Decimal | null
  acceptedPrice: Prisma.Decimal | null
  repairEstimate: Prisma.Decimal | null
  description: string | null
  internalNotes: string | null
  sellers: Array<{ seller: { name: string; phone: string | null; email: string | null }; role: string; isPrimary: boolean }>
  milestones: Array<{ type: string; createdAt: Date; notes: string | null; source: string }>
  calls: Array<{
    id: string; calledAt: Date | null; durationSeconds: number | null; direction: string
    callType: string | null; score: number | null; aiSummary: string | null
    sentiment: number | null; assignedTo: { name: string } | null
  }>
  outreachLogs: Array<{
    type: string; channel: string; recipientName: string; notes: string | null
    offerAmount: number | null; offerStatus: string | null
    showingDate: Date | null; showingStatus: string | null
    source: string; loggedAt: Date
  }>
  buyerStages: Array<{
    stage: string; responseIntent: string | null; responseAt: Date | null
    buyer: { name: string }
  }>
  dealBlasts: Array<{
    channel: string; status: string; createdAt: Date; sentAt: Date | null
    recipients: Array<{ response: string | null }>
  }>
}

function buildStoryPrompt(
  p: StoryPromptInput,
  bd: Record<string, unknown>,
  dealIntel: Record<string, unknown>,
): string {
  const today = new Date()
  const daysOld = Math.max(0, Math.floor((today.getTime() - p.createdAt.getTime()) / 86400000))
  const $ = (v: Prisma.Decimal | null | undefined) => v != null ? `$${Number(v).toLocaleString()}` : '—'
  const n = (v: number | null | undefined) => v != null ? v.toString() : '—'
  const d = (v: Date | null | undefined) => v ? v.toISOString().slice(0, 10) : '—'

  const parts: string[] = []

  parts.push(`TODAY: ${today.toISOString().slice(0, 10)}`)
  parts.push(`PROPERTY: ${p.address}, ${p.city}, ${p.state} ${p.zip}`)
  parts.push(`STAGE: acquisition=${p.status}${p.dispoStatus ? `, disposition=${p.dispoStatus}` : ''}`)
  parts.push(`LEAD CAME IN: ${daysOld} days ago (${d(p.createdAt)}) — source=${p.leadSource ?? 'unknown'}${p.leadSubSource ? ` / ${p.leadSubSource}` : ''}${p.market?.name ? `, market=${p.market.name}` : ''}`)
  if (p.assignedTo?.name) parts.push(`ASSIGNED TO: ${p.assignedTo.name}${p.assignedTo.role ? ` (${p.assignedTo.role})` : ''}`)

  const facts: string[] = []
  if (p.propertyType) facts.push(`type=${p.propertyType}`)
  if (p.beds != null) facts.push(`${p.beds} bed`)
  if (p.baths != null) facts.push(`${p.baths} bath`)
  if (p.sqft != null) facts.push(`${p.sqft.toLocaleString()} sqft`)
  if (p.yearBuilt != null) facts.push(`built ${p.yearBuilt}`)
  if (p.lotSize) facts.push(`lot ${p.lotSize}`)
  if (p.occupancy) facts.push(`occupancy=${p.occupancy}`)
  if (p.propertyCondition) facts.push(`condition=${p.propertyCondition}`)
  if (facts.length) parts.push(`FACTS: ${facts.join(', ')}`)

  const fin: string[] = []
  fin.push(`ARV=${$(p.arv)}`)
  fin.push(`Asking=${$(p.askingPrice)}`)
  fin.push(`MAO=${$(p.mao)}`)
  if (p.repairEstimate) fin.push(`RepairEst=${$(p.repairEstimate)}`)
  if (p.currentOffer) fin.push(`CurrentOffer=${$(p.currentOffer)}`)
  if (p.highestOffer) fin.push(`HighestOffer=${$(p.highestOffer)}`)
  if (p.contractPrice) fin.push(`Contract=${$(p.contractPrice)}`)
  if (p.acceptedPrice) fin.push(`Accepted=${$(p.acceptedPrice)}`)
  if (p.assignmentFee) fin.push(`AssignmentFee=${$(p.assignmentFee)}`)
  parts.push(`FINANCIALS: ${fin.join(', ')}`)

  if (bd.equityPercent != null) parts.push(`EQUITY (BatchData): ${bd.equityPercent}%${bd.ltv != null ? `, LTV ${bd.ltv}%` : ''}${bd.totalOpenLienCount != null ? `, ${bd.totalOpenLienCount} liens` : ''}`)
  if (bd.ownerName) parts.push(`OWNER (records): ${bd.ownerName}${bd.absenteeOwner ? ' (absentee)' : ''}${bd.ownerMailingAddress ? `, mail=${bd.ownerMailingAddress}` : ''}`)

  if (p.sellers.length > 0) {
    const sellerLines = p.sellers.map(s => `${s.seller.name}${s.isPrimary ? ' [primary]' : ''} (${s.role})${s.seller.phone ? ` — ${s.seller.phone}` : ''}`)
    parts.push(`SELLERS: ${sellerLines.join('; ')}`)
  }

  const intelKeys = [
    'sellerWhySelling', 'sellerMotivationLevel', 'sellerMotivationReason',
    'sellerTimeline', 'sellerTimelineUrgency', 'sellerFamilySituation',
    'financialDistressLevel', 'costOfInaction',
    'decisionMakers', 'objectionsEncountered', 'stickingPoints',
    'nextStepAgreed', 'commitmentsWeMade', 'promisesTheyMade',
    'dealHealthScore', 'dealRedFlags', 'dealGreenFlags',
    'tenantSituation', 'titleIssuesMentioned', 'liensMentioned', 'backTaxesMentioned',
  ]
  const intelLines: string[] = []
  for (const k of intelKeys) {
    const raw = dealIntel[k]
    if (raw == null) continue
    const unwrapped = typeof raw === 'object' && raw !== null && 'value' in (raw as Record<string, unknown>)
      ? (raw as { value: unknown }).value : raw
    if (unwrapped == null) continue
    const s = Array.isArray(unwrapped)
      ? unwrapped.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('; ')
      : typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped)
    if (s && s.toLowerCase() !== 'unknown' && s.toLowerCase() !== 'n/a' && s !== '[]' && s !== '{}') {
      intelLines.push(`  ${k}: ${s.slice(0, 240)}`)
    }
  }
  if (intelLines.length > 0) parts.push(`DEAL INTEL (from calls):\n${intelLines.join('\n')}`)

  if (p.calls.length > 0) {
    parts.push(`CALLS (most recent first, max ${MAX_CALLS_IN_CONTEXT}):`)
    for (const c of p.calls) {
      const when = d(c.calledAt)
      const rep = c.assignedTo?.name ?? 'rep'
      const dur = c.durationSeconds ? `${Math.floor(c.durationSeconds / 60)}m${c.durationSeconds % 60}s` : '—'
      const score = c.score != null ? `score=${Math.round(c.score)}` : 'ungraded'
      const sent = c.sentiment != null ? `, sentiment=${c.sentiment.toFixed(2)}` : ''
      parts.push(`  [${when}] ${rep} · ${c.direction.toLowerCase()} ${c.callType ?? 'call'} · ${dur} · ${score}${sent}`)
      if (c.aiSummary) parts.push(`    ${c.aiSummary.slice(0, 320)}`)
    }
  }

  if (p.milestones.length > 0) {
    const ms = p.milestones.map(m => `${d(m.createdAt)} ${m.type}${m.notes ? ` — ${m.notes.slice(0, 80)}` : ''}`)
    parts.push(`MILESTONES: ${ms.join('; ')}`)
  }

  if (p.outreachLogs.length > 0) {
    const ol = p.outreachLogs.slice(0, 10).map(l => {
      const tag = l.type === 'offer' ? `offer $${l.offerAmount ?? '?'}${l.offerStatus ? `(${l.offerStatus})` : ''}`
                 : l.type === 'showing' ? `showing ${l.showingDate ? d(l.showingDate) : ''}${l.showingStatus ? `(${l.showingStatus})` : ''}`
                 : `${l.channel}`
      return `${d(l.loggedAt)} ${l.type} ${tag} → ${l.recipientName}${l.notes ? ` — ${l.notes.slice(0, 80)}` : ''}`
    })
    parts.push(`OUTREACH: ${ol.join('; ')}`)
  }

  if (p.buyerStages.length > 0) {
    const counts: Record<string, number> = {}
    const responses: string[] = []
    for (const bs of p.buyerStages) {
      counts[bs.stage] = (counts[bs.stage] ?? 0) + 1
      if (bs.responseIntent) responses.push(`${bs.buyer.name}: ${bs.responseIntent}`)
    }
    const stageSummary = Object.entries(counts).map(([s, c]) => `${c} ${s}`).join(', ')
    parts.push(`BUYERS: ${stageSummary}`)
    if (responses.length > 0) parts.push(`BUYER RESPONSES: ${responses.slice(0, 6).join('; ')}`)
  }

  if (p.dealBlasts.length > 0) {
    const blasts = p.dealBlasts.map(b => {
      const intrst = b.recipients.filter(r => r.response === 'interested').length
      const pass = b.recipients.filter(r => r.response === 'pass').length
      return `${d(b.sentAt ?? b.createdAt)} ${b.channel} (${b.status})${b.recipients.length ? ` → ${b.recipients.length} recipients, ${intrst} interested, ${pass} pass` : ''}`
    })
    parts.push(`BLASTS: ${blasts.join('; ')}`)
  }

  if (p.description) parts.push(`DESCRIPTION: ${p.description.slice(0, 400)}`)
  if (p.internalNotes) parts.push(`INTERNAL NOTES: ${p.internalNotes.slice(0, 400)}`)

  parts.push('')
  parts.push('Write the Deal Story paragraph now. Pull the most important signal from the data above; skip empty sections silently.')

  return parts.join('\n')
}
