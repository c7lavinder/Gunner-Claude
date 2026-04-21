// lib/grading-processor.ts
// The single processor that walks PENDING calls and grades them.
// Called by:
//   - app/api/cron/process-recording-jobs/route.ts  (external cron / manual trigger)
//   - instrumentation.ts startGradingWorker() loop   (self-driving, always running)

import { db } from '@/lib/db/client'
import { Prisma } from '@prisma/client'
import { fetchCallRecording, fetchAndStoreRecording } from '@/lib/ghl/fetch-recording'
import { gradeCall } from '@/lib/ai/grading'

const BATCH_SIZE = 50
const MIN_AGE_MS = 30 * 1000
const RECORDING_TIMEOUT_MS = 2 * 60 * 60 * 1000
const MIN_DURATION_FOR_GRADING = 45

export interface ProcessorStats {
  pending: number
  graded: number
  skipped: number
  waiting: number
  timedOut: number
  legacyJobs: number
  errors: number
  durationMs: number
}

export async function runGradingProcessor(): Promise<ProcessorStats> {
  const startedAt = Date.now()
  const stats = { pending: 0, graded: 0, skipped: 0, waiting: 0, timedOut: 0, legacyJobs: 0, errors: 0, durationMs: 0 }

  await db.auditLog.create({
    data: {
      tenantId: null,
      action: 'cron.process_recording_jobs.started',
      resource: 'system',
      source: 'SYSTEM',
      severity: 'INFO',
    },
  }).catch(() => {})

  try {
    // Step 0: Link unlinked calls to properties before grading
    await db.$executeRaw`
      UPDATE calls SET property_id = p.id
      FROM properties p
      WHERE calls.ghl_contact_id = p.ghl_contact_id
      AND calls.property_id IS NULL
      AND calls.ghl_contact_id IS NOT NULL
    `.catch(() => {})

    // Step 1: Process PENDING calls
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
      // Atomic claim to prevent double-processing when multiple loops overlap
      const claimed = await db.call.updateMany({
        where: { id: call.id, gradingStatus: 'PENDING' },
        data: { gradingStatus: 'PROCESSING' },
      })
      if (claimed.count === 0) continue

      try {
        const duration = call.durationSeconds
        const ageMs = Date.now() - call.createdAt.getTime()

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

        if (!call.recordingUrl && call.ghlCallId?.startsWith('wf_')) {
          await db.call.update({
            where: { id: call.id },
            data: { gradingStatus: 'SKIPPED', aiSummary: 'Automation duplicate — real call graded separately.' },
          })
          stats.skipped++
          continue
        }

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

        await gradeCall(call.id)
        stats.graded++

      } catch (err) {
        await db.call.update({
          where: { id: call.id },
          data: { gradingStatus: 'PENDING' },
        }).catch(() => {})
        stats.errors++
        console.error(`[call-processor] Error processing call ${call.id}:`, err instanceof Error ? err.message : err)
      }
    }

    // Step 2: Drain legacy RecordingFetchJob rows
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

    await db.recordingFetchJob.deleteMany({
      where: { status: 'DONE', updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }).catch(() => {})

    // Step 3: Catch-up deal intel extraction
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

    stats.durationMs = Date.now() - startedAt
    console.log(`[call-processor] ${stats.durationMs}ms | pending=${stats.pending} graded=${stats.graded} skipped=${stats.skipped} waiting=${stats.waiting} legacy=${stats.legacyJobs} errors=${stats.errors}`)

    await db.auditLog.create({
      data: {
        tenantId: null,
        action: 'cron.process_recording_jobs.finished',
        resource: 'system',
        source: 'SYSTEM',
        severity: 'INFO',
        payload: { ...stats } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => {})

    return stats
  } catch (err) {
    console.error('[call-processor] Fatal error:', err instanceof Error ? err.message : err)
    await db.auditLog.create({
      data: {
        tenantId: null,
        action: 'cron.process_recording_jobs.failed',
        resource: 'system',
        source: 'SYSTEM',
        severity: 'ERROR',
        payload: { error: err instanceof Error ? err.message : String(err) } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => {})
    stats.durationMs = Date.now() - startedAt
    return stats
  }
}
