#!/usr/bin/env -S npx tsx
// scripts/audit-duplicate-causes.ts
// Read-only. For each duplicate group, print ghlContactId, createdAt
// (millisecond precision), assignedTo, and source — so we can tell if
// it's a webhook race (same contact, same instant) vs a legit re-create.

import { db } from '../lib/db/client'

const TENANT_SLUG = 'new-again-houses'

function norm(a: string) {
  if (!a) return ''
  return a.toLowerCase().trim()
    .replace(/[.,#]+/g, '').replace(/\s+/g, ' ')
    .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr').replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl')
    .replace(/\bcircle\b/g, 'cir').replace(/\bnorth\b/g, 'n')
    .replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w')
}

async function main() {
  const tenant = await db.tenant.findFirst({ where: { slug: TENANT_SLUG }, select: { id: true } })
  if (!tenant) throw new Error('tenant not found')

  const rows = await db.property.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, address: true, city: true, state: true, zip: true, ghlContactId: true, createdAt: true, leadSource: true },
    orderBy: { createdAt: 'asc' },
  })

  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = `${norm(r.address)}|${(r.state ?? '').toUpperCase()}`
    if (!norm(r.address)) continue
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }

  for (const g of [...groups.values()].filter(g => g.length > 1)) {
    console.log(`\n=== ${g[0].address} (${g[0].state}) ===`)
    for (const r of g) {
      console.log(`  id=${r.id}`)
      console.log(`     addr="${r.address}"  city=${r.city}  zip=${r.zip}`)
      console.log(`     ghlContact=${r.ghlContactId ?? 'null'}  source=${r.leadSource ?? 'null'}`)
      console.log(`     createdAt=${r.createdAt.toISOString()}`)
    }
    // Audit logs around the creation timeframe
    const propIds = g.map(p => p.id)
    const audits = await db.auditLog.findMany({
      where: { tenantId: tenant.id, resourceId: { in: propIds }, action: { in: ['property.created', 'property.creation.failed'] } },
      select: { action: true, resourceId: true, source: true, createdAt: true, payload: true },
      orderBy: { createdAt: 'asc' },
    })
    if (audits.length > 0) {
      console.log(`  audit events:`)
      for (const a of audits) {
        const payloadJson = JSON.stringify(a.payload).slice(0, 140)
        console.log(`    ${a.createdAt.toISOString()}  ${a.action}  src=${a.source}  resource=${(a.resourceId ?? '').slice(0,12)}  payload=${payloadJson}`)
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
