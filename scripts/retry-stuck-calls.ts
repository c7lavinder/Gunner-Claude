// scripts/retry-stuck-calls.ts
// One-time script to reset 6 stuck calls from April 13, 2026 and re-trigger grading.
// Run with: npx tsx scripts/retry-stuck-calls.ts

import { db } from '../lib/db/client'
import { gradeCall } from '../lib/ai/grading'

const stuckIds = [
  'cmnxg50ph08i7jc35pkgumvg6', // Daniel Lozano — Lorene Buckner (313s, PENDING)
  'cmnxf1do4083hjc35kkng950v', // Daniel Lozano — Laura Secayda (596s, PENDING)
  'cmnxdcea407c0jc35qeopml82', // Daniel Lozano — Jennifer Moore (46s, PENDING)
  'cmnxcivrg06vajc35f6etyo1z', // Chris Segura — Cherlyn Waller (65s, PENDING)
  'cmnxbcr4x062rjc35mroa7zpp', // Chris Segura — Jo Middleton (87s, PENDING)
  'cmnxayeoo05tyjc3579wa6yb0', // Chris Segura — Carol Papuchis (629s, FAILED transcription)
]

async function main() {
  console.log(`[retry-stuck] Resetting ${stuckIds.length} stuck calls...`)

  // Show current state before reset
  const before = await db.call.findMany({
    where: { id: { in: stuckIds } },
    select: {
      id: true,
      contactName: true,
      gradingStatus: true,
      durationSeconds: true,
      recordingUrl: true,
      transcript: true,
      aiSummary: true,
      createdAt: true,
    },
  })

  for (const call of before) {
    console.log(`  ${call.id}: ${call.contactName ?? 'Unknown'} | ${call.gradingStatus} | ${call.durationSeconds ?? 0}s | rec=${!!call.recordingUrl} | trans=${!!call.transcript} | summary=${(call.aiSummary ?? '').slice(0, 60)}`)
  }

  // Reset all to PENDING so gradeCall() picks them up fresh
  const result = await db.call.updateMany({
    where: { id: { in: stuckIds } },
    data: {
      gradingStatus: 'PENDING',
      aiSummary: null,
      aiFeedback: null,
    },
  })

  console.log(`\n[retry-stuck] Reset ${result.count} calls to PENDING`)

  // Also reset any associated recording fetch jobs so they can retry
  const jobReset = await db.recordingFetchJob.updateMany({
    where: {
      callId: { in: stuckIds },
      status: 'FAILED',
    },
    data: {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(Date.now() + 30_000), // retry in 30s
      lastError: null,
    },
  })
  if (jobReset.count > 0) {
    console.log(`[retry-stuck] Reset ${jobReset.count} recording fetch jobs`)
  }

  // Trigger grading for each call sequentially
  console.log(`\n[retry-stuck] Triggering gradeCall() for each...`)
  for (const id of stuckIds) {
    try {
      await gradeCall(id)
      const after = await db.call.findUnique({
        where: { id },
        select: { gradingStatus: true, score: true, aiSummary: true },
      })
      console.log(`  ✓ ${id}: ${after?.gradingStatus} | score=${after?.score ?? 'n/a'} | ${(after?.aiSummary ?? '').slice(0, 80)}`)
    } catch (err) {
      console.error(`  ✗ ${id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('\n[retry-stuck] Done.')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
