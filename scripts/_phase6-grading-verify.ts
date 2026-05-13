// scripts/_phase6-grading-verify.ts
//
// One-off verification for Phase 6 of the LLM Rewiring Plan (Session 87).
// Confirms the new lib/ai/prompts/grading.ts module produces gradings that
// don't regress more than 10 points vs the pre-Phase-6 stored scores.
//
// What it does:
//   1. Picks 5 most-recently COMPLETED graded calls for NAH (configurable).
//   2. Rebuilds the GradingContext for each via buildGradingContext (same
//      data the live grader sees today).
//   3. Calls Claude Opus 4.6 with the NEW system + user prompts. No DB writes.
//   4. Parses the response via the same parseGradingResponse function the
//      live grader uses.
//   5. Compares overallScore + rubricScores.script_adherence vs the stored
//      values. Reports any score delta > 10 points (regression flag).
//
// Cost: ~$0.10 per call × 5 calls = ~$0.50 total. One-shot, not a cron.
//
// Run with:
//   npx tsx scripts/_phase6-grading-verify.ts [limit]
//
// Delete after Phase 6 sign-off (post-run convention from
// scripts/_baseline-prompts.ts, removed Session 86).

import { db } from '@/lib/db/client'
import { anthropic } from '@/config/anthropic'
import { buildGradingContext } from '@/lib/ai/context-builder'
import {
  buildGradingSystemPrompt,
  buildGradingUserPrompt,
  VERSION as GRADING_PROMPT_VERSION,
} from '@/lib/ai/prompts/grading'
import { parseGradingResponse, type RubricCriteria } from '@/lib/ai/grading'
import { getRubricForCallType } from '@/lib/call-types'

const TENANT_NAME_FRAGMENT = 'New Again'
const DEFAULT_SAMPLE = 5
const GRADING_MODEL = 'claude-opus-4-6'

async function main() {
  const limit = Number(process.argv[2] ?? DEFAULT_SAMPLE)

  const tenant = await db.tenant.findFirst({
    where: { name: { contains: TENANT_NAME_FRAGMENT } },
    select: { id: true, name: true },
  })
  if (!tenant) {
    console.error(`No tenant matching "${TENANT_NAME_FRAGMENT}".`)
    process.exit(1)
  }

  console.log(`Tenant: ${tenant.name} (${tenant.id})`)
  console.log(`Prompt version: ${GRADING_PROMPT_VERSION}`)
  console.log(`Sampling ${limit} most-recent COMPLETED graded calls...\n`)

  // Pick calls that are scored, have a transcript, and were graded by AI.
  // Sort by most recently graded so we get the freshest comparison data.
  // durationSeconds >= 90 ensures we sample the full-grading path, not the
  // summary-only path.
  const calls = await db.call.findMany({
    where: {
      tenantId: tenant.id,
      gradingStatus: 'COMPLETED',
      transcript: { not: null },
      score: { not: null },
      durationSeconds: { gte: 90 },
    },
    orderBy: { gradedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      transcript: true,
      recordingUrl: true,
      callType: true,
      durationSeconds: true,
      direction: true,
      ghlContactId: true,
      propertyId: true,
      assignedToId: true,
      score: true,
      rubricScores: true,
      gradedAt: true,
      assignedTo: { select: { name: true, role: true } },
    },
  })

  if (calls.length === 0) {
    console.error('No calls match the criteria.')
    await db.$disconnect()
    process.exit(1)
  }

  const results: Array<{
    callId: string
    rep: string
    callType: string | null
    storedScore: number
    newScore: number
    delta: number
    storedAdherence: number | null
    newAdherence: number | null
    durationMs: number
    error?: string
  }> = []

  for (const call of calls) {
    const callId = call.id
    const t0 = Date.now()
    try {
      // Build the same context the live grader uses.
      const ctx = await buildGradingContext({
        tenantId: tenant.id,
        userId: call.assignedToId ?? undefined,
        callType: call.callType,
        userRole: call.assignedTo?.role ?? null,
        contactId: call.ghlContactId ?? null,
        propertyId: call.propertyId ?? undefined,
      })

      // Resolve the rubric exactly like the live grader.
      const rubricCriteria: RubricCriteria[] =
        (call.callType ? getRubricForCallType(call.callType) : null) ??
        defaultRubric(call.assignedTo?.role)

      const systemPrompt = buildGradingSystemPrompt(rubricCriteria, call.callType ?? null, ctx)
      const userPrompt = buildGradingUserPrompt(
        { ...call, transcript: call.transcript },
        rubricCriteria,
        null, // skip live GHL fetch — the prompts ride on transcript+metadata
      )

      const response = await anthropic.messages.stream({
        model: GRADING_MODEL,
        max_tokens: 32000,
        thinking: { type: 'enabled', budget_tokens: 16000 },
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }).finalMessage()

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text block in Claude response')
      }
      const grading = parseGradingResponse(textBlock.text)

      const storedAdherence = readAdherence(call.rubricScores)
      const newAdherence = readAdherence(grading.rubricScores)

      results.push({
        callId,
        rep: call.assignedTo?.name ?? 'Unknown',
        callType: call.callType,
        storedScore: call.score ?? 0,
        newScore: grading.overallScore,
        delta: grading.overallScore - (call.score ?? 0),
        storedAdherence,
        newAdherence,
        durationMs: Date.now() - t0,
      })
    } catch (err) {
      results.push({
        callId,
        rep: call.assignedTo?.name ?? 'Unknown',
        callType: call.callType,
        storedScore: call.score ?? 0,
        newScore: -1,
        delta: 0,
        storedAdherence: null,
        newAdherence: null,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n=== PHASE 6 GRADING VERIFICATION REPORT ===\n')
  console.log(
    'callId'.padEnd(32) +
    'rep'.padEnd(18) +
    'callType'.padEnd(22) +
    'stored'.padStart(8) +
    'new'.padStart(8) +
    'Δ'.padStart(8) +
    'sa.old'.padStart(10) +
    'sa.new'.padStart(10) +
    'ms'.padStart(8),
  )

  for (const r of results) {
    console.log(
      r.callId.slice(0, 30).padEnd(32) +
      r.rep.slice(0, 16).padEnd(18) +
      (r.callType ?? '?').padEnd(22) +
      String(r.storedScore).padStart(8) +
      (r.error ? 'ERROR' : String(r.newScore)).padStart(8) +
      (r.error ? '-' : (r.delta >= 0 ? '+' : '') + r.delta).padStart(8) +
      (r.storedAdherence === null ? '-' : String(r.storedAdherence)).padStart(10) +
      (r.newAdherence === null ? '-' : String(r.newAdherence)).padStart(10) +
      String(r.durationMs).padStart(8),
    )
    if (r.error) console.log(`  ERROR: ${r.error}`)
  }

  const regressions = results.filter(r => !r.error && Math.abs(r.delta) > 10)
  const newAdherencePresent = results.filter(r => !r.error && r.newAdherence !== null).length
  const oldAdherencePresent = results.filter(r => !r.error && r.storedAdherence !== null).length

  console.log(`\nScored ${results.length - results.filter(r => r.error).length}/${results.length} calls.`)
  console.log(`script_adherence present in NEW gradings: ${newAdherencePresent}/${results.length}.`)
  console.log(`script_adherence present in OLD gradings: ${oldAdherencePresent}/${results.length}.`)
  console.log(
    regressions.length === 0
      ? '\nPASS — no overall-score swings > 10 points.'
      : `\nFAIL — ${regressions.length} call(s) swung more than 10 points:`,
  )
  for (const r of regressions) {
    console.log(`  - ${r.callId} ${r.rep} ${r.callType}: ${r.storedScore} → ${r.newScore} (Δ${r.delta})`)
  }

  await db.$disconnect()
  process.exit(regressions.length === 0 ? 0 : 2)
}

function readAdherence(rubricScores: unknown): number | null {
  if (!rubricScores || typeof rubricScores !== 'object') return null
  const obj = (rubricScores as Record<string, unknown>).script_adherence
  if (!obj || typeof obj !== 'object') return null
  const score = (obj as Record<string, unknown>).score
  return typeof score === 'number' && Number.isFinite(score) ? score : null
}

function defaultRubric(role?: string | null): RubricCriteria[] {
  // Mirrors lib/ai/grading.ts → getDefaultRubric. Duplicated rather than
  // exported to keep the verify script self-contained.
  if (role === 'LEAD_MANAGER') {
    return [
      { category: 'Opening', maxPoints: 15, description: 'Strong opening, built rapport quickly, stated purpose clearly' },
      { category: 'Qualifying', maxPoints: 25, description: 'Asked the right qualifying questions about the property and seller motivation' },
      { category: 'Listening', maxPoints: 20, description: 'Actively listened, did not interrupt, reflected back what was heard' },
      { category: 'Objection handling', maxPoints: 20, description: 'Handled objections professionally without being pushy' },
      { category: 'Next steps', maxPoints: 20, description: 'Set a clear next step or appointment before ending the call' },
    ]
  }
  if (role === 'ACQUISITION_MANAGER') {
    return [
      { category: 'Rapport building', maxPoints: 15, description: 'Built genuine rapport and trust with the seller' },
      { category: 'Motivation discovery', maxPoints: 25, description: 'Uncovered the seller\'s true motivation for selling' },
      { category: 'Property info', maxPoints: 20, description: 'Gathered all necessary property details (condition, timeline, liens, etc.)' },
      { category: 'Offer delivery', maxPoints: 25, description: 'Presented offer confidently, explained value clearly' },
      { category: 'Close or follow up', maxPoints: 15, description: 'Moved the deal forward — appointment, signed contract, or clear follow-up plan' },
    ]
  }
  return [
    { category: 'Professionalism', maxPoints: 20, description: 'Tone, pace, and professional demeanor throughout' },
    { category: 'Communication', maxPoints: 30, description: 'Clear, concise communication — no filler words, no rambling' },
    { category: 'Knowledge', maxPoints: 25, description: 'Demonstrated knowledge of the process and company' },
    { category: 'Outcome', maxPoints: 25, description: 'Achieved a clear outcome or next step' },
  ]
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
