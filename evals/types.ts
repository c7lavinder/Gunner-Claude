// evals/types.ts
//
// Phase 7 of the LLM Rewiring Plan — Evaluation Framework (Tiered).
// Shared types for the eval suite.
//
// Three tiers (separate runners + triggers):
//   smoke    — pre-commit, 5 prompts, ~$0.50, <30s.  Catches obvious regressions.
//   medium   — pre-merge CI, 15-20 prompts, ~$2, ~2min.  Cross-surface.
//   full     — nightly cron, 50+ prompts, ~$5, ~10min.  Drift + edge cases.
//   pre-release — manual or release tag, full + adversarial + drift, ~$10.
//
// Each eval is a self-contained unit:
//   - Sets up the inputs needed to invoke a prompt module.
//   - Calls the surface (or just its prompt module + a single Anthropic call).
//   - Returns the surface's output (string or JSON).
//   - Lists expectedBehaviors + mustNotDo so the scorer can grade.
//
// The scorer (evals/scorer.ts) uses Claude-as-judge: given the eval
// definition + the surface's output, it returns one boolean per behavior.
// Each eval defines its own success criteria (e.g. "≥5 of 6 behaviors,
// 0 mustNotDo violations").

export type EvalTier = 'smoke' | 'medium' | 'full' | 'pre-release'
export type EvalSurface =
  | 'assistant'
  | 'grading'
  | 'coach'
  | 'deal-intel'
  | 'property-story'
  | 'dispo'
  | 'user-profile'
  | 'photo-classifier'
  | 'session-summarizer'

/**
 * One eval. Self-contained — the runner calls `run()` and hands the
 * result to the scorer with the same definition. Pure: nothing in
 * `run()` should write to the DB or send a message.
 */
export interface Eval {
  /** Unique stable ID. Used in result reports + caching keys. */
  id: string
  /** Which LLM surface this exercises. */
  surface: EvalSurface
  /** Which tier(s) include this eval. An eval can appear in multiple. */
  tiers: EvalTier[]
  /** Short description shown in the report. */
  description: string
  /**
   * Run the eval. Should make the LLM call directly (not via the live
   * route — eval runner needs determinism and no side effects). Return
   * the surface's output as a string (raw text) — the scorer will judge
   * it as text against the behaviors below.
   */
  run: () => Promise<EvalRunResult>
  /**
   * Things the output MUST do. Each entry is a short natural-language
   * description (e.g. "returns valid JSON", "mentions the call score").
   * The scorer checks each one independently.
   */
  expectedBehaviors: string[]
  /**
   * Things the output MUST NOT do. Each entry is a short natural-language
   * description (e.g. "fabricates a property address",
   * "uses the word 'awesome'"). Stricter than expectedBehaviors —
   * a single violation fails the eval.
   */
  mustNotDo: string[]
  /**
   * Acceptance threshold. Default: pass if ≥80% of expectedBehaviors hit
   * AND 0 mustNotDo violations.
   */
  passThreshold?: {
    minBehaviorsPct: number   // 0..1, default 0.8
    maxViolations: number     // default 0
  }
}

export interface EvalRunResult {
  /** Raw surface output (JSON string or plain text). */
  output: string
  /** Approximate cost of this run in USD (for the report). */
  costUsd?: number
  /** Latency in ms. */
  durationMs: number
  /** Model used. */
  model: string
  /** Optional structured side data (e.g. parsed JSON for grading). */
  parsed?: unknown
  /** True if `run()` threw — output may contain the error message. */
  errored?: boolean
}

export interface BehaviorVerdict {
  behavior: string
  met: boolean
  reason: string
}

export interface ViolationVerdict {
  rule: string
  violated: boolean
  reason: string
}

export interface EvalScoreResult {
  evalId: string
  surface: EvalSurface
  description: string
  passed: boolean
  behaviorsHit: number
  behaviorsTotal: number
  violationsCount: number
  behaviors: BehaviorVerdict[]
  violations: ViolationVerdict[]
  runDurationMs: number
  scoreDurationMs: number
  costUsd: number
  errored: boolean
  outputPreview: string
}

export interface SuiteReport {
  tier: EvalTier
  startedAt: string
  finishedAt: string
  totalEvals: number
  passed: number
  failed: number
  totalCostUsd: number
  totalDurationMs: number
  results: EvalScoreResult[]
}
