// app/api/cron/process-recording-jobs/route.ts
// Unified call processor — the SINGLE place where grading decisions happen.
// Runs every 1 minute via Railway cron.
//
// Pipeline:
//   1. Webhook/poll creates call → PENDING (no grading, no classification)
//   2. This cron picks up PENDING calls and does ONE of:
//      a. <45s, no recording → SKIPPED
//      b. ≥45s → fetch recording → pass to gradeCall() (transcribes + grades)
//      c. No recording yet → keep retrying (every call in GHL is recorded)
//   3. Legacy: also drains any remaining RecordingFetchJob rows

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { fetchCallRecording, fetchAndStoreRecording } from '@/lib/ghl/fetch-recording'
import { gradeCall } from '@/lib/ai/grading'
import { logFailure } from '@/lib/audit'

const BATCH_SIZE = 50
const MIN_AGE_MS = 30 * 1000           // wait 30s before processing (GHL needs a moment)
const RECORDING_TIMEOUT_MS = 2 * 60 * 60 * 1000 // give up on recording after 2 hours
const MIN_DURATION_FOR_GRADING = 45

export async function POST() {
  return processJobs()
}

export async function GET() {
  return processJobs()
}

async function processJobs() {
  const startedAt = Date.now()
  const stats = { pending: 0, graded: 0, skipped: 0, waiting: 0, timedOut: 0, legacyJobs: 0, errors: 0 }

  try {
    // ── Step 0: Link unlinked calls to properties BEFORE grading ──────────
    // Must run first so gradeCall() sees propertyId for deal intel extraction.
    await db.$executeRaw`
      UPDATE calls SET property_id = p.id
      FROM properties p
      WHERE calls.ghl_contact_id = p.ghl_contact_id
      AND calls.property_id IS NULL
      AND calls.ghl_contact_id IS NOT NULL
    `.catch(() => {})

    // ── Step 1: Process PENDING calls ──────────────────────────────────────
    const pendingCalls = await db.call.findMany({
      where: {
        gradingStatus: 'PENDING',
        createdAt: { lt: new Date(Date.now() - MIN_AGE_MS) },
      },
      include: {
        tenant: { select: { id: true, ghlAccessToken: true, ghlLocationId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    })

    stats.pending = pendingCalls.length

    for (const call of pendingCalls) {
      // Atomically claim this call so parallel cron runs don't double-process
      const claimed = await db.call.updateMany({
        where: { id: call.id, gradingStatus: 'PENDING' },
        data: { gradingStatus: 'PROCESSING' },
      })
      if (claimed.count === 0) continue

      try {
        const duration = call.durationSeconds
        const ageMs = Date.now() - call.createdAt.getTime()

        // ── Decision 1: Known short call or no-answer → SKIPPED ───────────
        if (duration !== null && duration > 0 && duration < MIN_DURATION_FOR_GRADING) {
          await db.call.update({
            where: { id: call.id },
            data: { gradingStatus: 'SKIPPED', aiSummary: `Short call (${duration}s) — skipped.`, callResult: 'short_call' },
          })
          stats.skipped++
          continue
        }

        if (duration === 0) {
          await db.call.update({
            where: { id: call.id },
            data: { gradingStatus: 'SKIPPED', aiSummary: 'No answer — zero duration.', callResult: 'no_answer' },
          })
          stats.skipped++
          continue
        }

        // ── Decision 2: wf_ IDs can never fetch recordings — skip immediately ──
        if (!call.recordingUrl && call.ghlCallId?.startsWith('wf_')) {
          await db.call.update({
            where: { id: call.id },
            data: { gradingStatus: 'SKIPPED', aiSummary: 'Automation duplicate — real call graded separately.' },
          })
          stats.skipped++
          continue
        }

        // ── Decision 3: Try to fetch recording if we don't have one ───────
        if (!call.recordingUrl && call.ghlCallId && call.tenant?.ghlAccessToken && call.tenant?.ghlLocationId) {
          try {
            const rec = await fetchCallRecording(call.tenant.ghlAccessToken, call.tenant.ghlLocationId, call.ghlCallId)
            if (rec.status === 'success' && rec.recordingUrl) {
              await db.call.update({ where: { id: call.id }, data: { recordingUrl: rec.recordingUrl } })
              call.recordingUrl = rec.recordingUrl
              console.log(`[call-processor] Recording fetched for call ${call.id}`)
            } else {
              console.log(`[call-processor] No recording yet for call ${call.id} (${rec.status}: ${rec.error ?? 'n/a'})`)
            }
          } catch (fetchErr) {
            console.warn(`[call-processor] Recording fetch error for ${call.id}:`, fetchErr instanceof Error ? fetchErr.message : fetchErr)
          }
        }

        // ── Decision 4: No recording yet → keep trying ───────────────────
        // Every call in GHL is recorded. No recording = our fetch hasn't worked yet.
        if (!call.recordingUrl && !call.transcript) {
          await db.call.update({
            where: { id: call.id },
            data: { gradingStatus: 'PENDING' },
          })
          stats.waiting++
          if (ageMs > RECORDING_TIMEOUT_MS) {
            console.warn(`[call-processor] Call ${call.id} (${call.contactName ?? 'Unknown'}) still has no recording after ${Math.round(ageMs / 60_000)} min — will keep retrying`)
          }
          continue
        }

        // ── Decision 4: Has recording or transcript → grade ───────────────
        await gradeCall(call.id)
        stats.graded++

      } catch (err) {
        // On unexpected error, revert to PENDING for retry next cycle
        await db.call.update({
          where: { id: call.id },
          data: { gradingStatus: 'PENDING' },
        }).catch(() => {})
        stats.errors++
        console.error(`[call-processor] Error processing call ${call.id}:`, err instanceof Error ? err.message : err)
      }
    }

    // ── Step 2: Legacy — drain remaining RecordingFetchJob rows ───────────
    // These were created by the old webhook pipeline. Process them, then they
    // get cleaned up. New calls don't create these jobs anymore.
    const legacyJobs = await db.recordingFetchJob.findMany({
      where: {
        status: 'PENDING',
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: 5 },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 10,
    })

    for (const job of legacyJobs) {
      try {
        await fetchAndStoreRecording(job.callId, job.ghlMessageId)
        await db.recordingFetchJob.update({
          where: { id: job.id },
          data: { status: 'DONE', lastError: null },
        })
        stats.legacyJobs++
      } catch (err) {
        const newAttempts = job.attempts + 1
        const errMsg = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)
        if (newAttempts >= 5) {
          await db.recordingFetchJob.update({
            where: { id: job.id },
            data: { status: 'FAILED', attempts: newAttempts, lastError: errMsg },
          })
        } else {
          await db.recordingFetchJob.update({
            where: { id: job.id },
            data: { attempts: newAttempts, nextAttemptAt: new Date(Date.now() + Math.pow(2, newAttempts - 1) * 60_000), lastError: errMsg },
          })
        }
      }
    }

    // Legacy cleanup: delete old DONE jobs
    await db.recordingFetchJob.deleteMany({
      where: { status: 'DONE', updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }).catch(() => {})

    // ── Step 3: Catch-up deal intel extraction ────────────────────────────
    // Graded calls that have transcript + property but no deal intel yet.
    // Handles calls that were graded before property was linked.
    const { extractDealIntel } = await import('@/lib/ai/extract-deal-intel')
    const missingIntel = await db.call.findMany({
      where: {
        gradingStatus: 'COMPLETED',
        transcript: { not: null },
        propertyId: { not: null },
        dealIntelHistory: { equals: Prisma.DbNull },
        durationSeconds: { gte: 45 },
      },
      select: { id: true, contactName: true },
      orderBy: { gradedAt: 'desc' },
      take: 5,
    })
    for (const call of missingIntel) {
      try {
        await extractDealIntel(call.id)
        console.log(`[call-processor] Deal intel extracted for ${call.contactName ?? call.id}`)
      } catch (err) {
        console.warn(`[call-processor] Deal intel failed for ${call.id}:`, err instanceof Error ? err.message : err)
      }
    }

    const durationMs = Date.now() - startedAt
    console.log(`[call-processor] ${durationMs}ms | pending=${stats.pending} graded=${stats.graded} skipped=${stats.skipped} waiting=${stats.waiting} timedOut=${stats.timedOut} legacy=${stats.legacyJobs} errors=${stats.errors}`)

    return NextResponse.json({ ok: true, durationMs, ...stats })
  } catch (err) {
    console.error('[call-processor] Fatal error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
