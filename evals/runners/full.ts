// evals/runners/full.ts
//
// Phase 7 — Full runner. Nightly (or weekly via railway.toml) drift detection.
//
// Usage: npm run evals:full
//   Env:
//     EVAL_JUDGE_RUNS=N   (default 3) — judge majority across N runs.
//     EVAL_FORCE=1        — bypass the 24h cache.
//
// Exit codes: 0 all pass / 1 any fail / 2 runner error.
//
// Target: <4 minutes (parallel), ~$5 per run.
//
// Coverage: 44 evals — 5 from smoke + 14 medium-only + 25 full-only.
// Full-only adds adversarial (PII, profanity, empty, foreign language),
// regression-specific scenarios, cross-surface chains, and depth on every
// surface (novation dispo, contradicted intel, multi-tool assistant, etc.).

import { loadEnvLocal, runEvalSuite } from './_shared'

async function main() {
  loadEnvLocal()
  const { FULL_EVALS } = await import('../golden/full')
  await runEvalSuite({ tier: 'full', evals: FULL_EVALS })
}

main().catch((err) => {
  console.error('[full] runner errored:', err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(2)
})
