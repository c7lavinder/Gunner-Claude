#!/usr/bin/env -S npx tsx
// scripts/diagnose-missing-street-numbers.ts
//
// Find Property rows whose `address` doesn't start with a street number.
// Common shapes that hit this:
//
//   - "Van Buren St"           — only the street name (no number)
//   - "Franklin St"             — same
//   - "Lot 57 Harbor Point"     — lot-only address (legitimate, just no number)
//   - "Po Box 123"              — PO box used as a property address
//
// These rows can't be properly enriched (PropertyRadar / BatchData need a
// number) and won't show on a map. Most arose from owner-typed multi-
// property entries where one side of an "&" had no number — see Session
// 73's `1810 Wagon Wheel Dr & Van Buren St` example.
//
// Idempotent diagnostic — read-only.

import { db } from '../lib/db/client'

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } })
  for (const tenant of tenants) {
    const rows = await db.property.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, address: true, city: true, state: true, zip: true, ghlContactId: true, marketId: true, createdAt: true },
    })
    const offenders = rows.filter(r => {
      const addr = (r.address ?? '').trim()
      if (!addr) return false // empty handled by cleanup-empty-address-properties.ts
      return !/^\d/.test(addr) // doesn't start with a digit
    })
    if (offenders.length === 0) {
      console.log(`[${tenant.slug}] 0 properties with non-numeric address prefix`)
      continue
    }
    console.log(`\n[${tenant.slug}] ${offenders.length} properties without a leading street number:\n`)

    // Buckets
    const buckets: Record<string, number> = {
      'lot-only (Lot N <name>)': 0,
      'po box': 0,
      'street-name only': 0,
      'directional-prefix only (N/S/E/W <name>)': 0,
      'other': 0,
    }
    for (const r of offenders) {
      const addr = r.address.trim()
      if (/^lot\s+\d/i.test(addr)) buckets['lot-only (Lot N <name>)']++
      else if (/^po\s*box/i.test(addr)) buckets['po box']++
      else if (/^[NSEW]\b/i.test(addr) && !/\d/.test(addr.slice(0, 20))) buckets['directional-prefix only (N/S/E/W <name>)']++
      else if (/^[A-Z][a-z]+\s/.test(addr)) buckets['street-name only']++
      else buckets['other']++
    }
    console.log('Pattern counts:')
    for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(40)} ${v}`)

    console.log('\nFull dump:')
    for (const r of offenders) {
      console.log(
        `  ${r.id.slice(0, 10)}… | ${r.address.padEnd(45)} | ${(r.city ?? '').padEnd(20)} | ${(r.state ?? '').padEnd(3)} | ${(r.zip ?? '').padEnd(5)} | contact=${r.ghlContactId ? 'set' : 'NULL'} | mkt=${r.marketId ? 'set' : 'NULL'}`,
      )
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
