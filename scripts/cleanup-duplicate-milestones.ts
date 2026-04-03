// One-time script: remove duplicate LEAD milestones, keep earliest per property
// Run with: npx tsx scripts/cleanup-duplicate-milestones.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Find all LEAD milestones grouped by property
  const allLeads = await db.propertyMilestone.findMany({
    where: { type: 'LEAD' },
    orderBy: { createdAt: 'asc' },
    include: { property: { select: { address: true } } },
  })

  // Group by propertyId
  const byProperty = new Map<string, typeof allLeads>()
  for (const m of allLeads) {
    const list = byProperty.get(m.propertyId) ?? []
    list.push(m)
    byProperty.set(m.propertyId, list)
  }

  // Find duplicates (properties with more than 1 LEAD milestone)
  const toDelete: string[] = []
  for (const [propId, milestones] of byProperty) {
    if (milestones.length > 1) {
      // Keep the first, delete the rest
      const [keep, ...dupes] = milestones
      console.log(`${keep.property.address}: keeping 1, deleting ${dupes.length} duplicate(s)`)
      toDelete.push(...dupes.map(d => d.id))
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicate LEAD milestones found.')
  } else {
    console.log(`\nDeleting ${toDelete.length} duplicate LEAD milestones...`)
    const result = await db.propertyMilestone.deleteMany({
      where: { id: { in: toDelete } },
    })
    console.log(`Deleted ${result.count} duplicates.`)
  }

  // Show final count for today (Central time)
  const totalLeads = await db.propertyMilestone.count({ where: { type: 'LEAD' } })
  console.log(`\nTotal LEAD milestones remaining: ${totalLeads}`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
