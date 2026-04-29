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
      createdAt: true, status: true, leadSource: true,
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
    console.log(`  ${p.address || '(no addr)'} ${p.city}, ${p.state} ${p.zip} — status=${p.status} source=${p.leadSource ?? '—'} created=${p.createdAt.toISOString().slice(0, 10)}`)
  }

  // ── Issue 3a — dispo pollution in status ──────────────────────────────────
  header('Issue 3a — properties with dispo value in `status` (should be acquisition-only)')
  const polluted = await db.property.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: DISPO_STATUSES as unknown as string[] as never },
    },
    select: {
      id: true, address: true, status: true, dispoStatus: true,
      ghlPipelineId: true, ghlPipelineStage: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })
  console.log(`Total rows with dispo-leak in status: ${polluted.length}`)
  const byStatus = polluted.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {})
  console.log('Breakdown:', byStatus)
  console.log('\nSample (first 15):')
  for (const p of polluted.slice(0, 15)) {
    console.log(`  ${p.address} — status=${p.status} dispoStatus=${p.dispoStatus ?? '—'} ghlStage=${p.ghlPipelineStage ?? '—'}`)
  }

  // ── Issue 3b — 1908 Breezy specifics ──────────────────────────────────────
  header('Issue 3b — 1908 Breezy full state + audit history')
  const breezy = await db.property.findMany({
    where: {
      tenantId: tenant.id,
      address: { contains: 'Breezy', mode: 'insensitive' },
    },
    select: {
      id: true, address: true, city: true, state: true, zip: true,
      status: true, dispoStatus: true,
      ghlPipelineId: true, ghlPipelineStage: true,
      ghlContactId: true, marketId: true,
      createdAt: true, updatedAt: true,
    },
  })
  for (const p of breezy) {
    console.log(`\nProperty ${p.id}`)
    console.log(`  ${p.address}, ${p.city}, ${p.state} ${p.zip}`)
    console.log(`  status=${p.status}  dispoStatus=${p.dispoStatus ?? '—'}`)
    console.log(`  ghlPipelineId=${p.ghlPipelineId ?? '—'}  ghlPipelineStage=${p.ghlPipelineStage ?? '—'}`)
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
  header('Issue 2 — sample: latest milestone per property (stageEnteredAt candidate)')
  const sample = await db.property.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true, address: true, status: true, dispoStatus: true, createdAt: true,
      milestones: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { type: true, createdAt: true },
      },
    },
  })
  for (const p of sample) {
    const latest = p.milestones[0]
    const domPipeline = Math.floor((Date.now() - p.createdAt.getTime()) / 86400000)
    const domStage = latest ? Math.floor((Date.now() - latest.createdAt.getTime()) / 86400000) : null
    console.log(`  ${p.address.padEnd(40)} status=${p.status.padEnd(18)} dispo=${(p.dispoStatus ?? '—').padEnd(18)} pipeline=${domPipeline}d  stage=${domStage !== null ? `${domStage}d (${latest.type})` : '— no milestone —'}`)
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
