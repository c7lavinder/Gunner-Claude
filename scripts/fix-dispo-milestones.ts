// scripts/fix-dispo-milestones.ts
// One-time fix: properties with IN_DISPOSITION status are missing acquisition milestones.
// The old dispo trigger overwrote status without creating acq milestones.
// This script:
//   1. Finds properties with dispo statuses
//   2. Restores their acq status to UNDER_CONTRACT (they entered dispo from there)
//   3. Creates missing LEAD + UNDER_CONTRACT milestones
// Run: npx tsx scripts/fix-dispo-milestones.ts

import { db } from '../lib/db/client'

async function fix() {
  const dispoStatuses = ['IN_DISPOSITION', 'DISPO_PUSHED', 'DISPO_OFFERS', 'DISPO_CONTRACTED', 'DISPO_CLOSED'] as const

  const props = await db.property.findMany({
    where: { status: { in: dispoStatuses as unknown as import('@prisma/client').PropertyStatus[] } },
    select: { id: true, address: true, status: true, tenantId: true },
  })

  console.log(`Found ${props.length} properties with dispo status`)

  for (const prop of props) {
    // Restore acquisition status to UNDER_CONTRACT
    // (all dispo properties came through acquisition — they were under contract)
    await db.property.update({
      where: { id: prop.id },
      data: { status: 'UNDER_CONTRACT' },
    })

    // Ensure LEAD milestone exists
    const hasLead = await db.propertyMilestone.findFirst({
      where: { propertyId: prop.id, type: 'LEAD' },
    })
    if (!hasLead) {
      await db.propertyMilestone.create({
        data: { tenantId: prop.tenantId, propertyId: prop.id, type: 'LEAD', source: 'AUTO_WEBHOOK' },
      })
      console.log(`  + LEAD milestone for ${prop.address}`)
    }

    // Ensure UNDER_CONTRACT milestone exists
    const hasContract = await db.propertyMilestone.findFirst({
      where: { propertyId: prop.id, type: 'UNDER_CONTRACT' },
    })
    if (!hasContract) {
      await db.propertyMilestone.create({
        data: { tenantId: prop.tenantId, propertyId: prop.id, type: 'UNDER_CONTRACT', source: 'AUTO_WEBHOOK' },
      })
      console.log(`  + UNDER_CONTRACT milestone for ${prop.address}`)
    }

    // Ensure DISPO_NEW milestone exists
    const hasDispo = await db.propertyMilestone.findFirst({
      where: { propertyId: prop.id, type: 'DISPO_NEW' },
    })
    if (!hasDispo) {
      await db.propertyMilestone.create({
        data: { tenantId: prop.tenantId, propertyId: prop.id, type: 'DISPO_NEW', source: 'AUTO_WEBHOOK' },
      })
      console.log(`  + DISPO_NEW milestone for ${prop.address}`)
    }

    console.log(`Fixed: ${prop.address} (was ${prop.status} → UNDER_CONTRACT + dispo milestones)`)
  }

  console.log('Done.')
  process.exit(0)
}

fix()
