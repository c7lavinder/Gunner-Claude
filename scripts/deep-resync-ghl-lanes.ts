#!/usr/bin/env -S npx tsx
// scripts/deep-resync-ghl-lanes.ts
//
// One-shot full resync of Gunner's per-lane status columns to match
// current GHL state. Run when chip counts diverge from GHL because of:
//   - Phase 1 migration mapping old `Property.status` to `acqStatus`
//     for properties whose GHL opp had since moved on
//   - Live webhook handler's strict-lane "return null" on non-matching
//     stages, which leaves stale lane fields untouched
//
// Behavior per lane:
//   - For each pipeline/track in tenant_ghl_pipelines, walk EVERY opp
//     (not just recent pages) and build contactId → {oppId, stageName,
//     resolution} map.
//   - For each Property whose lane field is set, look up the contact in
//     the matching pipeline's map:
//       - present + resolves to same lane → write current status, opp
//         id, stage name, entered-at (if changed)
//       - present + resolves to different lane (e.g. SP at "Trash" =
//         longterm.dead) → CLEAR the source lane and apply to the
//         destination lane (this is the strict-lane semantic fix)
//       - present + no resolution (acquisition.closed in FU pipeline
//         which is null per resolveLaneAndStatus) → clear the source
//         lane field
//       - absent → clear the source lane field (contact no longer in
//         that pipeline at all)
//
// Run:
//   npx tsx scripts/deep-resync-ghl-lanes.ts            # all tenants
//   npx tsx scripts/deep-resync-ghl-lanes.ts --tenant new-again-houses
//   npx tsx scripts/deep-resync-ghl-lanes.ts --dry-run  # report only

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { getAppStage } from '../lib/ghl-stage-map'

type Lane = 'acquisition' | 'disposition' | 'longterm'

const APP_STAGE_TO_STATUS: Record<string, string> = {
  'acquisition.new_lead': 'NEW_LEAD',
  'acquisition.appt_set': 'APPOINTMENT_SET',
  'acquisition.offer_made': 'OFFER_MADE',
  'acquisition.contract': 'UNDER_CONTRACT',
  'acquisition.closed': 'CLOSED',
  'disposition.new_deal': 'IN_DISPOSITION',
  'disposition.pushed_out': 'DISPO_PUSHED',
  'disposition.offers_received': 'DISPO_OFFERS',
  'disposition.contracted': 'DISPO_CONTRACTED',
  'disposition.closed': 'CLOSED',
  'longterm.follow_up': 'FOLLOW_UP',
  'longterm.dead': 'DEAD',
}

// Mirrors the live-webhook lib/ghl/webhooks.ts:resolveLaneAndStatus rule.
// Strict-lane: each pipeline writes only to its own lane column.
// SP→1MonthFU is the one allowed cross-lane exception (plan §0 #2).
function resolveLaneAndStatus(track: Lane, stageName: string): { lane: Lane; status: string } | null {
  const appStage = getAppStage(stageName)
  if (track === 'acquisition') {
    if (appStage.startsWith('acquisition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'acquisition', status } : null
    }
    if (appStage === 'longterm.follow_up' && stageName === '1 Month Follow Up') {
      return { lane: 'longterm', status: 'FOLLOW_UP' }
    }
    // Any other non-acq stage in SP (Trash / SOLD / 4 Month FU / etc.)
    // → no-op for the source lane. Just means "this contact moved out
    // of acquisition"; resync caller clears acqStatus.
    return null
  }
  if (track === 'disposition') {
    if (appStage.startsWith('disposition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'disposition', status } : null
    }
    return null
  }
  if (track === 'longterm') {
    if (appStage === 'acquisition.closed') return null
    if (appStage.startsWith('longterm.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'longterm', status } : null
    }
    return { lane: 'longterm', status: 'FOLLOW_UP' }
  }
  return null
}

interface OppRecord {
  oppId: string
  stageName: string
  resolution: { lane: Lane; status: string } | null
}

async function fetchAllOppsForPipeline(tenantId: string, pipelineId: string, stageNameById: Map<string, string>) {
  const ghl = await getGHLClient(tenantId)
  const byContactId = new Map<string, OppRecord>()
  let startAfterTs: number | undefined
  let startAfterId: string | undefined
  let totalOpps = 0
  for (let page = 0; page < 200; page++) {
    const r = await ghl.searchOpportunities(pipelineId, 100, startAfterTs, startAfterId)
    const opps = r.opportunities ?? []
    if (opps.length === 0) break
    totalOpps += opps.length
    for (const o of opps) {
      const sid = (o as { pipelineStageId?: string; stageId?: string }).pipelineStageId ?? (o as { pipelineStageId?: string; stageId?: string }).stageId
      if (!o.contactId || !o.id || !sid) continue
      const stageName = stageNameById.get(sid) ?? sid
      // Pipelines are walked separately, so the tenancy of the resolution
      // here is *which pipeline this opp came from*. Caller passes the
      // expected track; the per-track resolveLaneAndStatus picks lane.
      // Here we record the raw stage; lane resolution happens at apply-time.
      // Keep the LATEST opp per contact (overwrite earlier).
      byContactId.set(o.contactId, { oppId: o.id, stageName, resolution: null })
    }
    startAfterTs = r.meta?.startAfter
    startAfterId = r.meta?.startAfterId
    if (!startAfterTs || !startAfterId || opps.length < 100) break
  }
  return { byContactId, totalOpps }
}

interface Stats {
  rowsAlignedSameLane: number
  rowsClearedSourceLaneSetDestLane: number
  rowsClearedNoOpp: number
  rowsClearedNullResolution: number
  rowsUntouched: number
  errors: number
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const tenantSlugIdx = args.indexOf('--tenant')
const tenantSlug = tenantSlugIdx >= 0 ? args[tenantSlugIdx + 1] : undefined

async function main() {
  const startedAt = Date.now()
  console.log(`[deep-resync] dryRun=${DRY_RUN} tenant=${tenantSlug ?? 'all'}`)

  const tenants = await db.tenant.findMany({
    where: {
      ghlAccessToken: { not: null },
      ...(tenantSlug ? { slug: tenantSlug } : {}),
    },
    select: { id: true, slug: true, name: true, ghlPipelines: { where: { isActive: true } } },
  })

  const totals: Stats = { rowsAlignedSameLane: 0, rowsClearedSourceLaneSetDestLane: 0, rowsClearedNoOpp: 0, rowsClearedNullResolution: 0, rowsUntouched: 0, errors: 0 }

  for (const tenant of tenants) {
    if (tenant.ghlPipelines.length === 0) continue
    console.log(`\n[deep-resync] tenant=${tenant.slug}`)

    const ghl = await getGHLClient(tenant.id)
    const pipelinesData = await ghl.getPipelines()
    const pipelinesById = new Map(pipelinesData.pipelines.map(p => [p.id, p]))

    // Build per-pipeline maps. Each tracks contactId → opp+stage from THAT pipeline.
    interface PipelineMap {
      track: Lane
      pipelineId: string
      pipelineName: string
      byContactId: Map<string, OppRecord>
    }
    const pipelineMaps: PipelineMap[] = []
    for (const tgp of tenant.ghlPipelines) {
      const pipelineMeta = pipelinesById.get(tgp.ghlPipelineId)
      if (!pipelineMeta) continue
      const stageNameById = new Map((pipelineMeta.stages ?? []).map(s => [s.id, s.name]))
      const { byContactId, totalOpps } = await fetchAllOppsForPipeline(tenant.id, tgp.ghlPipelineId, stageNameById)
      console.log(`  → ${pipelineMeta.name} (${tgp.track}) — ${totalOpps} opps fetched`)
      pipelineMaps.push({ track: tgp.track as Lane, pipelineId: tgp.ghlPipelineId, pipelineName: pipelineMeta.name, byContactId })
    }

    // For each lane, find Properties currently set in that lane and align.
    for (const pm of pipelineMaps) {
      const lane = pm.track
      const statusField = lane === 'acquisition' ? 'acqStatus' : lane === 'disposition' ? 'dispoStatus' : 'longtermStatus'
      const oppIdField = lane === 'acquisition' ? 'ghlAcqOppId' : lane === 'disposition' ? 'ghlDispoOppId' : 'ghlLongtermOppId'
      const stageField = lane === 'acquisition' ? 'ghlAcqStageName' : lane === 'disposition' ? 'ghlDispoStageName' : 'ghlLongtermStageName'
      const enteredAtField = lane === 'acquisition' ? 'acqStageEnteredAt' : lane === 'disposition' ? 'dispoStageEnteredAt' : 'longtermStageEnteredAt'

      // All Properties currently in this lane (any status set)
      const propertiesInLane = await db.property.findMany({
        where: { tenantId: tenant.id, [statusField]: { not: null } },
        select: {
          id: true, ghlContactId: true,
          acqStatus: true, dispoStatus: true, longtermStatus: true,
          ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
          ghlAcqStageName: true, ghlDispoStageName: true, ghlLongtermStageName: true,
        },
      })
      console.log(`    ${lane}: ${propertiesInLane.length} Property rows currently in this lane`)

      let alignedSame = 0, clearedToOther = 0, clearedNoOpp = 0, clearedNullRes = 0
      const now = new Date()

      for (const p of propertiesInLane) {
        const cid = p.ghlContactId
        if (!cid) { totals.rowsUntouched++; continue }

        const opp = pm.byContactId.get(cid)

        if (!opp) {
          // Contact has no opp in this pipeline → clear source lane fields.
          if (!DRY_RUN) {
            await db.property.update({
              where: { id: p.id, tenantId: tenant.id },
              data: { [statusField]: null, [oppIdField]: null, [stageField]: null, [enteredAtField]: null },
            }).catch(e => { totals.errors++; console.error(`  [err] ${p.id}: ${e instanceof Error ? e.message : e}`) })
          }
          clearedNoOpp++
          continue
        }

        // Resolve the opp's stage against the source pipeline's track rule.
        const resolution = resolveLaneAndStatus(pm.track, opp.stageName)

        if (!resolution) {
          // GHL stage is in this pipeline but maps to a no-op for this track
          // (e.g. Follow Up at "Purchased" → acquisition.closed → null).
          // Clear source lane.
          if (!DRY_RUN) {
            await db.property.update({
              where: { id: p.id, tenantId: tenant.id },
              data: { [statusField]: null, [oppIdField]: null, [stageField]: null, [enteredAtField]: null },
            }).catch(e => { totals.errors++; console.error(`  [err] ${p.id}: ${e instanceof Error ? e.message : e}`) })
          }
          clearedNullRes++
          continue
        }

        if (resolution.lane === pm.track) {
          // Same lane — align status / oppId / stage name to current GHL.
          const currentStatus = (p as Record<string, unknown>)[statusField]
          const currentOppId = (p as Record<string, unknown>)[oppIdField]
          const currentStageName = (p as Record<string, unknown>)[stageField]
          if (currentStatus !== resolution.status || currentOppId !== opp.oppId || currentStageName !== opp.stageName) {
            if (!DRY_RUN) {
              await db.property.update({
                where: { id: p.id, tenantId: tenant.id },
                data: {
                  [statusField]: resolution.status,
                  [oppIdField]: opp.oppId,
                  [stageField]: opp.stageName,
                  [enteredAtField]: now,
                },
              }).catch(e => { totals.errors++; console.error(`  [err] ${p.id}: ${e instanceof Error ? e.message : e}`) })
            }
            alignedSame++
          }
        } else {
          // Cross-lane: source lane in this pipeline routes to a different
          // lane (e.g. SP at "Trash" → longterm.dead). Clear source lane,
          // set destination lane.
          const dstStatusField = resolution.lane === 'acquisition' ? 'acqStatus' : resolution.lane === 'disposition' ? 'dispoStatus' : 'longtermStatus'
          const dstOppIdField = resolution.lane === 'acquisition' ? 'ghlAcqOppId' : resolution.lane === 'disposition' ? 'ghlDispoOppId' : 'ghlLongtermOppId'
          const dstStageField = resolution.lane === 'acquisition' ? 'ghlAcqStageName' : resolution.lane === 'disposition' ? 'ghlDispoStageName' : 'ghlLongtermStageName'
          const dstEnteredAtField = resolution.lane === 'acquisition' ? 'acqStageEnteredAt' : resolution.lane === 'disposition' ? 'dispoStageEnteredAt' : 'longtermStageEnteredAt'

          if (!DRY_RUN) {
            await db.property.update({
              where: { id: p.id, tenantId: tenant.id },
              data: {
                [statusField]: null, [oppIdField]: null, [stageField]: null, [enteredAtField]: null,
                [dstStatusField]: resolution.status, [dstOppIdField]: opp.oppId, [dstStageField]: opp.stageName, [dstEnteredAtField]: now,
              },
            }).catch(e => { totals.errors++; console.error(`  [err] ${p.id}: ${e instanceof Error ? e.message : e}`) })
          }
          clearedToOther++
        }
      }
      console.log(`      aligned-same=${alignedSame}  cleared+set-other-lane=${clearedToOther}  cleared-no-opp=${clearedNoOpp}  cleared-null-res=${clearedNullRes}`)
      totals.rowsAlignedSameLane += alignedSame
      totals.rowsClearedSourceLaneSetDestLane += clearedToOther
      totals.rowsClearedNoOpp += clearedNoOpp
      totals.rowsClearedNullResolution += clearedNullRes
    }
  }

  const sec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `\n[deep-resync] done in ${sec}s — ` +
    `aligned=${totals.rowsAlignedSameLane} cross-lane=${totals.rowsClearedSourceLaneSetDestLane} ` +
    `cleared-no-opp=${totals.rowsClearedNoOpp} cleared-null-res=${totals.rowsClearedNullResolution} ` +
    `errors=${totals.errors}`
  )
  console.log(`[deep-resync] ${DRY_RUN ? 'DRY RUN — no writes' : 'WRITES PERSISTED'}`)
}

main()
  .catch(err => { console.error('[deep-resync] fatal:', err); process.exit(1) })
  .finally(() => db.$disconnect())
