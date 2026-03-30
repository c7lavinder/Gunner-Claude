// scripts/fix-dispo-milestones.ts
// One-time fix: properties with dispo statuses may be missing acquisition milestones.
// This script ensures LEAD + UNDER_CONTRACT + DISPO_NEW milestones exist
// WITHOUT changing the status field (status stays as-is — dispo status is correct).
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

    console.log(`OK: ${prop.address} (status: ${prop.status}, milestones ensured)`)
  }

  console.log('Done.')
  process.exit(0)
}

fix()
