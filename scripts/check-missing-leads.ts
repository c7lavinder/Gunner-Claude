// Check which properties created today are missing LEAD milestones
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Search for the 8 addresses the user listed
  const searchTerms = ['Ryecroft', 'longcrest', 'village', 'Carefree', 'Harriette', 'Grayson', 'Holly Hills', 'Ashlawn']

  for (const term of searchTerms) {
    const props = await db.property.findMany({
      where: { address: { contains: term, mode: 'insensitive' } },
      select: { id: true, address: true, createdAt: true, status: true },
    })

    for (const p of props) {
      const milestones = await db.propertyMilestone.findMany({
        where: { propertyId: p.id, type: 'LEAD' },
        select: { id: true, createdAt: true, source: true },
      })
      const hasLead = milestones.length > 0
      console.log(`${hasLead ? '✓' : '✗'} ${p.address} — created ${p.createdAt.toISOString().slice(0,10)} — ${milestones.length} LEAD milestone(s)${milestones.length > 0 ? ` (${milestones[0].source}, ${milestones[0].createdAt.toISOString()})` : ''}`)
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect())
