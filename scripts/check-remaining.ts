import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  for (const [label, where] of [
    ['today', `called_at >= date_trunc('day', NOW())`],
    ['last 24h', `called_at >= NOW() - INTERVAL '24 hours'`],
    ['last 7d', `called_at >= NOW() - INTERVAL '7 days'`],
    ['last 30d', `called_at >= NOW() - INTERVAL '30 days'`],
  ] as const) {
    const r = await db.$queryRawUnsafe<{ grading_status: string; count: bigint }[]>(
      `SELECT grading_status::text as grading_status, COUNT(*)::bigint as count FROM calls WHERE ${where} GROUP BY grading_status ORDER BY count DESC`
    )
    console.log(`--- ${label} ---`)
    for (const x of r) console.log(`  ${x.grading_status}: ${x.count}`)
  }

  console.log('\n=== Current PENDING + FAILED (all time) ===')
  const rows = await db.$queryRaw<Array<{
    id: string; grading_status: string; duration_seconds: number | null;
    recording_url: string | null; transcript: string | null;
    ai_feedback: string | null; called_at: Date | null; ghl_call_id: string | null;
  }>>(Prisma.sql`
    SELECT id, grading_status::text as grading_status, duration_seconds,
           recording_url, transcript, ai_feedback, called_at, ghl_call_id
    FROM calls
    WHERE grading_status IN ('PENDING','FAILED','PROCESSING')
    ORDER BY called_at DESC NULLS LAST
    LIMIT 30
  `)
  for (const c of rows) {
    console.log(`${c.called_at?.toISOString().slice(0, 16) ?? '?'} ${c.grading_status.padEnd(10)} dur=${c.duration_seconds ?? '?'}s rec=${c.recording_url ? 'Y' : 'N'} trans=${c.transcript ? 'Y' : 'N'} ghl=${c.ghl_call_id?.slice(0, 12) ?? '-'} id=${c.id.slice(0, 8)}`)
    if (c.ai_feedback) console.log(`   feedback: ${c.ai_feedback.slice(0, 200)}`)
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
