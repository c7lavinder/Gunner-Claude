import { db } from '../lib/db/client'

async function main() {
  const rows = await db.call.findMany({
    where: { gradingStatus: 'FAILED' },
    orderBy: { calledAt: 'desc' },
    select: { id: true, durationSeconds: true, aiFeedback: true, calledAt: true, callOutcome: true, callResult: true },
  })
  for (const r of rows) {
    console.log(`\n=== ${r.calledAt?.toISOString().slice(0, 16)} dur=${r.durationSeconds}s outcome=${r.callOutcome} result=${r.callResult} id=${r.id.slice(0, 8)} ===`)
    console.log(r.aiFeedback ?? '-')
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
