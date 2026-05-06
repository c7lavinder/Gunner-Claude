#!/usr/bin/env -S npx tsx
// scripts/enrich-pending.ts
//
// Phase 3 of GHL multi-pipeline redesign — catch-up enrichment cron.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §8.
//
// What this does:
//   For every Property where pendingEnrichment=true and ghlContactId is
//   set (the stub rows produced by Phase 2 backfill), pull the real
//   contact from GHL and fill in:
//     - Property.{address, city, state, zip}
//     - Seller.{firstName, lastName, name, phone, email,
//       mailingAddress, mailingCity, mailingState, mailingZip}
//   Then trigger enrichProperty() (multi-vendor: BatchData + PR +
//   Google + CourtListener) and mark pendingEnrichment=false.
//
//   PropertyRadar is subscription-priced (no per-call cost).
//   BatchData has its own daily budget gate ($15) inside enrichProperty.
//   No additional rate limiting needed here.
//
// Run:
//   railway run --service Gunner-Claude bash -c \
//     'npx tsx scripts/enrich-pending.ts'
//
//   Locally:
//     npx tsx scripts/enrich-pending.ts
//
// Cron: every 5 minutes via railway.toml. ~100 rows per run.
//   8000 rows / 100 per run / 12 runs/hour = ~6.7 hours to drain a
//   full Phase 2 backfill from 0 to 100% enriched.

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { enrichProperty } from '../lib/enrichment/enrich-property'

const BATCH_SIZE = parseInt(process.env.ENRICH_PENDING_BATCH_SIZE ?? '100', 10)

interface RunStats {
  contactsFetched: number
  propertiesUpdated: number
  sellersUpdated: number
  enrichmentRan: number
  contactsMissing: number
  noAddress: number
  errors: number
}

async function main() {
  const startedAt = Date.now()
  const tenantSlug = process.argv[2]
  console.log(`[enrich-pending] starting batch=${BATCH_SIZE} tenant=${tenantSlug ?? 'all'}`)

  const tenants = await db.tenant.findMany({
    where: {
      ghlAccessToken: { not: null },
      ...(tenantSlug ? { slug: tenantSlug } : {}),
    },
    select: { id: true, slug: true, name: true },
  })

  const totals: RunStats = { contactsFetched: 0, propertiesUpdated: 0, sellersUpdated: 0, enrichmentRan: 0, contactsMissing: 0, noAddress: 0, errors: 0 }

  for (const tenant of tenants) {
    const pending = await db.property.findMany({
      where: { tenantId: tenant.id, pendingEnrichment: true, ghlContactId: { not: null } },
      select: { id: true, ghlContactId: true, address: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    })

    if (pending.length === 0) {
      console.log(`[enrich-pending] tenant=${tenant.slug} — no pending rows`)
      continue
    }

    console.log(`[enrich-pending] tenant=${tenant.slug} — ${pending.length} pending`)
    const ghl = await getGHLClient(tenant.id)

    for (const row of pending) {
      try {
        const contact = await ghl.getContact(row.ghlContactId!)
        totals.contactsFetched++

        if (!contact) {
          // Contact deleted in GHL. Mark resolved so we stop trying.
          await db.property.update({
            where: { id: row.id, tenantId: tenant.id },
            data: { pendingEnrichment: false },
          })
          totals.contactsMissing++
          continue
        }

        const { standardizeStreet, standardizeCity, standardizeState, standardizeZip } = await import('../lib/address')
        const address = standardizeStreet(contact.address1 ?? '')
        const city = standardizeCity(contact.city ?? '')
        const state = standardizeState(contact.state ?? '')
        const zip = standardizeZip(contact.postalCode ?? '')

        // Update Property — only set address fields if GHL has them; otherwise
        // leave the empty placeholders and clear the flag so we don't loop
        // forever on a contact with no address.
        const propertyUpdate: Record<string, unknown> = { pendingEnrichment: false }
        if (address) propertyUpdate.address = address
        if (city) propertyUpdate.city = city
        if (state) propertyUpdate.state = state
        if (zip) propertyUpdate.zip = zip

        await db.property.update({
          where: { id: row.id, tenantId: tenant.id },
          data: propertyUpdate,
        })
        totals.propertiesUpdated++

        // Update Seller (matched via ghlContactId — the stub backfill
        // links one Seller per ghlContactId).
        const seller = await db.seller.findFirst({
          where: { tenantId: tenant.id, ghlContactId: row.ghlContactId! },
          select: { id: true, name: true },
        })
        if (seller) {
          const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
          const sellerUpdate: Record<string, unknown> = {}
          if (contact.firstName) sellerUpdate.firstName = contact.firstName
          if (contact.lastName) sellerUpdate.lastName = contact.lastName
          if (fullName && (!seller.name || seller.name === 'Unknown')) sellerUpdate.name = fullName
          if (contact.phone) sellerUpdate.phone = contact.phone
          if (contact.email) sellerUpdate.email = contact.email
          if (contact.address1) sellerUpdate.mailingAddress = contact.address1
          if (contact.city) sellerUpdate.mailingCity = contact.city
          if (contact.state) sellerUpdate.mailingState = contact.state
          if (contact.postalCode) sellerUpdate.mailingZip = contact.postalCode

          if (Object.keys(sellerUpdate).length > 0) {
            await db.seller.update({
              where: { id: seller.id, tenantId: tenant.id },
              data: sellerUpdate,
            })
            totals.sellersUpdated++
          }
        }

        // Trigger multi-vendor enrichment if we now have an address.
        // PR is subscription (free per call). BD has internal $15/day cap.
        // Google is ~$0.017/call.
        if (address) {
          await enrichProperty(row.id, tenant.id, { skipTrace: false })
          totals.enrichmentRan++
        } else {
          totals.noAddress++
        }
      } catch (err) {
        totals.errors++
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[enrich-pending] error on property ${row.id} (contact ${row.ghlContactId}): ${msg}`)
        // Don't reset pendingEnrichment — let the next run retry. But log
        // a single audit entry per failure for visibility.
        await db.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: 'enrich.pending.failed',
            resource: 'property',
            resourceId: row.id,
            severity: 'WARNING',
            source: 'SYSTEM',
            payload: { contactId: row.ghlContactId, error: msg },
          },
        }).catch(() => {})
      }
    }
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[enrich-pending] done in ${durationSec}s — ` +
    `fetched=${totals.contactsFetched} propertiesUpdated=${totals.propertiesUpdated} ` +
    `sellersUpdated=${totals.sellersUpdated} enrichmentRan=${totals.enrichmentRan} ` +
    `noAddress=${totals.noAddress} contactsMissing=${totals.contactsMissing} errors=${totals.errors}`
  )
}

main()
  .catch(err => {
    console.error('[enrich-pending] fatal:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
