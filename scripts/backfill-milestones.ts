#!/usr/bin/env -S npx tsx
// scripts/backfill-milestones.ts
//
// Backfill PropertyMilestone rows from the Manus-extracted KPI scoreboard
// JSON (2024 + 2025 + 2026 sheets, ~2,631 properties). Authoritative source
// for APPOINTMENT_SET / OFFER_MADE / UNDER_CONTRACT dates. Cascade rule:
// if a property reached OFFER_MADE but doesn't have an APPOINTMENT_SET
// date in the sheet, we fill APPOINTMENT_SET at the offer date (same
// logic for any earlier-stage gap).
//
// Source data layout: scripts/data/property_milestones_backfill.json
//   metadata.{...}, properties: [{address, appointment_date, offer_date,
//   contract_date, status}]
//
// LEAD milestone: pulled from GHL contact.dateAdded when the property has
// a ghlContactId; else falls back to the earliest sheet date.
//
// Phases:
//   --phase=match    Load JSON + properties, run address matching, write
//                    scripts/data/match-report.csv. NO DB writes.
//   --phase=preview  Re-match, then enumerate the milestones we'd create
//                    (with cascade), write scripts/data/preview-report.csv
//                    + a summary. NO DB writes. Does NOT hit GHL.
//   --phase=commit   Same as preview, but executes. Fetches GHL contact
//                    dateAdded for LEAD where ghlContactId exists. Overwrites
//                    any existing milestones of the same (property, type).
//
// Conflict policy: per planning conversation, BACKFILL_SHEET overwrites
// any existing milestone for the same (property, type). Source string is
// set to 'BACKFILL_SHEET' so the run is reversible:
//   DELETE FROM property_milestones WHERE source = 'BACKFILL_SHEET';
//
// Ambiguous-match policy: when normalized address matches more than one
// Property, we pick the one whose createdAt is closest to the row's
// earliest sheet milestone date (per planning conversation).
//
// Run:
//   npx tsx scripts/backfill-milestones.ts --tenant=<slug> --phase=match
//   npx tsx scripts/backfill-milestones.ts --tenant=<slug> --phase=preview
//   npx tsx scripts/backfill-milestones.ts --tenant=<slug> --phase=commit

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { MilestoneType } from '@prisma/client'

// ─── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const tenantArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1]
const phaseArg = (args.find(a => a.startsWith('--phase='))?.split('=')[1] ?? 'match') as 'match' | 'preview' | 'commit'
const jsonPath = args.find(a => a.startsWith('--json='))?.split('=')[1]
  ?? join(process.cwd(), 'scripts/data/property_milestones_backfill.json')

if (!tenantArg) {
  console.error('Missing --tenant=<slug>. Refusing to run unscoped — backfill must target a single tenant.')
  process.exit(1)
}
if (!['match', 'preview', 'commit'].includes(phaseArg)) {
  console.error(`Unknown --phase=${phaseArg}. Use match | preview | commit.`)
  process.exit(1)
}

// ─── Sheet input ──────────────────────────────────────────────────────────

interface SheetRow {
  address: string
  appointment_date: string | null
  offer_date: string | null
  contract_date: string | null
  status: string
}

interface SheetFile {
  metadata: unknown
  properties: SheetRow[]
}

// ─── Address normalization ────────────────────────────────────────────────

// Common USPS-style abbreviations → canonical form for matching. We
// lowercase, expand abbreviations, strip punctuation, and collapse
// whitespace. The result is what we compare across the sheet and the DB.
const STREET_ABBREV: Record<string, string> = {
  st: 'street', str: 'street', street: 'street',
  ave: 'avenue', av: 'avenue', avenue: 'avenue',
  rd: 'road', road: 'road',
  dr: 'drive', drive: 'drive',
  blvd: 'boulevard', boulevard: 'boulevard',
  ln: 'lane', lane: 'lane',
  ct: 'court', crt: 'court', court: 'court',
  cir: 'circle', circle: 'circle',
  pl: 'place', place: 'place',
  hwy: 'highway', highway: 'highway',
  pkwy: 'parkway', pkway: 'parkway', parkway: 'parkway',
  pike: 'pike',
  trl: 'trail', tr: 'trail', trail: 'trail',
  ter: 'terrace', terrace: 'terrace',
  way: 'way',
  loop: 'loop',
  // Place-type words that appear in street names (matched whole-token).
  // Sheet uses abbreviations, DB usually has the full word — collapsing
  // them here was the difference between "5310 Tulip Bnd" matching
  // "5310 Tulip Bend" instead of going through fuzzy.
  mt: 'mount', mount: 'mount',
  ft: 'fort', fort: 'fort',
  mtn: 'mountain', mountain: 'mountain',
  pt: 'point', point: 'point',
  crk: 'creek', creek: 'creek',
  bnd: 'bend', bend: 'bend',
  vly: 'valley', valley: 'valley',
  fls: 'falls', falls: 'falls',
  rdg: 'ridge', ridge: 'ridge',
  cv: 'cove', cove: 'cove',
  hl: 'hill', hill: 'hill',
  hls: 'hills', hills: 'hills',
  bay: 'bay',
  spgs: 'springs', spg: 'spring', spring: 'spring', springs: 'springs',
  clb: 'club', club: 'club',
  // Directionals
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  north: 'north', south: 'south', east: 'east', west: 'west',
}

function normalize(addr: string): string {
  if (!addr) return ''
  let s = addr.toLowerCase()
  // Replace anything that isn't a letter, digit, or space with a space.
  s = s.replace(/[^a-z0-9 ]+/g, ' ')
  // Expand each token if it matches a known abbreviation.
  s = s.split(/\s+/).filter(Boolean).map(tok => STREET_ABBREV[tok] ?? tok).join(' ')
  // Drop unit markers — sheet uses "Unit R6", DB uses "Apt R6". The unit
  // identifier (R6) still matters and stays in the key; the marker word
  // is noise that prevents matching otherwise-identical addresses.
  s = s.replace(/\b(apt|unit|ste|suite|apartment)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return s
}

// Match keys: a "full" key (collapsed-no-drop) and an optional "short" key
// that's the full key minus the trailing street-type token (Street / Avenue
// / Drive / etc.). We deliberately keep BOTH because:
//   - Dropping always: "321 College Ave" and "321 College Ct" both collapse
//     to "321college" and falsely collide.
//   - Never dropping: "744 Northview" misses DB's "744 Northview Dr".
// At match time we use a symmetric lookup so missing-suffix on EITHER side
// is handled, but mismatched-suffixes on BOTH sides stays unmatched.
const STREET_TYPE_SET = new Set([
  'street', 'avenue', 'road', 'drive', 'boulevard', 'lane',
  'court', 'circle', 'place', 'highway', 'parkway', 'pike',
  'trail', 'terrace', 'way', 'loop',
])
function matchKeys(addr: string): { full: string; short: string | null } | null {
  const n = normalize(addr)
  if (!n) return null
  const tokens = n.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const last = tokens[tokens.length - 1]
  const full = tokens.join('')
  if (STREET_TYPE_SET.has(last)) {
    const short = tokens.slice(0, -1).join('')
    return { full, short }
  }
  return { full, short: null }
}

// Leading street-number, e.g., "1623B" out of "1623B 16th Avenue".
function extractNumber(addr: string): string | null {
  const n = normalize(addr)
  const m = n.match(/^(\d+[a-z]?)\b/)
  return m ? m[1] : null
}

// Extract just the street portion (number + street name + optional suffix +
// optional trailing directional) from a possibly-messy cell. Steps:
//   1. Cut at first comma / & / / (multi-address cells, comma-delimited city)
//   2. Cut at note starters (" is "/" was "/...)
//   3. Strip trailing 5-digit ZIP + 2-letter state
//   4. If the remainder contains a street-type word (Street/Ave/...),
//      cut after the LAST such occurrence — keep an optional trailing
//      directional (N/S/E/W) but drop trailing city tokens.
//
// Examples:
//   "1015 Mill St is the vacant one getting worked on..."  → "1015 Mill St"
//   "89 Crosby Street & 1000 Central St. Lowell"          → "89 Crosby Street"
//   "404 Hillside Dr, Smithfield, NC 27577"               → "404 Hillside Dr"
//   "507 Park Ave W"                                       → "507 Park Ave W"
//   "127 Shivel Drive Hendersonville TN 37075"            → "127 Shivel Drive"
//   "1623B 16th Avenue North Nashville TN 37208"          → "1623B 16th Avenue North"
const EXTRACT_STREET_TYPE_RE = /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|court|ct|circle|cir|place|pl|highway|hwy|parkway|pkwy|pike|trail|trl|terrace|ter|way|loop)\b\.?/gi
const EXTRACT_DIRECTIONAL_RE = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west|northeast|northwest|southeast|southwest)\b\.?/i
const EXTRACT_UNIT_RE = /^(apt|unit|ste|suite|apartment|#)[\s.#]*([\w-]+)/i

function extractStreet(messy: string): string | null {
  if (!messy) return null
  let s = messy.split(/[,&/]/)[0].trim()
  s = s.split(/\s+(?:is|was|has|have|had|will|gets?|got|the|that|this|these|those)\s+/i)[0].trim()
  s = s.replace(/\s+\d{5}(?:-\d{4})?\s*$/, '').trim()
  s = s.replace(/\s+[A-Z]{2}\s*$/, '').trim()

  // Find the LAST street-type word and cut after it (keeping any trailing
  // directional OR unit marker). Strips trailing city tokens that got
  // concatenated without a comma.
  const matches = [...s.matchAll(EXTRACT_STREET_TYPE_RE)]
  if (matches.length > 0) {
    const last = matches[matches.length - 1]
    const cutAt = (last.index ?? 0) + last[0].length
    const head = s.slice(0, cutAt).trim()
    const rest = s.slice(cutAt).trim()
    const unit = rest.match(EXTRACT_UNIT_RE)
    if (unit) {
      s = `${head} ${unit[0]}`.trim()
    } else {
      const dir = rest.match(EXTRACT_DIRECTIONAL_RE)
      s = dir ? `${head} ${dir[0]}`.trim() : head
    }
  }

  if (!/^\d/.test(s) || s.split(/\s+/).length < 2) return null
  return s
}

// Levenshtein distance for fuzzy matching, returning similarity in [0,1].
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const m = a.length, n = b.length
  if (m === 0 || n === 0) return 0
  const dp: number[] = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j - 1], dp[j])
      prev = tmp
    }
  }
  return 1 - dp[n] / Math.max(m, n)
}

// ─── Property loader + matcher ────────────────────────────────────────────

interface PropertyLite {
  id: string
  address: string
  city: string
  state: string
  ghlContactId: string | null
  createdAt: Date
  normAddr: string       // normalized full address (kept for the CSV report)
  keyFull: string        // collapsed-no-drop matching key
  keyShort: string | null // full minus trailing street-type token (if any)
  number: string | null   // leading street number for fuzzy bucket
}

interface MatchResult {
  row: SheetRow
  extractedStreet: string | null
  normalized: string
  property: PropertyLite | null
  confidence: 'exact' | 'fuzzy' | 'ambiguous' | 'unmatched'
  candidates: PropertyLite[] // populated when ambiguous; helpful for review
  notes: string
}

function earliestSheetDate(row: SheetRow): Date | null {
  const dates = [row.appointment_date, row.offer_date, row.contract_date]
    .filter((d): d is string => !!d)
    .map(d => new Date(d))
  if (dates.length === 0) return null
  return new Date(Math.min(...dates.map(d => d.getTime())))
}

// Ambiguous tiebreaker: pick the property whose createdAt is closest to
// the row's earliest sheet milestone date. (Per planning conversation.)
function pickClosestByCreatedAt(candidates: PropertyLite[], target: Date | null): PropertyLite {
  if (!target || candidates.length === 1) return candidates[0]
  let best = candidates[0]
  let bestDelta = Math.abs(best.createdAt.getTime() - target.getTime())
  for (const c of candidates.slice(1)) {
    const delta = Math.abs(c.createdAt.getTime() - target.getTime())
    if (delta < bestDelta) { best = c; bestDelta = delta }
  }
  return best
}

async function loadProperties(tenantId: string): Promise<PropertyLite[]> {
  const rows = await db.property.findMany({
    where: { tenantId },
    select: { id: true, address: true, city: true, state: true, ghlContactId: true, createdAt: true },
  })
  return rows.map(r => {
    const keys = matchKeys(r.address)
    return {
      ...r,
      normAddr: normalize(r.address),
      keyFull: keys?.full ?? '',
      keyShort: keys?.short ?? null,
      number: extractNumber(r.address),
    }
  })
}

function matchRow(
  row: SheetRow,
  byFullKey: Map<string, PropertyLite[]>,
  byShortKey: Map<string, PropertyLite[]>,
  byNumber: Map<string, PropertyLite[]>,
): MatchResult {
  const extracted = extractStreet(row.address)
  if (!extracted) {
    return { row, extractedStreet: null, normalized: '', property: null, confidence: 'unmatched', candidates: [], notes: 'No recognizable address in cell' }
  }
  const keys = matchKeys(extracted)
  if (!keys) {
    return { row, extractedStreet: extracted, normalized: '', property: null, confidence: 'unmatched', candidates: [], notes: 'Match key normalized to empty' }
  }

  // Three-step exact lookup. Symmetric so missing-suffix on either side hits.
  //  1. sheet keyFull → DB keyFull
  //  2. sheet keyShort → DB keyFull   (sheet has suffix, DB does not)
  //  3. sheet keyFull  → DB keyShort  (sheet has no suffix, DB does)
  let exact: PropertyLite[] | undefined = byFullKey.get(keys.full)
  if ((!exact || exact.length === 0) && keys.short) {
    exact = byFullKey.get(keys.short)
  }
  if ((!exact || exact.length === 0) && !keys.short) {
    exact = byShortKey.get(keys.full)
  }
  if (exact && exact.length === 1) {
    return { row, extractedStreet: extracted, normalized: keys.full, property: exact[0], confidence: 'exact', candidates: [], notes: '' }
  }
  if (exact && exact.length > 1) {
    const picked = pickClosestByCreatedAt(exact, earliestSheetDate(row))
    return { row, extractedStreet: extracted, normalized: keys.full, property: picked, confidence: 'ambiguous', candidates: exact, notes: `${exact.length} exact candidates — picked closest createdAt` }
  }

  // Fuzzy fallback — restricted to candidates with the same street number,
  // so we never accidentally match a different door number.
  const num = extractNumber(extracted)
  if (!num) {
    return { row, extractedStreet: extracted, normalized: keys.full, property: null, confidence: 'unmatched', candidates: [], notes: 'Could not extract street number for fuzzy fallback' }
  }
  const sameNumber = byNumber.get(num) ?? []
  if (sameNumber.length === 0) {
    return { row, extractedStreet: extracted, normalized: keys.full, property: null, confidence: 'unmatched', candidates: [], notes: `No property at street number ${num}` }
  }
  const FUZZ = 0.85
  // Compare against both keys to be charitable to suffix-mismatched candidates.
  const scored = sameNumber
    .map(p => {
      const a = similarity(keys.full, p.keyFull)
      const b = p.keyShort ? similarity(keys.full, p.keyShort) : 0
      const c = keys.short ? similarity(keys.short, p.keyFull) : 0
      return { p, score: Math.max(a, b, c) }
    })
    .filter(x => x.score >= FUZZ)
  if (scored.length === 0) {
    return { row, extractedStreet: extracted, normalized: keys.full, property: null, confidence: 'unmatched', candidates: [], notes: `No fuzzy match among ${sameNumber.length} same-number properties` }
  }
  scored.sort((a, b) => b.score - a.score)
  const top = scored[0]
  const tied = scored.filter(h => h.score >= top.score - 0.01)
  if (tied.length === 1) {
    return { row, extractedStreet: extracted, normalized: keys.full, property: top.p, confidence: 'fuzzy', candidates: [], notes: `fuzzy score ${top.score.toFixed(3)} (same number)` }
  }
  const picked = pickClosestByCreatedAt(tied.map(t => t.p), earliestSheetDate(row))
  return { row, extractedStreet: extracted, normalized: keys.full, property: picked, confidence: 'ambiguous', candidates: tied.map(t => t.p), notes: `${tied.length} fuzzy candidates at same number (top ${top.score.toFixed(3)}) — picked closest createdAt` }
}

// ─── Milestone planning (cascade rule) ────────────────────────────────────

interface PlannedMilestone {
  type: MilestoneType
  date: Date
  cascade: boolean // true when this milestone was inferred from a later stage
}

// Compute the milestones to write for one row. `leadDate` is GHL.dateAdded
// when available — null means "fall back to earliest sheet date".
function planMilestones(row: SheetRow, leadDate: Date | null): PlannedMilestone[] {
  const appt = row.appointment_date ? new Date(row.appointment_date) : null
  const offer = row.offer_date ? new Date(row.offer_date) : null
  const contract = row.contract_date ? new Date(row.contract_date) : null

  const out: PlannedMilestone[] = []

  // UNDER_CONTRACT — direct only, no cascade source.
  if (contract) out.push({ type: MilestoneType.UNDER_CONTRACT, date: contract, cascade: false })

  // OFFER_MADE — direct date or cascade from contract.
  if (offer) {
    out.push({ type: MilestoneType.OFFER_MADE, date: offer, cascade: false })
  } else if (contract) {
    out.push({ type: MilestoneType.OFFER_MADE, date: contract, cascade: true })
  }

  // APPOINTMENT_SET — direct date or cascade from earliest later stage.
  if (appt) {
    out.push({ type: MilestoneType.APPOINTMENT_SET, date: appt, cascade: false })
  } else if (offer || contract) {
    const earlierLater = [offer, contract].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0]
    out.push({ type: MilestoneType.APPOINTMENT_SET, date: earlierLater, cascade: true })
  }

  // LEAD — GHL dateAdded if present; else earliest sheet date if any.
  const earliestSheet = earliestSheetDate(row)
  if (leadDate) {
    out.push({ type: MilestoneType.LEAD, date: leadDate, cascade: false })
  } else if (earliestSheet) {
    out.push({ type: MilestoneType.LEAD, date: earliestSheet, cascade: true })
  }

  return out
}

// ─── CSV output ───────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(path: string, header: string[], rows: Array<Array<unknown>>): void {
  const out = [header.join(',')]
  for (const r of rows) out.push(r.map(csvEscape).join(','))
  writeFileSync(path, out.join('\n'), 'utf8')
}

// ─── Throttled iteration ──────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
  interItemDelayMs: number = 0,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
      if (interItemDelayMs > 0) await new Promise(r => setTimeout(r, interItemDelayMs))
    }
  }
  const workers: Promise<void>[] = []
  for (let k = 0; k < concurrency; k++) workers.push(worker())
  await Promise.all(workers)
  return results
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n=== Milestone backfill — tenant=${tenantArg} phase=${phaseArg} ===\n`)

  // Resolve tenant by slug
  const tenant = await db.tenant.findFirst({
    where: { slug: tenantArg },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) {
    console.error(`Tenant slug '${tenantArg}' not found.`)
    process.exit(1)
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`)

  // Load sheet
  let sheet: SheetFile
  try {
    const raw = readFileSync(jsonPath, 'utf8')
    sheet = JSON.parse(raw) as SheetFile
  } catch (err) {
    console.error(`Failed to read JSON at ${jsonPath}:`, err instanceof Error ? err.message : err)
    console.error('Drop the Manus export at scripts/data/property_milestones_backfill.json or pass --json=<path>.')
    process.exit(1)
  }
  console.log(`Sheet rows: ${sheet.properties.length}`)

  // Load properties
  const properties = await loadProperties(tenant.id)
  console.log(`Properties in DB for tenant: ${properties.length}\n`)

  // Three indexes for the symmetric exact-lookup + same-number fuzzy fallback.
  //   byFullKey: collapsed-with-suffix key → properties
  //   byShortKey: collapsed-minus-trailing-suffix key → properties (only
  //     indexed for properties whose address ends in a street-type word)
  //   byNumber: leading street number → properties (fuzzy bucket)
  const byFullKey = new Map<string, PropertyLite[]>()
  const byShortKey = new Map<string, PropertyLite[]>()
  const byNumber = new Map<string, PropertyLite[]>()
  for (const p of properties) {
    if (p.keyFull) {
      const arr = byFullKey.get(p.keyFull) ?? []
      arr.push(p)
      byFullKey.set(p.keyFull, arr)
    }
    if (p.keyShort) {
      const arr = byShortKey.get(p.keyShort) ?? []
      arr.push(p)
      byShortKey.set(p.keyShort, arr)
    }
    if (p.number) {
      const arr = byNumber.get(p.number) ?? []
      arr.push(p)
      byNumber.set(p.number, arr)
    }
  }

  // Match every row
  const matches: MatchResult[] = sheet.properties.map(row => matchRow(row, byFullKey, byShortKey, byNumber))
  const summary = {
    exact: matches.filter(m => m.confidence === 'exact').length,
    fuzzy: matches.filter(m => m.confidence === 'fuzzy').length,
    ambiguous: matches.filter(m => m.confidence === 'ambiguous').length,
    unmatched: matches.filter(m => m.confidence === 'unmatched').length,
  }
  console.log('Match summary:')
  console.log(`  exact      : ${summary.exact}`)
  console.log(`  fuzzy      : ${summary.fuzzy}`)
  console.log(`  ambiguous  : ${summary.ambiguous}  (auto-picked closest createdAt)`)
  console.log(`  unmatched  : ${summary.unmatched}`)

  // Phase 1: write match report
  const matchCsvPath = join(process.cwd(), 'scripts/data/match-report.csv')
  writeCsv(matchCsvPath,
    ['confidence', 'sheet_address', 'extracted', 'normalized', 'matched_property_id', 'matched_address', 'matched_city', 'matched_state', 'matched_created_at', 'candidates_count', 'notes'],
    matches.map(m => [
      m.confidence,
      m.row.address,
      m.extractedStreet ?? '',
      m.normalized,
      m.property?.id ?? '',
      m.property?.address ?? '',
      m.property?.city ?? '',
      m.property?.state ?? '',
      m.property?.createdAt.toISOString() ?? '',
      m.candidates.length,
      m.notes,
    ]),
  )
  console.log(`\nMatch report written to ${matchCsvPath}`)

  if (phaseArg === 'match') {
    console.log('\nPhase=match complete. Review the CSV, then re-run with --phase=preview.')
    return
  }

  // Phase 2+: plan milestones. For preview we skip GHL fetches and use the
  // sheet-earliest fallback for LEAD; the commit phase fetches dateAdded.
  const resolved = matches.filter(m => m.property !== null) as Array<MatchResult & { property: PropertyLite }>
  console.log(`\nResolved matches (will plan milestones): ${resolved.length}`)

  let ghlDateAddedByContact: Map<string, Date | null> = new Map()
  if (phaseArg === 'commit') {
    // Fetch GHL dateAdded for each unique ghlContactId, throttled.
    const contactIds = Array.from(new Set(resolved.map(r => r.property.ghlContactId).filter((x): x is string => !!x)))
    console.log(`Fetching dateAdded for ${contactIds.length} GHL contacts...`)
    let ghl
    try {
      ghl = await getGHLClient(tenant.id)
    } catch (err) {
      console.error('Could not init GHL client:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
    // GHL marketplace rate limit is ~10 req/s burst. Keep concurrency low and
    // add a small inter-request delay so we don't trip 429 even after the
    // client's built-in Retry-After backoff is exhausted.
    let fetched = 0
    let rateLimited = 0
    const results = await mapWithConcurrency(contactIds, 2, async (contactId) => {
      try {
        const contact = await ghl.getContact(contactId)
        const d = contact?.dateAdded ? new Date(contact.dateAdded) : null
        fetched++
        if (fetched % 100 === 0) console.log(`  fetched ${fetched}/${contactIds.length}`)
        return [contactId, d] as const
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('429')) rateLimited++
        if (rateLimited <= 5 || rateLimited % 50 === 0) {
          console.warn(`  getContact ${contactId} failed: ${msg}`)
        }
        return [contactId, null] as const
      }
    }, 150)
    if (rateLimited > 0) console.warn(`  ${rateLimited} contacts failed with 429 — their LEAD will use earliest sheet date instead of GHL dateAdded`)
    ghlDateAddedByContact = new Map(results)
    console.log(`Fetched dateAdded for ${ghlDateAddedByContact.size} contacts`)
  }

  // Plan milestones per resolved row
  interface Plan {
    propertyId: string
    address: string
    milestones: PlannedMilestone[]
  }
  const plans: Plan[] = resolved.map(m => {
    const leadDate = m.property.ghlContactId ? (ghlDateAddedByContact.get(m.property.ghlContactId) ?? null) : null
    return {
      propertyId: m.property.id,
      address: m.property.address,
      milestones: planMilestones(m.row, leadDate),
    }
  })

  const typeCounts: Record<string, { direct: number; cascade: number }> = {}
  for (const p of plans) {
    for (const ms of p.milestones) {
      const k = ms.type
      typeCounts[k] ??= { direct: 0, cascade: 0 }
      if (ms.cascade) typeCounts[k].cascade++
      else typeCounts[k].direct++
    }
  }
  console.log('\nMilestones to write (direct + cascade):')
  for (const t of Object.keys(typeCounts).sort()) {
    const c = typeCounts[t]
    console.log(`  ${t.padEnd(20)} direct=${c.direct}  cascade=${c.cascade}  total=${c.direct + c.cascade}`)
  }

  const previewCsvPath = join(process.cwd(), 'scripts/data/preview-report.csv')
  const previewRows: Array<Array<unknown>> = []
  for (const p of plans) {
    for (const ms of p.milestones) {
      previewRows.push([p.propertyId, p.address, ms.type, ms.date.toISOString().slice(0, 10), ms.cascade ? 'cascade' : 'direct'])
    }
  }
  writeCsv(previewCsvPath, ['property_id', 'address', 'milestone_type', 'date', 'origin'], previewRows)
  console.log(`\nPreview report written to ${previewCsvPath}`)

  if (phaseArg === 'preview') {
    console.log('\nPhase=preview complete. No DB writes. Re-run with --phase=commit to execute.')
    return
  }

  // ─── Phase 3: commit ───────────────────────────────────────────────────
  console.log('\n--- COMMIT PHASE ---')
  console.log('Per planning conversation: any existing milestone of the same')
  console.log('(property, type) will be REPLACED with the backfill value.')

  let deleted = 0
  let created = 0
  const startedAt = Date.now()

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]
    if (i % 100 === 0) console.log(`  ${i}/${plans.length}  deleted=${deleted} created=${created}`)
    if (p.milestones.length === 0) continue
    const typesForThisProperty = Array.from(new Set(p.milestones.map(m => m.type)))
    try {
      await db.$transaction(async (tx) => {
        const del = await tx.propertyMilestone.deleteMany({
          where: { tenantId: tenant.id, propertyId: p.propertyId, type: { in: typesForThisProperty } },
        })
        deleted += del.count
        await tx.propertyMilestone.createMany({
          data: p.milestones.map(ms => ({
            tenantId: tenant.id,
            propertyId: p.propertyId,
            type: ms.type,
            source: 'BACKFILL_SHEET',
            notes: ms.cascade ? 'Cascade-filled from sheet backfill' : 'Sheet backfill',
            createdAt: ms.date,
          })),
        })
        created += p.milestones.length
      })
    } catch (err) {
      console.warn(`  property ${p.propertyId} (${p.address}) failed:`, err instanceof Error ? err.message : err)
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nCommit done in ${elapsed}s`)
  console.log(`  deleted: ${deleted}  created: ${created}`)
  console.log(`\nReversible: DELETE FROM property_milestones WHERE source = 'BACKFILL_SHEET';`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
