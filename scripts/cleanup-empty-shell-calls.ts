// scripts/cleanup-empty-shell-calls.ts
// One-shot cleanup for "empty-shell" calls — webhook/poll events that arrived
// with no duration, no recording, and no transcript. They should never have
// been graded; the worker's null-duration guard now routes them to SKIPPED,
// but rows that already accumulated as PENDING or FAILED need a manual flip.
//
// Idempotent — re-running is a no-op once the rows are SKIPPED.
//
// Usage: npx tsx scripts/cleanup-empty-shell-calls.ts [--dry-run]

import { db } from '../lib/db/client'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  // PENDING with no recording / transcript / duration — clearly no_answer.
  // 15-min cushion so we don't accidentally race a freshly-arrived call
  // before the worker's first pass.
  const pendingTargets = await db.call.findMany({
    where: {
      gradingStatus: 'PENDING',
      recordingUrl: null,
      transcript: null,
      createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
    },
    select: { id: true, createdAt: true, ghlCallId: true },
  })

  // FAILED with the exact "No recording or transcript available" summary.
  // Same root cause — gradeCall() was invoked before a recording existed.
  const failedTargets = await db.call.findMany({
    where: {
      gradingStatus: 'FAILED',
      recordingUrl: null,
      aiSummary: 'No recording or transcript available.',
    },
    select: { id: true, createdAt: true, ghlCallId: true },
  })

  console.log(`Found ${pendingTargets.length} stuck PENDING + ${failedTargets.length} empty-shell FAILED rows`)

  if (dryRun) {
    console.log('--dry-run: no changes')
    return
  }

  const allIds = [...pendingTargets.map(c => c.id), ...failedTargets.map(c => c.id)]
  if (allIds.length === 0) {
    console.log('Nothing to clean up')
    return
  }

  const result = await db.call.updateMany({
    where: { id: { in: allIds } },
    data: {
      gradingStatus: 'SKIPPED',
      callResult: 'no_answer',
      aiSummary: 'No answer — no recording produced.',
    },
  })

  console.log(`Updated ${result.count} rows → SKIPPED + no_answer`)

  await db.auditLog.create({
    data: {
      tenantId: null,
      userId: null,
      action: 'cleanup.empty_shell_calls',
      resource: 'cron',
      resourceId: 'cleanup-empty-shell-calls',
      severity: 'INFO',
      source: 'SYSTEM',
      payload: {
        pendingCleared: pendingTargets.length,
        failedCleared: failedTargets.length,
        totalUpdated: result.count,
      },
    },
  }).catch(err => console.error('[cleanup] audit write failed:', err))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
