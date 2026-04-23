// scripts/coverage-probe.ts
//
// End-to-end coverage probe. For each test address:
//   1. Create a synthetic Property row (if absent)
//   2. Attach a synthetic Seller (best-effort from LLC name lookup)
//   3. Run the full enrichment orchestrator (BatchData + PR + Google + CL)
//   4. Count populated Property columns + Seller columns after enrichment
//   5. Clean up the synthetic rows so prod data is untouched
//
// Usage:
//   npx tsx scripts/coverage-probe.ts
//
// Reads .env.local for API keys and DATABASE_URL. Requires a tenant to attach
// test data to; we pick the first tenant by createdAt.

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

interface Addr {
  street: string
  city: string
  state: string
  zip: string
}

const ADDRS: Addr[] = [
  { street: '1915 S Main St', city: 'Springfield', state: 'TN', zip: '37172' },
  { street: '331 Eastland Ave', city: 'Ripley', state: 'TN', zip: '38063' },
  { street: '1400 Johnson St', city: 'Etowah', state: 'TN', zip: '37331' },
]

// Fields that signal real data capture (address/tenantId/id etc. are always set).
const PROPERTY_DATA_FIELDS = [
  'beds', 'baths', 'sqft', 'yearBuilt', 'lotSize', 'propertyType', 'occupancy',
  'description', 'taxAssessment', 'annualTax', 'deedDate',
  'county', 'latitude', 'longitude', 'apn', 'fips', 'subdivision',
  'absenteeOwner', 'ownerPhone', 'ownerEmail', 'ownerType', 'ownershipLengthYears',
  'secondOwnerName', 'secondOwnerPhone', 'secondOwnerEmail',
  'mortgageAmount', 'mortgageDate', 'mortgageLender', 'mortgageType', 'mortgageRate',
  'secondMortgageAmount', 'secondMortgageDate', 'secondMortgageLender',
  'lienCount', 'propertyLienAmount', 'lienTypes', 'judgmentCount',
  'taxDelinquent', 'taxDelinquentAmount',
  'foreclosureStatus', 'bankOwned', 'preForeclosure',
  'nodDate', 'lisPendensDate', 'lisPendensAmount', 'lisPendensPlaintiff',
  'foreclosureAuctionDate', 'foreclosureOpeningBid',
  'stories', 'units', 'basementFinishedPercent',
  'lastSalePrice', 'transferCount', 'deedType', 'dataLastUpdated',
  'roofType', 'foundationType', 'garageType', 'garageCapacity',
  'heatingSystem', 'coolingSystem', 'exteriorWalls',
  'hasPool', 'hasDeck', 'hasPorch', 'hasSolar', 'hasFireplace', 'hasSpa',
  'zoningCode', 'landUseCode', 'propertySchoolDistrict',
  'earthquakeZone', 'wildfireRisk',
  'vacantStatus', 'vacantStatusYear', 'siteVacant', 'mailVacant',
  'distressScore', 'inBankruptcy', 'inProbate', 'inDivorce',
  'hasRecentEviction', 'isRecentFlip', 'isRecentSale', 'isListedForSale', 'isAuction',
  'availableEquity', 'estimatedEquity', 'equityPercent',
  'openMortgageBalance', 'estimatedMortgagePayment',
  'inherited', 'deathTransfer', 'mortgageAssumable',
  'mlsActive', 'mlsPending', 'mlsSold', 'mlsCancelled', 'mlsFailed',
  'mlsStatus', 'mlsType',
  'mlsListingDate', 'mlsListingPrice', 'mlsSoldPrice',
  'mlsDaysOnMarket', 'mlsPricePerSqft', 'mlsKeywords', 'mlsLastStatusDate',
  'floodZoneType',
  'suggestedRent', 'medianIncome', 'hudAreaCode', 'hudAreaName',
  'fmrYear', 'fmrEfficiency', 'fmrOneBedroom', 'fmrTwoBedroom',
  'fmrThreeBedroom', 'fmrFourBedroom',
  'schoolPrimaryName', 'schoolPrimaryRating', 'schoolsJson',
  'ownerFirstName1', 'ownerLastName1', 'ownerFirstName2', 'ownerLastName2',
  'pctChangeInValue', 'cashSale', 'investorType',
  'hoaDues', 'hoaPastDue', 'hoaName',
  'lastMlsStatus', 'lastMlsListPrice', 'lastMlsSoldPrice',
  'ownerMailingVacant',
  // NEW — PropertyRadar detail-endpoint fields
  'improvementCondition', 'buildingQuality', 'estimatedTaxRate',
  'censusTract', 'censusBlock', 'carrierRoute', 'legalDescription',
  // Comprehensive capture (20260423060000)
  'addressValidity', 'zipPlus4',
  'salePropensity', 'salePropensityCategory', 'salePropensityStatus',
  'listingStatus', 'listingStatusCategory',
  'listingFailedDate', 'listingOriginalDate',
  'listingSoldPrice', 'listingSoldDate',
  'listingAgentName', 'listingAgentPhone', 'listingBrokerName',
  'foreclosureAuctionCity', 'foreclosureAuctionLocation', 'foreclosureAuctionTime',
  'foreclosureBorrower', 'foreclosureDocumentType',
  'foreclosureFilingDate', 'foreclosureRecordingDate',
  'foreclosureTrusteeName', 'foreclosureTrusteePhone',
  'foreclosureTrusteeAddress', 'foreclosureTrusteeSaleNum',
  'ownerPortfolioCount', 'ownerPortfolioTotalEquity',
  'ownerPortfolioTotalValue', 'ownerPortfolioTotalPurchase',
  'ownerPortfolioAvgAssessed', 'ownerPortfolioAvgPurchase',
  'ownerPortfolioAvgYearBuilt',
  'absenteeOwnerInState', 'seniorOwner', 'samePropertyMailing',
  'valuationAsOfDate', 'valuationConfidence', 'valuationStdDeviation',
  'advancedPropertyType', 'lotDepthFootage',
  'cashBuyerOwner', 'deceasedOwner',
  'hasOpenLiens', 'hasOpenPersonLiens',
  'sameMailingOrExempt', 'sameMailing',
  'underwater', 'expiredListing',
  'deedHistoryJson', 'mortgageHistoryJson', 'liensJson',
  'foreclosureDetailJson', 'ownerPortfolioJson',
  'valuationJson', 'quickListsJson',
  // Google
  'googlePlaceId', 'googleVerifiedAddress',
  'googleLatitude', 'googleLongitude',
  'googleStreetViewUrl', 'googleMapsUrl',
  'googlePlaceTypes', 'googlePhotoThumbnailUrl',
] as const

// Note: `name` excluded because it's pre-populated as 'Probe Owner' to satisfy
// the required column; setIfEmpty won't overwrite it so it would always count.
const SELLER_DATA_FIELDS = [
  'phone', 'secondaryPhone', 'mobilePhone',
  'email', 'secondaryEmail',
  'mailingAddress', 'mailingCity', 'mailingState', 'mailingZip',
  'mailingZipPlus4', 'mailingCounty', 'mailingValidity',
  'mailingDeliveryPoint', 'mailingDpvFootnotes', 'mailingDpvMatchCode',
  'spouseName', 'spousePhone', 'spouseEmail',
  'isDeceased', 'age', 'gender', 'personType', 'occupation',
  'yearsOwned', 'howAcquired', 'ownershipType', 'entityName',
  'mortgageBalance', 'lenderName', 'interestRate', 'loanType',
  'hasSecondMortgage',
  'clBankruptcyCount', 'clDivorceCount', 'clCivilJudgmentCount',
  'clProbateCount', 'clCasesSearchedAt',
] as const

function isPopulated(v: unknown): boolean {
  if (v == null) return false
  if (v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return false
    return entries.some(([, val]) => isPopulated(val))
  }
  return true
}

async function main() {
  await loadEnvLocal()

  const { db } = await import('../lib/db/client')
  const { enrichProperty } = await import('../lib/enrichment/enrich-property')

  const tenant = await db.tenant.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!tenant) {
    console.error('[Probe] No tenant in DB — cannot attach test data.')
    process.exit(1)
  }
  console.log(`[Probe] Using tenant ${tenant.slug} (${tenant.id})`)
  console.log('')

  const summary: Array<{
    address: string
    propertyFilled: number
    propertyTotal: number
    sellerFilled: number
    sellerTotal: number
    durationMs: number
    sellers: number
  }> = []

  for (const addr of ADDRS) {
    console.log(`─── ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip} ───`)

    // Create synthetic property
    const property = await db.property.create({
      data: {
        tenantId: tenant.id,
        address: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
      },
    })
    console.log(`  Property ID: ${property.id}`)

    // Attach a blank seller so owner data has a home
    const seller = await db.seller.create({
      data: {
        tenantId: tenant.id,
        name: 'Probe Owner',
      },
    })
    await db.propertySeller.create({
      data: { propertyId: property.id, sellerId: seller.id },
    })

    const t0 = Date.now()
    let outcome: Awaited<ReturnType<typeof enrichProperty>> | null = null
    try {
      outcome = await enrichProperty(property.id, { skipTrace: false })
    } catch (err) {
      console.log(`  [!] Orchestrator error: ${err instanceof Error ? err.message : String(err)}`)
    }
    const durationMs = Date.now() - t0

    if (outcome) {
      console.log(`  Vendors: BD=${outcome.batchdata.matched ? 'y' : 'n'} PR=${outcome.propertyRadar.matched ? 'y' : 'n'} G=${outcome.google.matched ? 'y' : 'n'} CL=${outcome.courtlistener.ran ? `${outcome.courtlistener.totalCases} cases` : 'skipped'}`)
      console.log(`  Columns written: ${outcome.columnsWritten}`)
    }

    // Re-read with ALL data fields
    const finalProperty = await db.property.findUnique({
      where: { id: property.id },
      select: PROPERTY_DATA_FIELDS.reduce<Record<string, true>>((acc, f) => {
        acc[f] = true
        return acc
      }, {}),
    })

    const sellers = await db.propertySeller.findMany({
      where: { propertyId: property.id },
      select: {
        seller: {
          select: SELLER_DATA_FIELDS.reduce<Record<string, true>>((acc, f) => {
            acc[f] = true
            return acc
          }, {}),
        },
      },
    })

    let propertyFilled = 0
    const propertyRow = finalProperty as Record<string, unknown> | null
    if (propertyRow) {
      for (const f of PROPERTY_DATA_FIELDS) {
        if (isPopulated(propertyRow[f])) propertyFilled++
      }
    }

    let sellerFilled = 0
    const sellerSample = sellers[0]?.seller as Record<string, unknown> | undefined
    if (sellerSample) {
      for (const f of SELLER_DATA_FIELDS) {
        if (isPopulated(sellerSample[f])) sellerFilled++
      }
    }

    console.log(`  Property fields filled: ${propertyFilled} / ${PROPERTY_DATA_FIELDS.length}`)
    console.log(`  Seller  fields filled: ${sellerFilled} / ${SELLER_DATA_FIELDS.length}`)
    console.log(`  Duration: ${(durationMs / 1000).toFixed(1)}s`)

    // Debug: which NEW PR detail fields were captured?
    const prDetailFields = [
      'improvementCondition', 'buildingQuality', 'estimatedTaxRate',
      'censusTract', 'censusBlock', 'carrierRoute', 'legalDescription',
    ] as const
    const prHits: string[] = []
    for (const f of prDetailFields) {
      const v = propertyRow?.[f]
      if (isPopulated(v)) prHits.push(`${f}=${String(v).slice(0, 20)}`)
    }
    console.log(`  PR detail captured (${prHits.length}/${prDetailFields.length}): ${prHits.join(' | ') || 'none'}`)

    // Debug: owner demographics from /persons
    const demoFields = ['age', 'gender', 'personType', 'occupation'] as const
    const demoHits: string[] = []
    for (const f of demoFields) {
      const v = sellerSample?.[f]
      if (isPopulated(v)) demoHits.push(`${f}=${String(v).slice(0, 20)}`)
    }
    console.log(`  Owner demo captured (${demoHits.length}/${demoFields.length}): ${demoHits.join(' | ') || 'none'}`)
    console.log('')

    summary.push({
      address: `${addr.street}, ${addr.city}`,
      propertyFilled,
      propertyTotal: PROPERTY_DATA_FIELDS.length,
      sellerFilled,
      sellerTotal: SELLER_DATA_FIELDS.length,
      durationMs,
      sellers: sellers.length,
    })

    // Cleanup synthetic rows so prod state is untouched
    await db.propertySeller.deleteMany({ where: { propertyId: property.id } })
    await db.seller.delete({ where: { id: seller.id } }).catch(() => {})
    await db.property.delete({ where: { id: property.id } }).catch(() => {})
  }

  console.log('═══ SUMMARY ═══')
  for (const s of summary) {
    const pPct = Math.round((s.propertyFilled / s.propertyTotal) * 100)
    const sPct = Math.round((s.sellerFilled / s.sellerTotal) * 100)
    console.log(
      `  ${s.address.padEnd(32)} — Property ${s.propertyFilled}/${s.propertyTotal} (${pPct}%)  Seller ${s.sellerFilled}/${s.sellerTotal} (${sPct}%)  [${(s.durationMs / 1000).toFixed(1)}s]`,
    )
  }
  const totalProp = summary.reduce((a, b) => a + b.propertyFilled, 0)
  const totalSeller = summary.reduce((a, b) => a + b.sellerFilled, 0)
  console.log('')
  console.log(`  TOTAL Property fields: ${totalProp} across ${summary.length} properties`)
  console.log(`  TOTAL Seller  fields: ${totalSeller} across ${summary.length} properties`)

  await db.$disconnect()
}

main().catch(err => {
  console.error('[Probe] Fatal:', err)
  process.exit(1)
})
