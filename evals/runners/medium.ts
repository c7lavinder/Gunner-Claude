// evals/runners/medium.ts
//
// Phase 7 — Medium runner. Pre-merge / CI gate.
//
// Usage: npm run evals:medium
//   Env:
//     EVAL_JUDGE_RUNS=N   (default 3) — judge majority across N runs.
//     EVAL_FORCE=1        — bypass the 24h cache.
//
// Exit codes: 0 all pass / 1 any fail / 2 runner error.
//
// Target: <2 minutes (parallel), ~$2 per run.
//
// Coverage: 19 evals — 5 inherited from smoke + 14 medium-only covering
// role variations, alternate call types, the 3 surfaces not in smoke
// (user-profile, session-summarizer, assistant), and Phase 0 baseline
// regression checks.

import { loadEnvLocal, runEvalSuite } from './_shared'

async function main() {
  loadEnvLocal()
  const { MEDIUM_EVALS } = await import('../golden/medium')
  await runEvalSuite({ tier: 'medium', evals: MEDIUM_EVALS })
}

main().catch((err) => {
  console.error('[medium] runner errored:', err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(2)
})
