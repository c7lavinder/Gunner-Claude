// lib/propertyradar/client.ts
//
// PropertyRadar API client. Base: https://api.propertyradar.com/v1. Auth via
// Bearer token. Docs: https://developers.propertyradar.com
//
// Shape verified against a live response on 2026-04-23. PropertyRadar returns
// a flat record with PascalCase field names (`RadarID`, `AVM`, `SqFt`,
// `YearBuilt`, `DistressScore`) and a large set of 0/1 integer distress
// flags (`isHighEquity`, `inForeclosure`, `isPreforeclosure`, `isSiteVacant`,
// …). The default search response intentionally omits bedrooms, owner info,
// mortgage detail, and phone/email — those require the `Fields` param with a
// Purchase tier. We pass a wide Fields list so the response carries what we
// actually need.
//
// Normalized to `Partial<BatchDataPropertyResult>` for `buildDenormUpdate`.

import type { BatchDataPropertyResult } from '@/lib/batchdata/client'

const BASE_URL = 'https://api.propertyradar.com/v1'

// Marker so the orchestrator can distinguish "missing config" from "API
// failure / no match" in audit logs. lookupProperty re-throws this case
// so runWith captures it as slot.error rather than silently nulling.
class PropertyRadarConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'PropertyRadarConfigError' }
}

function getApiKey(): string {
  const key = process.env.PROPERTYRADAR_API_KEY
  if (!key) throw new PropertyRadarConfigError('PROPERTYRADAR_API_KEY not configured on this environment')
  return key
}

// PropertyRadar requires `Purchase` in the query string. Purchase=0 returns
// a price/count preview only (results[] always empty). Purchase=1 actually
// materializes the record and debits a credit from the account. Trial keys
// include ~9999 free credits — verified via `quantityFreeRemaining` in the
// response envelope. We default to 1 because the whole point of calling this
// is to get data; callers that just want a cost estimate can pass purchase=false.
// Fields we request from the /properties/{RadarID} detail endpoint. Every
// name here has been verified against the PR API on 2026-04-23. Names the
// API doesn't recognize cause the whole request to 400, so keep this list
// tight — only add after confirming with a single-field probe.
const DETAIL_FIELDS = [
  // Structure
  'Beds', 'Baths', 'Stories',
  'Pool', 'Fireplace', 'Heating',
  'ImprovementCondition', 'BuildingQuality',
  // Lot
  'LotDepthFootage',
  // Identity + admin
  'APN', 'CensusTract', 'CensusBlock', 'CarrierRoute', 'SchoolDistrict',
  'FloodZone',
  // Valuation + loans
  'AVM', 'TotalLoanBalance',
  // Tax
  'AnnualTaxes', 'EstimatedTaxRate', 'AssessedYear', 'Taxpayer',
  // Rent
  'HUDRent',
  // Owner name parts (structured, matches /persons)
  'OwnerFirstName', 'OwnerLastName',
  // MLS
  'DaysOnMarket',
  // Loan detail
  'FirstLoanType',
].join(',')

export async function lookupProperty(
  street: string, city: string, state: string, zip: string,
  opts: { purchase?: boolean } = {},
): Promise<Partial<BatchDataPropertyResult> | null> {
  const purchase = opts.purchase === false ? 0 : 1
  try {
    // Phase 1 — search by address to get RadarID + summary flags
    const searchRes = await fetch(`${BASE_URL}/properties?Purchase=${purchase}&Limit=1`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Criteria: [
          { name: 'Address', value: [street] },
          { name: 'City',    value: [city] },
          { name: 'State',   value: [state] },
          { name: 'ZipFive', value: [zip] },
        ],
      }),
    })

    if (!searchRes.ok) {
      const text = await searchRes.text().catch(() => '')
      console.error(`[PropertyRadar] search API error: ${searchRes.status} ${text}`)
      return null
    }

    const searchBody = await searchRes.json() as { results?: Array<Record<string, unknown>> }
    const summary = searchBody.results?.[0]
    if (!summary) {
      console.warn(`[PropertyRadar] no match for ${street}, ${city}, ${state} ${zip}`)
      return null
    }

    const radarId = str(summary.RadarID)
    if (!radarId) return normalize(summary, null, null)

    // Phase 2 — fetch rich detail + owner demographics in parallel.
    // Each call burns 1 credit (free under subscription, per-property on trial).
    const [detailRes, personsRes] = await Promise.all([
      fetch(`${BASE_URL}/properties/${radarId}?Purchase=${purchase}&Fields=${DETAIL_FIELDS}`, {
        headers: { 'Authorization': `Bearer ${getApiKey()}` },
      }),
      fetch(`${BASE_URL}/properties/${radarId}/persons?Purchase=${purchase}`, {
        headers: { 'Authorization': `Bearer ${getApiKey()}` },
      }),
    ])

    const detailData = detailRes.ok
      ? (await detailRes.json() as { results?: Array<Record<string, unknown>> })
      : null
    const detail = detailData?.results?.[0] ?? null
    if (!detailRes.ok) {
      const text = await detailRes.text().catch(() => '')
      console.warn(`[PropertyRadar] detail API error for ${radarId}: ${detailRes.status} ${text}`)
    }

    const personsData = personsRes.ok
      ? (await personsRes.json() as { results?: Array<Record<string, unknown>> })
      : null
    const persons = personsData?.results ?? []
    if (!personsRes.ok) {
      const text = await personsRes.text().catch(() => '')
      console.warn(`[PropertyRadar] persons API error for ${radarId}: ${personsRes.status} ${text}`)
    }

    return normalize(summary, detail, persons)
  } catch (err) {
    // Surface config errors so they appear in the orchestrator's audit log
    // payload as result.propertyRadar.error instead of being silently
    // collapsed into matched=false. Missing API key is the difference between
    // "search returned no match" (correct) and "we never made the call"
    // (operational failure that should alert).
    if (err instanceof PropertyRadarConfigError) throw err
    console.error('[PropertyRadar] lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function normalize(
  summary: Record<string, unknown>,
  detail: Record<string, unknown> | null,
  persons: Array<Record<string, unknown>> | null,
): Partial<BatchDataPropertyResult> {
  // Merge summary + detail — detail overrides since it's richer. The
  // remaining normalize logic reads from `p`, which is the merged view.
  const p: Record<string, unknown> = { ...summary, ...(detail ?? {}) }

  const phones = asArray(p.Phones)
  const emails = asArray(p.Emails)

  // /persons result: owner1 = first entry (usually the primary contact).
  // Provides structured first/last name, age, gender, occupation,
  // personType ("Person" vs "Company").
  const primaryPerson = (persons ?? []).find(pp => pp.isPrimaryContact === 1 || pp.isPrimaryContact === true)
    ?? (persons ?? [])[0]
  const secondPerson = (persons ?? []).find(pp => pp !== primaryPerson)

  // PropertyRadar ships distress signals as 0/1 integers; true/false also
  // accepted to be defensive.
  const truthy = (v: unknown): boolean | undefined => {
    if (v === 1 || v === '1' || v === true) return true
    if (v === 0 || v === '0' || v === false) return false
    return undefined
  }

  // Heating/Pool/Fireplace are 0/1 ints on PR detail — convert for shared shape.
  const hasHeating = truthy(p.Heating)
  const hasPool = truthy(p.Pool)
  const hasFireplace = truthy(p.Fireplace)

  return {
    // Identity — RadarID is the vendor-specific key; APN is the public one
    apn: str(p.APN),
    fips: str(p.FIPS),
    subdivision: str(p.Subdivision),
    county: str(p.County),
    latitude: num(p.Latitude),
    longitude: num(p.Longitude),

    // Building (Beds/Baths come from the detail endpoint's Fields param)
    bedrooms: num(p.Beds),
    bathrooms: num(p.Baths),
    squareFootage: num(p.SqFt),
    lotSquareFootage: num(p.LotSize),
    yearBuilt: num(p.YearBuilt),
    propertyType: str(p.AdvancedPropertyType ?? p.PType),
    stories: num(p.Stories),
    units: num(p.Units),
    pool: hasPool,
    hasFireplace: hasFireplace,

    // Owner — prefer structured parts from /persons when available
    ownerName: str(p.Owner ?? (primaryPerson && `${primaryPerson.FirstName ?? ''} ${primaryPerson.LastName ?? ''}`.trim())),
    ownerType: str(p.OwnershipType),
    ownershipLength: num(p.YearsOwned),
    ownerOccupied: truthy(p.OwnerOccupied),
    absenteeOwner: truthy(p.OwnerOccupied) === false ? true : undefined,
    ownerPhone: str(phones[0]?.Number ?? phones[0]?.Phone),
    ownerEmail: str(emails[0]?.Email),
    secondOwnerName: str(p.Owner2 ?? (secondPerson && `${secondPerson.FirstName ?? ''} ${secondPerson.LastName ?? ''}`.trim())),
    secondOwnerPhone: str(phones[1]?.Number ?? phones[1]?.Phone),
    secondOwnerEmail: str(emails[1]?.Email),
    // Structured name parts (from detail Fields + /persons)
    ownerFirstName1: str(p.OwnerFirstName ?? primaryPerson?.FirstName),
    ownerLastName1: str(p.OwnerLastName ?? primaryPerson?.LastName),
    ownerFirstName2: str(secondPerson?.FirstName),
    ownerLastName2: str(secondPerson?.LastName),

    // Quick flags (all 0/1 ints — normalize to boolean)
    cashBuyer: truthy(p.isCashBuyer),
    highEquity: truthy(p.isHighEquity),
    freeAndClear: truthy(p.isFreeAndClear),
    preforeclosure: truthy(p.isPreforeclosure),
    bankOwned: truthy(p.isBankOwned),
    vacant: truthy(p.isSiteVacant),

    // Vacancy signals
    vacantStatus: truthy(p.isSiteVacant) ? 'site_vacant' : undefined,
    siteVacant: truthy(p.isSiteVacant),

    // Valuation
    estimatedValue: num(p.AVM),
    equityPercent: percentFromEquity(p.AvailableEquity, p.AVM),

    // Tier 3 — distress composite + legal flags
    distressScore: num(p.DistressScore),
    inBankruptcy: truthy(p.inBankruptcyProperty),
    inProbate: truthy(p.inProbateProperty),
    inDivorce: truthy(p.inDivorce),
    hasRecentEviction: truthy(p.hasRecentEviction),
    isRecentFlip: truthy(p.isRecentFlip),
    isRecentSale: truthy(p.isRecentSale),
    isListedForSale: truthy(p.isListedForSale),
    isAuction: truthy(p.isAuction),

    // Tier 3 — equity detail
    availableEquity: num(p.AvailableEquity),
    estimatedEquity: num(p.EstimatedEquity),
    openMortgageBalance: num(p.EstimatedMortgageBalance),

    // Subscription extras — MLS history, HOA, appreciation, etc. Name parts
    // are already emitted above from the /persons endpoint; keep just the
    // non-name subscription fields here.
    pctChangeInValue: num(p.PctChangeInValue ?? p.PercentChangeInValue),
    cashSale: truthy(p.CashSale ?? p.isCashSale),
    investorType: str(p.InvestorTypeFirst ?? p.InvestorType),
    hoaDues: num(p.HOADues),
    hoaPastDue: truthy(p.HOAPastDue),
    hoaName: str(p.HOAName),
    lastMlsStatus: str(p.MLSStatus ?? p.LastMLSStatus),
    lastMlsListPrice: num(p.MLSListPrice ?? p.LastMLSListPrice),
    lastMlsSoldPrice: num(p.MLSSoldPrice ?? p.LastMLSSoldPrice),
    ownerMailingVacant: truthy(p.OwnerMailingVacant ?? p.MailingVacant),

    // Tax
    taxAssessedValue: num(p.AssessedValue),
    annualTaxAmount: num(p.TaxesAnnual),
    taxDelinquent: truthy(p.inTaxDelinquency) ?? truthy(p.TaxDelinquent),
    taxDelinquentAmount: num(p.TaxDelinquentAmount),

    // Mortgage (Purchase-gated)
    mortgageAmount: num(p.LoanAmount),
    mortgageDate: str(p.FirstMortgageDate),
    mortgageLender: str(p.Lender),
    mortgageType: str(p.LoanType),
    mortgageRate: num(p.LoanInterestRate),
    secondMortgageAmount: num(p.SecondMortgageAmount),
    secondMortgageDate: str(p.SecondMortgageDate),
    secondMortgageLender: str(p.SecondMortgageLender),

    // Foreclosure (PropertyRadar's strongest differentiator)
    foreclosureStatus: str(p.ForeclosureStatus)
      ?? (truthy(p.inForeclosure) ? 'foreclosure' : undefined)
      ?? (truthy(p.isPreforeclosure) ? 'preforeclosure' : undefined)
      ?? (truthy(p.isAuction) ? 'auction' : undefined)
      ?? (truthy(p.isBankOwned) ? 'reo' : undefined),
    nodDate: str(p.NODDate),
    lisPendensDate: str(p.LisPendensDate),
    lisPendensAmount: num(p.LisPendensAmount),
    lisPendensPlaintiff: str(p.LisPendensPlaintiff),
    foreclosureAuctionDate: str(p.AuctionDate),
    foreclosureOpeningBid: num(p.AuctionOpeningBid),

    // Sale history
    lastSaleDate: str(p.LastSaleDate ?? p.LastTransferRecDate),
    lastSalePrice: num(p.LastSalePrice ?? p.LastTransferValue),
    deedType: str(p.LastDeedType),

    // PR detail-endpoint extras
    improvementCondition: str(p.ImprovementCondition),
    buildingQuality: str(p.BuildingQuality),
    estimatedTaxRate: num(p.EstimatedTaxRate),
    censusTract: str(p.CensusTract),
    censusBlock: str(p.CensusBlock),
    carrierRoute: str(p.CarrierRoute),
    schoolDistrict: str(p.SchoolDistrict),
    taxpayerRaw: str(p.Taxpayer),
    suggestedRent: num(p.HUDRent),

    // Owner demographics from /persons
    ownerAge: num(primaryPerson?.Age),
    ownerGender: str(primaryPerson?.Gender),
    ownerOccupation: str(primaryPerson?.Occupation),
    ownerPersonType: str(primaryPerson?.PersonType),

    // Liens — PropertyRadar returns `PropertyHasOpenLiens` as a boolean-ish
    // summary; we surface the flag but don't invent a count.
    totalOpenLienCount: truthy(p.PropertyHasOpenLiens) ? 1 : undefined,
    hasOpenLiens: truthy(p.PropertyHasOpenLiens),
    hasOpenPersonLiens: truthy(p.PropertyHasOpenPersonLiens),

    // Environmental
    floodZone: str(p.FloodZone),

    // ── Comprehensive capture (PropertyRadar flags not yet surfaced) ──
    advancedPropertyType: str(p.AdvancedPropertyType),
    lotDepthFootage: num(p.LotDepthFootage),
    cashBuyerOwner: truthy(p.isCashBuyer),
    deceasedOwner: truthy(p.isDeceasedProperty),
    sameMailingOrExempt: truthy(p.isSameMailingOrExempt),
    sameMailing: truthy(p.isSameMailing),
    underwater: truthy(p.isUnderwater),
    expiredListing: truthy(p.isExpiredListing),

    raw: p,
  }
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

function percentFromEquity(equity: unknown, avm: unknown): number | undefined {
  const e = num(equity)
  const v = num(avm)
  if (e == null || v == null || v === 0) return undefined
  return Math.round((e / v) * 100)
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
