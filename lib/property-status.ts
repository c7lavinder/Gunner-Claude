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
export function effectiveStatus(p: PropertyLaneSnapshot): string {
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED') return p.dispoStatus
  if (p.acqStatus) return p.acqStatus
  if (p.longtermStatus) return p.longtermStatus
  return 'NEW_LEAD'
}

// Which lane is the "primary" one for this property — useful when the caller
// needs to know more than just the status string (e.g. to render a colored
// pill or pick which entered-at to read).
export function effectiveLane(
  p: PropertyLaneSnapshot,
): 'acquisition' | 'disposition' | 'longterm' {
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED') return 'disposition'
  if (p.acqStatus) return 'acquisition'
  if (p.longtermStatus) return 'longterm'
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
export function isVisibleInInventory(p: PropertyLaneSnapshot): boolean {
  if (p.acqStatus) return true
  if (p.dispoStatus && p.dispoStatus !== 'CLOSED') return true
  return false
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
} as const
