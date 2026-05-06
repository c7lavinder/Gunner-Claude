#!/usr/bin/env -S npx tsx
// scripts/reconcile-ghl-pipelines.ts
//
// Phase 4.1 of GHL multi-pipeline redesign — daily reconciliation cron.
// See docs/plans/ghl-multi-pipeline-bulletproof.md §9.1.
//
// What this does:
//   For every tenant + every active pipeline registered in
//   tenant_ghl_pipelines, walk the most recent ~5 pages (~500 opps) of
//   the GHL pipeline and compare to Gunner state.
//
//   Two classes of discrepancy:
//     1. Missing Property — GHL has the opp but Gunner has no Property
//        row for that contactId. Creates a stub row (same shape as
//        Phase 2 backfill) so Phase 3 catch-up cron picks it up.
//     2. Stale lane status — Property exists but the per-lane status
//        doesn't match what GHL says. Updates the lane fields.
//
//   Every discrepancy gets an auditLog WARNING entry. If >5 in 24h
//   per tenant, also logs a CRITICAL summary entry so dashboards /
//   alerts can pick it up.
//
// Run:
//   railway run --service Gunner-Claude bash -c \
//     'npx tsx scripts/reconcile-ghl-pipelines.ts'
//
//   Locally:
//     npx tsx scripts/reconcile-ghl-pipelines.ts
//     npx tsx scripts/reconcile-ghl-pipelines.ts --tenant new-again-houses
//
// Cron: 4am UTC daily via railway.toml. Off-hours, after KPI snapshot.

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { getAppStage } from '../lib/ghl-stage-map'

type Lane = 'acquisition' | 'disposition' | 'longterm'

const MAX_PAGES = parseInt(process.env.RECONCILE_MAX_PAGES ?? '5', 10) // ~500 opps per pipeline
const PAGE_SIZE = 100
const CRITICAL_THRESHOLD = 5 // > 5 discrepancies in 24h triggers CRITICAL

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
    return null
  }
  if (track === 'disposition') {
    if (appStage.startsWith('disposition.')) {
      const status = APP_STAGE_TO_STATUS[appStage]
      return status ? { lane: 'disposition', status } : null
    }
    return { lane: 'disposition', status: 'IN_DISPOSITION' }
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

function laneFieldsFor(lane: Lane) {
  if (lane === 'acquisition') return { status: 'acqStatus', oppId: 'ghlAcqOppId', stage: 'ghlAcqStageName', enteredAt: 'acqStageEnteredAt' } as const
  if (lane === 'disposition') return { status: 'dispoStatus', oppId: 'ghlDispoOppId', stage: 'ghlDispoStageName', enteredAt: 'dispoStageEnteredAt' } as const
  return { status: 'longtermStatus', oppId: 'ghlLongtermOppId', stage: 'ghlLongtermStageName', enteredAt: 'longtermStageEnteredAt' } as const
}

interface Discrepancy {
  kind: 'missing_property' | 'stale_status'
  contactId: string
  oppId: string
  pipelineId: string
  pipelineName: string
  track: Lane
  stage: string
  expectedLane: Lane
  expectedStatus: string
  actualStatus?: string | null
  actualOppId?: string | null
}

interface Stats {
  tenantsChecked: number
  pipelinesChecked: number
  oppsScanned: number
  missingPropertyFixed: number
  staleStatusFixed: number
  noOps: number
  errors: number
}

async function reconcileTenantPipeline(opts: {
  tenantId: string
  tenantSlug: string
  ghlPipelineId: string
  pipelineName: string
  track: Lane
  stageNameById: Map<string, string>
  stats: Stats
}) {
  const ghl = await getGHLClient(opts.tenantId)
  let startAfterTs: number | undefined
  let startAfterId: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await ghl.searchOpportunities(opts.ghlPipelineId, PAGE_SIZE, startAfterTs, startAfterId)
    const opps = result.opportunities ?? []
    if (opps.length === 0) break

    // Batch-lookup existing properties for this page's contactIds.
    const contactIds = [...new Set(opps.map(o => o.contactId).filter((c): c is string => !!c))]
    const existingRows = contactIds.length > 0
      ? await db.property.findMany({
          where: { tenantId: opts.tenantId, ghlContactId: { in: contactIds } },
          select: {
            id: true, ghlContactId: true,
            acqStatus: true, dispoStatus: true, longtermStatus: true,
            ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
          },
        })
      : []
    const existingByContactId = new Map(existingRows.map(r => [r.ghlContactId, r]))

    for (const opp of opps) {
      opts.stats.oppsScanned++
      const stageId = opp.pipelineStageId ?? opp.stageId
      if (!opp.contactId || !opp.id || !stageId) continue

      const stageName = opts.stageNameById.get(stageId) ?? stageId
      const resolution = resolveLaneAndStatus(opts.track, stageName)
      if (!resolution) {
        opts.stats.noOps++
        continue
      }

      const existing = existingByContactId.get(opp.contactId) ?? null
      const fields = laneFieldsFor(resolution.lane)

      // Discrepancy 1: missing Property entirely
      if (!existing) {
        const discrepancy: Discrepancy = {
          kind: 'missing_property',
          contactId: opp.contactId, oppId: opp.id,
          pipelineId: opts.ghlPipelineId, pipelineName: opts.pipelineName,
          track: opts.track, stage: stageName,
          expectedLane: resolution.lane, expectedStatus: resolution.status,
        }
        await fixMissingProperty(opts.tenantId, opts.tenantSlug, opp, resolution, stageName, discrepancy)
        opts.stats.missingPropertyFixed++
        continue
      }

      // Discrepancy 2: stale lane status
      const actualStatus = (existing as Record<string, unknown>)[fields.status] as string | null
      const actualOppId = (existing as Record<string, unknown>)[fields.oppId] as string | null
      if (actualStatus !== resolution.status || actualOppId !== opp.id) {
        const discrepancy: Discrepancy = {
          kind: 'stale_status',
          contactId: opp.contactId, oppId: opp.id,
          pipelineId: opts.ghlPipelineId, pipelineName: opts.pipelineName,
          track: opts.track, stage: stageName,
          expectedLane: resolution.lane, expectedStatus: resolution.status,
          actualStatus, actualOppId,
        }
        await fixStaleStatus(opts.tenantId, existing.id, resolution, stageName, opp.id, discrepancy)
        opts.stats.staleStatusFixed++
      }
    }

    startAfterTs = result.meta?.startAfter
    startAfterId = result.meta?.startAfterId
    if (!startAfterTs || !startAfterId || opps.length < PAGE_SIZE) break
  }
}

async function fixMissingProperty(
  tenantId: string,
  _tenantSlug: string,
  opp: { id: string; contactId: string; name: string },
  resolution: { lane: Lane; status: string },
  stageName: string,
  discrepancy: Discrepancy,
) {
  const fields = laneFieldsFor(resolution.lane)
  const now = new Date()

  // Create stub Property + Seller (same shape as Phase 2 backfill).
  const seller = await db.seller.findFirst({
    where: { tenantId, ghlContactId: opp.contactId },
    select: { id: true },
  })
  let sellerId = seller?.id
  if (!sellerId) {
    const created = await db.seller.create({
      data: {
        tenantId,
        name: opp.name || 'Unknown',
        ghlContactId: opp.contactId,
        leadSource: 'reconciliation',
      },
      select: { id: true },
    })
    sellerId = created.id
  }

  const property = await db.property.create({
    data: {
      tenantId,
      ghlContactId: opp.contactId,
      address: '', city: '', state: '', zip: '',
      pendingEnrichment: true,
      leadSource: 'reconciliation',
      [fields.status]: resolution.status,
      [fields.oppId]: opp.id,
      [fields.stage]: stageName,
      [fields.enteredAt]: now,
    },
    select: { id: true },
  })

  await db.propertySeller.create({
    data: { propertyId: property.id, sellerId, isPrimary: true, role: 'Seller' },
  }).catch(() => {})

  await db.auditLog.create({
    data: {
      tenantId,
      action: 'reconciliation.missing_property_fixed',
      resource: 'property',
      resourceId: property.id,
      severity: 'WARNING',
      source: 'SYSTEM',
      payload: { ...discrepancy, fixed: true },
    },
  }).catch(() => {})
}

async function fixStaleStatus(
  tenantId: string,
  propertyId: string,
  resolution: { lane: Lane; status: string },
  stageName: string,
  oppId: string,
  discrepancy: Discrepancy,
) {
  const fields = laneFieldsFor(resolution.lane)
  const now = new Date()
  await db.property.update({
    where: { id: propertyId, tenantId },
    data: {
      [fields.status]: resolution.status,
      [fields.oppId]: oppId,
      [fields.stage]: stageName,
      [fields.enteredAt]: now,
    },
  })
  await db.auditLog.create({
    data: {
      tenantId,
      action: 'reconciliation.stale_status_fixed',
      resource: 'property',
      resourceId: propertyId,
      severity: 'WARNING',
      source: 'SYSTEM',
      payload: { ...discrepancy, fixed: true },
    },
  }).catch(() => {})
}

async function main() {
  const startedAt = Date.now()
  const tenantSlug = (process.argv.includes('--tenant')
    ? process.argv[process.argv.indexOf('--tenant') + 1]
    : undefined)
  console.log(`[reconcile] starting maxPages=${MAX_PAGES} tenant=${tenantSlug ?? 'all'}`)

  const tenants = await db.tenant.findMany({
    where: {
      ghlAccessToken: { not: null },
      ...(tenantSlug ? { slug: tenantSlug } : {}),
    },
    select: { id: true, slug: true, name: true, ghlPipelines: { where: { isActive: true } } },
  })

  const totals: Stats = { tenantsChecked: 0, pipelinesChecked: 0, oppsScanned: 0, missingPropertyFixed: 0, staleStatusFixed: 0, noOps: 0, errors: 0 }

  for (const tenant of tenants) {
    if (tenant.ghlPipelines.length === 0) continue
    totals.tenantsChecked++
    console.log(`[reconcile] tenant=${tenant.slug} pipelines=${tenant.ghlPipelines.length}`)

    try {
      const ghl = await getGHLClient(tenant.id)
      const pipelinesData = await ghl.getPipelines()
      const pipelinesById = new Map(pipelinesData.pipelines.map(p => [p.id, p]))

      for (const tgp of tenant.ghlPipelines) {
        const pipelineMeta = pipelinesById.get(tgp.ghlPipelineId)
        if (!pipelineMeta) {
          console.log(`  [skip] pipeline ${tgp.ghlPipelineId} not found in GHL`)
          continue
        }
        totals.pipelinesChecked++
        const stageNameById = new Map((pipelineMeta.stages ?? []).map(s => [s.id, s.name]))
        console.log(`  → ${pipelineMeta.name} (${tgp.track})`)
        await reconcileTenantPipeline({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          ghlPipelineId: tgp.ghlPipelineId,
          pipelineName: pipelineMeta.name,
          track: tgp.track as Lane,
          stageNameById,
          stats: totals,
        })
      }
    } catch (err) {
      totals.errors++
      console.error(`[reconcile] tenant ${tenant.slug} failed:`, err instanceof Error ? err.message : err)
    }

    // Per-tenant alert: if total fixed > threshold in 24h, log CRITICAL.
    const totalFixedThisRun = totals.missingPropertyFixed + totals.staleStatusFixed
    if (totalFixedThisRun > CRITICAL_THRESHOLD) {
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'reconciliation.high_discrepancy_count',
          resource: 'system',
          severity: 'CRITICAL',
          source: 'SYSTEM',
          payload: {
            tenantSlug: tenant.slug,
            missingPropertyFixed: totals.missingPropertyFixed,
            staleStatusFixed: totals.staleStatusFixed,
            threshold: CRITICAL_THRESHOLD,
            note: 'Webhooks may be silently dropping. Investigate.',
          },
        },
      }).catch(() => {})
    }
  }

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `[reconcile] done in ${durationSec}s — ` +
    `tenants=${totals.tenantsChecked} pipelines=${totals.pipelinesChecked} ` +
    `scanned=${totals.oppsScanned} missingFixed=${totals.missingPropertyFixed} ` +
    `staleFixed=${totals.staleStatusFixed} noOps=${totals.noOps} errors=${totals.errors}`
  )
}

main()
  .catch(err => {
    console.error('[reconcile] fatal:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
