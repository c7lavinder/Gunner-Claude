// scripts/regenerate-stories.ts
// Daily cron: regenerate Property Stories for properties with activity since
// the last story generation. Runs at 7am UTC per railway.toml.
//
// Regenerate when:
//   1. story was never generated (storyUpdatedAt IS NULL), AND the property
//      has at least one graded call (otherwise the generator would skip it)
//   2. the property was updated after its last story generation
//      (updatedAt > storyUpdatedAt) — catches new calls, milestones, offers,
//      blasts, stage changes, or any field edit since last run
//
// Bound: 150 properties per run. If more qualify, the next day catches them.
// Cost target: 150 × ~$0.015 ≈ $2.25/day max.

import { db } from '../lib/db/client'
import type { Prisma } from '@prisma/client'
import { generatePropertyStory } from '../lib/ai/generate-property-story'

const MAX_PER_RUN = 150
const ACTIVITY_LOOKBACK_DAYS = 30

interface Result {
  id: string
  address: string
  status: 'success' | 'skipped' | 'error'
  reason?: string
  ms: number
}

async function main() {
  const startedAt = Date.now()
  console.log('[Story Cron] Starting daily story regeneration...')

  const cutoff = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 86400000)

  // Properties where the story is stale relative to property activity.
  // updatedAt bumps on any property edit OR any related write that flows through
  // a property.update() — plus the generator itself bumps storyUpdatedAt on
  // success, so a successful run won't re-queue the same row.
  const candidates = await db.$queryRaw<Array<{ id: string; address: string }>>`
    SELECT id, address
    FROM properties
    WHERE updated_at > COALESCE(story_updated_at, '1970-01-01'::timestamp)
      AND updated_at > ${cutoff}
    ORDER BY updated_at DESC
    LIMIT ${MAX_PER_RUN}
  `

  console.log(`[Story Cron] ${candidates.length} candidates found (cap=${MAX_PER_RUN}, lookback=${ACTIVITY_LOOKBACK_DAYS}d)`)

  const results: Result[] = []

  for (const p of candidates) {
    const t0 = Date.now()
    try {
      const r = await generatePropertyStory(p.id)
      results.push({ id: p.id, address: p.address, status: r.status, reason: r.reason, ms: Date.now() - t0 })
      if (r.status === 'success') {
        console.log(`[Story Cron] ✓ ${p.address} (${Date.now() - t0}ms)`)
      } else {
        console.log(`[Story Cron] ${r.status === 'skipped' ? '-' : '✗'} ${p.address}: ${r.reason ?? r.status}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ id: p.id, address: p.address, status: 'error', reason: msg, ms: Date.now() - t0 })
      console.error(`[Story Cron] ✗ ${p.address}: ${msg}`)
    }
  }

  const counts = {
    success: results.filter(r => r.status === 'success').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    error: results.filter(r => r.status === 'error').length,
  }

  console.log(`[Story Cron] Done in ${Date.now() - startedAt}ms — ${counts.success} success, ${counts.skipped} skipped, ${counts.error} error`)

  await db.auditLog.create({
    data: {
      tenantId: null,
      action: 'cron.regenerate_stories.finished',
      resource: 'system',
      source: 'SYSTEM',
      severity: counts.error > 0 ? 'WARNING' : 'INFO',
      payload: {
        candidates: candidates.length,
        ...counts,
        durationMs: Date.now() - startedAt,
      } as unknown as Prisma.InputJsonValue,
    },
  }).catch(() => {})
}

main().catch(console.error).finally(() => process.exit(0))
