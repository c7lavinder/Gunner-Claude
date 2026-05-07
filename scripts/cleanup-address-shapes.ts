#!/usr/bin/env -S npx tsx
// scripts/cleanup-address-shapes.ts
//
// Re-parses messy Property addresses using lib/address-parse.ts and persists
// the clean fields. Splits multi-property `&` rows into separate Property
// rows, sharing tenant + market + lane statuses but isolating the GHL contact
// linkage on the original (first) row only.
//
// Targets two row sets:
//   1. marketId IS NULL                       (52 rows — Pattern A + B)
//   2. address contains '&'                   (~114 rows — Pattern C)
//
// Default is DRY-RUN. Pass --apply to actually persist.
//
// Usage:
//   npx tsx scripts/cleanup-address-shapes.ts                   # dry-run, all
//   npx tsx scripts/cleanup-address-shapes.ts --apply           # persist
//   npx tsx scripts/cleanup-address-shapes.ts --tenant new-again-houses
//   npx tsx scripts/cleanup-address-shapes.ts --only-amp        # only & rows
//   npx tsx scripts/cleanup-address-shapes.ts --only-no-market  # only NULL marketId

import { db } from '../lib/db/client'
import type { Prisma } from '@prisma/client'
import { parsePropertyAddress } from '../lib/address-parse'
import { resolveMarketForZip } from '../lib/properties'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY_AMP = args.includes('--only-amp')
const ONLY_NO_MARKET = args.includes('--only-no-market')
// --scan-all: ignore the targeting OR-clause and run the parser on EVERY
// row, updating any row where the parser would produce a different
// {address, city, state, zip} than the row currently has. Use this to
// catch new pathological shapes that the targeted clauses miss.
const SCAN_ALL = args.includes('--scan-all')
const TENANT_SLUG = (() => {
  const i = args.indexOf('--tenant')
  return i >= 0 ? args[i + 1] : undefined
})()

interface RowAction {
  rowId: string
  before: { address: string; city: string | null; state: string | null; zip: string | null; marketId: string | null }
  after: { street: string; city: string; state: string; zip: string; marketId: string | null }
  splits: Array<{ street: string; city: string; state: string; zip: string }>
  action: 'parse_only' | 'parse_and_split' | 'parse_and_global_market' | 'no_change'
}

async function main() {
  console.log(
    `[cleanup-address] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} tenant=${TENANT_SLUG ?? 'all'} only_amp=${ONLY_AMP} only_no_market=${ONLY_NO_MARKET}`
  )

  const tenants = await db.tenant.findMany({
    where: TENANT_SLUG ? { slug: TENANT_SLUG } : {},
    select: { id: true, slug: true, name: true },
  })

  for (const tenant of tenants) {
    // Build the OR query against the row sets we care about. --scan-all
    // bypasses targeting and runs the parser against every Property in
    // the tenant — slower but catches every pathological shape including
    // zip-in-street where the structured fields are already set,
    // duplicate-comma cities, "///" separator, dual-city "&", etc.
    const where: Prisma.PropertyWhereInput = SCAN_ALL
      ? { tenantId: tenant.id }
      : (() => {
          const orClauses: Prisma.PropertyWhereInput[] = []
          if (!ONLY_AMP) orClauses.push({ marketId: null })
          if (!ONLY_NO_MARKET) orClauses.push({ address: { contains: '&' } })
          if (!ONLY_NO_MARKET) orClauses.push({ address: { contains: '/' } })
          // City contains comma (e.g. "Indianapolis, In 46203, IN 46203")
          if (!ONLY_NO_MARKET) orClauses.push({ city: { contains: ',' } })
          // Address has a 5-digit zip embedded (Pattern A — even when
          // structured fields are already set, the address column can
          // still be redundant junk like "1723 Whitney Dr Hanover Park,
          // Il 60133"). Postgres doesn't have a regex `contains` shortcut
          // in Prisma so we approximate with a broad `mode:'insensitive'`
          // string match; the parser then determines whether anything
          // actually changes.
          if (!ONLY_NO_MARKET) orClauses.push({ address: { contains: ', ', mode: 'insensitive' } })
          return { tenantId: tenant.id, OR: orClauses }
        })()

    const candidates = await db.property.findMany({
      where,
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        marketId: true,
        ghlContactId: true,
        leadSource: true,
        acqStatus: true,
        dispoStatus: true,
        longtermStatus: true,
        ghlAcqOppId: true,
        ghlDispoOppId: true,
        ghlLongtermOppId: true,
        // Stage names + entered-at need to copy onto splits too — skipping
        // them produced data-quality "Missing Stage" hits (Session 75
        // follow-up).
        ghlAcqStageName: true,
        ghlDispoStageName: true,
        ghlLongtermStageName: true,
        acqStageEnteredAt: true,
        dispoStageEnteredAt: true,
        longtermStageEnteredAt: true,
        assignedToId: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`\n[${tenant.slug}] ${candidates.length} candidate row(s)`)
    if (candidates.length === 0) continue

    const actions: RowAction[] = []
    let parsedNoChange = 0
    let parsedChanged = 0
    let splitRowsCreated = 0
    let globalMarketAssigned = 0

    for (const row of candidates) {
      const parsed = parsePropertyAddress(row.address, row.city, row.state, row.zip)
      const { primary, splits } = parsed

      // Resolve marketId from the parsed zip if currently NULL.
      let newMarketId = row.marketId
      let assignedGlobal = false
      if (!newMarketId) {
        if (primary.zip) {
          newMarketId = await resolveMarketForZip(tenant.id, primary.zip)
        } else {
          // No zip — fall back to the Global market (find-or-create).
          const global = await db.market.findFirst({ where: { tenantId: tenant.id, name: 'Global' }, select: { id: true } })
          if (global) {
            newMarketId = global.id
          } else if (APPLY) {
            const created = await db.market.create({ data: { tenantId: tenant.id, name: 'Global', zipCodes: [] } })
            newMarketId = created.id
          }
          assignedGlobal = true
        }
      }

      const hasFieldChange =
        primary.street !== (row.address ?? '') ||
        primary.city !== (row.city ?? '') ||
        primary.state !== (row.state ?? '') ||
        primary.zip !== (row.zip ?? '') ||
        newMarketId !== row.marketId

      const action: RowAction['action'] =
        splits.length > 0
          ? 'parse_and_split'
          : assignedGlobal && !hasFieldChange
          ? 'parse_and_global_market'
          : hasFieldChange
          ? 'parse_only'
          : 'no_change'

      if (action === 'no_change') {
        // Don't write log noise for unchanged rows.
        continue
      }

      actions.push({
        rowId: row.id,
        before: {
          address: row.address,
          city: row.city,
          state: row.state,
          zip: row.zip,
          marketId: row.marketId,
        },
        after: { ...primary, marketId: newMarketId },
        splits,
        action,
      })

      if (action === 'parse_only' || action === 'parse_and_global_market') parsedChanged++
      if (action === 'parse_and_split') {
        parsedChanged++
        splitRowsCreated += splits.length
      }
      if (assignedGlobal) globalMarketAssigned++

      // Apply mutations
      if (APPLY) {
        await db.property.update({
          where: { id: row.id, tenantId: tenant.id },
          data: {
            address: primary.street,
            city: primary.city,
            state: primary.state,
            zip: primary.zip,
            marketId: newMarketId,
          },
        })

        for (const split of splits) {
          // Resolve market for the split's zip (could differ in theory; in practice same).
          const splitMarketId = split.zip
            ? await resolveMarketForZip(tenant.id, split.zip)
            : newMarketId
          await db.property.create({
            data: {
              tenantId: tenant.id,
              address: split.street,
              city: split.city,
              state: split.state,
              zip: split.zip,
              marketId: splitMarketId,
              leadSource: row.leadSource,
              assignedToId: row.assignedToId,
              // Lane statuses copied so the split rows show in inventory chips
              // alongside the primary. GHL opp ids and contactId stay on the
              // primary only — the splits are independent of GHL until the
              // owner re-links them manually if desired.
              acqStatus: row.acqStatus,
              dispoStatus: row.dispoStatus,
              longtermStatus: row.longtermStatus,
              ghlAcqStageName: row.ghlAcqStageName,
              ghlDispoStageName: row.ghlDispoStageName,
              ghlLongtermStageName: row.ghlLongtermStageName,
              acqStageEnteredAt: row.acqStageEnteredAt,
              dispoStageEnteredAt: row.dispoStageEnteredAt,
              longtermStageEnteredAt: row.longtermStageEnteredAt,
              pendingEnrichment: false,
            },
          })
        }

        await db.auditLog.create({
          data: {
            tenantId: tenant.id,
            action: splits.length > 0 ? 'cleanup.address_split' : 'cleanup.address_parsed',
            resource: 'property',
            resourceId: row.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              before: {
                address: row.address, city: row.city, state: row.state, zip: row.zip, marketId: row.marketId,
              },
              after: { ...primary, marketId: newMarketId },
              splits,
            } as unknown as Prisma.InputJsonValue,
          },
        }).catch(err => console.error('[cleanup-address] audit write failed:', err instanceof Error ? err.message : err))
      }
    }

    parsedNoChange = candidates.length - actions.length
    console.log(
      `  parsed_changed=${parsedChanged}  no_change=${parsedNoChange}  ` +
      `split_rows_to_create=${splitRowsCreated}  global_market_assigned=${globalMarketAssigned}`
    )

    // Print per-row diff
    const printCap = parseInt(process.env.CLEANUP_PRINT_CAP ?? '500', 10)
    console.log(`\n  Sample diff (first ${printCap}):`)
    for (const a of actions.slice(0, printCap)) {
      const tag = a.action === 'parse_and_split' ? '✂ ' : a.action === 'parse_and_global_market' ? '🌐' : '✏ '
      console.log(`  ${tag} ${a.rowId.slice(0, 10)}…`)
      console.log(`     BEFORE | ${a.before.address} | ${a.before.city ?? ''} | ${a.before.state ?? ''} | ${a.before.zip ?? ''} | mkt=${a.before.marketId ? 'set' : 'NULL'}`)
      console.log(`     AFTER  | ${a.after.street} | ${a.after.city} | ${a.after.state} | ${a.after.zip} | mkt=${a.after.marketId ? 'set' : 'NULL'}`)
      for (const s of a.splits) {
        console.log(`        + NEW | ${s.street} | ${s.city} | ${s.state} | ${s.zip}`)
      }
    }
    if (actions.length > printCap) console.log(`  ... and ${actions.length - printCap} more`)

    console.log(
      `\n  ${APPLY ? 'APPLIED' : 'WOULD APPLY'}: ${parsedChanged} primary update(s), ${splitRowsCreated} split row(s) created`
    )
  }

  if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to persist.`)
}

main()
  .catch((err) => { console.error('[cleanup-address] fatal:', err); process.exit(1) })
  .finally(() => db.$disconnect())
