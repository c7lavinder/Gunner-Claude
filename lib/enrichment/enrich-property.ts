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
}

export interface MultiVendorEnrichResult {
  batchdata: { ran: boolean; matched: boolean; error?: string }
  propertyRadar: { ran: boolean; matched: boolean; error?: string }
  google: { ran: boolean; matched: boolean; error?: string }
  courtlistener: { ran: boolean; sellersSearched: number; totalCases: number; error?: string }
  skipTrace: { ran: boolean; sellersTraced: number; fieldsFilled: number; error?: string }
  columnsWritten: number
  durationMs: number
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
    },
  })

  if (!property || !property.address) {
    result.durationMs = Date.now() - startedAt
    return result
  }

  const { address, city, state, zip } = property
  const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }

  // ── Step 1: parallel vendor lookups ─────────────────────────────────
  const [bdRes, prRes, googleRes] = await Promise.all([
    runWith('batchdata', result.batchdata, () => lookupBatchData(address, city, state, zip)),
    opts.skipPropertyRadar
      ? Promise.resolve(null)
      : runWith('propertyRadar', result.propertyRadar, () => lookupPropertyRadar(address, city, state, zip, { purchase: true })),
    opts.skipGoogle
      ? Promise.resolve(null)
      : runWith('google', result.google, () => lookupGoogle(address, city, state, zip)),
  ])

  // ── Step 2: merge vendor results + promote to typed columns ────────
  const merged = mergeResults(bdRes as Partial<BatchDataPropertyResult> | null, prRes)

  const update: Record<string, unknown> = {}

  // BatchData raw blob stays separate — keep the full object for research tab
  if (bdRes && (bdRes as BatchDataPropertyResult).raw) {
    const existingResearch = (property.zillowData ?? {}) as Record<string, unknown>
    update.zillowData = {
      ...existingResearch,
      batchData: { ...(bdRes as BatchDataPropertyResult), enrichedAt: new Date().toISOString() },
    }
  }

  // Run the shared denormalizer on the merged result (same helper used by
  // the BatchData-only flow). Writes typed columns for every Tier 1/2/3 +
  // PR subscription field.
  Object.assign(update, buildDenormUpdate(property as never, merged, fieldSources))

  // Google-specific writes (these aren't in the shared shape)
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

  update.fieldSources = fieldSources

  if (Object.keys(update).length > 1) {  // > 1 because fieldSources always included
    await db.property.update({ where: { id: propertyId }, data: update })
    result.columnsWritten = Object.keys(update).length - 1  // exclude fieldSources from count
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
  console.log(
    `[enrichProperty] ${address} done in ${result.durationMs}ms: ` +
    `BD=${result.batchdata.matched} PR=${result.propertyRadar.matched} ` +
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
