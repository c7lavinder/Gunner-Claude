#!/usr/bin/env -S npx tsx
// scripts/refill-missing-sources.ts
//
// Walks Property + Seller rows where leadSource IS NULL and ghlContactId
// is set, fetches the GHL contact, runs contact.source through the
// canonical normalizer, and writes back. Used to pick up:
//
//   - Pre-Phase-1 properties that never went through the Phase 3
//     enrichment cron (their pendingEnrichment was never set true,
//     so enrich-pending.ts ignores them)
//   - Properties whose GHL contact source was filled in after Phase 3
//     already ran for them
//
// Skips rows whose contact still has no source — those land in the
// "Missing Source" data-quality bucket for manual triage.
//
// Run:
//   npx tsx scripts/refill-missing-sources.ts
//   npx tsx scripts/refill-missing-sources.ts --concurrency 15
//   npx tsx scripts/refill-missing-sources.ts --dry-run

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { normalizeLeadSource } from '../lib/lead-source-normalize'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const CONCURRENCY = (() => {
  const i = args.indexOf('--concurrency')
  return i >= 0 ? Math.max(1, parseInt(args[i + 1] ?? '15', 10)) : 15
})()

async function main() {
  const startedAt = Date.now()
  console.log(`[refill-sources] dryRun=${DRY} concurrency=${CONCURRENCY}`)

  const tenants = await db.tenant.findMany({
    where: { ghlAccessToken: { not: null } },
    select: { id: true, slug: true },
  })

  const totals = { fetched: 0, propertyUpdated: 0, sellerUpdated: 0, contactNoSource: 0, contactMissing: 0, errors: 0 }

  for (const tenant of tenants) {
    const candidates = await db.property.findMany({
      where: { tenantId: tenant.id, leadSource: null, ghlContactId: { not: null } },
      select: { id: true, ghlContactId: true },
    })
    if (candidates.length === 0) continue
    process.stderr.write(`[refill-sources] tenant=${tenant.slug} candidates=${candidates.length}\n`)
    const ghl = await getGHLClient(tenant.id)

    const processOne = async (row: typeof candidates[number]) => {
      try {
        const contact = await ghl.getContact(row.ghlContactId!)
        totals.fetched++
        if (!contact) { totals.contactMissing++; return }

        const normalized = normalizeLeadSource(contact.source)
        if (!normalized) { totals.contactNoSource++; return }

        if (!DRY) {
          await db.property.update({
            where: { id: row.id, tenantId: tenant.id },
            data: { leadSource: normalized },
          })
          totals.propertyUpdated++

          // Same source on the linked Seller (matched via ghlContactId)
          const seller = await db.seller.findFirst({
            where: { tenantId: tenant.id, ghlContactId: row.ghlContactId!, leadSource: null },
            select: { id: true },
          })
          if (seller) {
            await db.seller.update({
              where: { id: seller.id, tenantId: tenant.id },
              data: { leadSource: normalized },
            })
            totals.sellerUpdated++
          }
        } else {
          totals.propertyUpdated++
        }
      } catch (err) {
        totals.errors++
        const msg = err instanceof Error ? err.message : String(err)
        if (totals.errors <= 5) console.error(`  [err] ${row.id}: ${msg}`)
      }
    }

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const chunk = candidates.slice(i, i + CONCURRENCY)
      await Promise.all(chunk.map(processOne))
      if ((i + chunk.length) % 200 === 0 || i + chunk.length >= candidates.length) {
        process.stderr.write(
          `  progress ${Math.min(i + chunk.length, candidates.length)}/${candidates.length} ` +
          `propUpdated=${totals.propertyUpdated} noSource=${totals.contactNoSource} errors=${totals.errors}\n`
        )
      }
    }
  }

  const sec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `\n[refill-sources] done in ${sec}s — ` +
    `fetched=${totals.fetched} propertyUpdated=${totals.propertyUpdated} ` +
    `sellerUpdated=${totals.sellerUpdated} noSource=${totals.contactNoSource} ` +
    `contactMissing=${totals.contactMissing} errors=${totals.errors}`
  )
  console.log(`[refill-sources] ${DRY ? 'DRY RUN' : 'WRITES PERSISTED'}`)
}

main()
  .catch(err => { console.error('[refill-sources] fatal:', err); process.exit(1) })
  .finally(() => db.$disconnect())
