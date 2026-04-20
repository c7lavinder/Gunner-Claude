import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  const rows = await db.$queryRaw<Array<{ bucket: string; count: bigint }>>(Prisma.sql`
    SELECT
      CASE
        WHEN duration_seconds IS NULL AND recording_url IS NULL THEN 'null_no_rec'
        WHEN duration_seconds IS NULL AND recording_url IS NOT NULL THEN 'null_has_rec'
        WHEN duration_seconds = 0 AND recording_url IS NULL THEN 'zero_no_rec'
        WHEN duration_seconds = 0 AND recording_url IS NOT NULL THEN 'zero_has_rec'
        WHEN duration_seconds > 0 AND duration_seconds < 45 THEN 'short_lt45'
        WHEN duration_seconds >= 45 AND recording_url IS NOT NULL THEN 'gradeable_ge45_rec'
        WHEN duration_seconds >= 45 AND recording_url IS NULL THEN 'gradeable_ge45_no_rec'
        ELSE 'other'
      END AS bucket,
      COUNT(*)::bigint AS count
    FROM calls
    WHERE grading_status IN ('PENDING','FAILED')
      AND called_at >= NOW() - INTERVAL '30 days'
    GROUP BY bucket
    ORDER BY count DESC
  `)
  for (const r of rows) console.log(`  ${r.bucket.padEnd(22)} ${r.count}`)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
