#!/usr/bin/env -S npx tsx
// scripts/strip-other-market.ts
//
// Drops literal "Other" entries from Buyer.primaryMarkets across the
// tenant. Comparison is case-insensitive and trims whitespace.
// "Other" was a GHL dropdown filler; it's not a real market and
// matchBuyers already filters it out at read time, but it still shows
// up in the chip UI on buyer pages until we clean the data.
//
// Run:
//   npx tsx scripts/strip-other-market.ts --dry-run
//   npx tsx scripts/strip-other-market.ts --tenant new-again-houses

import { db } from '../lib/db/client'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const TENANT_ARG = (() => { const i = args.indexOf('--tenant'); return i >= 0 ? args[i + 1] : undefined })()

function isOther(m: unknown): boolean {
  return typeof m === 'string' && m.trim().toLowerCase() === 'other'
}

async function main() {
  const startedAt = Date.now()
  const tenants = await db.tenant.findMany({
    where: TENANT_ARG ? { slug: TENANT_ARG } : {},
    select: { id: true, slug: true },
  })

  let totalUpdated = 0
  for (const tenant of tenants) {
    const buyers = await db.buyer.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, primaryMarkets: true },
    })

    let updated = 0
    for (const buyer of buyers) {
      const markets = Array.isArray(buyer.primaryMarkets) ? buyer.primaryMarkets as unknown[] : []
      if (!markets.some(isOther)) continue
      const cleaned = markets.filter(m => !isOther(m)) as string[]

      if (!DRY) {
        try {
          await db.buyer.update({
            where: { id: buyer.id, tenantId: tenant.id },
            data: { primaryMarkets: cleaned },
          })
        } catch (err) {
          process.stderr.write(`[strip-other-market]   buyer=${buyer.id} update failed: ${err instanceof Error ? err.message : String(err)}\n`)
          continue
        }
      }
      updated++
      if (updated <= 5) {
        process.stderr.write(`[strip-other-market]   ${DRY ? 'DRY ' : ''}buyer=${buyer.id} markets=[${markets.join(', ')}] -> [${cleaned.join(', ')}]\n`)
      }
    }
    process.stderr.write(`[strip-other-market] tenant=${tenant.slug} candidates=${buyers.length} updated=${updated}\n`)
    totalUpdated += updated
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  process.stderr.write(`\n[strip-other-market] DONE in ${elapsed}s — updated=${totalUpdated}${DRY ? ' (dry-run)' : ''}\n`)
}

main().catch(err => {
  process.stderr.write(`[strip-other-market] FATAL: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
