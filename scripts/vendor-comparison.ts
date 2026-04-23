// scripts/vendor-comparison.ts
//
// Side-by-side vendor comparison harness. Feeds one address through every
// configured vendor (BatchData, PropertyRadar, REAPI, RentCast) in parallel
// and prints a per-field coverage matrix, so we can decide which vendor to
// prioritize for which slice of data.
//
// Usage:
//   npx tsx scripts/vendor-comparison.ts "500 Dale St" "Allentown" "PA" "18103"
//   npx tsx scripts/vendor-comparison.ts --json "500 Dale St" "Allentown" "PA" "18103"
//
// Flags:
//   --json           emit raw vendor responses to stdout as JSON
//   --only=name,...  restrict to a subset (batchdata, propertyradar, reapi, rentcast)

import fs from 'node:fs/promises'
import path from 'node:path'
import { lookupProperty as lookupBatchData } from '../lib/batchdata/client'
import { lookupProperty as lookupPropertyRadar } from '../lib/propertyradar/client'
import { lookupProperty as lookupReapi } from '../lib/realestateapi/client'
import { lookupProperty as lookupRentCast } from '../lib/rentcast/client'

// Eagerly load .env.local before any vendor call reads `process.env`.
// Clients read env at call-time via getApiKey(), so this runs-before-main is
// enough. Pattern matches scripts/verify-calls-pipeline.ts (no dotenv dep).
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

interface Args {
  street: string
  city: string
  state: string
  zip: string
  json: boolean
  only: Set<string> | null
}

function parseArgs(): Args {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      flags[k] = v ?? true
    } else {
      positional.push(a)
    }
  }
  if (positional.length !== 4) {
    console.error('Usage: npx tsx scripts/vendor-comparison.ts "<street>" "<city>" "<state>" "<zip>"')
    process.exit(1)
  }
  const [street, city, state, zip] = positional
  return {
    street, city, state, zip,
    json: flags.json === true,
    only: typeof flags.only === 'string' ? new Set(flags.only.split(',').map(s => s.trim().toLowerCase())) : null,
  }
}

const COMPARISON_FIELDS = [
  'apn', 'fips', 'subdivision',
  'county', 'latitude', 'longitude',
  'bedrooms', 'bathrooms', 'squareFootage', 'lotSquareFootage', 'yearBuilt',
  'propertyType', 'stories', 'units',
  'estimatedValue', 'priceRangeMin', 'priceRangeMax', 'confidenceScore',
  'taxAssessedValue', 'annualTaxAmount',
  'ownerName', 'ownerType', 'absenteeOwner', 'ownerOccupied',
  'ownerPhone', 'ownerEmail',
  'secondOwnerName', 'secondOwnerPhone', 'secondOwnerEmail',
  'ownershipLength',
  'mortgageAmount', 'mortgageLender', 'mortgageRate', 'mortgageType', 'mortgageDate',
  'secondMortgageAmount', 'secondMortgageLender', 'secondMortgageDate',
  'totalOpenLienCount', 'totalOpenLienAmount', 'lienTypes', 'judgmentCount',
  'taxDelinquent', 'taxDelinquentAmount',
  'foreclosureStatus', 'nodDate', 'lisPendensDate',
  'lisPendensAmount', 'lisPendensPlaintiff',
  'foreclosureAuctionDate', 'foreclosureOpeningBid',
  'bankOwned', 'preforeclosure',
  'lastSaleDate', 'lastSalePrice', 'deedType', 'transferCount',
  'roofType', 'foundation', 'garageType', 'garageSpaces',
  'heatingType', 'coolingType', 'exteriorWalls',
  'pool', 'hasDeck', 'hasPorch', 'hasSolar', 'hasFireplace', 'hasSpa',
  'schoolDistrict', 'zoning', 'landUseCode',
  'floodZone', 'floodZoneType', 'earthquakeZone', 'wildfireRisk',
  'vacantStatus', 'vacant',
  // Tier 3 — distress + equity
  'distressScore', 'inBankruptcy', 'inProbate', 'inDivorce', 'hasRecentEviction',
  'isRecentFlip', 'isRecentSale', 'isListedForSale', 'isAuction',
  'availableEquity', 'estimatedEquity', 'equityPercentTier3',
  'openMortgageBalance', 'estimatedMortgagePayment',
  'inherited', 'deathTransfer', 'mortgageAssumable',
  // Tier 3 — MLS
  'mlsActive', 'mlsPending', 'mlsSold', 'mlsStatus', 'mlsType',
  'mlsListingDate', 'mlsListingPrice', 'mlsSoldPrice', 'mlsDaysOnMarket',
  // Tier 3 — demographics / schools
  'suggestedRent', 'medianIncome', 'hudAreaName',
  'fmrOneBedroom', 'fmrTwoBedroom', 'fmrThreeBedroom',
  'schoolPrimaryName', 'schoolPrimaryRating',
] as const

async function main() {
  await loadEnvLocal()
  const args = parseArgs()
  console.log(`[VendorCompare] ${args.street}, ${args.city}, ${args.state} ${args.zip}`)
  console.log('')

  const vendorFns: Record<string, () => Promise<unknown>> = {
    batchdata: () => lookupBatchData(args.street, args.city, args.state, args.zip),
    propertyradar: () => lookupPropertyRadar(args.street, args.city, args.state, args.zip),
    reapi: () => lookupReapi(args.street, args.city, args.state, args.zip),
    rentcast: () => lookupRentCast(args.street, args.city, args.state, args.zip),
  }

  const chosen = Object.keys(vendorFns).filter(v => !args.only || args.only.has(v))
  const started = Date.now()

  const results = await Promise.all(
    chosen.map(async name => {
      const t0 = Date.now()
      try {
        const data = await vendorFns[name]()
        return { name, data, durationMs: Date.now() - t0, error: null as string | null }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        return { name, data: null, durationMs: Date.now() - t0, error: reason }
      }
    }),
  )

  console.log(`[VendorCompare] Done in ${Date.now() - started}ms`)
  console.log('')

  if (args.json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  // Errors first
  const errors = results.filter(r => r.error || r.data == null)
  if (errors.length > 0) {
    console.log('Errors / no-matches:')
    for (const e of errors) {
      console.log(`  ${e.name.padEnd(13)} ${e.error ? `error: ${e.error}` : 'no match'}`)
    }
    console.log('')
  }

  // Coverage matrix
  const header = ['field'.padEnd(28), ...chosen.map(n => n.padEnd(14))].join(' ')
  console.log(header)
  console.log('-'.repeat(header.length))

  let totalCoverage: Record<string, number> = {}
  for (const name of chosen) totalCoverage[name] = 0

  for (const field of COMPARISON_FIELDS) {
    const row: string[] = [String(field).padEnd(28)]
    for (const name of chosen) {
      const vendor = results.find(r => r.name === name)
      const raw = (vendor?.data as Record<string, unknown> | null)?.[field]
      const present = raw != null && raw !== '' && raw !== false
      const display = present
        ? (typeof raw === 'boolean' ? '✓' : truncate(String(raw), 12))
        : '—'
      row.push(display.padEnd(14))
      if (present) totalCoverage[name]++
    }
    console.log(row.join(' '))
  }

  console.log('')
  console.log('Coverage summary:')
  for (const name of chosen) {
    const vendor = results.find(r => r.name === name)!
    console.log(
      `  ${name.padEnd(13)} ${totalCoverage[name]}/${COMPARISON_FIELDS.length} fields populated ` +
        `(${vendor.durationMs}ms)`,
    )
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

main().catch(err => {
  console.error('[VendorCompare] Fatal:', err)
  process.exit(1)
})
