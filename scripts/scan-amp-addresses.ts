#!/usr/bin/env -S npx tsx
// Throwaway diagnostic — scan all Property rows for '&' in address.
import { db } from '../lib/db/client'

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } })
  for (const t of tenants) {
    const ampInAddr = await db.property.findMany({
      where: { tenantId: t.id, address: { contains: '&' } },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        marketId: true,
        acqStatus: true,
        dispoStatus: true,
        longtermStatus: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    console.log(`\n[${t.slug}] ${ampInAddr.length} properties with '&' in address`)
    for (const r of ampInAddr) {
      console.log(
        `  ${r.id.slice(0, 10)}… | ${r.address} | ${r.city ?? ''} | ${r.state ?? ''} | ${r.zip ?? ''} | mkt=${r.marketId ? 'set' : 'NULL'} | acq=${r.acqStatus} dispo=${r.dispoStatus} lt=${r.longtermStatus}`
      )
    }
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
