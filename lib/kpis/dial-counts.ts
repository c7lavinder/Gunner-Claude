// lib/kpis/dial-counts.ts
// Single source of truth for "today's dials" aggregation.
//
// Three surfaces previously diverged:
//   - app/(tenant)/[tenant]/day-hub/page.tsx  (canonical Day Hub, Rule 3)
//   - app/api/[tenant]/dayhub/kpis/route.ts   (legacy /tasks/ Day Hub backend)
//   - app/(tenant)/[tenant]/calls/page.tsx    (Calls list)
//
// Drift modes:
//   - createdAt vs calledAt — webhook lag put boundary calls in different days
//   - single-user vs aggregated — canonical Day Hub never aggregated for admins
//
// Canonical contract:
//   - calledAt is the source-of-truth timestamp (matches /calls page ordering)
//   - "all" scope returns tenant-wide (admin/owner default)
//   - "users" scope returns calls assigned to any of the given user IDs
//     (for role-tab filters: e.g. all LMs)
//   - "user" scope returns calls assigned to a single user (default for non-admins)

import { db } from '@/lib/db/client'
import { getCentralDayBounds } from '@/lib/dates'

export type DialScope =
  | { kind: 'all'; tenantId: string }
  | { kind: 'user'; tenantId: string; userId: string }
  | { kind: 'users'; tenantId: string; userIds: string[] }

interface DialCountWindow {
  /** Optional 'YYYY-MM-DD' Central-time date. Defaults to today. */
  date?: string
}

/** Inclusive `gte`, optional inclusive `lte` (open-ended if omitted). */
export interface DialDateRange {
  gte: Date
  lte?: Date
}

function buildCallWhere(scope: DialScope, range: DialDateRange) {
  const calledAt: { gte: Date; lte?: Date } = { gte: range.gte }
  if (range.lte) calledAt.lte = range.lte
  const base: {
    tenantId: string
    calledAt: { gte: Date; lte?: Date }
    assignedToId?: string | { in: string[] }
  } = {
    tenantId: scope.tenantId,
    calledAt,
  }
  if (scope.kind === 'user') base.assignedToId = scope.userId
  else if (scope.kind === 'users') base.assignedToId = { in: scope.userIds }
  return base
}

/**
 * Primitive: count of all dial attempts (any gradingStatus) in the given range.
 * Use for week/month/custom-range KPIs (e.g. dashboard callsWeek/callsMonth).
 */
export async function countDialsInRange(
  scope: DialScope,
  range: DialDateRange,
): Promise<number> {
  if (scope.kind === 'users' && scope.userIds.length === 0) return 0
  return db.call.count({ where: buildCallWhere(scope, range) })
}

/** Count of all dial attempts (any gradingStatus) for the day in scope. */
export async function countDialsToday(
  scope: DialScope,
  window?: DialCountWindow,
): Promise<number> {
  const { dayStart, dayEnd } = getCentralDayBounds(window?.date)
  return countDialsInRange(scope, { gte: dayStart, lte: dayEnd })
}

/**
 * Count of meaningful conversations: graded calls ≥45s.
 * 45s is the Gunner threshold for "real conversation" vs voicemail/hang-up.
 */
export async function countConvosToday(
  scope: DialScope,
  window?: DialCountWindow,
): Promise<number> {
  if (scope.kind === 'users' && scope.userIds.length === 0) return 0
  const { dayStart, dayEnd } = getCentralDayBounds(window?.date)
  return db.call.count({
    where: {
      ...buildCallWhere(scope, { gte: dayStart, lte: dayEnd }),
      gradingStatus: 'COMPLETED',
      durationSeconds: { gte: 45 },
    },
  })
}

/** Convenience: both counts in one call. */
export async function getDialKpisToday(
  scope: DialScope,
  window?: DialCountWindow,
): Promise<{ calls: number; convos: number }> {
  const [calls, convos] = await Promise.all([
    countDialsToday(scope, window),
    countConvosToday(scope, window),
  ])
  return { calls, convos }
}
