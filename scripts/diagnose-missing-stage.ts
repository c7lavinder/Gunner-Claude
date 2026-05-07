#!/usr/bin/env -S npx tsx
// scripts/diagnose-missing-stage.ts
// The Inventory data-quality "Missing Stage" tile counts properties where
//   effectiveStatus(p) === 'NEW_LEAD'  AND  effectiveStageName(p) === null
// i.e. acqStatus=NEW_LEAD with NO stage name in any lane. Fall back when
// dispoStatus and longtermStatus are also empty (the typical NEW_LEAD shape).
//
// Dump every offender + check whether GHL has a stage name we could fill.

import { db } from '../lib/db/client'
import { effectiveStatus, effectiveStageName } from '../lib/property-status'

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } })
  for (const tenant of tenants) {
    const rows = await db.property.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true, address: true, city: true, state: true, zip: true,
        acqStatus: true, dispoStatus: true, longtermStatus: true,
        ghlAcqStageName: true, ghlDispoStageName: true, ghlLongtermStageName: true,
        ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
        ghlContactId: true, createdAt: true,
      },
    })

    // Match the inventory page's default filter: only visible rows count
    // toward the data-quality tile.
    const offenders = rows.filter(p => {
      const isVisible = p.acqStatus !== null || p.dispoStatus !== null || p.longtermStatus !== null
      if (!isVisible) return false
      return effectiveStatus(p) === 'NEW_LEAD' && effectiveStageName(p) === null
    })
    if (offenders.length === 0) {
      console.log(`[${tenant.slug}] 0 offenders`)
      continue
    }
    console.log(`\n=== ${tenant.slug}: ${offenders.length} missing-stage row(s) ===\n`)

    for (const r of offenders) {
      console.log(
        `${r.id.slice(0, 12)}…  "${r.address}" | ${r.city}, ${r.state} ${r.zip}\n` +
        `   acqStatus=${r.acqStatus} dispoStatus=${r.dispoStatus} longtermStatus=${r.longtermStatus}\n` +
        `   acqStageName=${JSON.stringify(r.ghlAcqStageName)} dispoStageName=${JSON.stringify(r.ghlDispoStageName)} longtermStageName=${JSON.stringify(r.ghlLongtermStageName)}\n` +
        `   acqOppId=${r.ghlAcqOppId ?? 'null'} dispoOppId=${r.ghlDispoOppId ?? 'null'} longtermOppId=${r.ghlLongtermOppId ?? 'null'}\n` +
        `   ghlContactId=${r.ghlContactId ?? 'null'} createdAt=${r.createdAt.toISOString()}`
      )
    }

  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
