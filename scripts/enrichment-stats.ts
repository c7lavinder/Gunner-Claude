// scripts/enrichment-stats.ts
// Computes real numbers: avg fields filled per lead, vendor-match rate,
// projected cost per lead given the current orchestrator config.

import fs from 'node:fs/promises'
import path from 'node:path'

async function loadEnvLocal(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch { /* optional */ }
}

// Every Property column we now capture from vendors
const VENDOR_FIELDS = [
  'beds','baths','sqft','yearBuilt','lotSize','propertyType','occupancy','description',
  'taxAssessment','annualTax','deedDate','county','latitude','longitude','apn','fips','subdivision',
  'absenteeOwner','ownerPhone','ownerEmail','ownerType','ownershipLengthYears',
  'secondOwnerName','secondOwnerPhone','secondOwnerEmail',
  'mortgageAmount','mortgageDate','mortgageLender','mortgageType','mortgageRate',
  'secondMortgageAmount','secondMortgageDate','secondMortgageLender',
  'lienCount','propertyLienAmount','lienTypes','judgmentCount',
  'taxDelinquent','taxDelinquentAmount','foreclosureStatus','bankOwned','preForeclosure',
  'nodDate','lisPendensDate','lisPendensAmount','lisPendensPlaintiff',
  'foreclosureAuctionDate','foreclosureOpeningBid',
  'stories','units','basementFinishedPercent',
  'lastSalePrice','transferCount','deedType','dataLastUpdated',
  'roofType','foundationType','garageType','garageCapacity','heatingSystem','coolingSystem','exteriorWalls',
  'hasPool','hasDeck','hasPorch','hasSolar','hasFireplace','hasSpa',
  'zoningCode','landUseCode','propertySchoolDistrict','earthquakeZone','wildfireRisk',
  'vacantStatus','vacantStatusYear','siteVacant','mailVacant',
  'distressScore','inBankruptcy','inProbate','inDivorce','hasRecentEviction',
  'isRecentFlip','isRecentSale','isListedForSale','isAuction',
  'availableEquity','estimatedEquity','equityPercent','openMortgageBalance','estimatedMortgagePayment',
  'inherited','deathTransfer','mortgageAssumable',
  'mlsActive','mlsPending','mlsSold','mlsCancelled','mlsFailed','mlsStatus','mlsType',
  'mlsListingDate','mlsListingPrice','mlsSoldPrice','mlsDaysOnMarket','mlsPricePerSqft','mlsKeywords',
  'mlsLastStatusDate','floodZoneType',
  'suggestedRent','medianIncome','hudAreaCode','hudAreaName',
  'fmrYear','fmrEfficiency','fmrOneBedroom','fmrTwoBedroom','fmrThreeBedroom','fmrFourBedroom',
  'schoolPrimaryName','schoolPrimaryRating','schoolsJson',
  'ownerFirstName1','ownerLastName1','ownerFirstName2','ownerLastName2',
  'pctChangeInValue','cashSale','investorType','hoaDues','hoaPastDue','hoaName',
  'lastMlsStatus','lastMlsListPrice','lastMlsSoldPrice','ownerMailingVacant',
  'improvementCondition','buildingQuality','estimatedTaxRate','censusTract','censusBlock','carrierRoute','legalDescription',
  'addressValidity','zipPlus4',
  'salePropensity','salePropensityCategory','salePropensityStatus',
  'listingStatus','listingStatusCategory','listingFailedDate','listingOriginalDate',
  'listingSoldPrice','listingSoldDate','listingAgentName','listingAgentPhone','listingBrokerName',
  'foreclosureAuctionCity','foreclosureAuctionLocation','foreclosureAuctionTime',
  'foreclosureBorrower','foreclosureDocumentType','foreclosureFilingDate','foreclosureRecordingDate',
  'foreclosureTrusteeName','foreclosureTrusteePhone','foreclosureTrusteeAddress','foreclosureTrusteeSaleNum',
  'ownerPortfolioCount','ownerPortfolioTotalEquity','ownerPortfolioTotalValue','ownerPortfolioTotalPurchase',
  'ownerPortfolioAvgAssessed','ownerPortfolioAvgPurchase','ownerPortfolioAvgYearBuilt',
  'absenteeOwnerInState','seniorOwner','samePropertyMailing',
  'valuationAsOfDate','valuationConfidence','valuationStdDeviation',
  'advancedPropertyType','lotDepthFootage',
  'cashBuyerOwner','deceasedOwner','hasOpenLiens','hasOpenPersonLiens',
  'sameMailingOrExempt','sameMailing','underwater','expiredListing',
  'deedHistoryJson','mortgageHistoryJson','liensJson',
  'foreclosureDetailJson','ownerPortfolioJson','valuationJson','quickListsJson',
  'googlePlaceId','googleVerifiedAddress','googleLatitude','googleLongitude',
  'googleStreetViewUrl','googleMapsUrl','googlePlaceTypes','googlePhotoThumbnailUrl',
] as const

async function main() {
  await loadEnvLocal()
  const { db } = await import('../lib/db/client')

  // Look at last 7 days of leads for a stable sample
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const leads = await db.property.findMany({
    where: { createdAt: { gte: since }, address: { not: '' } },
    select: VENDOR_FIELDS.reduce<Record<string, true>>((a, f) => { a[f] = true; return a }, {
      id: true, address: true, city: true, state: true, createdAt: true, zillowData: true,
    } as Record<string, true>),
    orderBy: { createdAt: 'desc' },
  })

  if (leads.length === 0) {
    console.log('[Stats] No leads in the last 7 days.')
    await db.$disconnect()
    return
  }

  console.log(`[Stats] Analyzing ${leads.length} leads from the last 7 days`)
  console.log('')

  let bdMatched = 0
  let prMatched = 0      // proxy: any PR-sourced field set
  let googleMatched = 0
  const fillCounts: number[] = []

  const prSignalFields = ['distressScore','improvementCondition','buildingQuality','advancedPropertyType','censusTract']
  const bdSignalFields = ['salePropensity','ownerPortfolioCount','addressValidity','deedHistoryJson','valuationJson']

  for (const lead of leads) {
    const row = lead as unknown as Record<string, unknown>

    let filled = 0
    for (const f of VENDOR_FIELDS) {
      const v = row[f]
      if (v == null) continue
      if (v === '') continue
      if (Array.isArray(v) && v.length === 0) continue
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v as object).length === 0) continue
      filled++
    }
    fillCounts.push(filled)

    // Vendor attribution via zillowData blob
    const zillow = (row.zillowData ?? {}) as Record<string, unknown>
    if (zillow.batchData) bdMatched++
    // PR: we don't persist a blob, use field presence
    if (prSignalFields.some(f => row[f] != null)) prMatched++
    if (row.googlePlaceId) googleMatched++
  }

  const avgFilled = Math.round(fillCounts.reduce((a, b) => a + b, 0) / fillCounts.length)
  const minFilled = Math.min(...fillCounts)
  const maxFilled = Math.max(...fillCounts)

  console.log('═══ Coverage (fields filled per lead) ═══')
  console.log(`  Total trackable vendor fields: ${VENDOR_FIELDS.length}`)
  console.log(`  Avg filled: ${avgFilled} / ${VENDOR_FIELDS.length}  (${Math.round(avgFilled/VENDOR_FIELDS.length*100)}%)`)
  console.log(`  Min / Max:  ${minFilled} / ${maxFilled}`)
  console.log('')

  console.log('═══ Vendor match rate ═══')
  console.log(`  BatchData    ran and matched: ${bdMatched} / ${leads.length}  (${Math.round(bdMatched/leads.length*100)}%)`)
  console.log(`  PropertyRadar ran and matched: ${prMatched} / ${leads.length}  (${Math.round(prMatched/leads.length*100)}%)`)
  console.log(`  Google       ran and matched: ${googleMatched} / ${leads.length}  (${Math.round(googleMatched/leads.length*100)}%)`)
  console.log('')

  console.log('═══ Projected cost at current config ═══')
  const GOOGLE_COST = 0.017
  const BD_COST = 0.30
  const costPerLead = (bdMatched / leads.length) * BD_COST + GOOGLE_COST
  console.log(`  PropertyRadar:  $0.00 per call (flat-rate subscription)`)
  console.log(`  Google Places:  $${GOOGLE_COST.toFixed(3)} per call`)
  console.log(`  BatchData:      $${BD_COST.toFixed(2)} per call (fires on ${Math.round(bdMatched/leads.length*100)}% of leads w/ current match rate)`)
  console.log(`  Avg per lead:   $${costPerLead.toFixed(3)}`)
  console.log(`  Per 100 leads:  $${(costPerLead * 100).toFixed(2)}`)
  console.log('')

  console.log('═══ 7-day actuals ═══')
  console.log(`  Leads: ${leads.length}`)
  console.log(`  BD calls billed: ${bdMatched}  ($${(bdMatched * BD_COST).toFixed(2)})`)
  console.log(`  Google calls:    ${googleMatched}  ($${(googleMatched * GOOGLE_COST).toFixed(2)})`)
  console.log(`  PR calls:        ${prMatched}  ($0.00 — subscription)`)
  console.log(`  Total:           $${(bdMatched*BD_COST + googleMatched*GOOGLE_COST).toFixed(2)}`)

  await db.$disconnect()
}

main().catch(err => {
  console.error('[Stats] Fatal:', err)
  process.exit(1)
})
