// lib/disposition/property-details-readiness.ts
// Single source of truth for Section 1's "Property details — all fields
// filled" check. The dispo journey gates Section 2 (blast generation) on
// every field a buyer needs to see being filled. Listed once here so the
// per-property check + the /disposition portfolio aggregate both honor
// the same definition.

export interface PropertyDetailsSnapshot {
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: string | null   // PropertyDetail serializes Decimal → string
  propertyType: string | null
  occupancy: string | null
  projectType: string[]
  propertyMarkets: string[]
  arv: string | null
  constructionEstimate: string | null
  mao: string | null
  // riskFactor intentionally NOT a gate — it's a *computed display* in
  // the persistent panel: (construction + max offer) / arv × 100. The
  // panel auto-renders the percentage as soon as the 3 inputs are
  // filled (which the readiness check already requires). The schema
  // column `Property.riskFactor` exists but the UI never writes to it,
  // so checking it would always fail. (Session 77 hotfix on 2026-05-08.)
  riskFactor?: string | null
  // propertyCondition is intentionally NOT in this snapshot — it's a top-
  // level summary string that has no dedicated UI in the persistent
  // Property Details panel (only the 4 sub-conditions below have edit
  // cells). It's filled by AI / vendor enrichment, not by the rep typing
  // it in. Including it forced a "Property condition" gate the rep
  // couldn't clear from the panel. (Session 77 hotfix on 2026-05-08.)
  roofCondition: string | null
  windowsCondition: string | null
  sidingCondition: string | null
  exteriorCondition: string | null
  comparableRisk: string | null
  basementStatus: string | null
  curbAppeal: string | null
  neighborsGrade: string | null
  parkingType: string | null
  yardGrade: string | null
  locationGrade: string | null
  marketRisk: string | null
}

interface FieldSpec {
  label: string
  filled: (p: PropertyDetailsSnapshot) => boolean
}

const FIELDS: FieldSpec[] = [
  { label: 'Beds',                 filled: p => p.beds != null },
  { label: 'Baths',                filled: p => p.baths != null },
  { label: 'Sqft',                 filled: p => p.sqft != null },
  { label: 'Year built',           filled: p => p.yearBuilt != null },
  { label: 'Lot size',             filled: p => !!p.lotSize },
  { label: 'Property type',        filled: p => !!p.propertyType },
  { label: 'Occupancy',            filled: p => !!p.occupancy },
  { label: 'Project type',         filled: p => p.projectType.length > 0 },
  { label: 'Markets',              filled: p => p.propertyMarkets.length > 0 },
  { label: 'ARV',                  filled: p => !!p.arv },
  { label: 'Construction estimate', filled: p => !!p.constructionEstimate },
  { label: 'MAO',                  filled: p => !!p.mao },
  { label: 'Roof',                 filled: p => !!p.roofCondition },
  { label: 'Windows',              filled: p => !!p.windowsCondition },
  { label: 'Siding',               filled: p => !!p.sidingCondition },
  { label: 'Exterior',             filled: p => !!p.exteriorCondition },
  { label: 'Comp risk',            filled: p => !!p.comparableRisk },
  { label: 'Basement',             filled: p => !!p.basementStatus },
  { label: 'Curb appeal',          filled: p => !!p.curbAppeal },
  { label: 'Neighbors',            filled: p => !!p.neighborsGrade },
  { label: 'Parking',              filled: p => !!p.parkingType },
  { label: 'Yard',                 filled: p => !!p.yardGrade },
  { label: 'Location grade',       filled: p => !!p.locationGrade },
  { label: 'Market risk',          filled: p => !!p.marketRisk },
]

// Role-string normalizer for the Section 1 "Disposition Manager assigned"
// gate. The PropertyTeamMember UI writes pretty strings ("Disposition
// Manager"); some other call sites use the User-role enum form
// ("DISPOSITION_MANAGER"). Compare normalized: lowercased, non-letters
// stripped. Returns true for any flavor of "disposition manager" and
// nothing else.
export function isDispoManagerRole(role: string | null | undefined): boolean {
  if (!role) return false
  return role.toLowerCase().replace(/[^a-z]/g, '') === 'dispositionmanager'
}

export function checkPropertyDetailsReadiness(p: PropertyDetailsSnapshot): {
  allFilled: boolean
  filledCount: number
  totalCount: number
  missing: string[]
} {
  const missing = FIELDS.filter(f => !f.filled(p)).map(f => f.label)
  return {
    allFilled: missing.length === 0,
    filledCount: FIELDS.length - missing.length,
    totalCount: FIELDS.length,
    missing,
  }
}
