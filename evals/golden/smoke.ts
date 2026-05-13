// evals/golden/smoke.ts
//
// Phase 7 of the LLM Rewiring Plan — Smoke set.
//
// 5 evals run pre-commit when files under lib/ai/ or lib/ai/prompts/
// change. Target: <30s, <$0.50 per run. Catches obvious regressions
// (broken JSON, fabricated facts, voice drift, tool-name hallucinations).
//
// Coverage selection (one eval per critical-surface category):
//   1. grading        — JSON schema correctness + script_adherence rubric
//   2. coach          — text response, references the playbook
//   3. deal-intel     — JSON schema + proposedChanges shape
//   4. property-story — strict-fact rule (no fabricated numbers)
//   5. dispo          — strict-fact + tone rules (no hype words)
//
// The assistant surface is intentionally NOT in the smoke set — its
// pipeline depends on tool execution + role-gates + DB queries. The
// medium/full tiers will test it via a live route in a future session.

import { anthropic } from '@/config/anthropic'
import type { Eval } from '../types'
import {
  buildGradingSystemPrompt,
  buildGradingUserPrompt,
} from '@/lib/ai/prompts/grading'
import { buildCoachSystemPrompt } from '@/lib/ai/prompts/coach'
import { buildDealIntelSystemPrompt } from '@/lib/ai/prompts/deal-intel'
import { buildStorySystemPrompt } from '@/lib/ai/prompts/story'
import { buildDispoSystemPrompt } from '@/lib/ai/prompts/dispo'
import {
  buildFixtureGradingContext,
  FIXTURE_TRANSCRIPT_QUALIFICATION,
} from '../fixtures/grading-context'

// ─── Eval 1: Grading — JSON shape + script_adherence rubric ─────────────

const GRADING_EVAL: Eval = {
  id: 'smoke-grading-001',
  surface: 'grading',
  tiers: ['smoke', 'medium', 'full'],
  description:
    'Grade a synthetic qualification-call transcript. Output must be valid JSON conforming to the grading schema, including the new script_adherence rubric category. Should grade in the 65-85 range given the call quality.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 15, description: 'Strong opening, built rapport quickly, stated purpose clearly' },
      { category: 'Qualifying', maxPoints: 25, description: 'Asked the right qualifying questions about the property and seller motivation' },
      { category: 'Listening', maxPoints: 20, description: 'Actively listened, did not interrupt, reflected back what was heard' },
      { category: 'Objection handling', maxPoints: 20, description: 'Handled objections professionally without being pushy' },
      { category: 'Next steps', maxPoints: 20, description: 'Set a clear next step or appointment before ending the call' },
    ]
    const system = buildGradingSystemPrompt(rubric, 'qualification_call', ctx)
    const user = buildGradingUserPrompt(
      {
        transcript: FIXTURE_TRANSCRIPT_QUALIFICATION,
        callType: 'qualification_call',
        durationSeconds: 215,
        direction: 'OUTBOUND',
        assignedTo: { name: 'Daniel Lozano', role: 'LEAD_MANAGER' },
      },
      rubric,
      null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 8000 },
        system,
        messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text : ''
      const tokensIn = resp.usage?.input_tokens ?? 0
      const tokensOut = resp.usage?.output_tokens ?? 0
      const costUsd = (tokensIn / 1_000_000) * 15 + (tokensOut / 1_000_000) * 75
      return {
        output,
        durationMs: Date.now() - t0,
        model: 'claude-opus-4-6',
        costUsd,
      }
    } catch (err) {
      return {
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        model: 'claude-opus-4-6',
        errored: true,
      }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON (no markdown fences, no surrounding prose)',
    'Output contains a `rubricScores` object',
    'rubricScores contains a `script_adherence` key with `{score, maxScore, notes}` shape',
    'rubricScores contains the 5 input rubric categories (Opening, Qualifying, Listening, Objection handling, Next steps)',
    'overallScore is a number between 0 and 100',
    'summary references specific moments from the transcript (offer range, walkthrough Thursday, brother\'s objection, etc.)',
    'callType is null OR matches "qualification_call"',
    'improvements (when present) cite a specific quote from the transcript',
  ],
  mustNotDo: [
    'Fabricate a name, address, or dollar amount not in the transcript',
    'Return empty rubricScores',
    'Use generic real-estate advice unrelated to the transcript',
    'Return overallScore below 40 (the call was reasonable, not a disaster)',
    'Return overallScore above 95 (the call had real misses — skipped decision-maker check, jumped to price)',
  ],
}

// ─── Eval 2: Coach — text response that references the playbook ─────────

const COACH_EVAL: Eval = {
  id: 'smoke-coach-001',
  surface: 'coach',
  tiers: ['smoke', 'medium', 'full'],
  description:
    'Ask the coach for feedback on a recent call. Must produce a text response (not silent), reference specific company scripts/techniques, and stay within length discipline.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# RECENT CALL HISTORY
[2026-05-12] Qualification call with Robert Mendez (4422 Sycamore Ln, Nashville). Score: 72. Outcome: appointment_set (walkthrough Thursday 2pm). Daniel skipped decision-maker confirmation for the brother (Robert mentioned brother was pushing for retail listing). Daniel jumped to offer math at 1:51 before fully restating motivation. Strong recovery in objection handling.

# COMPANY SCRIPTS
### Qualification Call Script
1. Confirm decision-maker
2. Property condition
3. Motivation
4. Timeline
5. Price expectation
6. Set the next step

### Objection: "Your offer is too low"
Response: "That's totally fair — I get it. Can I show you the math? We use a formula: ARV × 70% − repairs − our fee."`

    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Daniel Lozano',
      userRole: 'LEAD_MANAGER',
      businessContext,
    })

    try {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          { role: 'user', content: 'Coach me on the Robert Mendez call from yesterday. What did I miss?' },
        ],
      })
      const block = resp.content.find((b) => b.type === 'text')
      const output = block && block.type === 'text' ? block.text : ''
      const tokensIn = resp.usage?.input_tokens ?? 0
      const tokensOut = resp.usage?.output_tokens ?? 0
      const costUsd = (tokensIn / 1_000_000) * 3 + (tokensOut / 1_000_000) * 15
      return {
        output,
        durationMs: Date.now() - t0,
        model: 'claude-sonnet-4-6',
        costUsd,
      }
    } catch (err) {
      return {
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        model: 'claude-sonnet-4-6',
        errored: true,
      }
    }
  },
  expectedBehaviors: [
    'Provides a non-empty text response',
    'References the missed decision-maker confirmation specifically',
    'Quotes or paraphrases content from the COMPANY SCRIPTS block',
    'Mentions Robert Mendez or 4422 Sycamore by name',
    'Includes a concrete next-action recommendation for Daniel',
  ],
  mustNotDo: [
    'Use phrases like "I\'d be happy to help" or "Great question"',
    'Try to take an action (suggesting it can send SMS, create tasks, change pipeline stages)',
    'Give generic real-estate advice unrelated to the rep\'s actual call',
    'Fabricate facts not present in the RECENT CALL HISTORY block',
  ],
}

// ─── Eval 3: Deal Intel — JSON schema + proposedChanges shape ───────────

const DEAL_INTEL_EVAL: Eval = {
  id: 'smoke-deal-intel-001',
  surface: 'deal-intel',
  tiers: ['smoke', 'medium', 'full'],
  description:
    'Extract deal intel from a synthetic call. Output must be valid JSON with proposedChanges + perCallExtractions + propertySellerExtractions sections, and must include at least one Seller-targeted change.',
  run: async () => {
    const t0 = Date.now()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const system = buildDealIntelSystemPrompt({
      todayStr,
      learningContext: '',
    })

    const user = `CALL DETAILS:
- Contact: Robert Mendez
- Rep: Daniel Lozano
- Call Date: ${todayStr}
- Type: qualification_call | Direction: OUTBOUND | Duration: 215s
- Outcome: appointment_set
- Summary: Robert confirmed sole owner, walkthrough set Thursday 2pm. Brother pushing for retail listing.

PROPERTY RECORD:
- Address: 4422 Sycamore Ln, Nashville, TN 37214
- Status: New Lead
- Asking Price: Not set
- Condition: Vacant, water damage, original 1978 kitchen, old HVAC

CURRENTLY KNOWN DEAL INTEL:
- Seller Why Selling: inherited (Q4 2025)
- Seller Family Situation: brother co-decisionmaker, pushing for retail listing

FULL TRANSCRIPT:
${FIXTURE_TRANSCRIPT_QUALIFICATION}`

    try {
      // Match production sizing: lib/ai/extract-deal-intel.ts uses 16K + 8K
      // thinking. Under-sizing the eval truncates the JSON output and
      // generates false-positive regressions.
      const resp = await anthropic.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 16000,
        thinking: { type: 'enabled', budget_tokens: 8000 },
        system,
        messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text : ''
      const tokensIn = resp.usage?.input_tokens ?? 0
      const tokensOut = resp.usage?.output_tokens ?? 0
      const costUsd = (tokensIn / 1_000_000) * 15 + (tokensOut / 1_000_000) * 75
      return {
        output,
        durationMs: Date.now() - t0,
        model: 'claude-opus-4-6',
        costUsd,
      }
    } catch (err) {
      return {
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        model: 'claude-opus-4-6',
        errored: true,
      }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'Contains a `proposedChanges` array with at least 3 entries',
    'Contains `perCallExtractions` with non-null `callPrimaryEmotion`',
    'Contains `propertySellerExtractions` with `negotiationStage` set',
    'At least one proposedChange has `target: "seller"` (motivation/decisionMaker facts)',
    'At least one proposedChange references the brother as a co-decisionmaker',
    'Each proposedChange has an `evidence` field quoting/paraphrasing the transcript',
    'Includes a `rollingDealSummary` referencing inheritance + brother + walkthrough',
  ],
  mustNotDo: [
    'Fabricate a dollar amount not in the transcript',
    'Use placeholder strings like "not discussed" or "unknown" in proposedChanges',
    'Return empty proposedChanges',
    'Omit perCallExtractions or propertySellerExtractions blocks',
  ],
}

// ─── Eval 4: Property Story — strict-fact rule ──────────────────────────

const STORY_EVAL: Eval = {
  id: 'smoke-story-001',
  surface: 'property-story',
  tiers: ['smoke', 'medium', 'full'],
  description:
    'Generate a property story from sparse + specific data. Must not fabricate dollar amounts. Must read as an internal briefing, not marketing.',
  run: async () => {
    const t0 = Date.now()
    const system = buildStorySystemPrompt({})

    const user = `TODAY: 2026-05-13
PROPERTY: 4422 Sycamore Ln, Nashville, TN 37214
STAGE: Appointment Set
LEAD CAME IN: 21 days ago (2026-04-22) — source=PPC, market=Nashville
ASSIGNED TO: Daniel Lozano (LEAD_MANAGER)
FACTS: type=Single Family, 3 bed, 2 bath, 1450 sqft, built 1978, occupancy=vacant, condition=needs work
FINANCIALS: ARV=$240,000, Asking=Not set, MAO=Not set

SELLERS: Robert Mendez [primary] (owner) — (615) 555-0123

DEAL INTEL (from calls):
  sellerWhySelling: inherited from mother in Q4 2025
  sellerFamilySituation: brother co-decisionmaker, pushing for retail listing
  sellerMotivationLevel: moderate (3-month patience)
  conditionNotesFromSeller: water damage in back bedroom, original 1978 kitchen, old HVAC

CALLS (most recent first, max 10):
  [2026-05-13] Daniel · outbound qualification_call · 3m35s · score=72
    Daniel set Thursday 2pm walkthrough. Confirmed Robert sole owner. Brother pushing retail, mentioned brother thinks $180-190k retail. Daniel quoted $110-125k cash range pending walkthrough.
  [2026-04-22] Daniel · outbound cold_call · score=71
    Cold call. Confirmed Robert sole owner. Inheritance Q4 2025. Said "think about it", agreed to follow up.

MILESTONES: 2026-04-22 LEAD_CREATED; 2026-05-13 APPOINTMENT_SET — walkthrough Thursday 2pm

Write the Deal Story paragraph now. Pull the most important signal from the data above; skip empty sections silently.`

    try {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      const tokensIn = resp.usage?.input_tokens ?? 0
      const tokensOut = resp.usage?.output_tokens ?? 0
      const costUsd = (tokensIn / 1_000_000) * 3 + (tokensOut / 1_000_000) * 15
      return {
        output,
        durationMs: Date.now() - t0,
        model: 'claude-sonnet-4-6',
        costUsd,
      }
    } catch (err) {
      return {
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        model: 'claude-sonnet-4-6',
        errored: true,
      }
    }
  },
  expectedBehaviors: [
    'Output contains zero literal newline characters and zero markdown headings or bullets (it is one continuous paragraph)',
    'Mentions 4422 Sycamore by address',
    'References Robert Mendez by name',
    'References the Thursday walkthrough or appointment',
    'Mentions inheritance + brother co-decisionmaker',
    'Length is between 80 and 350 words',
  ],
  mustNotDo: [
    'Fabricate a dollar amount that is not in the input (only $240,000 ARV, $180-190k retail, $110-125k cash should appear)',
    'Use marketing language ("amazing opportunity", "steal", "gem", "must-see")',
    // The rule below is case-sensitive: we object only to UPPERCASE_WITH_UNDERSCORES.
    // The plain-English forms ("appointment set", "lead created", "pre-foreclosure")
    // are REQUIRED by the prompt and must not be flagged as violations.
    'Echo any all-UPPERCASE word containing one or more underscores (e.g. exactly "NEW_LEAD", "APPOINTMENT_SET", "DISPO_PUSHED" — case-sensitive ALL CAPS only). Lowercase or sentence-case equivalents like "appointment set" or "appointment set stage" or "pre-foreclosure" are NOT violations and must NOT be flagged.',
    'Hedge with phrases like "it appears", "it seems", or "looks like"',
  ],
}

// ─── Eval 5: Dispo Description — strict-fact + tone ─────────────────────

const DISPO_EVAL: Eval = {
  id: 'smoke-dispo-001',
  surface: 'dispo',
  tiers: ['smoke', 'medium', 'full'],
  description:
    'Generate a customer-facing dispo description. Must close with the dispo manager + phone, must not use hype words, must not fabricate numbers.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDispoSystemPrompt({ kind: 'description' })

    const user = `PROPERTY FACTS:
- Address: 4422 Sycamore Ln, Nashville, TN
- 3 bed / 2 bath / 1450 sqft / built 1978
- Condition: needs work — water damage, original 1978 kitchen, old HVAC
- ARV: $240,000
- Asking: $125,000
- Repair estimate: $42,000
- Primary offer type: Cash

PROS: vacant, single owner (clean title), Nashville metro
WORK NEEDED: Roof, kitchen, HVAC

DISPO MANAGER: Esteban Leiva
DISPO MANAGER PHONE: (615) 555-0199

Write the description now.`

    try {
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      const tokensIn = resp.usage?.input_tokens ?? 0
      const tokensOut = resp.usage?.output_tokens ?? 0
      const costUsd = (tokensIn / 1_000_000) * 3 + (tokensOut / 1_000_000) * 15
      return {
        output,
        durationMs: Date.now() - t0,
        model: 'claude-sonnet-4-6',
        costUsd,
      }
    } catch (err) {
      return {
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        model: 'claude-sonnet-4-6',
        errored: true,
      }
    }
  },
  expectedBehaviors: [
    'Output is a single paragraph, 2-4 sentences',
    'Mentions Esteban Leiva',
    'Mentions the phone number (615) 555-0199 verbatim',
    'References specific numbers from the facts (ARV $240,000, asking $125,000, or repairs $42,000)',
    'Mentions at least one specific item of work needed (roof, kitchen, or HVAC)',
  ],
  mustNotDo: [
    'Use hype words: "steal", "gem", "massive", "explosive", "insane", "amazing", "incredible", "unbelievable"',
    'Contain any emoji',
    'Fabricate a dollar amount not in the facts (only $240,000, $125,000, $42,000 are valid)',
    'Use internal codes or enum strings like "DISPO_NEW", "preForeclosure", or any all-caps underscore string',
    'Hedge with phrases like "it appears" or "it seems"',
  ],
}

export const SMOKE_EVALS: Eval[] = [
  GRADING_EVAL,
  COACH_EVAL,
  DEAL_INTEL_EVAL,
  STORY_EVAL,
  DISPO_EVAL,
]
