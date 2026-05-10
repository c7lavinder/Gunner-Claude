#!/usr/bin/env -S npx tsx
// scripts/backfill-lost-opps.ts
//
// One-shot backfill for the per-lane *LostAt columns. The live webhook
// in lib/ghl/webhooks.ts only stamps lostAt on opps that change AFTER
// the feature shipped — opps already marked Lost in GHL won't fire a
// webhook and would stay visible in Gunner forever.
//
// What it does:
//   1. For each tenant (or one passed via --tenant), load the registered
//      pipelines from tenant_ghl_pipelines.
//   2. For each pipeline, walk every opportunity via searchOpportunities
//      (handles GHL's cursor pagination).
//   3. For each opp whose status is "lost" or "abandoned", find the
//      Property in our DB whose ghl{Acq,Dispo,Longterm}OppId matches —
//      and stamp the corresponding *LostAt column with now.
//   4. For each opp whose status is "open" or "won" — clear the lane's
//      *LostAt if it was set (covers reopens that happened before the
//      webhook listened for them).
//
// Run:
//   npx tsx scripts/backfill-lost-opps.ts                       # all tenants
//   npx tsx scripts/backfill-lost-opps.ts --tenant <tenant_slug>
//   npx tsx scripts/backfill-lost-opps.ts --dry-run             # report only

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'

type Lane = 'acquisition' | 'disposition' | 'longterm'

const tenantArg = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1]
const dryRun = process.argv.includes('--dry-run')

function laneToFields(lane: Lane): { oppIdField: 'ghlAcqOppId' | 'ghlDispoOppId' | 'ghlLongtermOppId'; lostAtField: 'acqLostAt' | 'dispoLostAt' | 'longtermLostAt' } {
  if (lane === 'acquisition') return { oppIdField: 'ghlAcqOppId', lostAtField: 'acqLostAt' }
  if (lane === 'disposition') return { oppIdField: 'ghlDispoOppId', lostAtField: 'dispoLostAt' }
  return { oppIdField: 'ghlLongtermOppId', lostAtField: 'longtermLostAt' }
}

async function processTenant(tenantId: string, tenantSlug: string): Promise<void> {
  console.log(`\n=== ${tenantSlug} (${tenantId}) ===`)

  const pipelines = await db.tenantGhlPipeline.findMany({
    where: { tenantId, isActive: true },
    select: { ghlPipelineId: true, track: true },
  })

  if (pipelines.length === 0) {
    console.log('  No registered pipelines — skipping')
    return
  }

  let ghl
  try {
    ghl = await getGHLClient(tenantId)
  } catch (err) {
    console.log(`  Skipping — could not init GHL client: ${err instanceof Error ? err.message : err}`)
    return
  }

  let totalSetLost = 0
  let totalClearedLost = 0
  let totalNoProperty = 0
  let totalOpps = 0

  for (const pipe of pipelines) {
    const track = pipe.track as Lane
    if (track !== 'acquisition' && track !== 'disposition' && track !== 'longterm') continue
    const { oppIdField, lostAtField } = laneToFields(track)

    console.log(`  Walking pipeline ${pipe.ghlPipelineId} (track=${track})…`)

    // Walk every page of opps in this pipeline.
    let startAfterTs: number | undefined
    let startAfterId: string | undefined
    let page = 0
    let pipelineOppCount = 0
    while (page < 100) { // 100 pages × 100 opps = 10k cap
      const result = await ghl.searchOpportunities(pipe.ghlPipelineId, 100, startAfterTs, startAfterId)
      const opps = result.opportunities ?? []
      if (opps.length === 0) break
      pipelineOppCount += opps.length

      // Bucket the opps by intended action.
      const lostOppIds: string[] = []
      const activeOppIds: string[] = []
      for (const opp of opps) {
        if (!opp.id) continue
        const s = (opp.status ?? '').toLowerCase()
        if (s === 'lost' || s === 'abandoned') lostOppIds.push(opp.id)
        else if (s === 'open' || s === 'won') activeOppIds.push(opp.id)
      }

      if (lostOppIds.length > 0) {
        // Fixed select shape — pulls all 3 oppId + lostAt fields, then
        // we read the lane-relevant one. Prisma's typing struggles with
        // computed-key selects so we keep the select static.
        const props = await db.property.findMany({
          where: { tenantId, [oppIdField]: { in: lostOppIds } },
          select: {
            id: true, address: true,
            ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
            acqLostAt: true, dispoLostAt: true, longtermLostAt: true,
          },
        })
        const propsByOppId = new Map<string, { id: string; address: string; alreadyLost: boolean }>()
        for (const p of props) {
          const oppId =
            oppIdField === 'ghlAcqOppId' ? p.ghlAcqOppId
            : oppIdField === 'ghlDispoOppId' ? p.ghlDispoOppId
            : p.ghlLongtermOppId
          if (!oppId) continue
          const currentLostAt =
            lostAtField === 'acqLostAt' ? p.acqLostAt
            : lostAtField === 'dispoLostAt' ? p.dispoLostAt
            : p.longtermLostAt
          propsByOppId.set(oppId, {
            id: p.id,
            address: p.address ?? '',
            alreadyLost: currentLostAt != null,
          })
        }
        for (const oppId of lostOppIds) {
          const found = propsByOppId.get(oppId)
          if (!found) { totalNoProperty++; continue }
          if (found.alreadyLost) continue // idempotent — already stamped
          if (!dryRun) {
            await db.property.update({
              where: { id: found.id },
              data: { [lostAtField]: new Date() },
            })
          }
          totalSetLost++
          console.log(`    Lost  → ${found.address || '(no address)'} [${track}]`)
        }
      }

      if (activeOppIds.length > 0) {
        // Only update rows whose lostAt is currently set — avoids
        // touching the 99% of properties that were never Lost. Saves
        // index writes and audit log noise.
        const stale = await db.property.findMany({
          where: {
            tenantId,
            [oppIdField]: { in: activeOppIds },
            [lostAtField]: { not: null },
          },
          select: { id: true, address: true },
        })
        for (const p of stale) {
          if (!dryRun) {
            await db.property.update({
              where: { id: p.id },
              data: { [lostAtField]: null },
            })
          }
          totalClearedLost++
          console.log(`    Reopen→ ${p.address || '(no address)'} [${track}] (lostAt cleared)`)
        }
      }

      startAfterTs = result.meta?.startAfter
      startAfterId = result.meta?.startAfterId
      if (!startAfterTs || !startAfterId || opps.length < 100) break
      page++
    }
    totalOpps += pipelineOppCount
    console.log(`    (scanned ${pipelineOppCount} opps)`)
  }

  console.log(`  Summary: ${dryRun ? '[DRY-RUN] ' : ''}set lost=${totalSetLost}, cleared lost=${totalClearedLost}, opps with no matching property=${totalNoProperty}, total opps scanned=${totalOpps}`)
}

async function main() {
  const tenants = await db.tenant.findMany({
    where: tenantArg ? { slug: tenantArg } : {},
    select: { id: true, slug: true },
  })

  if (tenants.length === 0) {
    console.error(`No tenant${tenantArg ? ` matching --tenant=${tenantArg}` : 's'} found.`)
    process.exit(1)
  }

  if (dryRun) console.log('DRY-RUN MODE — no DB writes will happen.\n')

  for (const t of tenants) {
    try {
      await processTenant(t.id, t.slug)
    } catch (err) {
      console.error(`  Error processing ${t.slug}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log('\nDone.')
  await db.$disconnect()
}

main().catch(async err => {
  console.error('Fatal:', err)
  await db.$disconnect()
  process.exit(1)
})
