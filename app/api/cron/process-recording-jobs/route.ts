// app/api/cron/process-recording-jobs/route.ts
// Cron worker — processes pending recording fetch jobs with exponential backoff
// Runs every 1 minute via Railway cron
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { fetchAndStoreRecording } from '@/lib/ghl/fetch-recording'
import { gradeCall } from '@/lib/ai/grading'
import { logFailure } from '@/lib/audit'

const MAX_ATTEMPTS = 5
const BATCH_SIZE = 20

export async function POST() {
  return processJobs()
}

export async function GET() {
  return processJobs()
}

async function processJobs() {
  const startedAt = Date.now()
  const stats = { processed: 0, succeeded: 0, retried: 0, failed: 0, cleaned: 0, stalePendingRecovered: 0, transcriptionRetries: 0 }

  try {
    // 1. Pick up due jobs
    const jobs = await db.recordingFetchJob.findMany({
      where: {
        status: 'PENDING',
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH_SIZE,
    })

    for (const job of jobs) {
      stats.processed++
      try {
        // fetchAndStoreRecording already handles token refresh, FAILED->PENDING flip, and re-grading (from Fix #1)
        await fetchAndStoreRecording(job.callId, job.ghlMessageId)

        // Verify it actually stored the recording
        const call = await db.call.findUnique({
          where: { id: job.callId },
          select: { recordingUrl: true, gradingStatus: true, transcript: true },
        })

        if (call?.recordingUrl) {
          // Recording landed — mark job done
          await db.recordingFetchJob.update({
            where: { id: job.id },
            data: { status: 'DONE', lastError: null },
          })
          stats.succeeded++

          // Belt and suspenders: trigger grading if call is still PENDING and has no transcript
          if (call.gradingStatus === 'PENDING' && !call.transcript) {
            gradeCall(job.callId).catch(err =>
              logFailure(job.tenantId, 'recording_jobs.grade_failed', 'call', err, { callId: job.callId, jobId: job.id })
            )
          }
        } else {
          // Fetch returned without error but no recording stored — retry with backoff
          throw new Error('Recording fetch returned no recording')
        }
      } catch (err) {
        const newAttempts = job.attempts + 1
        const errMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)

        if (newAttempts >= MAX_ATTEMPTS) {
          await db.recordingFetchJob.update({
            where: { id: job.id },
            data: { status: 'FAILED', attempts: newAttempts, lastError: errMessage },
          })
          stats.failed++
          console.warn(`[recording-jobs] Job ${job.id} permanently failed after ${newAttempts} attempts: ${errMessage}`)

          // FIX: When recording fetch exhausts retries, trigger gradeCall so the call
          // gets properly handled (grades with whatever data is available, or marks FAILED)
          // instead of staying stuck in PENDING forever.
          gradeCall(job.callId).catch(gradeErr =>
            logFailure(job.tenantId, 'recording_jobs.final_grade_failed', 'call', gradeErr, { callId: job.callId, jobId: job.id })
          )
        } else {
          // Exponential backoff: 1m, 2m, 4m, 8m, 16m
          const backoffMs = Math.pow(2, newAttempts - 1) * 60_000
          await db.recordingFetchJob.update({
            where: { id: job.id },
            data: {
              attempts: newAttempts,
              nextAttemptAt: new Date(Date.now() + backoffMs),
              lastError: errMessage,
            },
          })
          stats.retried++
        }
      }
    }

    // 2. Cleanup: delete DONE jobs older than 7 days (keep table small)
    const cleanupCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const cleaned = await db.recordingFetchJob.deleteMany({
      where: { status: 'DONE', updatedAt: { lt: cleanupCutoff } },
    })
    stats.cleaned = cleaned.count

    // 3. Recovery sweep: stale PENDING calls with no active recording fetch job
    // These calls were created but gradeCall() was never triggered — either the
    // recording fetch job failed silently, was never created, or the job completed
    // without triggering grading. Trigger gradeCall() so they get properly handled.
    try {
      const activeJobCallIds = await db.recordingFetchJob.findMany({
        where: { status: 'PENDING' },
        select: { callId: true },
      })
      const activeCallIdSet = new Set(activeJobCallIds.map(j => j.callId))

      const stalePending = await db.call.findMany({
        where: {
          gradingStatus: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) }, // >15 min old
        },
        select: { id: true, tenantId: true },
        take: 10,
      })

      for (const call of stalePending) {
        if (activeCallIdSet.has(call.id)) continue // recording job still in flight
        gradeCall(call.id).catch(err =>
          logFailure(call.tenantId, 'recording_jobs.stale_pending_grade_failed', 'call', err, { callId: call.id })
        )
        stats.stalePendingRecovered++
      }
    } catch (err) {
      console.error('[recording-jobs] Stale PENDING sweep error:', err instanceof Error ? err.message : err)
    }

    // 4. Recovery sweep: retry failed transcriptions
    // Calls with a recording URL but no transcript that failed with "Transcription failed"
    // Only retry calls created in last 4 hours, with a 15-minute cooldown between retries.
    try {
      // Only retry calls whose aiSummary says "will retry automatically" (retry count < max).
      // Once retries exhaust, grading.ts changes the message to "manual reprocess required"
      // and this sweep stops matching.
      const failedTranscriptions = await db.call.findMany({
        where: {
          gradingStatus: 'FAILED',
          recordingUrl: { not: null },
          transcript: { equals: null },
          aiSummary: { contains: 'will retry automatically' },
          createdAt: { gt: new Date(Date.now() - 4 * 60 * 60 * 1000) }, // within last 4 hours
        },
        select: { id: true, tenantId: true },
        take: 5,
      })

      for (const call of failedTranscriptions) {
        gradeCall(call.id).catch(err =>
          logFailure(call.tenantId, 'recording_jobs.transcription_retry_failed', 'call', err, { callId: call.id })
        )
        stats.transcriptionRetries++
      }
    } catch (err) {
      console.error('[recording-jobs] Transcription retry sweep error:', err instanceof Error ? err.message : err)
    }

    const durationMs = Date.now() - startedAt
    console.log(`[recording-jobs] Done in ${durationMs}ms — processed=${stats.processed} succeeded=${stats.succeeded} retried=${stats.retried} failed=${stats.failed} cleaned=${stats.cleaned} stalePending=${stats.stalePendingRecovered} transRetries=${stats.transcriptionRetries}`)

    return NextResponse.json({ ok: true, durationMs, ...stats })
  } catch (err) {
    console.error('[recording-jobs] Fatal error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
