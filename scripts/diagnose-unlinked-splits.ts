#!/usr/bin/env -S npx tsx
// scripts/diagnose-unlinked-splits.ts
// Audit log says cleanup.address_split happened 165 times, creating 136
// new Property rows. Those new rows were NOT linked to ghlContactId or
// PropertySeller — owner asked to fix.
//
// This script reads the audit trail to figure out exactly which Property
// rows are the splits, and which Property is their parent. Reports counts
// + samples so we can sanity-check before a write script runs.

import { db } from '../lib/db/client'

interface SplitAuditPayload {
  splits?: Array<{ street: string; city: string; state: string; zip: string }>
}

async function main() {
  const splits = await db.auditLog.findMany({
    where: { action: 'cleanup.address_split' },
    select: { id: true, tenantId: true, resourceId: true, payload: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`audit rows where action='cleanup.address_split': ${splits.length}`)

  let totalExpectedSplits = 0
  let foundChildren = 0
  let missingChildren = 0
  let parentMissing = 0
  let parentLacksContact = 0
  const sample: string[] = []

  for (const audit of splits) {
    const tenantId = audit.tenantId
    if (!tenantId) continue
    const payload = audit.payload as unknown as SplitAuditPayload
    const splitAddresses = payload.splits ?? []
    totalExpectedSplits += splitAddresses.length

    const parent = await db.property.findFirst({
      where: { id: audit.resourceId!, tenantId },
      select: { id: true, address: true, ghlContactId: true, ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true },
    })
    if (!parent) { parentMissing++; continue }
    if (!parent.ghlContactId) { parentLacksContact++; continue }

    for (const split of splitAddresses) {
      // Try strict (no createdAt filter, ghlContactId IS NULL)
      const candidates = await db.property.findMany({
        where: {
          tenantId,
          address: split.street,
          ghlContactId: null,
        },
        select: { id: true, ghlContactId: true, address: true, city: true, state: true, zip: true, createdAt: true },
      })
      // Filter by city/state/zip approximately (case-insensitive)
      const matches = candidates.filter(c =>
        (c.city ?? '').toLowerCase() === (split.city ?? '').toLowerCase() &&
        (c.state ?? '').toLowerCase() === (split.state ?? '').toLowerCase() &&
        (c.zip ?? '') === (split.zip ?? '')
      )
      if (matches.length > 0) {
        foundChildren++
        if (sample.length < 12) {
          sample.push(`  parent=${parent.id.slice(0, 10)}… "${parent.address}" → child=${matches[0].id.slice(0, 10)}… "${split.street}" matches=${matches.length}`)
        }
      } else {
        missingChildren++
        // Look for any property with this address (any state, any contact)
        const any = await db.property.findFirst({
          where: { tenantId, address: split.street },
          select: { id: true, ghlContactId: true, city: true, state: true, zip: true, createdAt: true },
        })
        if (sample.length < 12) {
          sample.push(`  MISSING parent=${parent.id.slice(0, 10)}… "${parent.address}" → split="${split.street}" | ${split.city}/${split.state}/${split.zip} | any?=${any ? `${any.id.slice(0,10)}… (${any.city}/${any.state}/${any.zip}) contactId=${any.ghlContactId ? 'set' : 'NULL'}` : 'NONE'}`)
        }
      }
    }
  }

  console.log(`expected split children rows total: ${totalExpectedSplits}`)
  console.log(`  found unlinked children:           ${foundChildren}`)
  console.log(`  missing (already linked or moved): ${missingChildren}`)
  console.log(`parent properties not found:         ${parentMissing}`)
  console.log(`parent properties without contact:   ${parentLacksContact}`)

  console.log('\nFirst 8 samples:')
  for (const s of sample) console.log(s)

  // Also count the bulk shape: every Property where ghlContactId IS NULL
  const nullCount = await db.property.count({ where: { ghlContactId: null } })
  console.log(`\nGlobal: total Property rows with ghlContactId IS NULL: ${nullCount}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
