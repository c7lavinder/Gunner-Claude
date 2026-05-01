// scripts/migrate-field-source-ai-to-api.ts
// One-shot: rename field_sources.{beds,baths,sqft,yearBuilt,lotSize,propertyType}
// values from 'ai' → 'api' on Property rows. The label was renamed when
// BatchData enrichment moved from heuristic AI fill to direct API fetch.
//
// Run dry-run first: npx tsx scripts/migrate-field-source-ai-to-api.ts
// Run apply:        npx tsx scripts/migrate-field-source-ai-to-api.ts --apply
//
// Idempotent — re-runs are no-ops once all 'ai' values are converted.
// Replaces the runtime patch in app/api/health/route.ts that was running
// this rename on every health check.

import { db } from '../lib/db/client'

const API_FIELDS = ['beds', 'baths', 'sqft', 'yearBuilt', 'lotSize', 'propertyType']

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`[migrate-field-source] mode=${apply ? 'APPLY' : 'DRY-RUN'}`)

  const properties = await db.property.findMany({
    where: { fieldSources: { not: 'null' as unknown as undefined } },
    select: { id: true, fieldSources: true },
  })

  let toFix = 0
  let totalRenames = 0
  for (const p of properties) {
    const sources = (p.fieldSources ?? {}) as Record<string, string>
    const renames: string[] = []
    for (const f of API_FIELDS) {
      if (sources[f] === 'ai') renames.push(f)
    }
    if (renames.length === 0) continue

    toFix++
    totalRenames += renames.length

    if (apply) {
      const next = { ...sources }
      for (const f of renames) next[f] = 'api'
      await db.property.update({ where: { id: p.id }, data: { fieldSources: next } })
    }
  }

  console.log(`[migrate-field-source] properties scanned: ${properties.length}`)
  console.log(`[migrate-field-source] properties needing fix: ${toFix}`)
  console.log(`[migrate-field-source] total field renames: ${totalRenames}`)
  console.log(`[migrate-field-source] ${apply ? 'applied' : 'dry-run only — re-run with --apply to commit'}`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
