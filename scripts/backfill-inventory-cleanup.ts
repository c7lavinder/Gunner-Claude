// One-shot backfill for the inventory-page cleanup session.
//
//   (1) Populate `stageEnteredAt` for every property that currently has it null.
//       Uses the latest milestone createdAt; falls back to the property's
//       createdAt for rows with no milestones (e.g., FOLLOW_UP / DEAD leads
//       that never generated a transition row).
//   (2) Assign the "Global" catch-all market to any property that has zip set
//       but marketId null. Uses the resolveMarketForZip helper so the tiered
//       lookup (tenant markets → config MARKETS → Global) is applied.
//   (3) Repair 1908 Breezy Ridge Trl: status flips from IN_DISPOSITION →
//       UNDER_CONTRACT. dispoStatus stays DISPO_CONTRACTED.
//
// Run: npx tsx scripts/backfill-inventory-cleanup.ts
// Dry-run: npx tsx scripts/backfill-inventory-cleanup.ts --dry-run
import { PrismaClient } from '@prisma/client'
import { resolveMarketForZip } from '../lib/properties'

const db = new PrismaClient()
const DRY = process.argv.includes('--dry-run')

function header(label: string) {
  console.log('\n' + '─'.repeat(72))
  console.log(`${DRY ? '[DRY] ' : ''}${label}`)
  console.log('─'.repeat(72))
}

async function main() {
  // ── Step 1 — backfill stageEnteredAt ────────────────────────────────────
  header('Step 1 — backfill stageEnteredAt for properties where it is null')
  const needsBackfill = await db.property.findMany({
    where: { stageEnteredAt: null },
    select: {
      id: true, address: true, createdAt: true,
      milestones: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    },
  })
  console.log(`Candidates: ${needsBackfill.length}`)
  let fromMilestone = 0
  let fromCreatedAt = 0
  for (const p of needsBackfill) {
    const anchor = p.milestones[0]?.createdAt ?? p.createdAt
    if (p.milestones[0]) fromMilestone++; else fromCreatedAt++
    if (!DRY) {
      await db.property.update({
        where: { id: p.id },
        data: { stageEnteredAt: anchor },
      })
    }
  }
  console.log(`  Source=latest milestone: ${fromMilestone}`)
  console.log(`  Source=createdAt fallback: ${fromCreatedAt}`)

  // ── Step 2 — assign markets to zip-but-no-market rows ───────────────────
  header('Step 2 — resolve markets for properties with zip but no marketId')
  const noMarket = await db.property.findMany({
    where: { marketId: null, zip: { not: '' } },
    select: { id: true, tenantId: true, address: true, zip: true },
  })
  console.log(`Candidates: ${noMarket.length}`)
  let assigned = 0, stillNull = 0
  for (const p of noMarket) {
    if (DRY) {
      console.log(`  (dry) ${p.address} zip=${p.zip}`)
      continue
    }
    const marketId = await resolveMarketForZip(p.tenantId, p.zip)
    if (marketId) {
      await db.property.update({ where: { id: p.id }, data: { marketId } })
      assigned++
    } else {
      stillNull++
      console.log(`  WARN: could not resolve market for ${p.address} (zip=${p.zip})`)
    }
  }
  if (!DRY) console.log(`  Assigned: ${assigned}  Still null: ${stillNull}`)

  // ── Step 3 — repair 1908 Breezy Ridge Trl ────────────────────────────────
  header('Step 3 — repair 1908 Breezy Ridge Trl')
  const breezy = await db.property.findFirst({
    where: { address: { contains: 'Breezy Ridge', mode: 'insensitive' } },
    select: { id: true, address: true, status: true, dispoStatus: true },
  })
  if (!breezy) {
    console.log('  No matching property. Skipping.')
  } else {
    console.log(`  Before: ${breezy.address}  status=${breezy.status}  dispoStatus=${breezy.dispoStatus}`)
    if (breezy.status === 'IN_DISPOSITION') {
      if (!DRY) {
        await db.property.update({
          where: { id: breezy.id },
          data: { status: 'UNDER_CONTRACT' },
        })
        await db.auditLog.create({
          data: {
            tenantId: (await db.property.findUnique({ where: { id: breezy.id }, select: { tenantId: true } }))!.tenantId,
            action: 'property.status.repaired',
            resource: 'property',
            resourceId: breezy.id,
            source: 'SYSTEM',
            severity: 'INFO',
            payload: { from: 'IN_DISPOSITION', to: 'UNDER_CONTRACT', reason: 'dispo-trigger creation polluted acquisition status' },
          },
        }).catch(() => {})
      }
      console.log(`  After:  status=UNDER_CONTRACT  dispoStatus=${breezy.dispoStatus}`)
    } else {
      console.log(`  Status already correct (${breezy.status}) — no change.`)
    }
  }

  header('Done')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
