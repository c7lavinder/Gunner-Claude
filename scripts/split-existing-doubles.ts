// Repair existing combined-address properties by splitting each into two.
// Uses splitCombinedAddressIfNeeded from lib/properties so the split logic is
// identical to the runtime path (POST, PATCH, GHL contact-change webhook).
//
// Run: npx tsx scripts/split-existing-doubles.ts
// Dry-run: npx tsx scripts/split-existing-doubles.ts --dry-run
import { PrismaClient } from '@prisma/client'
import { matchCombinedAddress, splitCombinedAddressIfNeeded } from '../lib/properties'

const db = new PrismaClient()
const DRY = process.argv.includes('--dry-run')

async function main() {
  const candidates = await db.property.findMany({
    select: { id: true, tenantId: true, address: true, city: true, state: true, ghlContactId: true },
  })
  const toSplit = candidates.filter(p => matchCombinedAddress(p.address) !== null)
  console.log(`${DRY ? '[DRY] ' : ''}Combined-address rows: ${toSplit.length}\n`)

  for (const p of toSplit) {
    const parts = matchCombinedAddress(p.address)!
    console.log(`${p.id}  "${p.address}"  ${p.city}, ${p.state}`)
    console.log(`  → ${parts.num1} ${parts.streetName}`)
    console.log(`  → ${parts.num2} ${parts.streetName}`)
    if (DRY) continue
    try {
      const result = await splitCombinedAddressIfNeeded(p.id, p.tenantId)
      if (result.splitInto) {
        console.log(`  ✓ split into ${result.splitInto[0]} + ${result.splitInto[1]}`)
      } else {
        console.log(`  ⚠ no split returned — already processed or address changed?`)
      }
    } catch (err) {
      console.error(`  ✗ failed:`, err instanceof Error ? err.message : err)
    }
    console.log('')
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
