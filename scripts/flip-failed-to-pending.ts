import { db } from '../lib/db/client'

async function main() {
  const res = await db.call.updateMany({
    where: { gradingStatus: 'FAILED' },
    data: { gradingStatus: 'PENDING', aiFeedback: null },
  })
  console.log(`Flipped ${res.count} FAILED → PENDING for cron re-grade`)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
