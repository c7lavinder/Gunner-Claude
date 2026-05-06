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
import { getAppStage } from '../lib/ghl-stage-map'

type Lane = 'acquisition' | 'disposition' | 'longterm'

interface Args {
  dryRun: boolean
  tenantSlug?: string
  reset: boolean
  maxPages: number
  concurrency: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = { dryRun: false, reset: false, maxPages: 200, concurrency: 10 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--reset') args.reset = true
    else if (a === '--tenant') args.tenantSlug = argv[++i]
    else if (a === '--max-pages') args.maxPages = parseInt(argv[++i] ?? '200', 10)
    else if (a === '--concurrency') args.concurrency = Math.max(1, parseInt(argv[++i] ?? '10', 10))
  }
  return args
}

const SLEEP_MS = 200 // 5 req/sec between PAGE fetches (not between per-opp work)
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
function resolveLaneAndStatus(
  track: Lane,
  stageName: string,
): { lane: Lane; status: string; appStage: string } | null {
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
  concurrency: number
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

    // Batch lookup: resolve all existing Property rows for this page's
    // contactIds in a single findMany. Avoids N×100ms of sequential
    // findFirst calls. Critical for Follow Up's 8000+ opps.
    const contactIds = [...new Set(opps.map(o => o.contactId).filter((c): c is string => !!c))]
    const existingRows = contactIds.length > 0
      ? await db.property.findMany({
          where: { tenantId: opts.tenantId, ghlContactId: { in: contactIds } },
          select: { id: true, ghlContactId: true, ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true },
        })
      : []
    const existingByContactId = new Map(existingRows.map(r => [r.ghlContactId, r]))

    // Count every opp from the page once (parallel workers below should
    // not re-bump this counter or it races).
    stats.oppsScanned += opps.length

    // Dedupe opps by contactId within this page. GHL's "multiple opps per
    // contact" pattern (esp. JV flows) would otherwise have N parallel
    // workers race to create the same Property for the same contact.
    // Pick the first opp per contact as canonical for create; ignore the
    // rest (their lane fields are the same in this pipeline anyway).
    const seen = new Set<string>()
    const dedupedOpps: typeof opps = []
    for (const o of opps) {
      const stageId = o.pipelineStageId ?? o.stageId
      if (!o.contactId || !o.id || !stageId) continue
      if (seen.has(o.contactId)) continue
      seen.add(o.contactId)
      dedupedOpps.push(o)
    }

    // ── Partition deduped opps into LINK (already have a Property row) and
    // CREATE (need a stub row). Per opp we resolve lane/status first; opps
    // that resolve to null (strict-lane no-ops) drop out of both buckets.
    type ResolvedOpp = {
      opp: typeof opps[number]
      stageName: string
      lane: Lane
      status: string
    }
    const toLink: ResolvedOpp[] = []
    const toCreate: ResolvedOpp[] = []
    for (const opp of dedupedOpps) {
      const stageId = opp.pipelineStageId ?? opp.stageId
      if (!opp.contactId || !opp.id || !stageId) continue
      const stageName = opts.stageNameById.get(stageId) ?? stageId
      const resolution = resolveLaneAndStatus(opts.track, stageName)
      if (!resolution) {
        stats.noOps++
        continue
      }
      const r: ResolvedOpp = { opp, stageName, lane: resolution.lane, status: resolution.status }
      if (existingByContactId.has(opp.contactId)) toLink.push(r)
      else toCreate.push(r)
    }

    if (opts.dryRun) {
      stats.propertiesLinked += toLink.length
      stats.propertiesCreated += toCreate.length
    } else {
      const now = new Date()

      // ── Bulk LINK: parallel updates in chunks. updateMany can't take
      // per-row data so we still issue one update per row — but without
      // any GHL calls these are fast (~30-80ms each).
      const concurrency = opts.concurrency
      for (let i = 0; i < toLink.length; i += concurrency) {
        const chunk = toLink.slice(i, i + concurrency)
        await Promise.all(chunk.map(async ({ opp, stageName, lane, status }) => {
          const existing = existingByContactId.get(opp.contactId!)
          if (!existing) return
          try {
            await db.property.update({
              where: { id: existing.id, tenantId: opts.tenantId },
              data: laneUpdatePayload(lane, status, stageName, opp.id, now, true),
            })
            stats.propertiesLinked++
          } catch (err) {
            stats.errorsLogged++
            console.error(`    [link error] opp ${opp.id}:`, err instanceof Error ? err.message : err)
          }
        }))
      }

      // ── Bulk CREATE: stub rows. No getContact, no enrichment, placeholder
      // address fields. pendingEnrichment=true marks them for the Phase 3
      // catch-up cron which fills in real address/email/phone over time.
      // Creates run as 4 bulk createMany calls per page (sellers, properties,
      // property_sellers join, audit logs) instead of 14+ DB calls per opp.
      if (toCreate.length > 0) {
        // 1) Existing sellers for these contacts (avoid dup seller rows).
        const createContactIds = toCreate.map(r => r.opp.contactId!)
        const existingSellers = await db.seller.findMany({
          where: { tenantId: opts.tenantId, ghlContactId: { in: createContactIds } },
          select: { id: true, ghlContactId: true },
        })
        const sellerByContact = new Map(existingSellers.map(s => [s.ghlContactId, s.id]))

        // 2) Build new seller rows for contacts without one. Name comes from
        // the GHL opportunity name (already known — no extra API call).
        const newSellers = toCreate
          .filter(r => !sellerByContact.has(r.opp.contactId!))
          .filter((r, idx, arr) => arr.findIndex(x => x.opp.contactId === r.opp.contactId) === idx)
          .map(r => ({
            tenantId: opts.tenantId,
            name: r.opp.name || 'Unknown',
            ghlContactId: r.opp.contactId!,
            leadSource: 'backfill',
          }))
        if (newSellers.length > 0) {
          await db.seller.createMany({ data: newSellers, skipDuplicates: true })
          // Refetch to capture autogenerated IDs for the join below.
          const refetched = await db.seller.findMany({
            where: { tenantId: opts.tenantId, ghlContactId: { in: newSellers.map(s => s.ghlContactId) } },
            select: { id: true, ghlContactId: true },
          })
          for (const s of refetched) {
            if (s.ghlContactId) sellerByContact.set(s.ghlContactId, s.id)
          }
        }

        // 3) Build new property rows. Address fields use empty strings —
        // schema requires NOT NULL but the inventory UI hides
        // pendingEnrichment rows behind "Show archived" so the empty
        // address never surfaces to users until enrichment lands.
        const newPropertyRows = toCreate.map(r => ({
          tenantId: opts.tenantId,
          ghlContactId: r.opp.contactId!,
          address: '',
          city: '',
          state: '',
          zip: '',
          pendingEnrichment: true,
          leadSource: 'backfill',
          ...laneUpdatePayload(r.lane, r.status, r.stageName, r.opp.id, now, true),
        }))
        await db.property.createMany({ data: newPropertyRows, skipDuplicates: true })

        // 4) Refetch the just-created properties to capture their IDs.
        const createdProperties = await db.property.findMany({
          where: { tenantId: opts.tenantId, ghlContactId: { in: createContactIds } },
          select: { id: true, ghlContactId: true },
        })
        const propertyByContact = new Map(createdProperties.map(p => [p.ghlContactId, p.id]))

        // 5) Bulk-insert property_sellers join rows. skipDuplicates handles
        // re-runs that already linked the same pair.
        const joins = toCreate
          .map(r => {
            const propertyId = propertyByContact.get(r.opp.contactId!)
            const sellerId = sellerByContact.get(r.opp.contactId!)
            if (!propertyId || !sellerId) return null
            return { propertyId, sellerId, isPrimary: true, role: 'Seller' }
          })
          .filter((j): j is NonNullable<typeof j> => j !== null)
        if (joins.length > 0) {
          await db.propertySeller.createMany({ data: joins, skipDuplicates: true })
        }

        // 6) Bulk audit log. Severity INFO; "deferred" because enrichment
        // hasn't happened yet.
        await db.auditLog.createMany({
          data: toCreate.map(r => ({
            tenantId: opts.tenantId,
            action: 'enrich.property.deferred_backfill',
            resource: 'property',
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              pipelineId: opts.ghlPipelineId, pipelineName: opts.pipelineName,
              track: opts.track, oppId: r.opp.id, contactId: r.opp.contactId,
              stage: r.stageName, lane: r.lane, status: r.status,
              mode: 'stub',
            },
          })),
        }).catch(() => {})

        // Count successful creates (those new to existingByContactId) and
        // update local cache so cross-page dedup works.
        for (const r of toCreate) {
          const cid = r.opp.contactId!
          if (!existingByContactId.has(cid) && propertyByContact.has(cid)) {
            stats.propertiesCreated++
            existingByContactId.set(cid, {
              id: propertyByContact.get(cid)!,
              ghlContactId: cid,
              ghlAcqOppId: null,
              ghlDispoOppId: null,
              ghlLongtermOppId: null,
            })
          }
        }
      }
    }

    startAfterTs = result.meta?.startAfter
    startAfterId = result.meta?.startAfterId

    // Per-page progress (writes to stderr so it flushes through bash buffering).
    process.stderr.write(`    [page ${page + 1}] scanned=${stats.oppsScanned} created=${stats.propertiesCreated} linked=${stats.propertiesLinked} no-ops=${stats.noOps} errors=${stats.errorsLogged}\n`)

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
  console.log(`[backfill] dryRun=${args.dryRun} tenant=${args.tenantSlug ?? 'all'} reset=${args.reset} maxPages=${args.maxPages} concurrency=${args.concurrency}`)

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
        concurrency: args.concurrency,
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
