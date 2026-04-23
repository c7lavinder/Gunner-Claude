// scripts/backfill-batchdata-blobs.ts
//
// Zero-cost backfill. Walks every Property with an existing
// zillowData.batchData blob and extracts Tier 1+2 fields into the new typed
// columns added in 20260423020000_add_tier1_tier2_property_fields.
//
// Why: the blob has already been paid for. Up until now we only denormalized
// ~9 fields from ~50 that lookupProperty() returns. After this run every
// previously-enriched property has the same column coverage a fresh run
// would produce — without touching BatchData's API.
//
// Safe to rerun. `buildDenormUpdate` only backfills empty columns, so a second
// invocation is a no-op. Runs locally — `npx tsx scripts/backfill-batchdata-blobs.ts`.
//
// Supports `--limit=N` (process N rows) and `--dry` (log only, no writes).

import { Prisma } from '@prisma/client'
import { db } from '../lib/db/client'
import { buildDenormUpdate } from '../lib/batchdata/enrich'
import type { BatchDataPropertyResult } from '../lib/batchdata/client'

interface Args {
  limit: number | null
  dry: boolean
}

function parseArgs(): Args {
  const args: Args = { limit: null, dry: false }
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry') args.dry = true
    else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length))
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n)
    }
  }
  return args
}

interface PropertyRow {
  id: string
  address: string
  zillowData: unknown
  fieldSources: unknown
  // Slice matching PropertySlice in enrich.ts (we pass the whole row through)
  [key: string]: unknown
}

async function main() {
  const { limit, dry } = parseArgs()
  console.log(`[Backfill] Starting${dry ? ' (DRY RUN)' : ''}${limit ? `, limit=${limit}` : ''}`)

  // Grab all properties whose zillowData isn't DB null. We can't narrow to
  // "has a batchData key" in Prisma without a jsonb path query, so we do
  // that check in-memory below.
  const properties = await db.property.findMany({
    where: {
      NOT: { zillowData: { equals: Prisma.DbNull } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit ?? undefined,
  })

  let examined = 0
  let skippedNoBlob = 0
  let skippedNoData = 0
  let updatedCount = 0
  const errors: Array<{ id: string; reason: string }> = []

  for (const prop of properties as unknown as PropertyRow[]) {
    examined++
    const zillow = (prop.zillowData ?? {}) as Record<string, unknown>
    const blob = zillow.batchData as Record<string, unknown> | undefined
    if (!blob || typeof blob !== 'object') {
      skippedNoBlob++
      continue
    }

    try {
      // The blob shape is exactly what lookupProperty() returned minus `raw`
      // (see enrich.ts where we assemble updateData.zillowData.batchData).
      // Cast straight to BatchDataPropertyResult — buildDenormUpdate is
      // tolerant of undefined fields via its `setIfEmpty` guard.
      const result = blob as Partial<BatchDataPropertyResult>

      // fieldSources is loaded mutably so `buildDenormUpdate` can mark
      // backfilled fields as "api". We write it back alongside the typed cols.
      const fieldSources = { ...((prop.fieldSources as Record<string, string>) ?? {}) }
      const denorm = buildDenormUpdate(prop as never, result, fieldSources)

      if (Object.keys(denorm).length === 0) {
        skippedNoData++
        continue
      }

      if (dry) {
        console.log(`[Backfill] DRY ${prop.address} → ${Object.keys(denorm).join(', ')}`)
        updatedCount++
        continue
      }

      await db.property.update({
        where: { id: prop.id },
        data: {
          ...denorm,
          fieldSources,
        },
      })
      updatedCount++
      console.log(`[Backfill] ${prop.address} ← ${Object.keys(denorm).length} fields`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`[Backfill] ${prop.address} failed: ${reason}`)
      errors.push({ id: prop.id, reason })
    }
  }

  console.log('[Backfill] Done', {
    examined,
    skippedNoBlob,
    skippedNoData,
    updatedCount,
    errors: errors.length,
    mode: dry ? 'dry' : 'live',
  })

  if (errors.length > 0) {
    console.log('[Backfill] First 5 errors:', errors.slice(0, 5))
  }
}

main()
  .catch(err => {
    console.error('[Backfill] Fatal:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
