// lib/rentcast/client.ts
//
// RentCast API client. Base: https://api.rentcast.io/v1. Auth via X-Api-Key
// header (account-scoped key). Docs: https://developers.rentcast.io/reference
//
// RentCast is strong on: AVM with confidence score, rental estimates, and
// market-level analytics (median price, DOM) — areas where BatchData is
// lighter. It's weaker on: foreclosure, liens, skip-trace.
//
// We normalize the vendor response to `Partial<BatchDataPropertyResult>` so
// the same `buildDenormUpdate` helper that promotes BatchData JSON into typed
// Property columns can consume a RentCast payload verbatim. The field names
// in that interface are vendor-agnostic by convention; it predates this client
// so the name is historical.

import type { BatchDataPropertyResult } from '@/lib/batchdata/client'

const BASE_URL = 'https://api.rentcast.io/v1'

function getApiKey(): string {
  const key = process.env.RENTCAST_API_KEY
  if (!key) throw new Error('RENTCAST_API_KEY not configured')
  return key
}

interface RentCastLookupResult extends Partial<BatchDataPropertyResult> {
  // RentCast-specific add-ons that don't fit the shared shape
  rentEstimate?: number
  rentEstimateMin?: number
  rentEstimateMax?: number
  rentConfidence?: number
  avm?: number
  avmConfidence?: number
  marketRent?: number
  daysOnMarket?: number
}

/**
 * Fetch the property record, AVM, and rental estimate in parallel. Address
 * form accepted by RentCast: "123 Main St, Denver, CO 80202" (single string).
 */
export async function lookupProperty(
  street: string, city: string, state: string, zip: string,
): Promise<RentCastLookupResult | null> {
  const address = `${street}, ${city}, ${state} ${zip}`
  const params = new URLSearchParams({ address })

  try {
    const [propRes, avmRes, rentRes] = await Promise.all([
      fetch(`${BASE_URL}/properties?${params}`, { headers: authHeaders() }),
      fetch(`${BASE_URL}/avm/value?${params}`, { headers: authHeaders() }),
      fetch(`${BASE_URL}/avm/rent/long-term?${params}`, { headers: authHeaders() }),
    ])

    if (!propRes.ok) {
      console.error(`[RentCast] property lookup failed: ${propRes.status}`)
      return null
    }

    const propJson = (await propRes.json()) as unknown
    const prop = firstRecord(propJson)
    if (!prop) {
      console.warn(`[RentCast] no match for ${address}`)
      return null
    }

    const avmJson = avmRes.ok ? ((await avmRes.json()) as Record<string, unknown>) : {}
    const rentJson = rentRes.ok ? ((await rentRes.json()) as Record<string, unknown>) : {}

    return normalize(prop, avmJson, rentJson)
  } catch (err) {
    console.error('[RentCast] lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function authHeaders(): Record<string, string> {
  return {
    'X-Api-Key': getApiKey(),
    'Accept': 'application/json',
  }
}

function firstRecord(body: unknown): Record<string, unknown> | null {
  if (Array.isArray(body) && body.length > 0 && typeof body[0] === 'object') {
    return body[0] as Record<string, unknown>
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>
  }
  return null
}

function normalize(
  prop: Record<string, unknown>,
  avm: Record<string, unknown>,
  rent: Record<string, unknown>,
): RentCastLookupResult {
  const features = (prop.features ?? {}) as Record<string, unknown>
  const owner = (prop.owner ?? {}) as Record<string, unknown>
  const taxAssessments = (prop.taxAssessments ?? {}) as Record<string, unknown>
  const propertyTaxes = (prop.propertyTaxes ?? {}) as Record<string, unknown>
  // RentCast's `history` is a date-string-keyed object (`"1991-04-26": {...}`),
  // not an array. Flatten to entries sorted newest-first before picking.
  const historyEntries = Object.values((prop.history ?? {}) as Record<string, unknown>)
    .filter(h => h && typeof h === 'object') as Array<Record<string, unknown>>
  historyEntries.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  const lastSale = historyEntries.find(h => (h.price as number) > 0) ?? historyEntries[0]

  // Pick the most recent tax assessment year
  const latestAssessment = pickLatest(taxAssessments)
  const latestTax = pickLatest(propertyTaxes)

  return {
    // Identity — verified against live response 2026-04-23
    apn: str(prop.assessorID ?? prop.apn),
    fips: str(prop.countyFips ?? prop.fipsCode ?? prop.fips),
    subdivision: str(prop.subdivision),
    county: str(prop.county),
    latitude: num(prop.latitude),
    longitude: num(prop.longitude),

    // Building
    bedrooms: num(prop.bedrooms),
    bathrooms: num(prop.bathrooms),
    squareFootage: num(prop.squareFootage),
    lotSquareFootage: num(prop.lotSize),
    yearBuilt: num(prop.yearBuilt),
    propertyType: str(prop.propertyType),
    stories: num(features.stories ?? prop.stories),
    units: num(features.units ?? prop.unitCount),

    // Construction detail
    roofType: str(features.roofType),
    foundation: str(features.foundationType),
    garageType: str(features.garageType),
    garageSpaces: num(features.garageSpaces ?? features.garage),
    heatingType: str(features.heatingType ?? features.heating),
    coolingType: str(features.coolingType ?? features.cooling),
    exteriorWalls: str(features.exteriorType ?? features.exterior),

    // Amenities
    pool: features.pool === true ? true : undefined,
    hasDeck: features.deck === true ? true : undefined,
    hasPorch: features.porch === true ? true : undefined,
    hasSolar: features.solar === true ? true : undefined,
    hasFireplace: features.fireplace === true ? true : undefined,
    hasSpa: features.spa === true ? true : undefined,

    // Owner
    ownerName: str(Array.isArray(owner.names) ? owner.names[0] : owner.name),
    ownerType: str(owner.type),
    absenteeOwner: owner.ownerOccupied === false ? true : undefined,
    ownerOccupied: owner.ownerOccupied === true ? true : undefined,

    // Tax — taxAssessments uses { value }; propertyTaxes uses { total }
    taxAssessedValue: num(latestAssessment?.value ?? latestAssessment?.totalValue),
    taxYear: num(latestAssessment?.year),
    annualTaxAmount: num(latestTax?.total ?? latestTax?.amount),

    // Sale history
    lastSaleDate: str(prop.lastSaleDate ?? lastSale?.date),
    lastSalePrice: num(prop.lastSalePrice ?? lastSale?.price),

    // Valuation (AVM)
    estimatedValue: num(avm.price ?? avm.value),
    priceRangeMin: num(avm.priceRangeLow),
    priceRangeMax: num(avm.priceRangeHigh),
    confidenceScore: num(avm.confidenceScore),
    avm: num(avm.price ?? avm.value),
    avmConfidence: num(avm.confidenceScore),

    // Rent
    rentEstimate: num(rent.rent ?? rent.value),
    rentEstimateMin: num(rent.rentRangeLow),
    rentEstimateMax: num(rent.rentRangeHigh),
    rentConfidence: num(rent.confidenceScore),

    // Environmental
    floodZone: str(prop.floodZone),

    // Market
    zoning: str(prop.zoning),

    // School (RentCast exposes districts when available)
    schoolDistrict: str((prop.schools as Record<string, unknown> | undefined)?.district),

    raw: prop,
  }
}

function pickLatest(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(record).filter(([, v]) => v && typeof v === 'object')
  if (entries.length === 0) return undefined
  entries.sort((a, b) => Number(b[0]) - Number(a[0]))
  return entries[0][1] as Record<string, unknown>
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

function str(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  return String(v)
}
