// Check today's LEAD milestones in Central time
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Get Central time today boundaries
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  const noon = new Date(`${parts}T12:00:00Z`)
  const centralNoon = new Date(noon.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const offsetMs = noon.getTime() - centralNoon.getTime()
  const dayStart = new Date(`${parts}T00:00:00Z`)
  dayStart.setTime(dayStart.getTime() + offsetMs)
  const dayEnd = new Date(`${parts}T23:59:59.999Z`)
  dayEnd.setTime(dayEnd.getTime() + offsetMs)

  console.log(`Central date: ${parts}`)
  console.log(`Day range (UTC): ${dayStart.toISOString()} → ${dayEnd.toISOString()}`)

  const leads = await db.propertyMilestone.findMany({
    where: { type: 'LEAD', createdAt: { gte: dayStart, lte: dayEnd } },
    include: { property: { select: { address: true } } },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\nLEAD milestones for today: ${leads.length}`)
  for (const l of leads) {
    console.log(`  ${l.property.address} — ${l.source} — ${l.createdAt.toISOString()}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
