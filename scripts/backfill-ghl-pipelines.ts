#!/usr/bin/env -S npx tsx
// scripts/backfill-ghl-pipelines.ts
//
// Phase 2 of GHL multi-pipeline redesign — backfill from GHL.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §7.
//
// What this does:
//   For every tenant_ghl_pipelines row that is active, walk the matching
//   GHL pipeline's opportunity list (cursor-paginated, ~5 req/sec
//   throttle), and for each opp:
//     - Find or create the Seller (dedup by tenantId + ghlContactId)
//     - Find or create the Property (dedup by tenantId + ghlContactId)
//     - Set the matching ghl{Acq,Dispo,Longterm}OppId / status / stage
//       name / entered_at on the Property, mark pendingEnrichment=true
//     - Audit log entry (severity INFO)
//   Resumable via the backfill_cursors table — restart with the same
//   args and it picks up where the last run left off.
//
// What this does NOT do:
//   - Does not run enrichment (PR / Google / etc). Phase 3 catch-up
//     cron handles that within daily budget.
//   - Does not skip-trace (per Corey 2026-05-05, plan §0 #7).
//
// Run:
//   railway run --service Gunner-Claude bash -c \
//     'npx tsx scripts/backfill-ghl-pipelines.ts --dry-run'
//   railway run --service Gunner-Claude bash -c \
//     'npx tsx scripts/backfill-ghl-pipelines.ts'
//
// Optional flags:
//   --dry-run        Report counts only, no writes
//   --tenant <slug>  Limit to a single tenant
//   --reset          Clear backfill_cursors and start over
//   --max-pages <N>  Cap pages per pipeline (debugging)

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'

type Lane = 'acquisition' | 'disposition' | 'longterm'

interface Args {
  dryRun: boolean
  tenantSlug?: string
  reset: boolean
  maxPages: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = { dryRun: false, reset: false, maxPages: 200 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--reset') args.reset = true
    else if (a === '--tenant') args.tenantSlug = argv[++i]
    else if (a === '--max-pages') args.maxPages = parseInt(argv[++i] ?? '200', 10)
  }
  return args
}

const SLEEP_MS = 200 // 5 req/sec
const PAGE_SIZE = 100

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

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

// Resolve lane + status for a pipeline+stage. Mirrors the live-webhook
// lib/ghl/webhooks.ts:resolveLaneAndStatus rule. Returns null for
// strict-lane NO-OPs (e.g. SP at "4 Month FU").
async function resolveLaneAndStatus(
  track: Lane,
  stageName: string,
): Promise<{ lane: Lane; status: string; appStage: string } | null> {
  const { getAppStage } = await import('../lib/ghl-stage-map')
  const appStage = getAppStage(stageName)

  if (track === 'acquisition') {
    if (appStage.startsWith('acquisition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'acquisition', status, appStage } : null
    }
    if (appStage === 'longterm.follow_up' && stageName === '1 Month Follow Up') {
      return { lane: 'longterm', status: 'FOLLOW_UP', appStage: 'longterm.follow_up' }
    }
    return null
  }

  if (track === 'disposition') {
    if (appStage.startsWith('disposition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'disposition', status, appStage } : null
    }
    return { lane: 'disposition', status: 'IN_DISPOSITION', appStage }
  }

  if (track === 'longterm') {
    if (appStage === 'acquisition.closed') return null
    if (appStage.startsWith('longterm.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'longterm', status, appStage } : null
    }
    return { lane: 'longterm', status: 'FOLLOW_UP', appStage }
  }

  return null
}

function laneUpdatePayload(
  lane: Lane,
  status: string,
  stageLabel: string,
  oppId: string,
  now: Date,
  pendingEnrichment: boolean,
): Record<string, unknown> {
  const base = { pendingEnrichment }
  if (lane === 'acquisition') return { ...base, acqStatus: status, acqStageEnteredAt: now, ghlAcqStageName: stageLabel, ghlAcqOppId: oppId }
  if (lane === 'disposition') return { ...base, dispoStatus: status, dispoStageEnteredAt: now, ghlDispoStageName: stageLabel, ghlDispoOppId: oppId }
  return { ...base, longtermStatus: status, longtermStageEnteredAt: now, ghlLongtermStageName: stageLabel, ghlLongtermOppId: oppId }
}

interface RunStats {
  oppsScanned: number
  propertiesCreated: number
  propertiesLinked: number
  sellersCreated: number
  errorsLogged: number
  noOps: number
}

async function backfillPipeline(opts: {
  tenantId: string
  tenantSlug: string
  ghlPipelineId: string
  track: Lane
  pipelineName: string
  stageNameById: Map<string, string>
  dryRun: boolean
  maxPages: number
}): Promise<RunStats> {
  const stats: RunStats = {
    oppsScanned: 0, propertiesCreated: 0, propertiesLinked: 0, sellersCreated: 0, errorsLogged: 0, noOps: 0,
  }

  const ghl = await getGHLClient(opts.tenantId)

  // Resume from cursor if one exists
  const cursor = await db.backfillCursor.upsert({
    where: { tenantId_ghlPipelineId: { tenantId: opts.tenantId, ghlPipelineId: opts.ghlPipelineId } },
    create: { tenantId: opts.tenantId, ghlPipelineId: opts.ghlPipelineId },
    update: {},
  })

  if (cursor.isCompleted) {
    console.log(`  [skip] Already completed (${cursor.oppsScanned} opps, ${cursor.propertiesCreated} created)`)
    return stats
  }

  let startAfterTs: number | undefined = cursor.nextStartAfterTs ? Number(cursor.nextStartAfterTs) : undefined
  let startAfterId: string | undefined = cursor.nextStartAfterId ?? undefined

  for (let page = 0; page < opts.maxPages; page++) {
    const result = await ghl.searchOpportunities(opts.ghlPipelineId, PAGE_SIZE, startAfterTs, startAfterId)
    const opps = result.opportunities ?? []
    if (opps.length === 0) break

    for (const opp of opps) {
      stats.oppsScanned++
      if (!opp.contactId || !opp.id || !opp.stageId) continue

      const stageName = opts.stageNameById.get(opp.stageId) ?? opp.stageId
      const resolution = await resolveLaneAndStatus(opts.track, stageName)
      if (!resolution) {
        stats.noOps++
        continue
      }

      try {
        // Find or create Property + Seller via the same idempotent path
        // the live webhook uses. createPropertyFromContact dedups by
        // (tenantId, ghlContactId), so re-runs are safe.
        const existing = await db.property.findFirst({
          where: { tenantId: opts.tenantId, ghlContactId: opp.contactId },
          select: { id: true, ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true },
        })

        if (opts.dryRun) {
          if (existing) stats.propertiesLinked++
          else stats.propertiesCreated++
          continue
        }

        const now = new Date()
        const payload = laneUpdatePayload(resolution.lane, resolution.status, stageName, opp.id, now, true /* pendingEnrichment */)

        if (existing) {
          await db.property.update({
            where: { id: existing.id, tenantId: opts.tenantId },
            data: payload,
          })
          stats.propertiesLinked++
        } else {
          // Create Seller (dedup by ghlContactId) + Property
          const { createPropertyFromContact } = await import('../lib/properties')
          await createPropertyFromContact(opts.tenantId, opp.contactId, {
            ghlPipelineId: opts.ghlPipelineId,
            ghlPipelineStage: stageName,
            opportunitySource: 'backfill',
          })
          // Re-fetch to apply lane payload
          const created = await db.property.findFirst({
            where: { tenantId: opts.tenantId, ghlContactId: opp.contactId },
            select: { id: true },
          })
          if (created) {
            await db.property.update({
              where: { id: created.id, tenantId: opts.tenantId },
              data: payload,
            })
            stats.propertiesCreated++
          }
        }

        await db.auditLog.create({
          data: {
            tenantId: opts.tenantId,
            action: 'enrich.property.deferred_backfill',
            resource: 'property',
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              pipelineId: opts.ghlPipelineId, pipelineName: opts.pipelineName,
              track: opts.track, oppId: opp.id, contactId: opp.contactId,
              stage: stageName, lane: resolution.lane, status: resolution.status,
            },
          },
        }).catch(() => {})
      } catch (err) {
        stats.errorsLogged++
        console.error(`    [error] opp ${opp.id} contact ${opp.contactId}:`, err instanceof Error ? err.message : err)
        await db.auditLog.create({
          data: {
            tenantId: opts.tenantId,
            action: 'backfill.property.failed',
            resource: 'property',
            severity: 'ERROR',
            source: 'SYSTEM',
            payload: { pipelineId: opts.ghlPipelineId, oppId: opp.id, contactId: opp.contactId, error: err instanceof Error ? err.message : 'unknown' },
          },
        }).catch(() => {})
      }
    }

    startAfterTs = result.meta?.startAfter
    startAfterId = result.meta?.startAfterId

    // Save cursor + counts after each page (resumable)
    if (!opts.dryRun) {
      await db.backfillCursor.update({
        where: { tenantId_ghlPipelineId: { tenantId: opts.tenantId, ghlPipelineId: opts.ghlPipelineId } },
        data: {
          nextStartAfterTs: startAfterTs ? BigInt(startAfterTs) : null,
          nextStartAfterId: startAfterId ?? null,
          oppsScanned: { increment: opts.tenantSlug ? 0 : 0 }, // overwrite below
          lastRunAt: new Date(),
        },
      })
      // Atomic counter snapshot — easier to reason about than incrementing
      // per-opp in a tight loop. Save totals as we know them this run.
      await db.backfillCursor.update({
        where: { tenantId_ghlPipelineId: { tenantId: opts.tenantId, ghlPipelineId: opts.ghlPipelineId } },
        data: {
          oppsScanned: stats.oppsScanned,
          propertiesCreated: stats.propertiesCreated,
          propertiesLinked: stats.propertiesLinked,
          sellersCreated: stats.sellersCreated,
          errorsLogged: stats.errorsLogged,
        },
      })
    }

    if (!startAfterTs || !startAfterId || opps.length < PAGE_SIZE) break

    // Throttle: 5 req/sec
    await sleep(SLEEP_MS)
  }

  // Mark completed
  if (!opts.dryRun) {
    await db.backfillCursor.update({
      where: { tenantId_ghlPipelineId: { tenantId: opts.tenantId, ghlPipelineId: opts.ghlPipelineId } },
      data: { isCompleted: true, lastRunAt: new Date() },
    })
  }

  return stats
}

async function main() {
  const args = parseArgs()
  console.log(`[backfill] dryRun=${args.dryRun} tenant=${args.tenantSlug ?? 'all'} reset=${args.reset} maxPages=${args.maxPages}`)

  if (args.reset && !args.dryRun) {
    const r = await db.backfillCursor.deleteMany({})
    console.log(`[backfill] cleared ${r.count} cursor rows`)
  }

  // For each tenant + each registered pipeline
  const tenantWhere = args.tenantSlug ? { slug: args.tenantSlug } : {}
  const tenants = await db.tenant.findMany({
    where: { ...tenantWhere, ghlAccessToken: { not: null } },
    select: { id: true, slug: true, name: true, ghlPipelines: { where: { isActive: true } } },
  })

  const totals: RunStats = { oppsScanned: 0, propertiesCreated: 0, propertiesLinked: 0, sellersCreated: 0, errorsLogged: 0, noOps: 0 }
  for (const tenant of tenants) {
    if (tenant.ghlPipelines.length === 0) continue
    console.log(`\n[backfill] Tenant ${tenant.slug} (${tenant.name}) — ${tenant.ghlPipelines.length} pipeline(s)`)

    // One GHL call to get pipeline metadata + stage names
    const ghl = await getGHLClient(tenant.id)
    const pipelinesData = await ghl.getPipelines()
    const pipelinesById = new Map(pipelinesData.pipelines.map(p => [p.id, p]))

    for (const tgp of tenant.ghlPipelines) {
      const pipelineMeta = pipelinesById.get(tgp.ghlPipelineId)
      if (!pipelineMeta) {
        console.log(`  [skip] pipeline ${tgp.ghlPipelineId} not found in GHL (deleted?)`)
        continue
      }
      const stageNameById = new Map((pipelineMeta.stages ?? []).map(s => [s.id, s.name]))
      console.log(`  → ${pipelineMeta.name} (${tgp.track}) — ${pipelineMeta.stages?.length ?? 0} stages`)

      const stats = await backfillPipeline({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        ghlPipelineId: tgp.ghlPipelineId,
        track: tgp.track as Lane,
        pipelineName: pipelineMeta.name,
        stageNameById,
        dryRun: args.dryRun,
        maxPages: args.maxPages,
      })
      console.log(`    scanned=${stats.oppsScanned} created=${stats.propertiesCreated} linked=${stats.propertiesLinked} no-ops=${stats.noOps} errors=${stats.errorsLogged}`)
      totals.oppsScanned += stats.oppsScanned
      totals.propertiesCreated += stats.propertiesCreated
      totals.propertiesLinked += stats.propertiesLinked
      totals.noOps += stats.noOps
      totals.errorsLogged += stats.errorsLogged
    }
  }

  console.log(`\n[backfill] TOTALS — scanned=${totals.oppsScanned} created=${totals.propertiesCreated} linked=${totals.propertiesLinked} no-ops=${totals.noOps} errors=${totals.errorsLogged}`)
  console.log(`[backfill] ${args.dryRun ? 'DRY RUN — no writes occurred' : 'WRITES PERSISTED'}`)
}

main()
  .catch(err => {
    console.error('[backfill] fatal:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
