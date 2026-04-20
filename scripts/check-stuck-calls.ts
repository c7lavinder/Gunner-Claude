import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  // Raw SQL to get status counts including any out-of-enum values
  const counts = await db.$queryRaw<{ grading_status: string; count: bigint }[]>(
    Prisma.sql`SELECT grading_status::text as grading_status, COUNT(*)::bigint as count FROM calls WHERE called_at >= NOW() - INTERVAL '7 days' GROUP BY grading_status`
  )
  console.log('=== Last 7 days grading_status counts (raw) ===')
  for (const c of counts) console.log(`  ${c.grading_status}: ${c.count}`)

  const stuck = await db.$queryRaw<Array<{
    id: string; grading_status: string; call_result: string | null;
    duration_seconds: number | null; recording_url: string | null;
    transcript: string | null; ai_summary: string | null; ai_feedback: string | null;
    ghl_call_id: string | null; called_at: Date;
  }>>(Prisma.sql`
    SELECT id, grading_status::text as grading_status, call_result, duration_seconds,
           recording_url, transcript, ai_summary, ai_feedback, ghl_call_id, called_at
    FROM calls
    WHERE grading_status IN ('PENDING', 'FAILED')
      AND called_at >= NOW() - INTERVAL '7 days'
    ORDER BY called_at DESC
    LIMIT 30
  `)
  console.log('\n=== Stuck calls (PENDING/FAILED in last 7 days) ===')
  for (const c of stuck) {
    const hasRec = c.recording_url ? 'Y' : 'N'
    const hasTrans = c.transcript ? `Y(${c.transcript.length})` : 'N'
    const age = Math.round((Date.now() - new Date(c.called_at).getTime()) / (60 * 60 * 1000))
    console.log(`${new Date(c.called_at).toISOString().slice(0, 16)} | ${c.grading_status.padEnd(10)} | ${String(c.duration_seconds ?? '?').padStart(4)}s | rec=${hasRec} trans=${hasTrans} | ${age}h | ${c.call_result ?? '-'} | ${c.id.slice(0, 8)}`)
    if (c.ai_summary) console.log(`   summary: ${c.ai_summary.slice(0, 140)}`)
    if (c.ai_feedback) console.log(`   feedback: ${c.ai_feedback.slice(0, 200)}`)
  }

  const jobCounts = await db.$queryRaw<{ status: string; count: bigint }[]>(
    Prisma.sql`SELECT status::text as status, COUNT(*)::bigint as count FROM recording_fetch_jobs GROUP BY status`
  )
  console.log('\n=== RecordingFetchJob status counts ===')
  for (const j of jobCounts) console.log(`  ${j.status}: ${j.count}`)

  const failedJobs = await db.$queryRaw<Array<{ id: string; call_id: string; attempts: number; last_error: string | null; updated_at: Date }>>(
    Prisma.sql`SELECT id, call_id, attempts, last_error, updated_at FROM recording_fetch_jobs WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT 5`
  )
  console.log('\n=== Last 5 FAILED recording-fetch jobs ===')
  for (const j of failedJobs) {
    console.log(`${new Date(j.updated_at).toISOString()} attempts=${j.attempts} call=${j.call_id.slice(0, 8)}`)
    console.log(`   error: ${j.last_error?.slice(0, 300) ?? '-'}`)
  }

  const grading = await db.auditLog.findMany({
    where: { action: 'call.grading.failed', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true, resourceId: true, payload: true },
  })
  console.log('\n=== Last 10 grading.failed audit logs ===')
  for (const a of grading) {
    const p = a.payload as { error?: string } | null
    console.log(`${a.createdAt.toISOString()} call=${a.resourceId?.slice(0, 8)}`)
    console.log(`   error: ${p?.error?.slice(0, 300) ?? '-'}`)
  }

  // Check the 3 most recent PENDING calls in depth
  const recentPending = await db.$queryRaw<Array<{
    id: string; grading_status: string; duration_seconds: number | null;
    recording_url: string | null; transcript: string | null;
    created_at: Date; called_at: Date; ghl_call_id: string | null;
  }>>(Prisma.sql`
    SELECT id, grading_status::text as grading_status, duration_seconds, recording_url,
           transcript, created_at, called_at, ghl_call_id
    FROM calls
    WHERE grading_status = 'PENDING'
    ORDER BY called_at DESC
    LIMIT 5
  `)
  console.log('\n=== Most recent 5 PENDING calls — detail ===')
  for (const c of recentPending) {
    console.log(`id=${c.id}`)
    console.log(`  ghl_call_id=${c.ghl_call_id}`)
    console.log(`  duration=${c.duration_seconds}s recording=${c.recording_url ? 'YES' : 'NO'} transcript=${c.transcript ? c.transcript.length + 'chars' : 'NO'}`)
    console.log(`  called_at=${new Date(c.called_at).toISOString()}, created_at=${new Date(c.created_at).toISOString()}`)
    // Look for an associated recording fetch job
    const job = await db.recordingFetchJob.findFirst({ where: { callId: c.id } })
    if (job) {
      console.log(`  job: status=${job.status} attempts=${job.attempts}/5 nextAttempt=${job.nextAttemptAt.toISOString()} lastError=${job.lastError?.slice(0, 200) ?? '-'}`)
    } else {
      console.log(`  job: NONE (no RecordingFetchJob row)`)
    }
  }

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
