#!/usr/bin/env -S npx tsx
// scripts/apply-final-triage-corrections.ts
// Owner triaged the 14-row residual list and supplied corrections.
// Match each by seller phone, apply the fix.
//
// Idempotent. Default DRY-RUN. Pass --apply.

import { db } from '../lib/db/client'
import { standardizeStreet, standardizeCity, standardizeState, standardizeZip } from '../lib/address'
import { resolveMarketForZip } from '../lib/properties'

const APPLY = process.argv.slice(2).includes('--apply')

interface Correction {
  phone: string
  // The address to match against existing Gunner row when seller has
  // multiple properties (case-insensitive substring match).
  matchAddress?: string
  city?: string
  state?: string
  zip?: string
  address?: string
}

const corrections: Correction[] = [
  // CITY MISSING — owner provided full city/state/zip
  { phone: '+16158780242', city: 'Nashville',  state: 'TN', zip: '37206' }, // 4120 W Hamilton Rd
  { phone: '+17816354568', city: 'Lexington',  state: 'MA', zip: '02420' }, // 12 Utica St
  { phone: '+17203883447', city: 'Aurora',     state: 'CO', zip: '80013' }, // 3636 South Argonne St
  { phone: '+15736343345', city: 'Centertown', state: 'MO', zip: '65023' }, // 1507 Monroe St
  { phone: '+14078187260', city: 'Knoxville',  state: 'TN', zip: '37914' }, // 526 S Castle
  { phone: '+18034471813', city: 'Columbia',   state: 'SC', zip: '29223' }, // 156 Cane Brake
  { phone: '+16154300450', city: 'Nashville',  state: 'TN', zip: '37207' }, // 1113 N 6th St
  { phone: '+17065772972', city: 'Conyers',    state: 'GA', zip: '30094' }, // 832 Virginia Ct SE

  // STATE MISSING — owner provided just state
  { phone: '+16158771421', state: 'TN' }, // 2609 Jenkins St
  // Ollie Cole has 2 properties (6825 and 6827 Nolensville Rd) on same
  // phone — both get state=TN, no matchAddress needed (both apply).
  { phone: '+16153614171', state: 'TN' },

  // COMMA IN ADDRESS — owner provided cleaned address
  { phone: '+16153195575', address: '364 Melpar Dr' }, // was "364 Melpar Dr Nashville, Tn -"
  { phone: '+16154148250', address: '302 Criddle St' }, // was "302 Criddle St Nashville, 37219"

  // PARCEL ID — owner provided the real address
  { phone: '+16154301181', address: '7890 Lampley Rd' }, // was "Parcel: 094099 00200"
]

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '')
}

async function main() {
  console.log(`[final-triage] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  let applied = 0
  let alreadyClean = 0
  let noMatch = 0

  for (const c of corrections) {
    const phoneTail = normalizePhone(c.phone).slice(-10)
    const sellers = await db.seller.findMany({
      where: { phone: { contains: phoneTail } },
      select: {
        id: true,
        properties: {
          select: {
            property: {
              select: { id: true, address: true, city: true, state: true, zip: true, marketId: true, tenantId: true },
            },
          },
        },
      },
    })
    const props = sellers.flatMap(s => s.properties.map(p => p.property))
    const targets = c.matchAddress
      ? props.filter(p => p.address.toLowerCase().includes(c.matchAddress!.toLowerCase()))
      : props

    if (targets.length === 0) {
      noMatch++
      console.log(`  ✗ no Property match for ${c.phone}`)
      continue
    }

    for (const p of targets) {
      const updates: Record<string, string> = {}
      if (c.address !== undefined) {
        const std = standardizeStreet(c.address)
        if (std !== p.address) updates.address = std
      }
      if (c.city !== undefined) {
        const std = standardizeCity(c.city)
        if (std !== (p.city ?? '')) updates.city = std
      }
      if (c.state !== undefined) {
        const std = standardizeState(c.state)
        if (std !== (p.state ?? '')) updates.state = std
      }
      if (c.zip !== undefined) {
        const std = standardizeZip(c.zip)
        if (std !== (p.zip ?? '')) updates.zip = std
      }

      if (Object.keys(updates).length === 0) {
        alreadyClean++
        continue
      }

      console.log(
        `${APPLY ? '✓' : '·'} ${p.id.slice(0, 12)}…  "${p.address}"  ${p.city}/${p.state}/${p.zip}  →  ` +
        `${Object.entries(updates).map(([k, v]) => `${k}="${v}"`).join(' ')}`,
      )

      if (APPLY) {
        // If zip changed (or was newly set), resolve marketId
        let newMarketId = p.marketId
        const newZip = updates.zip ?? p.zip ?? ''
        if (newZip && updates.zip && newZip !== p.zip) {
          newMarketId = await resolveMarketForZip(p.tenantId, newZip)
        }

        await db.property.update({
          where: { id: p.id, tenantId: p.tenantId },
          data: { ...updates, marketId: newMarketId },
        })

        await db.auditLog.create({
          data: {
            tenantId: p.tenantId,
            action: 'cleanup.owner_triage_fix',
            resource: 'property',
            resourceId: p.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              before: { address: p.address, city: p.city, state: p.state, zip: p.zip },
              after: updates,
            },
          },
        }).catch(() => { /* audit best-effort */ })
      }

      applied++
    }
  }

  console.log(`\n[final-triage] ${APPLY ? 'applied' : 'would apply'}=${applied}  already_clean=${alreadyClean}  no_match=${noMatch}`)
  if (!APPLY) console.log(`Dry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
