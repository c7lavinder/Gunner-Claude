// evals/golden/medium.ts
//
// Phase 7 of the LLM Rewiring Plan — Medium tier.
//
// Builds on the 5 smoke evals (which are tagged tiers: smoke/medium/full)
// with ~14 more covering role variations, alternate call types, the 3
// remaining surfaces (user-profile, session-summarizer, assistant), and
// regression checks tied to the Phase 0 baseline failures.
//
// Target: <2 minutes wall clock (parallel), ~$2 per run.
//
// Surface coverage (after combining with smoke):
//   grading            — qualification call (smoke) + cold call + acq-mgr role
//   coach              — driver coach (smoke) + acq-mgr + no-context guardrail
//   deal-intel         — qualification (smoke) + cold call (sparse intel)
//   property-story     — appointment-set (smoke) + minimal-data fabrication guard
//   dispo              — cash description (smoke) + sub-to + listing + tier messages
//   user-profile       — synthesize coaching profile from call sample
//   session-summarizer — summarize a 6-turn conversation
//   assistant          — narrate-on-tool-call + RED-confirm + no-hallucinated-tool
//
// Reuses the same prompt-module-isolation pattern as smoke: each eval
// builds the surface's system prompt + makes a single Anthropic call.
// No DB writes. No tool execution.

import { anthropic } from '@/config/anthropic'
import type { Eval } from '../types'
import { SMOKE_EVALS } from './smoke'
import {
  buildGradingSystemPrompt,
  buildGradingUserPrompt,
} from '@/lib/ai/prompts/grading'
import { buildCoachSystemPrompt } from '@/lib/ai/prompts/coach'
import { buildDealIntelSystemPrompt } from '@/lib/ai/prompts/deal-intel'
import { buildStorySystemPrompt } from '@/lib/ai/prompts/story'
import {
  buildDispoSystemPrompt,
  buildDispoTierMessagesSystemPrompt,
} from '@/lib/ai/prompts/dispo'
import { buildUserProfileSystemPrompt } from '@/lib/ai/prompts/user-profile'
import { buildSessionSummarizerSystemPrompt } from '@/lib/ai/prompts/session-summarizer'
import { buildAssistantSystemPrompt } from '@/lib/ai/prompts/assistant'
import { buildFixtureGradingContext } from '../fixtures/grading-context'

const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-6'
const HAIKU = 'claude-haiku-4-5-20251001'

// Token-cost rates (per million)
const OPUS_IN = 15
const OPUS_OUT = 75
const SONNET_IN = 3
const SONNET_OUT = 15
const HAIKU_IN = 1
const HAIKU_OUT = 5

const costOf = (model: string, tIn: number, tOut: number): number => {
  if (model === OPUS) return (tIn / 1e6) * OPUS_IN + (tOut / 1e6) * OPUS_OUT
  if (model === HAIKU) return (tIn / 1e6) * HAIKU_IN + (tOut / 1e6) * HAIKU_OUT
  return (tIn / 1e6) * SONNET_IN + (tOut / 1e6) * SONNET_OUT
}

// ─── Eval M1: Grading — cold call ──────────────────────────────────────

const COLD_CALL_TRANSCRIPT = `[00:00] Kyle: Hey, is this Marcus? This is Kyle with New Again Houses.
[00:05] Marcus: Yeah, what's this about?
[00:08] Kyle: I saw your property at 818 Echo Hill — is that one you own?
[00:13] Marcus: Yeah. I'm not selling.
[00:15] Kyle: Totally get it. I'm not trying to push you — just wanted to ask if you'd ever consider a cash offer if the numbers made sense?
[00:23] Marcus: I'm not really looking. What kind of numbers we talking?
[00:29] Kyle: We'd want to walk the property to give you something accurate. Quick question — anything major you'd flag? Roof, HVAC, anything?
[00:38] Marcus: Roof was redone in 2019. Everything else is original.
[00:43] Kyle: Got it. Look, here's what I'll do — let me run comps and circle back with a range. Fair?
[00:50] Marcus: Sure, send a text.
[00:52] Kyle: Will do. Talk soon.`

const M_GRADING_COLD: Eval = {
  id: 'medium-grading-cold-001',
  surface: 'grading',
  tiers: ['medium', 'full'],
  description:
    'Grade a short cold call where the seller is reluctant. Rep handled it well (no pressure, set follow-up). Output must be valid JSON + must include the script_adherence rubric.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 20, description: 'Quick rapport, clear purpose, low pressure' },
      { category: 'Discovery', maxPoints: 30, description: 'Surfaced any condition issues, sussed motivation' },
      { category: 'Next steps', maxPoints: 30, description: 'Set a clear next step even on a "not selling" lead' },
      { category: 'Tone', maxPoints: 20, description: 'Conversational, no high pressure, did not chase a quick offer' },
    ]
    const system = buildGradingSystemPrompt(rubric, 'cold_call', ctx)
    const user = buildGradingUserPrompt(
      {
        transcript: COLD_CALL_TRANSCRIPT,
        callType: 'cold_call',
        durationSeconds: 53,
        direction: 'OUTBOUND',
        assignedTo: { name: 'Kyle Barks', role: 'ACQUISITION_MANAGER' },
      },
      rubric,
      null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS,
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 4000 },
        system,
        messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: OPUS,
        costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON (no markdown fences)',
    'rubricScores contains a `script_adherence` key with `{score, maxScore, notes}` shape',
    'rubricScores contains the 4 input rubric categories (Opening, Discovery, Next steps, Tone)',
    'overallScore is a number',
    'summary or improvements references the roof-2019 detail or the "send a text" next-step',
    'callType is null OR matches "cold_call"',
  ],
  mustNotDo: [
    'Fabricate a name, address, or dollar amount not in the transcript',
    'Return empty rubricScores',
    'Score below 50 (rep handled this professionally for a cold call)',
  ],
}

// ─── Eval M2: Coach — Acquisition Manager role ─────────────────────────

const M_COACH_ACQ: Eval = {
  id: 'medium-coach-acq-001',
  surface: 'coach',
  tiers: ['medium', 'full'],
  description:
    'Coach an Acquisition Manager who is closing fewer deals than usual. Role-context should drive recommendations (contract conversion, walkthroughs) — not generic seller-call advice.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# RECENT ACTIVITY
This week: 8 walkthroughs scheduled, 3 completed, 1 contract signed. Last week: 11 walkthroughs, 6 completed, 4 contracts. 3-week trend on contract-conversion-rate: 28% → 24% → 13%.

# COMPANY SCRIPTS
### Walkthrough Close Script
- Anchor against repair estimate before quoting offer
- Use ARV × 70% − repairs − fee as the formula
- Set 14-21 day close as the value prop vs retail`

    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Kyle Barks',
      userRole: 'ACQUISITION_MANAGER',
      businessContext,
    })

    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 700,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          { role: 'user', content: 'My contract conversion is dropping. What should I focus on this week?' },
        ],
      })
      const t = resp.content.find((b) => b.type === 'text')
      const output = t && t.type === 'text' ? t.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Provides a non-empty text response',
    'References the 28% → 24% → 13% conversion-rate decline directly OR quotes one of those numbers',
    'References walkthroughs or the Walkthrough Close Script (acquisition-specific, not seller-cold-call advice)',
    'Gives at least one concrete, actionable recommendation',
  ],
  mustNotDo: [
    'Use phrases like "I\'d be happy to help" or "Great question"',
    'Give generic sales advice with no reference to the actual numbers in the context',
    'Recommend cold-call openers or qualification scripts (wrong role — Kyle is downstream of qualification)',
    'Fabricate metrics not present in the context',
  ],
}

// ─── Eval M3: Coach — No data guardrail ────────────────────────────────

const M_COACH_NO_DATA: Eval = {
  id: 'medium-coach-no-data-001',
  surface: 'coach',
  tiers: ['medium', 'full'],
  description:
    'Coach is asked a question outside its data scope. Must say it does not have the data, not fabricate an answer.',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Daniel Lozano',
      userRole: 'LEAD_MANAGER',
      businessContext: '# RECENT CALL HISTORY\n(no calls in the last 7 days)\n\n# COMPANY SCRIPTS\n(none loaded)',
    })

    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 400,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          { role: 'user', content: 'What was my best call last quarter?' },
        ],
      })
      const t = resp.content.find((b) => b.type === 'text')
      const output = t && t.type === 'text' ? t.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Acknowledges that the data is not available in the current context',
    'Stays under 100 words (no padding)',
  ],
  mustNotDo: [
    'Fabricate a specific call ID, score, or property address',
    'Quote a specific dollar amount or score that is not in the context',
    // Tightened: the coach IS allowed to OFFER to analyze data the user
    // brings in ("share the details here and I\'ll break it down") — that
    // describes future read-only analysis, not a tool execution. Only
    // FALSE if the coach claims it has ALREADY fetched something or is
    // ACTIVELY pulling data now.
    'Claim the coach has ALREADY pulled / fetched / looked up data, OR claim it is ACTIVELY executing a tool right now (e.g. "let me pull that", "I\'m searching now", "checking the database"). NOT a violation: offering to analyze data the user pastes in next ("share the details here and I\'ll break it down"), pointing the user at where to find data ("check your CRM and bring it back"), or describing what the coach can do in general.',
    'Use phrases like "Great question" or "I\'d be happy to help"',
  ],
}

// ─── Eval M4: Deal Intel — Cold call (sparse extraction) ───────────────

const M_DEAL_INTEL_COLD: Eval = {
  id: 'medium-deal-intel-cold-001',
  surface: 'deal-intel',
  tiers: ['medium', 'full'],
  description:
    'Extract deal intel from a short cold call where the seller said "not selling". Output must still parse + must NOT fabricate motivation when none was surfaced.',
  run: async () => {
    const t0 = Date.now()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const system = buildDealIntelSystemPrompt({ todayStr, learningContext: '' })

    const user = `CALL DETAILS:
- Contact: Marcus Brown
- Rep: Kyle Barks
- Call Date: ${todayStr}
- Type: cold_call | Direction: OUTBOUND | Duration: 53s
- Outcome: follow_up_scheduled
- Summary: Marcus is not selling; agreed to receive a text with a range after Kyle runs comps.

PROPERTY RECORD:
- Address: 818 Echo Hill, Nashville, TN
- Status: New Lead
- Condition: Unknown (no walkthrough yet)

FULL TRANSCRIPT:
${COLD_CALL_TRANSCRIPT}`

    try {
      const resp = await anthropic.messages.stream({
        // Same headroom rationale as smoke-deal-intel-001: production
        // truncates 3.21% of dense calls at 16K. Eval uses 24K to validate
        // the full JSON schema (perCallExtractions + propertySellerExtractions
        // emit first under the v1.1 reorder, but proposedChanges still
        // tail-truncates on dense extractions).
        model: OPUS,
        max_tokens: 24000,
        thinking: { type: 'enabled', budget_tokens: 6000 },
        system,
        messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: OPUS,
        costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'Contains `proposedChanges` and `perCallExtractions` and `propertySellerExtractions` blocks',
    'At least one proposedChange references the 2019 roof replacement',
    'Each proposedChange has an `evidence` field',
    'rollingDealSummary or summary references "not selling" or the follow-up text',
  ],
  mustNotDo: [
    'Fabricate a dollar amount that was not quoted on this call (no dollar amounts were discussed)',
    'Fabricate a seller motivation (Marcus did not surface one)',
    'Echo placeholder strings like "unknown" or "not discussed" inside proposedChanges entries (those should be omitted, not proposed)',
  ],
}

// ─── Eval M5: Property Story — minimal data, no fabrication ────────────

const M_STORY_SPARSE: Eval = {
  id: 'medium-story-sparse-001',
  surface: 'property-story',
  tiers: ['medium', 'full'],
  description:
    'Generate a property story from sparse data (no calls, no condition notes). Should produce a short, accurate paragraph that does NOT fabricate facts.',
  run: async () => {
    const t0 = Date.now()
    const system = buildStorySystemPrompt({})
    const user = `TODAY: 2026-05-13
PROPERTY: 12 Birch St, Memphis, TN 38104
STAGE: New Lead
LEAD CAME IN: 2 days ago — source=Facebook Ads, market=Memphis
ASSIGNED TO: Esteban Leiva (DISPOSITION_MANAGER)
FACTS: type=Single Family, 4 bed, 2 bath, 1820 sqft, built 1962, occupancy=owner-occupied
FINANCIALS: ARV=Not set, Asking=Not set, MAO=Not set
SELLERS: Tanya Williams [primary]
DEAL INTEL: (none yet — no calls)
CALLS: (none yet)
MILESTONES: 2026-05-11 LEAD_CREATED

Write the Deal Story paragraph now. Pull the most important signal from the data above; skip empty sections silently.`

    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Mentions 12 Birch St or Memphis',
    'References that this is a new lead (came in 2 days ago) or that no calls have happened yet',
    'Length is between 40 and 200 words. Count words in the output — if the count falls inside [40, 200] inclusive, this behavior is MET regardless of whether the content "feels" verbose. Do not judge perceived padding.',
    'Output is a single paragraph (no markdown headings, no bullets)',
  ],
  mustNotDo: [
    'Fabricate a dollar amount (ARV/Asking/MAO are all "Not set" — no numbers should appear)',
    // Judges don\'t see the eval input, so enumerate the allowed facts
    // explicitly. The story input contains: 12 Birch St / Memphis / 38104,
    // Facebook Ads source, Esteban Leiva (Disposition Manager), Tanya
    // Williams as primary seller, Single Family / 4 bed / 2 bath /
    // 1820 sqft / built 1962, owner-occupied. ANY of those facts can
    // appear verbatim or paraphrased.
    'Fabricate SPECIFIC motivation reasons ("she is downsizing", "going through divorce", "needs cash quickly", "behind on mortgage"), invented family circumstances, invented condition notes ("needs new roof", "recently renovated", "mold problem"), or invented historical details NOT in the input. Re-stating fields from the input fixture is NOT a violation: Tanya Williams, Esteban Leiva, 4 bed / 2 bath / 1820 sqft / built 1962, owner-occupied, Memphis 38104, Facebook Ads. Saying that motivation is UNKNOWN or NOT YET KNOWN is NOT a violation — that is correct given the sparse data. Phrases like "uncover her motivation" or "assess condition" describe what the rep needs to do next, not invented details.',
    'Use marketing language ("amazing", "steal", "gem", "great opportunity")',
    'Echo exactly "NEW_LEAD", "LEAD_CREATED", or any all-uppercase token containing an underscore',
  ],
}

// ─── Eval M6: Dispo — Sub-to description ───────────────────────────────

const M_DISPO_SUBTO: Eval = {
  id: 'medium-dispo-subto-001',
  surface: 'dispo',
  tiers: ['medium', 'full'],
  description:
    'Generate a Sub-to (subject-to) offer-type description. Voice must lead with loan terms (balance, payment, rate, equity) — not deal math.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDispoSystemPrompt({ kind: 'description' })
    const user = `PROPERTY FACTS:
- Address: 207 Maple Ave, Knoxville, TN
- 3 bed / 2 bath / 1620 sqft / built 1985
- Condition: Good (move-in ready, just dated finishes)
- ARV: $295,000
- Asking: $245,000

SUB-TO TERMS:
- Existing loan balance: $182,000
- Monthly payment (PITI): $1,540
- Interest rate: 3.25% (assumable)
- Years remaining: 22
- Cash to seller at close: $18,000
- Total acquisition: existing loan + cash to seller

PROS: clean title, low rate locked in, near downtown
DISPO MANAGER: Esteban Leiva
DISPO MANAGER PHONE: (615) 555-0199

Write the description now.`

    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'References the 3.25% interest rate or "assumable" loan',
    'References the loan balance ($182,000) or monthly payment ($1,540)',
    'Mentions cash-to-seller amount ($18,000) OR the payment structure',
    'Mentions Esteban Leiva',
    'Mentions the phone number (615) 555-0199 verbatim',
  ],
  mustNotDo: [
    'Use hype words: "steal", "gem", "massive", "incredible", "amazing"',
    'Fabricate a number not in the facts (only $295,000 / $245,000 / $182,000 / $1,540 / $18,000 / 3.25% / 22 years)',
    'Lead with cash-deal math (ARV × 70% − repairs) — this is Sub-to, the voice should center loan terms',
    'Use enum strings or all-caps tokens with underscores',
  ],
}

// ─── Eval M7: Dispo — Listing post ─────────────────────────────────────

const M_DISPO_LISTING: Eval = {
  id: 'medium-dispo-listing-001',
  surface: 'dispo',
  tiers: ['medium', 'full'],
  description:
    'Generate a property-listing-site post. Must use the structured "## Property Details / ## Finance & Status / ## Comps" headings.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDispoSystemPrompt({ kind: 'listing' })
    const user = `PROPERTY FACTS:
- Address: 4422 Sycamore Ln, Nashville, TN 37214
- 3 bed / 2 bath / 1450 sqft / built 1978
- Condition: needs work — water damage, old kitchen, old HVAC
- ARV: $240,000
- Asking: $125,000
- Repair estimate: $42,000

COMPS:
- 4418 Sycamore — sold 2026-03 for $228,000 (1380 sqft, 3/2, similar age)
- 4501 Sycamore — sold 2026-02 for $251,000 (1510 sqft, 3/2, newer kitchen)
- 4408 Birch Way — sold 2026-04 for $235,000 (1420 sqft, 3/2)

DISPO MANAGER: Esteban Leiva
DISPO MANAGER PHONE: (615) 555-0199

Write the listing post now.`

    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Contains the literal heading `## Property Details`',
    'Contains the literal heading `## Comps`',
    'Lists at least 2 of the 3 comp addresses (4418 Sycamore, 4501 Sycamore, 4408 Birch Way)',
    'Mentions ARV $240,000 or asking $125,000',
    'Closes with Esteban Leiva + (615) 555-0199',
  ],
  mustNotDo: [
    'Use hype words: "steal", "gem", "massive", "incredible"',
    'Fabricate a comp address or comp sale price',
    'Contain emojis',
  ],
}

// ─── Eval M8: Dispo — Tier messages ────────────────────────────────────

const M_DISPO_TIERS: Eval = {
  id: 'medium-dispo-tiers-001',
  surface: 'dispo',
  tiers: ['medium', 'full'],
  description:
    'Generate the 5-tier outreach messages (priority / qualified / jv / unqualified / realtor). Output is a JSON object with exactly those 5 keys, each containing emailSubject/emailBody/smsBody.',
  run: async () => {
    const t0 = Date.now()
    // Mirror production user-prompt structure from lib/ai/dispo-generators.ts
    // generateTierMessages — system prompt is generic; user prompt locks
    // the 5-tier snake_case JSON shape.
    const system = buildDispoTierMessagesSystemPrompt()
    const user = `PROPERTY FACTS:
- Address: 4422 Sycamore Ln, Nashville, TN 37214
- 3 bed / 2 bath / 1450 sqft / built 1978
- ARV: $240,000
- Asking: $125,000
- Repair estimate: $42,000
- Primary offer type: Cash

DISPO MANAGER: Esteban Leiva
DISPO MANAGER PHONE: (615) 555-0199

Generate one (email_subject, email_body, sms_body) trio for each of these 5 buyer tiers (priority / qualified / jv / unqualified / realtor). Each tier sees the SAME facts above, but the message MUST highlight what that buyer cares about. Use only facts from above.

Return ONLY valid JSON in this exact shape:
{
  "priority":    { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "qualified":   { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "jv":          { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "unqualified": { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "realtor":     { "email_subject": "...", "email_body": "...", "sms_body": "..." }
}

Per-message rules:
- email_body: 3-5 sentences. Close with the dispo manager's name + phone.
- sms_body: 1-2 sentences, under 320 characters. Close with name + phone.
- JV variant should reference partnership / split / hold dynamics.
- Realtor variant should reference commission room — NOT internal assignment fee.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON (after stripping any code-fence markers)',
    'JSON contains all 5 top-level keys at the root level: priority, qualified, jv, unqualified, realtor',
    'Each tier value contains `email_subject`, `email_body`, `sms_body` sub-fields (snake_case, matching production)',
    'Realtor variant references commission room or co-broker dynamics (not internal assignment-fee numbers)',
    'JV variant references partnership, split, or hold/cashflow terms',
  ],
  mustNotDo: [
    'Fabricate a dollar amount not in the facts',
    'Use hype words across any variant',
    'Include the assignment fee or internal margin in the Realtor variant',
  ],
}

// ─── Eval M9: User Profile — JSON shape + role calibration ─────────────

const M_USER_PROFILE: Eval = {
  id: 'medium-user-profile-001',
  surface: 'user-profile',
  tiers: ['medium', 'full'],
  description:
    'Generate a coaching profile from a synthetic call sample. Output must be valid JSON with the 5 fixed keys + arrays of the right length.',
  run: async () => {
    const t0 = Date.now()
    const system = buildUserProfileSystemPrompt({})
    const user = `REP: Daniel Lozano (LEAD_MANAGER)
TENANT: New Again Houses (Nashville-focused wholesaler)

CALL SAMPLE (last 90 days, 24 graded calls):
- Average score: 71
- Top score: 88 (qualification_call, walkthrough booked, restated motivation before offer)
- Bottom score: 41 (cold call, quoted offer in first 60 seconds, seller hung up)
- Common rubric strengths: opening rapport (avg 14/15), tone (avg 18/20)
- Common rubric weaknesses: decision-maker confirmation skipped on 9 of 24 calls; offer math quoted before motivation surfaced on 7 calls
- Common themes in AI summaries: "rapport solid", "skipped DM check", "jumped to price"

Generate the coaching profile JSON now.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON (no markdown fences)',
    'JSON has exactly these top-level keys: strengths, weaknesses, commonMistakes, communicationStyle, coachingPriorities',
    'strengths array has 3-5 items',
    'weaknesses array has 3-5 items',
    'At least one weakness or coaching priority references decision-maker confirmation OR quoting offer before motivation',
    'communicationStyle is a single short string (not an array, not paragraphs)',
  ],
  mustNotDo: [
    'Add additional top-level keys beyond the 5 required',
    'Use generic real-estate advice unrelated to the call sample (e.g. "use proper grammar")',
    'Fabricate a metric or score not in the sample',
  ],
}

// ─── Eval M10: Session Summarizer ──────────────────────────────────────

const M_SESSION_SUMMARIZER: Eval = {
  id: 'medium-session-summarizer-001',
  surface: 'session-summarizer',
  tiers: ['medium', 'full'],
  description:
    'Summarize a 6-turn assistant conversation into the SUMMARY: / KEY_FACTS: format the parser expects.',
  run: async () => {
    const t0 = Date.now()
    const system = buildSessionSummarizerSystemPrompt()
    const user = `Conversation to summarize:

USER: Show me Daniel's calls from yesterday
ASSISTANT: Pulling Daniel's calls — 4 graded calls yesterday. Scores 62, 71, 81, 48. The 48 was a cold call to Marcus Brown at 818 Echo Hill where he led with price.
USER: Coach me on the 48
ASSISTANT: Specific moment to fix: at 0:23 you quoted $145k before asking about condition. Try anchoring to ARV math first. Also you skipped the decision-maker check for the second time this week.
USER: Got it. Move 4422 Sycamore to Under Contract
ASSISTANT: Confirming before I make this change: 4422 Sycamore Ln (Robert Mendez). From: Appointment Set → To: Under Contract. Yes or no?
USER: Yes
ASSISTANT: Moved 4422 Sycamore to Under Contract. Updated GHL opp. Also created a follow-up task for Esteban (Disposition) due tomorrow 9am.
USER: Thanks, that's all for today
ASSISTANT: Closed. 4422 in your contracts lane. Daniel's coaching pinned: anchor ARV math first, confirm decision-maker every call.`
    try {
      const resp = await anthropic.messages.create({
        model: HAIKU,
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: user }],
      })
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text.trim() : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: HAIKU,
        costUsd: costOf(HAIKU, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: HAIKU, errored: true }
    }
  },
  expectedBehaviors: [
    'Output contains the exact literal token "SUMMARY:" (uppercase, with colon)',
    'Output contains the exact literal token "KEY_FACTS:" (uppercase, with colon)',
    'SUMMARY section is 3-5 sentences (not a single sentence, not 10+)',
    'KEY_FACTS includes 4422 Sycamore OR Robert Mendez OR Under Contract',
    'KEY_FACTS is a comma-separated list (not bullets, not numbered)',
  ],
  mustNotDo: [
    'Include the labels in lowercase ("summary:" instead of "SUMMARY:")',
    'Add additional labeled sections beyond SUMMARY and KEY_FACTS',
    'Use bullet points anywhere',
    'Fabricate a fact not present in the conversation',
  ],
}

// ─── Eval M11: Assistant — Narrate on tool call (Phase 0 fix #1) ───────

const M_ASSISTANT_NARRATE: Eval = {
  id: 'medium-assistant-narrate-001',
  surface: 'assistant',
  tiers: ['medium', 'full'],
  description:
    'Phase 0 baseline failure #1 regression: assistant must produce a text statement even when calling tools (no silent tool-only responses).',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, pageBlock, variableTail } = buildAssistantSystemPrompt({
      tenantName: 'New Again Houses',
      userName: 'Daniel Lozano',
      userRole: 'LEAD_MANAGER',
      businessContext:
        '# RECENT 7 DAYS\nGraded calls: 12. Avg score 71. Appointments set: 3.\n\n# YOUR PROPERTIES\n(loaded on demand via search tool)',
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 600,
        system: [
          { type: 'text' as const, text: stableSystem, cache_control: { type: 'ephemeral' as const } },
          ...(pageBlock ? [{ type: 'text' as const, text: pageBlock }] : []),
          { type: 'text' as const, text: variableTail },
        ],
        messages: [{ role: 'user', content: 'Show me my calls from yesterday' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      const output = t && t.type === 'text' ? t.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is a non-empty text statement (not blank)',
    'Output mentions what the assistant is about to do or look up (e.g. "pulling", "checking", "finding")',
    'Output is short (under 80 words) — the assistant is not supposed to ramble before fetching data',
  ],
  mustNotDo: [
    'Be entirely blank or whitespace',
    'Use phrases like "Great question" or "I\'d be happy to help"',
    'Fabricate specific call data (no real call data is available — the assistant should ask for or fetch the data, not invent it)',
    'Claim it has already pulled the data when no tool has actually executed',
  ],
}

// ─── Eval M12: Assistant — Confirm before RED action (Phase 0 fix #2) ──

const M_ASSISTANT_RED: Eval = {
  id: 'medium-assistant-red-confirm-001',
  surface: 'assistant',
  tiers: ['medium', 'full'],
  description:
    'Phase 0 baseline failure #2 regression: when the user requests a RED-tier action (change_property_status), the assistant must REQUEST confirmation in text — not silently execute or fire a tool without acknowledgement.',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, pageBlock, variableTail } = buildAssistantSystemPrompt({
      tenantName: 'New Again Houses',
      userName: 'Daniel Lozano',
      userRole: 'LEAD_MANAGER',
      businessContext:
        '# RECENT PROPERTIES\n4422 Sycamore Ln, Nashville — Robert Mendez, currently in stage "Appointment Set"',
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 600,
        system: [
          { type: 'text' as const, text: stableSystem, cache_control: { type: 'ephemeral' as const } },
          ...(pageBlock ? [{ type: 'text' as const, text: pageBlock }] : []),
          { type: 'text' as const, text: variableTail },
        ],
        messages: [{ role: 'user', content: 'Move 4422 Sycamore to Under Contract' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      const output = t && t.type === 'text' ? t.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Output mentions 4422 Sycamore by name or address',
    'Output mentions a "from / to" transition (Appointment Set → Under Contract or similar)',
    'Output explicitly asks for confirmation (e.g. "yes or no", "confirm", "OK to proceed", "should I proceed")',
  ],
  mustNotDo: [
    'Claim the stage has been changed already (no confirmation has been received)',
    'Skip any reference to confirmation entirely (silent execution is the regression we are guarding against)',
    'Fire the action without surfacing it to the user first',
  ],
}

// ─── Eval M13: Assistant — Cite real tool names (Phase 3 fix) ──────────

const M_ASSISTANT_TOOL_NAME: Eval = {
  id: 'medium-assistant-tool-name-001',
  surface: 'assistant',
  tiers: ['medium', 'full'],
  description:
    'Assistant must not invent tool names. If it references its capabilities in text, it must use names that actually exist or stay generic ("I can search your calls") — never a fabricated tool name.',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, pageBlock, variableTail } = buildAssistantSystemPrompt({
      tenantName: 'New Again Houses',
      userName: 'Daniel Lozano',
      userRole: 'LEAD_MANAGER',
      businessContext: '# RECENT 7 DAYS\nGraded calls: 12.',
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 500,
        system: [
          { type: 'text' as const, text: stableSystem, cache_control: { type: 'ephemeral' as const } },
          ...(pageBlock ? [{ type: 'text' as const, text: pageBlock }] : []),
          { type: 'text' as const, text: variableTail },
        ],
        messages: [{ role: 'user', content: 'What can you actually do?' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      const output = t && t.type === 'text' ? t.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: SONNET,
        costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Produces a non-empty text response that describes the assistant\'s capabilities',
    'Capabilities described relate to: search calls, search properties, change stage, add notes, send SMS, view performance, OR similar real assistant capabilities for wholesale real estate',
  ],
  mustNotDo: [
    'Reference a tool named exactly `call_analysis` (removed in Phase 3b)',
    'Reference a tool named exactly `pipeline_health` (removed in Phase 3b)',
    'Reference a tool named exactly `team_overview` (removed in Phase 3b)',
    'Reference a tool named exactly `what_next` (removed in Phase 3b)',
    // Tightened: the assistant prompt explicitly requires asking the user
    // what they need ("What do you need?", "What\'s next?" — direct ops
    // closers are required, not marketing). Marketing language is the
    // padding-and-flatter pattern, not engagement prompts.
    'Use literally one of these exact marketing phrases (case-insensitive): "I\'d be happy to help", "I\'m happy to help", "Great question", "Let me explain", "Happy to assist". NOT a violation: short direct closers like "What do you need?", "What\'s next?", "Anything else?".',
  ],
}

// ─── Eval M14: Grading — gracefully handle short transcript ────────────

const M_GRADING_SHORT: Eval = {
  id: 'medium-grading-short-001',
  surface: 'grading',
  tiers: ['medium', 'full'],
  description:
    'Grade a very short call (30s, hung up). Should produce valid JSON + a low overallScore + still emit the script_adherence rubric.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 30, description: 'Quick rapport, clear purpose' },
      { category: 'Recovery', maxPoints: 40, description: 'Did the rep keep the conversation alive' },
      { category: 'Next steps', maxPoints: 30, description: 'Did the rep get permission to follow up' },
    ]
    const transcript = `[00:00] Daniel: Hi, is this James? I'm calling about your property on Pine.
[00:04] James: Not interested. (hangs up)`
    const system = buildGradingSystemPrompt(rubric, 'cold_call', ctx)
    const user = buildGradingUserPrompt(
      {
        transcript,
        callType: 'cold_call',
        durationSeconds: 7,
        direction: 'OUTBOUND',
        assignedTo: { name: 'Daniel Lozano', role: 'LEAD_MANAGER' },
      },
      rubric,
      null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS,
        max_tokens: 4000,
        thinking: { type: 'enabled', budget_tokens: 2000 },
        system,
        messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text : ''
      return {
        output,
        durationMs: Date.now() - t0,
        model: OPUS,
        costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0),
      }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'rubricScores contains the 3 input rubric categories',
    'rubricScores contains a `script_adherence` key',
    'overallScore is a number',
    'summary or improvements references the hang-up or short duration',
  ],
  mustNotDo: [
    'Fabricate dialogue not in the transcript',
    'Score above 60 (the call ended in a hang-up — even a perfect opening cannot save it)',
  ],
}

// ─── Export ─────────────────────────────────────────────────────────────

export const MEDIUM_EVALS: Eval[] = [
  ...SMOKE_EVALS, // 5 evals from smoke (all tagged 'medium')
  M_GRADING_COLD,
  M_GRADING_SHORT,
  M_COACH_ACQ,
  M_COACH_NO_DATA,
  M_DEAL_INTEL_COLD,
  M_STORY_SPARSE,
  M_DISPO_SUBTO,
  M_DISPO_LISTING,
  M_DISPO_TIERS,
  M_USER_PROFILE,
  M_SESSION_SUMMARIZER,
  M_ASSISTANT_NARRATE,
  M_ASSISTANT_RED,
  M_ASSISTANT_TOOL_NAME,
]
