#!/usr/bin/env -S npx tsx
// scripts/merge-duplicate-properties.ts
//
// Merge Property rows that share an identical canonical address (street
// + city + state + zip) within one tenant. Picks a "primary" row to keep
// based on which carries the most attached business data, re-points
// every foreign-key reference from the secondary rows onto the primary,
// fills in any column the primary has null/empty for from the secondary,
// then deletes the secondary rows.
//
// Primary-pick priority (in order, first non-tie wins):
//   1. Number of GHL opp ids set (acqOppId, dispoOppId, longtermOppId)
//   2. Number of attached calls
//   3. Number of attached milestones
//   4. Number of seller links
//   5. Has ghlContactId set (boolean)
//   6. Older createdAt (longer history)
//   7. Lower id lexically (deterministic tiebreak)
//
// Foreign keys re-pointed (in order):
//   Call.propertyId
//   Task.propertyId
//   WorkflowExecution.propertyId
//   ContactSuggestion.propertyId
//   PropertyMilestone.propertyId
//   DealBlast.propertyId
//   OutreachLog.propertyId
//   AuditLog.resourceId (where resource='property')
//   PropertySeller       — composite PK (propertyId, sellerId), updateMany
//                          would violate; createMany skipDuplicates onto
//                          primary then delete secondary's rows.
//   PropertyTeamMember   — composite UNIQUE (propertyId, userId), same.
//   PropertyBuyerStage   — composite UNIQUE (propertyId, buyerId), same.
//   PropertyPartner      — composite PK (propertyId, partnerId), same.
//
// Column-level merge: every column on the primary that is null/empty/0
// AND non-null/non-empty on the secondary gets the secondary's value.
// Primary's non-null values always win.
//
// Idempotent + transactional per group. Default DRY-RUN. Pass --apply.

import { db } from '../lib/db/client'
import type { Prisma } from '@prisma/client'

// Mirrors lib/properties.ts normalizeStreetAddress — keep in sync.
function normalizeStreetAddress(address: string): string {
  if (!address) return ''
  return address.toLowerCase().trim()
    .replace(/[.,#]+/g, '').replace(/\s+/g, ' ')
    .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr').replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl')
    .replace(/\bcircle\b/g, 'cir').replace(/\bnorth\b/g, 'n')
    .replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w')
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const TENANT_SLUG = (() => {
  const i = args.indexOf('--tenant')
  return i >= 0 ? args[i + 1] : 'new-again-houses'
})()

const PROPERTY_SELECT = {
  id: true, address: true, city: true, state: true, zip: true,
  ghlContactId: true, ghlAcqOppId: true, ghlDispoOppId: true, ghlLongtermOppId: true,
  acqStatus: true, dispoStatus: true, longtermStatus: true,
  ghlAcqStageName: true, ghlDispoStageName: true, ghlLongtermStageName: true,
  acqStageEnteredAt: true, dispoStageEnteredAt: true, longtermStageEnteredAt: true,
  createdAt: true, updatedAt: true,
  marketId: true, leadSource: true, assignedToId: true,
  arv: true, askingPrice: true, mao: true, contractPrice: true,
  assignmentFee: true, currentOffer: true, highestOffer: true,
  acceptedPrice: true, finalProfit: true,
  offerTypes: true, altPrices: true, fieldSources: true,
  distressScore: true, preForeclosure: true, bankOwned: true,
  inBankruptcy: true, inProbate: true, inDivorce: true,
  hasRecentEviction: true, taxDelinquent: true, foreclosureStatus: true,
  pendingEnrichment: true, ghlSyncLocked: true,
  _count: { select: { calls: true, milestones: true, sellers: true, tasks: true } },
} as const

type PropertyWithCounts = Prisma.PropertyGetPayload<{ select: typeof PROPERTY_SELECT }>

function score(p: PropertyWithCounts): [number, number, number, number, number, number, string] {
  const oppCount = [p.ghlAcqOppId, p.ghlDispoOppId, p.ghlLongtermOppId].filter(Boolean).length
  const callCount = p._count.calls
  const msCount = p._count.milestones
  const sellerCount = p._count.sellers
  const hasContact = p.ghlContactId ? 1 : 0
  const ageRank = -p.createdAt.getTime() // older is bigger (earlier negative)
  return [oppCount, callCount, msCount, sellerCount, hasContact, ageRank, p.id]
}

function pickPrimary(group: PropertyWithCounts[]): PropertyWithCounts {
  return [...group].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    for (let i = 0; i < sa.length - 1; i++) {
      if (sa[i] !== sb[i]) return (sb[i] as number) - (sa[i] as number)
    }
    // Tiebreak on id ASC (lexically lowest)
    return (sa[6] as string).localeCompare(sb[6] as string)
  })[0]
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'number') return v === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

async function mergeGroup(tenantId: string, group: PropertyWithCounts[]) {
  const primary = pickPrimary(group)
  const secondaries = group.filter(p => p.id !== primary.id)

  console.log(
    `\n${APPLY ? 'MERGE' : 'WOULD MERGE'} group "${primary.address}" (${primary.city}/${primary.state}/${primary.zip}):`,
  )
  console.log(
    `  primary  ${primary.id.slice(0, 12)}…  opps=${[primary.ghlAcqOppId, primary.ghlDispoOppId, primary.ghlLongtermOppId].filter(Boolean).length}  calls=${primary._count.calls}  ms=${primary._count.milestones}  sellers=${primary._count.sellers}  contact=${primary.ghlContactId ? 'set' : 'NULL'}`,
  )
  for (const s of secondaries) {
    console.log(
      `   ↑ merge ${s.id.slice(0, 12)}…  opps=${[s.ghlAcqOppId, s.ghlDispoOppId, s.ghlLongtermOppId].filter(Boolean).length}  calls=${s._count.calls}  ms=${s._count.milestones}  sellers=${s._count.sellers}  contact=${s.ghlContactId ? 'set' : 'NULL'}`,
    )
  }

  if (!APPLY) return { merged: secondaries.length }

  return await db.$transaction(async (tx) => {
    for (const sec of secondaries) {
      // Re-point simple FK references with updateMany.
      await tx.call.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.task.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.workflowExecution.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.contactSuggestion.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.propertyMilestone.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.dealBlast.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.outreachLog.updateMany({ where: { propertyId: sec.id, tenantId }, data: { propertyId: primary.id } })
      await tx.auditLog.updateMany({
        where: { resourceId: sec.id, resource: 'property', tenantId },
        data: { resourceId: primary.id },
      })

      // Composite-PK joins: copy each row onto primary via createMany
      // skipDuplicates (which Prisma compiles to `ON CONFLICT DO NOTHING`
      // for Postgres — no transaction abort on collision), then delete
      // every row that points at the secondary.
      const sellerLinks = await tx.propertySeller.findMany({ where: { propertyId: sec.id } })
      if (sellerLinks.length > 0) {
        await tx.propertySeller.createMany({
          data: sellerLinks.map(l => ({ propertyId: primary.id, sellerId: l.sellerId, isPrimary: false, role: l.role })),
          skipDuplicates: true,
        })
        await tx.propertySeller.deleteMany({ where: { propertyId: sec.id } })
      }
      const teamLinks = await tx.propertyTeamMember.findMany({ where: { propertyId: sec.id } })
      if (teamLinks.length > 0) {
        await tx.propertyTeamMember.createMany({
          data: teamLinks.map(l => ({ propertyId: primary.id, userId: l.userId, tenantId: l.tenantId, role: l.role, source: l.source })),
          skipDuplicates: true,
        })
        await tx.propertyTeamMember.deleteMany({ where: { propertyId: sec.id } })
      }
      const buyerStages = await tx.propertyBuyerStage.findMany({ where: { propertyId: sec.id } })
      if (buyerStages.length > 0) {
        await tx.propertyBuyerStage.createMany({
          data: buyerStages.map(b => {
            const { id: _id, createdAt: _c, updatedAt: _u, inspectionIssues, ...rest } = b
            return {
              ...rest,
              propertyId: primary.id,
              inspectionIssues: (inspectionIssues ?? []) as Prisma.InputJsonValue,
            }
          }),
          skipDuplicates: true,
        })
        await tx.propertyBuyerStage.deleteMany({ where: { propertyId: sec.id } })
      }
      const partnerLinks = await tx.propertyPartner.findMany({ where: { propertyId: sec.id } })
      if (partnerLinks.length > 0) {
        await tx.propertyPartner.createMany({
          data: partnerLinks.map(p => ({ propertyId: primary.id, partnerId: p.partnerId, role: p.role })),
          skipDuplicates: true,
        })
        await tx.propertyPartner.deleteMany({ where: { propertyId: sec.id } })
      }

      // Column-level merge: for each tracked column, if primary is empty
      // and secondary has a value, copy the secondary's value.
      const primaryFresh = await tx.property.findUniqueOrThrow({ where: { id: primary.id }, select: PROPERTY_SELECT })
      const secFresh = await tx.property.findUniqueOrThrow({ where: { id: sec.id }, select: PROPERTY_SELECT })
      const updates: Record<string, unknown> = {}
      const fieldsToMerge = [
        'ghlContactId', 'ghlAcqOppId', 'ghlDispoOppId', 'ghlLongtermOppId',
        'acqStatus', 'dispoStatus', 'longtermStatus',
        'ghlAcqStageName', 'ghlDispoStageName', 'ghlLongtermStageName',
        'acqStageEnteredAt', 'dispoStageEnteredAt', 'longtermStageEnteredAt',
        'leadSource', 'assignedToId', 'marketId',
        'arv', 'askingPrice', 'mao', 'contractPrice',
        'assignmentFee', 'currentOffer', 'highestOffer',
        'acceptedPrice', 'finalProfit',
        'distressScore', 'foreclosureStatus',
      ]
      for (const f of fieldsToMerge) {
        const pv = (primaryFresh as Record<string, unknown>)[f]
        const sv = (secFresh as Record<string, unknown>)[f]
        if (isEmpty(pv) && !isEmpty(sv)) updates[f] = sv
      }
      // Booleans: only copy if secondary is true and primary is false (more-info wins)
      for (const f of ['preForeclosure', 'bankOwned', 'inBankruptcy', 'inProbate', 'inDivorce', 'hasRecentEviction', 'taxDelinquent']) {
        const pv = (primaryFresh as Record<string, unknown>)[f]
        const sv = (secFresh as Record<string, unknown>)[f]
        if (pv === false && sv === true) updates[f] = true
      }
      if (Object.keys(updates).length > 0) {
        await tx.property.update({ where: { id: primary.id, tenantId }, data: updates })
      }

      // Audit the merge before deleting the secondary.
      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'cleanup.duplicate_merged',
          resource: 'property',
          resourceId: primary.id,
          severity: 'INFO',
          source: 'SYSTEM',
          payload: {
            primaryId: primary.id,
            mergedFromId: sec.id,
            mergedFromAddress: sec.address,
            fieldsCopied: Object.keys(updates),
          },
        },
      })

      // Delete the secondary. Cascades on remaining FK columns are now
      // safe (we re-pointed all references above).
      await tx.property.delete({ where: { id: sec.id } })
    }
    return { merged: secondaries.length }
  }, { timeout: 60_000, maxWait: 10_000 })
}

async function main() {
  console.log(`[merge-duplicates] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} tenant=${TENANT_SLUG}`)

  const tenant = await db.tenant.findFirst({ where: { slug: TENANT_SLUG }, select: { id: true } })
  if (!tenant) throw new Error(`tenant ${TENANT_SLUG} not found`)

  const rows = await db.property.findMany({
    where: { tenantId: tenant.id },
    select: PROPERTY_SELECT,
    orderBy: { createdAt: 'asc' },
  })

  // Group by canonical key — uses the same normalizer as the live dedup
  // path in lib/properties.ts so "Dr" vs "Drive" / "St" vs "Street" cluster
  // together. City is intentionally dropped from the key (zip is firmer and
  // city varies for properties straddling municipal lines, e.g. Knoxville
  // vs Farragut for 37934). State + zip + normalized street is strict
  // enough to avoid false positives while catching the real-world dups
  // we've seen from GHL.
  const groups = new Map<string, PropertyWithCounts[]>()
  for (const r of rows) {
    const norm = normalizeStreetAddress(r.address ?? '')
    if (!norm) continue
    const canon = `${norm}|${(r.state ?? '').toUpperCase()}|${r.zip ?? ''}`
    const arr = groups.get(canon) ?? []
    arr.push(r)
    groups.set(canon, arr)
  }
  const dupGroups = [...groups.values()].filter(g => g.length > 1)
  console.log(`[merge-duplicates] ${dupGroups.length} duplicate group(s) covering ${dupGroups.reduce((s, g) => s + g.length, 0)} rows`)

  let totalMerged = 0
  for (const group of dupGroups) {
    const result = await mergeGroup(tenant.id, group)
    totalMerged += result.merged
  }

  console.log(`\n[merge-duplicates] ${APPLY ? 'merged' : 'would merge'} ${totalMerged} secondary row(s) into ${dupGroups.length} primary row(s)`)
  if (!APPLY) console.log(`Dry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
