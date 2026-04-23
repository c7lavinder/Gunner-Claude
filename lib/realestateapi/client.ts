// lib/realestateapi/client.ts
//
// RealEstateAPI.com client. Base: https://api.realestateapi.com. Auth via
// x-api-key header.
//
// Shape verified against a live response on 2026-04-23. REAPI returns a
// rich, mostly-flat payload: most distress signals and valuation fields sit
// at the top level; nested `propertyInfo`, `lotInfo`, `ownerInfo`, `taxInfo`,
// `mortgageHistory`, `currentMortgages`, `saleHistory`, `foreclosureInfo`,
// `schools`, `demographics` carry the detail.
//
// We normalize to `Partial<BatchDataPropertyResult>` so `buildDenormUpdate`
// (in lib/batchdata/enrich.ts) can write the shared Property columns.

import type { BatchDataPropertyResult } from '@/lib/batchdata/client'

const BASE_URL = 'https://api.realestateapi.com'

function getApiKey(): string {
  const key = process.env.REALESTATEAPI_API_KEY
  if (!key) throw new Error('REALESTATEAPI_API_KEY not configured')
  return key
}

export async function lookupProperty(
  street: string, city: string, state: string, zip: string,
): Promise<Partial<BatchDataPropertyResult> | null> {
  try {
    const res = await fetch(`${BASE_URL}/v2/PropertyDetail`, {
      method: 'POST',
      headers: {
        'x-api-key': getApiKey(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        address: `${street}, ${city}, ${state} ${zip}`,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[REAPI] API error: ${res.status} ${text}`)
      return null
    }

    const body = await res.json() as Record<string, unknown>
    // REAPI returns the property flat at the top level. In some query modes
    // the payload nests under `data` — handle both.
    const prop = (body.data ?? body) as Record<string, unknown>
    if (!prop || Object.keys(prop).length === 0) {
      console.warn(`[REAPI] no match for ${street}, ${city}, ${state} ${zip}`)
      return null
    }

    return normalize(prop)
  } catch (err) {
    console.error('[REAPI] lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function normalize(p: Record<string, unknown>): Partial<BatchDataPropertyResult> {
  const propertyInfo = (p.propertyInfo ?? {}) as Record<string, unknown>
  const lotInfo = (p.lotInfo ?? {}) as Record<string, unknown>
  const ownerInfo = (p.ownerInfo ?? {}) as Record<string, unknown>
  const mailAddress = (ownerInfo.mailAddress ?? {}) as Record<string, unknown>
  const taxInfo = (p.taxInfo ?? {}) as Record<string, unknown>
  const currentMortgages = asArray(p.currentMortgages)
  const mortgageHistory = asArray(p.mortgageHistory)
  // Prefer still-open mortgages; fall back to full history for lender data.
  const firstMortgage = currentMortgages.find(m => m.position === 'First') ?? mortgageHistory[0] ?? {}
  const secondMortgage = currentMortgages.find(m => m.position === 'Second') ?? mortgageHistory[1] ?? {}
  const saleHistory = asArray(p.saleHistory)
  const lastSale = saleHistory.find(s => (s.saleAmount as number) > 0) ?? saleHistory[0]
  const foreclosureInfo = asArray(p.foreclosureInfo)
  const latestForeclosure = foreclosureInfo[0] ?? {}
  const auctionInfo = (p.auctionInfo ?? {}) as Record<string, unknown>
  const demographics = (p.demographics ?? {}) as Record<string, unknown>
  const schools = asArray(p.schools)
  const mlsHistory = asArray(p.mlsHistory)
  const latestMls = mlsHistory[0] ?? {}

  // Pick the school whose grade range covers high school (best proxy for the
  // attendance-area district name buyers look at).
  const primarySchool = schools.find(s => {
    const levels = (s.levels ?? {}) as Record<string, unknown>
    return levels.high === true
  }) ?? schools[0] ?? {}

  return {
    // Identity
    apn: str(lotInfo.apn ?? propertyInfo.parcelAccountNumber ?? p.apn),
    fips: str(p.fipsCode ?? p.fips),
    subdivision: str(lotInfo.subdivision ?? propertyInfo.subdivision),
    county: str(p.county ?? propertyInfo.county),
    latitude: num(propertyInfo.latitude ?? p.latitude),
    longitude: num(propertyInfo.longitude ?? p.longitude),

    // Building
    bedrooms: num(propertyInfo.bedrooms),
    bathrooms: sumBaths(propertyInfo),
    squareFootage: num(propertyInfo.livingSquareFeet ?? propertyInfo.buildingSquareFeet),
    lotSquareFootage: num(lotInfo.lotSquareFeet ?? propertyInfo.lotSquareFeet),
    yearBuilt: num(propertyInfo.yearBuilt),
    propertyType: str(p.propertyType ?? propertyInfo.propertyUse),
    stories: num(propertyInfo.stories),
    units: num(propertyInfo.unitsCount),
    basementFinishedPercent: num(propertyInfo.basementFinishedPercent),

    // Construction detail
    roofType: str(propertyInfo.roofMaterial ?? propertyInfo.roofConstruction),
    foundation: str(propertyInfo.construction),
    garageType: str(propertyInfo.garageType),
    garageSpaces: num(propertyInfo.parkingSpaces),
    heatingType: str(propertyInfo.heatingType),
    coolingType: str(propertyInfo.airConditioningType),
    exteriorWalls: str(propertyInfo.construction ?? propertyInfo.interiorStructure),

    // Amenities — REAPI uses explicit booleans/counts
    pool: propertyInfo.pool === true ? true : undefined,
    hasDeck: propertyInfo.deck === true ? true : undefined,
    hasPorch: num(propertyInfo.porchArea) != null && (num(propertyInfo.porchArea) ?? 0) > 0 ? true : undefined,
    hasFireplace: propertyInfo.fireplace === true || (num(propertyInfo.fireplaces) ?? 0) > 0 ? true : undefined,
    // REAPI doesn't ship solar/spa directly — leave undefined.

    // Owner
    ownerName: str(ownerInfo.owner1FullName ?? ownerInfo.companyName),
    ownerType: str(ownerInfo.owner1Type),
    absenteeOwner: ownerInfo.absenteeOwner === true || p.absenteeOwner === true ? true : undefined,
    ownerOccupied: ownerInfo.ownerOccupied === true || p.ownerOccupied === true ? true : undefined,
    secondOwnerName: str(ownerInfo.owner2FullName),
    ownershipLength: num(ownerInfo.ownershipLength),

    // Quick flags (all flat at top level in REAPI)
    cashBuyer: p.cashBuyer === true ? true : undefined,
    freeAndClear: p.freeClear === true ? true : undefined,
    highEquity: p.highEquity === true ? true : undefined,
    preforeclosure: p.preForeclosure === true ? true : undefined,
    vacant: p.vacant === true ? true : undefined,
    corporateOwned: p.corporateOwned === true ? true : undefined,
    bankOwned: p.bankOwned === true ? true : undefined,

    // Liens — REAPI returns boolean summaries, not arrays. Convert to counts so
    // the downstream denormalizer can still populate `lienCount`.
    totalOpenLienCount: (p.lien === true ? 1 : 0) + (p.judgment === true ? 1 : 0) + (p.taxLien === true ? 1 : 0) || undefined,
    lienTypes: ([
      p.lien === true ? 'lien' : null,
      p.judgment === true ? 'judgment' : null,
      p.taxLien === true ? 'taxLien' : null,
    ].filter(Boolean) as string[]).length > 0
      ? ([
          p.lien === true ? 'lien' : null,
          p.judgment === true ? 'judgment' : null,
          p.taxLien === true ? 'taxLien' : null,
        ].filter(Boolean) as string[])
      : undefined,
    judgmentCount: p.judgment === true ? 1 : undefined,

    // Foreclosure
    foreclosureStatus: str(p.noticeType ?? latestForeclosure.status ?? (p.preForeclosure === true ? 'preforeclosure' : undefined)),
    nodDate: str(latestForeclosure.nodDate ?? latestForeclosure.noticeOfDefaultDate ?? auctionInfo.nodDate),
    lisPendensDate: str(latestForeclosure.lisPendensDate),
    lisPendensAmount: num(latestForeclosure.lisPendensAmount),
    lisPendensPlaintiff: str(latestForeclosure.plaintiff ?? latestForeclosure.lisPendensPlaintiff),
    foreclosureAuctionDate: str(auctionInfo.auctionDate ?? latestForeclosure.auctionDate),
    foreclosureOpeningBid: num(auctionInfo.openingBid ?? latestForeclosure.openingBid),

    // Mortgage
    mortgageAmount: num(firstMortgage.amount),
    mortgageDate: str(firstMortgage.recordingDate),
    mortgageLender: str(firstMortgage.lenderName),
    mortgageType: str(firstMortgage.loanType),
    mortgageRate: num(firstMortgage.interestRate),
    secondMortgageAmount: num(secondMortgage.amount),
    secondMortgageDate: str(secondMortgage.recordingDate),
    secondMortgageLender: str(secondMortgage.lenderName),

    // Tax
    taxAssessedValue: num(taxInfo.assessedValue),
    taxYear: num(taxInfo.year ?? taxInfo.assessmentYear),
    annualTaxAmount: num(taxInfo.taxAmount),
    taxDelinquent: typeof taxInfo.taxDelinquentYear === 'number' && taxInfo.taxDelinquentYear > 0 ? true : undefined,

    // Sale history
    lastSaleDate: str(p.lastSaleDate ?? lastSale?.saleDate ?? lastSale?.recordingDate),
    lastSalePrice: num(p.lastSalePrice) ?? num(lastSale?.saleAmount),
    deedType: str(lastSale?.documentType),
    transferCount: saleHistory.length || undefined,

    // Valuation
    estimatedValue: num(p.estimatedValue),

    // Zoning / land use
    zoning: str(lotInfo.zoning),
    landUseCode: str(lotInfo.landUse),

    // School — REAPI returns an array; picked primary above
    schoolDistrict: str(primarySchool.name),

    // Environmental
    floodZone: boolToFloodString(p.floodZone, p.floodZoneType),
    floodZoneType: str(p.floodZoneType),

    // Tier 3 — equity detail (REAPI ships these flat at top level)
    availableEquity: num(p.equity),
    estimatedEquity: num(p.estimatedEquity),
    equityPercentTier3: num(p.equityPercent),
    openMortgageBalance: num(p.openMortgageBalance) ?? num(p.estimatedMortgageBalance),
    estimatedMortgagePayment: num(p.estimatedMortgagePayment),

    // Tier 3 — inheritance / transfers
    inherited: p.inherited === true ? true : undefined,
    deathTransfer: p.deathTransfer === true ? true : undefined,
    mortgageAssumable: firstMortgage.assumable === true ? true : undefined,

    // Tier 3 — MLS activity
    mlsActive: p.mlsActive === true ? true : undefined,
    mlsPending: p.mlsPending === true ? true : undefined,
    mlsSold: p.mlsSold === true ? true : undefined,
    mlsCancelled: p.mlsCancelled === true ? true : undefined,
    mlsFailed: p.mlsFailed === true ? true : undefined,
    mlsStatus: str(p.mlsStatus),
    mlsType: str(p.mlsType),
    mlsListingDate: str(p.mlsListingDate ?? latestMls.listingDate),
    mlsListingPrice: num(p.mlsListingPrice ?? latestMls.listingPrice),
    mlsSoldPrice: num(p.mlsSoldPrice ?? latestMls.soldPrice),
    mlsDaysOnMarket: num(p.mlsDaysOnMarket),
    mlsPricePerSqft: num(p.mlsListingPricePerSquareFoot),
    mlsLastStatusDate: str(p.mlsLastStatusDate),
    mlsKeywords: Array.isArray(p.mlsKeywords)
      ? (p.mlsKeywords as unknown[]).map(String).filter(Boolean)
      : undefined,

    // Tier 3 — demographics / HUD
    suggestedRent: num(demographics.suggestedRent),
    medianIncome: num(demographics.medianIncome),
    hudAreaCode: str(demographics.hudAreaCode),
    hudAreaName: str(demographics.hudAreaName),
    fmrYear: num(demographics.fmrYear),
    fmrEfficiency: num(demographics.fmrEfficiency),
    fmrOneBedroom: num(demographics.fmrOneBedroom),
    fmrTwoBedroom: num(demographics.fmrTwoBedroom),
    fmrThreeBedroom: num(demographics.fmrThreeBedroom),
    fmrFourBedroom: num(demographics.fmrFourBedroom),

    // Tier 3 — schools (keep full list + promoted primary)
    schoolPrimaryName: str(primarySchool.name),
    schoolPrimaryRating: num(primarySchool.rating),
    schools: schools.length > 0 ? schools : undefined,

    raw: p,
  }
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

function sumBaths(propertyInfo: Record<string, unknown>): number | undefined {
  const full = num(propertyInfo.bathrooms)
  const partial = num(propertyInfo.partialBathrooms)
  if (full == null && partial == null) return undefined
  return (full ?? 0) + (partial ?? 0) * 0.5
}

function boolToFloodString(flag: unknown, type: unknown): string | undefined {
  const t = str(type)
  if (t) return t                      // "X", "AE", etc.
  if (flag === true) return 'yes'
  if (flag === false) return 'no'
  return undefined
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
