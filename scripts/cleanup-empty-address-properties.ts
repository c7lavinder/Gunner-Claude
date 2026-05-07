#!/usr/bin/env -S npx tsx
// scripts/cleanup-empty-address-properties.ts
//
// Deletes Property rows where address is empty / NULL. Mirrors the
// Session 73 cleanup of 127 stub rows; this is the follow-up sweep
// for the 49 stragglers created by reconciliation BEFORE commit
// c8fe3e3 ("skip missing-property when no address1") landed.
//
// Default is DRY-RUN. Pass --apply to actually delete. Pass --tenant <slug>
// to scope to a single tenant.
//
// Cascade safety: Property foreign keys are either onDelete: Cascade
// (PropertyMilestone, PropertyPartner, PropertyBuyerStage, PropertyTeamMember,
// PropertySeller, PropertyOffer, etc.) or String? (Call.propertyId, etc.) —
// no row gets orphaned in a way Prisma can't handle. Verified
// 2026-05-07 from prisma/schema.prisma.
//
// Run:
//   Dry-run (default):
//     npx tsx scripts/cleanup-empty-address-properties.ts
//   Apply:
//     npx tsx scripts/cleanup-empty-address-properties.ts --apply
//   Tenant-scoped:
//     npx tsx scripts/cleanup-empty-address-properties.ts --tenant new-again-houses

import { db } from '../lib/db/client'

const APPLY = process.argv.includes('--apply')
const TENANT_SLUG = (() => {
  const i = process.argv.indexOf('--tenant')
  return i >= 0 ? process.argv[i + 1] : undefined
})()

async function main() {
  console.log(
    `[cleanup-empty-address] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} tenant=${TENANT_SLUG ?? 'all'}`
  )

  const tenants = await db.tenant.findMany({
    where: TENANT_SLUG ? { slug: TENANT_SLUG } : undefined,
    select: { id: true, slug: true, name: true },
  })

  let totalCandidates = 0
  let totalDeleted = 0

  for (const tenant of tenants) {
    const candidates = await db.property.findMany({
      where: {
        tenantId: tenant.id,
        address: '',
      },
      select: {
        id: true,
        ghlContactId: true,
        createdAt: true,
        pendingEnrichment: true,
        acqStatus: true,
        dispoStatus: true,
        longtermStatus: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (candidates.length === 0) {
      console.log(`[${tenant.slug}] 0 empty-address rows`)
      continue
    }

    totalCandidates += candidates.length
    console.log(
      `\n[${tenant.slug}] ${candidates.length} empty-address Property rows`
    )
    console.log(
      `  oldest: ${candidates[0].createdAt.toISOString()} | newest: ${candidates[candidates.length - 1].createdAt.toISOString()}`
    )
    const pendingCount = candidates.filter((c) => c.pendingEnrichment).length
    console.log(
      `  pendingEnrichment=true: ${pendingCount} | pendingEnrichment=false: ${candidates.length - pendingCount}`
    )
    const sample = candidates.slice(0, 5).map((c) => ({
      id: c.id.slice(0, 8),
      ghlContactId: c.ghlContactId?.slice(0, 12) ?? null,
      createdAt: c.createdAt.toISOString().slice(0, 19),
      pending: c.pendingEnrichment,
      acq: c.acqStatus,
      dispo: c.dispoStatus,
      lt: c.longtermStatus,
    }))
    console.log(`  sample (first 5):`)
    for (const s of sample) {
      console.log(
        `    ${s.id}… contact=${s.ghlContactId ?? 'null'}… created=${s.createdAt} pending=${s.pending} acq=${s.acq} dispo=${s.dispo} lt=${s.lt}`
      )
    }

    if (!APPLY) continue

    const ids = candidates.map((c) => c.id)
    const result = await db.property.deleteMany({
      where: { tenantId: tenant.id, id: { in: ids } },
    })
    totalDeleted += result.count
    console.log(`  ✓ deleted ${result.count}`)

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'cleanup.empty_address_properties',
        resource: 'property',
        severity: 'INFO',
        source: 'SYSTEM',
        payload: {
          deleted: result.count,
          ids: ids.slice(0, 20), // first 20 ids for traceability; full list in script log
          totalCandidates: candidates.length,
        },
      },
    })
  }

  console.log(
    `\n[cleanup-empty-address] ${APPLY ? 'DELETED' : 'WOULD DELETE'} ${APPLY ? totalDeleted : totalCandidates} rows across ${tenants.length} tenant(s)`
  )

  if (!APPLY && totalCandidates > 0) {
    console.log(
      `\nDry-run only. Re-run with --apply to actually delete.`
    )
  }
}

main()
  .catch((err) => {
    console.error('[cleanup-empty-address] fatal:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
