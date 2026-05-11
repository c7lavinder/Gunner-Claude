#!/usr/bin/env -S npx tsx
// scripts/audit-property-duplicates-fuzzy.ts
//
// Read-only audit. Groups properties by normalized street address + state
// (same normalizer used by the live dedup path in lib/properties.ts) so
// near-miss duplicates like "Dr" vs "Drive" or "1311 La Loma" vs
// "1311 La Loma Dr." surface, where the strict canonical merger would
// miss them.

import { db } from '../lib/db/client'

const args = process.argv.slice(2)
const TENANT_SLUG = (() => {
  const i = args.indexOf('--tenant')
  return i >= 0 ? args[i + 1] : 'new-again-houses'
})()

function normalizeStreetAddress(address: string): string {
  if (!address) return ''
  return address
    .toLowerCase()
    .trim()
    .replace(/[.,#]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bsouth\b/g, 's')
    .replace(/\beast\b/g, 'e')
    .replace(/\bwest\b/g, 'w')
}

async function main() {
  const tenant = await db.tenant.findFirst({ where: { slug: TENANT_SLUG }, select: { id: true } })
  if (!tenant) throw new Error(`tenant ${TENANT_SLUG} not found`)

  const rows = await db.property.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      ghlContactId: true, createdAt: true,
      _count: { select: { calls: true, milestones: true, sellers: true, tasks: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Group by normalized street + state (mirrors lib/properties.ts dedup rules)
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const norm = normalizeStreetAddress(r.address)
    if (!norm) continue
    const key = `${norm}|${(r.state ?? '').trim().toUpperCase()}`
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }

  const dups = [...groups.values()].filter(g => g.length > 1)
  console.log(`[fuzzy-audit] ${rows.length} total properties, ${dups.length} duplicate group(s) under normalized matcher`)

  for (const g of dups) {
    console.log(`\nGROUP key="${normalizeStreetAddress(g[0].address)}" state=${g[0].state}`)
    for (const r of g) {
      const usage = `calls=${r._count.calls} ms=${r._count.milestones} sellers=${r._count.sellers} tasks=${r._count.tasks}`
      console.log(`  ${r.id.slice(0, 14)}…  "${r.address}" | ${r.city}/${r.state}/${r.zip}  contact=${r.ghlContactId ? 'set' : 'NULL'}  ${usage}  created=${r.createdAt.toISOString().slice(0, 10)}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
