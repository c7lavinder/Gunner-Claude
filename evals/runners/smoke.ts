// evals/runners/smoke.ts
//
// Phase 7 — Smoke runner. Pre-commit gate on lib/ai/ + lib/ai/prompts/.
//
// Usage: npm run evals:smoke
//   Env:
//     EVAL_JUDGE_RUNS=N   (default 3) — judge majority across N runs.
//     EVAL_FORCE=1        — bypass the 24h cache.
//
// Exit codes: 0 all pass / 1 any fail / 2 runner error.
//
// Target: <30s, ~$1.50 per run (cold cache).

import { loadEnvLocal, runEvalSuite } from './_shared'

async function main() {
  // Load env BEFORE importing prompt/scorer modules — config/anthropic
  // reads ANTHROPIC_API_KEY at module init.
  loadEnvLocal()
  const { SMOKE_EVALS } = await import('../golden/smoke')
  await runEvalSuite({ tier: 'smoke', evals: SMOKE_EVALS })
}

main().catch((err) => {
  console.error('[smoke] runner errored:', err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(2)
})
