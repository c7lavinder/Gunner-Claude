// lib/batchdata/enrich.ts
// Enriches a property with BatchData — called on creation and manual re-research
// Backfills missing fields (beds, baths, etc.) as "ai" source (blue)
// Stores full results in zillowData.batchData for Research tab

import { db } from '@/lib/db/client'
import { lookupProperty, type BatchDataPropertyResult } from './client'
import { formatReadableDate } from '@/lib/format'
import {
  syncSellersFromVendorResult,
  skipTraceSellersForProperty,
} from '@/lib/enrichment/sync-seller'

type PropertySlice = {
  // Core building/property details (fundamental fields, not tiered)
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  propertyType: string | null
  occupancy: string | null
  lotSize: string | null
  description: string | null
  taxAssessment: unknown
  annualTax: unknown
  deedDate: Date | null
  // Tier 1+
  county: string | null
  latitude: unknown
  longitude: unknown
  apn: string | null
  fips: string | null
  subdivision: string | null
  absenteeOwner: boolean | null
  // v1.1 Wave 5 — Property.ownerPhone/ownerEmail/ownerType/ownershipLengthYears/
  // secondOwner* stripped. Vendor data flows to Seller via lib/enrichment/sync-seller.ts.
  mortgageAmount: unknown
  mortgageDate: Date | null
  mortgageLender: string | null
  mortgageType: string | null
  mortgageRate: unknown
  secondMortgageAmount: unknown
  secondMortgageDate: Date | null
  secondMortgageLender: string | null
  lienCount: number | null
  propertyLienAmount: unknown
  lienTypes: unknown
  judgmentCount: number | null
  taxDelinquent: boolean | null
  taxDelinquentAmount: unknown
  foreclosureStatus: string | null
  bankOwned: boolean | null
  preForeclosure: boolean | null
  nodDate: Date | null
  lisPendensDate: Date | null
  lisPendensAmount: unknown
  lisPendensPlaintiff: string | null
  foreclosureAuctionDate: Date | null
  foreclosureOpeningBid: unknown
  stories: number | null
  units: number | null
  basementFinishedPercent: number | null
  lastSalePrice: unknown
  transferCount: number | null
  deedType: string | null
  dataLastUpdated: Date | null
  roofType: string | null
  foundationType: string | null
  garageType: string | null
  garageCapacity: number | null
  heatingSystem: string | null
  coolingSystem: string | null
  exteriorWalls: string | null
  hasPool: boolean | null
  hasDeck: boolean | null
  hasPorch: boolean | null
  hasSolar: boolean | null
  hasFireplace: boolean | null
  hasSpa: boolean | null
  zoningCode: string | null
  landUseCode: string | null
  propertySchoolDistrict: string | null
  earthquakeZone: string | null
  wildfireRisk: string | null
  vacantStatus: string | null
  vacantStatusYear: number | null
  siteVacant: boolean | null
  mailVacant: boolean | null
  // Tier 3 — distress composite + legal flags
  distressScore: number | null
  inBankruptcy: boolean | null
  inProbate: boolean | null
  inDivorce: boolean | null
  hasRecentEviction: boolean | null
  isRecentFlip: boolean | null
  isRecentSale: boolean | null
  isListedForSale: boolean | null
  isAuction: boolean | null
  availableEquity: unknown
  estimatedEquity: unknown
  equityPercent: unknown
  openMortgageBalance: unknown
  estimatedMortgagePayment: unknown
  inherited: boolean | null
  deathTransfer: boolean | null
  mortgageAssumable: boolean | null
  mlsActive: boolean | null
  mlsPending: boolean | null
  mlsSold: boolean | null
  mlsCancelled: boolean | null
  mlsFailed: boolean | null
  mlsStatus: string | null
  mlsType: string | null
  mlsListingDate: Date | null
  mlsListingPrice: unknown
  mlsSoldPrice: unknown
  mlsDaysOnMarket: number | null
  mlsPricePerSqft: unknown
  mlsKeywords: unknown
  mlsLastStatusDate: Date | null
  floodZoneType: string | null
  suggestedRent: unknown
  medianIncome: unknown
  hudAreaCode: string | null
  hudAreaName: string | null
  fmrYear: number | null
  fmrEfficiency: unknown
  fmrOneBedroom: unknown
  fmrTwoBedroom: unknown
  fmrThreeBedroom: unknown
  fmrFourBedroom: unknown
  schoolPrimaryName: string | null
  schoolPrimaryRating: number | null
  schoolsJson: unknown
  // PropertyRadar subscription extras
  // v1.1 Wave 5 — ownerFirstName1/2 + ownerLastName1/2 stripped from Property.
  // Vendor parsing still extracts these (see vendor adapter `BatchDataPropertyResult`)
  // and sync-seller.ts writes them to Seller.firstName / lastName per-ordinal.
  pctChangeInValue: unknown
  cashSale: boolean | null
  investorType: string | null
  hoaDues: unknown
  hoaPastDue: boolean | null
  hoaName: string | null
  lastMlsStatus: string | null
  lastMlsListPrice: unknown
  lastMlsSoldPrice: unknown
  mailingAddressVacant: boolean | null
  // Google
  googlePlaceId: string | null
  googleVerifiedAddress: string | null
  googleLatitude: unknown
  googleLongitude: unknown
  googleStreetViewUrl: string | null
  googleMapsUrl: string | null
  googlePlaceTypes: unknown
  googlePhotoThumbnailUrl: string | null
  googleSearchedAt: Date | null
  // PR detail fields
  improvementCondition: string | null
  buildingQuality: string | null
  estimatedTaxRate: unknown
  censusTract: string | null
  censusBlock: string | null
  carrierRoute: string | null
  legalDescription: string | null
  // Comprehensive capture (migration 20260423060000)
  addressValidity: string | null
  zipPlus4: string | null
  salePropensity: unknown
  salePropensityCategory: string | null
  salePropensityStatus: string | null
  listingStatus: string | null
  listingStatusCategory: string | null
  listingFailedDate: Date | null
  listingOriginalDate: Date | null
  listingSoldPrice: unknown
  listingSoldDate: Date | null
  listingAgentName: string | null
  listingAgentPhone: string | null
  listingBrokerName: string | null
  foreclosureAuctionCity: string | null
  foreclosureAuctionLocation: string | null
  foreclosureAuctionTime: string | null
  foreclosureBorrower: string | null
  foreclosureDocumentType: string | null
  foreclosureFilingDate: Date | null
  foreclosureRecordingDate: Date | null
  foreclosureTrusteeName: string | null
  foreclosureTrusteePhone: string | null
  foreclosureTrusteeAddress: string | null
  foreclosureTrusteeSaleNum: string | null
  // v1.1 Wave 5 — ownerPortfolio* + seniorOwner stripped from Property
  // (moved to Seller). absenteeOwnerInState + samePropertyMailing stay
  // (Q3 lock — property facts).
  absenteeOwnerInState: boolean | null
  samePropertyMailing: boolean | null
  valuationAsOfDate: Date | null
  valuationConfidence: number | null
  valuationStdDeviation: unknown
  advancedPropertyType: string | null
  lotDepthFootage: number | null
  // v1.1 Wave 5 — cashBuyerOwner + deceasedOwner stripped from Property (moved to Seller).
  hasOpenLiens: boolean | null
  hasOpenPersonLiens: boolean | null
  sameMailingOrExempt: boolean | null
  sameMailing: boolean | null
  underwater: boolean | null
  expiredListing: boolean | null
  deedHistoryJson: unknown
  mortgageHistoryJson: unknown
  liensJson: unknown
  foreclosureDetailJson: unknown
  // v1.1 Wave 5 — ownerPortfolioJson stripped from Property (moved to Seller).
  valuationJson: unknown
  quickListsJson: unknown
}

/**
 * Build a column-update object that only writes fields the Property row is
 * currently missing. Each write is mirrored into fieldSources as `api` so
 * the UI renders the purple-pill source badge consistently.
 *
 * Kept pure + side-effect-free so it can be reused by the zero-cost backfill
 * script (reads existing zillowData.batchData blob instead of calling the API).
 */
export function buildDenormUpdate(
  property: PropertySlice,
  result: Partial<BatchDataPropertyResult>,
  fieldSources: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  const setIfEmpty = <K extends keyof PropertySlice>(
    col: K,
    value: unknown,
    sourceKey: string = String(col),
  ): void => {
    if (value == null || value === '' || value === undefined) return
    if (property[col] != null && property[col] !== '') return
    out[col as string] = value
    if (fieldSources[sourceKey] !== 'user') fieldSources[sourceKey] = 'api'
  }

  const toDate = (v: string | undefined): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  // Core building/property fundamentals (beds/baths/sqft/yearBuilt/propertyType)
  setIfEmpty('beds', result.bedrooms)
  setIfEmpty('baths', result.bathrooms)
  setIfEmpty('sqft', result.squareFootage)
  setIfEmpty('yearBuilt', result.yearBuilt)

  // Lot size — BatchData ships lotSquareFootage; render as acres when ≥1.
  if (result.lotSquareFootage && (property.lotSize == null || property.lotSize === '')) {
    const sf = result.lotSquareFootage
    const acres = sf / 43560
    out.lotSize = acres >= 1 ? `${acres.toFixed(2)} ac` : `${sf.toLocaleString()} sqft`
    if (fieldSources.lotSize !== 'user') fieldSources.lotSize = 'api'
  }

  // Property type normalization (BatchData returns raw vendor strings like
  // "single family residential"; map to the UI's short labels).
  if (result.propertyType && (property.propertyType == null || property.propertyType === '')) {
    const typeMap: Record<string, string> = {
      'single family residential': 'House', 'sfr': 'House', 'single family': 'House',
      'multi-family': 'Multi-Family', 'multifamily': 'Multi-Family',
      'condo': 'Condo', 'condominium': 'Condo',
      'townhouse': 'Townhome', 'townhome': 'Townhome',
      'mobile home': 'Mobile Home', 'manufactured': 'Mobile Home',
      'land': 'Land', 'vacant land': 'Land',
      'commercial': 'Commercial',
    }
    out.propertyType = typeMap[result.propertyType.toLowerCase()] ?? result.propertyType
    if (fieldSources.propertyType !== 'user') fieldSources.propertyType = 'api'
  }

  // Occupancy derived from ownerOccupied flag
  if (result.ownerOccupied != null && (property.occupancy == null || property.occupancy === '')) {
    out.occupancy = result.ownerOccupied ? 'Owner' : 'Renter'
    if (fieldSources.occupancy !== 'user') fieldSources.occupancy = 'api'
  }

  // Tax / deed basics (not tiered)
  setIfEmpty('taxAssessment', result.taxAssessedValue)
  setIfEmpty('annualTax', result.annualTaxAmount)
  setIfEmpty('deedDate', toDate(result.lastSaleDate))

  // Identity & location
  setIfEmpty('county', result.county)
  setIfEmpty('latitude', result.latitude)
  setIfEmpty('longitude', result.longitude)
  setIfEmpty('apn', result.apn)
  setIfEmpty('fips', result.fips)
  setIfEmpty('subdivision', result.subdivision)

  // Owner
  setIfEmpty('absenteeOwner', result.absenteeOwner)
  // v1.1 Wave 5 — ownerPhone/ownerEmail/ownerType/ownershipLengthYears/
  // secondOwner* writes removed. Vendor data flows to Seller via
  // lib/enrichment/sync-seller.ts.

  // Primary mortgage
  setIfEmpty('mortgageAmount', result.mortgageAmount)
  setIfEmpty('mortgageDate', toDate(result.mortgageDate))
  setIfEmpty('mortgageLender', result.mortgageLender)
  setIfEmpty('mortgageType', result.mortgageType)
  setIfEmpty('mortgageRate', result.mortgageRate)

  // Second mortgage
  setIfEmpty('secondMortgageAmount', result.secondMortgageAmount)
  setIfEmpty('secondMortgageDate', toDate(result.secondMortgageDate))
  setIfEmpty('secondMortgageLender', result.secondMortgageLender)

  // Liens & legal
  setIfEmpty('lienCount', result.totalOpenLienCount)
  setIfEmpty('propertyLienAmount', result.totalOpenLienAmount)
  if (Array.isArray(result.lienTypes) && result.lienTypes.length > 0) {
    // lienTypes is a JSON column with default `[]` — only overwrite when ours is empty
    const existing = Array.isArray(property.lienTypes) ? property.lienTypes : []
    if (existing.length === 0) {
      out.lienTypes = result.lienTypes
      if (fieldSources.lienTypes !== 'user') fieldSources.lienTypes = 'api'
    }
  }
  setIfEmpty('judgmentCount', result.judgmentCount)

  // Distress & foreclosure
  setIfEmpty('taxDelinquent', result.taxDelinquent)
  setIfEmpty('taxDelinquentAmount', result.taxDelinquentAmount)
  setIfEmpty('foreclosureStatus', result.foreclosureStatus)
  setIfEmpty('bankOwned', result.bankOwned)
  setIfEmpty('preForeclosure', result.preforeclosure)
  setIfEmpty('nodDate', toDate(result.nodDate))
  setIfEmpty('lisPendensDate', toDate(result.lisPendensDate))
  setIfEmpty('lisPendensAmount', result.lisPendensAmount)
  setIfEmpty('lisPendensPlaintiff', result.lisPendensPlaintiff)
  setIfEmpty('foreclosureAuctionDate', toDate(result.foreclosureAuctionDate))
  setIfEmpty('foreclosureOpeningBid', result.foreclosureOpeningBid)

  // Structure
  setIfEmpty('stories', result.stories)
  setIfEmpty('units', result.units)
  setIfEmpty('basementFinishedPercent', result.basementFinishedPercent)

  // Transfer / deed
  setIfEmpty('lastSalePrice', result.lastSalePrice)
  setIfEmpty('transferCount', result.transferCount)
  setIfEmpty('deedType', result.deedType)
  setIfEmpty('dataLastUpdated', new Date()) // always stamp on successful enrich

  // Construction detail (Tier 2)
  setIfEmpty('roofType', result.roofType)
  setIfEmpty('foundationType', result.foundation)
  setIfEmpty('garageType', result.garageType)
  setIfEmpty('garageCapacity', result.garageSpaces)
  setIfEmpty('heatingSystem', result.heatingType)
  setIfEmpty('coolingSystem', result.coolingType)
  setIfEmpty('exteriorWalls', result.exteriorWalls)

  // Amenities
  setIfEmpty('hasPool', result.pool)
  setIfEmpty('hasDeck', result.hasDeck)
  setIfEmpty('hasPorch', result.hasPorch)
  setIfEmpty('hasSolar', result.hasSolar)
  setIfEmpty('hasFireplace', result.hasFireplace)
  setIfEmpty('hasSpa', result.hasSpa)

  // Zoning / neighborhood
  setIfEmpty('zoningCode', result.zoning)
  setIfEmpty('landUseCode', result.landUseCode)
  setIfEmpty('propertySchoolDistrict', result.schoolDistrict)

  // Environmental (existing `floodZone` column already used by AI enrichment)
  setIfEmpty('earthquakeZone', result.earthquakeZone)
  setIfEmpty('wildfireRisk', result.wildfireRisk)

  // Vacancy
  setIfEmpty('vacantStatus', result.vacantStatus)
  setIfEmpty('vacantStatusYear', result.vacantStatusYear)
  setIfEmpty('siteVacant', result.siteVacant)
  setIfEmpty('mailVacant', result.mailVacant)

  // Tier 3 — PropertyRadar distress composite + legal flags
  setIfEmpty('distressScore', result.distressScore)
  setIfEmpty('inBankruptcy', result.inBankruptcy)
  setIfEmpty('inProbate', result.inProbate)
  setIfEmpty('inDivorce', result.inDivorce)
  setIfEmpty('hasRecentEviction', result.hasRecentEviction)
  setIfEmpty('isRecentFlip', result.isRecentFlip)
  setIfEmpty('isRecentSale', result.isRecentSale)
  setIfEmpty('isListedForSale', result.isListedForSale)
  setIfEmpty('isAuction', result.isAuction)

  // Tier 3 — equity detail
  setIfEmpty('availableEquity', result.availableEquity)
  setIfEmpty('estimatedEquity', result.estimatedEquity)
  setIfEmpty('equityPercent', result.equityPercentTier3 ?? result.equityPercent)
  setIfEmpty('openMortgageBalance', result.openMortgageBalance)
  setIfEmpty('estimatedMortgagePayment', result.estimatedMortgagePayment)

  // Tier 3 — inheritance / transfers
  setIfEmpty('inherited', result.inherited)
  setIfEmpty('deathTransfer', result.deathTransfer)
  setIfEmpty('mortgageAssumable', result.mortgageAssumable)

  // Tier 3 — MLS activity
  setIfEmpty('mlsActive', result.mlsActive)
  setIfEmpty('mlsPending', result.mlsPending)
  setIfEmpty('mlsSold', result.mlsSold)
  setIfEmpty('mlsCancelled', result.mlsCancelled)
  setIfEmpty('mlsFailed', result.mlsFailed)
  setIfEmpty('mlsStatus', result.mlsStatus)
  setIfEmpty('mlsType', result.mlsType)
  setIfEmpty('mlsListingDate', toDate(result.mlsListingDate))
  setIfEmpty('mlsListingPrice', result.mlsListingPrice)
  setIfEmpty('mlsSoldPrice', result.mlsSoldPrice)
  setIfEmpty('mlsDaysOnMarket', result.mlsDaysOnMarket)
  setIfEmpty('mlsPricePerSqft', result.mlsPricePerSqft)
  setIfEmpty('mlsLastStatusDate', toDate(result.mlsLastStatusDate))
  if (Array.isArray(result.mlsKeywords) && result.mlsKeywords.length > 0) {
    const existing = Array.isArray(property.mlsKeywords) ? property.mlsKeywords : []
    if (existing.length === 0) {
      out.mlsKeywords = result.mlsKeywords
      if (fieldSources.mlsKeywords !== 'user') fieldSources.mlsKeywords = 'api'
    }
  }

  // Tier 3 — flood detail
  setIfEmpty('floodZoneType', result.floodZoneType)

  // Tier 3 — demographics
  setIfEmpty('suggestedRent', result.suggestedRent)
  setIfEmpty('medianIncome', result.medianIncome)
  setIfEmpty('hudAreaCode', result.hudAreaCode)
  setIfEmpty('hudAreaName', result.hudAreaName)
  setIfEmpty('fmrYear', result.fmrYear)
  setIfEmpty('fmrEfficiency', result.fmrEfficiency)
  setIfEmpty('fmrOneBedroom', result.fmrOneBedroom)
  setIfEmpty('fmrTwoBedroom', result.fmrTwoBedroom)
  setIfEmpty('fmrThreeBedroom', result.fmrThreeBedroom)
  setIfEmpty('fmrFourBedroom', result.fmrFourBedroom)

  // Tier 3 — schools
  setIfEmpty('schoolPrimaryName', result.schoolPrimaryName)
  setIfEmpty('schoolPrimaryRating', result.schoolPrimaryRating)
  if (Array.isArray(result.schools) && result.schools.length > 0) {
    const existing = Array.isArray(property.schoolsJson) ? property.schoolsJson : []
    if (existing.length === 0) {
      out.schoolsJson = result.schools
      if (fieldSources.schoolsJson !== 'user') fieldSources.schoolsJson = 'api'
    }
  }

  // PropertyRadar subscription extras
  // v1.1 Wave 5 — ownerFirstName1/2 + ownerLastName1/2 writes removed
  // (moved to Seller.firstName/lastName via sync-seller.ts per ordinal).
  setIfEmpty('pctChangeInValue', result.pctChangeInValue)
  setIfEmpty('cashSale', result.cashSale)
  setIfEmpty('investorType', result.investorType)
  setIfEmpty('hoaDues', result.hoaDues)
  setIfEmpty('hoaPastDue', result.hoaPastDue)
  setIfEmpty('hoaName', result.hoaName)
  setIfEmpty('lastMlsStatus', result.lastMlsStatus)
  setIfEmpty('lastMlsListPrice', result.lastMlsListPrice)
  setIfEmpty('lastMlsSoldPrice', result.lastMlsSoldPrice)
  setIfEmpty('mailingAddressVacant', result.ownerMailingVacant)

  // PR detail-endpoint fields (condition/census/tax rate/legal)
  setIfEmpty('improvementCondition', result.improvementCondition)
  setIfEmpty('buildingQuality', result.buildingQuality)
  setIfEmpty('estimatedTaxRate', result.estimatedTaxRate)
  setIfEmpty('censusTract', result.censusTract)
  setIfEmpty('censusBlock', result.censusBlock)
  setIfEmpty('carrierRoute', result.carrierRoute)
  setIfEmpty('legalDescription', result.legalDescription)

  // ── Comprehensive capture (migration 20260423060000) ─────
  // Address metadata
  setIfEmpty('addressValidity', result.addressValidity)
  setIfEmpty('zipPlus4', result.zipPlus4)

  // BatchData intel
  setIfEmpty('salePropensity', result.salePropensity)
  setIfEmpty('salePropensityCategory', result.salePropensityCategory)
  setIfEmpty('salePropensityStatus', result.salePropensityStatus)

  // Listing activity
  setIfEmpty('listingStatus', result.listingStatus)
  setIfEmpty('listingStatusCategory', result.listingStatusCategory)
  setIfEmpty('listingFailedDate', toDate(result.listingFailedDate))
  setIfEmpty('listingOriginalDate', toDate(result.listingOriginalDate))
  setIfEmpty('listingSoldPrice', result.listingSoldPrice)
  setIfEmpty('listingSoldDate', toDate(result.listingSoldDate))
  setIfEmpty('listingAgentName', result.listingAgentName)
  setIfEmpty('listingAgentPhone', result.listingAgentPhone)
  setIfEmpty('listingBrokerName', result.listingBrokerName)

  // Foreclosure detail
  setIfEmpty('foreclosureAuctionCity', result.foreclosureAuctionCity)
  setIfEmpty('foreclosureAuctionLocation', result.foreclosureAuctionLocation)
  setIfEmpty('foreclosureAuctionTime', result.foreclosureAuctionTime)
  setIfEmpty('foreclosureBorrower', result.foreclosureBorrower)
  setIfEmpty('foreclosureDocumentType', result.foreclosureDocumentType)
  setIfEmpty('foreclosureFilingDate', toDate(result.foreclosureFilingDate))
  setIfEmpty('foreclosureRecordingDate', toDate(result.foreclosureRecordingDate))
  setIfEmpty('foreclosureTrusteeName', result.foreclosureTrusteeName)
  setIfEmpty('foreclosureTrusteePhone', result.foreclosureTrusteePhone)
  setIfEmpty('foreclosureTrusteeAddress', result.foreclosureTrusteeAddress)
  setIfEmpty('foreclosureTrusteeSaleNum', result.foreclosureTrusteeSaleNum)

  // v1.1 Wave 5 — ownerPortfolio* writes removed (moved to Seller via sync-seller.ts).

  // QuickLists extras (Q3 lock — absenteeOwnerInState + samePropertyMailing
  // stay on Property as property facts; seniorOwner moved to Seller).
  setIfEmpty('absenteeOwnerInState', result.absenteeOwnerInState)
  setIfEmpty('samePropertyMailing', result.samePropertyMailing)

  // Valuation detail
  setIfEmpty('valuationAsOfDate', toDate(result.valuationAsOfDate))
  setIfEmpty('valuationConfidence', result.valuationConfidence)
  setIfEmpty('valuationStdDeviation', result.valuationStdDeviation)

  // PropertyRadar flags (cashBuyerOwner + deceasedOwner moved to Seller).
  setIfEmpty('advancedPropertyType', result.advancedPropertyType)
  setIfEmpty('lotDepthFootage', result.lotDepthFootage)
  setIfEmpty('hasOpenLiens', result.hasOpenLiens)
  setIfEmpty('hasOpenPersonLiens', result.hasOpenPersonLiens)
  setIfEmpty('sameMailingOrExempt', result.sameMailingOrExempt)
  setIfEmpty('sameMailing', result.sameMailing)
  setIfEmpty('underwater', result.underwater)
  setIfEmpty('expiredListing', result.expiredListing)

  // Multi-row JSON arrays — always set when present (no empty-check, the blob
  // IS the data and we want the latest timeline on every re-enrich).
  if (result.deedHistoryJson) out.deedHistoryJson = result.deedHistoryJson
  if (result.mortgageHistoryJson) out.mortgageHistoryJson = result.mortgageHistoryJson
  if (result.liensJson) out.liensJson = result.liensJson
  if (result.foreclosureDetailJson) out.foreclosureDetailJson = result.foreclosureDetailJson
  // v1.1 Wave 5 — ownerPortfolioJson moved to Seller (sync-seller.ts).
  if (result.valuationJson) out.valuationJson = result.valuationJson
  if (result.quickListsJson) out.quickListsJson = result.quickListsJson

  return out
}

/** Build a wholesaler-ready description from property details + research data */
function generateDescription(
  prop: { address: string; city: string; state: string; zip: string },
  details: { beds?: number | null; baths?: number | null; sqft?: number | null; yearBuilt?: number | null; lotSize?: string | null; propertyType?: string | null; occupancy?: string | null },
  research: Record<string, unknown>,
): string {
  const parts: string[] = []

  // Opening — property type + address
  const type = details.propertyType ?? (research.propertyType as string | undefined) ?? 'Property'
  parts.push(`${type} located at ${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}.`)

  // Specs line
  const specs: string[] = []
  const bd = details.beds ?? (research.bedrooms as number | undefined)
  const ba = details.baths ?? (research.bathrooms as number | undefined)
  const sf = details.sqft ?? (research.squareFootage as number | undefined)
  const yb = details.yearBuilt ?? (research.yearBuilt as number | undefined)
  if (bd) specs.push(`${bd} bed`)
  if (ba) specs.push(`${ba} bath`)
  if (sf) specs.push(`${sf.toLocaleString()} sqft`)
  if (yb) specs.push(`built ${yb}`)
  if (specs.length > 0) parts.push(specs.join(', ') + '.')

  // Lot
  const lotSf = research.lotSquareFootage as number | undefined
  const lot = details.lotSize ?? (lotSf ? (lotSf >= 43560 ? `${(lotSf / 43560).toFixed(2)} acre` : `${lotSf.toLocaleString()} sqft`) : null)
  if (lot) parts.push(`Lot size: ${lot}.`)

  // Valuation
  const estVal = research.estimatedValue as number | undefined
  const equity = research.equityPercent as number | undefined
  if (estVal) {
    let valLine = `Estimated value $${estVal.toLocaleString()}`
    if (equity != null) valLine += ` with ${Math.round(equity)}% equity`
    parts.push(valLine + '.')
  }

  // Deal signals
  const signals: string[] = []
  if (research.absenteeOwner === true) signals.push('absentee owner')
  if (research.vacant === true) signals.push('vacant')
  if (research.freeAndClear === true) signals.push('free & clear')
  if (research.highEquity === true && !signals.includes('free & clear')) signals.push('high equity')
  if (research.preforeclosure === true) signals.push('pre-foreclosure')
  if (research.taxDefault === true) signals.push('tax default')
  if (signals.length > 0) parts.push(`Deal signals: ${signals.join(', ')}.`)

  // Occupancy
  const occ = details.occupancy
  if (occ && occ !== 'Owner') parts.push(`Occupancy: ${occ}.`)

  // Last sale
  const lastSaleDate = research.lastSaleDate as string | undefined
  const lastSalePrice = research.lastSalePrice as number | undefined
  if (lastSaleDate && lastSalePrice) {
    parts.push(`Last sold ${formatReadableDate(lastSaleDate)} for $${lastSalePrice.toLocaleString()}.`)
  }

  return parts.join(' ')
}

/**
 * Enrich a Property with BatchData. Opt-in flags:
 *   skipTrace: boolean (default false) — after the base lookup, if any linked
 *              Seller is still missing phone/email, fire BatchData's
 *              /property/skip-trace endpoint (~$0.07/seller) to backfill.
 */
export async function enrichPropertyFromBatchData(
  propertyId: string,
  opts: { skipTrace?: boolean } = {},
): Promise<boolean> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: {
      tenantId: true,
      address: true, city: true, state: true, zip: true,
      beds: true, baths: true, sqft: true, yearBuilt: true,
      lotSize: true, propertyType: true, occupancy: true,
      description: true,
      taxAssessment: true, annualTax: true, deedDate: true,
      fieldSources: true, zillowData: true,
      // Tier 1+2 promoted columns — only backfill when empty
      county: true, latitude: true, longitude: true, apn: true,
      fips: true, subdivision: true,
      absenteeOwner: true,
      // v1.1 Wave 5 — ownerPhone/Email/Type/ownershipLengthYears/secondOwner* removed (moved to Seller).
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
      // Tier 3
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
      // PropertyRadar subscription extras
      // v1.1 Wave 5 — ownerFirstName1/2 + ownerLastName1/2 removed (moved to Seller).
      pctChangeInValue: true, cashSale: true, investorType: true,
      hoaDues: true, hoaPastDue: true, hoaName: true,
      lastMlsStatus: true, lastMlsListPrice: true, lastMlsSoldPrice: true,
      mailingAddressVacant: true,
      // PR detail-endpoint fields
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
      // v1.1 Wave 5 — ownerPortfolio* + seniorOwner + cashBuyerOwner +
      // deceasedOwner + ownerPortfolioJson all moved to Seller.
      absenteeOwnerInState: true, samePropertyMailing: true,
      valuationAsOfDate: true, valuationConfidence: true, valuationStdDeviation: true,
      advancedPropertyType: true, lotDepthFootage: true,
      hasOpenLiens: true, hasOpenPersonLiens: true,
      sameMailingOrExempt: true, sameMailing: true,
      underwater: true, expiredListing: true,
      deedHistoryJson: true, mortgageHistoryJson: true, liensJson: true,
      foreclosureDetailJson: true,
      valuationJson: true, quickListsJson: true,
      // Google
      googlePlaceId: true, googleVerifiedAddress: true,
      googleLatitude: true, googleLongitude: true,
      googleStreetViewUrl: true, googleMapsUrl: true,
      googlePlaceTypes: true, googlePhotoThumbnailUrl: true,
      googleSearchedAt: true,
    },
  })
  if (!property || !property.address) return false

  // Skip if already enriched in the last 30 days
  const existingZillow = (property.zillowData ?? {}) as Record<string, unknown>
  const existingBatch = (existingZillow.batchData ?? {}) as Record<string, unknown>
  if (existingBatch.enrichedAt) {
    const enrichedDate = new Date(existingBatch.enrichedAt as string)
    const daysSince = (Date.now() - enrichedDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) {
      console.log(`[BatchData] Skipping ${property.address} — enriched ${Math.round(daysSince)}d ago`)
      return true // Already enriched, skip API call
    }
  }

  console.log(`[BatchData] Enriching: ${property.address}, ${property.city}, ${property.state} ${property.zip}`)
  const result = await lookupProperty(property.address, property.city, property.state, property.zip)
  if (!result) return false

  // Build update — only backfill empty fields, mark as "api" (purple)
  const updateData: Record<string, unknown> = {}
  const fieldSources = { ...((property.fieldSources as Record<string, string>) ?? {}) }

  // Fix any old 'ai' sources that should be 'api' (from before the source rename)
  for (const f of ['beds', 'baths', 'sqft', 'yearBuilt', 'lotSize', 'propertyType']) {
    if (fieldSources[f] === 'ai') fieldSources[f] = 'api'
  }

  if (result.bedrooms) {
    if (property.beds == null) updateData.beds = result.bedrooms
    if (!fieldSources.beds || fieldSources.beds !== 'user') fieldSources.beds = 'api'
  }
  if (result.bathrooms) {
    if (property.baths == null) updateData.baths = result.bathrooms
    if (!fieldSources.baths || fieldSources.baths !== 'user') fieldSources.baths = 'api'
  }
  if (result.squareFootage) {
    if (property.sqft == null) updateData.sqft = result.squareFootage
    if (!fieldSources.sqft || fieldSources.sqft !== 'user') fieldSources.sqft = 'api'
  }
  if (result.yearBuilt) {
    if (property.yearBuilt == null) updateData.yearBuilt = result.yearBuilt
    if (!fieldSources.yearBuilt || fieldSources.yearBuilt !== 'user') fieldSources.yearBuilt = 'api'
  }
  if (!property.lotSize && result.lotSquareFootage) {
    const acres = result.lotSquareFootage / 43560
    updateData.lotSize = acres >= 1 ? `${acres.toFixed(2)} ac` : `${result.lotSquareFootage.toLocaleString()} sqft`
    fieldSources.lotSize = 'api'
  }
  // Auto-derive occupancy from ownerOccupied
  if (!property.occupancy && result.ownerOccupied != null) {
    updateData.occupancy = result.ownerOccupied ? 'Owner' : 'Renter'
    fieldSources.occupancy = 'api'
  }

  // Populate dedicated DB fields from BatchData (instead of only from AI)
  if (property.taxAssessment == null && result.taxAssessedValue) {
    updateData.taxAssessment = result.taxAssessedValue; fieldSources.taxAssessment = 'api'
  }
  if (property.annualTax == null && result.annualTaxAmount) {
    updateData.annualTax = result.annualTaxAmount; fieldSources.annualTax = 'api'
  }
  if (!property.deedDate && result.lastSaleDate) {
    try { updateData.deedDate = new Date(result.lastSaleDate); fieldSources.deedDate = 'api' } catch { /* skip invalid date */ }
  }

  if (!property.propertyType && result.propertyType) {
    const typeMap: Record<string, string> = {
      'single family residential': 'House', 'sfr': 'House', 'single family': 'House',
      'multi-family': 'Multi-Family', 'multifamily': 'Multi-Family',
      'condo': 'Condo', 'condominium': 'Condo',
      'townhouse': 'Townhome', 'townhome': 'Townhome',
      'mobile home': 'Mobile Home', 'manufactured': 'Mobile Home',
      'land': 'Land', 'vacant land': 'Land',
      'commercial': 'Commercial',
    }
    updateData.propertyType = typeMap[result.propertyType.toLowerCase()] ?? result.propertyType
    fieldSources.propertyType = 'api'
  }

  // Store full BatchData for Research tab
  const existingResearch = (property.zillowData ?? {}) as Record<string, unknown>
  updateData.zillowData = {
    ...existingResearch,
    batchData: {
      // Valuation
      estimatedValue: result.estimatedValue,
      assessedValue: result.assessedValue,
      priceRangeMin: result.priceRangeMin,
      priceRangeMax: result.priceRangeMax,
      confidenceScore: result.confidenceScore,
      equityPercent: result.equityPercent,
      ltv: result.ltv,
      apn: result.apn,
      // Owner
      ownerName: result.ownerName,
      ownerMailingAddress: result.ownerMailingAddress,
      absenteeOwner: result.absenteeOwner,
      ownerOccupied: result.ownerOccupied,
      // Quick flags
      cashBuyer: result.cashBuyer,
      freeAndClear: result.freeAndClear,
      highEquity: result.highEquity,
      taxDefault: result.taxDefault,
      preforeclosure: result.preforeclosure,
      vacant: result.vacant,
      corporateOwned: result.corporateOwned,
      trustOwned: result.trustOwned,
      // Liens + history
      totalOpenLienCount: result.totalOpenLienCount,
      lastSaleDate: result.lastSaleDate,
      lastSalePrice: result.lastSalePrice,
      lastSaleType: result.lastSaleType,
      // Permits
      permitCount: result.permitCount,
      permitTags: result.permitTags,
      // Building
      bedrooms: result.bedrooms,
      bathrooms: result.bathrooms,
      squareFootage: result.squareFootage,
      lotSquareFootage: result.lotSquareFootage,
      yearBuilt: result.yearBuilt,
      // Location
      latitude: result.latitude,
      longitude: result.longitude,
      county: result.county,
      // Additional building
      stories: result.stories,
      garageSpaces: result.garageSpaces,
      pool: result.pool,
      foundation: result.foundation,
      roofType: result.roofType,
      heatingType: result.heatingType,
      coolingType: result.coolingType,
      exteriorWalls: result.exteriorWalls,
      // Tax
      taxAssessedValue: result.taxAssessedValue,
      taxYear: result.taxYear,
      annualTaxAmount: result.annualTaxAmount,
      // School + zoning
      schoolDistrict: result.schoolDistrict,
      zoning: result.zoning,
      zoningDescription: result.zoningDescription,
      // Owner details
      ownerType: result.ownerType,
      ownershipLength: result.ownershipLength,
      // Mortgage
      mortgageAmount: result.mortgageAmount,
      mortgageLender: result.mortgageLender,
      mortgageDate: result.mortgageDate,
      mortgageType: result.mortgageType,
      // Meta
      enrichedAt: new Date().toISOString(),
    },
  }
  // Auto-generate description from research + property details (source: ai = blue)
  if (!property.description) {
    const batchData = (updateData.zillowData as Record<string, unknown>)?.batchData as Record<string, unknown> ?? {}
    const desc = generateDescription(
      { address: property.address, city: property.city ?? '', state: property.state ?? '', zip: property.zip ?? '' },
      {
        beds: (updateData.beds as number | undefined) ?? property.beds,
        baths: (updateData.baths as number | undefined) ?? property.baths,
        sqft: (updateData.sqft as number | undefined) ?? property.sqft,
        yearBuilt: (updateData.yearBuilt as number | undefined) ?? property.yearBuilt,
        lotSize: (updateData.lotSize as string | undefined) ?? property.lotSize,
        propertyType: (updateData.propertyType as string | undefined) ?? property.propertyType,
        occupancy: property.occupancy,
      },
      batchData,
    )
    if (desc.length > 30) {
      updateData.description = desc
      fieldSources.description = 'ai'
    }
  }

  // Denormalize Tier 1+2 fields from the BatchData response into typed
  // Property columns. Only backfills empty fields, marks each as `api`.
  const denorm = buildDenormUpdate(property as PropertySlice, result, fieldSources)
  Object.assign(updateData, denorm)

  updateData.fieldSources = fieldSources

  await db.property.update({ where: { id: propertyId }, data: updateData })

  const backfilled = Object.keys(updateData).filter(k => k !== 'zillowData' && k !== 'fieldSources')
  console.log(`[BatchData] Done: ${property.address}${backfilled.length > 0 ? ` — backfilled ${backfilled.join(', ')}` : ''}`)

  // Push owner + ownership data to any linked Sellers. Fire-and-don't-block;
  // we've already written the Property row and log any sync failure below.
  try {
    const sync = await syncSellersFromVendorResult(propertyId, property.tenantId, result)
    if (sync.updatedCount > 0) {
      console.log(`[BatchData] Seller sync: ${sync.updatedCount} seller(s) → ${sync.fieldsTouched.length} fields (${sync.fieldsTouched.slice(0, 6).join(', ')}${sync.fieldsTouched.length > 6 ? '…' : ''})`)
    }
  } catch (err) {
    console.error('[BatchData] Seller sync failed:', err instanceof Error ? err.message : err)
  }

  // Optional second pass — skip-trace each Seller that's still missing contact
  // info. Costs ~$0.07 per seller; only fires when explicitly requested by
  // the caller (e.g., manual re-enrich button, not the cron backfill).
  if (opts.skipTrace) {
    try {
      const trace = await skipTraceSellersForProperty(propertyId, property.tenantId)
      if (trace.totalTraced > 0) {
        console.log(`[BatchData] Skip-trace: ${trace.totalTraced} seller(s) traced, ${trace.totalFieldsTouched} fields filled, ${trace.skipped} skipped (already complete)`)
      }
    } catch (err) {
      console.error('[BatchData] Skip-trace failed:', err instanceof Error ? err.message : err)
    }
  }

  return true
}
