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
 * `state` helps narrow — we pass `court=<stateCode>*` when possible, but
 * CourtListener's court filter is by specific court IDs, not state prefix,
 * so we don't currently narrow. Future improvement.
 */
export async function searchCases(
  partyName: string,
  opts: { state?: string; limit?: number } = {},
): Promise<CourtListenerSearchResult | null> {
  const limit = opts.limit ?? 50
  const party = partyName.trim()
  if (!party) return null

  // Wrap name in quotes so CourtListener treats it as a phrase match; use
  // `type=r` for RECAP docket search (federal dockets) which is where
  // bankruptcy/civil/foreclosure federal cases live.
  const url = new URL(`${BASE_URL}/search/`)
  url.searchParams.set('type', 'r')
  url.searchParams.set('q', `"${party}"`)
  url.searchParams.set('order_by', 'dateFiled desc')
  // Note: the free REST v3 search endpoint paginates at 20/page by default.
  // We fetch one page — enough for count + latest classification.

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
    const results = body.results ?? []

    const cases: CourtListenerCase[] = results.slice(0, limit).map(r => {
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
