// scripts/reset-april13-calls.ts
// Reset April 13 FAILED calls back to PENDING so the new cron processor picks them up.
// Run with: npx tsx scripts/reset-april13-calls.ts

import { db } from '../lib/db/client'

async function main() {
  const today = new Date('2026-04-13T00:00:00-05:00')
  const tomorrow = new Date('2026-04-14T00:00:00-05:00')

  // Find all FAILED calls from today that have duration ≥45s OR have a recording
  // These should NOT be failed — they need to go through the new pipeline
  const stuck = await db.call.findMany({
    where: {
      calledAt: { gte: today, lt: tomorrow },
      gradingStatus: 'FAILED',
      OR: [
        { durationSeconds: { gte: 45 } },
        { recordingUrl: { not: null } },
      ],
    },
    select: {
      id: true,
      contactName: true,
      durationSeconds: true,
      recordingUrl: true,
      ghlCallId: true,
      gradingStatus: true,
      aiSummary: true,
      assignedTo: { select: { name: true } },
    },
  })

  console.log(`Found ${stuck.length} FAILED calls that should be reprocessed:\n`)

  for (const c of stuck) {
    console.log(`  ${c.contactName ?? 'Unknown'} | ${c.durationSeconds ?? '?'}s | rec=${!!c.recordingUrl} | ghlId=${c.ghlCallId ?? 'none'} | ${(c.aiSummary ?? '').slice(0, 50)}`)
  }

  if (stuck.length === 0) {
    console.log('No stuck calls found — all good!')
    process.exit(0)
  }

  // Reset to PENDING
  const result = await db.call.updateMany({
    where: { id: { in: stuck.map(c => c.id) } },
    data: {
      gradingStatus: 'PENDING',
      aiSummary: null,
      aiFeedback: null,
      callResult: null,
    },
  })

  console.log(`\nReset ${result.count} calls to PENDING.`)
  console.log(`The cron processor will now pick them up and:`)
  console.log(`  - Calls with recording → transcribe → grade`)
  console.log(`  - Calls without recording → fetch from GHL → transcribe → grade`)
  console.log(`  - Calls with null duration → the cron handles this (doesn't skip null duration)`)

  process.exit(0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
