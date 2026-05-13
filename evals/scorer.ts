// evals/scorer.ts
//
// Phase 7 of the LLM Rewiring Plan — Claude-as-judge scorer.
//
// Given an eval definition + the surface's raw output, ask Claude to
// score each expectedBehavior and mustNotDo as a boolean with a one-line
// reason. The scorer itself is cheap (Haiku 4.5, ~$0.005 per scoring
// pass) and produces structured JSON the runner can render in a report.
//
// Design decisions:
//   - One scoring call per eval. The judge sees all behaviors + all
//     mustNotDo rules in a single prompt and returns one JSON object.
//   - Haiku 4.5 is sufficient — these are binary judgments grounded in
//     short text. Opus is overkill and 10x cost.
//   - The judge gets the eval description so it understands what
//     "good" looks like for THIS surface, not generic LLM-output rules.
//   - Strict JSON output. Falls back to "all failed" if parsing fails
//     (better to flag false-negative than to silently pass).

import { anthropic } from '@/config/anthropic'
import type {
  Eval,
  EvalRunResult,
  EvalScoreResult,
  BehaviorVerdict,
  ViolationVerdict,
} from './types'

const SCORER_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Score one eval. Returns the structured EvalScoreResult ready for the
 * runner to aggregate. Never throws — eval-level errors are captured
 * in the result so the report can show them.
 */
export async function scoreEval(
  ev: Eval,
  run: EvalRunResult,
): Promise<EvalScoreResult> {
  const scoreStart = Date.now()

  // Early-exit when the run itself errored. Mark every behavior unmet
  // + every rule violated so the report flags it loudly.
  if (run.errored) {
    return {
      evalId: ev.id,
      surface: ev.surface,
      description: ev.description,
      passed: false,
      behaviorsHit: 0,
      behaviorsTotal: ev.expectedBehaviors.length,
      violationsCount: ev.mustNotDo.length,
      behaviors: ev.expectedBehaviors.map((b) => ({
        behavior: b,
        met: false,
        reason: 'run errored',
      })),
      violations: ev.mustNotDo.map((r) => ({
        rule: r,
        violated: true,
        reason: 'run errored',
      })),
      runDurationMs: run.durationMs,
      scoreDurationMs: 0,
      costUsd: run.costUsd ?? 0,
      errored: true,
      outputPreview: run.output.slice(0, 2000),
    }
  }

  const judgePrompt = buildJudgePrompt(ev, run.output)

  let parsed: JudgeResponse | null = null
  let scoreCostUsd = 0

  try {
    const resp = await anthropic.messages.create({
      model: SCORER_MODEL,
      max_tokens: 2000,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: judgePrompt }],
    })

    // Rough cost: Haiku 4.5 is ~$1/M input, ~$5/M output. Tokens may be
    // null on stream errors; fall back to 0 (the report stays useful).
    const tokensIn = resp.usage?.input_tokens ?? 0
    const tokensOut = resp.usage?.output_tokens ?? 0
    scoreCostUsd = (tokensIn / 1_000_000) * 1 + (tokensOut / 1_000_000) * 5

    const textBlock = resp.content.find((b) => b.type === 'text')
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    parsed = parseJudgeResponse(rawText)
  } catch (err) {
    parsed = null
  }

  if (!parsed) {
    // Conservative: mark every behavior unmet + every rule violated.
    // Surface the eval as failed so the runner reports it.
    return {
      evalId: ev.id,
      surface: ev.surface,
      description: ev.description,
      passed: false,
      behaviorsHit: 0,
      behaviorsTotal: ev.expectedBehaviors.length,
      violationsCount: ev.mustNotDo.length,
      behaviors: ev.expectedBehaviors.map((b) => ({
        behavior: b,
        met: false,
        reason: 'judge parse failed',
      })),
      violations: ev.mustNotDo.map((r) => ({
        rule: r,
        violated: true,
        reason: 'judge parse failed',
      })),
      runDurationMs: run.durationMs,
      scoreDurationMs: Date.now() - scoreStart,
      costUsd: (run.costUsd ?? 0) + scoreCostUsd,
      errored: false,
      outputPreview: run.output.slice(0, 2000),
    }
  }

  const behaviors: BehaviorVerdict[] = ev.expectedBehaviors.map((b, i) => {
    const v = parsed.behaviors[i]
    return {
      behavior: b,
      met: v?.met === true,
      reason: v?.reason ?? 'no verdict from judge',
    }
  })

  const violations: ViolationVerdict[] = ev.mustNotDo.map((r, i) => {
    const v = parsed.violations[i]
    return {
      rule: r,
      violated: v?.violated === true,
      reason: v?.reason ?? 'no verdict from judge',
    }
  })

  const behaviorsHit = behaviors.filter((b) => b.met).length
  const violationsCount = violations.filter((v) => v.violated).length
  const threshold = ev.passThreshold ?? { minBehaviorsPct: 0.8, maxViolations: 0 }
  const passed =
    behaviors.length > 0 &&
    behaviorsHit / behaviors.length >= threshold.minBehaviorsPct &&
    violationsCount <= threshold.maxViolations

  return {
    evalId: ev.id,
    surface: ev.surface,
    description: ev.description,
    passed,
    behaviorsHit,
    behaviorsTotal: behaviors.length,
    violationsCount,
    behaviors,
    violations,
    runDurationMs: run.durationMs,
    scoreDurationMs: Date.now() - scoreStart,
    costUsd: (run.costUsd ?? 0) + scoreCostUsd,
    errored: false,
    outputPreview: run.output.slice(0, 2000),
  }
}

// ─── Judge prompt ──────────────────────────────────────────────────────

interface JudgeResponse {
  behaviors: Array<{ met: boolean; reason: string }>
  violations: Array<{ violated: boolean; reason: string }>
}

const JUDGE_SYSTEM_PROMPT = `You are an evaluation judge for LLM outputs. You score whether an output meets a list of expected behaviors and whether it violates any "must not do" rules.

Rules:
- Be strict. If a behavior is unclear, mark it as NOT met (false).
- Each verdict gets a 1-sentence reason quoting or paraphrasing the output.
- Output ONLY a valid JSON object — no markdown, no prose, no preamble.
- The JSON shape is fixed (see the user message). Order of behaviors + violations MUST match the input order.`

function buildJudgePrompt(ev: Eval, output: string): string {
  const behaviorsList = ev.expectedBehaviors
    .map((b, i) => `  ${i + 1}. ${b}`)
    .join('\n')
  const violationsList = ev.mustNotDo
    .map((r, i) => `  ${i + 1}. ${r}`)
    .join('\n')

  return `EVAL: ${ev.id} (surface: ${ev.surface})
WHAT THIS EVAL CHECKS: ${ev.description}

EXPECTED BEHAVIORS (each must be true):
${behaviorsList || '  (none)'}

MUST NOT DO (each violation fails the eval):
${violationsList || '  (none)'}

OUTPUT FROM THE LLM SURFACE:
\`\`\`
${output.slice(0, 8000)}
\`\`\`

Return ONLY this JSON object:
{
  "behaviors": [
${ev.expectedBehaviors.map(() => `    { "met": <true|false>, "reason": "<1 sentence>" }`).join(',\n') || '    '}
  ],
  "violations": [
${ev.mustNotDo.map(() => `    { "violated": <true|false>, "reason": "<1 sentence>" }`).join(',\n') || '    '}
  ]
}

The number of items in each array MUST match the lists above exactly, in the same order.`
}

function parseJudgeResponse(text: string): JudgeResponse | null {
  // Strip markdown fences and isolate the first JSON object.
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  cleaned = cleaned.slice(first, last + 1)

  let raw: unknown
  try {
    raw = JSON.parse(cleaned)
  } catch {
    return null
  }

  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { behaviors?: unknown; violations?: unknown }

  const behaviors: Array<{ met: boolean; reason: string }> = []
  if (Array.isArray(obj.behaviors)) {
    for (const b of obj.behaviors) {
      if (b && typeof b === 'object') {
        const bb = b as Record<string, unknown>
        behaviors.push({
          met: bb.met === true,
          reason: typeof bb.reason === 'string' ? bb.reason : '',
        })
      }
    }
  }

  const violations: Array<{ violated: boolean; reason: string }> = []
  if (Array.isArray(obj.violations)) {
    for (const v of obj.violations) {
      if (v && typeof v === 'object') {
        const vv = v as Record<string, unknown>
        violations.push({
          violated: vv.violated === true,
          reason: typeof vv.reason === 'string' ? vv.reason : '',
        })
      }
    }
  }

  return { behaviors, violations }
}
