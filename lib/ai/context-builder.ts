// lib/ai/context-builder.ts
// Central context builder — assembles full knowledge context for any AI call
// Used by: grading, coaching, assistant, deal intel, next steps
// Pulls from: knowledge_documents, user_profiles, tenant config, property data, call history

import { db } from '@/lib/db/client'
import { logFailure } from '@/lib/audit'

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

  // Recent call-type/outcome reclassifications (human overrides of AI judgment).
  // Feeds in-context learning — the grader sees recent corrections and adjusts.
  reclassificationCorrections: string | null
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
    recentReclassifications,
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
      select: { dealIntel: true, propertyCondition: true },
    }) : null,

    // Calibration calls
    db.call.findMany({
      where: { tenantId, isCalibration: true },
      select: { id: true, score: true, aiSummary: true, calibrationNotes: true, isCalibration: true },
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

    // Recent human reclassifications (last 60 days, capped at 20).
    // Scoped to the same call type as the call being graded when available —
    // reclassifications on other call types aren't relevant signal.
    db.callReclassification.findMany({
      where: {
        tenantId,
        createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
        ...(callType
          ? { OR: [{ previousCallType: callType }, { newCallType: callType }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        previousCallType: true,
        newCallType: true,
        previousCallOutcome: true,
        newCallOutcome: true,
        previousAiSummary: true,
      },
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
  const calibrationExamples = calibrationCalls.map(c => {
    const match = tenantCalibration.find(tc => tc.callId === c.id)
    return {
    type: (match?.type === 'bad' ? 'bad' : 'good') as 'good' | 'bad',
    score: c.score,
    summary: c.aiSummary,
    notes: c.calibrationNotes,
  }
  })

  // ── Feedback corrections ──
  const feedbackCorrections = recentFeedback.length > 0
    ? recentFeedback.map(f => {
        const p = f.payload as { type?: string; details?: string } | null
        return p ? `- ${p.type}: ${p.details}` : null
      }).filter(Boolean).join('\n')
    : null

  // ── Reclassification corrections ──
  // Group into "type was wrong" and "outcome was wrong" so the grader sees
  // patterns rather than raw events. Include the AI's prior summary for the
  // last few so the model can see WHY it was wrong, not just the flip.
  const reclassificationCorrections = (() => {
    if (recentReclassifications.length === 0) return null

    const typeFlips = recentReclassifications
      .filter(r => r.previousCallType && r.newCallType && r.previousCallType !== r.newCallType)
    const outcomeFlips = recentReclassifications
      .filter(r => r.previousCallOutcome && r.newCallOutcome && r.previousCallOutcome !== r.newCallOutcome)

    const lines: string[] = []

    if (typeFlips.length > 0) {
      lines.push('CALL-TYPE CORRECTIONS (human flipped AI classification):')
      // Count frequency so the grader sees which mistakes repeat
      const counts = new Map<string, number>()
      for (const f of typeFlips) {
        const k = `${f.previousCallType} → ${f.newCallType}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      for (const [k, n] of counts) lines.push(`- ${k}${n > 1 ? ` (x${n})` : ''}`)
    }

    if (outcomeFlips.length > 0) {
      if (lines.length) lines.push('')
      lines.push('OUTCOME CORRECTIONS (human overrode AI-predicted outcome):')
      const counts = new Map<string, number>()
      for (const f of outcomeFlips) {
        const k = `${f.previousCallOutcome} → ${f.newCallOutcome}`
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      for (const [k, n] of counts) lines.push(`- ${k}${n > 1 ? ` (x${n})` : ''}`)
    }

    // Up to 3 concrete before/after snippets so the model sees WHY it was wrong
    const withContext = recentReclassifications
      .filter(r => r.previousAiSummary && (r.newCallType || r.newCallOutcome))
      .slice(0, 3)
    if (withContext.length > 0) {
      lines.push('')
      lines.push('RECENT EXAMPLES:')
      for (const r of withContext) {
        const summary = (r.previousAiSummary ?? '').slice(0, 220).replace(/\s+/g, ' ').trim()
        const changes: string[] = []
        if (r.newCallType) changes.push(`type: ${r.previousCallType ?? '?'} → ${r.newCallType}`)
        if (r.newCallOutcome) changes.push(`outcome: ${r.previousCallOutcome ?? '?'} → ${r.newCallOutcome}`)
        lines.push(`- AI said: "${summary}" | Human corrected: ${changes.join('; ')}`)
      }
    }

    return lines.length > 0 ? lines.join('\n') : null
  })()

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
    reclassificationCorrections,
  }
}

// ── Lightweight knowledge context for non-grading touchpoints ──
// Used by: assistant, coach, next steps, deal intel, blast gen
// Loads relevant playbook docs filtered by role + optional call type
// Returns a single text block ready for prompt injection

export interface KnowledgeContext {
  companyOverview: string | null
  companyStandards: string | null
  scripts: string[]
  objectionHandling: string[]
  trainingMaterials: string[]
  industryKnowledge: string[]
  userProfile: {
    strengths: string[]
    weaknesses: string[]
    coachingPriorities: string[]
    communicationStyle: string | null
  } | null
}

export async function buildKnowledgeContext(params: {
  tenantId: string
  userId?: string
  userRole?: string | null
  callType?: string | null
  query?: string // Optional: semantic search query for pgvector
}): Promise<KnowledgeContext> {
  const { tenantId, userId, userRole, callType, query } = params

  // If query provided and embeddings enabled, use semantic search
  let semanticDocs: Array<{ title: string; type: string; callType: string | null; role: string | null; content: string }> = []
  if (query) {
    try {
      const { searchKnowledgeBySimilarity, isEmbeddingsEnabled } = await import('@/lib/ai/embeddings')
      if (isEmbeddingsEnabled()) {
        const results = await searchKnowledgeBySimilarity(tenantId, query, 8)
        semanticDocs = results.filter(r => r.similarity > 0.3) // Only include relevant results
      }
    } catch (err) {
      logFailure(tenantId, 'context_builder.semantic_search_failed', query, err)
    }
  }

  const [allDocs, tenant, userProfileRecord] = await Promise.all([
    db.knowledgeDocument.findMany({
      where: { tenantId, isActive: true },
      select: { title: true, type: true, callType: true, role: true, content: true },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { companyStandards: true },
    }),
    userId ? db.userProfile.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { strengths: true, weaknesses: true, coachingPriorities: true, communicationStyle: true },
    }) : null,
  ])

  // Merge semantic results with type-filtered results (dedup by title)
  const seenTitles = new Set<string>()
  const mergedScripts: string[] = []
  const mergedObjections: string[] = []
  const mergedTraining: string[] = []
  const mergedIndustry: string[] = []

  // Semantic results first (higher relevance)
  for (const doc of semanticDocs) {
    if (seenTitles.has(doc.title)) continue
    seenTitles.add(doc.title)
    const formatted = `### ${doc.title}\n${doc.content}`
    if (doc.type === 'script') mergedScripts.push(formatted)
    else if (doc.type === 'objection') mergedObjections.push(formatted)
    else if (doc.type === 'training') mergedTraining.push(formatted)
    else if (doc.type === 'industry') mergedIndustry.push(formatted)
  }

  // Then type-filtered results (standard matching)
  for (const d of allDocs.filter(d => d.type === 'script' && matchesCallTypeOrRole(d, callType, userRole))) {
    if (!seenTitles.has(d.title)) { seenTitles.add(d.title); mergedScripts.push(`### ${d.title}\n${d.content}`) }
  }
  for (const d of allDocs.filter(d => d.type === 'objection' && matchesCallTypeOrRole(d, callType, userRole))) {
    if (!seenTitles.has(d.title)) { seenTitles.add(d.title); mergedObjections.push(`### ${d.title}\n${d.content}`) }
  }
  for (const d of allDocs.filter(d => d.type === 'training' && matchesCallTypeOrRole(d, callType, userRole))) {
    if (!seenTitles.has(d.title)) { seenTitles.add(d.title); mergedTraining.push(`### ${d.title}\n${d.content}`) }
  }
  for (const d of allDocs.filter(d => d.type === 'industry' && (d.role === 'ALL' || d.role === userRole || !d.role))) {
    if (!seenTitles.has(d.title)) { seenTitles.add(d.title); mergedIndustry.push(`### ${d.title}\n${d.content}`) }
  }

  return {
    companyOverview: allDocs.find(d => d.title.includes('Company Overview'))?.content ?? null,
    companyStandards: tenant?.companyStandards ?? null,
    scripts: mergedScripts,
    objectionHandling: mergedObjections,
    trainingMaterials: mergedTraining,
    industryKnowledge: mergedIndustry,
    userProfile: userProfileRecord ? {
      strengths: (userProfileRecord.strengths as string[]) ?? [],
      weaknesses: (userProfileRecord.weaknesses as string[]) ?? [],
      coachingPriorities: (userProfileRecord.coachingPriorities as string[]) ?? [],
      communicationStyle: userProfileRecord.communicationStyle,
    } : null,
  }
}

// Format KnowledgeContext into a prompt section (capped at tokenBudget chars)
export function formatKnowledgeForPrompt(ctx: KnowledgeContext, tokenBudget = 6000): string {
  const sections: string[] = []
  let charCount = 0

  function addIfRoom(label: string, content: string) {
    if (charCount + content.length > tokenBudget) return
    sections.push(`${label}:\n${content}`)
    charCount += label.length + content.length + 2
  }

  if (ctx.companyOverview) addIfRoom('COMPANY OVERVIEW', ctx.companyOverview)
  if (ctx.companyStandards) addIfRoom('COMPANY STANDARDS', ctx.companyStandards)
  if (ctx.scripts.length > 0) addIfRoom('COMPANY SCRIPTS', ctx.scripts.slice(0, 2).join('\n\n'))
  if (ctx.objectionHandling.length > 0) addIfRoom('OBJECTION HANDLING', ctx.objectionHandling.slice(0, 2).join('\n\n'))
  if (ctx.trainingMaterials.length > 0) addIfRoom('TRAINING', ctx.trainingMaterials.slice(0, 2).join('\n\n'))
  if (ctx.industryKnowledge.length > 0) addIfRoom('INDUSTRY KNOWLEDGE', ctx.industryKnowledge.slice(0, 2).join('\n\n'))

  if (ctx.userProfile) {
    addIfRoom('USER PROFILE', [
      `Strengths: ${ctx.userProfile.strengths.join('; ')}`,
      `Areas for Growth: ${ctx.userProfile.weaknesses.join('; ')}`,
      `Coaching Focus: ${ctx.userProfile.coachingPriorities.join('; ')}`,
      ctx.userProfile.communicationStyle ? `Style: ${ctx.userProfile.communicationStyle}` : '',
    ].filter(Boolean).join('\n'))
  }

  return sections.join('\n\n')
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
