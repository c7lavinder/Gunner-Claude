import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  const hist = await db.$queryRaw<Array<{ bucket: string; count: bigint }>>(Prisma.sql`
    SELECT
      CASE
        WHEN duration_seconds > 0 AND duration_seconds < 45 THEN 'lt45_graded'
        WHEN duration_seconds = 0 THEN 'zero_graded'
        WHEN duration_seconds IS NULL THEN 'null_graded'
        ELSE 'ge45_graded'
      END AS bucket,
      COUNT(*)::bigint AS count
    FROM calls
    WHERE grading_status = 'COMPLETED'
    GROUP BY bucket
    ORDER BY count DESC
  `)
  console.log('Historical COMPLETED distribution:')
  for (const r of hist) console.log(`  ${r.bucket.padEnd(14)} ${r.count}`)

  const sample = await db.$queryRaw<Array<{ id: string; duration_seconds: number | null; score: number | null; called_at: Date | null }>>(Prisma.sql`
    SELECT id, duration_seconds, score, called_at
    FROM calls
    WHERE grading_status = 'COMPLETED' AND duration_seconds > 0 AND duration_seconds < 45
    ORDER BY called_at DESC
    LIMIT 10
  `)
  console.log('\nSample of graded-but-short calls (worst offenders):')
  for (const r of sample) console.log(`  ${r.called_at?.toISOString().slice(0, 16)} dur=${r.duration_seconds}s score=${r.score} id=${r.id.slice(0, 8)}`)

  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
