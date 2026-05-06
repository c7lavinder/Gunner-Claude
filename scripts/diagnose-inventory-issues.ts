// Read-only diagnostic for inventory-page cleanup session.
// Covers:
//   (1) properties with zip but no marketId
//   (2) properties with disposition values polluted into `status`
//   (3) 1908 Breezy full state + audit history
//   (4) sample "latest milestone" per property to confirm it can stand in for stageEnteredAt
//
// Run: npx tsx scripts/diagnose-inventory-issues.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DISPO_STATUSES = ['IN_DISPOSITION', 'DISPO_PUSHED', 'DISPO_OFFERS', 'DISPO_CONTRACTED', 'DISPO_CLOSED'] as const

function header(label: string) {
  console.log('\n' + '─'.repeat(72))
  console.log(label)
  console.log('─'.repeat(72))
}

async function main() {
  const tenants = await db.tenant.findMany({
    select: { id: true, slug: true, name: true, ghlLocationId: true },
  })
  if (tenants.length === 0) {
    console.log('No tenants found.')
    return
  }
  // Pick a tenant by GHL location ID (override via env), else default to first tenant.
  const targetLocationId = process.env.DIAGNOSE_GHL_LOCATION_ID ?? ''
  const tenant = (targetLocationId && tenants.find(t => t.ghlLocationId === targetLocationId)) || tenants[0]
  console.log(`Diagnosing tenant: ${tenant.name} (${tenant.slug}) — ${tenant.id}`)

  // ── Issue 1 — zip without market ───────────────────────────────────────────
  header('Issue 1 — properties with zip but no marketId')
  const noMarket = await db.property.findMany({
    where: {
      tenantId: tenant.id,
      marketId: null,
      zip: { not: '' },
    },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      createdAt: true, acqStatus: true, dispoStatus: true, longtermStatus: true, leadSource: true,
      ghlContactId: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`Total rows: ${noMarket.length}`)
  const zipGroups = noMarket.reduce<Record<string, number>>((acc, p) => {
    acc[p.zip] = (acc[p.zip] ?? 0) + 1
    return acc
  }, {})
  console.log('\nGrouped by zip:')
  for (const [zip, count] of Object.entries(zipGroups).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${zip}: ${count}`)
  }

  // For each distinct zip, check which markets would match
  const uniqueZips = Object.keys(zipGroups)
  const existingMarkets = await db.market.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, zipCodes: true },
  })
  console.log(`\nTenant has ${existingMarkets.length} markets configured: ${existingMarkets.map(m => m.name).join(', ') || '(none)'}`)

  console.log('\nZip → would-match market (from db.market.zipCodes):')
  for (const zip of uniqueZips) {
    const matches = existingMarkets.filter(m => (m.zipCodes ?? []).includes(zip))
    console.log(`  ${zip}: ${matches.length > 0 ? matches.map(m => m.name).join(', ') : '— no match —'}`)
  }

  // Try config fallback
  try {
    const { getMarketsForZip, MARKETS } = await import('@/lib/config/crm.config')
    console.log(`\nConfig MARKETS defined: ${Object.keys(MARKETS).join(', ')}`)
    console.log('\nZip → would-match market (from config/crm.config MARKETS):')
    for (const zip of uniqueZips) {
      const names = getMarketsForZip(zip)
      console.log(`  ${zip}: ${names.length > 0 ? names.join(', ') : '— no config match —'}`)
    }
  } catch (err) {
    console.log(`\nConfig import failed: ${err instanceof Error ? err.message : err}`)
  }

  console.log('\nSample (first 10):')
  for (const p of noMarket.slice(0, 10)) {
    console.log(`  ${p.address || '(no addr)'} ${p.city}, ${p.state} ${p.zip} — acq=${p.acqStatus ?? '—'} dispo=${p.dispoStatus ?? '—'} longterm=${p.longtermStatus ?? '—'} source=${p.leadSource ?? '—'} created=${p.createdAt.toISOString().slice(0, 10)}`)
  }

  // ── Issue 3a — DEPRECATED ─────────────────────────────────────────────────
  // Phase 1 of GHL multi-pipeline redesign moved dispo to its own column
  // (dispoStatus). The "dispo value in status" pollution this check looked
  // for is structurally impossible under the new schema. Kept as a no-op.
  header('Issue 3a — DEPRECATED (Phase 1 strict-lane writes prevent this)')
  console.log('  No-op. Each lane writes only its own column under the new model.')

  // ── Issue 3b — 1908 Breezy specifics ──────────────────────────────────────
  header('Issue 3b — 1908 Breezy full state + audit history')
  const breezy = await db.property.findMany({
    where: {
      tenantId: tenant.id,
      address: { contains: 'Breezy', mode: 'insensitive' },
    },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      acqStatus: true, dispoStatus: true, longtermStatus: true,
      ghlAcqOppId: true, ghlAcqStageName: true,
      ghlDispoOppId: true, ghlDispoStageName: true,
      ghlContactId: true, marketId: true,
      createdAt: true, updatedAt: true,
    },
  })
  for (const p of breezy) {
    console.log(`\nProperty ${p.id}`)
    console.log(`  ${p.address}, ${p.city}, ${p.state} ${p.zip}`)
    console.log(`  acqStatus=${p.acqStatus ?? '—'}  dispoStatus=${p.dispoStatus ?? '—'}  longtermStatus=${p.longtermStatus ?? '—'}`)
    console.log(`  ghlAcqOpp=${p.ghlAcqOppId ?? '—'}  ghlAcqStage=${p.ghlAcqStageName ?? '—'}`)
    console.log(`  ghlDispoOpp=${p.ghlDispoOppId ?? '—'}  ghlDispoStage=${p.ghlDispoStageName ?? '—'}`)
    console.log(`  contactId=${p.ghlContactId ?? '—'}  marketId=${p.marketId ?? '—'}`)
    console.log(`  created=${p.createdAt.toISOString()}  updated=${p.updatedAt.toISOString()}`)

    const milestones = await db.propertyMilestone.findMany({
      where: { propertyId: p.id },
      orderBy: { createdAt: 'asc' },
      select: { type: true, source: true, createdAt: true },
    })
    console.log(`  milestones (${milestones.length}):`)
    for (const m of milestones) {
      console.log(`    ${m.createdAt.toISOString()} — ${m.type} (${m.source})`)
    }

    const audits = await db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { resourceId: p.id },
          { resource: { contains: p.id } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, action: true, source: true, severity: true, payload: true },
      take: 50,
    })
    console.log(`  audit entries (${audits.length}):`)
    for (const a of audits) {
      const payloadSummary = a.payload && typeof a.payload === 'object'
        ? JSON.stringify(a.payload).slice(0, 140)
        : '—'
      console.log(`    ${a.createdAt.toISOString()} [${a.severity}] ${a.action} (${a.source}) ${payloadSummary}`)
    }
  }

  // ── Issue 2 — sample latest-milestone-per-property to sanity check ────────
  header('Issue 2 — sample: latest milestone per property (per-lane stage entered-at)')
  const sample = await db.property.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true, address: true, acqStatus: true, dispoStatus: true, longtermStatus: true, createdAt: true,
    },
  })
  const sampleMilestones = await db.propertyMilestone.findMany({
    where: { propertyId: { in: sample.map(p => p.id) } },
    orderBy: { createdAt: 'desc' },
    select: { propertyId: true, type: true, createdAt: true },
  })
  const latestByProperty = new Map<string, { type: string; createdAt: Date }>()
  for (const m of sampleMilestones) {
    if (!latestByProperty.has(m.propertyId)) latestByProperty.set(m.propertyId, m)
  }
  for (const p of sample) {
    const latest = latestByProperty.get(p.id)
    const acq = p.acqStatus ?? '—'
    const dispo = p.dispoStatus ?? '—'
    const lt = p.longtermStatus ?? '—'
    const domPipeline = Math.floor((Date.now() - p.createdAt.getTime()) / 86400000)
    const domStage = latest ? Math.floor((Date.now() - latest.createdAt.getTime()) / 86400000) : null
    console.log(`  ${p.address.padEnd(40)} acq=${acq.padEnd(18)} dispo=${dispo.padEnd(18)} lt=${lt.padEnd(12)} pipeline=${domPipeline}d  stage=${domStage !== null ? `${domStage}d (${latest!.type})` : '— no milestone —'}`)
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
