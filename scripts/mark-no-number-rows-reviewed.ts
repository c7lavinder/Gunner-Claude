#!/usr/bin/env -S npx tsx
// scripts/mark-no-number-rows-reviewed.ts
//
// Mark every Property whose address has no leading street number as
// owner-reviewed. After today's research pass, owner confirmed the
// remaining 43 are "likely correct without street number" — so subsequent
// audit runs should skip them. Future no-number rows (created after this
// script ran) will still surface, since they won't carry the audit row.
//
// Writes one `cleanup.address_reviewed` audit row per Property with
// payload { reason: 'owner_confirmed_no_house_number', address }. Reads
// it back next time to suppress E002.
//
// Idempotent: skips Properties that already have a cleanup.address_reviewed
// audit row.
//
// Default DRY-RUN. Pass --apply to persist.

import { db } from '../lib/db/client'

const APPLY = process.argv.slice(2).includes('--apply')

async function main() {
  console.log(`[mark-reviewed] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } })
  let totalMarked = 0
  let totalAlready = 0

  for (const tenant of tenants) {
    const rows = await db.property.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, address: true, city: true, state: true, zip: true },
    })
    const offenders = rows.filter(r => {
      const addr = (r.address ?? '').trim()
      if (!addr) return false
      return !/^\d/.test(addr)
    })

    if (offenders.length === 0) continue

    // Pre-fetch existing cleanup.address_reviewed audits to filter out
    // already-marked rows.
    const ids = offenders.map(r => r.id)
    const existing = await db.auditLog.findMany({
      where: { tenantId: tenant.id, action: 'cleanup.address_reviewed', resourceId: { in: ids } },
      select: { resourceId: true },
    })
    const alreadyMarked = new Set(existing.map(a => a.resourceId))

    const toMark = offenders.filter(r => !alreadyMarked.has(r.id))
    console.log(`[${tenant.slug}] ${offenders.length} no-number rows | ${alreadyMarked.size} already marked | ${toMark.length} to mark`)

    if (APPLY && toMark.length > 0) {
      await db.auditLog.createMany({
        data: toMark.map(r => ({
          tenantId: tenant.id,
          action: 'cleanup.address_reviewed' as const,
          resource: 'property',
          resourceId: r.id,
          severity: 'INFO' as const,
          source: 'SYSTEM' as const,
          payload: {
            reason: 'owner_confirmed_no_house_number',
            address: r.address,
            city: r.city,
            state: r.state,
            zip: r.zip,
          },
        })),
      })
    }

    totalMarked += toMark.length
    totalAlready += alreadyMarked.size
  }

  console.log(
    `\n[mark-reviewed] ${APPLY ? 'marked' : 'would mark'}=${totalMarked}  already_marked=${totalAlready}`,
  )
  if (!APPLY) console.log(`Dry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
