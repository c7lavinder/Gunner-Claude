// scripts/diagnose-calls.ts
// Run: npx tsx scripts/diagnose-calls.ts [date?]
// Comprehensive call pipeline diagnostic — run when calls seem missing or stuck.
// Compares Gunner DB against expected counts, identifies stuck/failed items,
// and shows exactly where in the pipeline things broke.

import { db } from '../lib/db/client'

const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const startOfDay = new Date(`${dateArg}T00:00:00Z`)
const endOfDay = new Date(`${dateArg}T23:59:59.999Z`)

async function diagnose() {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`CALL PIPELINE DIAGNOSTIC — ${dateArg}`)
  console.log(`${'='.repeat(70)}\n`)

  const tenants = await db.tenant.findMany({
    where: { ghlLocationId: { not: null } },
    select: { id: true, name: true, ghlLocationId: true, ghlTokenExpiry: true },
  })

  for (const tenant of tenants) {
    console.log(`\n--- Tenant: ${tenant.name} (${tenant.id}) ---\n`)

    // 1. Token health
    const tokenExpiry = tenant.ghlTokenExpiry
    const tokenOk = tokenExpiry && tokenExpiry > new Date()
    console.log(`[AUTH] GHL token: ${tokenOk ? `valid until ${tokenExpiry!.toISOString()}` : 'EXPIRED or missing'}`)

    // 2. Total calls today
    const allCalls = await db.call.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: startOfDay, lte: endOfDay } },
      select: { id: true, source: true, gradingStatus: true, callResult: true, durationSeconds: true, recordingUrl: true, transcript: true, ghlCallId: true, createdAt: true, contactName: true },
    })
    console.log(`[CALLS] Total: ${allCalls.length}`)

    // 3. Source breakdown
    const sources: Record<string, number> = {}
    for (const c of allCalls) { sources[c.source ?? 'unknown'] = (sources[c.source ?? 'unknown'] ?? 0) + 1 }
    console.log(`[SOURCE] ${Object.entries(sources).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    // 4. Status breakdown
    const statuses: Record<string, number> = {}
    for (const c of allCalls) { statuses[c.gradingStatus] = (statuses[c.gradingStatus] ?? 0) + 1 }
    console.log(`[STATUS] ${Object.entries(statuses).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    // 5. Call result breakdown
    const results: Record<string, number> = {}
    for (const c of allCalls) { results[c.callResult ?? 'null'] = (results[c.callResult ?? 'null'] ?? 0) + 1 }
    console.log(`[RESULT] ${Object.entries(results).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    // 6. Stuck PENDING > 30 min
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000)
    const stuckPending = allCalls.filter(c => c.gradingStatus === 'PENDING' && new Date(c.createdAt) < thirtyMinAgo)
    if (stuckPending.length > 0) {
      console.log(`\n[STUCK PENDING] ${stuckPending.length} calls stuck in PENDING > 30 min:`)
      for (const c of stuckPending.slice(0, 10)) {
        console.log(`  ${c.id} | ${c.contactName ?? 'Unknown'} | ${c.durationSeconds ?? 0}s | recording=${!!c.recordingUrl} | transcript=${!!c.transcript}`)
      }
    }

    // 7. Recording fetch jobs
    const recJobs = await db.recordingFetchJob.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: startOfDay, lte: endOfDay } },
      select: { id: true, callId: true, status: true, attempts: true, lastError: true, ghlMessageId: true },
    })
    const jobStatuses: Record<string, number> = {}
    for (const j of recJobs) { jobStatuses[j.status] = (jobStatuses[j.status] ?? 0) + 1 }
    console.log(`[REC JOBS] Total: ${recJobs.length} | ${Object.entries(jobStatuses).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    const failedJobs = recJobs.filter(j => j.status === 'FAILED')
    if (failedJobs.length > 0) {
      console.log(`[REC JOBS FAILED]`)
      for (const j of failedJobs.slice(0, 5)) {
        console.log(`  ${j.callId} | attempts=${j.attempts} | error=${j.lastError?.slice(0, 100) ?? 'none'}`)
      }
    }

    // 8. Webhook logs today
    const webhookLogs = await db.webhookLog.findMany({
      where: { tenantId: tenant.id, receivedAt: { gte: startOfDay, lte: endOfDay } },
      select: { id: true, eventType: true, status: true, webhookSource: true, errorReason: true },
    })
    console.log(`[WEBHOOKS] Total: ${webhookLogs.length}`)

    const whEventTypes: Record<string, number> = {}
    for (const w of webhookLogs) { whEventTypes[w.eventType] = (whEventTypes[w.eventType] ?? 0) + 1 }
    console.log(`[WH EVENTS] ${Object.entries(whEventTypes).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    const whStatuses: Record<string, number> = {}
    for (const w of webhookLogs) { whStatuses[w.status] = (whStatuses[w.status] ?? 0) + 1 }
    console.log(`[WH STATUS] ${Object.entries(whStatuses).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    const whSources: Record<string, number> = {}
    for (const w of webhookLogs) { whSources[w.webhookSource ?? 'unknown'] = (whSources[w.webhookSource ?? 'unknown'] ?? 0) + 1 }
    console.log(`[WH SOURCE] ${Object.entries(whSources).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)

    const failedWebhooks = webhookLogs.filter(w => w.status === 'failed')
    if (failedWebhooks.length > 0) {
      console.log(`[WH FAILURES] ${failedWebhooks.length} failed:`)
      const failReasons: Record<string, number> = {}
      for (const w of failedWebhooks) { failReasons[w.errorReason?.slice(0, 80) ?? 'unknown'] = (failReasons[w.errorReason?.slice(0, 80) ?? 'unknown'] ?? 0) + 1 }
      for (const [reason, count] of Object.entries(failReasons)) {
        console.log(`  ${count}x: ${reason}`)
      }
    }

    // 9. Audit log errors today
    const auditErrors = await db.auditLog.count({
      where: { tenantId: tenant.id, severity: 'ERROR', createdAt: { gte: startOfDay, lte: endOfDay } },
    })
    console.log(`[AUDIT] Error-level entries today: ${auditErrors}`)

    if (auditErrors > 0) {
      const topErrors = await db.auditLog.findMany({
        where: { tenantId: tenant.id, severity: 'ERROR', createdAt: { gte: startOfDay, lte: endOfDay } },
        select: { action: true, payload: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      })
      const errorActions: Record<string, number> = {}
      for (const e of topErrors) { errorActions[e.action] = (errorActions[e.action] ?? 0) + 1 }
      console.log(`[AUDIT ERRORS]`)
      for (const [action, count] of Object.entries(errorActions)) {
        console.log(`  ${count}x: ${action}`)
      }
    }

    // 10. Calls with recording but no transcript (transcription may have failed)
    const recNoTrans = allCalls.filter(c => c.recordingUrl && !c.transcript)
    if (recNoTrans.length > 0) {
      console.log(`[MISSING TRANSCRIPTS] ${recNoTrans.length} calls have recording but no transcript`)
      for (const c of recNoTrans.slice(0, 5)) {
        console.log(`  ${c.id} | ${c.contactName ?? 'Unknown'} | status=${c.gradingStatus}`)
      }
    }

    // 11. Duplicate detection — same ghlCallId appearing multiple times
    const ghlIds = allCalls.map(c => c.ghlCallId).filter(Boolean) as string[]
    const dupes = ghlIds.filter((id, i) => ghlIds.indexOf(id) !== i)
    if (dupes.length > 0) {
      console.log(`[DUPLICATES] ${dupes.length} duplicate ghlCallId values found: ${dupes.slice(0, 5).join(', ')}`)
    }

    // Summary verdict
    console.log(`\n[VERDICT]`)
    const issues: string[] = []
    if (!tokenOk) issues.push('GHL token expired')
    if (stuckPending.length > 0) issues.push(`${stuckPending.length} calls stuck in PENDING`)
    if (failedJobs.length > 0) issues.push(`${failedJobs.length} recording jobs failed`)
    if (failedWebhooks.length > 0) issues.push(`${failedWebhooks.length} webhooks failed`)
    if (recNoTrans.length > 5) issues.push(`${recNoTrans.length} recordings without transcripts`)
    if (auditErrors > 10) issues.push(`${auditErrors} audit errors`)
    if (webhookLogs.length === 0 && allCalls.length > 0) issues.push('Zero webhooks but calls exist — webhook delivery may be down')

    if (issues.length === 0) {
      console.log('  HEALTHY — no issues detected')
    } else {
      for (const issue of issues) {
        console.log(`  ⚠️  ${issue}`)
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log('Diagnostic complete.')
  console.log(`${'='.repeat(70)}\n`)
}

diagnose()
  .catch(err => { console.error('Diagnostic failed:', err); process.exit(1) })
  .finally(() => db.$disconnect())
