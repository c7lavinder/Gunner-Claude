// scripts/seed-markets.ts — Seeds markets from crm.config.ts
// Run: railway run npx tsx scripts/seed-markets.ts
import { PrismaClient } from '@prisma/client'
import { MARKETS } from '../lib/config/crm.config'

const db = new PrismaClient()

async function main() {
  // Get the first tenant (New Again Houses)
  const tenant = await db.tenant.findFirst()
  if (!tenant) { console.error('No tenant found'); return }

  console.log(`Seeding markets for tenant: ${tenant.name} (${tenant.id})`)

  for (const [name, config] of Object.entries(MARKETS)) {
    const zips = [...config.zips] as string[]

    // Upsert: update if exists, create if not
    const existing = await db.market.findFirst({
      where: { tenantId: tenant.id, name },
    })

    if (existing) {
      await db.market.update({
        where: { id: existing.id },
        data: { zipCodes: zips },
      })
      console.log(`  Updated: ${name} (${zips.length} zips)`)
    } else {
      await db.market.create({
        data: { tenantId: tenant.id, name, zipCodes: zips },
      })
      console.log(`  Created: ${name} (${zips.length} zips)`)
    }
  }

  console.log('Done!')
  await db.$disconnect()
}

main()
