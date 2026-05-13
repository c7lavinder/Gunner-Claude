// evals/runners/_shared.ts
//
// Shared infrastructure for the eval-tier runners (smoke, medium, full).
//
// Each tier-specific runner imports these helpers + supplies its own
// eval list and label. Keeps the per-tier file thin and the cache /
// env-loader / cost rendering identical across tiers.

import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Eval, EvalScoreResult, EvalTier, SuiteReport } from '../types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_DIR_REL = ['evals', 'reports', '.cache']

/**
 * Load .env.local into process.env without a dotenv dep. Must run BEFORE
 * any module that reads env at import time (config/anthropic.ts, etc).
 * Idempotent — won't overwrite values already in env.
 */
export function loadEnvLocal(): void {
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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {
    /* .env.local optional */
  }
}

/**
 * Hash all *.ts / *.tsx files under lib/ai and lib/ai/prompts. The cache
 * keys off this hash — when nothing relevant changed, we skip the suite.
 */
export function hashAiTree(): string {
  const roots = ['lib/ai', 'lib/ai/prompts']
  const files: { path: string; sha: string }[] = []
  for (const r of roots) {
    walk(join(process.cwd(), r), files)
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  const h = createHash('sha256')
  for (const f of files) {
    h.update(f.path)
    h.update('\0')
    h.update(f.sha)
    h.update('\0')
  }
  return h.digest('hex')
}

function walk(dir: string, out: { path: string; sha: string }[]): void {
  if (!existsSync(dir)) return
  const stat = statSync(dir)
  if (stat.isFile()) {
    if (!dir.endsWith('.ts') && !dir.endsWith('.tsx')) return
    const buf = readFileSync(dir)
    const sha = createHash('sha256').update(buf).digest('hex')
    out.push({ path: dir, sha })
    return
  }
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    walk(join(dir, entry), out)
  }
}

interface CachedRun {
  hash: string
  tier: EvalTier
  cachedAt: string
  report: SuiteReport
}

export function loadCachedRun(hash: string, tier: EvalTier): CachedRun | null {
  const path = join(process.cwd(), ...CACHE_DIR_REL, `${tier}-${hash}.json`)
  if (!existsSync(path)) return null
  try {
    const cached: CachedRun = JSON.parse(readFileSync(path, 'utf8'))
    const age = Date.now() - new Date(cached.cachedAt).getTime()
    if (age > CACHE_TTL_MS) return null
    return cached
  } catch {
    return null
  }
}

export function persistCachedRun(
  hash: string,
  tier: EvalTier,
  report: SuiteReport,
): void {
  const dir = join(process.cwd(), ...CACHE_DIR_REL)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, `${tier}-${hash}.json`)
  const cached: CachedRun = {
    hash,
    tier,
    cachedAt: new Date().toISOString(),
    report,
  }
  writeFileSync(path, JSON.stringify(cached, null, 2))
}

/**
 * Generic suite runner. Tier-specific entrypoints supply the eval list +
 * tier label; everything else (env, cache, parallelism, scoring,
 * rendering, exit code) lives here.
 */
export async function runEvalSuite(args: {
  tier: EvalTier
  evals: Eval[]
  /** Optional override for judge runs (default 3). EVAL_JUDGE_RUNS env wins. */
  defaultJudgeRuns?: number
}): Promise<never> {
  const { tier, evals } = args

  const judgeRuns =
    Number.parseInt(process.env.EVAL_JUDGE_RUNS ?? '', 10) ||
    args.defaultJudgeRuns ||
    3

  const aiHash = hashAiTree()
  const forced = process.env.EVAL_FORCE === '1'
  if (!forced) {
    const cached = loadCachedRun(aiHash, tier)
    if (cached) {
      const ageMin = Math.floor(
        (Date.now() - new Date(cached.cachedAt).getTime()) / 60_000,
      )
      console.log(
        `# ${tier} eval suite — CACHED result (hash ${aiHash.slice(0, 8)}, ${ageMin}m old)`,
      )
      console.log(`(re-run with EVAL_FORCE=1 to bypass cache)`)
      console.log('')
      console.log(renderMarkdown(cached.report))
      process.exit(cached.report.failed === 0 ? 0 : 1)
    }
  }

  const { scoreEvalMajority } = await import('../scorer')
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  console.log(
    `# ${tier} eval suite — ${evals.length} evals (judge runs: ${judgeRuns}, hash: ${aiHash.slice(0, 8)})`,
  )
  console.log(`Started: ${startedAt}`)
  console.log('')

  const runPromises = evals.map(async (ev) => {
    console.log(`[run] ${ev.id} (${ev.surface}) starting...`)
    const t = Date.now()
    const runResult = await ev.run()
    console.log(
      `[run] ${ev.id} done in ${((Date.now() - t) / 1000).toFixed(1)}s ${
        runResult.errored ? '(ERRORED)' : ''
      }`,
    )
    const scored = await scoreEvalMajority(ev, runResult, judgeRuns)
    console.log(
      `[score] ${ev.id} ${scored.passed ? 'PASS' : 'FAIL'} (${scored.behaviorsHit}/${scored.behaviorsTotal} behaviors, ${scored.violationsCount} violations) [k=${judgeRuns}]`,
    )
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

  console.log('')
  console.log(renderMarkdown(report))

  const reportsDir = join(process.cwd(), 'evals', 'reports')
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true })
  const stamp = startedAt.replace(/[:.]/g, '-')
  const jsonPath = join(reportsDir, `${tier}-${stamp}.json`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  console.log(`\nJSON report: ${jsonPath}`)

  persistCachedRun(aiHash, tier, report)

  process.exit(failed === 0 ? 0 : 1)
}

export function renderMarkdown(report: SuiteReport): string {
  const lines: string[] = []
  lines.push(`# ${report.tier} eval report`)
  lines.push('')
  lines.push(`Tier: **${report.tier}**`)
  lines.push(`Duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`)
  lines.push(`Cost: $${report.totalCostUsd.toFixed(4)}`)
  lines.push(`Result: **${report.passed}/${report.totalEvals} passed**`)
  lines.push('')
  lines.push('| Eval | Surface | Result | Behaviors | Violations | Cost |')
  lines.push('|---|---|---|---|---|---|')
  for (const r of report.results) {
    const result = r.errored ? '🟥 ERROR' : r.passed ? '✅ PASS' : '❌ FAIL'
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
