// lib/courtlistener/client.ts
//
// CourtListener API client. Base: https://www.courtlistener.com/api/rest/v3
// Auth: `Authorization: Token <key>` header.
//
// What we use this for: search by owner name → bankruptcy, divorce, civil
// judgment, foreclosure, probate cases. Coverage is strongest for federal
// courts (PACER/RECAP archive); state court coverage varies. Free tier
// allows 5,000 requests/hour — way more than we need.
//
// Docs: https://www.courtlistener.com/help/api/rest/

const BASE_URL = 'https://www.courtlistener.com/api/rest/v3'

function getApiKey(): string {
  const key = process.env.COURTLISTENER_API_KEY
  if (!key) throw new Error('COURTLISTENER_API_KEY not configured')
  return key
}

export type CaseType = 'bankruptcy' | 'divorce' | 'civil' | 'foreclosure' | 'probate' | 'other'

export interface CourtListenerCase {
  caseName: string | null
  court: string | null              // e.g. "C.D. Cal." or "Bankr. M.D. Tenn."
  courtId: string | null            // e.g. "cacd" | "tnmdb"
  dateFiled: string | null
  dateTerminated: string | null
  docketNumber: string | null
  natureOfSuit: string | null       // federal nature-of-suit code (civil cases)
  absoluteUrl: string | null        // courtlistener.com/docket/...
  caseType: CaseType
  caseStatus?: string               // derived — "open" | "terminated"
}

export interface CourtListenerSearchResult {
  searchedAt: string
  party: string
  cases: CourtListenerCase[]
  bankruptcyCount: number
  divorceCount: number
  civilJudgmentCount: number
  foreclosureCount: number
  probateCount: number
  latest: {
    bankruptcy?: CourtListenerCase
    divorce?: CourtListenerCase
    civilJudgment?: CourtListenerCase
    foreclosure?: CourtListenerCase
    probate?: CourtListenerCase
  }
}

/**
 * Search CourtListener for cases matching a party name. Returns a normalized
 * bundle with case classification, counts, and latest-per-type.
 *
 * IMPORTANT: CourtListener's `q=` and `party_name=` parameters both do
 * tokenized / full-text matching, which causes massive false-positive
 * counts for common names (e.g. "Kimberly Dutcher" returned 13k+ hits from
 * multi-district litigation cases that merely mentioned the name). To
 * compensate we:
 *   1. Scope to courts within the seller's state (`state` option), using
 *      the hardcoded COURT_IDS_BY_STATE map below — keeps federal bankruptcy
 *      + civil noise from other states out of the result set.
 *   2. Client-side filter: only count a case when its `caseName` contains
 *      the *full quoted name* as a substring (catches "First Last" but not
 *      "First ... Last" scattered across unrelated parties).
 *   3. Hard cap at 20 cases post-filter.
 */
export async function searchCases(
  partyName: string,
  opts: { state?: string; limit?: number } = {},
): Promise<CourtListenerSearchResult | null> {
  const limit = opts.limit ?? 20
  const party = partyName.trim()
  if (!party) return null

  const url = new URL(`${BASE_URL}/search/`)
  url.searchParams.set('type', 'r')
  url.searchParams.set('q', `"${party}"`)
  url.searchParams.set('order_by', 'dateFiled desc')

  // Scope by state — CourtListener accepts multiple `court=` params.
  if (opts.state) {
    const courts = COURT_IDS_BY_STATE[opts.state.toUpperCase()] ?? []
    for (const c of courts) url.searchParams.append('court', c)
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Token ${getApiKey()}`,
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[CourtListener] API error: ${res.status} ${text}`)
      return null
    }

    const body = await res.json() as { count?: number; results?: Array<Record<string, unknown>> }
    const allResults = body.results ?? []

    // Client-side filter: exact full-name substring match on caseName
    const needle = party.toLowerCase()
    const filteredResults = allResults.filter(r => {
      const caseName = String(r.caseName ?? r.case_name ?? '').toLowerCase()
      return caseName.includes(needle)
    })
    const results = filteredResults.slice(0, limit)

    // The slice happened above to cap post-filter. Build normalized shape:
    const normalized: CourtListenerCase[] = results.map(r => {
      const court = str(r.court_citation_string) ?? str(r.court_id_full) ?? str(r.court)
      const courtId = str(r.court) ?? str(r.court_id)
      const caseName = str(r.caseName ?? r.case_name)
      const natureOfSuit = str(r.nature_of_suit)
      const docketNumber = str(r.docketNumber ?? r.docket_number)
      const absoluteUrl = str(r.docket_absolute_url ?? r.absolute_url)
      const dateFiled = normalizeDate(r.dateFiled ?? r.date_filed)
      const dateTerminated = normalizeDate(r.dateTerminated ?? r.date_terminated)

      return {
        caseName: caseName ?? null,
        court: court ?? null,
        courtId: courtId ?? null,
        dateFiled,
        dateTerminated,
        docketNumber: docketNumber ?? null,
        natureOfSuit: natureOfSuit ?? null,
        absoluteUrl: absoluteUrl ? `https://www.courtlistener.com${absoluteUrl.startsWith('/') ? absoluteUrl : `/docket/${absoluteUrl}`}` : null,
        caseType: classifyCase({ court, courtId, caseName, natureOfSuit, docketNumber }),
        caseStatus: dateTerminated ? 'terminated' : 'open',
      }
    })

    const cases = normalized
    const byType = (t: CaseType) => cases.filter(c => c.caseType === t)
    const bankruptcy = byType('bankruptcy')
    const divorce = byType('divorce')
    const civil = byType('civil')
    const foreclosure = byType('foreclosure')
    const probate = byType('probate')

    return {
      searchedAt: new Date().toISOString(),
      party,
      cases,
      bankruptcyCount: bankruptcy.length,
      divorceCount: divorce.length,
      civilJudgmentCount: civil.length,
      foreclosureCount: foreclosure.length,
      probateCount: probate.length,
      latest: {
        bankruptcy: bankruptcy[0],
        divorce: divorce[0],
        civilJudgment: civil[0],
        foreclosure: foreclosure[0],
        probate: probate[0],
      },
    }
  } catch (err) {
    console.error('[CourtListener] search failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Classify a case into one of our wholesale-relevant buckets. Signals used:
 *   - Bankruptcy: court ID ends in `b` OR court string includes "Bankr"
 *   - Foreclosure: caseName or natureOfSuit mentions foreclosure/mortgage
 *   - Divorce: caseName mentions dissolution / divorce / family
 *   - Probate: caseName mentions estate/probate
 *   - Civil: natureOfSuit is set and none of the above match
 */
function classifyCase(args: {
  court: string | undefined
  courtId: string | undefined
  caseName: string | undefined
  natureOfSuit: string | undefined
  docketNumber: string | undefined
}): CaseType {
  const ctLower = (args.court ?? '').toLowerCase()
  const idLower = (args.courtId ?? '').toLowerCase()
  const nameLower = (args.caseName ?? '').toLowerCase()
  const nosLower = (args.natureOfSuit ?? '').toLowerCase()
  const docketLower = (args.docketNumber ?? '').toLowerCase()

  // Bankruptcy courts: federal bankruptcy court IDs all end in `b`
  // (e.g. `tnmdb`, `cacb`). String form is "Bankr. XXX".
  if (idLower.endsWith('b') || ctLower.includes('bankr')) return 'bankruptcy'

  // Foreclosure keywords across caseName or natureOfSuit
  if (nameLower.includes('foreclos') || nosLower.includes('foreclos')
      || nosLower.includes('mortgage foreclosure')
      || nosLower === '220') {  // federal NOS code 220 = Real Property: Foreclosure
    return 'foreclosure'
  }

  // Divorce / family
  if (nameLower.match(/\b(divorce|dissolution|marriage|custody)\b/)
      || nosLower.includes('domestic relations')) {
    return 'divorce'
  }

  // Probate / estate
  if (nameLower.match(/\b(probate|estate of|decedent|will)\b/)) {
    return 'probate'
  }

  // Civil — anything with a nature-of-suit that we haven't already
  // classified. Includes judgments, debt collection, torts, contracts.
  if (args.natureOfSuit && args.natureOfSuit.trim() !== '') return 'civil'

  // Default — general docket with no classification signal
  return 'other'
}

function normalizeDate(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v)
  // CourtListener sometimes returns "2023-06-24T00:00:00-07:00"; slice to
  // plain date to keep the column consistent.
  return s.slice(0, 10)
}

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  return String(v)
}

// Federal district + bankruptcy court IDs by state (two-letter code).
// Covers the courts where a wholesaler's sellers most commonly have cases
// filed. Not exhaustive — specialty courts (Tax Court, Fed. Cir.) omitted.
// Pattern: `<state><district><b for bankruptcy>` — e.g. "tnmdb" = Tennessee
// Middle District Bankruptcy, "cacd" = California Central District.
const COURT_IDS_BY_STATE: Record<string, string[]> = {
  AL: ['alnd', 'almd', 'alsd', 'alnb', 'almb', 'alsb'],
  AK: ['akd', 'akb'],
  AZ: ['azd', 'azb'],
  AR: ['ared', 'arwd', 'areb', 'arwb'],
  CA: ['cacd', 'caed', 'cand', 'casd', 'cacb', 'caeb', 'canb', 'casb'],
  CO: ['cod', 'cob'],
  CT: ['ctd', 'ctb'],
  DE: ['ded', 'deb'],
  DC: ['dcd', 'dcb'],
  FL: ['flnd', 'flmd', 'flsd', 'flnb', 'flmb', 'flsb'],
  GA: ['gand', 'gamd', 'gasd', 'ganb', 'gamb', 'gasb'],
  HI: ['hid', 'hib'],
  ID: ['idd', 'idb'],
  IL: ['ilnd', 'ilcd', 'ilsd', 'ilnb', 'ilcb', 'ilsb'],
  IN: ['innd', 'insd', 'innb', 'insb'],
  IA: ['iand', 'iasd', 'ianb', 'iasb'],
  KS: ['ksd', 'ksb'],
  KY: ['kyed', 'kywd', 'kyeb', 'kywb'],
  LA: ['laed', 'lamd', 'lawd', 'laeb', 'lamb', 'lawb'],
  ME: ['med', 'meb'],
  MD: ['mdd', 'mdb'],
  MA: ['mad', 'mab'],
  MI: ['mied', 'miwd', 'mieb', 'miwb'],
  MN: ['mnd', 'mnb'],
  MS: ['msnd', 'mssd', 'msnb', 'mssb'],
  MO: ['moed', 'mowd', 'moeb', 'mowb'],
  MT: ['mtd', 'mtb'],
  NE: ['ned', 'neb'],
  NV: ['nvd', 'nvb'],
  NH: ['nhd', 'nhb'],
  NJ: ['njd', 'njb'],
  NM: ['nmd', 'nmb'],
  NY: ['nynd', 'nyed', 'nysd', 'nywd', 'nynb', 'nyeb', 'nysb', 'nywb'],
  NC: ['nced', 'ncmd', 'ncwd', 'nceb', 'ncmb', 'ncwb'],
  ND: ['ndd', 'ndb'],
  OH: ['ohnd', 'ohsd', 'ohnb', 'ohsb'],
  OK: ['oked', 'oknd', 'okwd', 'okeb', 'oknb', 'okwb'],
  OR: ['ord', 'orb'],
  PA: ['paed', 'pamd', 'pawd', 'paeb', 'pamb', 'pawb'],
  RI: ['rid', 'rib'],
  SC: ['scd', 'scb'],
  SD: ['sdd', 'sdb'],
  TN: ['tned', 'tnmd', 'tnwd', 'tneb', 'tnmdb', 'tnwb'],
  TX: ['txnd', 'txed', 'txsd', 'txwd', 'txnb', 'txeb', 'txsb', 'txwb'],
  UT: ['utd', 'utb'],
  VT: ['vtd', 'vtb'],
  VA: ['vaed', 'vawd', 'vaeb', 'vawb'],
  WA: ['waed', 'wawd', 'waeb', 'wawb'],
  WV: ['wvnd', 'wvsd', 'wvnb', 'wvsb'],
  WI: ['wied', 'wiwd', 'wieb', 'wiwb'],
  WY: ['wyd', 'wyb'],
}
