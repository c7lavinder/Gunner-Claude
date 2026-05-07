#!/usr/bin/env -S npx tsx
// scripts/link-unlinked-splits.ts
//
// Session 75 cleanup-address-shapes.ts created 136 split Property rows
// without linking them to their parent's GHL contact or seller. This
// script reads the cleanup.address_split audit trail to find the parent
// for each split and back-fills:
//
//   - Property.ghlContactId       ← parent.ghlContactId
//   - PropertySeller link         ← parent's seller (isPrimary=false)
//
// NOT copied: ghlAcqOppId / ghlDispoOppId / ghlLongtermOppId — those are
// 1:1 with GHL opportunities and stay on the parent only.
//
// Idempotent: skips children that already have ghlContactId set or that
// already share a PropertySeller link with the parent. First-match-wins
// in chronological audit order — when two parents share the same split
// address (duplicate combined-address rows), the earliest-audited parent
// wins.
//
// Default DRY-RUN. Pass --apply to persist.

import { db } from '../lib/db/client'

interface SplitAuditPayload {
  splits?: Array<{ street: string; city: string; state: string; zip: string }>
}

const APPLY = process.argv.slice(2).includes('--apply')

async function main() {
  console.log(`[link-splits] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const audits = await db.auditLog.findMany({
    where: { action: 'cleanup.address_split' },
    select: { id: true, tenantId: true, resourceId: true, payload: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[link-splits] found ${audits.length} cleanup.address_split audit rows`)

  let linked = 0
  let skippedAlreadyLinked = 0
  let parentMissing = 0
  let parentLacksContact = 0
  let childNotFound = 0
  let propertySellerLinked = 0
  let sellerNotFound = 0

  for (const audit of audits) {
    const tenantId = audit.tenantId
    if (!tenantId) continue
    const payload = audit.payload as unknown as SplitAuditPayload
    const splitAddresses = payload.splits ?? []
    if (splitAddresses.length === 0) continue

    const parent = await db.property.findFirst({
      where: { id: audit.resourceId!, tenantId },
      select: { id: true, address: true, ghlContactId: true },
    })
    if (!parent) { parentMissing++; continue }
    if (!parent.ghlContactId) { parentLacksContact++; continue }

    // Find the seller linked to the parent (the canonical Seller row to
    // share across all splits). Prefer the parent's primary PropertySeller.
    const parentSellerLinks = await db.propertySeller.findMany({
      where: { propertyId: parent.id },
      select: { sellerId: true, isPrimary: true, role: true },
    })

    for (const split of splitAddresses) {
      // First-match-wins: pick ONE unlinked child for this audit's split.
      const child = await db.property.findFirst({
        where: {
          tenantId,
          address: split.street,
          city: split.city,
          state: split.state,
          zip: split.zip,
          ghlContactId: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, address: true, ghlContactId: true },
      })

      if (!child) {
        // Look for an already-linked match (idempotent skip)
        const linkedChild = await db.property.findFirst({
          where: {
            tenantId,
            address: split.street,
            city: split.city,
            state: split.state,
            zip: split.zip,
            ghlContactId: parent.ghlContactId,
          },
          select: { id: true },
        })
        if (linkedChild) skippedAlreadyLinked++
        else childNotFound++
        continue
      }

      console.log(
        `${APPLY ? '✓' : '·'} parent=${parent.id.slice(0, 10)}… "${parent.address}" → child=${child.id.slice(0, 10)}… "${child.address}" ` +
        `link contactId=${parent.ghlContactId.slice(0, 12)}… (${parentSellerLinks.length} seller${parentSellerLinks.length === 1 ? '' : 's'})`,
      )

      if (APPLY) {
        await db.property.update({
          where: { id: child.id, tenantId },
          data: { ghlContactId: parent.ghlContactId },
        })

        // Mirror parent's seller links onto child. Splits get isPrimary=false
        // — the parent retains the primary marker. skipDuplicates handles
        // re-runs safely (composite PK on PropertySeller).
        if (parentSellerLinks.length > 0) {
          await db.propertySeller.createMany({
            data: parentSellerLinks.map(ps => ({
              propertyId: child.id,
              sellerId: ps.sellerId,
              isPrimary: false,
              role: ps.role,
            })),
            skipDuplicates: true,
          })
          propertySellerLinked++
        } else {
          // Parent had no seller link (rare — most properties have one).
          // Try to find any Seller in this tenant with the parent's contactId.
          const seller = await db.seller.findFirst({
            where: { tenantId, ghlContactId: parent.ghlContactId },
            select: { id: true },
          })
          if (seller) {
            await db.propertySeller.create({
              data: { propertyId: child.id, sellerId: seller.id, isPrimary: false, role: 'Seller' },
            }).catch(() => { /* race: composite PK collision tolerated */ })
            propertySellerLinked++
          } else {
            sellerNotFound++
          }
        }

        await db.auditLog.create({
          data: {
            tenantId,
            action: 'cleanup.split_linked',
            resource: 'property',
            resourceId: child.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              parentId: parent.id,
              parentAddress: parent.address,
              ghlContactId: parent.ghlContactId,
              sellerLinks: parentSellerLinks.length,
            },
          },
        }).catch(err => console.error('[link-splits] audit failed:', err instanceof Error ? err.message : err))
      }

      linked++
    }
  }

  console.log(`\n[link-splits] linked=${linked} skipped_already=${skippedAlreadyLinked} child_not_found=${childNotFound}`)
  console.log(`[link-splits] property_seller_linked=${propertySellerLinked} seller_not_found=${sellerNotFound}`)
  console.log(`[link-splits] parent_missing=${parentMissing} parent_lacks_contact=${parentLacksContact}`)

  if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
