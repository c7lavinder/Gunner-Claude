#!/usr/bin/env -S npx tsx
// scripts/backfill-split-stage-names.ts
//
// Session 75 cleanup-address-shapes.ts copied lane STATUSES onto split
// children but missed lane STAGE NAMES + ENTERED-AT timestamps. That left
// 3 rows where dispoStatus=CLOSED but ghlDispoStageName=null — flagged by
// the inventory data-quality "Missing Stage" tile.
//
// Fix: walk cleanup.address_split audit rows, find each child by address
// and ghlContactId, copy stage names + entered-at from the parent.
//
// Idempotent — only writes when the child's stage name fields are
// currently null AND the parent has a value.
//
// Default DRY-RUN. Pass --apply to persist.

import { db } from '../lib/db/client'

interface SplitAuditPayload {
  splits?: Array<{ street: string; city: string; state: string; zip: string }>
}

const APPLY = process.argv.slice(2).includes('--apply')

async function main() {
  console.log(`[backfill-split-stage] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const audits = await db.auditLog.findMany({
    where: { action: 'cleanup.address_split' },
    select: { id: true, tenantId: true, resourceId: true, payload: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  let updated = 0
  let unchanged = 0
  let parentMissing = 0
  let childMissing = 0

  for (const audit of audits) {
    const tenantId = audit.tenantId
    if (!tenantId) continue
    const payload = audit.payload as unknown as SplitAuditPayload
    const splitAddresses = payload.splits ?? []
    if (splitAddresses.length === 0) continue

    const parent = await db.property.findFirst({
      where: { id: audit.resourceId!, tenantId },
      select: {
        id: true, address: true, ghlContactId: true,
        ghlAcqStageName: true, ghlDispoStageName: true, ghlLongtermStageName: true,
        acqStageEnteredAt: true, dispoStageEnteredAt: true, longtermStageEnteredAt: true,
      },
    })
    if (!parent) { parentMissing++; continue }

    const parentHasStageName =
      parent.ghlAcqStageName || parent.ghlDispoStageName || parent.ghlLongtermStageName
    if (!parentHasStageName) {
      // Parent has no stage name itself — nothing to copy
      continue
    }

    for (const split of splitAddresses) {
      const child = await db.property.findFirst({
        where: {
          tenantId,
          address: split.street,
          city: split.city,
          state: split.state,
          zip: split.zip,
          ghlContactId: parent.ghlContactId,
          // Only target children that are missing stage names AND don't
          // have stage names of their own already
          ghlAcqStageName: null,
          ghlDispoStageName: null,
          ghlLongtermStageName: null,
        },
        select: { id: true, address: true },
      })
      if (!child) {
        childMissing++
        continue
      }

      console.log(
        `${APPLY ? '✓' : '·'} child=${child.id.slice(0, 12)}… "${child.address}" ← parent=${parent.id.slice(0, 12)}… ` +
        `acq="${parent.ghlAcqStageName}" dispo="${parent.ghlDispoStageName}" lt="${parent.ghlLongtermStageName}"`,
      )

      if (APPLY) {
        await db.property.update({
          where: { id: child.id, tenantId },
          data: {
            ghlAcqStageName: parent.ghlAcqStageName,
            ghlDispoStageName: parent.ghlDispoStageName,
            ghlLongtermStageName: parent.ghlLongtermStageName,
            acqStageEnteredAt: parent.acqStageEnteredAt,
            dispoStageEnteredAt: parent.dispoStageEnteredAt,
            longtermStageEnteredAt: parent.longtermStageEnteredAt,
          },
        })
        await db.auditLog.create({
          data: {
            tenantId,
            action: 'cleanup.split_stage_backfilled',
            resource: 'property',
            resourceId: child.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              parentId: parent.id,
              acqStageName: parent.ghlAcqStageName,
              dispoStageName: parent.ghlDispoStageName,
              longtermStageName: parent.ghlLongtermStageName,
            },
          },
        }).catch(() => { /* audit best-effort */ })
      }
      updated++
    }
  }

  console.log(`\n[backfill-split-stage] ${APPLY ? 'updated' : 'would update'}=${updated}  unchanged=${unchanged}  parent_missing=${parentMissing}  child_missing=${childMissing}`)
  if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
