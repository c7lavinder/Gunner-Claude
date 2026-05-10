// lib/property-status.ts
// Lane-resolution helpers for the per-lane status / stage / entered-at columns
// introduced in Phase 1 of the GHL multi-pipeline redesign.
//
// Each property has three independent lane columns (acqStatus, dispoStatus,
// longtermStatus). For UI surfaces that previously displayed a single
// `property.status` string (status pill, count buckets, etc.), these helpers
// pick the "primary" lane to display, mirroring plan §4b's stage-label rule:
//   dispo (active) > acq > longterm.
//
// See docs/plans/ghl-multi-pipeline-bulletproof.md §3 + §4b.

import type { AcqStatus, DispoStatus, LongtermStatus } from '@prisma/client'

export type PropertyLaneSnapshot = {
  acqStatus?: AcqStatus | null
  dispoStatus?: DispoStatus | null
  longtermStatus?: LongtermStatus | null
  // Per-lane "Lost" markers. Non-null = the GHL opp in that lane was
  // marked status=lost (or abandoned). Lost lanes are skipped by
  // effectiveLane() and excluded from default views.
  acqLostAt?: Date | null
  dispoLostAt?: Date | null
  longtermLostAt?: Date | null
}

export type StageNameSnapshot = {
  ghlAcqStageName?: string | null
  ghlDispoStageName?: string | null
  ghlLongtermStageName?: string | null
}

export type StageEnteredAtSnapshot = {
  acqStageEnteredAt?: Date | null
  dispoStageEnteredAt?: Date | null
  longtermStageEnteredAt?: Date | null
}

// Single string for display + count bucketing. Active dispo wins because
// disposition is the most recent, most visible state for properties under
// active wholesaling. Falls back to acquisition, then longterm, then a
// default of NEW_LEAD for properties that haven't been categorised yet.
// Lost lanes are skipped so a Lost dispo doesn't shadow an active acq.
export function effectiveStatus(p: PropertyLaneSnapshot): string {
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED' && !p.dispoLostAt) return p.dispoStatus
  if (p.acqStatus && !p.acqLostAt) return p.acqStatus
  if (p.longtermStatus && !p.longtermLostAt) return p.longtermStatus
  // All active lanes are lost (or none set) — fall back to whatever lane
  // has a status so the UI still shows something instead of a blank pill.
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED') return p.dispoStatus
  if (p.acqStatus) return p.acqStatus
  if (p.longtermStatus) return p.longtermStatus
  return 'NEW_LEAD'
}

// Which lane is the "primary" one for this property — useful when the caller
// needs to know more than just the status string (e.g. to render a colored
// pill or pick which entered-at to read). Lost lanes are skipped.
export function effectiveLane(
  p: PropertyLaneSnapshot,
): 'acquisition' | 'disposition' | 'longterm' {
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED' && !p.dispoLostAt) return 'disposition'
  if (p.acqStatus && !p.acqLostAt) return 'acquisition'
  if (p.longtermStatus && !p.longtermLostAt) return 'longterm'
  return 'acquisition'
}

export function effectiveStageName(p: StageNameSnapshot): string | null {
  if (p.ghlDispoStageName) return p.ghlDispoStageName
  if (p.ghlAcqStageName) return p.ghlAcqStageName
  if (p.ghlLongtermStageName) return p.ghlLongtermStageName
  return null
}

export function effectiveStageEnteredAt(
  p: StageEnteredAtSnapshot & PropertyLaneSnapshot,
): Date | null {
  const lane = effectiveLane(p)
  if (lane === 'disposition') return p.dispoStageEnteredAt ?? null
  if (lane === 'longterm') return p.longtermStageEnteredAt ?? null
  return p.acqStageEnteredAt ?? null
}

// Phase 1 visibility rule (status-presence based — see plan §4):
//   show if acqStatus set OR (dispoStatus set AND dispoStatus != CLOSED)
// Phase 2 backfill will populate ghl{Acq,Dispo,Longterm}OppId; the rule
// tightens to require the matching opp ID at that point.
// A lane that's Lost doesn't count as visible — if all active lanes are
// Lost the row drops out of the default inventory view. Longterm only
// counts when FOLLOW_UP — DEAD is terminal (mirrors the inventory page
// SQL filter; keeps Lost-in-dispo rows from being kept alive by the
// automatic longterm-DEAD push that GHL does on Lost opps).
export function isVisibleInInventory(p: PropertyLaneSnapshot): boolean {
  if (p.acqStatus && !p.acqLostAt) return true
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED' && !p.dispoLostAt) return true
  if (p.longtermStatus === 'FOLLOW_UP' && !p.longtermLostAt) return true
  return false
}

// True if every lane that has a status set is currently Lost. Used to
// skip rows in dashboard counts and to gray-out rows in admin views.
export function isFullyLost(p: PropertyLaneSnapshot): boolean {
  const hasAcq = !!p.acqStatus
  const hasDispo = !!p.dispoStatus
  const hasLongterm = !!p.longtermStatus
  if (!hasAcq && !hasDispo && !hasLongterm) return false
  if (hasAcq && !p.acqLostAt) return false
  if (hasDispo && !p.dispoLostAt) return false
  if (hasLongterm && !p.longtermLostAt) return false
  return true
}

// Closed-deal predicate, used by KPI aggregations and lead-source ROI
// calculations. A deal is "closed" if either lane has reached terminal.
export function isClosedDeal(p: PropertyLaneSnapshot): boolean {
  return p.acqStatus === 'CLOSED' || p.dispoStatus === 'CLOSED'
}

// Dead-deal predicate (longterm.dead — agreement not closed, do not want).
export function isDeadDeal(p: PropertyLaneSnapshot): boolean {
  return p.longtermStatus === 'DEAD'
}

// Common select shape for surfaces that need the full lane snapshot.
// Use directly in Prisma queries: `select: { ...PROPERTY_LANE_SELECT }`.
export const PROPERTY_LANE_SELECT = {
  acqStatus: true,
  dispoStatus: true,
  longtermStatus: true,
  ghlAcqOppId: true,
  ghlDispoOppId: true,
  ghlLongtermOppId: true,
  ghlAcqStageName: true,
  ghlDispoStageName: true,
  ghlLongtermStageName: true,
  acqStageEnteredAt: true,
  dispoStageEnteredAt: true,
  longtermStageEnteredAt: true,
  acqLostAt: true,
  dispoLostAt: true,
  longtermLostAt: true,
} as const

// Common Prisma `where` fragments for excluding Lost rows from default
// views. Spread into a findMany/count where clause.
//
//   const props = await db.property.findMany({
//     where: { tenantId, dispoStatus: 'IN_DISPOSITION', ...WHERE_DISPO_NOT_LOST },
//   })
//
// Each fragment scopes to its own lane — adding WHERE_ACQ_NOT_LOST to a
// dispo query is a no-op, so combining is safe.
export const WHERE_ACQ_NOT_LOST = { acqLostAt: null } as const
export const WHERE_DISPO_NOT_LOST = { dispoLostAt: null } as const
export const WHERE_LONGTERM_NOT_LOST = { longtermLostAt: null } as const
