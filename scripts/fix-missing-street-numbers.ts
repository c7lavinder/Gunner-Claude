#!/usr/bin/env -S npx tsx
// scripts/fix-missing-street-numbers.ts
//
// 54 Property rows have an address without a leading street number
// ("Hawkwood Ln", "Van Buren St", "Lot 57 Harbor Point", etc.). Causes:
//
//   1. Owner typed a multi-property combined address with a number on
//      one side and just a street name on the other ("1810 Wagon Wheel
//      Dr & Van Buren St"). After the splitter ran, the second row has
//      no number — the source data didn't have one to give it.
//   2. Owner typed a single property in GHL with no number at all.
//   3. Legitimate lot-only addresses ("Lot 57 Harbor Point").
//
// Only safe-to-apply pattern: GHL's contact has a SINGLE clean numbered
// address whose tail matches Gunner's value. Anything else (multi-
// property strings, GHL also missing the number, split-derived rows
// where the parsed primary belongs to a sibling) gets reported but not
// touched.
//
// Default DRY-RUN. Pass --apply to persist the safe pattern.

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { parsePropertyAddress } from '../lib/address-parse'

const APPLY = process.argv.slice(2).includes('--apply')
const TENANT_SLUG = (() => {
  const i = process.argv.indexOf('--tenant')
  return i >= 0 ? process.argv[i + 1] : undefined
})()

async function main() {
  console.log(`[fix-missing-street-num] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} tenant=${TENANT_SLUG ?? 'all'}`)

  const tenants = await db.tenant.findMany({
    where: TENANT_SLUG ? { slug: TENANT_SLUG } : {},
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    const rows = await db.property.findMany({
      where: {
        tenantId: tenant.id,
        ghlContactId: { not: null },
      },
      select: { id: true, address: true, city: true, state: true, zip: true, ghlContactId: true, marketId: true },
    })

    const offenders = rows.filter(r => {
      const addr = (r.address ?? '').trim()
      if (!addr) return false
      if (/^lot\s+\d/i.test(addr)) return false // legitimate lot-only
      return !/^\d/.test(addr)
    })
    console.log(`\n[${tenant.slug}] ${offenders.length} candidate row(s) (excluding lot-only)`)
    if (offenders.length === 0) continue

    const ghl = await getGHLClient(tenant.id)
    let fixed = 0
    let unchanged = 0
    let ghlSameAsGunner = 0
    let ghlAlsoMissing = 0
    let ghlFetchFailed = 0

    for (const r of offenders) {
      let contact: Awaited<ReturnType<typeof ghl.getContact>>
      try {
        contact = await ghl.getContact(r.ghlContactId!)
      } catch (err) {
        ghlFetchFailed++
        console.log(`  ✗ ${r.id.slice(0, 10)}… "${r.address}" — GHL fetch failed: ${err instanceof Error ? err.message : err}`)
        continue
      }
      if (!contact) {
        ghlFetchFailed++
        continue
      }

      // Re-run the parser on GHL's authoritative fields
      const parsed = parsePropertyAddress(
        contact.address1 ?? '',
        contact.city ?? '',
        contact.state ?? '',
        contact.postalCode ?? '',
      )
      const ghlStreet = parsed.primary.street.trim()

      if (!ghlStreet) {
        ghlAlsoMissing++
        console.log(`  - ${r.id.slice(0, 10)}… "${r.address}" — GHL also has no street`)
        continue
      }
      if (ghlStreet.toLowerCase() === r.address.trim().toLowerCase()) {
        ghlSameAsGunner++
        continue
      }
      if (!/^\d/.test(ghlStreet)) {
        ghlAlsoMissing++
        console.log(`  - ${r.id.slice(0, 10)}… "${r.address}" — GHL also missing leading number ("${contact.address1}")`)
        continue
      }

      // Safety gate: only apply when this is a single-property GHL address
      // (no splits) AND Gunner's existing value is the tail of GHL's parsed
      // street. Otherwise we'd corrupt split children by overwriting them
      // with a sibling row's address.
      const isSingleProperty = parsed.splits.length === 0
      const gunnerTail = r.address.trim().toLowerCase()
      const ghlLower = ghlStreet.toLowerCase()
      const ghlIsPrefixedTail = ghlLower.endsWith(' ' + gunnerTail) || ghlLower === gunnerTail
      const safeToApply = isSingleProperty && ghlIsPrefixedTail

      if (!safeToApply) {
        console.log(
          `  ⚠ ${r.id.slice(0, 10)}… "${r.address}" — UNSAFE auto-fix ` +
          `(splits=${parsed.splits.length}, ghlStreet="${ghlStreet}", reason="${isSingleProperty ? 'tail mismatch' : 'multi-property string'}"). Manual review needed.`,
        )
        continue
      }

      console.log(
        `${APPLY ? '✓' : '·'} ${r.id.slice(0, 10)}… "${r.address}" → "${ghlStreet}" ` +
        `(GHL address1=${JSON.stringify(contact.address1)})`,
      )

      if (APPLY) {
        await db.property.update({
          where: { id: r.id, tenantId: tenant.id },
          data: {
            address: ghlStreet,
            // Only fill city/state/zip if Gunner is empty AND parsed has a value.
            // We don't want to overwrite a known-good city with a worse one.
            ...((!r.city || r.city === '') && parsed.primary.city ? { city: parsed.primary.city } : {}),
            ...((!r.state || r.state === '') && parsed.primary.state ? { state: parsed.primary.state } : {}),
            ...((!r.zip || r.zip === '') && parsed.primary.zip ? { zip: parsed.primary.zip } : {}),
          },
        })
        await db.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: 'cleanup.street_number_filled',
            resource: 'property',
            resourceId: r.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              before: { address: r.address, city: r.city, state: r.state, zip: r.zip },
              after: { address: ghlStreet, city: parsed.primary.city, state: parsed.primary.state, zip: parsed.primary.zip },
              ghlAddress1: contact.address1 ?? null,
            },
          },
        }).catch(err => console.error('  audit failed:', err instanceof Error ? err.message : err))
        fixed++
      } else {
        fixed++
      }
    }

    console.log(`\n[${tenant.slug}] ${APPLY ? 'fixed' : 'would fix'}=${fixed}  unchanged=${unchanged}  ghl_same=${ghlSameAsGunner}  ghl_also_missing=${ghlAlsoMissing}  ghl_fetch_failed=${ghlFetchFailed}`)
  }

  if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
