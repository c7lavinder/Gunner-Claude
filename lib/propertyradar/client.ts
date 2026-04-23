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

function getApiKey(): string {
  const key = process.env.PROPERTYRADAR_API_KEY
  if (!key) throw new Error('PROPERTYRADAR_API_KEY not configured')
  return key
}

// PropertyRadar requires `Purchase` in the query string. Purchase=0 returns
// a price/count preview only (results[] always empty). Purchase=1 actually
// materializes the record and debits a credit from the account. Trial keys
// include ~9999 free credits — verified via `quantityFreeRemaining` in the
// response envelope. We default to 1 because the whole point of calling this
// is to get data; callers that just want a cost estimate can pass purchase=false.
export async function lookupProperty(
  street: string, city: string, state: string, zip: string,
  opts: { purchase?: boolean } = {},
): Promise<Partial<BatchDataPropertyResult> | null> {
  const purchase = opts.purchase === false ? 0 : 1
  try {
    const res = await fetch(`${BASE_URL}/properties?Purchase=${purchase}&Limit=1`, {
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

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[PropertyRadar] API error: ${res.status} ${text}`)
      return null
    }

    const body = await res.json() as { results?: Array<Record<string, unknown>> }
    const prop = body.results?.[0]
    if (!prop) {
      console.warn(`[PropertyRadar] no match for ${street}, ${city}, ${state} ${zip}`)
      return null
    }

    return normalize(prop)
  } catch (err) {
    console.error('[PropertyRadar] lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}

function normalize(p: Record<string, unknown>): Partial<BatchDataPropertyResult> {
  const phones = asArray(p.Phones)
  const emails = asArray(p.Emails)

  // PropertyRadar ships distress signals as 0/1 integers; true/false also
  // accepted to be defensive.
  const truthy = (v: unknown): boolean | undefined => {
    if (v === 1 || v === '1' || v === true) return true
    if (v === 0 || v === '0' || v === false) return false
    return undefined
  }

  return {
    // Identity — RadarID is the vendor-specific key; APN is the public one
    apn: str(p.APN),
    fips: str(p.FIPS),
    subdivision: str(p.Subdivision),
    county: str(p.County),
    latitude: num(p.Latitude),
    longitude: num(p.Longitude),

    // Building (Beds requires Purchase — may be undefined)
    bedrooms: num(p.Beds),
    bathrooms: num(p.Baths),
    squareFootage: num(p.SqFt),
    lotSquareFootage: num(p.LotSize),
    yearBuilt: num(p.YearBuilt),
    propertyType: str(p.AdvancedPropertyType ?? p.PType),
    stories: num(p.Stories),
    units: num(p.Units),

    // Owner (Purchase-gated)
    ownerName: str(p.Owner),
    ownerType: str(p.OwnershipType),
    ownershipLength: num(p.YearsOwned),
    ownerOccupied: truthy(p.OwnerOccupied),
    absenteeOwner: truthy(p.OwnerOccupied) === false ? true : undefined,
    ownerPhone: str(phones[0]?.Number ?? phones[0]?.Phone),
    ownerEmail: str(emails[0]?.Email),
    secondOwnerName: str(p.Owner2),
    secondOwnerPhone: str(phones[1]?.Number ?? phones[1]?.Phone),
    secondOwnerEmail: str(emails[1]?.Email),

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

    // Subscription extras — structured owner name parts (CourtListener
    // + skip-trace both want these), MLS history, HOA, change-in-value.
    // These fields populate when the PR account tier unlocks them; we
    // read them defensively so trial keys still work.
    ownerFirstName1: str(p.OwnerFirstName1 ?? p.Owner1FirstName),
    ownerLastName1: str(p.OwnerLastName1 ?? p.Owner1LastName),
    ownerFirstName2: str(p.OwnerFirstName2 ?? p.Owner2FirstName),
    ownerLastName2: str(p.OwnerLastName2 ?? p.Owner2LastName),
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

    // Liens — PropertyRadar returns `PropertyHasOpenLiens` as a boolean-ish
    // summary; we surface the flag but don't invent a count.
    totalOpenLienCount: truthy(p.PropertyHasOpenLiens) ? 1 : undefined,

    // Environmental
    floodZone: str(p.FloodZone),

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
