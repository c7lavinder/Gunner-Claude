// scripts/backfill-call-source.ts
// Bug #18 — One-shot backfill for calls with `source IS NULL`. Most of these
// rows came from `scripts/recover-stuck-calls.ts` and the early-Session-37
// `import-historical-calls.ts` / `sync-calls.ts` runs that didn't stamp
// `source`. All forward-going call sites now set source explicitly (audited
// Session 79 — see PROGRESS.md Bug #18 entry).
//
// Strategy: stamp `source='legacy_unknown'` on every NULL row so the column
// becomes 100% populated. We don't try to retroactively classify by ghlCallId
// shape because the original ingest path can no longer be inferred reliably.
//
// Idempotent — re-running is a no-op once all rows are populated.
//
// Usage:
//   npx tsx scripts/backfill-call-source.ts --dry-run
//   npx tsx scripts/backfill-call-source.ts

import { db } from '../lib/db/client'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const targetCount = await db.call.count({ where: { source: null } })
  console.log(`Found ${targetCount} call rows with source IS NULL`)

  if (dryRun) {
    const sample = await db.call.findMany({
      where: { source: null },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, ghlCallId: true, createdAt: true, gradingStatus: true },
    })
    console.log('--dry-run sample:')
    for (const c of sample) {
      console.log(`  ${c.id} | ${c.ghlCallId ?? 'no-ghl-id'} | ${c.createdAt.toISOString()} | ${c.gradingStatus}`)
    }
    return
  }

  if (targetCount === 0) {
    console.log('Nothing to backfill')
    return
  }

  const result = await db.call.updateMany({
    where: { source: null },
    data: { source: 'legacy_unknown' },
  })

  console.log(`Updated ${result.count} rows → source='legacy_unknown'`)

  await db.auditLog.create({
    data: {
      tenantId: null,
      userId: null,
      action: 'backfill.call_source',
      resource: 'cron',
      resourceId: 'backfill-call-source',
      severity: 'INFO',
      source: 'SYSTEM',
      payload: { rowsUpdated: result.count },
    },
  }).catch(err => console.error('[backfill] audit write failed:', err))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
