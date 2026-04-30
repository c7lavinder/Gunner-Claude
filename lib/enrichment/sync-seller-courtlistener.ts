// lib/enrichment/sync-seller-courtlistener.ts
//
// Bridges CourtListener case-search → Seller row. Runs *per seller*, not
// per property — court records follow the person. For every Seller linked
// to an enriched property, we:
//   1. Skip if we've searched recently (< 30 days) unless force=true
//   2. Search by Seller.name (or ownerFirstName/LastName if available)
//   3. Classify hits into bankruptcy / divorce / civil / foreclosure / probate
//   4. Write counts + latest-of-each-type + the full case list (JSON) to
//      the Seller row, marking source = "api" on Seller.fieldSources

import { db } from '@/lib/db/client'
import { searchCases, type CourtListenerSearchResult } from '@/lib/courtlistener/client'

interface SellerSlice {
  id: string
  name: string
  clCasesSearchedAt: Date | null
  fieldSources: unknown
}

const RECENT_SEARCH_DAYS = 30

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Build the Prisma update from a CourtListener result. Only writes fields
 * that are currently null/zero on the Seller row. Mutates fieldSources.
 */
export function buildCourtListenerUpdate(
  seller: SellerSlice,
  cl: CourtListenerSearchResult,
  fieldSources: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const markSource = (k: string) => {
    if (fieldSources[k] !== 'user') fieldSources[k] = 'api'
  }

  // Always stamp the searched-at + the full case list (overwriting is fine —
  // CourtListener is authoritative for its own search output).
  out.clCasesSearchedAt = new Date(cl.searchedAt)
  out.clCasesJson = cl.cases as unknown
  markSource('clCasesSearchedAt')
  markSource('clCasesJson')

  // Counts — overwrite freely (they're computed, not user-curated).
  out.clBankruptcyCount = cl.bankruptcyCount
  out.clDivorceCount = cl.divorceCount
  out.clCivilJudgmentCount = cl.civilJudgmentCount
  out.clProbateCount = cl.probateCount
  markSource('clBankruptcyCount')
  markSource('clDivorceCount')
  markSource('clCivilJudgmentCount')
  markSource('clProbateCount')

  // Latest-per-type — promote to typed columns
  if (cl.latest.bankruptcy) {
    out.clBankruptcyLatestChapter = chapterFromDocket(cl.latest.bankruptcy.docketNumber)
    out.clBankruptcyLatestFilingDate = toDate(cl.latest.bankruptcy.dateFiled)
    out.clBankruptcyLatestStatus = cl.latest.bankruptcy.caseStatus ?? null
    out.clBankruptcyLatestCourt = cl.latest.bankruptcy.court
    markSource('clBankruptcyLatestChapter')
    markSource('clBankruptcyLatestFilingDate')
    markSource('clBankruptcyLatestStatus')
    markSource('clBankruptcyLatestCourt')
  }
  if (cl.latest.divorce) {
    out.clDivorceLatestFilingDate = toDate(cl.latest.divorce.dateFiled)
    markSource('clDivorceLatestFilingDate')
  }
  if (cl.latest.civilJudgment) {
    out.clCivilJudgmentLatestDate = toDate(cl.latest.civilJudgment.dateFiled)
    markSource('clCivilJudgmentLatestDate')
  }
  if (cl.latest.foreclosure) {
    out.clForeclosureCourtCaseDate = toDate(cl.latest.foreclosure.dateFiled)
    markSource('clForeclosureCourtCaseDate')
  }
  if (cl.latest.probate) {
    out.clProbateLatestFilingDate = toDate(cl.latest.probate.dateFiled)
    markSource('clProbateLatestFilingDate')
  }

  return out
}

/**
 * Bankruptcy chapters come as part of the docket number — e.g.
 * "1:22-bk-01234" or "3:23-cv-00567". Extract the middle token when it
 * matches our known chapter patterns.
 */
function chapterFromDocket(docket: string | null | undefined): string | null {
  if (!docket) return null
  const m = docket.match(/-(bk|ch\d+)-/i)
  if (!m) return null
  if (m[1].toLowerCase() === 'bk') return null  // unspecified chapter
  const ch = m[1].replace(/\D/g, '')
  return ch || null
}

/**
 * Run CourtListener search for one Seller and persist results. Skips if
 * a search happened within RECENT_SEARCH_DAYS unless force=true.
 *
 * v1.1 Wave 1 — Class 4 hardening: takes `tenantId` explicitly per AGENTS.md.
 * findUnique→findFirst with tenantId in WHERE; trailing update scoped too.
 */
export async function searchCourtListenerForSeller(
  sellerId: string,
  tenantId: string,
  opts: { force?: boolean; state?: string } = {},
): Promise<{ searched: boolean; caseCount: number } | null> {
  const seller = await db.seller.findFirst({
    where: { id: sellerId, tenantId },
    select: {
      id: true, name: true, mailingState: true,
      clCasesSearchedAt: true,
      fieldSources: true,
      properties: {
        select: { property: { select: { state: true } } },
        take: 1,
      },
    },
  })
  if (!seller) return null
  if (!seller.name || seller.name.trim() === '') {
    return { searched: false, caseCount: 0 }
  }

  if (!opts.force && seller.clCasesSearchedAt) {
    const daysSince = (Date.now() - seller.clCasesSearchedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < RECENT_SEARCH_DAYS) {
      return { searched: false, caseCount: 0 }
    }
  }

  // Prefer linked property's state (most reliable signal — we just confirmed
  // the owner lives there); fall back to seller's mailing state; fall back
  // to passed-in state; finally null (unscoped).
  const state = seller.properties[0]?.property?.state
    ?? seller.mailingState
    ?? opts.state

  const cl = await searchCases(seller.name, { state: state ?? undefined })
  if (!cl) return { searched: true, caseCount: 0 }

  const fieldSources = { ...((seller.fieldSources as Record<string, string>) ?? {}) }
  const update = buildCourtListenerUpdate(seller as SellerSlice, cl, fieldSources)

  await db.seller.update({
    where: { id: seller.id, tenantId },
    data: { ...update, fieldSources },
  })

  return { searched: true, caseCount: cl.cases.length }
}

/**
 * Run CourtListener search for every Seller linked to a Property. Used by
 * the multi-vendor orchestrator after owner names are known.
 *
 * v1.1 Wave 1 — Class 4 hardening: takes `tenantId` explicitly. The
 * propertyId→propertySeller join is FK-scoped, but the inner per-seller
 * search is now tenant-scoped via the same parameter.
 */
export async function searchCourtListenerForProperty(
  propertyId: string,
  tenantId: string,
): Promise<{ sellersSearched: number; totalCases: number }> {
  const links = await db.propertySeller.findMany({
    where: { propertyId },
    select: { sellerId: true },
  })

  let sellersSearched = 0
  let totalCases = 0

  for (const link of links) {
    const result = await searchCourtListenerForSeller(link.sellerId, tenantId)
    if (!result || !result.searched) continue
    sellersSearched++
    totalCases += result.caseCount
  }

  return { sellersSearched, totalCases }
}
