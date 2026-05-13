// scripts/mine-eval-candidates.ts
//
// Phase 10 of the LLM Rewiring Plan — learning loop infrastructure (foundation).
//
// Mines existing production feedback signals and surfaces examples that
// would make good NEW eval fixtures. Read-only, no DB writes, no AI calls.
//
// Sources mined (corrected Session 89 pass 13 after audit found reject/edit
// telemetry lives on ActionLog, not AiLog.status):
//   - ActionLog rows with wasRejected=true OR wasEdited=true (user denied or
//     changed an AI-proposed tool call — strongest signal the AI got it wrong)
//   - BugReport rows whose description mentions AI surfaces ("AI", "grade",
//     "coach", "assistant", etc.) — users explicitly flagged a problem
//   - Call rows with isCalibration=true + calibrationNotes (explicit
//     good/bad markers from the call-detail Good/Bad popover; mine parses
//     the `<kind>: <text>` prefix that the calibration POST route writes —
//     highest-quality eval seed)
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

  // ── 1. Rejected / edited AI tool calls (ActionLog) ──────────────────
  // Strong signal — the user actively denied or rewrote what the assistant
  // proposed via the propose→edit→confirm flow. Lives on ActionLog (not
  // AiLog.status — that enum exists in schema but no production code writes
  // 'rejected'/'edited' there; the assistant execute route persists to
  // ActionLog with the wasRejected / wasEdited booleans instead).
  // Note: typeFilter doesn't apply here — ActionLog.actionType is the tool
  // name (send_sms, create_task, etc.), not an ai_logs.type value.
  const rejectedEdited = await db.$queryRaw<{
    id: string
    action_type: string
    page_context: string | null
    proposed: unknown
    executed: unknown
    edit_diff: unknown
    was_rejected: boolean
    was_edited: boolean
    created_at: Date
  }[]>(Prisma.sql`
    SELECT id, action_type, page_context, proposed, executed, edit_diff,
           was_rejected, was_edited, created_at
    FROM action_logs
    WHERE (was_rejected = TRUE OR was_edited = TRUE)
      AND created_at >= NOW() - (${days}::int || ' days')::interval
    ORDER BY created_at DESC
    LIMIT 50
  `)

  console.log(`## 1. Rejected / edited AI tool calls — ActionLog (${rejectedEdited.length} found)\n`)
  if (rejectedEdited.length === 0) {
    console.log('_None in window. The propose→edit→confirm flow exists in the Role Assistant_')
    console.log('_sidebar but no production user has clicked Reject or Edit in this window._')
    console.log('_That is itself a signal — the AI is either nailing every proposal_')
    console.log('_(unlikely at zero-volume) or users are blindly approving (much more likely_')
    console.log('_at zero-volume). Phase 10 product work: surface the Reject/Edit affordance_')
    console.log('_more prominently in `components/ui/coach-sidebar.tsx`._\n')
  } else {
    // Group by (actionType, kind) and surface counts + a representative example
    const groups = new Map<string, typeof rejectedEdited>()
    for (const r of rejectedEdited) {
      const kind = r.was_rejected ? 'rejected' : 'edited'
      const key = `${r.action_type}|${kind}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    for (const [key, rows] of groups) {
      const [actionType, kind] = key.split('|')
      console.log(`### ${actionType} — ${kind} (${rows.length})\n`)
      const sample = rows.slice(0, 3)
      for (const r of sample) {
        console.log(`- **${r.created_at.toISOString().slice(0, 16)}** · ctx=\`${r.page_context ?? '-'}\``)
        try {
          const proposedStr = JSON.stringify(r.proposed).slice(0, 150).replace(/\n/g, ' ')
          console.log(`  - proposed: \`${proposedStr}\``)
        } catch { /* ignore */ }
        if (r.was_edited && r.edit_diff) {
          try {
            const diffStr = JSON.stringify(r.edit_diff).slice(0, 150).replace(/\n/g, ' ')
            console.log(`  - edit_diff: \`${diffStr}\``)
          } catch { /* ignore */ }
        }
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
    console.log('_No calibration markers in window. The Good/Bad popover lives on the_')
    console.log('_call detail page (`components/calls/call-detail-client.tsx` — the chip_')
    console.log('_to the right of the reclassify toolbar). Calibration is the_')
    console.log('_highest-quality eval seed because managers explicitly chose these as_')
    console.log('_good/bad examples. Promote calibration UI usage if this stays empty._\n')
  } else {
    // Parse the "<kind>: <notes>" convention written by the calibration POST
    // route and split into good / bad / untyped buckets so the report makes
    // the human signal obvious at a glance.
    const buckets = { good: [] as typeof calibration, bad: [] as typeof calibration, untyped: [] as typeof calibration }
    for (const c of calibration) {
      const n = (c.calibration_notes ?? '').trimStart()
      if (n.startsWith('good:')) buckets.good.push(c)
      else if (n.startsWith('bad:')) buckets.bad.push(c)
      else buckets.untyped.push(c)
    }
    const renderBucket = (label: string, rows: typeof calibration) => {
      if (rows.length === 0) return
      console.log(`### ${label} (${rows.length})\n`)
      for (const c of rows.slice(0, 10)) {
        const notes = (c.calibration_notes ?? '').replace(/^(good|bad):\s*/, '').slice(0, 200).replace(/\n/g, ' ')
        console.log(`- **${c.created_at?.toISOString().slice(0, 16) ?? '?'}** · rep=${c.rep_name ?? '?'} · type=${c.call_type ?? '?'} · score=${c.score ?? '?'}`)
        if (notes) console.log(`  - "${notes}"`)
      }
      if (rows.length > 10) console.log(`  _…and ${rows.length - 10} more_`)
      console.log()
    }
    renderBucket('👍 Good examples', buckets.good)
    renderBucket('👎 Bad examples', buckets.bad)
    renderBucket('Un-typed (legacy "Flag" toggle — re-classify in UI)', buckets.untyped)
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
