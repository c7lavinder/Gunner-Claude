import { db } from '../lib/db/client'
async function main() {
  const res = await db.call.updateMany({
    where: { gradingStatus: 'PROCESSING' },
    data: { gradingStatus: 'PENDING' },
  })
  console.log(`Reset ${res.count} PROCESSING calls back to PENDING`)
  await db.$disconnect()
}
main()
