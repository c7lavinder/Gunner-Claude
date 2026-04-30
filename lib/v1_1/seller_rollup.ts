// lib/v1_1/seller_rollup.ts
//
// v1.1 Wave 4 seller-side rollup. Lives here so the post-grade flow
// (lib/ai/grading.ts), the rollup-backfill diagnostic
// (app/api/diagnostics/v1_1_seller_rollup_backfill/route.ts), and any
// future debug script all call the same code path.
//
// Two entry points:
//
//   1. rollupSellerFromCalls(tenantId, sellerId, opts)
//      Read all the seller's calls, compute aggregates, write to the
//      Seller row. Idempotent. Class-4 hardened — every internal query
//      is scoped by tenantId (per AGENTS.md end-of-Wave-3 helper rule).
//
//   2. backfillTenantSellerRollups(tenantId, opts)
//      Iterate every Seller in this tenant with at least one call and
//      run the rollup for each. Used for the one-time replay where no
//      new Claude calls are needed (the formulas use Call columns that
//      already exist: sellerMotivation, sentiment, calledAt, etc.).
//
// Computed fields (Wave 4 commit A):
//   Seller.motivationScore        — EMA of last 5 calls' sellerMotivation
//   Seller.likelihoodToSellScore  — composite: motivation × urgency-recency
//                                   × sentiment-trend + hardship modifier
//   Seller.totalCallCount         — count of calls
//   Seller.lastContactDate        — max calledAt
//   Seller.noAnswerStreak         — consecutive no-answer outcomes from latest
//   Seller.objectionProfile       — additive, deduped, from dealIntelHistory
//   Seller.redFlags               — additive, deduped
//   Seller.positiveSignals        — additive, deduped
//
// NOT computed here (depends on Wave 4 commit B's prompt extension):
//   Seller.personalityType / communicationStyle / priceSensitivity
//     (mode-across-calls — needs the prompt to extract these per-call first)
//   Seller.motivationPrimary / urgencyScore / saleTimeline / hardshipType
//     (latest-wins from extraction — those write directly via the
//     proposedChanges flow once Commit B re-keys them.)
//
// Idempotent. Re-running for the same seller produces the same writes
// (modulo new calls landing in between).

import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'

// ─── Types ──────────────────────────────────────────────────────────────

export interface RollupOpts {
  dryRun: boolean
}

export interface RollupResult {
  status: 'success' | 'no_calls' | 'error'
  sellerId: string
  callCount: number
  fieldsUpdated: string[]
  diff: Record<string, { from: unknown; to: unknown }>
  error?: string
}

export interface BackfillReport {
  scanned: number
  updated: number
  noCalls: number
  errors: number
  fieldsTouched: Record<string, number>
  samples: Array<{
    sellerId: string
    sellerNamePreview: string
    callCount: number
    fieldsUpdated: string[]
    diff: Record<string, { from: unknown; to: unknown }>
  }>
  errorSamples: Array<{ sellerId: string; error: string }>
}

// ─── Internal selectors ─────────────────────────────────────────────────

const CALL_SELECT = {
  id: true,
  calledAt: true,
  sentiment: true,
  sellerMotivation: true,
  callOutcome: true,
  callPrimaryEmotion: true,
  callTrustStep: true,
  dealIntelHistory: true,
  gradingStatus: true,
} satisfies Prisma.CallSelect

type CallForRollup = Prisma.CallGetPayload<{ select: typeof CALL_SELECT }>

const SELLER_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  motivationScore: true,
  likelihoodToSellScore: true,
  totalCallCount: true,
  lastContactDate: true,
  noAnswerStreak: true,
  objectionProfile: true,
  redFlags: true,
  positiveSignals: true,
  saleTimeline: true,
  isForeclosure: true,
  isBankruptcy: true,
  behindOnPayments: true,
  fieldSources: true,
} satisfies Prisma.SellerSelect

type SellerForRollup = Prisma.SellerGetPayload<{ select: typeof SELLER_SELECT }>

// ─── Math helpers ───────────────────────────────────────────────────────

// EMA-style weights for last-5 scoring. Index 0 = most recent call.
// Weights sum to 1.0 when all 5 slots are filled; renormalized when fewer
// data points exist so a 1-call seller still gets a meaningful score.
const EMA_WEIGHTS = [0.4, 0.25, 0.15, 0.12, 0.08]

function emaOfLast5(values: Array<number | null>): number | null {
  const filtered = values.filter((v): v is number => typeof v === 'number').slice(0, 5)
  if (filtered.length === 0) return null
  let weightSum = 0
  let weighted = 0
  for (let i = 0; i < filtered.length; i++) {
    const w = EMA_WEIGHTS[i] ?? 0.05
    weighted += filtered[i] * w
    weightSum += w
  }
  return weightSum > 0 ? weighted / weightSum : null
}

const NO_ANSWER_OUTCOMES = new Set([
  'voicemail', 'no_answer', 'busy', 'declined',
])

function computeNoAnswerStreak(calls: CallForRollup[]): number {
  // calls are ordered desc by calledAt — count consecutive from the head.
  let streak = 0
  for (const c of calls) {
    if (c.callOutcome && NO_ANSWER_OUTCOMES.has(c.callOutcome)) streak++
    else break
  }
  return streak
}

function urgencyRecencyFactor(seller: SellerForRollup, lastContactDate: Date | null): number {
  let timelineScore = 0.5
  switch (seller.saleTimeline) {
    case 'ASAP':     timelineScore = 1.0; break
    case '30_days':  timelineScore = 0.85; break
    case '60_days':  timelineScore = 0.70; break
    case '90_days':  timelineScore = 0.55; break
    case 'flexible': timelineScore = 0.35; break
  }
  if (!lastContactDate) return timelineScore * 0.5
  const daysSince = (Date.now() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24)
  // No call in 60 days strongly damps timeline confidence; 30+ moderate.
  const recencyFactor = daysSince > 60 ? 0.3 : daysSince > 30 ? 0.7 : 1.0
  return timelineScore * recencyFactor
}

/** Pull cumulative additive lists out of dealIntelHistory across calls.
 *  Each call's dealIntelHistory is an array of proposedChange objects.
 *  We include changes that were either approved by the rep, or are
 *  high-confidence and never reviewed (auto-trust the AI on the strong
 *  signals). Skipped/rejected changes are excluded. Items deduped by
 *  lowercase canonical key, original casing preserved in output. */
function collectAdditiveLists(calls: CallForRollup[], field: string): string[] {
  const seen = new Map<string, string>()
  for (const call of calls) {
    const history = call.dealIntelHistory as Array<Record<string, unknown>> | null
    if (!Array.isArray(history)) continue
    for (const change of history) {
      if (change.field !== field) continue
      const decision = change.decision as string | undefined
      const confidence = change.confidence as string | undefined
      if (decision === 'rejected' || decision === 'skipped') continue
      if (!decision && confidence !== 'high') continue
      const value = change.proposedValue
      if (Array.isArray(value)) {
        for (const item of value) {
          const label =
            typeof item === 'string' ? item
            : item && typeof item === 'object'
              ? (typeof (item as Record<string, unknown>).label === 'string'
                  ? ((item as Record<string, unknown>).label as string)
                  : typeof (item as Record<string, unknown>).objection === 'string'
                    ? ((item as Record<string, unknown>).objection as string)
                    : typeof (item as Record<string, unknown>).flag === 'string'
                      ? ((item as Record<string, unknown>).flag as string)
                      : null)
              : null
          if (label) {
            const key = label.trim().toLowerCase()
            if (key && !seen.has(key)) seen.set(key, label.trim())
          }
        }
      } else if (typeof value === 'string') {
        const key = value.trim().toLowerCase()
        if (key && !seen.has(key)) seen.set(key, value.trim())
      }
    }
  }
  return [...seen.values()]
}

function jsonArrayEquivalent(a: unknown, b: string[]): boolean {
  if (!Array.isArray(a)) return b.length === 0
  if ((a as unknown[]).length !== b.length) return false
  const aLower = (a as unknown[])
    .map(x => typeof x === 'string' ? x.toLowerCase() : '')
    .filter(Boolean)
    .sort()
  const bLower = b.map(x => x.toLowerCase()).sort()
  if (aLower.length !== bLower.length) return false
  for (let i = 0; i < aLower.length; i++) {
    if (aLower[i] !== bLower[i]) return false
  }
  return true
}

// ─── Core rollup ────────────────────────────────────────────────────────

export async function rollupSellerFromCalls(
  tenantId: string,
  sellerId: string,
  opts: RollupOpts,
): Promise<RollupResult> {
  // Class-4: scope every internal query by tenantId (AGENTS.md helper rule).
  const seller = await db.seller.findFirst({
    where: { id: sellerId, tenantId },
    select: SELLER_SELECT,
  })
  if (!seller) {
    return {
      status: 'error',
      sellerId,
      callCount: 0,
      fieldsUpdated: [],
      diff: {},
      error: 'Seller not found or wrong tenant',
    }
  }

  const calls = await db.call.findMany({
    where: { tenantId, sellerId },
    select: CALL_SELECT,
    orderBy: { calledAt: 'desc' },
  })
  if (calls.length === 0) {
    return { status: 'no_calls', sellerId, callCount: 0, fieldsUpdated: [], diff: {} }
  }

  const update: Record<string, unknown> = {}
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  const fieldsUpdated: string[] = []

  const setIf = (col: string, current: unknown, next: unknown): void => {
    if (next === null || next === undefined) return
    if (current === next) return
    if (typeof next === 'number' && typeof current === 'number' && Math.abs(current - next) < 0.001) return
    update[col] = next
    diff[col] = { from: current, to: next }
    fieldsUpdated.push(col)
  }

  // ── Activity aggregates ───────────────────────────────────────────────
  const totalCallCount = calls.length
  setIf('totalCallCount', seller.totalCallCount, totalCallCount)

  const lastContactDate = calls[0]?.calledAt ?? null
  if (lastContactDate) {
    const cur = seller.lastContactDate ? seller.lastContactDate.getTime() : null
    const next = lastContactDate.getTime()
    if (cur !== next) {
      update.lastContactDate = lastContactDate
      diff.lastContactDate = { from: seller.lastContactDate, to: lastContactDate }
      fieldsUpdated.push('lastContactDate')
    }
  }

  const noAnswerStreak = computeNoAnswerStreak(calls)
  setIf('noAnswerStreak', seller.noAnswerStreak, noAnswerStreak)

  // ── motivationScore (EMA of last 5 calls' sellerMotivation) ───────────
  // sellerMotivation is populated by lib/ai/grading.ts on every graded
  // call (0.0-1.0 scale). Ungraded / failed calls' values are skipped.
  const motivationValues = calls
    .filter(c => c.sellerMotivation !== null)
    .map(c => c.sellerMotivation)
  const motivationScore = emaOfLast5(motivationValues)
  if (motivationScore !== null) {
    setIf('motivationScore', seller.motivationScore, Number(motivationScore.toFixed(4)))
  }

  // ── likelihoodToSellScore (composite, plan §7) ────────────────────────
  // 60% motivation + 25% urgency × recency + 15% sentiment trend
  // + small hardship modifier (capped because score is 0-1 anyway).
  if (motivationScore !== null) {
    const urFactor = urgencyRecencyFactor(seller, lastContactDate)
    const recentSentiments = calls.slice(0, 3)
      .map(c => c.sentiment)
      .filter((v): v is number => typeof v === 'number')
    // Map sentiment [-1, 1] → [0, 1] for blending with the other 0-1 factors.
    const sentNorm = recentSentiments.length > 0
      ? recentSentiments.reduce((s, v) => s + (v + 1) / 2, 0) / recentSentiments.length
      : 0.5
    const hardshipBonus =
      (seller.isForeclosure ? 0.05 : 0) +
      (seller.behindOnPayments ? 0.03 : 0) +
      (seller.isBankruptcy ? 0.02 : 0)
    const raw = motivationScore * 0.60 + urFactor * 0.25 + sentNorm * 0.15 + hardshipBonus
    const likelihood = Math.max(0, Math.min(1, raw))
    setIf('likelihoodToSellScore', seller.likelihoodToSellScore, Number(likelihood.toFixed(4)))
  }

  // ── Additive lists from dealIntelHistory ──────────────────────────────
  const objections = collectAdditiveLists(calls, 'objectionsEncountered')
  const redFlags = collectAdditiveLists(calls, 'dealRedFlags')
  const positiveSignals = collectAdditiveLists(calls, 'dealGreenFlags')

  if (!jsonArrayEquivalent(seller.objectionProfile, objections)) {
    update.objectionProfile = objections as Prisma.InputJsonValue
    diff.objectionProfile = { from: seller.objectionProfile, to: objections }
    fieldsUpdated.push('objectionProfile')
  }
  if (!jsonArrayEquivalent(seller.redFlags, redFlags)) {
    update.redFlags = redFlags as Prisma.InputJsonValue
    diff.redFlags = { from: seller.redFlags, to: redFlags }
    fieldsUpdated.push('redFlags')
  }
  if (!jsonArrayEquivalent(seller.positiveSignals, positiveSignals)) {
    update.positiveSignals = positiveSignals as Prisma.InputJsonValue
    diff.positiveSignals = { from: seller.positiveSignals, to: positiveSignals }
    fieldsUpdated.push('positiveSignals')
  }

  if (fieldsUpdated.length === 0) {
    return { status: 'success', sellerId, callCount: calls.length, fieldsUpdated: [], diff: {} }
  }

  // Field-source bookkeeping — match wave_2_backfill convention.
  const fieldSources: Record<string, string> = {
    ...((seller.fieldSources as Record<string, string>) ?? {}),
  }
  for (const f of fieldsUpdated) {
    if (fieldSources[f] !== 'user') fieldSources[f] = 'ai'
  }

  if (!opts.dryRun) {
    try {
      await db.seller.update({
        where: { id: sellerId, tenantId },
        data: { ...update, fieldSources } as Prisma.SellerUpdateInput,
      })
    } catch (err) {
      return {
        status: 'error',
        sellerId,
        callCount: calls.length,
        fieldsUpdated,
        diff,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return { status: 'success', sellerId, callCount: calls.length, fieldsUpdated, diff }
}

// ─── Backfill orchestration ─────────────────────────────────────────────

export async function backfillTenantSellerRollups(
  tenantId: string,
  opts: RollupOpts & { sampleSize?: number; limit?: number },
): Promise<BackfillReport> {
  const sampleSize = opts.sampleSize ?? 10
  const report: BackfillReport = {
    scanned: 0,
    updated: 0,
    noCalls: 0,
    errors: 0,
    fieldsTouched: {},
    samples: [],
    errorSamples: [],
  }

  // Pull every Seller with at least one call. tenantId-scoped.
  const sellers = await db.seller.findMany({
    where: { tenantId, calls: { some: {} } },
    select: { id: true, name: true },
    take: opts.limit,
    orderBy: { createdAt: 'asc' },
  })

  for (const s of sellers) {
    report.scanned++
    const result = await rollupSellerFromCalls(tenantId, s.id, { dryRun: opts.dryRun })

    if (result.status === 'error') {
      report.errors++
      if (report.errorSamples.length < sampleSize) {
        report.errorSamples.push({ sellerId: s.id, error: result.error ?? 'unknown' })
      }
      continue
    }
    if (result.status === 'no_calls') {
      report.noCalls++
      continue
    }
    if (result.fieldsUpdated.length === 0) continue

    report.updated++
    for (const f of result.fieldsUpdated) {
      report.fieldsTouched[f] = (report.fieldsTouched[f] ?? 0) + 1
    }
    if (report.samples.length < sampleSize) {
      report.samples.push({
        sellerId: s.id,
        sellerNamePreview: (s.name ?? '').slice(0, 40),
        callCount: result.callCount,
        fieldsUpdated: result.fieldsUpdated,
        diff: result.diff,
      })
    }
  }

  return report
}
