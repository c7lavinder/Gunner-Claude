// lib/ai/context-builder.ts
// Central context builder — assembles full knowledge context for any AI call
// Used by: grading, coaching, assistant, deal intel, next steps
// Pulls from: knowledge_documents, user_profiles, tenant config, property data, call history

import { db } from '@/lib/db/client'

export interface GradingContext {
  // Company knowledge
  companyOverview: string | null
  gradingMethodology: string | null
  companyStandards: string | null

  // Role + call type specific
  scripts: string[]           // scripts matching this call type + role
  objectionHandling: string[] // objection docs matching this call type + role
  trainingMaterials: string[] // training docs matching this call type + role
  industryKnowledge: string[] // industry docs matching this call type + role

  // User performance profile
  userProfile: {
    strengths: string[]
    weaknesses: string[]
    commonMistakes: string[]
    communicationStyle: string | null
    coachingPriorities: string[]
    totalCallsGraded: number
  } | null

  // Cross-call context for this contact
  priorCalls: Array<{
    calledAt: string
    score: number | null
    aiSummary: string | null
    callOutcome: string | null
    callType: string | null
    assignedToName: string | null
  }>

  // Deal intel accumulated from prior calls
  dealIntelSummary: string | null

  // Calibration calls (good/bad examples)
  calibrationExamples: Array<{
    type: 'good' | 'bad'
    score: number | null
    summary: string | null
    notes: string | null
  }>

  // Recent feedback corrections
  feedbackCorrections: string | null
}

export async function buildGradingContext(params: {
  tenantId: string
  userId?: string          // the rep being graded
  callType?: string | null
  userRole?: string | null
  contactId?: string | null // GHL contact ID for cross-call context
  propertyId?: string | null
}): Promise<GradingContext> {
  const { tenantId, userId, callType, userRole, contactId, propertyId } = params

  // ── Fetch all knowledge in parallel ──
  const [
    allDocs,
    tenant,
    userProfileRecord,
    priorCallsRaw,
    propertyData,
    calibrationCalls,
    recentFeedback,
  ] = await Promise.all([
    // All active knowledge documents for this tenant
    db.knowledgeDocument.findMany({
      where: { tenantId, isActive: true },
      select: { title: true, type: true, callType: true, role: true, content: true },
    }),

    // Tenant config
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { companyStandards: true, scripts: true, calibrationCalls: true },
    }),

    // User performance profile
    userId ? db.userProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    }) : null,

    // Prior calls with this contact (last 10)
    contactId ? db.call.findMany({
      where: { tenantId, ghlContactId: contactId, gradingStatus: 'COMPLETED' },
      orderBy: { calledAt: 'desc' },
      take: 10,
      select: {
        calledAt: true, score: true, aiSummary: true, callOutcome: true, callType: true,
        assignedTo: { select: { name: true } },
      },
    }) : [],

    // Property deal intel
    propertyId ? db.property.findUnique({
      where: { id: propertyId },
      select: { dealIntel: true, sellerMotivation: true, sellerTimeline: true, propertyCondition: true, sellerAskingReason: true },
    }) : null,

    // Calibration calls
    db.call.findMany({
      where: { tenantId, isCalibration: true },
      select: { score: true, aiSummary: true, calibrationNotes: true, isCalibration: true },
      take: 10,
    }),

    // Recent feedback corrections (last 30 days)
    db.auditLog.findMany({
      where: {
        tenantId,
        action: 'call.feedback',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { payload: true },
    }),
  ])

  // ── Filter knowledge documents by relevance ──

  // Company overview + grading methodology (type=standard, role=ALL)
  const companyOverview = allDocs.find(d => d.title.includes('Company Overview'))?.content ?? null
  const gradingMethodology = allDocs.find(d => d.title.includes('AI Grading Methodology'))?.content ?? null

  // Scripts matching call type + role
  const scripts = allDocs
    .filter(d => d.type === 'script' && matchesCallTypeOrRole(d, callType, userRole))
    .map(d => `### ${d.title}\n${d.content}`)

  // Objection handling matching call type + role
  const objectionHandling = allDocs
    .filter(d => d.type === 'objection' && matchesCallTypeOrRole(d, callType, userRole))
    .map(d => `### ${d.title}\n${d.content}`)

  // Training materials matching call type + role
  const trainingMaterials = allDocs
    .filter(d => d.type === 'training' && matchesCallTypeOrRole(d, callType, userRole))
    .map(d => `### ${d.title}\n${d.content}`)

  // Industry knowledge (always included, filtered by role if possible)
  const industryKnowledge = allDocs
    .filter(d => d.type === 'industry' && (d.role === 'ALL' || d.role === userRole || !d.role))
    .map(d => `### ${d.title}\n${d.content}`)

  // ── Build user profile context ──
  const userProfile = userProfileRecord ? {
    strengths: (userProfileRecord.strengths as string[]) ?? [],
    weaknesses: (userProfileRecord.weaknesses as string[]) ?? [],
    commonMistakes: (userProfileRecord.commonMistakes as string[]) ?? [],
    communicationStyle: userProfileRecord.communicationStyle,
    coachingPriorities: (userProfileRecord.coachingPriorities as string[]) ?? [],
    totalCallsGraded: userProfileRecord.totalCallsGraded,
  } : null

  // ── Build cross-call context ──
  const priorCalls = priorCallsRaw.map(c => ({
    calledAt: c.calledAt?.toISOString() ?? '',
    score: c.score,
    aiSummary: c.aiSummary,
    callOutcome: c.callOutcome,
    callType: c.callType,
    assignedToName: c.assignedTo?.name ?? null,
  }))

  // ── Build deal intel summary ──
  let dealIntelSummary: string | null = null
  if (propertyData?.dealIntel) {
    const intel = propertyData.dealIntel as Record<string, { value?: unknown }>
    const rollingDeal = intel.rollingDealSummary?.value
    if (rollingDeal) dealIntelSummary = String(rollingDeal)
    // Add key fields
    const keyFields = ['sellerMotivationLevel', 'timelineUrgency', 'decisionMakersConfirmed', 'competingOfferCount', 'dealHealthScore']
    const extras = keyFields
      .filter(f => intel[f]?.value != null)
      .map(f => `${f}: ${intel[f].value}`)
    if (extras.length > 0) dealIntelSummary = (dealIntelSummary ?? '') + '\n' + extras.join(' | ')
  }

  // ── Calibration examples ──
  const tenantCalibration = (tenant?.calibrationCalls ?? []) as Array<{ callId: string; type: string; notes: string }>
  const calibrationExamples = calibrationCalls.map(c => ({
    type: 'good' as const, // TODO: cross-reference with tenant.calibrationCalls
    score: c.score,
    summary: c.aiSummary,
    notes: c.calibrationNotes,
  }))

  // ── Feedback corrections ──
  const feedbackCorrections = recentFeedback.length > 0
    ? recentFeedback.map(f => {
        const p = f.payload as { type?: string; details?: string } | null
        return p ? `- ${p.type}: ${p.details}` : null
      }).filter(Boolean).join('\n')
    : null

  return {
    companyOverview,
    gradingMethodology,
    companyStandards: tenant?.companyStandards ?? null,
    scripts,
    objectionHandling,
    trainingMaterials,
    industryKnowledge,
    userProfile,
    priorCalls,
    dealIntelSummary,
    calibrationExamples,
    feedbackCorrections,
  }
}

function matchesCallTypeOrRole(
  doc: { callType: string | null; role: string | null },
  callType: string | null | undefined,
  userRole: string | null | undefined,
): boolean {
  // If doc has no filters, it matches everything
  if (!doc.callType && !doc.role) return true
  if (!doc.callType && doc.role === 'ALL') return true

  // Match by call type
  if (doc.callType && callType && doc.callType === callType) return true

  // Match by role
  if (doc.role && doc.role !== 'ALL' && userRole && doc.role === userRole) return true

  // ALL role docs always match
  if (doc.role === 'ALL' && (!doc.callType || doc.callType === callType)) return true

  return false
}
