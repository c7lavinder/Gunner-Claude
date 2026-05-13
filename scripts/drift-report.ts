// scripts/drift-report.ts
//
// Phase 9b of the LLM Rewiring Plan — drift signal report (read-only).
//
// Queries `ai_logs` grouped by (type, prompt_version, pageContext bucket)
// and prints score / latency / cost deltas across versions. Empty when no
// prompt-versioned rows exist (pre-deploy window). Once Phase 8 wiring is
// live and rows start accruing with non-null prompt_version, this script
// surfaces: "v1.4.0 of deal-intel is 12% more expensive on average than
// v1.3.0 was over the last 7 days" — the kind of regression catch Phase 8
// existed to enable.
//
// Per docs/LLM_REWIRING_PLAN.md Phase 9, this is NOT yet a persisted
// dashboard — just a CLI that prints to stdout. Phase 9c (model-version
// regression suite) and persistence + UI come later.
//
// Usage:
//   npx tsx scripts/drift-report.ts                 # all surfaces, last 7d
//   npx tsx scripts/drift-report.ts --days 30       # window override
//   npx tsx scripts/drift-report.ts --type deal_intel  # one surface only
//
// No DB writes. No AI calls. Pure read + stdout.

import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

function parseArgs(): { days: number; typeFilter: string | null } {
  const argv = process.argv.slice(2)
  let days = 7
  let typeFilter: string | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days' && argv[i + 1]) {
      days = Math.max(1, Math.min(90, parseInt(argv[i + 1], 10) || 7))
      i++
    } else if (argv[i] === '--type' && argv[i + 1]) {
      typeFilter = argv[i + 1]
      i++
    }
  }
  return { days, typeFilter }
}

async function main() {
  const { days, typeFilter } = parseArgs()
  console.log(`═══ Drift report — ai_logs over last ${days}d${typeFilter ? ` (type=${typeFilter})` : ''} ═══\n`)

  // ── Overall coverage ────────────────────────────────────────────────
  const cov = await db.$queryRaw<{
    total: bigint
    versioned: bigint
    distinct_versions: bigint
  }[]>(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(prompt_version)::bigint AS versioned,
      COUNT(DISTINCT prompt_version)::bigint AS distinct_versions
    FROM ai_logs
    WHERE created_at >= NOW() - (${days}::int || ' days')::interval
      ${typeFilter ? Prisma.sql`AND type = ${typeFilter}` : Prisma.empty}
  `)
  const c = cov[0]
  if (!c || Number(c.total) === 0) {
    console.log(`No ai_logs rows in the last ${days} days. Service may be idle, or the time window is wrong.\n`)
    await db.$disconnect()
    return
  }
  const totalN = Number(c.total)
  const versionedN = Number(c.versioned)
  const pct = totalN > 0 ? ((versionedN / totalN) * 100).toFixed(1) : '—'
  console.log(`Coverage: ${versionedN}/${totalN} rows (${pct}%) carry a prompt_version`)
  console.log(`Distinct versions seen: ${Number(c.distinct_versions)}\n`)

  if (versionedN === 0) {
    console.log('No versioned rows yet. Either:')
    console.log('  - Phase 8 migration hasn\'t deployed (run `npx tsx scripts/_phase8-check.ts`).')
    console.log('  - The window is older than the migration (try `--days 1`).')
    console.log('  - logAiCall is throwing before it can stamp prompt_version (check stderr).\n')
    await db.$disconnect()
    return
  }

  // ── Per (type, bucket, prompt_version) breakdown ────────────────────
  // The bucket SQL CASE matches scripts/_phase8-check.ts so the two
  // diagnostics report consistent groupings.
  const rows = await db.$queryRaw<{
    type: string
    bucket: string
    prompt_version: string | null
    count: bigint
    avg_tokens_out: number | null
    avg_duration_ms: number | null
    avg_cost: number | null
    error_count: bigint
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
      prompt_version,
      COUNT(*)::bigint AS count,
      AVG(tokens_out)::float AS avg_tokens_out,
      AVG(duration_ms)::float AS avg_duration_ms,
      AVG(estimated_cost)::float AS avg_cost,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint AS error_count
    FROM ai_logs
    WHERE created_at >= NOW() - (${days}::int || ' days')::interval
      AND prompt_version IS NOT NULL
      ${typeFilter ? Prisma.sql`AND type = ${typeFilter}` : Prisma.empty}
    GROUP BY type, bucket, prompt_version
    ORDER BY type, bucket, prompt_version
  `)

  if (rows.length === 0) {
    console.log('No versioned rows match the filter.\n')
    await db.$disconnect()
    return
  }

  // Group by (type, bucket) so we can compare versions within the same surface
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const key = `${r.type}|${r.bucket}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }

  for (const [key, versionRows] of groups) {
    const [type, bucket] = key.split('|')
    console.log(`── ${type} · ${bucket} ${'─'.repeat(Math.max(0, 60 - type.length - bucket.length))}`)
    console.log(`  ${'version'.padEnd(10)} ${'count'.padStart(7)} ${'tok_out'.padStart(9)} ${'dur_ms'.padStart(9)} ${'cost_$'.padStart(10)} ${'errs'.padStart(5)}`)
    for (const r of versionRows) {
      const v = (r.prompt_version ?? '?').padEnd(10)
      const cnt = String(r.count).padStart(7)
      const tok = (r.avg_tokens_out !== null ? Math.round(r.avg_tokens_out).toString() : '—').padStart(9)
      const dur = (r.avg_duration_ms !== null ? Math.round(r.avg_duration_ms).toString() : '—').padStart(9)
      const cost = (r.avg_cost !== null ? r.avg_cost.toFixed(5) : '—').padStart(10)
      const err = String(r.error_count).padStart(5)
      console.log(`  ${v} ${cnt} ${tok} ${dur} ${cost} ${err}`)
    }

    // Pairwise delta — when 2+ versions present in same group, flag any
    // metric that moved more than 20% relative to the baseline (lowest version).
    if (versionRows.length >= 2) {
      const sorted = [...versionRows].sort((a, b) => (a.prompt_version ?? '').localeCompare(b.prompt_version ?? ''))
      const baseline = sorted[0]
      for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i]
        const deltas: string[] = []
        const compare = (label: string, base: number | null, now: number | null) => {
          if (base === null || now === null || base === 0) return
          const pct = ((now - base) / base) * 100
          if (Math.abs(pct) >= 20) {
            deltas.push(`${label} ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`)
          }
        }
        compare('tok_out', baseline.avg_tokens_out, cur.avg_tokens_out)
        compare('duration', baseline.avg_duration_ms, cur.avg_duration_ms)
        compare('cost', baseline.avg_cost, cur.avg_cost)
        if (deltas.length > 0) {
          console.log(`  ⚠ ${cur.prompt_version} vs ${baseline.prompt_version}: ${deltas.join(', ')}`)
        }
      }
    }
    console.log()
  }

  // ── Tail: NULL prompt_version rows that should be versioned ─────────
  const nullCount = totalN - versionedN
  if (nullCount > 0) {
    console.log(`⚠ ${nullCount} rows in the window have NULL prompt_version.`)
    console.log(`  Most likely cause: rows written before the Phase 8 deploy on this tenant.`)
    console.log(`  Try a shorter window: \`npx tsx scripts/drift-report.ts --days 1\`\n`)
  }

  console.log('═══ Drift report complete ═══')
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
