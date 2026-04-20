import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  const recentGrades = await db.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint as count FROM calls
    WHERE graded_at >= NOW() - INTERVAL '1 hour'
  `)
  console.log(`Graded in last 1h: ${recentGrades[0].count}`)

  const counts = await db.$queryRaw<{ grading_status: string; count: bigint }[]>(
    Prisma.sql`SELECT grading_status::text as grading_status, COUNT(*)::bigint as count FROM calls WHERE called_at >= NOW() - INTERVAL '30 days' GROUP BY grading_status ORDER BY count DESC`
  )
  console.log('\nStatus counts (last 30d):')
  for (const c of counts) console.log(`  ${c.grading_status}: ${c.count}`)

  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
