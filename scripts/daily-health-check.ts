// scripts/daily-health-check.ts
// Run every morning before touching anything else.
// If both queries return clean, the GHL pipeline is healthy.
// If anything shows up, you have everything you need to fix it without tailing Railway logs.
//
// Run with: npx tsx scripts/daily-health-check.ts
import { db } from '../lib/db/client'

async function main() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Check 1: recording job queue health
  const queueHealth = await db.recordingFetchJob.groupBy({
    by: ['status'],
    _count: { status: true },
    where: { createdAt: { gte: since24h } },
  })
  const failedJobs = queueHealth.find(r => r.status === 'FAILED')?._count.status ?? 0
  const pendingJobs = queueHealth.find(r => r.status === 'PENDING')?._count.status ?? 0
  const doneJobs = queueHealth.find(r => r.status === 'DONE')?._count.status ?? 0

  // Check 2: error surface
  const errors = await db.auditLog.count({
    where: {
      source: 'SYSTEM',
      severity: 'ERROR',
      createdAt: { gte: since24h },
    },
  })

  // Check 3: calls misclassified (Fix #1 regression check)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const failedCallsWithEvidence = await db.call.count({
    where: {
      calledAt: { gte: todayStart },
      gradingStatus: 'FAILED',
      AND: [
        { durationSeconds: { gte: 45 } },
        { recordingUrl: { not: null } },
      ],
    },
  })

  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`DAILY HEALTH CHECK — ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`Recording queue (24h):  DONE=${doneJobs}  PENDING=${pendingJobs}  FAILED=${failedJobs}`)
  console.log(`audit_logs ERROR (24h): ${errors}`)
  console.log(`Calls FAILED today with evidence of being real: ${failedCallsWithEvidence}`)
  console.log('')

  let status = '✅ HEALTHY'
  const issues: string[] = []
  if (failedJobs > 0) issues.push(`${failedJobs} recording jobs permanently failed`)
  if (errors > 0) issues.push(`${errors} system errors logged`)
  if (failedCallsWithEvidence > 0) issues.push(`${failedCallsWithEvidence} real calls misclassified — Fix #1 regression?`)

  if (issues.length > 0) {
    status = '⚠️  ISSUES FOUND'
    for (const issue of issues) console.log(`  - ${issue}`)
    console.log('')
    console.log('Investigate with:')
    console.log('  npx tsx scripts/verify-bulletproofing.ts')
  }

  console.log(status)
  await db.$disconnect()
  process.exit(issues.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Health check failed:', err)
  process.exit(1)
})
