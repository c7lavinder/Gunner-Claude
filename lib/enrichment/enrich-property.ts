// lib/enrichment/enrich-property.ts
//
// Multi-vendor property enrichment orchestrator. This is the function the
// property-creation flow and "re-enrich" button should call.
//
// Flow:
//   1. Parallel:
//      - BatchData lookup                    (~$0.30, ~110 fields + raw blob)
//      - PropertyRadar lookup (subscription) (flat cost, DistressScore + PR extras)
//      - Google Places lookup                (~$0.017, verified addr + visuals)
//   2. Merge vendor results with BatchData-first precedence, then apply
//      `buildDenormUpdate` to promote typed columns.
//   3. `syncSellersFromVendorResult` — push owner/ownership data onto any
//      linked Seller row.
//   4. Serial:
//      - `searchCourtListenerForProperty` — per-seller case search.
//   5. Optional skip-trace (when opts.skipTrace === true, $0.07/seller).
//
// We keep the original `enrichPropertyFromBatchData` in place for any
// existing callers; new code should use this orchestrator.

import { db } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'
import {
  lookupProperty as lookupBatchData,
  type BatchDataPropertyResult,
} from '@/lib/batchdata/client'
import { lookupProperty as lookupPropertyRadar } from '@/lib/propertyradar/client'
import { lookupPlace as lookupGoogle } from '@/lib/google/client'
import { buildDenormUpdate } from '@/lib/batchdata/enrich'
import {
  syncSellersFromVendorResult,
  skipTraceSellersForProperty,
} from '@/lib/enrichment/sync-seller'
import { searchCourtListenerForProperty } from '@/lib/enrichment/sync-seller-courtlistener'

export interface MultiVendorEnrichOptions {
  skipTrace?: boolean      // after base enrich, skip-trace each seller missing phone/email (~$0.07/seller)
  skipCourtListener?: boolean  // for testing — disable CL search
  skipGoogle?: boolean     // for testing — disable Google Places
  skipPropertyRadar?: boolean  // for testing — disable PR
  skipBatchData?: boolean  // bypass BD entirely (for testing or zero-spend runs)
  forceBatchData?: boolean // fire BD even if PR gate would normally skip it
}

export interface MultiVendorEnrichResult {
  batchdata: { ran: boolean; matched: boolean; skipped?: string; error?: string }
  propertyRadar: { ran: boolean; matched: boolean; error?: string }
  google: { ran: boolean; matched: boolean; error?: string }
  courtlistener: { ran: boolean; sellersSearched: number; totalCases: number; error?: string }
  skipTrace: { ran: boolean; sellersTraced: number; fieldsFilled: number; error?: string }
  columnsWritten: number
  durationMs: number
}

// ── Daily budget cap (hard safety) ───────────────────────────────────────
// Even if leads qualify, block BD calls once daily spend exceeds the cap.
// Uses an in-memory counter that resets per-process-day; for multi-pod
// deployments consider persisting in Redis or a DB row instead. For now
// this is a blast-radius limiter against a bad config or runaway loop.
const BATCHDATA_COST_PER_CALL_USD = 0.30
const BATCHDATA_DAILY_BUDGET_USD = Number(process.env.BATCHDATA_DAILY_BUDGET_USD ?? '15')

const budgetState = {
  date: new Date().toDateString(),
  callsToday: 0,
}

function resetBudgetIfNewDay(): void {
  const today = new Date().toDateString()
  if (budgetState.date !== today) {
    budgetState.date = today
    budgetState.callsToday = 0
  }
}

function batchDataWithinBudget(): { ok: boolean; spent: number; remaining: number } {
  resetBudgetIfNewDay()
  const spent = budgetState.callsToday * BATCHDATA_COST_PER_CALL_USD
  const remaining = BATCHDATA_DAILY_BUDGET_USD - spent
  return { ok: remaining >= BATCHDATA_COST_PER_CALL_USD, spent, remaining }
}

function trackBatchDataCall(): void {
  resetBudgetIfNewDay()
  budgetState.callsToday += 1
}

// ── BatchData cache window ───────────────────────────────────────────────
// Once a property has been BD-enriched, don't re-fetch for this many days.
// Configurable via env — default 30. Re-enrich button bypasses this.
const BATCHDATA_CACHE_DAYS = Number(process.env.BATCHDATA_CACHE_DAYS ?? '30')

function hasRecentBatchDataEnrichment(zillowData: unknown): { cached: boolean; daysOld: number } {
  const zillow = (zillowData ?? {}) as Record<string, unknown>
  const bd = (zillow.batchData ?? {}) as Record<string, unknown>
  if (!bd.enrichedAt) return { cached: false, daysOld: Infinity }
  const enrichedAt = new Date(bd.enrichedAt as string)
  if (isNaN(enrichedAt.getTime())) return { cached: false, daysOld: Infinity }
  const daysOld = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24)
  return { cached: daysOld < BATCHDATA_CACHE_DAYS, daysOld }
}

/**
 * Merge two vendor payloads into one shared-shape object. First-wins:
 * whichever object has a defined value for a field keeps it.
 */
function mergeResults(
  ...sources: Array<Partial<BatchDataPropertyResult> | null>
): Partial<BatchDataPropertyResult> {
  const merged: Record<string, unknown> = {}
  for (const s of sources) {
    if (!s) continue
    for (const [k, v] of Object.entries(s)) {
      if (v == null || v === '' || v === false) continue
      if (merged[k] == null || merged[k] === '' || merged[k] === false) {
        merged[k] = v
      }
    }
  }
  return merged as Partial<BatchDataPropertyResult>
}

export async function enrichProperty(
  propertyId: string,
  opts: MultiVendorEnrichOptions = {},
): Promise<MultiVendorEnrichResult> {
  const startedAt = Date.now()
  const result: MultiVendorEnrichResult = {
    batchdata: { ran: false, matched: false },
    propertyRadar: { ran: false, matched: false },
    google: { ran: false, matched: false },
    courtlistener: { ran: false, sellersSearched: 0, totalCases: 0 },
    skipTrace: { ran: false, sellersTraced: 0, fieldsFilled: 0 },
    columnsWritten: 0,
    durationMs: 0,
  }

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      fieldSources: true, zillowData: true,
      // Fundamental property detail — buildDenormUpdate now backfills these too
      beds: true, baths: true, sqft: true, yearBuilt: true,
      propertyType: true, occupancy: true, lotSize: true, description: true,
      taxAssessment: true, annualTax: true, deedDate: true,
      // Tier 1+
      county: true, latitude: true, longitude: true, apn: true,
      fips: true, subdivision: true,
      absenteeOwner: true, ownerPhone: true, ownerEmail: true,
      ownerType: true, ownershipLengthYears: true,
      secondOwnerName: true, secondOwnerPhone: true, secondOwnerEmail: true,
      mortgageAmount: true, mortgageDate: true, mortgageLender: true,
      mortgageType: true, mortgageRate: true,
      secondMortgageAmount: true, secondMortgageDate: true, secondMortgageLender: true,
      lienCount: true, propertyLienAmount: true, lienTypes: true, judgmentCount: true,
      taxDelinquent: true, taxDelinquentAmount: true,
      foreclosureStatus: true, bankOwned: true, preForeclosure: true,
      nodDate: true, lisPendensDate: true, lisPendensAmount: true, lisPendensPlaintiff: true,
      foreclosureAuctionDate: true, foreclosureOpeningBid: true,
      stories: true, units: true, basementFinishedPercent: true,
      lastSalePrice: true, transferCount: true, deedType: true, dataLastUpdated: true,
      roofType: true, foundationType: true, garageType: true, garageCapacity: true,
      heatingSystem: true, coolingSystem: true, exteriorWalls: true,
      hasPool: true, hasDeck: true, hasPorch: true, hasSolar: true,
      hasFireplace: true, hasSpa: true,
      zoningCode: true, landUseCode: true, propertySchoolDistrict: true,
      earthquakeZone: true, wildfireRisk: true,
      vacantStatus: true, vacantStatusYear: true, siteVacant: true, mailVacant: true,
      distressScore: true, inBankruptcy: true, inProbate: true, inDivorce: true,
      hasRecentEviction: true, isRecentFlip: true, isRecentSale: true,
      isListedForSale: true, isAuction: true,
      availableEquity: true, estimatedEquity: true, equityPercent: true,
      openMortgageBalance: true, estimatedMortgagePayment: true,
      inherited: true, deathTransfer: true, mortgageAssumable: true,
      mlsActive: true, mlsPending: true, mlsSold: true, mlsCancelled: true,
      mlsFailed: true, mlsStatus: true, mlsType: true,
      mlsListingDate: true, mlsListingPrice: true, mlsSoldPrice: true,
      mlsDaysOnMarket: true, mlsPricePerSqft: true, mlsKeywords: true,
      mlsLastStatusDate: true,
      floodZoneType: true,
      suggestedRent: true, medianIncome: true, hudAreaCode: true, hudAreaName: true,
      fmrYear: true, fmrEfficiency: true, fmrOneBedroom: true, fmrTwoBedroom: true,
      fmrThreeBedroom: true, fmrFourBedroom: true,
      schoolPrimaryName: true, schoolPrimaryRating: true, schoolsJson: true,
      ownerFirstName1: true, ownerLastName1: true, ownerFirstName2: true, ownerLastName2: true,
      pctChangeInValue: true, cashSale: true, investorType: true,
      hoaDues: true, hoaPastDue: true, hoaName: true,
      lastMlsStatus: true, lastMlsListPrice: true, lastMlsSoldPrice: true,
      ownerMailingVacant: true,
      googlePlaceId: true, googleVerifiedAddress: true,
      googleLatitude: true, googleLongitude: true,
      googleStreetViewUrl: true, googleMapsUrl: true,
      googlePlaceTypes: true, googlePhotoThumbnailUrl: true, googleSearchedAt: true,
      // PR detail endpoint fields
      improvementCondition: true, buildingQuality: true, estimatedTaxRate: true,
      censusTract: true, censusBlock: true, carrierRoute: true,
      legalDescription: true,
      // Comprehensive capture (20260423060000)
      addressValidity: true, zipPlus4: true,
      salePropensity: true, salePropensityCategory: true, salePropensityStatus: true,
      listingStatus: true, listingStatusCategory: true,
      listingFailedDate: true, listingOriginalDate: true,
      listingSoldPrice: true, listingSoldDate: true,
      listingAgentName: true, listingAgentPhone: true, listingBrokerName: true,
      foreclosureAuctionCity: true, foreclosureAuctionLocation: true, foreclosureAuctionTime: true,
      foreclosureBorrower: true, foreclosureDocumentType: true,
      foreclosureFilingDate: true, foreclosureRecordingDate: true,
      foreclosureTrusteeName: true, foreclosureTrusteePhone: true,
      foreclosureTrusteeAddress: true, foreclosureTrusteeSaleNum: true,
      ownerPortfolioCount: true, ownerPortfolioTotalEquity: true,
      ownerPortfolioTotalValue: true, ownerPortfolioTotalPurchase: true,
      ownerPortfolioAvgAssessed: true, ownerPortfolioAvgPurchase: true,
      ownerPortfolioAvgYearBuilt: true,
      absenteeOwnerInState: true, seniorOwner: true, samePropertyMailing: true,
      valuationAsOfDate: true, valuationConfidence: true, valuationStdDeviation: true,
      advancedPropertyType: true, lotDepthFootage: true,
      cashBuyerOwner: true, deceasedOwner: true,
      hasOpenLiens: true, hasOpenPersonLiens: true,
      sameMailingOrExempt: true, sameMailing: true,
      underwater: true, expiredListing: true,
      deedHistoryJson: true, mortgageHistoryJson: true, liensJson: true,
      foreclosureDetailJson: true, ownerPortfolioJson: true,
      valuationJson: true, quickListsJson: true,
    },
  })

  if (!property || !property.address) {
    result.durationMs = Date.now() - startedAt
    return result
  }

  const { address, city, state, zip } = property
  const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }

  // ── Step 1a: PropertyRadar + Google in parallel (primary source) ────
  // PR is flat-rate (subscription), Google is ~$0.017/call. Both cheap.
  // PR is the primary data source — wins conflicts in the merge below.
  const [prRes, googleRes] = await Promise.all([
    opts.skipPropertyRadar
      ? Promise.resolve(null)
      : runWith('propertyRadar', result.propertyRadar, () => lookupPropertyRadar(address, city, state, zip, { purchase: true })),
    opts.skipGoogle
      ? Promise.resolve(null)
      : runWith('google', result.google, () => lookupGoogle(address, city, state, zip)),
  ])

  // ── Step 1b: BatchData — fills gaps + adds BD-only fields ───────────
  // BD costs ~$0.30/property but provides fields PR can't: salePropensity
  // motivation score, owner phones/emails (skip-trace), full deed history,
  // full mortgage history, rich foreclosure trustee data, owner portfolio
  // aggregates, USPS deliverability codes.
  //
  // Fires on every lead, gated only by:
  //   1. opts.skipBatchData flag (testing / zero-spend runs)
  //   2. Recent BD cache (BATCHDATA_CACHE_DAYS window) — don't re-bill if
  //      we enriched the same property recently
  //   3. Daily budget cap (BATCHDATA_DAILY_BUDGET_USD env var)
  //   4. PR no-match + address quality — if PR couldn't match, most likely
  //      BD won't either, and this address is junk. Skip to save the call.
  //      (Override via forceBatchData=true.)
  let bdRes: Partial<BatchDataPropertyResult> | null = null
  if (opts.skipBatchData) {
    result.batchdata.skipped = 'flag_skip_batchdata'
  } else {
    const cache = hasRecentBatchDataEnrichment(property.zillowData)
    if (cache.cached && !opts.forceBatchData) {
      result.batchdata.skipped = `cached_${Math.round(cache.daysOld)}d_ago`
      // Pull the cached result back into memory so the merge still gets BD data
      const zillow = (property.zillowData ?? {}) as Record<string, unknown>
      const cached = zillow.batchData as BatchDataPropertyResult | undefined
      if (cached) {
        bdRes = cached
        result.batchdata.matched = true
      }
      console.log(`[enrichProperty] BD cached — enriched ${Math.round(cache.daysOld)}d ago (< ${BATCHDATA_CACHE_DAYS}d window), reusing blob`)
    } else {
      const budget = batchDataWithinBudget()
      if (!budget.ok) {
        result.batchdata.skipped = `daily_budget_reached_$${budget.spent.toFixed(2)}/$${BATCHDATA_DAILY_BUDGET_USD}`
        console.warn(`[enrichProperty] BD skipped — daily budget exhausted ($${budget.spent.toFixed(2)} of $${BATCHDATA_DAILY_BUDGET_USD})`)
      } else if (!opts.forceBatchData && !prRes && !opts.skipPropertyRadar) {
        // PR couldn't match this address AND we actually tried — don't burn a
        // BD credit on an address that's likely garbage (typo, non-US, etc.)
        result.batchdata.skipped = 'pr_no_match'
        console.log(`[enrichProperty] BD skipped — PR had no match, address is likely low-quality`)
      } else {
        trackBatchDataCall()
        bdRes = await runWith('batchdata', result.batchdata, () => lookupBatchData(address, city, state, zip))
        console.log(`[enrichProperty] BD fired (budget remaining $${(budget.remaining - BATCHDATA_COST_PER_CALL_USD).toFixed(2)})`)
      }
    }
  }

  // ── Step 2: merge vendor results + promote to typed columns ────────
  // Every sub-step below is wrapped in its own try/catch so a single
  // vendor's bad data (or a denormalizer bug) can't wipe out the others.
  // The final db.property.update is wrapped too, with a retry-on-typed-cols
  // fallback if the full update fails.
  //
  // PR is the primary source — listed FIRST so it wins conflicts in the
  // first-wins merge. BD fills gaps + contributes BD-only fields.
  let merged: Partial<BatchDataPropertyResult> = {}
  try {
    merged = mergeResults(prRes, bdRes as Partial<BatchDataPropertyResult> | null)
  } catch (err) {
    console.error('[enrichProperty] mergeResults failed:', err instanceof Error ? err.message : err)
  }

  const update: Record<string, unknown> = {}

  // BatchData raw blob stays separate — keep the full object for research tab
  try {
    if (bdRes && (bdRes as BatchDataPropertyResult).raw) {
      const existingResearch = (property.zillowData ?? {}) as Record<string, unknown>
      update.zillowData = {
        ...existingResearch,
        batchData: { ...(bdRes as BatchDataPropertyResult), enrichedAt: new Date().toISOString() },
      }
    }
  } catch (err) {
    console.error('[enrichProperty] BD blob persistence failed:', err instanceof Error ? err.message : err)
  }

  // Run the shared denormalizer on the merged result (same helper used by
  // the BatchData-only flow). Writes typed columns for every Tier 1/2/3 +
  // PR subscription field. Isolated: a denormalizer throw doesn't abort
  // the Google writes or the final update.
  try {
    Object.assign(update, buildDenormUpdate(property as never, merged, fieldSources))
  } catch (err) {
    console.error('[enrichProperty] buildDenormUpdate failed:', err instanceof Error ? err.message : err)
  }

  // Google-specific writes (these aren't in the shared shape). Isolated
  // from PR/BD denormalization so a bad Google payload can't wipe PR data.
  try {
    if (googleRes) {
      const setIfEmpty = (col: string, value: unknown) => {
        if (value == null || value === '') return
        const current = (property as unknown as Record<string, unknown>)[col]
        if (current != null && current !== '') return
        update[col] = value
        if (fieldSources[col] !== 'user') fieldSources[col] = 'api'
      }
      setIfEmpty('googlePlaceId', googleRes.placeId)
      setIfEmpty('googleVerifiedAddress', googleRes.formattedAddress)
      setIfEmpty('googleLatitude', googleRes.latitude)
      setIfEmpty('googleLongitude', googleRes.longitude)
      setIfEmpty('googleStreetViewUrl', googleRes.streetViewUrl)
      setIfEmpty('googleMapsUrl', googleRes.mapsUrl)
      setIfEmpty('googlePhotoThumbnailUrl', googleRes.photoThumbnailUrl)
      if (Array.isArray(googleRes.placeTypes) && googleRes.placeTypes.length > 0) {
        const existingTypes = Array.isArray(property.googlePlaceTypes) ? property.googlePlaceTypes : []
        if (existingTypes.length === 0) {
          update.googlePlaceTypes = googleRes.placeTypes as Prisma.InputJsonValue
          fieldSources.googlePlaceTypes = 'api'
        }
      }
      update.googleSearchedAt = new Date()
    }
  } catch (err) {
    console.error('[enrichProperty] Google writes failed:', err instanceof Error ? err.message : err)
  }

  update.fieldSources = fieldSources

  // Persist — with a fallback retry that strips unknown columns if the
  // full update fails (e.g. schema drift, bad value types).
  if (Object.keys(update).length > 1) {
    try {
      await db.property.update({ where: { id: propertyId }, data: update })
      result.columnsWritten = Object.keys(update).length - 1
    } catch (err) {
      console.error('[enrichProperty] Full update failed, retrying with fieldSources only:', err instanceof Error ? err.message : err)
      try {
        await db.property.update({ where: { id: propertyId }, data: { fieldSources } })
      } catch (retryErr) {
        console.error('[enrichProperty] Retry also failed:', retryErr instanceof Error ? retryErr.message : retryErr)
      }
    }
  }

  // ── Step 3: seller sync (owner/ownership/legal from merged payload) ─
  try {
    await syncSellersFromVendorResult(propertyId, merged)
  } catch (err) {
    console.error('[enrichProperty] Seller sync failed:', err instanceof Error ? err.message : err)
  }

  // ── Step 4: CourtListener per-seller search ─────────────────────────
  if (!opts.skipCourtListener) {
    try {
      const cl = await searchCourtListenerForProperty(propertyId)
      result.courtlistener = { ran: true, ...cl }
    } catch (err) {
      result.courtlistener = {
        ran: true, sellersSearched: 0, totalCases: 0,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── Step 5: optional skip-trace ────────────────────────────────────
  if (opts.skipTrace) {
    try {
      const trace = await skipTraceSellersForProperty(propertyId)
      result.skipTrace = {
        ran: true,
        sellersTraced: trace.totalTraced,
        fieldsFilled: trace.totalFieldsTouched,
      }
    } catch (err) {
      result.skipTrace = {
        ran: true, sellersTraced: 0, fieldsFilled: 0,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  result.durationMs = Date.now() - startedAt
  const bdStatus = result.batchdata.skipped
    ? `skip(${result.batchdata.skipped})`
    : result.batchdata.matched ? 'yes' : 'miss'
  console.log(
    `[enrichProperty] ${address} done in ${result.durationMs}ms: ` +
    `BD=${bdStatus} PR=${result.propertyRadar.matched} ` +
    `GG=${result.google.matched} CL=${result.courtlistener.sellersSearched}s/${result.courtlistener.totalCases}c, ` +
    `${result.columnsWritten} columns`,
  )

  return result
}

async function runWith<T>(
  name: string,
  slot: { ran: boolean; matched: boolean; error?: string },
  fn: () => Promise<T | null>,
): Promise<T | null> {
  slot.ran = true
  try {
    const v = await fn()
    slot.matched = v != null
    return v
  } catch (err) {
    slot.error = err instanceof Error ? err.message : String(err)
    console.error(`[enrichProperty] ${name} failed:`, slot.error)
    return null
  }
}
