import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  // PROCESSING rows left over from interrupted grade attempts
  const procShort = await db.$executeRaw`
    UPDATE calls
    SET grading_status = 'SKIPPED',
        call_result = 'short_call',
        ai_summary = 'Short call (' || duration_seconds || 's) — skipped.',
        ai_feedback = NULL
    WHERE grading_status = 'PROCESSING'
      AND duration_seconds > 0
      AND duration_seconds < 45
  `
  console.log(`PROCESSING <45s → SKIPPED: ${procShort}`)

  const procBack = await db.$executeRaw`
    UPDATE calls
    SET grading_status = 'PENDING'
    WHERE grading_status = 'PROCESSING'
      AND (duration_seconds IS NULL OR duration_seconds >= 45)
  `
  console.log(`PROCESSING ≥45s/null → PENDING (for cron retry): ${procBack}`)

  // Surface the remaining FAILED rows + their error reasons
  const failed = await db.$queryRaw<Array<{
    id: string; duration_seconds: number | null;
    ai_feedback: string | null; called_at: Date | null;
  }>>(Prisma.sql`
    SELECT id, duration_seconds, ai_feedback, called_at
    FROM calls
    WHERE grading_status = 'FAILED'
    ORDER BY called_at DESC
  `)
  console.log(`\n=== ${failed.length} FAILED rows remaining ===`)
  for (const f of failed) {
    console.log(`${f.called_at?.toISOString().slice(0, 16)} dur=${f.duration_seconds}s id=${f.id.slice(0, 8)}`)
    console.log(`  ${f.ai_feedback?.slice(0, 240) ?? '-'}`)
    console.log('')
  }

  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
