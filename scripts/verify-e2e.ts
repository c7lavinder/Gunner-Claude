// scripts/verify-e2e.ts
//
// End-to-end verification: confirms the full pipeline works on a real
// production property.
//   1. Pick a real existing property with a real address
//   2. Run the orchestrator against it (skipping cache via direct enrichProperty)
//   3. Re-read the row and dump every NEW field value
//   4. Confirm data is present and typed correctly

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

const NEW_PROPERTY_FIELDS = [
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
] as const

const NEW_SELLER_FIELDS = [
  'mailingZipPlus4', 'mailingCounty', 'mailingValidity',
  'mailingDeliveryPoint', 'mailingDpvFootnotes', 'mailingDpvMatchCode',
] as const

function describe(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (Array.isArray(v)) return `[${v.length} rows]`
  if (typeof v === 'object') {
    // Prisma Decimal — has toFixed / toString
    const o = v as { toString?: () => string; toFixed?: () => string }
    if (typeof o.toFixed === 'function') return o.toString!()
    if (typeof o.toString === 'function' && o.toString !== Object.prototype.toString) {
      const s = o.toString()
      if (s !== '[object Object]') return s
    }
    return `{${Object.keys(v as object).length} keys}`
  }
  const s = String(v)
  return s.length > 50 ? s.slice(0, 47) + '...' : s
}

async function main() {
  await loadEnvLocal()
  const { db } = await import('../lib/db/client')
  const { enrichProperty } = await import('../lib/enrichment/enrich-property')

  // Pick a real property to test against — first one with a good address
  const target = await db.property.findFirst({
    where: {
      address: { not: '' },
      city: { not: '' },
      state: { not: '' },
      zip: { not: '' },
    },
    select: {
      id: true, tenantId: true, address: true, city: true, state: true, zip: true,
      zillowData: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!target) {
    console.error('[E2E] No property with complete address found.')
    process.exit(1)
  }

  console.log(`[E2E] Verifying on real property: ${target.address}, ${target.city}, ${target.state} ${target.zip}`)
  console.log(`[E2E] Property ID: ${target.id}`)
  console.log('')

  // Bust the 30-day BatchData cache so the orchestrator actually re-fetches
  const existingZillow = (target.zillowData ?? {}) as Record<string, unknown>
  const existingBatch = (existingZillow.batchData ?? {}) as Record<string, unknown>
  if (existingBatch.enrichedAt) {
    const copy = { ...existingZillow, batchData: { ...existingBatch, enrichedAt: null } }
    await db.property.update({ where: { id: target.id }, data: { zillowData: copy } })
    console.log('[E2E] Cleared BatchData cache to force fresh fetch')
  }

  console.log('[E2E] Running orchestrator...')
  const t0 = Date.now()
  const outcome = await enrichProperty(target.id, target.tenantId, { skipTrace: false })
  console.log(`[E2E] Done in ${Date.now() - t0}ms`)
  console.log(`[E2E] Vendors: BD=${outcome.batchdata.matched ? 'y' : 'n'} PR=${outcome.propertyRadar.matched ? 'y' : 'n'} G=${outcome.google.matched ? 'y' : 'n'} CL=${outcome.courtlistener.ran ? outcome.courtlistener.totalCases + ' cases' : 'skipped'}`)
  console.log(`[E2E] Columns written: ${outcome.columnsWritten}`)
  console.log('')

  // Re-read with all new fields
  const property = await db.property.findUnique({
    where: { id: target.id },
    select: NEW_PROPERTY_FIELDS.reduce<Record<string, true>>((acc, f) => { acc[f] = true; return acc }, {}),
  })

  if (!property) {
    console.error('[E2E] Failed to re-read property after enrichment')
    process.exit(1)
  }

  const propertyRow = property as Record<string, unknown>
  console.log('═══ NEW PROPERTY FIELDS (Property row) ═══')
  let filled = 0
  for (const f of NEW_PROPERTY_FIELDS) {
    const v = propertyRow[f]
    const populated = v != null && v !== ''
    if (populated) filled++
    console.log(`  ${f.padEnd(34)} ${describe(v)}`)
  }
  console.log(`\n  Populated: ${filled} / ${NEW_PROPERTY_FIELDS.length}`)

  // Linked sellers
  console.log('\n═══ NEW SELLER FIELDS (linked sellers) ═══')
  const links = await db.propertySeller.findMany({
    where: { propertyId: target.id },
    include: {
      seller: {
        select: NEW_SELLER_FIELDS.reduce<Record<string, true>>((acc, f) => { acc[f] = true; return acc }, { name: true, id: true }),
      },
    },
  })

  if (links.length === 0) {
    console.log('  (no linked sellers — nothing to sync)')
  } else {
    for (const link of links) {
      const s = link.seller as unknown as Record<string, unknown>
      console.log(`\n  Seller: ${String(s.name ?? 'unknown')} (${String(s.id ?? '?')})`)
      let sfilled = 0
      for (const f of NEW_SELLER_FIELDS) {
        const v = s[f]
        const populated = v != null && v !== ''
        if (populated) sfilled++
        console.log(`    ${f.padEnd(26)} ${describe(v)}`)
      }
      console.log(`    Populated: ${sfilled} / ${NEW_SELLER_FIELDS.length}`)
    }
  }

  // History JSON blob spot check
  console.log('\n═══ HISTORY JSON SAMPLES ═══')
  const deed = propertyRow.deedHistoryJson as Array<Record<string, unknown>> | null
  if (Array.isArray(deed) && deed.length > 0) {
    console.log(`  deedHistoryJson: ${deed.length} entries`)
    const sample = deed[0]
    console.log(`    First entry keys: ${Object.keys(sample).slice(0, 8).join(', ')}`)
    console.log(`    First salePrice: ${sample.salePrice}`)
    console.log(`    First recordingDate: ${sample.recordingDate}`)
  } else {
    console.log(`  deedHistoryJson: empty`)
  }

  const mortgages = propertyRow.mortgageHistoryJson as Array<Record<string, unknown>> | null
  if (Array.isArray(mortgages) && mortgages.length > 0) {
    console.log(`  mortgageHistoryJson: ${mortgages.length} entries`)
  } else {
    console.log(`  mortgageHistoryJson: empty`)
  }

  const liens = propertyRow.liensJson as Array<Record<string, unknown>> | null
  if (Array.isArray(liens) && liens.length > 0) {
    console.log(`  liensJson: ${liens.length} entries`)
    console.log(`    First lienType: ${liens[0].lienType}`)
  } else {
    console.log(`  liensJson: empty`)
  }

  console.log('\n═══ VERDICT ═══')
  if (filled > 10) {
    console.log(`  ✓ End-to-end working. Captured ${filled} new Property fields on a real tenant property.`)
  } else {
    console.log(`  ⚠ Only ${filled} new Property fields populated — investigate whether vendors returned data for this address.`)
  }

  await db.$disconnect()
}

main().catch(err => {
  console.error('[E2E] Fatal:', err)
  process.exit(1)
})
