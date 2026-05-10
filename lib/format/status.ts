// lib/format/status.ts
//
// Plain-English humanizers for the enum fields on Property and OutreachLog.
// Anywhere we surface these to a user — UI, AI prompts, story output — should
// route through here so we never leak the raw Prisma enum value (the
// `DISPO_NEW` / `IN_DISPOSITION` shape) into something a human reads.
//
// Adding a new enum value? Add it to the matching map below. Unmapped values
// fall through to a Title-Cased version of the underscore string so we never
// crash; the fallback is intentional but should be considered a missing entry.

import type {
  AcqStatus,
  DispoStatus,
  LongtermStatus,
} from '@prisma/client'

const ACQ_LABELS: Record<AcqStatus, string> = {
  NEW_LEAD: 'New lead',
  APPOINTMENT_SET: 'Appointment set',
  OFFER_MADE: 'Offer made',
  UNDER_CONTRACT: 'Under contract',
  CLOSED: 'Closed',
}

const DISPO_LABELS: Record<DispoStatus, string> = {
  IN_DISPOSITION: 'In disposition',
  DISPO_PUSHED: 'Pushed to buyers',
  DISPO_OFFERS: 'Offers in',
  DISPO_CONTRACTED: 'Buyer contracted',
  CLOSED: 'Closed',
}

const LONGTERM_LABELS: Record<LongtermStatus, string> = {
  FOLLOW_UP: 'Long-term follow-up',
  DEAD: 'Dead',
}

// Outreach + showing + offer outcome labels — these are stored as free strings
// (not Prisma enums) but we have a known set in the wild. Anything else falls
// through to title-case.
const OUTREACH_LABELS: Record<string, string> = {
  // Showing statuses
  Scheduled: 'Showing scheduled',
  Showed: 'Buyer showed up',
  Completed: 'Showing completed',
  'No Show': 'Buyer no-show',
  'No-Show': 'Buyer no-show',
  Cancelled: 'Showing cancelled',
  // Offer statuses
  Submitted: 'Offer submitted',
  Accepted: 'Offer accepted',
  Rejected: 'Offer rejected',
  Countered: 'Counter received',
  Withdrawn: 'Offer withdrawn',
  Expired: 'Offer expired',
}

export function formatAcqStatus(s: AcqStatus | null | undefined): string | null {
  if (!s) return null
  return ACQ_LABELS[s] ?? titleCase(s)
}

export function formatDispoStatus(s: DispoStatus | null | undefined): string | null {
  if (!s) return null
  return DISPO_LABELS[s] ?? titleCase(s)
}

export function formatLongtermStatus(s: LongtermStatus | null | undefined): string | null {
  if (!s) return null
  return LONGTERM_LABELS[s] ?? titleCase(s)
}

export function formatOutreachOutcome(s: string | null | undefined): string | null {
  if (!s) return null
  return OUTREACH_LABELS[s] ?? titleCase(s)
}

// Combines all three lane statuses into a single human description suitable
// for an AI prompt. Empty lanes are skipped — we never write "Acquisition: —".
export function describePropertyStage(p: {
  acqStatus: AcqStatus | null
  dispoStatus: DispoStatus | null
  longtermStatus: LongtermStatus | null
}): string {
  const parts: string[] = []
  const acq = formatAcqStatus(p.acqStatus)
  const dispo = formatDispoStatus(p.dispoStatus)
  const lt = formatLongtermStatus(p.longtermStatus)
  if (acq) parts.push(`Acquisition: ${acq}`)
  if (dispo) parts.push(`Disposition: ${dispo}`)
  if (lt) parts.push(`Long-term: ${lt}`)
  return parts.length > 0 ? parts.join(', ') : 'Stage not set'
}

// Last-resort fallback — turn `IN_DISPOSITION` into "In disposition" so a
// missing entry above never leaks the raw enum to a human.
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w, i) => i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ')
}
