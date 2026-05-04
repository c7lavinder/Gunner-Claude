// scripts/compute-aggregates.ts
//
// Nightly cron — computes Wave 1 aggregates across sellers + buyers:
//
// SELLER
//   - Portfolio:    totalPropertiesOwned, totalPropertiesSoldToUs, portfolioMarkets,
//                   totalDealsWithUs, totalDealsClosed, totalDealsWalked,
//                   lastDealClosedDate, closeRate
//   - Call voice:   primaryEmotionMostFrequent, trustStepCurrent, trustStepArc,
//                   voiceEnergyTrend, competitorsMentionedByName, dealkillersRaised,
//                   trustScore (0-100 mapped from trustStepCurrent)
//
// BUYER
//   - Funnel:       offersSentCount, offersAcceptedCount,
//                   conversionRateSentToAccepted, conversionRateAcceptedToClosed,
//                   droppedAfterUcCount
//
// Designed to be idempotent and lossy — if any single seller or buyer fails,
// we log and move on. The next run will pick it back up.

import { db } from '../lib/db/client'
import type { Prisma } from '@prisma/client'

// Property statuses that count as "closed with us" vs "dead"
const CLOSED_STATUSES = new Set(['SOLD', 'DISPO_CLOSED'])
const DEAD_STATUSES = new Set(['DEAD'])

// Map Claude-extracted trust step to a composite 0-100 trust score. Simple
// ordinal projection — we can blend with rapportScore / responseRate later
// once those feel stable.
const TRUST_STEP_SCORE: Record<string, number> = {
  distrustful: 20,
  neutral: 50,
  warming: 75,
  trusting: 95,
}

// Map Claude-extracted voice energy to a rank so we can detect trends.
const ENERGY_RANK: Record<string, number> = {
  distressed: 0,
  low: 1,
  medium: 2,
  high: 3,
}

interface SellerResult {
  id: string
  status: 'updated' | 'error'
  reason?: string
}

interface BuyerResult {
  id: string
  status: 'updated' | 'error'
  reason?: string
}

async function computeSellerAggregates(): Promise<SellerResult[]> {
  const sellers = await db.seller.findMany({
    select: { id: true, tenantId: true },
  })

  const results: SellerResult[] = []

  for (const seller of sellers) {
    try {
      // Portfolio aggregates — one join gets us what we need.
      const propertySellers = await db.propertySeller.findMany({
        where: { sellerId: seller.id },
        select: {
          property: {
            select: {
              status: true,
              stageEnteredAt: true,
              market: { select: { name: true } },
              propertyMarkets: true,
              createdAt: true,
            },
          },
        },
      })

      const totalPropertiesOwned = propertySellers.length
      const closed = propertySellers.filter(ps => CLOSED_STATUSES.has(ps.property.status))
      const walked = propertySellers.filter(ps => DEAD_STATUSES.has(ps.property.status))
      const totalDealsClosed = closed.length
      const totalDealsWalked = walked.length
      const closeRate = totalPropertiesOwned > 0 ? totalDealsClosed / totalPropertiesOwned : null

      // Markets they've listed with us, union of per-property market + propertyMarkets array
      const marketSet = new Set<string>()
      for (const ps of propertySellers) {
        const m = ps.property.market?.name
        if (m) marketSet.add(m)
        const arr = ps.property.propertyMarkets as unknown
        if (Array.isArray(arr)) {
          for (const v of arr) if (typeof v === 'string' && v) marketSet.add(v)
        }
      }

      // Last close date = latest stageEnteredAt among closed properties
      let lastDealClosedDate: Date | null = null
      for (const ps of closed) {
        const t = ps.property.stageEnteredAt ?? ps.property.createdAt
        if (!lastDealClosedDate || t > lastDealClosedDate) lastDealClosedDate = t
      }

      // Call voice aggregates — pull the recent N calls with promoted fields set.
      const calls = await db.call.findMany({
        where: { sellerId: seller.id },
        orderBy: { calledAt: 'desc' },
        take: 20,
        select: {
          id: true,
          calledAt: true,
          callPrimaryEmotion: true,
          callVoiceEnergyLevel: true,
          callTrustStep: true,
          callCompetitorsMentioned: true,
          callDealkillersSurfaced: true,
        },
      })

      // Mode of primary emotion across recent calls
      const emotionCounts: Record<string, number> = {}
      for (const c of calls) {
        if (c.callPrimaryEmotion) emotionCounts[c.callPrimaryEmotion] = (emotionCounts[c.callPrimaryEmotion] ?? 0) + 1
      }
      const primaryEmotionMostFrequent = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      // Trust arc — last 10 calls oldest → newest so the UI can draw a line
      const trustStepCurrent = calls.find(c => c.callTrustStep)?.callTrustStep ?? null
      const trustStepArc = calls
        .filter(c => c.callTrustStep)
        .slice(0, 10)
        .reverse()
        .map(c => ({ step: c.callTrustStep, callId: c.id, calledAt: c.calledAt }))

      const trustScore = trustStepCurrent ? (TRUST_STEP_SCORE[trustStepCurrent] ?? null) : null

      // Voice-energy trend — last 3 calls vs calls 4-8 average; null when insufficient
      const recentEnergies = calls.slice(0, 3).map(c => c.callVoiceEnergyLevel).filter((x): x is string => !!x)
      const olderEnergies = calls.slice(3, 8).map(c => c.callVoiceEnergyLevel).filter((x): x is string => !!x)
      const avgEnergy = (arr: string[]): number | null =>
        arr.length > 0 ? arr.reduce((s, x) => s + (ENERGY_RANK[x] ?? 2), 0) / arr.length : null
      const recentAvg = avgEnergy(recentEnergies)
      const olderAvg = avgEnergy(olderEnergies)
      let voiceEnergyTrend: string | null = null
      if (recentAvg != null && olderAvg != null) {
        const delta = recentAvg - olderAvg
        voiceEnergyTrend = delta > 0.3 ? 'rising' : delta < -0.3 ? 'declining' : 'stable'
      }

      // Union of dealkillers + competitors surfaced across calls
      const dealkillers = new Set<string>()
      const competitors = new Set<string>()
      for (const c of calls) {
        if (Array.isArray(c.callDealkillersSurfaced)) {
          for (const d of c.callDealkillersSurfaced) if (typeof d === 'string') dealkillers.add(d)
        }
        if (Array.isArray(c.callCompetitorsMentioned)) {
          for (const cm of c.callCompetitorsMentioned) if (typeof cm === 'string') competitors.add(cm)
        }
      }

      await db.seller.update({
        where: { id: seller.id },
        data: {
          totalPropertiesOwned,
          totalPropertiesSoldToUs: totalDealsClosed,
          portfolioMarkets: [...marketSet] as Prisma.InputJsonValue,
          totalDealsWithUs: totalPropertiesOwned,
          totalDealsClosed,
          totalDealsWalked,
          closeRate,
          lastDealClosedDate,
          primaryEmotionMostFrequent,
          trustStepCurrent,
          trustStepArc: trustStepArc as unknown as Prisma.InputJsonValue,
          trustScore,
          voiceEnergyTrend,
          competitorsMentionedByName: [...competitors] as Prisma.InputJsonValue,
          dealkillersRaised: [...dealkillers] as Prisma.InputJsonValue,
        },
      })

      results.push({ id: seller.id, status: 'updated' })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`[Aggregates] Seller ${seller.id} failed: ${reason}`)
      results.push({ id: seller.id, status: 'error', reason })
    }
  }

  return results
}

async function computeBuyerAggregates(): Promise<BuyerResult[]> {
  const buyers = await db.buyer.findMany({
    select: { id: true, tenantId: true },
  })

  const results: BuyerResult[] = []
  const ACCEPTED_STAGES = new Set(['accepted', 'due_diligence', 'closed'])

  for (const buyer of buyers) {
    try {
      const stages = await db.propertyBuyerStage.findMany({
        where: { buyerId: buyer.id },
        select: {
          offerAmount: true,
          offerWithdrawnAt: true,
          dealStageOnProperty: true,
        },
      })

      const offersSentCount = stages.filter(s => s.offerAmount != null).length
      const offersAcceptedCount = stages.filter(
        s => s.dealStageOnProperty != null && ACCEPTED_STAGES.has(s.dealStageOnProperty),
      ).length
      const closedCount = stages.filter(s => s.dealStageOnProperty === 'closed').length

      // "Dropped after UC" = withdrew after reaching at least under_offer/accepted
      const droppedAfterUcCount = stages.filter(s =>
        s.offerWithdrawnAt != null &&
        (s.dealStageOnProperty === 'under_offer' || s.dealStageOnProperty === 'accepted'),
      ).length

      const conversionRateSentToAccepted =
        offersSentCount > 0 ? offersAcceptedCount / offersSentCount : null
      const conversionRateAcceptedToClosed =
        offersAcceptedCount > 0 ? closedCount / offersAcceptedCount : null

      await db.buyer.update({
        where: { id: buyer.id },
        data: {
          offersSentCount,
          offersAcceptedCount,
          conversionRateSentToAccepted,
          conversionRateAcceptedToClosed,
          droppedAfterUcCount,
        },
      })

      results.push({ id: buyer.id, status: 'updated' })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`[Aggregates] Buyer ${buyer.id} failed: ${reason}`)
      results.push({ id: buyer.id, status: 'error', reason })
    }
  }

  return results
}

// Session 67 Phase 2 close — Partner cross-portfolio counters. Reads
// PropertyPartner rows and aggregates per-partner counts based on the
// per-deal `role` value. Idempotent: writes are absolute counts each
// run, not increments, so re-runs converge to the right state.
//
// Role → counter mapping:
//   sourced_to_us            → dealsSourcedToUsCount
//   taking_to_clients,
//   we_sold_them_this        → dealsTakenFromUsCount
//   sold_us_this             → dealsSourcedToUsCount (treat wholesaler
//                              who sold us a contract as a source)
//   jv_partner               → jvHistoryCount
//   (any role) + property
//   status in CLOSED_STATUSES → dealsClosedWithUsCount
//
// Plus lastDealDate — the most recent createdAt across this partner's
// PropertyPartner rows where the property is closed.
interface PartnerResult {
  id: string
  status: 'updated' | 'error'
  reason?: string
}

async function computePartnerAggregates(): Promise<PartnerResult[]> {
  const partners = await db.partner.findMany({ select: { id: true, tenantId: true } })
  const results: PartnerResult[] = []

  for (const partner of partners) {
    try {
      const links = await db.propertyPartner.findMany({
        where: { partnerId: partner.id },
        select: {
          role: true,
          createdAt: true,
          property: { select: { status: true } },
        },
      })

      let dealsSourcedToUsCount = 0
      let dealsTakenFromUsCount = 0
      let dealsClosedWithUsCount = 0
      let jvHistoryCount = 0
      let lastDealDate: Date | null = null

      for (const l of links) {
        const role = l.role
        if (role === 'sourced_to_us' || role === 'sold_us_this') dealsSourcedToUsCount++
        else if (role === 'taking_to_clients' || role === 'we_sold_them_this') dealsTakenFromUsCount++
        else if (role === 'jv_partner') jvHistoryCount++

        if (l.property?.status && CLOSED_STATUSES.has(l.property.status)) {
          dealsClosedWithUsCount++
          if (!lastDealDate || l.createdAt > lastDealDate) lastDealDate = l.createdAt
        }
      }

      await db.partner.update({
        where: { id: partner.id },
        data: {
          dealsSourcedToUsCount,
          dealsTakenFromUsCount,
          dealsClosedWithUsCount,
          jvHistoryCount,
          lastDealDate,
        },
      })

      results.push({ id: partner.id, status: 'updated' })
    } catch (err) {
      results.push({
        id: partner.id,
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

async function main() {
  const startedAt = Date.now()
  console.log('[Aggregates] Starting nightly aggregate computation...')

  const sellerResults = await computeSellerAggregates()
  const buyerResults = await computeBuyerAggregates()
  const partnerResults = await computePartnerAggregates()

  const sellerUpdated = sellerResults.filter(r => r.status === 'updated').length
  const sellerErrors = sellerResults.filter(r => r.status === 'error').length
  const buyerUpdated = buyerResults.filter(r => r.status === 'updated').length
  const buyerErrors = buyerResults.filter(r => r.status === 'error').length
  const partnerUpdated = partnerResults.filter(r => r.status === 'updated').length
  const partnerErrors = partnerResults.filter(r => r.status === 'error').length

  const durationMs = Date.now() - startedAt
  const summary = {
    sellerUpdated,
    sellerErrors,
    buyerUpdated,
    buyerErrors,
    partnerUpdated,
    partnerErrors,
    durationMs,
  }

  console.log(`[Aggregates] Done in ${Math.round(durationMs / 1000)}s: ${JSON.stringify(summary)}`)

  // Audit log — landing a single row per run for traceability.
  try {
    const anyTenant = await db.tenant.findFirst({ select: { id: true } })
    if (anyTenant) {
      await db.auditLog.create({
        data: {
          tenantId: anyTenant.id,
          action: 'cron.compute_aggregates.finished',
          resource: 'system',
          payload: summary as unknown as Prisma.InputJsonValue,
          source: 'SYSTEM',
        },
      })
    }
  } catch (err) {
    console.error('[Aggregates] Audit log write failed:', err instanceof Error ? err.message : err)
  }
}

main()
  .catch(err => {
    console.error('[Aggregates] Fatal error:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
