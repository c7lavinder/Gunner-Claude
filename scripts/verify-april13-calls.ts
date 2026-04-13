// scripts/verify-april13-calls.ts
// One-time verification: check that all April 13 calls from CSVs exist in the DB
// Run with: npx tsx scripts/verify-april13-calls.ts

import { db } from '../lib/db/client'

// All calls ≥45s from the 3 CSVs (outbound only — CSVs don't include inbound)
const EXPECTED_GRADED = [
  { contact: 'Mickie Magunson', rep: 'Daniel Lozano', duration: 649 },
  { contact: 'Laura Secayda', rep: 'Daniel Lozano', duration: 596 },
  { contact: 'William Brannon', rep: 'Daniel Lozano', duration: 397 },
  { contact: 'Rhonda Adams', rep: 'Daniel Lozano', duration: 114 },
  { contact: 'Nandi Still', rep: 'Daniel Lozano', duration: 112 },
  { contact: 'Joe Barlow', rep: 'Daniel Lozano', duration: 59 },
  { contact: 'Ronald Hubbard', rep: 'Daniel Lozano', duration: 55 },
  { contact: 'Jennifer Moore', rep: 'Daniel Lozano', duration: 46 },
  { contact: 'Carol Papuchis', rep: 'Chris Segura', duration: 629 },
  { contact: 'Jacob Duty', rep: 'Chris Segura', duration: 155 },
  { contact: 'Subh Sarkar', rep: 'Chris Segura', duration: 131 },
  { contact: 'Jo Middleton', rep: 'Chris Segura', duration: 87 },
  { contact: 'Roderick Gunn', rep: 'Chris Segura', duration: 84 },
  { contact: 'Cherlyn Waller', rep: 'Chris Segura', duration: 65 },
  { contact: 'Leroy Herring', rep: 'Kyle Barks', duration: 311 },
]

async function main() {
  const today = new Date('2026-04-13T00:00:00-05:00') // Central time
  const tomorrow = new Date('2026-04-14T00:00:00-05:00')

  // Get all calls from today
  const allCalls = await db.call.findMany({
    where: {
      calledAt: { gte: today, lt: tomorrow },
      direction: 'OUTBOUND',
    },
    select: {
      id: true,
      contactName: true,
      durationSeconds: true,
      gradingStatus: true,
      recordingUrl: true,
      transcript: true,
      score: true,
      aiSummary: true,
      direction: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: { durationSeconds: 'desc' },
  })

  const inboundCalls = await db.call.count({
    where: { calledAt: { gte: today, lt: tomorrow }, direction: 'INBOUND' },
  })

  console.log(`\n=== April 13 Call Verification ===`)
  console.log(`Total outbound calls in DB: ${allCalls.length}`)
  console.log(`Total inbound calls in DB:  ${inboundCalls}`)
  console.log(`\nCalls by status:`)

  const statusCounts: Record<string, number> = {}
  for (const c of allCalls) {
    statusCounts[c.gradingStatus] = (statusCounts[c.gradingStatus] ?? 0) + 1
  }
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status}: ${count}`)
  }

  // Check each expected graded call
  console.log(`\n=== 15 Calls ≥45s (must be graded) ===`)
  let missing = 0
  let notGraded = 0

  for (const expected of EXPECTED_GRADED) {
    // Fuzzy match by contact name (case-insensitive, partial match)
    const match = allCalls.find(c =>
      c.contactName?.toLowerCase().includes(expected.contact.toLowerCase().split(' ')[1]) &&
      c.contactName?.toLowerCase().includes(expected.contact.toLowerCase().split(' ')[0])
    )

    if (!match) {
      console.log(`  MISSING  ${expected.contact} (${expected.rep}, ${expected.duration}s)`)
      missing++
    } else {
      const icon = match.gradingStatus === 'COMPLETED' ? '  OK    '
        : match.gradingStatus === 'PENDING' || match.gradingStatus === 'PROCESSING' ? '  WAIT  '
        : match.gradingStatus === 'FAILED' ? '  FAIL  '
        : match.gradingStatus === 'SKIPPED' ? '  SKIP  '
        : '  ???   '

      if (match.gradingStatus !== 'COMPLETED') notGraded++

      console.log(`${icon} ${expected.contact} (${expected.duration}s) → DB: ${match.durationSeconds ?? '?'}s | ${match.gradingStatus} | rec=${!!match.recordingUrl} | trans=${!!match.transcript} | score=${match.score ?? 'n/a'} | ${(match.aiSummary ?? '').slice(0, 50)}`)
    }
  }

  // Summary
  console.log(`\n=== Summary ===`)
  console.log(`Expected ≥45s calls:  15`)
  console.log(`Found in DB:          ${15 - missing}`)
  console.log(`Missing from DB:      ${missing}`)
  console.log(`Graded (COMPLETED):   ${15 - missing - notGraded}`)
  console.log(`Not yet graded:       ${notGraded}`)

  if (missing > 0) {
    console.log(`\n⚠️  ${missing} calls are MISSING from the database — the pipeline is not capturing them.`)
  }
  if (notGraded > 0) {
    console.log(`\n⚠️  ${notGraded} calls exist but are not COMPLETED — check the cron processor.`)
  }
  if (missing === 0 && notGraded === 0) {
    console.log(`\n✓ All 15 calls captured and graded. Pipeline is working.`)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
