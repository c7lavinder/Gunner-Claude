// scripts/verify-bulletproofing.ts
// Verifies Fix #2 (recording_fetch_jobs queue health) and Fix #3 (audit_logs error surface)
// Run with: npx tsx scripts/verify-bulletproofing.ts
import { db } from '../lib/db/client'

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('FIX #2 HEALTH CHECK — Recording fetch job queue')
  console.log('═══════════════════════════════════════════════════════════════')

  const queueByStatus = await db.recordingFetchJob.groupBy({
    by: ['status'],
    _count: { status: true },
  })

  if (queueByStatus.length === 0) {
    console.log('⚠️  No recording jobs in queue. Either no calls happened, or webhooks aren\'t enqueuing. Investigate if calls were made.')
  } else {
    for (const row of queueByStatus) {
      console.log(`  ${row.status.padEnd(10)} ${row._count.status}`)
    }
  }

  // Show the most recent FAILED jobs if any exist
  const recentFailures = await db.recordingFetchJob.findMany({
    where: { status: 'FAILED' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, callId: true, attempts: true, lastError: true, updatedAt: true },
  })
  if (recentFailures.length > 0) {
    console.log('\n  Most recent FAILED jobs:')
    for (const f of recentFailures) {
      console.log(`    [${f.updatedAt.toISOString()}] call=${f.callId} attempts=${f.attempts} error=${(f.lastError ?? 'none').slice(0, 100)}`)
    }
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('FIX #3 HEALTH CHECK — audit_logs error surface (last 12 hours)')
  console.log('═══════════════════════════════════════════════════════════════')

  const since = new Date(Date.now() - 12 * 60 * 60 * 1000)
  const errorLogs = await db.auditLog.findMany({
    where: {
      source: 'SYSTEM',
      severity: 'ERROR',
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { action: true, resource: true, payload: true, createdAt: true },
  })

  if (errorLogs.length === 0) {
    console.log('  ✅ Zero ERROR rows in the last 12 hours. Pipeline is clean.')
  } else {
    console.log(`  Found ${errorLogs.length} error rows in the last 12 hours:\n`)

    // Group by action for a quick summary
    const byAction = new Map<string, number>()
    for (const log of errorLogs) {
      byAction.set(log.action, (byAction.get(log.action) ?? 0) + 1)
    }
    console.log('  Summary by action:')
    for (const [action, count] of [...byAction.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${action.padEnd(45)} ${count}`)
    }

    console.log('\n  Most recent 10 errors with details:')
    for (const log of errorLogs.slice(0, 10)) {
      const payload = log.payload as Record<string, unknown> | null
      const errMsg = payload?.error ? String(payload.error).slice(0, 200) : 'no error message'
      console.log(`    [${log.createdAt.toISOString()}] ${log.action} (${log.resource})`)
      console.log(`      ${errMsg}`)
    }
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('BONUS — Calls graded today vs misclassified')
  console.log('═══════════════════════════════════════════════════════════════')

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const callStats = await db.call.groupBy({
    by: ['gradingStatus'],
    where: { calledAt: { gte: todayStart } },
    _count: { gradingStatus: true },
  })

  for (const row of callStats) {
    console.log(`  ${row.gradingStatus.padEnd(12)} ${row._count.gradingStatus}`)
  }

  await db.$disconnect()
}

main().catch(err => {
  console.error('Verification script failed:', err)
  process.exit(1)
})
