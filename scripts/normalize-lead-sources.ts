#!/usr/bin/env -S npx tsx
// scripts/normalize-lead-sources.ts
//
// One-shot DB cleanup: walk every Property + Seller, run leadSource
// through normalizeLeadSource, write back the canonical value (or null).
//
// Run:
//   npx tsx scripts/normalize-lead-sources.ts
//   npx tsx scripts/normalize-lead-sources.ts --dry-run

import { db } from '../lib/db/client'
import { normalizeLeadSource } from '../lib/lead-source-normalize'

const DRY = process.argv.includes('--dry-run')

async function main() {
  const startedAt = Date.now()
  console.log(`[normalize-sources] dryRun=${DRY}`)

  // --- Property -----------------------------------------------------------
  const propBefore = await db.property.groupBy({
    by: ['leadSource'],
    _count: { _all: true },
    orderBy: { _count: { leadSource: 'desc' } },
  })
  console.log('\nProperty.leadSource BEFORE:')
  for (const r of propBefore) console.log(`  ${(r.leadSource ?? 'NULL').padEnd(40)} ${r._count._all}`)

  // Build remap: distinct raw → canonical (skipping rows that already match)
  const propPlan = new Map<string, string | null>()
  for (const r of propBefore) {
    const raw = r.leadSource
    if (!raw) continue
    const norm = normalizeLeadSource(raw)
    if (norm !== raw) propPlan.set(raw, norm)
  }

  console.log('\nProperty remap plan:')
  for (const [raw, norm] of propPlan) console.log(`  "${raw}" → ${norm === null ? 'NULL' : `"${norm}"`}`)

  if (!DRY) {
    let updated = 0
    for (const [raw, norm] of propPlan) {
      const r = await db.property.updateMany({
        where: { leadSource: raw },
        data: { leadSource: norm },
      })
      updated += r.count
    }
    console.log(`Property: updated ${updated} rows`)
  }

  // --- Seller -------------------------------------------------------------
  const sellerBefore = await db.seller.groupBy({
    by: ['leadSource'],
    _count: { _all: true },
    orderBy: { _count: { leadSource: 'desc' } },
  })
  console.log('\nSeller.leadSource BEFORE:')
  for (const r of sellerBefore) console.log(`  ${(r.leadSource ?? 'NULL').padEnd(40)} ${r._count._all}`)

  const sellerPlan = new Map<string, string | null>()
  for (const r of sellerBefore) {
    const raw = r.leadSource
    if (!raw) continue
    const norm = normalizeLeadSource(raw)
    if (norm !== raw) sellerPlan.set(raw, norm)
  }

  console.log('\nSeller remap plan:')
  for (const [raw, norm] of sellerPlan) console.log(`  "${raw}" → ${norm === null ? 'NULL' : `"${norm}"`}`)

  if (!DRY) {
    let updated = 0
    for (const [raw, norm] of sellerPlan) {
      const r = await db.seller.updateMany({
        where: { leadSource: raw },
        data: { leadSource: norm },
      })
      updated += r.count
    }
    console.log(`Seller: updated ${updated} rows`)
  }

  // --- Final state --------------------------------------------------------
  if (!DRY) {
    const propAfter = await db.property.groupBy({
      by: ['leadSource'],
      _count: { _all: true },
      orderBy: { _count: { leadSource: 'desc' } },
    })
    console.log('\nProperty.leadSource AFTER:')
    for (const r of propAfter) console.log(`  ${(r.leadSource ?? 'NULL').padEnd(40)} ${r._count._all}`)
  }

  const sec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\n[normalize-sources] done in ${sec}s — ${DRY ? 'DRY RUN' : 'WRITES PERSISTED'}`)
}

main()
  .catch(err => { console.error('[normalize-sources] fatal:', err); process.exit(1) })
  .finally(() => db.$disconnect())
