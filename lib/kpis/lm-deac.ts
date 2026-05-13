// lib/kpis/lm-deac.ts
//
// LM-DEAC — Lead Manager Daily Effective Action Count.
// The single canonical north-star metric for the AI Rewiring program.
// Definition locked 2026-05-12 (Session 86).
// See docs/LLM_REWIRING_PLAN.md and docs/DECISIONS.md (D-051).
//
// Composite formula:
//   LM-DEAC = dials + tasksCompleted + (apptsSet × 3) + scriptAdherenceScore
//
// apptsSet is weighted 3× because it's the conversion gate — the action that
// produces revenue, not just effort.
//
// Known limitations as of 2026-05-12:
//   - apptsSet uses property.updatedAt as a proxy because no audit_log action
//     reliably captures stage transitions today. Phase 0e of the Rewiring Plan
//     adds proper instrumentation; once that ships, swap the implementation.
//   - scriptAdherenceScore averages ALL rubric categories instead of reading
//     a dedicated `script_adherence` key (which doesn't exist in the rubric
//     yet). Phase 6 of the Rewiring Plan may introduce one — revisit then.
//   - tasksCompleted: NAH (and likely all tenants) does NOT use the local
//     `tasks` table — 0 rows ever written. The team completes tasks in GHL.
//     We count the GHL `TaskComplete` webhook (mapped via user.ghlUserId)
//     as the source of truth. If a tenant later starts using Gunner-native
//     tasks, we take max(localTaskCount, ghlWebhookCount) to avoid losing
//     either signal.

import { db } from '@/lib/db/client'
import { getCentralDayBounds, getCentralToday } from '@/lib/dates'
import { countDialsToday } from './dial-counts'

export interface LmDeacResult {
  userId: string
  date: string // YYYY-MM-DD (Central time)
  dials: number
  tasksCompleted: number
  apptsSet: number
  scriptAdherenceScore: number // 0–10 scale
  composite: number
  notes: string[]
}

/**
 * Calculate LM-DEAC for one user on one Central-time day.
 * @param tenantId  tenant scope
 * @param userId    the Lead Manager (or any user — works for all roles)
 * @param dateYmd   optional 'YYYY-MM-DD' Central. Defaults to today.
 */
export async function calculateLmDeac(
  tenantId: string,
  userId: string,
  dateYmd?: string,
): Promise<LmDeacResult> {
  const { dayStart, dayEnd } = getCentralDayBounds(dateYmd)
  const date = dateYmd ?? getCentralToday()
  const notes: string[] = []

  // dials — canonical: matches Day Hub + Calls page (lib/kpis/dial-counts.ts).
  const dials = await countDialsToday(
    { kind: 'user', tenantId, userId },
    { date },
  )

  // tasksCompleted — combined signal:
  //  (a) local Gunner Task table (when populated), AND
  //  (b) GHL TaskComplete webhooks for this user's GHL ID.
  // We take max() to avoid double counting if Gunner ever mirrors GHL tasks.
  const localTasks = await db.task.count({
    where: {
      tenantId,
      assignedToId: userId,
      status: 'COMPLETED',
      completedAt: { gte: dayStart, lte: dayEnd },
    },
  })

  const [user, tenant] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { ghlUserId: true },
    }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { ghlLocationId: true },
    }),
  ])

  let ghlTasks = 0
  if (user?.ghlUserId && tenant?.ghlLocationId) {
    const result: Array<{ n: bigint }> = await db.$queryRaw`
      SELECT COUNT(*)::bigint AS n
      FROM webhook_logs
      WHERE event_type = 'TaskComplete'
        AND location_id = ${tenant.ghlLocationId}
        AND received_at >= ${dayStart}
        AND received_at <= ${dayEnd}
        AND raw_payload->>'assignedTo' = ${user.ghlUserId}
    `
    ghlTasks = Number(result[0]?.n ?? 0)
  }

  const tasksCompleted = Math.max(localTasks, ghlTasks)

  // apptsSet — proxy: properties currently in APPOINTMENT_SET stage that
  // were updated today. Over-counts (any update on an APPT_SET property),
  // under-counts (if the property left APPT_SET later in the day).
  // Replace with audit_log query once stage-transition instrumentation lands.
  const apptsSet = await db.property.count({
    where: {
      tenantId,
      assignedToId: userId,
      acqStatus: 'APPOINTMENT_SET',
      updatedAt: { gte: dayStart, lte: dayEnd },
    },
  })
  notes.push(
    'apptsSet is a proxy via property.updatedAt — needs stage-transition audit instrumentation (Phase 0e of Rewiring Plan).',
  )

  // scriptAdherenceScore — avg of all rubric categories across user's graded
  // calls today, normalized to 0–10 scale (rubric scores are 0–100 today).
  const scoredCalls = await db.call.findMany({
    where: {
      tenantId,
      assignedToId: userId,
      gradingStatus: 'COMPLETED',
      gradedAt: { gte: dayStart, lte: dayEnd },
    },
    select: { rubricScores: true },
  })

  let scriptAdherenceScore = 0
  if (scoredCalls.length > 0) {
    const perCallAverages = scoredCalls
      .map((c) => averageRubricScore(c.rubricScores))
      .filter((n): n is number => n !== null)
    if (perCallAverages.length > 0) {
      const overall =
        perCallAverages.reduce((a, b) => a + b, 0) / perCallAverages.length
      scriptAdherenceScore = overall / 10
    }
  }
  notes.push(
    'scriptAdherenceScore = avg of all rubric categories ÷ 10. No dedicated script_adherence key yet.',
  )

  const composite =
    dials + tasksCompleted + apptsSet * 3 + scriptAdherenceScore

  return {
    userId,
    date,
    dials,
    tasksCompleted,
    apptsSet,
    scriptAdherenceScore: round2(scriptAdherenceScore),
    composite: round2(composite),
    notes,
  }
}

/**
 * Bulk: every day in [startYmd, endYmd] inclusive. Used for baseline capture
 * and trend reporting.
 */
export async function calculateLmDeacRange(
  tenantId: string,
  userId: string,
  startYmd: string,
  endYmd: string,
): Promise<LmDeacResult[]> {
  const out: LmDeacResult[] = []
  const start = new Date(`${startYmd}T12:00:00Z`)
  const end = new Date(`${endYmd}T12:00:00Z`)
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const ymd = d.toISOString().slice(0, 10)
    out.push(await calculateLmDeac(tenantId, userId, ymd))
  }
  return out
}

// ─── helpers ─────────────────────────────────────────────────────────────

function averageRubricScore(rubricScores: unknown): number | null {
  if (!rubricScores || typeof rubricScores !== 'object') return null
  const numerics = Object.values(rubricScores as Record<string, unknown>).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  if (numerics.length === 0) return null
  return numerics.reduce((a, b) => a + b, 0) / numerics.length
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
