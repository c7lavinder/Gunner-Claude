// lib/ai/scoring.ts
// True Conversion Probability (TCP) — 0.0 to 1.0
// Ensemble rule-based model: probability that a lead reaches Dispo Process
// Recalculates on: call graded, stage change, task completed
//
// WRITES TO: properties.tcp_score, properties.tcp_factors, properties.tcp_updated_at
// READ BY: dashboard priority widget, inventory sort, AI coach context
//
// v1.1 Wave 4 — Class-4 hardened (takes tenantId explicitly; every
// internal query is tenant-scoped). Property TCP keeps its existing
// 8-factor formula (plan §7: "Property TCP keeps its existing formula
// unchanged"). After computing Property.tcpScore, this also fans out a
// Seller.likelihoodToSellScore rollup for every linked Seller — so a
// stage-change or task-completion TCP recalc trigger keeps Seller-side
// scores fresh even when no new call has landed.

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'

interface TCPFactors {
  callDurationBonus: number
  callSentiment: number
  appointmentSet: number
  appointmentNoShow: number
  touchCount: number
  daysSinceFirstContact: number
  stageVelocity: number
  equityBonus: number
  rawScore: number
}

interface TCPResult {
  score: number
  factors: TCPFactors
  buySignal: boolean
}

// Phase 2 weights — see docs/SYSTEM_MAP.md "TCP" section (originally docs/archive/TECH_STACK.md)
const WEIGHTS = {
  callDurationOver45s: 0.15,
  callSentiment: 0.20,
  appointmentSet: 0.25,
  appointmentNoShow: -0.15,
  touchCount: 0.10,
  daysSinceFirstContact: -0.05, // per week
  stageVelocity: 0.10,
  equityOver30pct: 0.15,
}

export async function calculateTCP(tenantId: string, propertyId: string): Promise<TCPResult> {
  // Class-4: scope every internal query by tenantId (AGENTS.md helper rule).
  const property = await db.property.findFirst({
    where: { id: propertyId, tenantId },
    include: {
      calls: {
        select: {
          score: true,
          sentiment: true,
          durationSeconds: true,
          callOutcome: true,
          calledAt: true,
          gradingStatus: true,
        },
        orderBy: { calledAt: 'desc' },
      },
      tasks: {
        select: { status: true, createdAt: true },
      },
      sellers: {
        include: {
          seller: {
            select: { id: true, createdAt: true },
          },
        },
      },
    },
  })

  if (!property) return { score: 0, factors: emptyFactors(), buySignal: false }

  const gradedCalls = property.calls.filter(c => c.gradingStatus === 'COMPLETED')
  const totalCalls = property.calls.length

  // Factor 1: Call duration bonus — calls over 45s
  const longCalls = property.calls.filter(c => (c.durationSeconds ?? 0) > 45).length
  const callDurationBonus = longCalls > 0
    ? Math.min(WEIGHTS.callDurationOver45s, (longCalls / Math.max(totalCalls, 1)) * WEIGHTS.callDurationOver45s)
    : 0

  // Factor 2: Call sentiment — average across graded calls
  const sentiments = gradedCalls.filter(c => c.sentiment !== null).map(c => c.sentiment as number)
  const avgSentiment = sentiments.length > 0
    ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
    : 0
  const callSentiment = avgSentiment * WEIGHTS.callSentiment

  // Factor 3: Appointment set
  const hasAppointment = property.calls.some(c => c.callOutcome === 'appointment_set')
  const appointmentSet = hasAppointment ? WEIGHTS.appointmentSet : 0

  // Factor 4: Appointment no-show (check tasks for missed appointments)
  const appointmentNoShow = 0 // Phase 2: will track via appointment webhook

  // Factor 5: Touch count — more touches = more engagement
  const touchCount = Math.min(WEIGHTS.touchCount, (totalCalls / 10) * WEIGHTS.touchCount)

  // Factor 6: Days since first contact — recency penalty
  const firstContact = property.sellers[0]?.seller?.createdAt ?? property.createdAt
  const daysSince = (Date.now() - firstContact.getTime()) / (1000 * 60 * 60 * 24)
  const weeksSince = daysSince / 7
  const daysSinceFirstContact = Math.max(WEIGHTS.daysSinceFirstContact * weeksSince, -0.30) // cap at -30%

  // Factor 7: Stage velocity — how fast they moved through stages
  const stageVelocity = property.ghlPipelineStage ? WEIGHTS.stageVelocity * 0.5 : 0

  // Factor 8: Equity bonus — high equity = more motivated seller
  const arv = property.arv ? Number(property.arv) : 0
  const askingPrice = property.askingPrice ? Number(property.askingPrice) : 0
  const equityPct = arv > 0 && askingPrice > 0 ? (arv - askingPrice) / arv : 0
  const equityBonus = equityPct > 0.30 ? WEIGHTS.equityOver30pct : equityPct > 0.15 ? WEIGHTS.equityOver30pct * 0.5 : 0

  // Calculate raw score
  const rawScore = 0.30 // base probability
    + callDurationBonus
    + callSentiment
    + appointmentSet
    + appointmentNoShow
    + touchCount
    + daysSinceFirstContact
    + stageVelocity
    + equityBonus

  // Clamp to 0.0 - 1.0
  const score = Math.max(0, Math.min(1, rawScore))

  const factors: TCPFactors = {
    callDurationBonus,
    callSentiment,
    appointmentSet,
    appointmentNoShow,
    touchCount,
    daysSinceFirstContact,
    stageVelocity,
    equityBonus,
    rawScore,
  }

  // Buy Signal: High TCP (>0.5) + Low recent engagement (no calls in 3 days)
  const lastCallDate = property.calls[0]?.calledAt
  const daysSinceLastCall = lastCallDate
    ? (Date.now() - lastCallDate.getTime()) / (1000 * 60 * 60 * 24)
    : 999
  const buySignal = score > 0.5 && daysSinceLastCall > 3

  // Save to DB — id+tenantId WHERE keeps the write tenant-scoped.
  await db.property.update({
    where: { id: propertyId, tenantId },
    data: {
      tcpScore: score,
      tcpFactors: factors as unknown as Prisma.InputJsonValue,
      tcpUpdatedAt: new Date(),
    },
  })

  // v1.1 Wave 4 — fan out Seller-side rollups for every linked Seller.
  // Fire-and-forget so the Property TCP write doesn't block on Seller
  // aggregate recomputes. Idempotent. Reaches the Seller table on every
  // TCP recalc trigger (call graded, stage change, task completed)
  // so Seller scores stay aligned with Property scores.
  for (const link of property.sellers) {
    const sellerId = link.seller?.id
    if (!sellerId) continue
    import('@/lib/v1_1/seller_rollup').then(({ rollupSellerFromCalls }) =>
      rollupSellerFromCalls(tenantId, sellerId, { dryRun: false }).catch(err =>
        console.error(`[TCP] Seller rollup failed for ${sellerId}:`, err instanceof Error ? err.message : err)
      )
    )
  }

  return { score, factors, buySignal }
}

// Recalculate TCP for all properties of a tenant
export async function recalculateTenantTCP(tenantId: string): Promise<number> {
  const properties = await db.property.findMany({
    where: { tenantId },
    select: { id: true },
  })

  let updated = 0
  for (const prop of properties) {
    await calculateTCP(tenantId, prop.id)
    updated++
  }

  return updated
}

function emptyFactors(): TCPFactors {
  return {
    callDurationBonus: 0,
    callSentiment: 0,
    appointmentSet: 0,
    appointmentNoShow: 0,
    touchCount: 0,
    daysSinceFirstContact: 0,
    stageVelocity: 0,
    equityBonus: 0,
    rawScore: 0,
  }
}
