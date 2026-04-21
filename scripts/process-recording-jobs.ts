// scripts/process-recording-jobs.ts
// Unified call processor — the SINGLE place where grading decisions happen.
// Runs every 1 minute via Railway cron, AND as one iteration of the
// grading-worker long-running service (see scripts/grading-worker.ts).
//
// Pipeline:
//   1. Webhook/poll creates call → PENDING (no grading, no classification)
//   2. This cron picks up PENDING calls and does ONE of:
//      a. <45s, no recording → SKIPPED
//      b. ≥45s → fetch recording → pass to gradeCall() (transcribes + grades)
//      c. No recording yet → keep retrying (every call in GHL is recorded)
//   3. Legacy: also drains any remaining RecordingFetchJob rows
//
// Export contract:
//   processJobs() returns on clean completion, throws on fatal error.
//   It does NOT call process.exit() — that's the caller's responsibility so
//   grading-worker can loop and the CLI entry point (below) can exit.

import { fileURLToPath } from 'url'
import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'
import { fetchCallRecording, fetchAndStoreRecording } from '../lib/ghl/fetch-recording'
import { gradeCall } from '../lib/ai/grading'
import { logFailure } from '../lib/audit'

const BATCH_SIZE = 50
const MIN_AGE_MS = 30 * 1000           // wait 30s before processing (GHL needs a moment)
const RECORDING_TIMEOUT_MS = 2 * 60 * 60 * 1000 // give up on recording after 2 hours
const MIN_DURATION_FOR_GRADING = 45

export async function processJobs() {
  const startedAt = Date.now()
  const stats = { pending: 0, graded: 0, skipped: 0, waiting: 0, timedOut: 0, legacyJobs: 0, errors: 0 }

  // Fix 2 (2026-04-20): Rescue rows stuck in PROCESSING > 5 min back to PENDING.
  // Happens when the worker is SIGTERM'd mid-grade (Railway redeploy, OOM, etc.)
  // or when gradeCall() throws in a path that bypasses the per-row catch.
  // PROCESSING is normally a 30–60s state; anything older is stuck and safe
  // to retry. Wrapped in catch so a rescue failure can't block real work.
  await db.call.updateMany({
    where: {
      gradingStatus: 'PROCESSING',
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { gradingStatus: 'PENDING' },
  }).catch(err => console.error('[rescue] PROCESSING reset failed:', err))

  // Fix 3 (2026-04-20): Auto-retry FAILED calls that HAVE a recording but
  // haven't been touched in > 1 hour. Targets transient failures (Anthropic
  // credit outage, Deepgram blip, network hiccup). Calls with no recording
  // stay FAILED — nothing to retry against. Flipping status to PENDING
  // updates updated_at, so a call that keeps failing won't re-retry in < 1hr.
  await db.call.updateMany({
    where: {
      gradingStatus: 'FAILED',
      recordingUrl: { not: null },
      updatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    data: { gradingStatus: 'PENDING' },
  }).catch(err => console.error('[rescue] FAILED reset failed:', err))

  // Heartbeat: fires BEFORE any real work so if the script imports and reaches
  // this line, we have proof the cron ran. Added after the 2026-04-20 outage
  // (cron went silent 04:43 UTC with zero audit trail). Health query:
  //   SELECT MAX(created_at) FROM audit_logs
  //   WHERE action='cron.process_recording_jobs.started';
  // If result > 2 minutes old, cron is not running.
  await db.auditLog.create({
    data: {
      tenantId: null,
      userId: null,
      action: 'cron.process_recording_jobs.started',
      resource: 'cron',
      resourceId: 'process-recording-jobs',
      severity: 'INFO',
      source: 'SYSTEM',
      payload: { startedAt: new Date().toISOString() },
    },
  }).catch(err => console.error('[heartbeat] audit write failed:', err))

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

        // Fix 1 (2026-04-20): NULL duration was slipping through Decision 1
        // (which gated on `duration !== null`) AND this zero check, then
        // reaching the grading pipeline. Transcription would often return
        // empty for no-answer calls, ending them as FAILED. Treat unknown
        // duration the same as zero — SKIPPED with no_answer.
        if (duration === null || duration === 0) {
          await db.call.update({
            where: { id: call.id },
            data: { gradingStatus: 'SKIPPED', aiSummary: 'No answer — zero or unknown duration.', callResult: 'no_answer' },
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

        // ── Decision 5: Has recording or transcript → grade ───────────────
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
      // Skip automation webhook jobs — wf_ IDs are synthetic and GHL rejects them
      if (job.ghlMessageId.startsWith('wf_')) {
        await db.recordingFetchJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', lastError: 'Automation webhook ID (wf_) — not a real GHL message' },
        })
        continue
      }

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

    // Legacy cleanup
    await db.recordingFetchJob.deleteMany({
      where: { status: 'DONE', updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }).catch(() => {})

    // ── Step 3: Catch-up deal intel extraction ────────────────────────────
    // Graded calls that have transcript + property but no deal intel yet.
    // Handles calls that were graded before property was linked.
    const { extractDealIntel } = await import('../lib/ai/extract-deal-intel')
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
  } catch (err) {
    console.error('[call-processor] Fatal error:', err instanceof Error ? err.message : err)
    // Re-throw so callers decide: the CLI entry point exits with code 1;
    // grading-worker logs and continues the loop after the 60s sleep.
    throw err
  }

  // Heartbeat: only fires on clean completion. Absence of a 'finished' row
  // after a 'started' row = processJobs() reached the try block but died
  // mid-run. The throw in the catch above intentionally skips this write.
  await db.auditLog.create({
    data: {
      tenantId: null,
      userId: null,
      action: 'cron.process_recording_jobs.finished',
      resource: 'cron',
      resourceId: 'process-recording-jobs',
      severity: 'INFO',
      source: 'SYSTEM',
      payload: {
        durationMs: Date.now() - startedAt,
        stats,
      },
    },
  }).catch(err => console.error('[heartbeat] audit write failed:', err))
}

// Entry-point guard — only auto-invokes when this file is the CLI entry point,
// not when imported by grading-worker.ts. Preserves the existing contract
// (`npx tsx scripts/process-recording-jobs.ts` still works exactly as before)
// while making `import { processJobs } from './process-recording-jobs'` side-effect-free.
const isMainModule = process.argv[1] ? process.argv[1] === fileURLToPath(import.meta.url) : false
if (isMainModule) {
  processJobs()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
