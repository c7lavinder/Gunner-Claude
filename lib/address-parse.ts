// lib/address-parse.ts
//
// Take messy address fields (zip embedded in street, city in state field,
// multiple properties joined with `&`, etc.) and produce clean
// { street, city, state, zip } — possibly multiple, when the input encodes
// several properties on one row.
//
// Used by:
//   - scripts/cleanup-address-shapes.ts  (one-shot cleanup of existing rows)
//   - lib/properties.ts                  (createProperty)
//   - lib/ghl/webhooks.ts                (handleContactChange / opp create)
//   - scripts/enrich-pending.ts          (Phase 3 contact → property fill-in)
//   - scripts/reconcile-ghl-pipelines.ts (fixMissingProperty)
//
// Patterns handled:
//   A. zip embedded in `address`     "1510 Demonbreun St Nashville, Tn 37203"
//   B. no zip anywhere               "37211 Allen St" + city + state
//   C. multi-property joined by `&`  "4506 & 4510 & 4502 & 0 Prospect Rd"
//                                    "11523 15th St Ct & 11418 16th St"
//                                    "1427 9th St,1622 12th St & 1530 2nd St"
//                                    "320 Welch Rd Apt R6, D2, & G2"  (NOT split — unit list)

import {
  standardizeStreet,
  standardizeCity,
  standardizeState,
  standardizeZip,
} from './address'

export interface ParsedAddressPart {
  street: string
  city: string
  state: string
  zip: string
}

export interface ParsedAddress {
  primary: ParsedAddressPart
  splits: ParsedAddressPart[] // additional streets sharing the same city/state/zip
}

const US_STATE_ABBRS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
])

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', wisconsin: 'WI', wyoming: 'WY',
}

const STREET_SUFFIX_TOKENS = new Set([
  'rd', 'st', 'ave', 'avenue', 'dr', 'drive', 'ln', 'lane', 'blvd', 'boulevard',
  'ct', 'court', 'cir', 'circle', 'pl', 'place', 'ter', 'terrace', 'trl', 'trail',
  'hwy', 'highway', 'pkwy', 'parkway', 'loop', 'pike', 'path', 'xing', 'crossing',
  'way', 'cv', 'cove', 'aly', 'alley', 'sq', 'square', 'pl', 'route', 'rt', 'rte',
  'expy', 'expressway',
])

const UNIT_INDICATORS = /\b(apt|apartment|ste|suite|unit|#|lot|bldg|building|fl|floor|rm|room)\b/i

// Cardinal directionals — when these appear as the trailing word in a street
// with no comma-separated city, they belong to the street, not the city
// (e.g. "832 Virginia Ct SE" → city is unknown, NOT "SE").
const DIRECTIONALS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])

/**
 * Detect whether a `&` in the street is separating units (e.g. "Apt R6, D2, & G2")
 * vs. separating distinct properties.
 */
function isUnitListAmpersand(rawStreet: string): boolean {
  const idxAmp = rawStreet.search(/&/)
  if (idxAmp === -1) return false
  const beforeAmp = rawStreet.slice(0, idxAmp)
  return UNIT_INDICATORS.test(beforeAmp)
}

/**
 * Split a unit list ("Apt R6, D2, & G2") into N streets sharing the same
 * base. One Property per unit — owner walks each unit independently.
 *
 *   "320 Welch Rd Apt R6, D2, & G2"
 *     → ["320 Welch Rd Apt R6", "320 Welch Rd Apt D2", "320 Welch Rd Apt G2"]
 *
 * Returns null if the string doesn't match the expected shape (caller falls
 * back to the no-split path).
 */
function splitUnitList(rawStreet: string): string[] | null {
  // Match: <base ending in indicator-keyword + space> <units-list>
  const m = rawStreet.match(/^(.+?\b(?:apt|apartment|ste|suite|unit|lot|bldg|building|fl|floor|rm|room)\.?\s+)(.+)$/i)
  if (!m) return null
  const base = m[1].trim()
  const unitsText = m[2].trim()
  // Split on , or & (with whitespace tolerance)
  const units = unitsText
    .split(/\s*[,&]+\s*/)
    .map(u => u.trim())
    .filter(Boolean)
  if (units.length <= 1) return null
  return units.map(u => `${base} ${u}`)
}

/**
 * Split a multi-property street into separate canonical streets.
 * Examples:
 *   "4506 & 4510 & 4502 & 0 Prospect Rd"
 *     → ["4506 Prospect Rd", "4510 Prospect Rd", "4502 Prospect Rd", "0 Prospect Rd"]
 *   "11523 15th St Ct & 11418 16th St"
 *     → ["11523 15th St Ct", "11418 16th St"]
 *   "1427 9th St,1622 12th St & 1530 2nd St"
 *     → ["1427 9th St", "1622 12th St", "1530 2nd St"]
 *   "1011&1013 40th Ave E"
 *     → ["1011 40th Ave E", "1013 40th Ave E"]
 *   "320 Welch Rd Apt R6, D2, & G2"
 *     → ["320 Welch Rd Apt R6", "320 Welch Rd Apt D2", "320 Welch Rd Apt G2"]
 */
export function splitStreets(rawStreet: string): string[] {
  const trimmed = rawStreet.trim()
  if (!trimmed) return []
  if (!/&/.test(trimmed)) return [trimmed]
  if (isUnitListAmpersand(trimmed)) {
    const unitSplits = splitUnitList(trimmed)
    return unitSplits ?? [trimmed]
  }

  // Normalize: replace any `,` that sits between two number-bearing tokens with ` & `
  // so "1427 9th St,1622 12th St & 1530 2nd St" becomes
  // "1427 9th St & 1622 12th St & 1530 2nd St".
  const normalized = trimmed.replace(/,\s*(\d)/g, ' & $1')

  const parts = normalized
    .split(/\s*&\s*/)
    .map((s) => s.replace(/^[,\s]+|[,\s]+$/g, '')) // trim commas and spaces
    .filter(Boolean)

  if (parts.length <= 1) return [trimmed]

  const isBareNumber = (s: string): boolean => /^\d+[a-z]?$/i.test(s.trim())
  // Strip the leading "<digits>[letter] " from a complete segment to get its
  // suffix portion. Note the regex doesn't allow whitespace between the
  // digits and the optional letter — so directionals like "N" / "E" remain
  // part of the borrowed suffix (e.g. "108 N Knob Creek Rd" → "N Knob Creek Rd").
  const restOf = (segment: string): string =>
    segment.replace(/^\d+[a-z]?\s+/i, '').trim()

  return parts.map((part, idx) => {
    const trimmedPart = part.trim()
    if (!isBareNumber(trimmedPart)) return trimmedPart
    // Bare number — borrow the suffix from the NEAREST complete segment
    // (preferring the previous, then the next).
    let borrowed = ''
    for (let offset = 1; offset < parts.length; offset++) {
      const prev = idx - offset
      if (prev >= 0 && !isBareNumber(parts[prev])) {
        borrowed = restOf(parts[prev])
        break
      }
      const next = idx + offset
      if (next < parts.length && !isBareNumber(parts[next])) {
        borrowed = restOf(parts[next])
        break
      }
    }
    return borrowed ? `${trimmedPart} ${borrowed}`.trim() : trimmedPart
  })
}

/**
 * Pre-clean a possibly-messy combined address string:
 *   - collapse runs of whitespace
 *   - collapse adjacent commas
 *   - trim trailing commas/whitespace
 */
function tidyCanonical(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/(?:,\s*)+/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()
}

/**
 * Parse a possibly-messy address into one (or more) clean parts.
 *
 * `address` typically holds the street; but in dirty data it can hold the
 * full "STREET, CITY, ST ZIP" string and the other fields can hold
 * fragments or duplicates. This function combines all four inputs into one
 * canonical string, then deterministically extracts zip → state → city →
 * street working right-to-left.
 */
export function parsePropertyAddress(
  rawAddress: string,
  rawCity: string | null | undefined,
  rawState: string | null | undefined,
  rawZip: string | null | undefined,
): ParsedAddress {
  const addr = (rawAddress ?? '').trim()

  // Pre-pass A: `///` (or `//`) separator — multi-property string where
  // EACH segment carries its own city/state/zip embedded. Common owner
  // shape: "700 Fowler St Old Hickory, Tn 37138 /// 809 E Old Hickory
  // Blvd Madison, Tn 37115" — both segments live on one Property row
  // with city/state/zip fields representing only one of them. Each
  // segment becomes an independent ParsedAddressPart (no shared
  // city/state/zip).
  if (/\/\/+/.test(addr)) {
    const segments = addr.split(/\s*\/\/+\s*/).map(s => s.trim()).filter(Boolean)
    if (segments.length > 1) {
      const parts = segments.map(seg =>
        // Recurse with empty rawCity/rawState/rawZip so the parser uses
        // ONLY what's embedded in the segment. Falls back to row-level
        // values only when a segment lacks its own.
        parsePropertyAddress(seg, null, null, null),
      )
      // Backfill: if any segment came out with empty city/state/zip,
      // borrow from row-level fields (rawCity/rawState/rawZip) so the
      // segment isn't worse off than the original row.
      const cleanRawCity = standardizeCity(rawCity ?? '')
      const cleanRawState = standardizeState(rawState ?? '')
      const cleanRawZip = standardizeZip(rawZip ?? '')
      const filled = parts.map(p => ({
        primary: {
          street: p.primary.street,
          city: p.primary.city || cleanRawCity,
          state: p.primary.state || cleanRawState,
          zip: p.primary.zip || cleanRawZip,
        },
        splits: p.splits.map(s => ({
          street: s.street,
          city: s.city || cleanRawCity,
          state: s.state || cleanRawState,
          zip: s.zip || cleanRawZip,
        })),
      }))
      return {
        primary: filled[0].primary,
        splits: [
          ...filled[0].splits,
          ...filled.slice(1).flatMap(f => [f.primary, ...f.splits]),
        ],
      }
    }
  }

  // Pre-pass B: dual-city case — rawCity contains "&" AND the address has
  // two street-number-led segments jammed together (with a space, no `&`).
  // Pair them index-wise. Owner shape: address="2025 Rose St 36580 Bismark
  // St", city="Carleton & New Boston", state="MI", zip="48117".
  if ((rawCity ?? '').includes('&')) {
    const cityParts = (rawCity ?? '').split(/\s*&\s*/).map(s => s.trim()).filter(Boolean)
    if (cityParts.length >= 2) {
      // Find positions where a new street starts: a digit-led token
      // following at least one space. Anchor on " <number><space>".
      const streetStarts: number[] = [0]
      const re = /\s(\d+\s+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(addr)) !== null) {
        streetStarts.push(m.index + 1)
      }
      if (streetStarts.length === cityParts.length) {
        // Slice the address into N segments aligned with cityParts
        const streetSegments: string[] = []
        for (let i = 0; i < streetStarts.length; i++) {
          const start = streetStarts[i]
          const end = i + 1 < streetStarts.length ? streetStarts[i + 1] : addr.length
          streetSegments.push(addr.slice(start, end).trim())
        }
        const parts = streetSegments.map((seg, i) =>
          parsePropertyAddress(seg, cityParts[i], rawState ?? null, rawZip ?? null),
        )
        return {
          primary: parts[0].primary,
          splits: [
            ...parts[0].splits,
            ...parts.slice(1).flatMap(p => [p.primary, ...p.splits]),
          ],
        }
      }
    }
  }

  // Combine all four fields, dedup whitespace/commas.
  const pieces = [addr, rawCity ?? '', rawState ?? '', rawZip ?? '']
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
  const canon = tidyCanonical(pieces.join(', '))

  // Step 1: collect ALL state token positions in canonical.
  const stateRe = /\b([A-Za-z]{2,})\b/g
  const stateMatches: Array<{ start: number; end: number; abbr: string }> = []
  let m: RegExpExecArray | null
  while ((m = stateRe.exec(canon)) !== null) {
    const tok = m[1]
    const tokUpper = tok.toUpperCase()
    const tokLower = tok.toLowerCase()
    if (tokUpper.length === 2 && US_STATE_ABBRS.has(tokUpper)) {
      stateMatches.push({ start: m.index, end: m.index + m[0].length, abbr: tokUpper })
    } else if (STATE_NAME_TO_ABBR[tokLower]) {
      stateMatches.push({ start: m.index, end: m.index + m[0].length, abbr: STATE_NAME_TO_ABBR[tokLower] })
    }
  }

  // Step 2: pick the BEST state match — preferring one followed immediately
  // by a 5-digit zip. Walk right-to-left so the rightmost qualifying match
  // wins. If no state has a zip after it, fall back to the last state match
  // (the row simply has no zip — Pattern B).
  let stateAbbr = ''
  let stateMatchStart = -1
  let stateMatchLen = 0
  let zip = ''
  for (let i = stateMatches.length - 1; i >= 0; i--) {
    const sm = stateMatches[i]
    const after = canon.slice(sm.end)
    const zm = /^[\s,.-]*?(\d{5})(?:-\d{4})?\b/.exec(after)
    if (zm) {
      stateAbbr = sm.abbr
      stateMatchStart = sm.start
      stateMatchLen = sm.end - sm.start
      zip = zm[1]
      break
    }
  }
  if (!stateAbbr && stateMatches.length > 0) {
    // Fallback: take the last state match — but only if it's at canonical's end
    // OR followed by a comma. Otherwise it's likely embedded in a street name
    // (e.g. "Virginia Ct SE" — "Ct" looks like Connecticut but is really
    // "Court"). This avoids common false positives.
    const sm = stateMatches[stateMatches.length - 1]
    const after = canon.slice(sm.end)
    if (after.length === 0 || /^\s*,/.test(after)) {
      stateAbbr = sm.abbr
      stateMatchStart = sm.start
      stateMatchLen = sm.end - sm.start
    }
  }

  // If parser failed to anchor a zip but rawZip is a clean 5-digit string,
  // use it. Same for state. Handles records where the structured field is
  // correct but the address column is messy (or vice versa).
  if (!zip) {
    const cleanRawZip = standardizeZip(rawZip ?? '')
    if (/^\d{5}$/.test(cleanRawZip)) zip = cleanRawZip
  }
  if (!stateAbbr) {
    const cleanRawState = standardizeState(rawState ?? '')
    if (US_STATE_ABBRS.has(cleanRawState)) stateAbbr = cleanRawState
  }

  // Step 3: strip the resolved state + zip from canon. Strip the WINNING
  // state match by its exact position (so "Virginia Beach" doesn't lose its
  // "Virginia"); then mop up any other occurrences of the abbreviation form
  // that came along as duplicates (e.g. address="Tn 37737" + state="TN 37737").
  // Never strip the full state name globally — it overlaps with city names.
  let preState = canon
  if (stateMatchStart >= 0) {
    preState = canon.slice(0, stateMatchStart) + canon.slice(stateMatchStart + stateMatchLen)
  }
  if (zip) {
    preState = preState.replace(new RegExp(`\\b${zip}(?:-\\d{4})?\\b`, 'g'), '')
  }
  if (stateAbbr) {
    // Conservative strip — only remove residue occurrences of the state
    // abbreviation that look like state-position remnants (followed by a
    // comma, end-of-string, or a 5-digit zip). A naive global strip
    // corrupts streets where the abbreviation is part of a highway name
    // ("Nc Hwy 222 W" or "Sr 31"); the lookahead avoids those.
    preState = preState.replace(
      new RegExp(`\\b${stateAbbr}\\b\\.?(?=\\s*,|\\s*$|\\s+\\d{5}\\b)`, 'gi'),
      '',
    )
  }
  preState = tidyCanonical(preState).replace(/[,\s]+$/, '').replace(/^[,\s]+/, '').trim()
  // Set `state` (uppercase abbreviation) for downstream — kept as a plain
  // alias so the rest of the function reads naturally.
  const state = stateAbbr

  // Step 3: extract city.
  // Preferred: last comma-separated segment of preState becomes the city.
  // Fallback: locate the last street-suffix token; everything after it is the city.
  let city = ''
  let street = preState
  const lastComma = preState.lastIndexOf(',')
  if (lastComma >= 0) {
    city = preState.slice(lastComma + 1).trim()
    street = preState.slice(0, lastComma).trim()
  } else {
    const tokens = preState.split(/\s+/).filter(Boolean)
    let lastSuffixIdx = -1
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i].replace(/[.,]/g, '').toLowerCase()
      if (STREET_SUFFIX_TOKENS.has(t)) {
        lastSuffixIdx = i
        break
      }
    }
    if (lastSuffixIdx >= 0 && lastSuffixIdx < tokens.length - 1) {
      // Tokens after the suffix are candidate city tokens. If they are ALL
      // directionals (e.g. "Ct SE" where the suffix grabbed "Ct"), they
      // belong to the street, not the city.
      const tail = tokens.slice(lastSuffixIdx + 1)
      const tailIsAllDirectionals = tail.every(t => DIRECTIONALS.has(t.replace(/[.,]/g, '').toLowerCase()))
      if (tailIsAllDirectionals) {
        street = preState
        city = ''
      } else {
        street = tokens.slice(0, lastSuffixIdx + 1).join(' ')
        city = tail.join(' ')
      }
    } else {
      street = preState
      city = ''
    }
  }

  // Final cleanup: remove dangling commas/whitespace.
  street = street.replace(/^[,\s]+|[,\s]+$/g, '').trim()
  city = city.replace(/^[,\s]+|[,\s]+$/g, '').trim()

  // Drop any embedded comma in the city (e.g. "Goodlettsville, Nashville" → "Goodlettsville").
  if (city.includes(',')) {
    city = city.split(',')[0].trim()
  }

  // City override: if the parser-extracted city is empty or all-digits
  // (junk from a misparsed zip), prefer the original rawCity. Also prefer
  // rawCity when state extraction failed AND rawState is invalid — that
  // means the rightmost-comma fallback latched onto a junk state value
  // (e.g. canon="… Nolensville Rd, Brentwood, Cole, 37027" → parser
  // grabbed city="Cole" because state couldn't resolve).
  const cleanRawCity = standardizeCity(rawCity ?? '')
  const rawStateForCheck = (rawState ?? '').trim()
  const rawStateInvalid = rawStateForCheck.length > 0 && !US_STATE_ABBRS.has(standardizeState(rawStateForCheck))
  if (cleanRawCity && (!city || /^\d+$/.test(city) || (state === '' && rawStateInvalid))) {
    city = cleanRawCity
  }

  // If the street ends with the city (e.g. "25327 Central Ave Joplin" + city="Joplin"),
  // strip the trailing duplicate so the street stays clean.
  if (city) {
    const cityLower = city.toLowerCase()
    const streetLower = street.toLowerCase()
    if (streetLower.endsWith(' ' + cityLower)) {
      street = street.slice(0, street.length - city.length - 1).trim()
    }
  }

  // Strip any leftover authoritative-fields residue from the END of street
  // (where city/state names tend to leak in Pattern-A inputs). End-anchored
  // only — a global strip would corrupt streets that legitimately contain
  // the city name (e.g. "8213 Harrison Bay Rd" in city "Harrison").
  // Example: street = "6825 Nolensville Rd Brentwood, Cole" + city="Brentwood"
  //          + rawState="Cole" (invalid) → "6825 Nolensville Rd".
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Loop in case both city and rawState are stacked at the end.
  for (let i = 0; i < 3; i++) {
    let changed = false
    if (city) {
      const re = new RegExp(`[\\s,]+\\b${escapeRe(city)}\\b\\.?\\s*,?\\s*$`, 'i')
      const next = street.replace(re, '').trim()
      if (next !== street) { street = next; changed = true }
    }
    const rawStateTrimmed = (rawState ?? '').trim()
    if (rawStateTrimmed && !US_STATE_ABBRS.has(standardizeState(rawStateTrimmed))) {
      const re = new RegExp(`[\\s,]+\\b${escapeRe(rawStateTrimmed)}\\b\\.?\\s*,?\\s*$`, 'i')
      const next = street.replace(re, '').trim()
      if (next !== street) { street = next; changed = true }
    }
    if (!changed) break
  }

  // Defense-in-depth: only strip the SPECIFIC resolved zip from street, never
  // any 5-digit run (street numbers like "37211 Allen St" are real).
  if (zip) {
    street = street.replace(new RegExp(`\\b${zip}(?:-\\d{4})?\\b`, 'g'), '').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim()
  }

  // Now apply standardization to every component.
  const stdState = standardizeState(state)
  const stdCity = standardizeCity(city)
  const stdZip = standardizeZip(zip)

  // Step 4: split the cleaned street if it encodes multiple properties.
  const streetParts = splitStreets(street)
  const stdStreetParts = streetParts.map((p) => standardizeStreet(p))

  const primary: ParsedAddressPart = {
    street: stdStreetParts[0] ?? '',
    city: stdCity,
    state: stdState,
    zip: stdZip,
  }
  const splits: ParsedAddressPart[] = stdStreetParts.slice(1).map((s) => ({
    street: s,
    city: stdCity,
    state: stdState,
    zip: stdZip,
  }))

  return { primary, splits }
}
