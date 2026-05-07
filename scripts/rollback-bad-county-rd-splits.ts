#!/usr/bin/env -S npx tsx
// scripts/rollback-bad-county-rd-splits.ts
//
// One-shot rollback. The space-jammed twin-street heuristic added during
// the 2026-05-07 cleanup over-split addresses where "Rd" was part of a
// "County Rd 1228" road designation rather than a street suffix.
//
// Identification: a cleanup.address_split audit row whose `splits`
// payload contains an entry whose street does NOT end with a known
// street-suffix word (St, Ave, Dr, Ln, Blvd, Ct, Cir, Pl, Ter, Trl,
// Pike, Pkwy, Way, Loop). The payload's BEFORE.address has the original
// combined string; restore it.
//
// For each bad audit:
//   1. Restore parent's address ← payload.before.address
//   2. Delete each child Property whose address matches a split (and
//      shares the parent's ghlContactId, scoped by tenant)
//   3. Delete the cleanup.address_split audit row + its companion
//      cleanup.split_linked / cleanup.split_stage_backfilled audits
//      for the deleted children
//
// Default DRY-RUN. Pass --apply to persist.

import { db } from '../lib/db/client'

const APPLY = process.argv.slice(2).includes('--apply')
// A "bad" split is one whose street has NO street-suffix word at all —
// the splits we're rolling back are fragments like "1228" or "318 Unit
// 5" that resulted from shredding "X County Rd Y" addresses.
const SUFFIX_RE = /\b(?:Rd|St|Ave|Dr|Ln|Blvd|Ct|Cir|Pl|Ter|Trl|Pike|Pkwy|Way|Loop|Hwy|Highway|Route|Rt|Rte|Sq|Cv|Aly|Xing|Path|Expy)\b/i

interface SplitPayload {
  before?: { address?: string; city?: string | null; state?: string | null; zip?: string | null; marketId?: string | null }
  after?: { street?: string; city?: string; state?: string; zip?: string }
  splits?: Array<{ street: string; city: string; state: string; zip: string }>
}

async function main() {
  console.log(`[rollback] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  // Look at audit rows from the last 6 hours — comfortable window for
  // the recent over-splits without picking up older legitimate ones.
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000)
  const audits = await db.auditLog.findMany({
    where: { action: 'cleanup.address_split', createdAt: { gte: cutoff } },
    select: { id: true, tenantId: true, resourceId: true, payload: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  let rollbackCount = 0
  let goodCount = 0
  let parentMissing = 0
  let childrenDeleted = 0
  let auditsDeleted = 0

  for (const audit of audits) {
    const tenantId = audit.tenantId!
    const payload = audit.payload as unknown as SplitPayload
    const splits = payload.splits ?? []

    // Identify "bad" audits: any split whose street doesn't end with a
    // street suffix (likely a fragment from over-splitting).
    const badSplit = splits.find(s => !SUFFIX_RE.test(s.street))
    if (!badSplit) {
      goodCount++
      continue
    }

    rollbackCount++
    console.log(
      `\n${APPLY ? 'ROLLBACK' : 'WOULD ROLLBACK'}: parent=${audit.resourceId?.slice(0, 12)}…\n` +
      `  before: "${payload.before?.address}"\n` +
      `  after:  "${payload.after?.street}" + ${splits.length} split(s): ${splits.map(s => `"${s.street}"`).join(', ')}`,
    )

    const parent = await db.property.findFirst({
      where: { id: audit.resourceId!, tenantId },
      select: { id: true, address: true, ghlContactId: true },
    })
    if (!parent) {
      parentMissing++
      console.log(`  parent not found — skipping`)
      continue
    }

    if (APPLY) {
      // 1. Restore parent's address
      if (payload.before?.address && parent.address !== payload.before.address) {
        await db.property.update({
          where: { id: parent.id, tenantId },
          data: {
            address: payload.before.address,
            city: payload.before.city ?? '',
            state: payload.before.state ?? '',
            zip: payload.before.zip ?? '',
            marketId: payload.before.marketId ?? null,
          },
        })
      }

      // 2. Delete each split child by (tenant, address, ghlContactId)
      for (const split of splits) {
        const child = await db.property.findFirst({
          where: {
            tenantId,
            address: split.street,
            ghlContactId: parent.ghlContactId,
            // Child created during this run (audit row is the proxy)
            createdAt: { gte: new Date(audit.createdAt.getTime() - 60_000) },
          },
          select: { id: true },
        })
        if (child) {
          // Delete companion audit rows first
          await db.auditLog.deleteMany({
            where: {
              tenantId,
              resourceId: child.id,
              action: { in: ['cleanup.split_linked', 'cleanup.split_stage_backfilled'] },
            },
          })
          // Cascade delete handles PropertySeller / milestones / etc.
          await db.property.deleteMany({ where: { id: child.id, tenantId } })
          childrenDeleted++
        }
      }

      // 3. Delete the bad cleanup.address_split audit
      await db.auditLog.deleteMany({ where: { id: audit.id } })
      auditsDeleted++
    }
  }

  console.log(
    `\n[rollback] ${APPLY ? 'rolled back' : 'would roll back'}: ${rollbackCount} bad audit row(s), ${goodCount} good (kept), ${parentMissing} parent not found`,
  )
  if (APPLY) {
    console.log(`[rollback] children deleted: ${childrenDeleted}, audits deleted: ${auditsDeleted}`)
  }
  if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
