// evals/runners/smoke.ts
//
// Phase 7 of the LLM Rewiring Plan — Smoke runner.
//
// Runs the 5 smoke evals in parallel (they're independent), scores
// each one with Haiku 4.5 as judge, and prints a markdown report to
// stdout plus a JSON sidecar to evals/reports/smoke-<timestamp>.json.
//
// Usage:
//   npm run evals:smoke
//
// Exit codes:
//   0 — all evals passed
//   1 — at least one eval failed (smoke is meant to gate commits)
//   2 — runner errored before evals completed
//
// Cost: ~$0.50 per run. Latency: ~30s when parallel (each eval is
// independent; the long pole is the grading + deal-intel Opus calls).

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SuiteReport } from '../types'

// Load .env.local BEFORE importing anything that reads process.env at
// module-load time (config/anthropic.ts, config/env.ts). Same pattern as
// scripts/verify-calls-pipeline.ts — no dotenv dep needed.
function loadEnvLocal(): void {
  const envPath = join(process.cwd(), '.env.local')
  try {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch { /* .env.local optional */ }
}

async function main() {
  // Env must be loaded BEFORE the eval/scorer modules import — they pull
  // in config/anthropic which reads ANTHROPIC_API_KEY at module-init.
  loadEnvLocal()
  const { SMOKE_EVALS } = await import('../golden/smoke')
  const { scoreEval } = await import('../scorer')

  const tier = 'smoke' as const
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  console.log(`# Smoke eval suite — ${SMOKE_EVALS.length} evals`)
  console.log(`Started: ${startedAt}`)
  console.log('')

  // Run all evals in parallel — they're independent.
  const runPromises = SMOKE_EVALS.map(async (ev) => {
    console.log(`[run] ${ev.id} (${ev.surface}) starting...`)
    const t = Date.now()
    const runResult = await ev.run()
    console.log(`[run] ${ev.id} done in ${((Date.now() - t) / 1000).toFixed(1)}s ${runResult.errored ? '(ERRORED)' : ''}`)
    const scored = await scoreEval(ev, runResult)
    console.log(`[score] ${ev.id} ${scored.passed ? 'PASS' : 'FAIL'} (${scored.behaviorsHit}/${scored.behaviorsTotal} behaviors, ${scored.violationsCount} violations)`)
    return scored
  })

  const results = await Promise.all(runPromises)

  const finishedAt = new Date().toISOString()
  const totalDurationMs = Date.now() - t0
  const totalCostUsd = results.reduce((s, r) => s + r.costUsd, 0)
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed

  const report: SuiteReport = {
    tier,
    startedAt,
    finishedAt,
    totalEvals: results.length,
    passed,
    failed,
    totalCostUsd,
    totalDurationMs,
    results,
  }

  // Print markdown report
  console.log('')
  console.log(renderMarkdown(report))

  // Write JSON sidecar
  const reportsDir = join(process.cwd(), 'evals', 'reports')
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true })
  }
  const stamp = startedAt.replace(/[:.]/g, '-')
  const jsonPath = join(reportsDir, `smoke-${stamp}.json`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  console.log(`\nJSON report: ${jsonPath}`)

  process.exit(failed === 0 ? 0 : 1)
}

function renderMarkdown(report: SuiteReport): string {
  const lines: string[] = []
  lines.push(`# Smoke eval report`)
  lines.push('')
  lines.push(`Tier: **${report.tier}**`)
  lines.push(`Duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`)
  lines.push(`Cost: $${report.totalCostUsd.toFixed(4)}`)
  lines.push(`Result: **${report.passed}/${report.totalEvals} passed**`)
  lines.push('')
  lines.push('| Eval | Surface | Result | Behaviors | Violations | Cost |')
  lines.push('|---|---|---|---|---|---|')
  for (const r of report.results) {
    const result = r.errored
      ? '🟥 ERROR'
      : r.passed
        ? '✅ PASS'
        : '❌ FAIL'
    lines.push(
      `| ${r.evalId} | ${r.surface} | ${result} | ${r.behaviorsHit}/${r.behaviorsTotal} | ${r.violationsCount} | $${r.costUsd.toFixed(4)} |`,
    )
  }
  lines.push('')

  const failures = report.results.filter((r) => !r.passed)
  if (failures.length > 0) {
    lines.push('## Failures')
    lines.push('')
    for (const f of failures) {
      lines.push(`### ${f.evalId} — ${f.surface}`)
      lines.push(`${f.description}`)
      lines.push('')
      if (f.errored) {
        lines.push(`**ERRORED** — output:`)
        lines.push('```')
        lines.push(f.outputPreview)
        lines.push('```')
        lines.push('')
        continue
      }
      const missed = f.behaviors.filter((b) => !b.met)
      if (missed.length > 0) {
        lines.push('**Missed behaviors:**')
        for (const m of missed) {
          lines.push(`- ${m.behavior}`)
          lines.push(`  reason: ${m.reason}`)
        }
        lines.push('')
      }
      const violated = f.violations.filter((v) => v.violated)
      if (violated.length > 0) {
        lines.push('**Violations:**')
        for (const v of violated) {
          lines.push(`- ${v.rule}`)
          lines.push(`  reason: ${v.reason}`)
        }
        lines.push('')
      }
      lines.push('**Output preview:**')
      lines.push('```')
      lines.push(f.outputPreview)
      lines.push('```')
      lines.push('')
    }
  }

  return lines.join('\n')
}

main().catch((err) => {
  console.error('[smoke] runner errored:', err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(2)
})
