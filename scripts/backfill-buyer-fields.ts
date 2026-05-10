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
// GHL rate limit (~10 req/s steady-state per location). Sequential
// processing with a 250ms gap puts us at ~4 req/s, well under the
// ceiling. Each buyer also makes 0 calls when no gap fill is needed.
const GHL_THROTTLE_MS = (() => {
  const i = args.indexOf('--throttle-ms')
  return i >= 0 ? parseInt(args[i + 1], 10) : 250
})()

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

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

    // All active buyers — including ones without a GHL contact id, since
    // the secondary→primary market fold runs locally and doesn't need GHL.
    const buyers = await db.buyer.findMany({
      where: { tenantId: tenant.id, isActive: true },
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

      // Step 1 — local secondary→primary market fold. Runs on every
      // buyer regardless of GHL availability. Each entry in
      // customFields.secondaryMarkets becomes an entry in
      // primaryMarkets (case-insensitive dedupe). Then secondaryMarkets
      // is dropped from customFields.
      const merged: Record<string, unknown> = { ...criteria }
      const data: Record<string, unknown> = {}
      const secondary = Array.isArray(merged.secondaryMarkets)
        ? (merged.secondaryMarkets as unknown[]).map(String).filter(Boolean)
        : []
      const folded: string[] = []
      if (secondary.length > 0) {
        const primary = (Array.isArray(buyer.primaryMarkets) ? buyer.primaryMarkets as unknown[] : []).map(String)
        const seen = new Set(primary.map(m => m.toLowerCase()))
        for (const s of secondary) {
          const key = s.toLowerCase()
          if (!seen.has(key)) {
            folded.push(s)
            seen.add(key)
          }
        }
        if (folded.length > 0) {
          data.primaryMarkets = [...primary, ...folded]
        }
        delete (merged as Record<string, unknown>).secondaryMarkets
      }

      // Step 2 — GHL pull, but only when we still have gaps to fill.
      // A buyer with no GHL contact id can't pull but the secondary
      // fold above may still apply, so we don't `continue` here.
      const needsGhlPull = !!buyer.ghlContactId && (gaps.length > 0 || !hasMarkets || !hasNotes)
      let parsedFromGhl: ReturnType<typeof parseGHLContact> | null = null
      if (needsGhlPull) {
        // Throttle BEFORE the call so the very first request starts
        // immediately, but every subsequent buyer waits the configured
        // gap. Prevents the 429 storm we hit on the first run.
        if (GHL_THROTTLE_MS > 0) await sleep(GHL_THROTTLE_MS)
        try {
          const contact = await ghl.getContact(buyer.ghlContactId!)
          if (contact) {
            parsedFromGhl = parseGHLContact({
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
          }
        } catch (err) {
          errors++
          const msg = err instanceof Error ? err.message : String(err)
          if (errors <= 5) process.stderr.write(`[backfill-buyer-fields]   buyer=${buyer.id} ghl fetch failed: ${msg}\n`)
          // On a 429, back off harder so the burst clears before the
          // next request. Other errors fall through to the local fold.
          if (msg.includes('429')) await sleep(2000)
        }
      }

      if (parsedFromGhl) {
        // Fill ONLY the gaps — never overwrite a value the rep already
        // edited in Gunner. This is the whole point of the wave.
        for (const k of gaps) {
          const fromGhl = (parsedFromGhl.criteria as Record<string, unknown>)[k]
          if (fromGhl !== undefined && fromGhl !== '' && fromGhl !== null) {
            merged[k] = fromGhl
          }
        }
        // GHL secondaryMarkets land here too — fold them into primary.
        const ghlSecondary = (parsedFromGhl.criteria as { secondaryMarkets?: string[] }).secondaryMarkets ?? []
        if (ghlSecondary.length > 0) {
          const base = ((data.primaryMarkets as string[] | undefined)
            ?? (Array.isArray(buyer.primaryMarkets) ? buyer.primaryMarkets as unknown[] : []).map(String))
          const seen = new Set(base.map(m => m.toLowerCase()))
          const additions: string[] = []
          for (const s of ghlSecondary) {
            const key = s.toLowerCase()
            if (!seen.has(key)) {
              additions.push(s)
              seen.add(key)
            }
          }
          if (additions.length > 0) {
            data.primaryMarkets = [...base, ...additions]
          }
        }
        delete (merged as Record<string, unknown>).secondaryMarkets
      }

      const customChanged = JSON.stringify(merged) !== JSON.stringify(criteria)
      if (customChanged) data.customFields = JSON.parse(JSON.stringify(merged))
      if (data.primaryMarkets === undefined && !hasMarkets && parsedFromGhl && parsedFromGhl.markets.length > 0) {
        data.primaryMarkets = parsedFromGhl.markets
      }
      if (!hasNotes && parsedFromGhl?.notes) data.internalNotes = parsedFromGhl.notes

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
