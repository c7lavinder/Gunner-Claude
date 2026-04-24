// scripts/backfill-today.ts
// One-shot backfill: runs the orchestrator against every property created
// today that's missing vendor enrichment. Forces BD (bypasses cache +
// no-match skip) so we get the full dataset on every qualifying lead.

import fs from 'node:fs/promises'
import path from 'node:path'

async function loadEnvLocal(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch { /* optional */ }
}

async function main() {
  await loadEnvLocal()
  const { db } = await import('../lib/db/client')
  const { enrichProperty } = await import('../lib/enrichment/enrich-property')

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  // Today's leads — only ones that still look unenriched (no apn, no placeId)
  const leads = await db.property.findMany({
    where: {
      createdAt: { gte: startOfDay },
      address: { not: '' },
      // Missing either vendor data → candidate for backfill
      OR: [
        { apn: null },
        { googlePlaceId: null },
      ],
    },
    select: { id: true, address: true, city: true, state: true, zip: true, tenant: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  })

  if (leads.length === 0) {
    console.log('[Backfill] Nothing to do — all of today\'s leads already enriched.')
    await db.$disconnect()
    return
  }

  console.log(`[Backfill] Processing ${leads.length} unenriched leads from today`)
  console.log('')

  let bdRan = 0, prRan = 0, gRan = 0, totalCols = 0, errors = 0

  for (const lead of leads) {
    process.stdout.write(`  ${lead.address}, ${lead.city}, ${lead.state}  ... `)
    try {
      // Force BD → bypass cache + PR-no-match skip. Still subject to the daily
      // budget cap (BATCHDATA_DAILY_BUDGET_USD) as the hard safety.
      const r = await enrichProperty(lead.id, { forceBatchData: true })
      if (r.batchdata.matched && !r.batchdata.skipped) bdRan++
      if (r.propertyRadar.matched) prRan++
      if (r.google.matched) gRan++
      totalCols += r.columnsWritten
      console.log(`BD:${r.batchdata.matched ? '✓' : (r.batchdata.skipped ?? '✗')} PR:${r.propertyRadar.matched ? '✓' : '✗'} G:${r.google.matched ? '✓' : '✗'}  ${r.columnsWritten} cols`)
    } catch (err) {
      console.log(`ERROR — ${err instanceof Error ? err.message : err}`)
      errors++
    }
  }

  console.log('')
  console.log('═══ Backfill summary ═══')
  console.log(`  Leads processed:     ${leads.length}`)
  console.log(`  BD succeeded:        ${bdRan}   (est. cost: $${(bdRan * 0.30).toFixed(2)})`)
  console.log(`  PR succeeded:        ${prRan}`)
  console.log(`  Google succeeded:    ${gRan}`)
  console.log(`  Total columns written: ${totalCols}`)
  console.log(`  Errors:              ${errors}`)

  await db.$disconnect()
}

main().catch(err => {
  console.error('[Backfill] Fatal:', err)
  process.exit(1)
})
