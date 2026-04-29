// lib/computed-metrics.ts
// Computed metrics for a property — all derived from existing data, no API calls.
// These are calculated on demand (real-time) rather than cached.

import { db } from '@/lib/db/client'

export interface PropertyMetrics {
  // Engagement
  leadAge: number                    // days since property created
  speedToFirstContact: number | null // minutes from creation to first call
  totalCallCount: number
  outboundCallCount: number
  inboundCallCount: number
  voicemailCount: number             // calls with 0 duration
  contactAttemptsVsMade: { attempts: number; contacts: number } // dial vs answer
  daysSinceLastContact: number | null
  appointmentHistory: { set: number; completed: number; noShowed: number }
  daysInCurrentStage: number | null
  sentimentTrajectory: number[]      // last N sentiment scores
  callScoreTrend: number[]           // last N call scores
  avgCallScore: number | null

  // Financial computed
  mao: number | null                 // ARV * 0.7 - repairEstimate
  equityEstimate: number | null      // estimatedValue - mortgageBalance
  negotiationGap: number | null      // askingPrice - latestOffer
  zestimateVsARV: number | null      // % difference
  taxAssessmentVsARV: number | null  // % difference
}

export async function computePropertyMetrics(
  propertyId: string,
  tenantId: string,
): Promise<PropertyMetrics> {
  // Scoped on tenantId — caller is no longer load-bearing for tenant boundary.
  const property = await db.property.findFirst({
    where: { id: propertyId, tenantId },
    select: {
      createdAt: true,
      arv: true, askingPrice: true, offerPrice: true,
      repairEstimate: true, taxAssessment: true,
      zillowData: true, dealIntel: true,
      ghlContactId: true,
    },
  })

  if (!property) throw new Error(`Property ${propertyId} not found`)

  const now = new Date()

  // ── Call data ──────────────────────────────────────────────────────────
  const calls = await db.call.findMany({
    where: { tenantId, ghlContactId: property.ghlContactId ?? undefined },
    select: {
      calledAt: true, direction: true, durationSeconds: true,
      score: true, sentiment: true, gradingStatus: true,
    },
    orderBy: { calledAt: 'asc' },
  })

  const outbound = calls.filter(c => c.direction === 'OUTBOUND')
  const inbound = calls.filter(c => c.direction === 'INBOUND')
  const voicemails = calls.filter(c => c.durationSeconds === null || c.durationSeconds === 0)
  const contacts = calls.filter(c => c.durationSeconds != null && c.durationSeconds > 0)

  const leadAge = Math.floor((now.getTime() - property.createdAt.getTime()) / (1000 * 60 * 60 * 24))

  const firstCall = calls[0]
  const speedToFirstContact = firstCall?.calledAt
    ? Math.round((firstCall.calledAt.getTime() - property.createdAt.getTime()) / (1000 * 60))
    : null

  const lastCall = calls[calls.length - 1]
  const daysSinceLastContact = lastCall?.calledAt
    ? Math.floor((now.getTime() - lastCall.calledAt.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Milestone-based metrics
  const milestones = await db.propertyMilestone.findMany({
    where: { propertyId, tenantId },
    orderBy: { createdAt: 'asc' },
    select: { type: true, createdAt: true },
  })

  const lastMilestone = milestones[milestones.length - 1]
  const daysInCurrentStage = lastMilestone
    ? Math.floor((now.getTime() - lastMilestone.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : leadAge

  const aptSet = milestones.filter(m => m.type === 'APPOINTMENT_SET').length
  // APPOINTMENT_COMPLETED doesn't exist as milestone type — use presence of OFFER_MADE as proxy
  const aptCompleted = milestones.filter(m => m.type === 'OFFER_MADE').length
  const aptNoShowed = Math.max(0, aptSet - aptCompleted) // rough estimate

  const gradedCalls = calls.filter(c => c.gradingStatus === 'COMPLETED')
  const sentimentTrajectory = gradedCalls.filter(c => c.sentiment != null).map(c => c.sentiment!).slice(-10)
  const callScoreTrend = gradedCalls.filter(c => c.score != null).map(c => c.score!).slice(-10)
  const avgCallScore = callScoreTrend.length > 0
    ? Math.round(callScoreTrend.reduce((a, b) => a + b, 0) / callScoreTrend.length)
    : null

  // ── Financial computed ─────────────────────────────────────────────────
  const arv = property.arv ? Number(property.arv) : null
  const repair = property.repairEstimate ? Number(property.repairEstimate) : null
  const mao = arv && repair != null ? Math.round(arv * 0.7 - repair) : null

  const batchData = ((property.zillowData as Record<string, unknown>)?.batchData ?? {}) as Record<string, unknown>
  const estimatedValue = batchData.estimatedValue as number | undefined
  const mortgageAmount = batchData.mortgageAmount as number | undefined
  const dealIntel = (property.dealIntel ?? {}) as Record<string, unknown>
  const mentionedMortgage = (dealIntel.mortgageBalanceMentioned as { value?: number })?.value

  const mortgageBalance = mentionedMortgage ?? mortgageAmount ?? null
  const equityEstimate = estimatedValue && mortgageBalance != null
    ? Math.round(estimatedValue - mortgageBalance)
    : null

  const asking = property.askingPrice ? Number(property.askingPrice) : null
  const offer = property.offerPrice ? Number(property.offerPrice) : null
  const negotiationGap = asking && offer ? Math.round(asking - offer) : null

  const zestimateVsARV = estimatedValue && arv
    ? Math.round(((estimatedValue - arv) / arv) * 100)
    : null

  const taxAssess = property.taxAssessment ? Number(property.taxAssessment) : null
  const taxAssessmentVsARV = taxAssess && arv
    ? Math.round(((taxAssess - arv) / arv) * 100)
    : null

  return {
    leadAge,
    speedToFirstContact,
    totalCallCount: calls.length,
    outboundCallCount: outbound.length,
    inboundCallCount: inbound.length,
    voicemailCount: voicemails.length,
    contactAttemptsVsMade: { attempts: outbound.length, contacts: contacts.filter(c => c.direction === 'OUTBOUND').length },
    daysSinceLastContact,
    appointmentHistory: { set: aptSet, completed: aptCompleted, noShowed: aptNoShowed },
    daysInCurrentStage,
    sentimentTrajectory,
    callScoreTrend,
    avgCallScore,
    mao,
    equityEstimate,
    negotiationGap,
    zestimateVsARV,
    taxAssessmentVsARV,
  }
}
