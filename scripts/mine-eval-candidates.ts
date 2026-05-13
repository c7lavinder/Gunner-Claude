// scripts/mine-eval-candidates.ts
//
// Phase 10 of the LLM Rewiring Plan — learning loop infrastructure (foundation).
//
// Mines existing production feedback signals and surfaces examples that
// would make good NEW eval fixtures. Read-only, no DB writes, no AI calls.
//
// Sources mined:
//   - AiLog rows with status='rejected' or 'edited' (user denied/changed
//     an AI action — strong signal the AI got it wrong)
//   - BugReport rows whose description mentions AI surfaces ("AI", "grade",
//     "coach", "assistant", etc.) — users explicitly flagged a problem
//   - Call rows with isCalibration=true + calibrationNotes (explicit
//     good/bad markers from the calibration UI — highest-quality eval seed)
//   - AiLog rows with status='error' (system-level failures worth a fixture)
//
// Output: markdown report listed to stdout. The human reviews + decides
// which candidates to convert into actual evals in evals/golden/*.ts.
// Per the Phase 10 plan: this is the FEEDBACK → REVIEW step, not the
// AUTO-GENERATE step. Eval quality demands human-in-loop curation.
//
// Usage:
//   npx tsx scripts/mine-eval-candidates.ts              # last 30d, all surfaces
//   npx tsx scripts/mine-eval-candidates.ts --days 7     # window override
//   npx tsx scripts/mine-eval-candidates.ts --type deal_intel  # one surface
//
// No DB writes. No AI calls. Pure read + stdout. Cost: $0.

import { db } from '../lib/db/client'
import { Prisma } from '@prisma/client'

function parseArgs(): { days: number; typeFilter: string | null } {
  const argv = process.argv.slice(2)
  let days = 30
  let typeFilter: string | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days' && argv[i + 1]) {
      days = Math.max(1, Math.min(180, parseInt(argv[i + 1], 10) || 30))
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
  console.log(`# Eval candidate mine — last ${days}d${typeFilter ? ` (type=${typeFilter})` : ''}\n`)
  console.log(`Generated: ${new Date().toISOString()}\n`)
  console.log(`Each candidate below is a production interaction where a human signal`)
  console.log(`disagrees with the AI's output. Review each, decide if it's worth`)
  console.log(`turning into a new eval fixture in \`evals/golden/{smoke,medium,full}.ts\`.\n`)
  console.log(`---\n`)

  // ── 1. Rejected / edited AI actions ─────────────────────────────────
  // Strong signal — the user actively denied or rewrote what the AI proposed.
  const rejectedEdited = await db.$queryRaw<{
    id: string
    type: string
    page_context: string | null
    prompt_version: string | null
    input_summary: string
    output_summary: string
    status: string
    error_message: string | null
    created_at: Date
  }[]>(Prisma.sql`
    SELECT id, type::text AS type, page_context, prompt_version, input_summary, output_summary, status::text AS status, error_message, created_at
    FROM ai_logs
    WHERE status IN ('rejected', 'edited')
      AND created_at >= NOW() - (${days}::int || ' days')::interval
      ${typeFilter ? Prisma.sql`AND type = ${typeFilter}` : Prisma.empty}
    ORDER BY created_at DESC
    LIMIT 50
  `)

  console.log(`## 1. Rejected / edited AI actions (${rejectedEdited.length} found)\n`)
  if (rejectedEdited.length === 0) {
    console.log('_None in window. Either rejected/edited tracking isn\'t wired for this surface yet,_')
    console.log('_or the surface is performing well enough that users aren\'t rejecting._\n')
  } else {
    // Group by (type, status) and surface counts + a representative example
    const groups = new Map<string, typeof rejectedEdited>()
    for (const r of rejectedEdited) {
      const key = `${r.type}|${r.status}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    for (const [key, rows] of groups) {
      const [type, status] = key.split('|')
      console.log(`### ${type} — ${status} (${rows.length})\n`)
      const sample = rows.slice(0, 3)
      for (const r of sample) {
        console.log(`- **${r.created_at.toISOString().slice(0, 16)}** · pv=\`${r.prompt_version ?? 'null'}\` · ctx=\`${r.page_context ?? '-'}\``)
        console.log(`  - input: ${r.input_summary.slice(0, 120).replace(/\n/g, ' ')}…`)
        console.log(`  - output: ${r.output_summary.slice(0, 120).replace(/\n/g, ' ')}…`)
        if (r.error_message) console.log(`  - error: ${r.error_message.slice(0, 100)}`)
      }
      if (rows.length > 3) console.log(`  _…and ${rows.length - 3} more_`)
      console.log()
    }
  }

  // ── 2. Bug reports that mention AI ──────────────────────────────────
  // Users hitting the floating Bug Report button (Sessions 42-43) and
  // describing AI behavior — explicit "this is broken" feedback.
  const bugReports = await db.$queryRaw<{
    id: string
    description: string
    severity: string
    status: string
    page_url: string | null
    reporter_name: string | null
    created_at: Date
  }[]>(Prisma.sql`
    SELECT id, description, severity, status, page_url, reporter_name, created_at
    FROM bug_reports
    WHERE created_at >= NOW() - (${days}::int || ' days')::interval
      AND (
        description ILIKE '%AI%'
        OR description ILIKE '%grade%' OR description ILIKE '%grading%'
        OR description ILIKE '%coach%' OR description ILIKE '%assistant%'
        OR description ILIKE '%deal intel%' OR description ILIKE '%story%'
        OR description ILIKE '%suggest%' OR description ILIKE '%next step%'
      )
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 25
  `)

  console.log(`## 2. Bug reports mentioning AI surfaces (${bugReports.length} found)\n`)
  if (bugReports.length === 0) {
    console.log('_No AI-related bug reports in window. Either the floating bug-report button_')
    console.log('_isn\'t being used for AI complaints, or AI behavior is acceptable enough that_')
    console.log('_users haven\'t filed reports._\n')
  } else {
    for (const b of bugReports.slice(0, 10)) {
      console.log(`- **${b.created_at?.toISOString().slice(0, 16) ?? '?'}** · sev=${b.severity} · status=${b.status} · by=${b.reporter_name ?? '?'}`)
      console.log(`  - page: ${b.page_url ?? '-'}`)
      console.log(`  - "${b.description.slice(0, 250).replace(/\n/g, ' ')}"`)
    }
    if (bugReports.length > 10) console.log(`\n_…and ${bugReports.length - 10} more_`)
    console.log()
  }

  // ── 3. Calibration-marked calls ─────────────────────────────────────
  const calibration = await db.$queryRaw<{
    id: string
    score: number | null
    call_type: string | null
    rep_name: string | null
    calibration_notes: string | null
    created_at: Date
  }[]>(Prisma.sql`
    SELECT c.id, c.score, c.call_type, u.name AS rep_name, c.calibration_notes, c.graded_at AS created_at
    FROM calls c
    LEFT JOIN users u ON u.id = c.assigned_to_id
    WHERE c.is_calibration = TRUE
      AND c.calibration_notes IS NOT NULL
      AND c.calibration_notes != ''
      AND c.graded_at >= NOW() - (${days}::int || ' days')::interval
    ORDER BY c.graded_at DESC
    LIMIT 25
  `)

  console.log(`## 3. Calibration-marked calls (${calibration.length} found)\n`)
  if (calibration.length === 0) {
    console.log('_No calibration markers in window. Calibration is the highest-quality eval seed,_')
    console.log('_because managers explicitly chose these as examples of good/bad. Worth_')
    console.log('_promoting calibration UI usage if this stays empty._\n')
  } else {
    for (const c of calibration.slice(0, 10)) {
      console.log(`- **${c.created_at?.toISOString().slice(0, 16) ?? '?'}** · rep=${c.rep_name ?? '?'} · type=${c.call_type ?? '?'} · score=${c.score ?? '?'}`)
      console.log(`  - notes: ${(c.calibration_notes ?? '').slice(0, 200).replace(/\n/g, ' ')}`)
    }
    if (calibration.length > 10) console.log(`\n_…and ${calibration.length - 10} more_`)
    console.log()
  }

  // ── 4. System errors (status='error') ───────────────────────────────
  const errors = await db.$queryRaw<{
    type: string
    error_summary: string
    count: bigint
  }[]>(Prisma.sql`
    SELECT
      type::text AS type,
      COALESCE(error_message, 'unknown error') AS error_summary,
      COUNT(*)::bigint AS count
    FROM ai_logs
    WHERE status = 'error'
      AND created_at >= NOW() - (${days}::int || ' days')::interval
      ${typeFilter ? Prisma.sql`AND type = ${typeFilter}` : Prisma.empty}
    GROUP BY type, error_message
    ORDER BY count DESC
    LIMIT 10
  `)

  console.log(`## 4. AI surface errors (${errors.length} distinct patterns)\n`)
  if (errors.length === 0) {
    console.log('_No errors in window. Healthy._\n')
  } else {
    console.log('| type | count | error (first 100 chars) |')
    console.log('|---|---|---|')
    for (const e of errors) {
      const msg = (e.error_summary ?? '').slice(0, 100).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      console.log(`| ${e.type} | ${e.count} | ${msg} |`)
    }
    console.log()
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`---\n`)
  console.log(`## Total candidates surfaced\n`)
  console.log(`- ${rejectedEdited.length} rejected/edited AI actions`)
  console.log(`- ${bugReports.length} AI-related bug reports`)
  console.log(`- ${calibration.length} calibration-marked calls`)
  console.log(`- ${errors.length} error patterns\n`)
  console.log(`Next step: review the top candidates above. For each one worth keeping,`)
  console.log(`add a new \`X_<id>\` Eval to \`evals/golden/full.ts\` (or medium.ts) using the`)
  console.log(`production input as the fixture and the corrected/expected output as the`)
  console.log(`\`expectedBehaviors\` / \`mustNotDo\` rules. The Section 28b pattern (explicit`)
  console.log(`VIOLATION + NOT-A-VIOLATION examples) keeps the judge calibrated.\n`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
