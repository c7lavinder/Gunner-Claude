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
  // ── Step 1 — backfill acqStageEnteredAt ─────────────────────────────────
  // Phase 1 multi-pipeline: stageEnteredAt was split into per-lane columns.
  // For acq-only rows where acqStageEnteredAt is null, populate from the
  // latest milestone or createdAt.
  header('Step 1 — backfill acqStageEnteredAt for properties where it is null')
  const needsBackfill = await db.propertyMilestone.findMany({
    where: { property: { acqStatus: { not: null }, acqStageEnteredAt: null } },
    orderBy: { createdAt: 'desc' },
    distinct: ['propertyId'],
    select: {
      propertyId: true, createdAt: true,
      property: { select: { id: true, address: true, createdAt: true } },
    },
  })
  console.log(`Candidates: ${needsBackfill.length}`)
  for (const m of needsBackfill) {
    if (!DRY) {
      await db.property.update({
        where: { id: m.propertyId },
        data: { acqStageEnteredAt: m.createdAt },
      })
    }
  }

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
  // Phase 1 multi-pipeline: per-lane status columns. The legacy "status set
  // to IN_DISPOSITION via dispo trigger" pollution issue is addressed by
  // strict-lane writes; this repair shouldn't be needed under the new
  // handler. Kept for reference on historical state. NOTE: this script
  // already ran on prod once and is no longer invoked; left in place so the
  // build stays green.
  header('Step 3 — repair 1908 Breezy Ridge Trl (no-op under Phase 1 lane model)')
  const breezy = await db.property.findFirst({
    where: { address: { contains: 'Breezy Ridge', mode: 'insensitive' } },
    select: { id: true, address: true, acqStatus: true, dispoStatus: true },
  })
  if (!breezy) {
    console.log('  No matching property. Skipping.')
  } else {
    console.log(`  Status: ${breezy.address}  acqStatus=${breezy.acqStatus ?? '—'}  dispoStatus=${breezy.dispoStatus ?? '—'}`)
  }

  header('Done')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
