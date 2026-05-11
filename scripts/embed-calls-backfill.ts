// scripts/embed-calls-backfill.ts
// Phase D — One-shot (and safe-to-rerun) backfill of transcript embeddings
// for all calls with transcripts that don't yet have a vector.
//
// Cost guard: text-embedding-3-small is ~$0.00002 per call. A tenant with
// 5,000 calls = $0.10 total. Cheap; just don't loop it.
//
// Usage:
//   npx tsx scripts/embed-calls-backfill.ts --dry-run
//   npx tsx scripts/embed-calls-backfill.ts                     # all tenants
//   npx tsx scripts/embed-calls-backfill.ts --tenant=<tenantId> # one tenant
//   npx tsx scripts/embed-calls-backfill.ts --limit=200         # cap per run
//
// The script reads pending calls via raw SQL because Prisma can't filter
// on Unsupported("vector") columns. Idempotent — only fills rows where
// transcript_embedding IS NULL.

import { db } from '../lib/db/client'
import { embedCallTranscript } from '../lib/ai/embeddings'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = (() => {
  const arg = args.find(a => a.startsWith('--limit='))
  if (!arg) return 1000
  const n = parseInt(arg.split('=')[1], 10)
  return Number.isFinite(n) && n > 0 ? n : 1000
})()
const tenantArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1]

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('[embed-calls] OPENAI_API_KEY is not set — cannot generate embeddings.')
    process.exit(1)
  }

  // Find calls needing embedding. Filter: has a transcript, no embedding,
  // graded (so we don't waste tokens on incomplete calls).
  const where = tenantArg
    ? `WHERE transcript_embedding IS NULL AND transcript IS NOT NULL AND grading_status = 'COMPLETED' AND tenant_id = $1`
    : `WHERE transcript_embedding IS NULL AND transcript IS NOT NULL AND grading_status = 'COMPLETED'`

  const params: unknown[] = tenantArg ? [tenantArg] : []

  const rows = await db.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
    `SELECT id, tenant_id FROM calls ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    ...params,
  )

  console.log(`[embed-calls] found ${rows.length} calls needing embedding${tenantArg ? ` (tenant: ${tenantArg})` : ''}`)

  if (dryRun) {
    console.log('[embed-calls] dry-run — would embed:')
    for (const r of rows.slice(0, 10)) console.log(`  - ${r.id} (tenant ${r.tenant_id})`)
    if (rows.length > 10) console.log(`  ... and ${rows.length - 10} more`)
    return
  }

  let success = 0
  let skipped = 0
  let errors = 0

  // Sequential — keep request rate low and observable. The OpenAI API is
  // fast; the bottleneck here is DB I/O, not embedding latency.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    try {
      const ok = await embedCallTranscript(r.id, r.tenant_id)
      if (ok) success++
      else skipped++
    } catch (err) {
      errors++
      console.error(`[embed-calls] FAIL ${r.id}:`, err instanceof Error ? err.message : err)
    }
    if ((i + 1) % 25 === 0) {
      console.log(`[embed-calls] progress: ${i + 1}/${rows.length} (ok=${success}, skip=${skipped}, err=${errors})`)
    }
  }

  console.log(`[embed-calls] done. embedded=${success} skipped=${skipped} errors=${errors}`)
}

main()
  .catch(err => {
    console.error('[embed-calls] fatal:', err)
    process.exit(1)
  })
  .finally(async () => { await db.$disconnect() })
