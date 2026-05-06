#!/usr/bin/env -S npx tsx
// scripts/backfill-markets.ts
//
// One-shot backfill: Property rows with marketId=null + zip set get
// resolveMarketForZip(zip) → set marketId.
//
// Run:
//   npx tsx scripts/backfill-markets.ts
//   npx tsx scripts/backfill-markets.ts --dry-run
//   npx tsx scripts/backfill-markets.ts --tenant new-again-houses

import { db } from '../lib/db/client'
import { MARKETS } from '../lib/config/crm.config'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const TENANT_ARG = (() => { const i = args.indexOf('--tenant'); return i >= 0 ? args[i + 1] : undefined })()

async function main() {
  const startedAt = Date.now()
  const tenants = await db.tenant.findMany({
    where: TENANT_ARG ? { slug: TENANT_ARG } : {},
    select: { id: true, slug: true },
  })

  let totalUpdated = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const tenant of tenants) {
    // Group properties by zip so we resolve each unique zip once and reuse.
    const rows = await db.property.findMany({
      where: { tenantId: tenant.id, marketId: null, NOT: { zip: '' } },
      select: { id: true, zip: true },
    })
    if (rows.length === 0) continue
    process.stderr.write(`[backfill-markets] tenant=${tenant.slug} candidates=${rows.length}\n`)

    // Pull every existing market for this tenant once (avoids per-zip
    // findFirst against the DB; 1420 unique zips × 1 DB roundtrip each
    // = many minutes, vs one query + in-memory lookup = milliseconds).
    const existingMarkets = await db.market.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, zipCodes: true },
    })
    const zipToMarketId = new Map<string, string>()
    for (const m of existingMarkets) {
      const zips = Array.isArray(m.zipCodes) ? (m.zipCodes as string[]) : []
      for (const z of zips) if (!zipToMarketId.has(z)) zipToMarketId.set(z, m.id)
    }

    // For zips that no existing market covers, fall back to the static
    // config map (lib/config/crm.config MARKETS) and create the market
    // on first hit so the in-memory map picks it up.
    const uniqueZips = [...new Set(rows.map(r => r.zip).filter(Boolean))]
    let configHits = 0, globalHits = 0, unmapped = 0
    for (const zip of uniqueZips) {
      if (zipToMarketId.has(zip)) continue
      // Look up zip in the static MARKETS config
      let mappedName: string | null = null
      for (const [name, def] of Object.entries(MARKETS)) {
        if ((def.zips as readonly string[]).includes(zip)) { mappedName = name; break }
      }
      if (mappedName) {
        // Find or create a tenant Market row by name
        const existing = existingMarkets.find(m => m.name === mappedName)
        if (existing) {
          zipToMarketId.set(zip, existing.id)
          configHits++
        } else if (!DRY) {
          try {
            const created = await db.market.create({
              data: { tenantId: tenant.id, name: mappedName, zipCodes: [...(MARKETS as Record<string, { zips: readonly string[] }>)[mappedName].zips] },
            })
            existingMarkets.push({ id: created.id, name: created.name, zipCodes: created.zipCodes })
            zipToMarketId.set(zip, created.id)
            configHits++
          } catch (err) {
            process.stderr.write(`  [zip ${zip}] market create failed: ${err instanceof Error ? err.message : err}\n`)
            totalErrors++
          }
        } else {
          configHits++
        }
      } else {
        // Tier 3 — Global. Find or create once.
        let global = existingMarkets.find(m => m.name === 'Global')
        if (!global && !DRY) {
          try {
            const created = await db.market.create({
              data: { tenantId: tenant.id, name: 'Global', zipCodes: [] },
            })
            global = { id: created.id, name: created.name, zipCodes: created.zipCodes }
            existingMarkets.push(global)
          } catch {
            const found = await db.market.findFirst({ where: { tenantId: tenant.id, name: 'Global' }, select: { id: true, name: true, zipCodes: true } })
            if (found) { global = found; existingMarkets.push(found) }
          }
        }
        if (global) { zipToMarketId.set(zip, global.id); globalHits++ }
        else unmapped++
      }
    }
    process.stderr.write(`  resolved ${uniqueZips.length} unique zips: existing=${uniqueZips.length - configHits - globalHits - unmapped} configHits=${configHits} globalHits=${globalHits} unmapped=${unmapped}\n`)

    // Bulk-update by (tenantId, zip) to avoid N round-trips.
    if (DRY) {
      let dryCounted = 0
      for (const r of rows) if (zipToMarketId.get(r.zip)) dryCounted++
      process.stderr.write(`  [dry] would update ${dryCounted} of ${rows.length}\n`)
      totalUpdated += dryCounted
      totalSkipped += rows.length - dryCounted
      continue
    }

    let bulkUpdates = 0
    for (const [zip, marketId] of zipToMarketId) {
      if (!marketId) continue
      const r = await db.property.updateMany({
        where: { tenantId: tenant.id, marketId: null, zip },
        data: { marketId },
      })
      bulkUpdates += r.count
      if (bulkUpdates % 500 < r.count && bulkUpdates > 0) {
        process.stderr.write(`    updated ${bulkUpdates} so far\n`)
      }
    }
    totalUpdated += bulkUpdates
    const stillNull = await db.property.count({
      where: { tenantId: tenant.id, marketId: null, NOT: { zip: '' } },
    })
    totalSkipped += stillNull
    process.stderr.write(`  tenant total updated=${bulkUpdates} stillNull=${stillNull}\n`)
  }

  const sec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\n[backfill-markets] done in ${sec}s — updated=${totalUpdated} skipped=${totalSkipped} errors=${totalErrors}`)
  console.log(`[backfill-markets] ${DRY ? 'DRY RUN' : 'WRITES PERSISTED'}`)
}

main()
  .catch(err => { console.error('[backfill-markets] fatal:', err); process.exit(1) })
  .finally(() => db.$disconnect())
