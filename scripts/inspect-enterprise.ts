// Inspect 2716 & 2720 Enterprise Ave and why it wasn't auto-split.
// Also lists any other combined-address rows in the system.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const MULTI_ADDRESS_RE = /^(\d+)\s*[&\/,]\s*(\d+)\s+(.+)$/

async function main() {
  const enterprise = await db.property.findMany({
    where: { address: { contains: 'Enterprise', mode: 'insensitive' } },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      acqStatus: true, dispoStatus: true, longtermStatus: true,
      ghlContactId: true,
      ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
      ghlAcqStageName: true, ghlDispoStageName: true, ghlLongtermStageName: true,
      createdAt: true, leadSource: true, assignedToId: true,
    },
  })
  console.log(`Enterprise matches: ${enterprise.length}`)
  for (const p of enterprise) {
    console.log(`\n  ${p.id}`)
    console.log(`  address=${p.address}`)
    console.log(`  city=${p.city} state=${p.state} zip=${p.zip}`)
    console.log(`  acqStatus=${p.acqStatus ?? '—'} dispoStatus=${p.dispoStatus ?? '—'} longtermStatus=${p.longtermStatus ?? '—'}`)
    console.log(`  ghlContactId=${p.ghlContactId ?? '—'}  acqStage=${p.ghlAcqStageName ?? '—'}  dispoStage=${p.ghlDispoStageName ?? '—'}  longtermStage=${p.ghlLongtermStageName ?? '—'}`)
    console.log(`  leadSource=${p.leadSource ?? '—'}  created=${p.createdAt.toISOString()}`)
    console.log(`  sellers + audit trail:`)

    const sellers = await db.propertySeller.findMany({
      where: { propertyId: p.id },
      include: { seller: { select: { id: true, name: true, phone: true, ghlContactId: true } } },
    })
    for (const s of sellers) {
      console.log(`    seller: ${s.seller.name} phone=${s.seller.phone ?? '—'} ghlContactId=${s.seller.ghlContactId ?? '—'} primary=${s.isPrimary}`)
    }

    const audits = await db.auditLog.findMany({
      where: {
        OR: [
          { resourceId: p.id },
          { payload: { path: ['propertyId'], equals: p.id } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, action: true, source: true, payload: true },
      take: 10,
    })
    for (const a of audits) {
      const snippet = a.payload ? JSON.stringify(a.payload).slice(0, 140) : '—'
      console.log(`    ${a.createdAt.toISOString()} ${a.action} (${a.source}) ${snippet}`)
    }
  }

  // Check ALL properties for any uncaught combined-address pattern
  console.log('\n\nScanning all properties for combined-address patterns that the splitter would match...')
  const all = await db.property.findMany({
    select: { id: true, address: true, city: true, state: true, ghlContactId: true, createdAt: true },
  })
  const matches = all.filter(p => MULTI_ADDRESS_RE.test(p.address))
  console.log(`Combined-address rows currently in DB: ${matches.length}`)
  for (const p of matches) {
    console.log(`  ${p.id}  "${p.address}"  ${p.city},${p.state}  contactId=${p.ghlContactId ?? '—'}  created=${p.createdAt.toISOString().slice(0, 10)}`)
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
