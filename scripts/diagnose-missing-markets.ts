#!/usr/bin/env -S npx tsx
// scripts/diagnose-missing-markets.ts
// One-shot diagnostic: dump every Property where marketId IS NULL so we can
// see WHY the market resolver couldn't find one. Throwaway companion to
// scripts/cleanup-missing-markets.ts (next).

import { db } from '../lib/db/client'

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } })

  for (const tenant of tenants) {
    const rows = await db.property.findMany({
      where: { tenantId: tenant.id, marketId: null },
      select: {
        id: true,
        ghlContactId: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        pendingEnrichment: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    if (rows.length === 0) continue

    console.log(`\n=== ${tenant.slug}: ${rows.length} properties with marketId=null ===\n`)

    // Pattern buckets
    const buckets = {
      'has all 4 fields': 0,
      'zip empty, address has 5-digit run': 0,
      'zip empty, no zip anywhere': 0,
      'zip set but no market match': 0,
      'address empty': 0,
    }

    for (const r of rows) {
      const addrHasZip = /\b\d{5}\b/.test(r.address)
      if (!r.address) buckets['address empty']++
      else if (r.zip && r.zip.length === 5) buckets['zip set but no market match']++
      else if (!r.zip && addrHasZip) buckets['zip empty, address has 5-digit run']++
      else if (!r.zip) buckets['zip empty, no zip anywhere']++
      else buckets['has all 4 fields']++
    }

    console.log('Pattern counts:')
    for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(40)} ${v}`)

    console.log('\nFull dump (id | address | city | state | zip | pending):')
    for (const r of rows) {
      console.log(
        `  ${r.id.slice(0, 10)}… | ${(r.address || '<empty>').padEnd(50)} | ${(r.city || '<empty>').padEnd(20)} | ${(r.state || '').padEnd(4)} | ${(r.zip || '').padEnd(7)} | pending=${r.pendingEnrichment}`
      )
    }
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
