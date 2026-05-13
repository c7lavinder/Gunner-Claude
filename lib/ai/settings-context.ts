// lib/ai/settings-context.ts
//
// Phase 1 of the LLM Rewiring Plan (docs/LLM_REWIRING_PLAN.md).
// Pulls every piece of TENANT-LEVEL business knowledge that an AI surface
// might need: company identity, KPI targets, call vocabulary, markets,
// team roster (with their profiles), and the asking user's own profile.
//
// READ BY: lib/ai/context-builder.ts (which all LLM surfaces use)
//
// Cached in-process for 5 minutes per tenant. Settings rarely change and
// every assistant turn pulls them — caching cuts ~50ms off each LLM call.

import { db } from '@/lib/db/client'

export interface TeamMemberSummary {
  id: string
  name: string
  role: string                  // OWNER | ADMIN | TEAM_LEAD | LEAD_MANAGER | ACQUISITION_MANAGER | DISPOSITION_MANAGER
  reportsTo: string | null      // user id
  managerName: string | null    // resolved
  communicationStyle: string | null
  totalCallsGraded: number
  strengthsTop3: string[]
  weaknessesTop3: string[]
  coachingPrioritiesTop3: string[]
}

export interface SettingsContext {
  // Identity
  tenantName: string
  tenantSlug: string

  // Business vocabulary
  callTypes: string[]                          // ["cold_call", "qualification_call", ...]
  callResultsByType: Record<string, string[]>  // { cold_call: ["interested", "not_interested"], ... }

  // Goals + measurement
  kpiGoalsByRole: Record<string, Record<string, number>>  // { LM: { calls: 150, apts: 3, ... }, ... }

  // Geographic scope
  markets: Array<{ name: string; zipCount: number }>

  // Workflow vocabulary
  appointmentTypes: Array<{ id: string; label: string; defaultDurationMin: number }>

  // Team — answers "Who is Chris?" / "How is Daniel doing?" / "Who reports to whom?"
  team: TeamMemberSummary[]

  // Asking user's own profile (richer)
  askingUser?: TeamMemberSummary

  // Calling user identity
  askingUserName: string
  askingUserRole: string
}

// ─── Cache ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000
interface CacheEntry { context: Omit<SettingsContext, 'askingUser' | 'askingUserName' | 'askingUserRole'>; expiresAt: number }
const cache = new Map<string, CacheEntry>()

/** Test-only: clear cache between test runs. */
export function __resetSettingsCacheForTests(): void {
  cache.clear()
}

// ─── Main entry ──────────────────────────────────────────────────────────

/**
 * Build the full settings context for an AI call. Cached for 5min per tenant.
 * The asking-user slice is NOT cached (different per call) but is fast.
 */
export async function buildSettingsContext(params: {
  tenantId: string
  userId?: string
}): Promise<SettingsContext> {
  const { tenantId, userId } = params

  // Tenant-scoped data — cached
  const cached = cache.get(tenantId)
  let tenantCtx: Omit<SettingsContext, 'askingUser' | 'askingUserName' | 'askingUserRole'>
  if (cached && cached.expiresAt > Date.now()) {
    tenantCtx = cached.context
  } else {
    tenantCtx = await buildTenantContext(tenantId)
    cache.set(tenantId, { context: tenantCtx, expiresAt: Date.now() + CACHE_TTL_MS })
  }

  // Asking-user slice — fresh each call (cheap)
  let askingUser: TeamMemberSummary | undefined
  let askingUserName = 'Unknown'
  let askingUserRole = 'Unknown'
  if (userId) {
    const found = tenantCtx.team.find((u) => u.id === userId)
    if (found) {
      askingUser = found
      askingUserName = found.name
      askingUserRole = found.role
    }
  }

  return { ...tenantCtx, askingUser, askingUserName, askingUserRole }
}

// ─── Tenant context builder (the cached slice) ───────────────────────────

async function buildTenantContext(
  tenantId: string,
): Promise<Omit<SettingsContext, 'askingUser' | 'askingUserName' | 'askingUserRole'>> {
  const [tenant, markets, users] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        slug: true,
        callTypes: true,
        callResults: true,
        config: true,
      },
    }),
    db.market.findMany({
      where: { tenantId },
      select: { name: true, zipCodes: true },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        role: true,
        reportsTo: true,
        userProfile: {
          select: {
            communicationStyle: true,
            totalCallsGraded: true,
            strengths: true,
            weaknesses: true,
            coachingPriorities: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  // Resolve manager names
  const usersById = new Map(users.map((u) => [u.id, u]))
  const team: TeamMemberSummary[] = users.map((u) => {
    const manager = u.reportsTo ? usersById.get(u.reportsTo) : null
    const p = u.userProfile
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      reportsTo: u.reportsTo,
      managerName: manager?.name ?? null,
      communicationStyle: p?.communicationStyle ?? null,
      totalCallsGraded: p?.totalCallsGraded ?? 0,
      strengthsTop3: asTop3(p?.strengths),
      weaknessesTop3: asTop3(p?.weaknesses),
      coachingPrioritiesTop3: asTop3(p?.coachingPriorities),
    }
  })

  // tenant.config is a Json blob — extract the known structured pieces.
  const config = (tenant?.config ?? {}) as {
    kpiGoals?: Record<string, Record<string, number>>
    appointmentTypes?: Array<{ id: string; label: string; defaultDurationMin?: number }>
  }

  return {
    tenantName: tenant?.name ?? 'Unknown',
    tenantSlug: tenant?.slug ?? '',
    callTypes: (tenant?.callTypes as string[] | null) ?? [],
    callResultsByType:
      (tenant?.callResults as Record<string, string[]> | null) ?? {},
    kpiGoalsByRole: config.kpiGoals ?? {},
    markets: markets.map((m) => ({
      name: m.name,
      zipCount: Array.isArray(m.zipCodes) ? m.zipCodes.length : 0,
    })),
    appointmentTypes: (config.appointmentTypes ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      defaultDurationMin: a.defaultDurationMin ?? 60,
    })),
    team,
  }
}

function asTop3(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').slice(0, 3)
}

// ─── Formatter for prompt injection ──────────────────────────────────────

/**
 * Compose the settings context into a tight markdown block. The token budget
 * caps total length — overflow truncates the team section first (it's the
 * largest variable cost) and keeps the structured business rules intact.
 *
 * Default budget: 3000 chars (~750 tokens at 4 chars/token). Tune via param.
 */
export function formatSettingsForPrompt(
  ctx: SettingsContext,
  tokenBudget = 3000,
): string {
  const lines: string[] = []

  lines.push(`# COMPANY: ${ctx.tenantName}`)
  if (ctx.markets.length > 0) {
    lines.push(
      `Markets: ${ctx.markets.map((m) => `${m.name}${m.zipCount ? ` (${m.zipCount} zips)` : ''}`).join(', ')}`,
    )
  }

  if (Object.keys(ctx.kpiGoalsByRole).length > 0) {
    lines.push('')
    lines.push('# KPI TARGETS (daily)')
    for (const [role, goals] of Object.entries(ctx.kpiGoalsByRole)) {
      const parts = Object.entries(goals).map(([k, v]) => `${k}=${v}`)
      lines.push(`- ${role}: ${parts.join(', ')}`)
    }
  }

  if (ctx.callTypes.length > 0) {
    lines.push('')
    lines.push('# CALL VOCABULARY')
    lines.push(`Types: ${ctx.callTypes.join(', ')}`)
  }

  if (ctx.appointmentTypes.length > 0) {
    lines.push('')
    lines.push('# APPOINTMENT TYPES')
    for (const a of ctx.appointmentTypes) {
      lines.push(`- ${a.id}: "${a.label}" (${a.defaultDurationMin}min)`)
    }
  }

  // Asking user's own profile — always include if present (cheap, high value)
  if (ctx.askingUser) {
    const u = ctx.askingUser
    lines.push('')
    lines.push(`# YOU ARE TALKING TO: ${u.name} (${u.role})`)
    if (u.managerName) lines.push(`Reports to: ${u.managerName}`)
    if (u.communicationStyle) {
      // Communication style can be long — truncate
      const style = u.communicationStyle.length > 400
        ? u.communicationStyle.slice(0, 400) + '…'
        : u.communicationStyle
      lines.push(`Style: ${style}`)
    }
    if (u.totalCallsGraded > 0) lines.push(`Calls graded so far: ${u.totalCallsGraded}`)
    if (u.coachingPrioritiesTop3.length > 0) {
      lines.push(`Current coaching focus: ${u.coachingPrioritiesTop3.join(' | ')}`)
    }
  }

  // Team section — last (truncatable)
  if (ctx.team.length > 0) {
    lines.push('')
    lines.push('# TEAM')
    for (const m of ctx.team) {
      const tag = m.managerName ? ` → reports to ${m.managerName}` : ''
      const calls = m.totalCallsGraded > 0 ? ` · ${m.totalCallsGraded} calls graded` : ''
      const style = m.communicationStyle
        ? ` · ${m.communicationStyle.slice(0, 120).replace(/\s+/g, ' ').trim()}${m.communicationStyle.length > 120 ? '…' : ''}`
        : ''
      lines.push(`- ${m.name} (${m.role})${tag}${calls}${style}`)
    }
  }

  let out = lines.join('\n')
  if (out.length > tokenBudget) {
    // Truncate team section first if over budget
    const teamIdx = out.indexOf('# TEAM')
    if (teamIdx > -1 && teamIdx < tokenBudget) {
      out = out.slice(0, tokenBudget) + '\n…(team truncated)'
    } else {
      out = out.slice(0, tokenBudget) + '…'
    }
  }
  return out
}
