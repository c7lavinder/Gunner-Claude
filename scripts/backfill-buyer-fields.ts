#!/usr/bin/env -S npx tsx
// scripts/backfill-buyer-fields.ts
//
// One-shot backfill: pull GHL custom fields into Buyer.customFields for
// rows that are missing the canonical buyer-info keys. Use this once
// after deploying the Session 78 buyer-architecture wave so any rows
// that were created before the canonical fields existed catch up.
//
// After this runs cleanly, sync.ts will keep Gunner authoritative —
// subsequent GHL pulls only refresh contact info (name/phone/email),
// never the buyer-info keys below.
//
// Canonical keys filled here (when missing):
//   tier, verifiedFunding, hasPurchased, responseSpeed, buybox,
//   secondaryMarkets, lastContactDate
// Plus primaryMarkets and internalNotes (Buyer-table columns).
//
// Run:
//   npx tsx scripts/backfill-buyer-fields.ts                  (all tenants, real writes)
//   npx tsx scripts/backfill-buyer-fields.ts --dry-run        (no writes)
//   npx tsx scripts/backfill-buyer-fields.ts --tenant <slug>  (single tenant)

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { parseGHLContact } from '../lib/buyers/sync'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const TENANT_ARG = (() => { const i = args.indexOf('--tenant'); return i >= 0 ? args[i + 1] : undefined })()

const CANONICAL_KEYS = [
  'tier', 'verifiedFunding', 'hasPurchased', 'responseSpeed',
  'buybox', 'secondaryMarkets', 'lastContactDate',
] as const

function missingKeys(criteria: Record<string, unknown>): string[] {
  return CANONICAL_KEYS.filter(k => criteria[k] === undefined || criteria[k] === null || criteria[k] === '')
}

async function main() {
  const startedAt = Date.now()
  const tenants = await db.tenant.findMany({
    where: TENANT_ARG ? { slug: TENANT_ARG } : {},
    select: { id: true, slug: true, ghlAccessToken: true },
  })

  let totalUpdated = 0
  let totalSkipped = 0
  let totalSkippedNoGhl = 0
  let totalErrors = 0

  for (const tenant of tenants) {
    if (!tenant.ghlAccessToken) {
      process.stderr.write(`[backfill-buyer-fields] tenant=${tenant.slug} no GHL token, skipping\n`)
      continue
    }

    const buyers = await db.buyer.findMany({
      where: { tenantId: tenant.id, isActive: true, NOT: { ghlContactId: null } },
      select: { id: true, ghlContactId: true, customFields: true, primaryMarkets: true, internalNotes: true },
    })
    if (buyers.length === 0) continue
    process.stderr.write(`[backfill-buyer-fields] tenant=${tenant.slug} candidates=${buyers.length}\n`)

    let ghl: Awaited<ReturnType<typeof getGHLClient>>
    try {
      ghl = await getGHLClient(tenant.id)
    } catch (err) {
      process.stderr.write(`[backfill-buyer-fields] tenant=${tenant.slug} ghl client failed: ${err instanceof Error ? err.message : String(err)}\n`)
      continue
    }

    let updated = 0
    let skipped = 0
    let skippedNoGhl = 0
    let errors = 0

    for (const buyer of buyers) {
      const criteria = (buyer.customFields ?? {}) as Record<string, unknown>
      const gaps = missingKeys(criteria)
      const markets = Array.isArray(buyer.primaryMarkets) ? buyer.primaryMarkets as unknown[] : []
      const hasMarkets = markets.length > 0
      const hasNotes = !!buyer.internalNotes && buyer.internalNotes.trim().length > 0

      // Already complete — skip without a GHL roundtrip.
      if (gaps.length === 0 && hasMarkets && hasNotes) {
        skipped++
        continue
      }

      let contact
      try {
        contact = await ghl.getContact(buyer.ghlContactId!)
      } catch (err) {
        errors++
        if (errors <= 5) process.stderr.write(`[backfill-buyer-fields]   buyer=${buyer.id} ghl fetch failed: ${err instanceof Error ? err.message : String(err)}\n`)
        continue
      }
      if (!contact) {
        skippedNoGhl++
        continue
      }

      const parsed = parseGHLContact({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        city: contact.city,
        state: contact.state,
        tags: contact.tags ?? [],
        customFields: contact.customFields ?? [],
      })

      // Fill ONLY the gaps — never overwrite a value the rep already
      // edited in Gunner. This is the whole point of the wave.
      const merged = { ...criteria }
      for (const k of gaps) {
        const fromGhl = (parsed.criteria as Record<string, unknown>)[k]
        if (fromGhl !== undefined && fromGhl !== '' && fromGhl !== null) {
          merged[k] = fromGhl
        }
      }

      const data: Record<string, unknown> = {}
      const customChanged = JSON.stringify(merged) !== JSON.stringify(criteria)
      if (customChanged) data.customFields = JSON.parse(JSON.stringify(merged))
      if (!hasMarkets && parsed.markets.length > 0) data.primaryMarkets = parsed.markets
      if (!hasNotes && parsed.notes) data.internalNotes = parsed.notes

      if (Object.keys(data).length === 0) {
        skipped++
        continue
      }

      if (!DRY) {
        try {
          await db.buyer.update({
            where: { id: buyer.id, tenantId: tenant.id },
            data,
          })
        } catch (err) {
          errors++
          if (errors <= 5) process.stderr.write(`[backfill-buyer-fields]   buyer=${buyer.id} update failed: ${err instanceof Error ? err.message : String(err)}\n`)
          continue
        }
      }
      updated++
      if (updated <= 5) {
        const filledKeys = Object.keys(data).join(',')
        process.stderr.write(`[backfill-buyer-fields]   ${DRY ? 'DRY ' : ''}buyer=${buyer.id} filled=${filledKeys}\n`)
      }
    }

    process.stderr.write(`[backfill-buyer-fields] tenant=${tenant.slug} updated=${updated} skipped=${skipped} skipped_no_ghl=${skippedNoGhl} errors=${errors}\n`)
    totalUpdated += updated
    totalSkipped += skipped
    totalSkippedNoGhl += skippedNoGhl
    totalErrors += errors
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  process.stderr.write(`\n[backfill-buyer-fields] DONE in ${elapsed}s — updated=${totalUpdated} skipped=${totalSkipped} skipped_no_ghl=${totalSkippedNoGhl} errors=${totalErrors}${DRY ? ' (dry-run)' : ''}\n`)
}

main().catch(err => {
  process.stderr.write(`[backfill-buyer-fields] FATAL: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
