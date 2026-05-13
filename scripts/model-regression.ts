// scripts/model-regression.ts
//
// Phase 9c of the LLM Rewiring Plan — model-version regression suite.
//
// When Anthropic releases a new model (e.g. claude-opus-4-7), use this to
// verify the new model behaves consistently with the old one across the
// full eval suite. The procedure:
//
//   1. Save the current weekly drift report JSON as baseline:
//      cp evals/reports/full-<latest>.json /tmp/baseline-4-6.json
//
//   2. Update evals/golden/{smoke,medium,full}.ts to point at the new
//      model ID (search/replace "claude-opus-4-6" → "claude-opus-4-7").
//
//   3. Run full tier: EVAL_FORCE=1 npm run evals:full
//
//   4. Run this diff:
//      npx tsx scripts/model-regression.ts \
//        --baseline /tmp/baseline-4-6.json \
//        --candidate evals/reports/full-<latest>.json
//
//   5. Read the output — every eval-id is checked for:
//      - PASS→FAIL  (regression — investigate)
//      - FAIL→PASS  (improvement — note)
//      - score delta > 1 behavior or > 0 violation change (variance — log)
//      - missing eval-id (eval was added or removed between reports)
//
// Output is pure stdout. No DB writes. No AI calls. Cost: $0.
//
// Per the Phase 9 plan: this is the regression GATE, not an auto-rollback.
// A human looks at the output and decides whether to roll out the new
// model to production. Phase 10's learning loop may eventually auto-rate
// the diff against historical model-bump deltas — for now, human-in-loop.

import { readFileSync, existsSync } from 'node:fs'

interface EvalReport {
  tier: string
  startedAt?: string
  totalEvals: number
  passed: number
  failed: number
  totalCostUsd: number
  totalDurationMs: number
  results: Array<{
    evalId: string
    surface?: string
    passed: boolean
    behaviorsHit: number
    behaviorsTotal: number
    violationsCount: number
    runDurationMs?: number
    costUsd?: number
  }>
}

function parseArgs(): { baselinePath: string; candidatePath: string } {
  const argv = process.argv.slice(2)
  let baseline = ''
  let candidate = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--baseline' && argv[i + 1]) { baseline = argv[i + 1]; i++ }
    else if (argv[i] === '--candidate' && argv[i + 1]) { candidate = argv[i + 1]; i++ }
  }
  if (!baseline || !candidate) {
    console.error('Usage: npx tsx scripts/model-regression.ts --baseline <report.json> --candidate <report.json>')
    process.exit(2)
  }
  return { baselinePath: baseline, candidatePath: candidate }
}

function loadReport(path: string): EvalReport {
  if (!existsSync(path)) {
    console.error(`Report not found: ${path}`)
    process.exit(2)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as EvalReport
}

function main() {
  const { baselinePath, candidatePath } = parseArgs()
  const baseline = loadReport(baselinePath)
  const candidate = loadReport(candidatePath)

  console.log(`═══ Model regression diff ═══`)
  console.log(`Baseline:  ${baselinePath}`)
  console.log(`           tier=${baseline.tier} evals=${baseline.totalEvals} pass=${baseline.passed} cost=$${baseline.totalCostUsd.toFixed(2)} dur=${(baseline.totalDurationMs / 1000).toFixed(0)}s`)
  console.log(`Candidate: ${candidatePath}`)
  console.log(`           tier=${candidate.tier} evals=${candidate.totalEvals} pass=${candidate.passed} cost=$${candidate.totalCostUsd.toFixed(2)} dur=${(candidate.totalDurationMs / 1000).toFixed(0)}s\n`)

  const passDelta = candidate.passed - baseline.passed
  const costDelta = candidate.totalCostUsd - baseline.totalCostUsd
  const durDelta = (candidate.totalDurationMs - baseline.totalDurationMs) / 1000
  console.log(`Aggregate: pass ${passDelta >= 0 ? '+' : ''}${passDelta}, cost ${costDelta >= 0 ? '+$' : '-$'}${Math.abs(costDelta).toFixed(2)} (${((costDelta / baseline.totalCostUsd) * 100).toFixed(0)}%), duration ${durDelta >= 0 ? '+' : ''}${durDelta.toFixed(0)}s\n`)

  const baseMap = new Map(baseline.results.map(r => [r.evalId, r]))
  const candMap = new Map(candidate.results.map(r => [r.evalId, r]))

  const allIds = new Set([...baseMap.keys(), ...candMap.keys()])
  const regressions: string[] = []
  const improvements: string[] = []
  const scoreShifts: string[] = []
  const onlyInBase: string[] = []
  const onlyInCand: string[] = []

  for (const id of [...allIds].sort()) {
    const b = baseMap.get(id)
    const c = candMap.get(id)
    if (!b) { onlyInCand.push(id); continue }
    if (!c) { onlyInBase.push(id); continue }

    if (b.passed && !c.passed) {
      regressions.push(`  ${id.padEnd(50)} ${b.behaviorsHit}/${b.behaviorsTotal}b ${b.violationsCount}v PASS → ${c.behaviorsHit}/${c.behaviorsTotal}b ${c.violationsCount}v FAIL`)
    } else if (!b.passed && c.passed) {
      improvements.push(`  ${id.padEnd(50)} ${b.behaviorsHit}/${b.behaviorsTotal}b ${b.violationsCount}v FAIL → ${c.behaviorsHit}/${c.behaviorsTotal}b ${c.violationsCount}v PASS`)
    } else {
      // Both pass or both fail — look for material score shifts
      const bDelta = c.behaviorsHit - b.behaviorsHit
      const vDelta = c.violationsCount - b.violationsCount
      if (Math.abs(bDelta) >= 2 || Math.abs(vDelta) >= 2) {
        const status = b.passed ? 'PASS' : 'FAIL'
        scoreShifts.push(`  ${id.padEnd(50)} ${status} ${b.behaviorsHit}/${b.behaviorsTotal}b ${b.violationsCount}v → ${c.behaviorsHit}/${c.behaviorsTotal}b ${c.violationsCount}v`)
      }
    }
  }

  if (regressions.length > 0) {
    console.log(`⛔ REGRESSIONS (${regressions.length}) — pass→fail. Investigate before rollout:`)
    for (const r of regressions) console.log(r)
    console.log()
  } else {
    console.log('✓ No PASS→FAIL regressions.\n')
  }

  if (improvements.length > 0) {
    console.log(`✓ Improvements (${improvements.length}) — fail→pass:`)
    for (const r of improvements) console.log(r)
    console.log()
  }

  if (scoreShifts.length > 0) {
    console.log(`⚠ Score shifts (${scoreShifts.length}) — same pass/fail but ≥2 behaviors or ≥2 violations moved:`)
    for (const r of scoreShifts) console.log(r)
    console.log()
  }

  if (onlyInBase.length > 0) {
    console.log(`Only in baseline (${onlyInBase.length}) — eval removed since:`)
    for (const id of onlyInBase) console.log(`  ${id}`)
    console.log()
  }

  if (onlyInCand.length > 0) {
    console.log(`Only in candidate (${onlyInCand.length}) — eval added since:`)
    for (const id of onlyInCand) console.log(`  ${id}`)
    console.log()
  }

  console.log('═══ Diff complete ═══')
  console.log()
  console.log('Gate logic:')
  console.log(`  REGRESSIONS: ${regressions.length}    (a single regression is grounds to NOT roll the model)`)
  console.log(`  IMPROVEMENTS: ${improvements.length}    (count toward rollout justification)`)
  console.log(`  SCORE SHIFTS: ${scoreShifts.length}    (review individually — may be flake)`)

  process.exit(regressions.length > 0 ? 1 : 0)
}

main()
