// lib/disposition/journey-status.ts
// Pure status computation for the Disposition Journey (5 sections).
// Used by the per-property journey UI AND the /disposition portfolio page
// so the same status logic powers per-property and aggregate views.

export type SectionStatus = 'not_started' | 'in_progress' | 'done'

export interface JourneyStatus {
  section1: SectionStatus  // Deal info readiness
  section2: SectionStatus  // Generate deal blast
  section3: SectionStatus  // Match buyers
  section4: SectionStatus  // Track responses
  section5: SectionStatus  // Offers & showings
  // Aggregate label for portfolio grouping on /disposition.
  // Maps to the highest-progress non-Done section, or 'closing' once
  // an offer is accepted / status flips to UNDER_CONTRACT.
  stage: 'ready_to_blast' | 'awaiting_responses' | 'in_offer' | 'closing'
}

// Minimum field set Section 1 reads to compute readiness.
// Kept narrow so /disposition portfolio query doesn't need a full
// PropertyDetail fetch.
export interface JourneyInputs {
  status: string                           // Property.status enum
  address: string | null
  askingPrice: string | null               // Decimal-as-string
  arv: string | null                       // Decimal-as-string
  description: string | null
  assignmentFee: string | null             // Decimal-as-string
  hasPhotos: boolean                       // Property has at least one photo
  hasSellerLinked: boolean                 // PropertySeller exists
  blastsSentCount: number                  // # of DealBlast rows
  buyersMatchedCount: number               // # of buyers added to this deal
  responsesCount: number                   // # of inbound buyer responses
  offersLoggedCount: number                // # of logged offers
  offersAcceptedCount: number              // # accepted (drives status=done)
}

export function computeJourneyStatus(p: JourneyInputs): JourneyStatus {
  // ── Section 1 — Deal info readiness ────────────────────────────────
  // Field list deferred per plan; sane default = the fields a buyer
  // needs to see in a blast. Tune once live.
  const required = [
    !!p.address,
    !!p.askingPrice,
    !!p.arv,
    !!p.description,
    !!p.assignmentFee,
    p.hasPhotos,
    p.hasSellerLinked,
  ]
  const filled = required.filter(Boolean).length
  const section1: SectionStatus =
    filled === required.length ? 'done'
    : filled === 0 ? 'not_started'
    : 'in_progress'

  // ── Section 2 — Generate deal blast ────────────────────────────────
  const section2: SectionStatus =
    p.blastsSentCount > 0 ? 'done' : 'not_started'

  // ── Section 3 — Match buyers ───────────────────────────────────────
  // No "done" — buyers come in over time. Rep moves on when ready.
  const section3: SectionStatus =
    p.buyersMatchedCount > 0 ? 'in_progress' : 'not_started'

  // ── Section 4 — Track responses ────────────────────────────────────
  const section4: SectionStatus =
    p.responsesCount > 0 ? 'in_progress' : 'not_started'

  // ── Section 5 — Offers & showings ──────────────────────────────────
  // Done when an offer is accepted (drives Property.status to UNDER_CONTRACT).
  const section5: SectionStatus =
    p.offersAcceptedCount > 0 ? 'done'
    : p.offersLoggedCount > 0 ? 'in_progress'
    : 'not_started'

  // ── Aggregate stage label for /disposition portfolio grouping ──────
  let stage: JourneyStatus['stage']
  if (p.status === 'UNDER_CONTRACT' || p.offersAcceptedCount > 0) {
    stage = 'closing'
  } else if (p.offersLoggedCount > 0) {
    stage = 'in_offer'
  } else if (p.responsesCount > 0 || p.buyersMatchedCount > 0) {
    stage = 'awaiting_responses'
  } else {
    // Section 1 incomplete OR no blast sent yet — still "ready to blast"
    // bucket; the row UI surfaces the readiness gap if Section 1 isn't done.
    stage = 'ready_to_blast'
  }

  return { section1, section2, section3, section4, section5, stage }
}

// Pick the section that should auto-expand on first load: first non-done.
export function firstActiveSection(s: JourneyStatus): 1 | 2 | 3 | 4 | 5 {
  if (s.section1 !== 'done') return 1
  if (s.section2 !== 'done') return 2
  if (s.section5 === 'done') return 5  // closing — show offers section
  if (s.section4 === 'in_progress') return 4
  if (s.section3 === 'in_progress') return 3
  return 2
}
