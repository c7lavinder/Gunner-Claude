// lib/ai/query-tools.ts
// The query layer for the Role Assistant — Phase B of the AI rebuild.
//
// PURPOSE
// -------
// Until this file existed, the assistant could only see the property/call
// it was currently on. It could not answer cross-entity questions like:
//   - "Show me properties where the rep hasn't called in 5 days and TCP > 0.6"
//   - "Which rep's grade dropped the most this week vs last?"
//   - "Find calls where the seller mentioned divorce"
//
// Each function here is one tool the assistant can invoke. They return
// structured JSON (the self-healing contract from CLAUDE.md Rule 4) so
// the LLM can narrate the data. The LLM does synthesis, the tools do
// retrieval. Standard agent pattern.
//
// CONTRACT — every tool returns:
//   { status: 'success' | 'error' | 'no_results',
//     data?: unknown,                // the payload
//     error?: string,                // human-readable error
//     suggestion?: string,           // what to try next
//     count?: number }               // how many rows matched
//
// All queries are tenant-scoped. Every db call includes `tenantId` in
// the where clause. Hard limits everywhere (default 25, cap 100) to keep
// payloads small enough for Claude's context and to prevent
// pathologically expensive queries.

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'

// ── Shared types ─────────────────────────────────────────────────────────

export interface ToolResult<T = unknown> {
  status: 'success' | 'error' | 'no_results'
  data?: T
  error?: string
  suggestion?: string
  count?: number
}

function ok<T>(data: T, count?: number): ToolResult<T> {
  return { status: 'success', data, count: count ?? (Array.isArray(data) ? data.length : undefined) }
}

function empty(suggestion?: string): ToolResult<never[]> {
  return { status: 'no_results', data: [], count: 0, suggestion }
}

function err(message: string, suggestion?: string): ToolResult {
  return { status: 'error', error: message, suggestion }
}

// Clamp a user-supplied limit to a sane range. AI sometimes hallucinates
// huge limits — cap them server-side.
function clampLimit(n: unknown, def = 25, cap = 100): number {
  const v = typeof n === 'number' ? n : parseInt(String(n ?? def), 10)
  if (!Number.isFinite(v) || v <= 0) return def
  return Math.min(Math.floor(v), cap)
}

// Convert a Prisma Decimal (or string/null) to a plain number for JSON.
// Avoids surfacing Decimal serialization to the LLM, which sees garbage
// like "Decimal { s: 1, e: 5, d: [...] }" if you pass the raw object.
function toNum(v: Prisma.Decimal | number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : null
}

// ── Date helpers ─────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function parseDate(s: unknown): Date | null {
  if (!s) return null
  const d = new Date(String(s))
  return Number.isNaN(d.getTime()) ? null : d
}

// ── 1. query_properties ──────────────────────────────────────────────────
// Filter inventory by status, ARV range, equity, source, days since last
// contact, TCP score, market, project type. The single biggest unlock —
// turns "show me cold leads worth chasing" into one tool call.

export interface QueryPropertiesArgs {
  acqStatus?: string
  dispoStatus?: string
  longtermStatus?: string
  arvMin?: number
  arvMax?: number
  askingPriceMax?: number
  tcpMin?: number
  daysSinceLastContactMin?: number   // "haven't been touched in N days"
  daysSinceLastContactMax?: number
  leadSource?: string
  city?: string
  state?: string
  marketName?: string
  assignedToName?: string
  hasOffer?: boolean                  // currentOffer is non-null
  excludeLost?: boolean               // default true; drop dispo/acq-lost lanes
  limit?: number
  sortBy?: 'tcp' | 'arv' | 'lastContact' | 'createdAt'
  sortDir?: 'asc' | 'desc'
}

export async function queryProperties(tenantId: string, args: QueryPropertiesArgs): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25, 100)
  const excludeLost = args.excludeLost !== false // default true

  const where: Prisma.PropertyWhereInput = { tenantId }
  if (args.acqStatus) where.acqStatus = args.acqStatus as Prisma.PropertyWhereInput['acqStatus']
  if (args.dispoStatus) where.dispoStatus = args.dispoStatus as Prisma.PropertyWhereInput['dispoStatus']
  if (args.longtermStatus) where.longtermStatus = args.longtermStatus as Prisma.PropertyWhereInput['longtermStatus']
  if (args.city) where.city = { contains: args.city, mode: 'insensitive' }
  if (args.state) where.state = { equals: args.state, mode: 'insensitive' }
  if (args.leadSource) where.leadSource = { contains: args.leadSource, mode: 'insensitive' }
  if (args.hasOffer) where.currentOffer = { not: null }

  // ARV range
  const arvFilter: Prisma.DecimalNullableFilter = {}
  if (typeof args.arvMin === 'number') arvFilter.gte = args.arvMin
  if (typeof args.arvMax === 'number') arvFilter.lte = args.arvMax
  if (Object.keys(arvFilter).length > 0) where.arv = arvFilter

  if (typeof args.askingPriceMax === 'number') where.askingPrice = { lte: args.askingPriceMax }
  if (typeof args.tcpMin === 'number') where.tcpScore = { gte: args.tcpMin }

  // Last-contact window. Both bounds expressed as "days since" — a min
  // of 5 means "at least 5 days since contact", so lastContactedDate is
  // older than 5 days ago.
  if (typeof args.daysSinceLastContactMin === 'number' && args.daysSinceLastContactMin > 0) {
    where.lastContactedDate = { ...(where.lastContactedDate as object ?? {}), lte: daysAgo(args.daysSinceLastContactMin) }
  }
  if (typeof args.daysSinceLastContactMax === 'number' && args.daysSinceLastContactMax > 0) {
    where.lastContactedDate = { ...(where.lastContactedDate as object ?? {}), gte: daysAgo(args.daysSinceLastContactMax) }
  }

  if (excludeLost) {
    // OR not directly possible on three nullable lostAt cols — express as
    // "all three must be null OR this property has at least one non-lost lane"
    // For simplicity: just exclude properties where ALL three lanes are lost.
    // Properties with one lost lane but active other lanes still appear.
    where.AND = [
      { OR: [
        { acqLostAt: null },
        { dispoLostAt: null },
        { longtermLostAt: null },
      ] },
    ]
  }

  // Market name → marketId join
  if (args.marketName) {
    const market = await db.market.findFirst({ where: { tenantId, name: { contains: args.marketName, mode: 'insensitive' } } })
    if (market) where.marketId = market.id
    else return empty(`No market named "${args.marketName}" found in your tenant.`)
  }

  // Assigned user name → assignedToId join
  if (args.assignedToName) {
    const user = await db.user.findFirst({ where: { tenantId, name: { contains: args.assignedToName, mode: 'insensitive' } } })
    if (user) where.assignedToId = user.id
    else return empty(`No team member named "${args.assignedToName}" found.`)
  }

  // Sort
  let orderBy: Prisma.PropertyOrderByWithRelationInput = { createdAt: 'desc' }
  const dir = args.sortDir === 'asc' ? 'asc' : 'desc'
  if (args.sortBy === 'tcp') orderBy = { tcpScore: dir }
  else if (args.sortBy === 'arv') orderBy = { arv: dir }
  else if (args.sortBy === 'lastContact') orderBy = { lastContactedDate: dir }

  const rows = await db.property.findMany({
    where,
    orderBy,
    take: limit,
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      acqStatus: true, dispoStatus: true, longtermStatus: true,
      arv: true, askingPrice: true, currentOffer: true, mao: true,
      tcpScore: true, leadSource: true,
      lastContactedDate: true, lastOfferDate: true,
      assignedTo: { select: { name: true } },
      market: { select: { name: true } },
    },
  })

  if (rows.length === 0) return empty('Try widening the filters — no properties matched.')

  return ok(rows.map(r => ({
    id: r.id,
    address: `${r.address}, ${r.city}, ${r.state} ${r.zip}`,
    acqStatus: r.acqStatus,
    dispoStatus: r.dispoStatus,
    longtermStatus: r.longtermStatus,
    arv: toNum(r.arv),
    askingPrice: toNum(r.askingPrice),
    currentOffer: toNum(r.currentOffer),
    mao: toNum(r.mao),
    tcpScore: r.tcpScore,
    leadSource: r.leadSource,
    lastContactedDate: r.lastContactedDate?.toISOString().slice(0, 10) ?? null,
    lastOfferDate: r.lastOfferDate?.toISOString().slice(0, 10) ?? null,
    assignedTo: r.assignedTo?.name ?? null,
    market: r.market?.name ?? null,
  })))
}

// ── 2. search_calls ──────────────────────────────────────────────────────
// Find calls by date range, rep, grade band, call type, outcome, contact
// fragment, property fragment. Read-only: returns metadata + short summary.

export interface SearchCallsArgs {
  dateFrom?: string                    // ISO date
  dateTo?: string
  daysAgo?: number                     // shortcut: dateFrom = N days ago
  repName?: string
  gradeBand?: 'low' | 'medium' | 'high' // <60, 60-80, >80
  scoreMin?: number
  scoreMax?: number
  callType?: string
  callOutcome?: string
  contactNameFragment?: string
  propertyAddressFragment?: string
  primaryEmotion?: string
  hasObjection?: boolean              // returned only if objections array non-empty
  limit?: number
}

export async function searchCalls(tenantId: string, args: SearchCallsArgs): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25, 100)

  const where: Prisma.CallWhereInput = { tenantId }
  const calledAtFilter: Prisma.DateTimeNullableFilter = {}

  if (args.dateFrom) {
    const d = parseDate(args.dateFrom)
    if (d) calledAtFilter.gte = d
  }
  if (args.dateTo) {
    const d = parseDate(args.dateTo)
    if (d) calledAtFilter.lte = d
  }
  if (typeof args.daysAgo === 'number' && args.daysAgo > 0) {
    calledAtFilter.gte = daysAgo(args.daysAgo)
  }
  if (Object.keys(calledAtFilter).length > 0) where.calledAt = calledAtFilter

  if (args.callType) where.callType = args.callType
  if (args.callOutcome) where.callOutcome = args.callOutcome
  if (args.primaryEmotion) where.callPrimaryEmotion = args.primaryEmotion
  if (args.contactNameFragment) where.contactName = { contains: args.contactNameFragment, mode: 'insensitive' }
  if (args.propertyAddressFragment) {
    where.property = { is: { address: { contains: args.propertyAddressFragment, mode: 'insensitive' } } }
  }

  // Score band
  if (args.gradeBand === 'low') where.score = { lt: 60 }
  else if (args.gradeBand === 'medium') where.score = { gte: 60, lt: 80 }
  else if (args.gradeBand === 'high') where.score = { gte: 80 }
  if (typeof args.scoreMin === 'number') where.score = { ...(where.score as object ?? {}), gte: args.scoreMin }
  if (typeof args.scoreMax === 'number') where.score = { ...(where.score as object ?? {}), lte: args.scoreMax }

  if (args.repName) {
    const user = await db.user.findFirst({ where: { tenantId, name: { contains: args.repName, mode: 'insensitive' } } })
    if (user) where.assignedToId = user.id
    else return empty(`No team member named "${args.repName}" found.`)
  }

  const rows = await db.call.findMany({
    where,
    orderBy: { calledAt: 'desc' },
    take: limit,
    select: {
      id: true, contactName: true, callType: true, callOutcome: true,
      score: true, sentiment: true, durationSeconds: true,
      calledAt: true, gradingStatus: true,
      aiSummary: true, callPrimaryEmotion: true, callTrustStep: true,
      objections: true,
      assignedTo: { select: { name: true } },
      property: { select: { id: true, address: true, city: true, state: true } },
    },
  })

  if (rows.length === 0) return empty('Try widening the date range or removing a filter.')

  let filtered = rows
  if (args.hasObjection) {
    filtered = rows.filter(r => Array.isArray(r.objections) && r.objections.length > 0)
    if (filtered.length === 0) return empty('No calls in range had objections recorded.')
  }

  return ok(filtered.map(r => ({
    id: r.id,
    contactName: r.contactName,
    callType: r.callType,
    callOutcome: r.callOutcome,
    score: r.score,
    sentiment: r.sentiment,
    durationSeconds: r.durationSeconds,
    calledAt: r.calledAt?.toISOString() ?? null,
    gradingStatus: r.gradingStatus,
    aiSummary: r.aiSummary?.slice(0, 240) ?? null,
    primaryEmotion: r.callPrimaryEmotion,
    trustStep: r.callTrustStep,
    objectionCount: Array.isArray(r.objections) ? r.objections.length : 0,
    rep: r.assignedTo?.name ?? null,
    property: r.property ? { id: r.property.id, address: `${r.property.address}, ${r.property.city}, ${r.property.state}` } : null,
  })))
}

// ── 3. semantic_search_calls ─────────────────────────────────────────────
// Vector search over call transcripts. Requires the embedding column to
// exist (Phase D schema migration) AND OPENAI_API_KEY. Returns a clear
// "not yet available" signal if either is missing — the LLM can then
// fall back to search_calls with topic keywords.

export async function semanticSearchCalls(
  tenantId: string,
  args: { query: string; limit?: number; daysAgo?: number },
): Promise<ToolResult> {
  if (!args.query?.trim()) return err('A query string is required.', 'Try: "calls where seller mentioned divorce"')
  if (!process.env.OPENAI_API_KEY) {
    return err(
      'Semantic call search is not yet enabled on this tenant.',
      'Use search_calls with date range or contactNameFragment instead, then read aiSummary fields.',
    )
  }
  const limit = clampLimit(args.limit, 10, 25)

  // Lazy-load embeddings module so the rest of this file does not depend
  // on it (and tsc stays happy even if the OpenAI key is missing).
  const { generateQueryEmbedding } = await import('./embeddings-query')
  const queryEmbedding = await generateQueryEmbedding(args.query)
  if (!queryEmbedding) return err('Failed to generate query embedding.', 'Check OPENAI_API_KEY config.')

  const vectorStr = `[${queryEmbedding.join(',')}]`
  const sinceClause = args.daysAgo && args.daysAgo > 0
    ? `AND called_at >= NOW() - INTERVAL '${Math.floor(args.daysAgo)} days'`
    : ''

  try {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string; contact_name: string | null; called_at: Date | null;
      call_outcome: string | null; score: number | null; ai_summary: string | null;
      similarity: number;
    }>>(
      `SELECT id, contact_name, called_at, call_outcome, score, ai_summary,
              1 - (transcript_embedding <=> $1::vector) as similarity
       FROM calls
       WHERE tenant_id = $2
         AND transcript_embedding IS NOT NULL
         ${sinceClause}
       ORDER BY transcript_embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      tenantId,
      limit,
    )

    if (rows.length === 0) {
      return empty('No calls have been embedded yet for this tenant. Run scripts/embed-calls-backfill.ts.')
    }

    return ok(rows.map(r => ({
      id: r.id,
      contactName: r.contact_name,
      calledAt: r.called_at?.toISOString() ?? null,
      callOutcome: r.call_outcome,
      score: r.score,
      summary: r.ai_summary?.slice(0, 240) ?? null,
      similarity: Number(r.similarity),
    })))
  } catch (e) {
    // Most likely cause: the transcript_embedding column doesn't exist yet
    // because the Phase D migration hasn't been applied. Surface that
    // helpfully — the LLM will tell the user to run the migration.
    return err(
      'Call transcript embeddings are not yet available.',
      'Apply the Phase D migration (transcript_embedding vector column) and run scripts/embed-calls-backfill.ts. Falling back to search_calls is fine.',
    )
  }
}

// ── 4. query_tasks ────────────────────────────────────────────────────────

export interface QueryTasksArgs {
  status?: string                   // PENDING | IN_PROGRESS | COMPLETED | CANCELLED
  priority?: string                 // LOW | MEDIUM | HIGH | URGENT
  assignedToName?: string
  overdue?: boolean                 // dueAt < now AND status != COMPLETED
  dueWithinDays?: number
  propertyAddressFragment?: string
  limit?: number
}

export async function queryTasks(tenantId: string, args: QueryTasksArgs): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25, 100)

  const where: Prisma.TaskWhereInput = { tenantId }
  if (args.status) where.status = args.status as Prisma.TaskWhereInput['status']
  if (args.priority) where.priority = args.priority as Prisma.TaskWhereInput['priority']
  if (args.overdue) {
    where.dueAt = { lt: new Date() }
    where.status = { not: 'COMPLETED' }
  }
  if (typeof args.dueWithinDays === 'number' && args.dueWithinDays > 0) {
    where.dueAt = { ...(where.dueAt as object ?? {}), gte: new Date(), lte: daysAgo(-args.dueWithinDays) }
  }
  if (args.propertyAddressFragment) {
    where.property = { is: { address: { contains: args.propertyAddressFragment, mode: 'insensitive' } } }
  }
  if (args.assignedToName) {
    const user = await db.user.findFirst({ where: { tenantId, name: { contains: args.assignedToName, mode: 'insensitive' } } })
    if (user) where.assignedToId = user.id
    else return empty(`No team member named "${args.assignedToName}" found.`)
  }

  const rows = await db.task.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
    take: limit,
    select: {
      id: true, title: true, description: true, status: true, priority: true,
      dueAt: true, category: true,
      assignedTo: { select: { name: true } },
      property: { select: { id: true, address: true, city: true } },
    },
  })

  if (rows.length === 0) return empty('No tasks matched these filters.')

  return ok(rows.map(r => ({
    id: r.id, title: r.title,
    description: r.description?.slice(0, 200) ?? null,
    status: r.status, priority: r.priority, category: r.category,
    dueAt: r.dueAt?.toISOString() ?? null,
    overdue: r.dueAt ? r.dueAt < new Date() && r.status !== 'COMPLETED' : false,
    assignedTo: r.assignedTo?.name ?? null,
    property: r.property ? { id: r.property.id, address: `${r.property.address}, ${r.property.city}` } : null,
  })))
}

// ── 5. get_kpi_metrics ────────────────────────────────────────────────────
// Live deltas for the asks "how am I/the team doing this week vs last?"
// Computed from raw tables — does not require KpiSnapshot to be current.

export interface GetKpiMetricsArgs {
  period?: 'week' | 'month'         // default 'week'
  repName?: string                  // null = whole tenant
}

export async function getKpiMetrics(tenantId: string, args: GetKpiMetricsArgs): Promise<ToolResult> {
  const period = args.period ?? 'week'
  const days = period === 'week' ? 7 : 30

  const now = new Date()
  const currentStart = startOfDay(daysAgo(days))
  const priorStart = startOfDay(daysAgo(days * 2))
  const priorEnd = currentStart

  const callWhere: Prisma.CallWhereInput = { tenantId }
  const taskWhere: Prisma.TaskWhereInput = { tenantId }
  const propWhere: Prisma.PropertyWhereInput = { tenantId }

  if (args.repName) {
    const user = await db.user.findFirst({ where: { tenantId, name: { contains: args.repName, mode: 'insensitive' } } })
    if (!user) return empty(`No team member named "${args.repName}" found.`)
    callWhere.assignedToId = user.id
    taskWhere.assignedToId = user.id
    propWhere.assignedToId = user.id
  }

  // Calls — current vs prior
  const [callsCurrent, callsPrior, avgScoreCurrent, avgScorePrior, appointmentsCurrent, appointmentsPrior,
    contractsCurrent, contractsPrior, tasksCompletedCurrent, tasksCompletedPrior] = await Promise.all([
      db.call.count({ where: { ...callWhere, calledAt: { gte: currentStart, lte: now } } }),
      db.call.count({ where: { ...callWhere, calledAt: { gte: priorStart, lt: priorEnd } } }),
      db.call.aggregate({ _avg: { score: true }, where: { ...callWhere, calledAt: { gte: currentStart, lte: now }, score: { not: null } } }),
      db.call.aggregate({ _avg: { score: true }, where: { ...callWhere, calledAt: { gte: priorStart, lt: priorEnd }, score: { not: null } } }),
      db.call.count({ where: { ...callWhere, calledAt: { gte: currentStart, lte: now }, callOutcome: 'appointment_set' } }),
      db.call.count({ where: { ...callWhere, calledAt: { gte: priorStart, lt: priorEnd }, callOutcome: 'appointment_set' } }),
      db.call.count({ where: { ...callWhere, calledAt: { gte: currentStart, lte: now }, callOutcome: 'contract' } }),
      db.call.count({ where: { ...callWhere, calledAt: { gte: priorStart, lt: priorEnd }, callOutcome: 'contract' } }),
      db.task.count({ where: { ...taskWhere, completedAt: { gte: currentStart, lte: now } } }),
      db.task.count({ where: { ...taskWhere, completedAt: { gte: priorStart, lt: priorEnd } } }),
    ])

  function delta(curr: number, prior: number) {
    return { current: curr, prior, deltaPct: prior === 0 ? null : Math.round(((curr - prior) / prior) * 100) }
  }

  return ok({
    period,
    rep: args.repName ?? 'whole team',
    currentWindow: { from: currentStart.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
    priorWindow: { from: priorStart.toISOString().slice(0, 10), to: priorEnd.toISOString().slice(0, 10) },
    metrics: {
      callVolume: delta(callsCurrent, callsPrior),
      avgScore: {
        current: avgScoreCurrent._avg.score !== null ? Number(avgScoreCurrent._avg.score.toFixed(1)) : null,
        prior: avgScorePrior._avg.score !== null ? Number(avgScorePrior._avg.score.toFixed(1)) : null,
      },
      appointmentsSet: delta(appointmentsCurrent, appointmentsPrior),
      contractsLocked: delta(contractsCurrent, contractsPrior),
      tasksCompleted: delta(tasksCompletedCurrent, tasksCompletedPrior),
    },
  })
}

// ── 6. get_team_performance ──────────────────────────────────────────────
// Leaderboard. Identifies underperformers, who has the most calls, etc.

export interface GetTeamPerformanceArgs {
  period?: 'week' | 'month'
  limit?: number
}

export async function getTeamPerformance(tenantId: string, args: GetTeamPerformanceArgs): Promise<ToolResult> {
  const period = args.period ?? 'week'
  const days = period === 'week' ? 7 : 30
  const since = startOfDay(daysAgo(days))
  const limit = clampLimit(args.limit, 25, 50)

  const users = await db.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, role: true },
  })

  if (users.length === 0) return empty('No team members in this tenant.')

  const rows = await Promise.all(users.map(async u => {
    const [callCount, scoreAgg, apptCount, contractCount, openTasks] = await Promise.all([
      db.call.count({ where: { tenantId, assignedToId: u.id, calledAt: { gte: since } } }),
      db.call.aggregate({
        _avg: { score: true },
        where: { tenantId, assignedToId: u.id, calledAt: { gte: since }, score: { not: null } },
      }),
      db.call.count({ where: { tenantId, assignedToId: u.id, calledAt: { gte: since }, callOutcome: 'appointment_set' } }),
      db.call.count({ where: { tenantId, assignedToId: u.id, calledAt: { gte: since }, callOutcome: 'contract' } }),
      db.task.count({ where: { tenantId, assignedToId: u.id, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    ])
    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      callCount,
      avgScore: scoreAgg._avg.score !== null ? Number(scoreAgg._avg.score.toFixed(1)) : null,
      appointmentsSet: apptCount,
      contractsLocked: contractCount,
      openTasks,
    }
  }))

  // Sort by call count descending — managers usually want "who's putting
  // in the most work" first; ties broken by avg score.
  rows.sort((a, b) => {
    if (b.callCount !== a.callCount) return b.callCount - a.callCount
    return (b.avgScore ?? 0) - (a.avgScore ?? 0)
  })

  return ok({
    period,
    since: since.toISOString().slice(0, 10),
    leaderboard: rows.slice(0, limit),
  })
}

// ── 7. query_sellers ──────────────────────────────────────────────────────

export interface QuerySellersArgs {
  motivationMin?: number             // 0-1
  likelihoodToSellMin?: number       // 0-1
  urgencyLevel?: string              // high | medium | low | unknown
  hardshipType?: string
  saleTimeline?: string              // ASAP | 30_days | etc.
  nameFragment?: string
  city?: string
  state?: string
  limit?: number
}

export async function querySellers(tenantId: string, args: QuerySellersArgs): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25, 100)

  const where: Prisma.SellerWhereInput = { tenantId, isDeceased: false, doNotContact: false }
  if (typeof args.motivationMin === 'number') where.motivationScore = { gte: args.motivationMin }
  if (typeof args.likelihoodToSellMin === 'number') where.likelihoodToSellScore = { gte: args.likelihoodToSellMin }
  if (args.urgencyLevel) where.urgencyLevel = args.urgencyLevel
  if (args.hardshipType) where.hardshipType = args.hardshipType
  if (args.saleTimeline) where.saleTimeline = args.saleTimeline
  if (args.nameFragment) where.name = { contains: args.nameFragment, mode: 'insensitive' }
  if (args.city) where.mailingCity = { contains: args.city, mode: 'insensitive' }
  if (args.state) where.mailingState = { equals: args.state, mode: 'insensitive' }

  const rows = await db.seller.findMany({
    where,
    orderBy: { motivationScore: 'desc' },
    take: limit,
    select: {
      id: true, name: true, phone: true, email: true,
      motivationScore: true, likelihoodToSellScore: true,
      urgencyLevel: true, hardshipType: true, saleTimeline: true,
      mailingCity: true, mailingState: true,
    },
  })

  if (rows.length === 0) return empty('Try lowering motivationMin or removing filters.')

  return ok(rows.map(r => ({
    id: r.id, name: r.name, phone: r.phone, email: r.email,
    motivationScore: r.motivationScore,
    likelihoodToSellScore: r.likelihoodToSellScore,
    urgencyLevel: r.urgencyLevel,
    hardshipType: r.hardshipType,
    saleTimeline: r.saleTimeline,
    city: r.mailingCity, state: r.mailingState,
  })))
}

// ── 8. query_buyers ───────────────────────────────────────────────────────

export interface QueryBuyersArgs {
  market?: string                    // city/county/zip — matched against primaryMarkets etc.
  propertyType?: string
  maxRepairBudgetMin?: number
  isNationalBuyer?: boolean
  active?: boolean                   // default true
  nameFragment?: string
  limit?: number
}

export async function queryBuyers(tenantId: string, args: QueryBuyersArgs): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25, 100)
  const where: Prisma.BuyerWhereInput = {
    tenantId,
    doNotContact: false,
    isActive: args.active === false ? false : true,
  }
  if (args.isNationalBuyer !== undefined) where.isNationalBuyer = args.isNationalBuyer
  if (typeof args.maxRepairBudgetMin === 'number') where.maxRepairBudget = { gte: args.maxRepairBudgetMin }
  if (args.nameFragment) where.name = { contains: args.nameFragment, mode: 'insensitive' }

  // Market and propertyType live in JSON columns — Prisma's json filtering
  // is awkward across drivers, so we do a hot filter post-fetch on a
  // generous candidate window.
  const rows = await db.buyer.findMany({
    where,
    take: Math.min(limit * 3, 300),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, phone: true, email: true,
      primaryMarkets: true, citiesOfInterest: true, countiesOfInterest: true, zipCodesOfInterest: true,
      propertyTypes: true, maxRepairBudget: true,
      isNationalBuyer: true, isOutOfStateBuyer: true,
    },
  })

  let filtered = rows
  if (args.market) {
    const m = args.market.toLowerCase()
    filtered = rows.filter(r => {
      const pools: unknown[] = [r.primaryMarkets, r.citiesOfInterest, r.countiesOfInterest, r.zipCodesOfInterest]
      return r.isNationalBuyer || pools.some(p => Array.isArray(p) && p.some(v => String(v).toLowerCase().includes(m)))
    })
  }
  if (args.propertyType) {
    const pt = args.propertyType.toLowerCase()
    filtered = filtered.filter(r => Array.isArray(r.propertyTypes) && r.propertyTypes.some(v => String(v).toLowerCase().includes(pt)))
  }

  filtered = filtered.slice(0, limit)

  if (filtered.length === 0) return empty('No buyers matched these filters.')

  return ok(filtered.map(r => ({
    id: r.id, name: r.name, phone: r.phone, email: r.email,
    primaryMarkets: r.primaryMarkets, propertyTypes: r.propertyTypes,
    maxRepairBudget: toNum(r.maxRepairBudget),
    isNationalBuyer: r.isNationalBuyer,
  })))
}

// ── 9. get_ghl_pipeline_state ─────────────────────────────────────────────
// Aggregate view of pipeline health: stage distribution + stuck deals.

export interface GetGhlPipelineStateArgs {
  lane?: 'acquisition' | 'disposition' | 'longterm'
  stuckDaysThreshold?: number        // properties unchanged for N+ days = stuck
  limit?: number
}

export async function getGhlPipelineState(tenantId: string, args: GetGhlPipelineStateArgs): Promise<ToolResult> {
  const lane = args.lane ?? 'acquisition'
  const stuckDays = args.stuckDaysThreshold ?? 14
  const limit = clampLimit(args.limit, 25, 100)
  const stuckBefore = daysAgo(stuckDays)

  // Stage distribution
  const statusField = lane === 'acquisition' ? 'acqStatus' : lane === 'disposition' ? 'dispoStatus' : 'longtermStatus'
  const lostField = lane === 'acquisition' ? 'acqLostAt' : lane === 'disposition' ? 'dispoLostAt' : 'longtermLostAt'
  const stageEnteredField = lane === 'acquisition' ? 'acqStageEnteredAt' : lane === 'disposition' ? 'dispoStageEnteredAt' : 'longtermStageEnteredAt'
  const stageNameField = lane === 'acquisition' ? 'ghlAcqStageName' : lane === 'disposition' ? 'ghlDispoStageName' : 'ghlLongtermStageName'

  const distribution = await db.property.groupBy({
    by: [statusField as 'acqStatus'], // groupBy needs literal — cast through known field
    where: { tenantId, [lostField]: null },
    _count: { _all: true },
  })

  // Stuck deals — haven't moved stage in > stuckDays
  const stuck = await db.property.findMany({
    where: {
      tenantId,
      [lostField]: null,
      [stageEnteredField]: { lt: stuckBefore },
    },
    orderBy: { [stageEnteredField]: 'asc' as const },
    take: limit,
    select: {
      id: true, address: true, city: true, state: true,
      arv: true, tcpScore: true,
      [statusField]: true,
      [stageNameField]: true,
      [stageEnteredField]: true,
      assignedTo: { select: { name: true } },
    } as Prisma.PropertySelect,
  })

  return ok({
    lane,
    stuckDaysThreshold: stuckDays,
    stageDistribution: distribution.map(d => ({
      stage: (d as unknown as Record<string, unknown>)[statusField],
      count: d._count._all,
    })),
    stuckDeals: stuck.map(p => {
      const r = p as unknown as Record<string, unknown> & { id: string; address: string; city: string; state: string }
      const enteredAt = r[stageEnteredField] as Date | null
      return {
        id: r.id,
        address: `${r.address}, ${r.city}, ${r.state}`,
        stage: r[statusField],
        stageName: r[stageNameField],
        daysInStage: enteredAt ? Math.floor((Date.now() - enteredAt.getTime()) / 86_400_000) : null,
        arv: toNum(r.arv as Prisma.Decimal | null),
        tcpScore: r.tcpScore as number | null,
        assignedTo: (r.assignedTo as { name: string | null } | null)?.name ?? null,
      }
    }),
  })
}

// ── 10. cross_entity_query ────────────────────────────────────────────────
// The "Show me properties where the rep hasn't called in 5 days AND TCP > 0.6"
// query. Composes query_properties with last-call check.

export interface CrossEntityQueryArgs {
  // Property filters
  tcpMin?: number
  arvMin?: number
  acqStatus?: string
  dispoStatus?: string
  // Cross filters
  noCallInLastDays?: number          // hasn't been called in N+ days
  noTaskInLastDays?: number          // no task touched in N+ days
  assignedToName?: string
  limit?: number
}

export async function crossEntityQuery(tenantId: string, args: CrossEntityQueryArgs): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 25, 100)

  // Step 1 — candidate properties matching the property-side filters.
  const candidates = await queryProperties(tenantId, {
    tcpMin: args.tcpMin,
    arvMin: args.arvMin,
    acqStatus: args.acqStatus,
    dispoStatus: args.dispoStatus,
    assignedToName: args.assignedToName,
    limit: Math.min(limit * 5, 500),       // pull a wider net; we filter below
    sortBy: 'tcp',
    sortDir: 'desc',
  })

  if (candidates.status !== 'success' || !Array.isArray(candidates.data) || candidates.data.length === 0) {
    return empty('No properties matched the property-side filters.')
  }

  type Candidate = { id: string; address: string; tcpScore: number | null; assignedTo: string | null; arv: number | null }
  const list = candidates.data as Candidate[]

  // Step 2 — for each candidate, check cross conditions. Batch for speed.
  const propIds = list.map(p => p.id)
  const callCutoff = typeof args.noCallInLastDays === 'number' ? daysAgo(args.noCallInLastDays) : null
  const taskCutoff = typeof args.noTaskInLastDays === 'number' ? daysAgo(args.noTaskInLastDays) : null

  const recentCallByProp = callCutoff
    ? await db.call.findMany({
        where: { tenantId, propertyId: { in: propIds }, calledAt: { gte: callCutoff } },
        select: { propertyId: true },
        distinct: ['propertyId'],
      })
    : []
  const recentTaskByProp = taskCutoff
    ? await db.task.findMany({
        where: { tenantId, propertyId: { in: propIds }, OR: [{ updatedAt: { gte: taskCutoff } }, { completedAt: { gte: taskCutoff } }] },
        select: { propertyId: true },
        distinct: ['propertyId'],
      })
    : []

  const propsWithRecentCall = new Set(recentCallByProp.map(c => c.propertyId).filter(Boolean) as string[])
  const propsWithRecentTask = new Set(recentTaskByProp.map(t => t.propertyId).filter(Boolean) as string[])

  const filtered = list.filter(p => {
    if (callCutoff && propsWithRecentCall.has(p.id)) return false       // had a recent call → fails "no call in N days"
    if (taskCutoff && propsWithRecentTask.has(p.id)) return false
    return true
  }).slice(0, limit)

  if (filtered.length === 0) return empty('Cross-entity filters narrowed to zero. Try widening one constraint.')

  return ok(filtered)
}

// ── 11 (bonus). find_similar_deals ────────────────────────────────────────
// Stubbed for Phase D — needs property embeddings. Until then, simple
// rule-based: same status + similar ARV ±20% + same city.

export async function findSimilarDeals(
  tenantId: string,
  args: { propertyId: string; limit?: number },
): Promise<ToolResult> {
  const limit = clampLimit(args.limit, 10, 25)
  const target = await db.property.findUnique({
    where: { id: args.propertyId, tenantId },
    select: { city: true, state: true, arv: true, beds: true, acqStatus: true, dispoStatus: true },
  })
  if (!target) return err('Property not found.', 'Verify the propertyId is correct and in this tenant.')

  const arvNum = toNum(target.arv)
  const where: Prisma.PropertyWhereInput = {
    tenantId,
    id: { not: args.propertyId },
    city: target.city,
    state: target.state,
  }
  if (arvNum !== null) {
    where.arv = { gte: arvNum * 0.8, lte: arvNum * 1.2 }
  }
  if (target.beds !== null) {
    where.beds = { gte: Math.max(1, target.beds - 1), lte: target.beds + 1 }
  }

  const rows = await db.property.findMany({
    where,
    take: limit,
    orderBy: { tcpScore: 'desc' },
    select: {
      id: true, address: true, city: true, state: true,
      arv: true, askingPrice: true, currentOffer: true, tcpScore: true,
      acqStatus: true, dispoStatus: true, finalProfit: true,
    },
  })

  if (rows.length === 0) return empty('No comparable deals found in the same city.')

  return ok(rows.map(r => ({
    id: r.id,
    address: `${r.address}, ${r.city}, ${r.state}`,
    arv: toNum(r.arv),
    askingPrice: toNum(r.askingPrice),
    currentOffer: toNum(r.currentOffer),
    finalProfit: toNum(r.finalProfit),
    tcpScore: r.tcpScore,
    acqStatus: r.acqStatus, dispoStatus: r.dispoStatus,
  })))
}
