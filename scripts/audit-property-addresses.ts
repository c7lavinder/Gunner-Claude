#!/usr/bin/env -S npx tsx
// scripts/audit-property-addresses.ts
//
// Walk every Property and run a battery of heuristic checks against
// {address, city, state, zip}. Bucket findings by issue type so the
// owner can triage. Read-only — no writes.
//
// Pairs with cleanup-address-shapes.ts: rows tagged "auto-fixable" are
// caught by the parser when --scan-all runs; rows tagged "manual-review"
// have shapes the parser can't safely repair (incomplete addresses,
// parcel IDs, etc.).
//
// Run:
//   npx tsx scripts/audit-property-addresses.ts
//   npx tsx scripts/audit-property-addresses.ts --tenant new-again-houses
//   npx tsx scripts/audit-property-addresses.ts --code E007
//
// Issue codes:
//   E001 — empty address
//   E002 — no leading street number
//   E003 — address still contains a US state abbreviation
//   E004 — address still contains a 5-digit zip
//   E005 — address contains '&' (multi-property — fixable)
//   E006 — address contains '/' (multi-property — fixable)
//   E007 — address contains ',' (city/state embedded — likely fixable)
//   E008 — city contains digits (zip in city — likely fixable)
//   E009 — city contains comma (cleanup target)
//   E010 — city contains 2-letter state abbreviation suffix
//   E011 — state is not a valid US state code
//   E012 — zip not exactly 5 digits
//   E013 — city missing
//   E014 — state missing
//   E015 — address contains "Parcel" / "Tax ID" / parcel-id shape
//   E016 — address has 2+ street-number-led tokens (potential dual)
//   E017 — apt/unit indicator with no unit id ("Apt" alone)
//   E018 — duplicate canonical address in same tenant

import { db } from '../lib/db/client'
import { parsePropertyAddress } from '../lib/address-parse'

const args = process.argv.slice(2)
const TENANT_SLUG = (() => {
  const i = args.indexOf('--tenant')
  return i >= 0 ? args[i + 1] : undefined
})()
const ONLY_CODE = (() => {
  const i = args.indexOf('--code')
  return i >= 0 ? args[i + 1] : undefined
})()

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

interface Row {
  id: string
  address: string
  city: string | null
  state: string | null
  zip: string | null
  ghlContactId: string | null
  marketId: string | null
}

interface Finding {
  code: string
  desc: string
  parserWouldFix: boolean
  row: Row
}

function checkRow(row: Row, dupeIndex: Map<string, string[]>, reviewedIds: Set<string>): Finding[] {
  const findings: Finding[] = []
  const addr = (row.address ?? '').trim()
  const city = (row.city ?? '').trim()
  const state = (row.state ?? '').trim()
  const zip = (row.zip ?? '').trim()

  // Run the parser to determine whether the cleanup script would fix
  // this row on next --scan-all.
  const parsed = parsePropertyAddress(addr, city, state, zip)
  const parserWouldFix =
    parsed.primary.street !== addr ||
    parsed.primary.city !== city ||
    parsed.primary.state !== state ||
    parsed.primary.zip !== zip ||
    parsed.splits.length > 0

  // E001 — empty address
  if (!addr) {
    findings.push({ code: 'E001', desc: 'empty address', parserWouldFix: false, row })
    return findings // bail early, other checks aren't useful
  }

  // E002 — no leading street number (suppressed if owner has marked this
  // row as reviewed via scripts/mark-no-number-rows-reviewed.ts)
  if (!/^\d/.test(addr) && !/^lot\s+\d/i.test(addr) && !reviewedIds.has(row.id)) {
    findings.push({ code: 'E002', desc: 'no leading street number', parserWouldFix: false, row })
  }

  // E003 — address still contains a US state abbreviation in a STATE
  // POSITION (followed by a comma, end-of-string, or a 5-digit zip).
  // "Ct" / "St" / "Dr" as a street suffix is NOT flagged.
  // Only flag when the abbrev is followed by `, X` (more text), a 5-digit
  // zip, or both. End-of-string trailing "Ct" is a Court suffix, not a
  // Connecticut residue.
  const stateMatch = addr.match(/\b([A-Z][A-Za-z])\b(?=\s+\d{5}\b|\s*,\s*\S)/)
  if (stateMatch && US_STATES.has(stateMatch[1].toUpperCase())) {
    findings.push({ code: 'E003', desc: `address contains state abbreviation "${stateMatch[1]}" at state position`, parserWouldFix, row })
  }

  // E004 — address ends with a 5-digit zip (not a leading street number)
  if (/\b\d{5}\b\s*$/.test(addr)) {
    findings.push({ code: 'E004', desc: 'address ends with a 5-digit zip', parserWouldFix, row })
  }

  // E005 — address contains '&' (multi-property)
  if (/&/.test(addr)) {
    findings.push({ code: 'E005', desc: 'address contains "&" (multi-property)', parserWouldFix, row })
  }

  // E006 — address contains '/'
  if (/\//.test(addr)) {
    findings.push({ code: 'E006', desc: 'address contains "/"', parserWouldFix, row })
  }

  // E007 — address contains ',' (city/state likely embedded)
  if (/,/.test(addr)) {
    findings.push({ code: 'E007', desc: 'address contains "," (city/state embedded)', parserWouldFix, row })
  }

  // E008 — city contains digits
  if (city && /\d/.test(city)) {
    findings.push({ code: 'E008', desc: `city contains digits ("${city}")`, parserWouldFix, row })
  }

  // E009 — city contains comma
  if (city && city.includes(',')) {
    findings.push({ code: 'E009', desc: `city contains comma ("${city}")`, parserWouldFix, row })
  }

  // E010 — city ends with a 2-letter state abbreviation
  const cityTail = city.split(/\s+/).pop()?.toUpperCase()
  if (cityTail && cityTail.length === 2 && US_STATES.has(cityTail)) {
    findings.push({ code: 'E010', desc: `city ends with state abbreviation ("${city}")`, parserWouldFix, row })
  }

  // E011 — state is not a valid US state code
  if (state && !US_STATES.has(state.toUpperCase())) {
    findings.push({ code: 'E011', desc: `state "${state}" is not a valid US state code`, parserWouldFix, row })
  }

  // E012 — zip not exactly 5 digits
  if (zip && !/^\d{5}$/.test(zip)) {
    findings.push({ code: 'E012', desc: `zip "${zip}" is not 5 digits`, parserWouldFix, row })
  }

  // E013 — city missing
  if (!city) {
    findings.push({ code: 'E013', desc: 'city missing', parserWouldFix, row })
  }

  // E014 — state missing
  if (!state) {
    findings.push({ code: 'E014', desc: 'state missing', parserWouldFix, row })
  }

  // E015 — parcel id / tax id text in address
  if (/\b(parcel|tax\s*id|apn)\b/i.test(addr)) {
    findings.push({ code: 'E015', desc: 'address contains "Parcel/Tax ID/APN"', parserWouldFix: false, row })
  }

  // E016 — address has 2+ street-number-led tokens (potential dual).
  // Skip apt-unit lists AND highway / route addresses where a numeric
  // road designation ("Hwy 61", "US 70", "County Rd 425", "State Route
  // 31", "I 40", "Sr 50", "NC Hwy 222") trails the street number and is
  // not actually a second property.
  const isUnitList = /\b(?:apt|apartment|ste|suite|unit|lot|bldg|building|fl|floor|rm|room)\b/i.test(addr)
  const isHighway = /\b(?:hwy|highway|route|rt|rte|us|cr|county\s+rd|state\s+route|sr|i-?\d+|interstate)\b/i.test(addr)
  if (!isUnitList && !isHighway && /^\d+\s.*\s\d+\s/.test(addr)) {
    findings.push({ code: 'E016', desc: 'address has 2+ street-number sequences (dual-property?)', parserWouldFix, row })
  }

  // E017 — apt/unit indicator at end with no unit id
  if (/\b(apt|apartment|ste|suite|unit|bldg|building|fl|floor|rm|room)\.?\s*$/i.test(addr)) {
    findings.push({ code: 'E017', desc: 'apt/unit indicator with no unit id', parserWouldFix: false, row })
  }

  // E018 — duplicate canonical (same tenant, same primary fields)
  const canon = `${addr.toLowerCase()}|${city.toLowerCase()}|${state.toLowerCase()}|${zip}`
  const dupeIds = dupeIndex.get(canon) ?? []
  if (dupeIds.length > 1) {
    findings.push({ code: 'E018', desc: `duplicate canonical (${dupeIds.length} rows share this address)`, parserWouldFix: false, row })
  }

  return findings
}

async function main() {
  const tenants = await db.tenant.findMany({
    where: TENANT_SLUG ? { slug: TENANT_SLUG } : {},
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    const rows: Row[] = await db.property.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true, address: true, city: true, state: true, zip: true,
        ghlContactId: true, marketId: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Build duplicate index
    const dupeIndex = new Map<string, string[]>()
    for (const r of rows) {
      const canon = `${(r.address ?? '').toLowerCase()}|${(r.city ?? '').toLowerCase()}|${(r.state ?? '').toLowerCase()}|${(r.zip ?? '')}`
      const arr = dupeIndex.get(canon) ?? []
      arr.push(r.id)
      dupeIndex.set(canon, arr)
    }

    // Pull every cleanup.address_reviewed audit row for this tenant —
    // owner-confirmed rows that should be suppressed from E002.
    const reviewedAudits = await db.auditLog.findMany({
      where: { tenantId: tenant.id, action: 'cleanup.address_reviewed' },
      select: { resourceId: true },
    })
    const reviewedIds = new Set(reviewedAudits.map(a => a.resourceId).filter((id): id is string => id !== null))

    const findings: Finding[] = []
    for (const r of rows) {
      findings.push(...checkRow(r, dupeIndex, reviewedIds))
    }

    const filtered = ONLY_CODE ? findings.filter(f => f.code === ONLY_CODE) : findings
    console.log(`\n=== [${tenant.slug}] total rows scanned: ${rows.length} | findings: ${filtered.length} (${ONLY_CODE ?? 'all codes'}) ===`)

    // Group by code
    const byCode = new Map<string, Finding[]>()
    for (const f of filtered) {
      const arr = byCode.get(f.code) ?? []
      arr.push(f)
      byCode.set(f.code, arr)
    }

    const sorted = [...byCode.entries()].sort()
    for (const [code, fs] of sorted) {
      const fixable = fs.filter(f => f.parserWouldFix).length
      console.log(`\n${code} — ${fs[0].desc.split(' ').slice(0, 6).join(' ')}…  (${fs.length} rows, ${fixable} parser-fixable)`)
    }

    // Detailed dump
    console.log(`\n--- DETAIL (grouped by code) ---`)
    for (const [code, fs] of sorted) {
      console.log(`\n${code} (${fs.length}):`)
      for (const f of fs.slice(0, 200)) {
        const r = f.row
        const fix = f.parserWouldFix ? ' [parser-fixable]' : ''
        console.log(
          `  ${r.id.slice(0, 12)}…  "${r.address}"  |  ${r.city ?? ''} ${r.state ?? ''} ${r.zip ?? ''}  |  ${f.desc}${fix}`,
        )
      }
      if (fs.length > 200) console.log(`  ... and ${fs.length - 200} more`)
    }

    // Cross-tab: parser-fixable vs manual
    const totalRows = rows.length
    const offendingRows = new Set(filtered.map(f => f.row.id)).size
    const fixableRows = new Set(filtered.filter(f => f.parserWouldFix).map(f => f.row.id)).size
    const manualRows = offendingRows - fixableRows
    console.log(`\n[${tenant.slug}] summary:`)
    console.log(`  total properties:       ${totalRows}`)
    console.log(`  rows with ANY issue:    ${offendingRows}`)
    console.log(`  parser-fixable rows:    ${fixableRows} (re-run cleanup-address-shapes --scan-all --apply)`)
    console.log(`  manual-review rows:     ${manualRows}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
