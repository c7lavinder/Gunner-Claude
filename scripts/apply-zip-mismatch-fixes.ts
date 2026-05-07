#!/usr/bin/env -S npx tsx
// scripts/apply-zip-mismatch-fixes.ts
// One-shot: fix the two zip-mismatch rows surfaced after the final
// triage pass. Idempotent. Default DRY-RUN. Pass --apply.

import { db } from '../lib/db/client'
import { resolveMarketForZip } from '../lib/properties'

const APPLY = process.argv.slice(2).includes('--apply')

const fixes = [
  // 302 Criddle St — Nashville address, row had Knoxville zip 37912
  { match: { address: '302 Criddle St', city: 'Nashville' }, newZip: '37219' },
  // 2609 Jenkins St — Nashville address, row had Columbia zip 38401
  { match: { address: '2609 Jenkins St', city: 'Nashville' }, newZip: '37207' },
]

async function main() {
  console.log(`[zip-fix] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  for (const f of fixes) {
    const rows = await db.property.findMany({
      where: f.match,
      select: { id: true, tenantId: true, address: true, city: true, state: true, zip: true, marketId: true },
    })
    if (rows.length === 0) { console.log(`  ✗ no match for ${JSON.stringify(f.match)}`); continue }
    for (const p of rows) {
      if (p.zip === f.newZip) {
        console.log(`  · ${p.id.slice(0, 12)}…  "${p.address}" already has zip=${f.newZip}`)
        continue
      }
      console.log(`${APPLY ? '✓' : '·'} ${p.id.slice(0, 12)}…  "${p.address}"  zip ${p.zip} → ${f.newZip}`)
      if (APPLY) {
        const newMarketId = await resolveMarketForZip(p.tenantId, f.newZip)
        await db.property.update({
          where: { id: p.id, tenantId: p.tenantId },
          data: { zip: f.newZip, marketId: newMarketId },
        })
        await db.auditLog.create({
          data: {
            tenantId: p.tenantId,
            action: 'cleanup.zip_mismatch_fixed',
            resource: 'property',
            resourceId: p.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: { before: { zip: p.zip, marketId: p.marketId }, after: { zip: f.newZip, marketId: newMarketId } },
          },
        }).catch(() => {})
      }
    }
  }
  if (!APPLY) console.log(`Dry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
