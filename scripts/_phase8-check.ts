// scripts/_phase8-check.ts
//
// 1-shot read-only diagnostic for Phase 8 of the LLM Rewiring Plan
// (Session 89, 2026-05-13). Verifies the drift-signal wiring is healthy:
//
//   1. The `prompt_version` column exists on `ai_logs` (migration ran).
//   2. New ai_logs rows are landing with non-null prompt_version.
//   3. Coverage breakdown per ai_logs.type — which surfaces are stamping
//      versions, and which are still writing NULL (suggests a missed wire).
//
// Usage:
//   npx tsx scripts/_phase8-check.ts
//
// Per the _baseline-prompts.ts / _phase6-signoff.ts convention:
//   DELETE this script once Phase 8 is signed off and Phase 9 picks up
//   the drift-report tooling. It's a one-time post-deploy check.
//
// Output: pure stdout. No DB writes. No AI calls. Cost: $0.

import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

async function main() {
  console.log('═══ Phase 8 health check — ai_logs.prompt_version ═══\n')

  // ── 1. Column exists? ────────────────────────────────────────────────
  const columnCheck = await db.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'ai_logs' AND column_name = 'prompt_version'
    ) AS exists
  `)
  const columnExists = columnCheck[0]?.exists ?? false

  if (!columnExists) {
    console.log('❌ Column ai_logs.prompt_version does NOT exist.')
    console.log('   The migration 20260513200000_add_ai_log_prompt_version has not run.')
    console.log('   Run: npm run db:migrate:prod')
    console.log('   logAiCall will catch the resulting P2022 error and degrade gracefully —')
    console.log('   AI surfaces keep working, but new log rows lose the drift signal.\n')
    await db.$disconnect()
    process.exit(1)
  }

  console.log('✓ Column ai_logs.prompt_version exists.\n')

  // ── 2. Composite index exists? ──────────────────────────────────────
  const indexCheck = await db.$queryRaw<{ exists: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'ai_logs' AND indexname = 'ai_logs_type_prompt_version_idx'
    ) AS exists
  `)
  console.log(`${indexCheck[0]?.exists ? '✓' : '⚠'} Composite index (type, prompt_version) ${indexCheck[0]?.exists ? 'present' : 'MISSING — drift queries will be slow'}.\n`)

  // ── 3. Overall fill rate over the last 24h / 7d ──────────────────────
  const fillRate = await db.$queryRaw<{
    window: string
    total: bigint
    versioned: bigint
    unversioned: bigint
  }[]>(Prisma.sql`
    SELECT
      '24h' AS window,
      COUNT(*)::bigint AS total,
      COUNT(prompt_version)::bigint AS versioned,
      (COUNT(*) - COUNT(prompt_version))::bigint AS unversioned
    FROM ai_logs
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT
      '7d',
      COUNT(*)::bigint,
      COUNT(prompt_version)::bigint,
      (COUNT(*) - COUNT(prompt_version))::bigint
    FROM ai_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `)
  console.log('Fill rate (rows with a non-null prompt_version):')
  for (const r of fillRate) {
    const total = Number(r.total)
    const versioned = Number(r.versioned)
    const pct = total > 0 ? ((versioned / total) * 100).toFixed(1) : '—'
    console.log(`  ${r.window.padEnd(4)}: ${versioned}/${total} (${pct}%) versioned · ${r.unversioned} unversioned`)
  }
  console.log()

  // ── 4. Per-(type, pageContext-bucket) breakdown over last 7d ─────────
  // Splits property_enrich into user-profile vs property paths via
  // pageContext prefix matching (Section 30i clarification).
  const byType = await db.$queryRaw<{
    type: string
    bucket: string
    versions: string
    total: bigint
  }[]>(Prisma.sql`
    SELECT
      type::text AS type,
      CASE
        WHEN page_context LIKE 'user-profile:%' THEN 'user-profile'
        WHEN page_context LIKE 'property:%' AND type = 'property_enrich' THEN 'property-enrich'
        WHEN page_context LIKE 'call:%' AND type = 'property_enrich' THEN 'property-suggestions'
        WHEN page_context = 'session_summary' THEN 'session-summarizer'
        WHEN page_context = 'coach' THEN 'coach'
        WHEN page_context LIKE 'call:%' AND type = 'next_steps' THEN 'next-steps'
        WHEN page_context LIKE 'buyer:%' THEN 'buyer-response'
        ELSE 'other'
      END AS bucket,
      COALESCE(STRING_AGG(DISTINCT COALESCE(prompt_version, '⟨null⟩'), ', ' ORDER BY COALESCE(prompt_version, '⟨null⟩')), '⟨none⟩') AS versions,
      COUNT(*)::bigint AS total
    FROM ai_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY type, bucket
    ORDER BY type, bucket
  `)
  if (byType.length === 0) {
    console.log('No ai_logs rows in the last 7 days — service is idle.\n')
  } else {
    console.log('Per (type, bucket) in last 7d — versions seen + row count:')
    console.log('  type                  bucket               total  versions')
    console.log('  ' + '─'.repeat(78))
    for (const r of byType) {
      console.log(`  ${r.type.padEnd(22)} ${r.bucket.padEnd(20)} ${String(r.total).padStart(6)}  ${r.versions}`)
    }
    console.log()
  }

  // ── 5. Surfaces with NULL prompt_version that should be versioned ────
  const nullByType = await db.$queryRaw<{ type: string; count: bigint }[]>(Prisma.sql`
    SELECT type::text AS type, COUNT(*)::bigint AS count
    FROM ai_logs
    WHERE prompt_version IS NULL AND created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY type
    HAVING COUNT(*) > 0
    ORDER BY count DESC
  `)
  if (nullByType.length > 0) {
    console.log('⚠ Types with NULL prompt_version in last 24h (post-deploy these should be 0):')
    for (const r of nullByType) {
      console.log(`  ${r.type.padEnd(22)} ${r.count}`)
    }
    console.log('  → Check the corresponding logAiCall site for a missing promptVersion field.\n')
  } else {
    console.log('✓ No NULL prompt_version rows in the last 24h.\n')
  }

  console.log('═══ Phase 8 check complete ═══')
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
