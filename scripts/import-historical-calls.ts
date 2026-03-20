// scripts/import-historical-calls.ts
// Phase 2B: Import all historical GHL call conversations, grade them, recalculate TCP
// Usage:
//   npx tsx scripts/import-historical-calls.ts --dry-run     # show count only
//   npx tsx scripts/import-historical-calls.ts               # import + grade all
//   npx tsx scripts/import-historical-calls.ts --tenant=slug # specific tenant only

import { db } from '../lib/db/client'
import { getGHLClient } from '../lib/ghl/client'
import { gradeCall } from '../lib/ai/grading'
import { calculateTCP } from '../lib/ai/scoring'
import type { GHLConversation } from '../lib/ghl/client'

// ─── Config ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100               // GHL max per page
const GRADE_DELAY_MS = 2000         // 2s between gradings (rate limit: 60 req/min GHL + Anthropic)
const GHL_FETCH_DELAY_MS = 500      // 0.5s between GHL pagination requests
const MAX_PAGES = 50                // Safety cap: 50 pages × 100 = 5,000 conversations max

// ─── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const tenantSlugArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Fetch all call conversations with pagination ──────────────────────────────

async function fetchAllCallConversations(
  tenantId: string,
): Promise<GHLConversation[]> {
  const ghl = await getGHLClient(tenantId)
  const seenIds = new Set<string>()
  const allCalls: GHLConversation[] = []
  let startAfterId: string | undefined
  let page = 0

  while (page < MAX_PAGES) {
    page++
    console.log(`  [page ${page}] Fetching conversations${startAfterId ? ` after ${startAfterId.slice(0, 8)}...` : ''}`)

    const result = await ghl.getConversations({
      limit: PAGE_SIZE,
      startAfterId,
    })

    const conversations = result.conversations ?? []
    if (conversations.length === 0) break

    // Deduplicate: GHL pagination may return same results if startAfterId is ignored
    let newConvsThisPage = 0
    for (const conv of conversations) {
      if (seenIds.has(conv.id)) continue
      seenIds.add(conv.id)
      newConvsThisPage++

      if (conv.lastMessageType === 'TYPE_CALL') {
        allCalls.push(conv)
      }
    }

    console.log(`  [page ${page}] ${conversations.length} fetched, ${newConvsThisPage} new unique, ${allCalls.length} calls so far`)

    // If no new conversations on this page, pagination has stalled — stop
    if (newConvsThisPage === 0) {
      console.log(`  Pagination stalled (no new results). GHL may not support cursor pagination for this endpoint.`)
      break
    }

    // If we got fewer than PAGE_SIZE, we've reached the end
    if (conversations.length < PAGE_SIZE) break

    // Cursor for next page: last conversation's ID
    startAfterId = conversations[conversations.length - 1].id
    await sleep(GHL_FETCH_DELAY_MS)
  }

  console.log(`  Found ${allCalls.length} unique call conversations across ${page} page(s)`)
  return allCalls
}

// ─── Main import function ──────────────────────────────────────────────────────

async function importHistoricalCalls() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  GUNNER AI — Historical Call Import')
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE IMPORT'}`)
  console.log('═══════════════════════════════════════════════════════')
  console.log()

  try {
    // Find tenants with GHL connections
    const whereClause = {
      ghlAccessToken: { not: null as string | null },
      ghlLocationId: { not: null as string | null },
      ...(tenantSlugArg && { slug: tenantSlugArg }),
    }

    const tenants = await db.tenant.findMany({
      where: whereClause,
      select: { id: true, name: true, slug: true, ghlLocationId: true },
    })

    if (tenants.length === 0) {
      console.log(tenantSlugArg
        ? `No tenant found with slug "${tenantSlugArg}" and GHL connection`
        : 'No tenants with GHL connections found')
      process.exit(0)
    }

    let grandTotalNew = 0
    let grandTotalGraded = 0
    let grandTotalSkipped = 0
    let grandTotalFailed = 0

    for (const tenant of tenants) {
      console.log(`\n── Tenant: ${tenant.name} (${tenant.slug}) ──────────────`)

      // Step 1: Fetch all call conversations from GHL
      console.log('\n  Step 1: Fetching all call conversations from GHL...')
      const allCallConvs = await fetchAllCallConversations(tenant.id)

      if (allCallConvs.length === 0) {
        console.log('  No call conversations found. Skipping.')
        continue
      }

      // Step 2: Check which ones we already have
      console.log('\n  Step 2: Checking for existing records...')
      const existingCallIds = new Set(
        (await db.call.findMany({
          where: { tenantId: tenant.id },
          select: { ghlCallId: true },
        })).map(c => c.ghlCallId).filter(Boolean)
      )

      const newConvs = allCallConvs.filter(c => !existingCallIds.has(c.id))
      const skippedCount = allCallConvs.length - newConvs.length

      console.log(`  Total call conversations: ${allCallConvs.length}`)
      console.log(`  Already in DB:            ${skippedCount}`)
      console.log(`  New to import:            ${newConvs.length}`)

      grandTotalSkipped += skippedCount

      if (newConvs.length === 0) {
        console.log('  All calls already imported. Skipping.')
        continue
      }

      // DRY RUN: stop here
      if (DRY_RUN) {
        console.log('\n  [DRY RUN] Would import and grade these calls:')
        for (const conv of newConvs.slice(0, 10)) {
          const date = new Date(conv.lastMessageDate || conv.dateUpdated || 0)
          console.log(`    - ${conv.contactName || conv.phone || 'Unknown'} | ${conv.lastMessageDirection} | ${date.toLocaleDateString()}`)
        }
        if (newConvs.length > 10) {
          console.log(`    ... and ${newConvs.length - 10} more`)
        }
        grandTotalNew += newConvs.length
        continue
      }

      // Step 3: Get default user for this tenant (assign calls to first user)
      const defaultUser = await db.user.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true },
      })

      // Step 4: Create call records and grade them
      console.log(`\n  Step 3: Importing ${newConvs.length} calls...`)
      let imported = 0
      let graded = 0
      let failed = 0

      for (const conv of newConvs) {
        imported++
        const direction = conv.lastMessageDirection === 'inbound' ? 'INBOUND' : 'OUTBOUND'
        const calledAt = new Date(conv.lastMessageDate || conv.dateUpdated || Date.now())
        const contactLabel = conv.contactName || conv.phone || conv.id.slice(0, 8)

        try {
          // Create the call record
          const newCall = await db.call.create({
            data: {
              tenantId: tenant.id,
              ghlCallId: conv.id,
              assignedToId: defaultUser?.id ?? null,
              direction: direction as 'INBOUND' | 'OUTBOUND',
              calledAt,
              gradingStatus: 'PENDING',
            },
          })

          console.log(`  [${imported}/${newConvs.length}] Created: ${contactLabel} (${direction}, ${calledAt.toLocaleDateString()})`)

          // Grade the call
          try {
            await gradeCall(newCall.id)
            graded++
            console.log(`    ✓ Graded successfully`)
          } catch (gradeErr) {
            failed++
            console.error(`    ✗ Grading failed: ${gradeErr instanceof Error ? gradeErr.message : gradeErr}`)
          }

          // Rate limiting pause between calls
          if (imported < newConvs.length) {
            await sleep(GRADE_DELAY_MS)
          }
        } catch (createErr) {
          // Handle unique constraint violation (race condition with poll-calls)
          if (createErr instanceof Error && createErr.message.includes('Unique constraint')) {
            console.log(`  [${imported}/${newConvs.length}] Skipped (already exists): ${contactLabel}`)
            grandTotalSkipped++
            continue
          }
          failed++
          console.error(`  [${imported}/${newConvs.length}] Failed to create: ${contactLabel} — ${createErr instanceof Error ? createErr.message : createErr}`)
        }
      }

      grandTotalNew += imported
      grandTotalGraded += graded
      grandTotalFailed += failed

      // Step 5: Recalculate TCP for all properties with calls
      console.log('\n  Step 4: Recalculating TCP for properties with calls...')
      const propertiesWithCalls = await db.property.findMany({
        where: {
          tenantId: tenant.id,
          calls: { some: {} },
        },
        select: { id: true, address: true },
      })

      let tcpUpdated = 0
      for (const prop of propertiesWithCalls) {
        try {
          await calculateTCP(prop.id)
          tcpUpdated++
          console.log(`    ✓ TCP updated: ${prop.address}`)
        } catch (tcpErr) {
          console.error(`    ✗ TCP failed: ${prop.address} — ${tcpErr instanceof Error ? tcpErr.message : tcpErr}`)
        }
      }

      console.log(`\n  Tenant summary:`)
      console.log(`    Imported: ${imported}`)
      console.log(`    Graded:   ${graded}`)
      console.log(`    Failed:   ${failed}`)
      console.log(`    TCP recalculated: ${tcpUpdated} properties`)
    }

    // ─── Final report ────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('  IMPORT COMPLETE')
    console.log('═══════════════════════════════════════════════════════')
    if (DRY_RUN) {
      console.log(`  Mode:         DRY RUN`)
      console.log(`  Would import: ${grandTotalNew} new calls`)
      console.log(`  Already in DB: ${grandTotalSkipped} calls`)
    } else {
      console.log(`  Imported:      ${grandTotalNew} calls`)
      console.log(`  Graded:        ${grandTotalGraded} calls`)
      console.log(`  Failed:        ${grandTotalFailed} calls`)
      console.log(`  Skipped:       ${grandTotalSkipped} (already in DB)`)
    }
    console.log('═══════════════════════════════════════════════════════')

  } catch (err) {
    console.error('\n[FATAL]', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  process.exit(0)
}

importHistoricalCalls()
