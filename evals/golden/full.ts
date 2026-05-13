// evals/golden/full.ts
//
// Phase 7 of the LLM Rewiring Plan — Full tier.
//
// Builds on medium (which includes smoke). Adds ~25 evals covering:
//   - adversarial inputs (PII, profanity, empty, foreign language)
//   - regression scenarios (Phase 0 baseline failures replayed)
//   - cross-surface chains (grading → deal-intel → coach)
//   - role + scenario depth not in medium (novation dispo, contradicted
//     intel, multi-tool assistant queries, etc.)
//
// Target: <4 minutes wall clock (parallel), ~$4-5 per run.
// Runs nightly via the railway cron (`weekly-evals` already runs
// medium weekly; future tightening can swap medium → full).

import { anthropic } from '@/config/anthropic'
import type { Eval } from '../types'
import { MEDIUM_EVALS } from './medium'
import {
  buildGradingSystemPrompt,
  buildGradingUserPrompt,
} from '@/lib/ai/prompts/grading'
import { buildCoachSystemPrompt } from '@/lib/ai/prompts/coach'
import { buildDealIntelSystemPrompt } from '@/lib/ai/prompts/deal-intel'
import { buildStorySystemPrompt } from '@/lib/ai/prompts/story'
import { buildDispoSystemPrompt } from '@/lib/ai/prompts/dispo'
import { buildUserProfileSystemPrompt } from '@/lib/ai/prompts/user-profile'
import { buildSessionSummarizerSystemPrompt } from '@/lib/ai/prompts/session-summarizer'
import { buildAssistantSystemPrompt } from '@/lib/ai/prompts/assistant'
import { buildFixtureGradingContext } from '../fixtures/grading-context'

const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-6'
const HAIKU = 'claude-haiku-4-5-20251001'

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

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

// ─── F1: Grading — Hard objection-heavy call ───────────────────────────

const F_GRADING_OBJECTIONS: Eval = {
  id: 'full-grading-objections-001',
  surface: 'grading',
  tiers: ['full'],
  description:
    'Grade a call where the seller raises 3+ objections back-to-back. The rep handles one well, dodges one, and panics on one. Output must call out each objection moment specifically.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 15, description: 'Rapport + purpose' },
      { category: 'Discovery', maxPoints: 25, description: 'Property + motivation' },
      { category: 'Objection handling', maxPoints: 35, description: 'How each objection was addressed' },
      { category: 'Next steps', maxPoints: 25, description: 'Clear next step despite resistance' },
    ]
    const transcript = `[00:00] Daniel: Hey, Daniel from New Again Houses. Got a sec?
[00:04] Sarah: Look, I told the last three of you the same thing. I'm not interested in selling under market.
[00:11] Daniel: I hear you. Can I ask — what number would even start the conversation?
[00:16] Sarah: I'd need 195. The Zillow says it's worth 220.
[00:20] Daniel: OK. And what's the condition like — anything major?
[00:24] Sarah: It's fine. I'm not doing a list.
[00:27] Daniel: Fair. The 195 — is that what your accountant told you you need, or your gut?
[00:34] Sarah: That's what I need to pay off the mortgage and walk.
[00:39] Daniel: Got it. So 195 puts cash in your hand after the loan?
[00:43] Sarah: Yeah.
[00:45] Daniel: OK. Honestly, given the condition probably isn't perfect — even at retail you're probably paying 8 grand in commission and waiting 90 days. We can offer 165 cash, close in 21 days, you walk with cash same day. Different conversation if you want speed.
[00:58] Sarah: 165 is a joke. I'd rather list it.
[01:03] Daniel: Fair enough — I'd probably feel the same. If listing doesn't pan out in 60 days, my number's the same. Can I check back then?
[01:13] Sarah: Sure, whatever.
[01:15] Daniel: Sounds good. I'll text you in 60 days. Have a good one.`
    const system = buildGradingSystemPrompt(rubric, 'objection_call', ctx)
    const user = buildGradingUserPrompt(
      { transcript, callType: 'objection_call', durationSeconds: 78, direction: 'OUTBOUND',
        assignedTo: { name: 'Daniel Lozano', role: 'LEAD_MANAGER' } },
      rubric, null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 8000, thinking: { type: 'enabled', budget_tokens: 4000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      const output = text && text.type === 'text' ? text.text : ''
      return { output, durationMs: Date.now() - t0, model: OPUS,
        costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'rubricScores contains a `script_adherence` key',
    'overallScore is between 50 and 80 (rep had real misses but stayed professional)',
    'summary or improvements references the 195 vs 165 anchor delta OR the 60-day callback agreement',
    'Notes the "165 is a joke" moment OR Daniel\'s recovery via the listing-fallback frame',
  ],
  mustNotDo: [
    'Fabricate a dollar amount not in the transcript (only 195, 220, 165, 8 are valid)',
    'Fabricate a seller name beyond "Sarah"',
    'Score above 90 (rep dropped to 165 too fast)',
  ],
}

// ─── F2: Grading — Inbound caller ──────────────────────────────────────

const F_GRADING_INBOUND: Eval = {
  id: 'full-grading-inbound-001',
  surface: 'grading',
  tiers: ['full'],
  description:
    'Grade an INBOUND lead (seller called us). Should NOT penalize rep for "warm" opening since the lead came in pre-warmed.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 10, description: 'Warm pickup, sets context' },
      { category: 'Discovery', maxPoints: 35, description: 'Why they called, what they need' },
      { category: 'Tone', maxPoints: 25, description: 'Professional, no pressure' },
      { category: 'Next steps', maxPoints: 30, description: 'Concrete next action' },
    ]
    const transcript = `[00:00] Chris: New Again Houses, this is Chris.
[00:03] Jorge: Hi Chris — I saw your sign on the corner of Elm and 5th. I have a property to sell, 412 Pine St.
[00:11] Chris: Glad you called. Tell me about 412 Pine — when did you buy it?
[00:16] Jorge: My mother left it to me, she passed in February. It's been sitting empty.
[00:23] Chris: I'm sorry to hear that. So you inherited it — is it in your name on the deed yet?
[00:29] Jorge: Yeah, through probate, finished last month.
[00:33] Chris: Good. What's the condition like? Has anyone been in to maintain it?
[00:39] Jorge: It's tired. Kitchen from the 80s, roof needs work, but it's structurally fine.
[00:46] Chris: OK. And do you have a number in mind, or you want to hear what we'd offer?
[00:51] Jorge: I'd like to hear your offer. Other people have said 130-140 range.
[00:58] Chris: Got it. I can come walk through Friday afternoon if that works, and after that I'll have a firm cash number for you within 24 hours.
[01:08] Jorge: Friday at 3 works.
[01:11] Chris: 3pm Friday at 412 Pine. I'll send a confirmation text. Anything else you want me to bring?
[01:18] Jorge: No, just come prepared.
[01:20] Chris: Will do. Talk to you Friday.`
    const system = buildGradingSystemPrompt(rubric, 'inbound_call', ctx)
    const user = buildGradingUserPrompt(
      { transcript, callType: 'inbound_call', durationSeconds: 85, direction: 'INBOUND',
        assignedTo: { name: 'Chris Segura', role: 'LEAD_MANAGER' } },
      rubric, null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 8000, thinking: { type: 'enabled', budget_tokens: 4000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'rubricScores contains script_adherence',
    'overallScore is between 70 and 92 (clean inbound, set walkthrough)',
    'Recognizes the inbound nature (the lead called us, not us them)',
    'References the Friday 3pm walkthrough or the 412 Pine address',
  ],
  mustNotDo: [
    'Penalize Chris for not having a "cold-call opener" (this was inbound)',
    'Fabricate facts not in the transcript',
  ],
}

// ─── F3: Coach — bad call recovery focus ───────────────────────────────

const F_COACH_BAD_CALL: Eval = {
  id: 'full-coach-bad-call-001',
  surface: 'coach',
  tiers: ['full'],
  description:
    'Coach on a call that scored 38 (bad). Coaching should focus on the 2-3 biggest leverage points, not a 10-item laundry list.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# RECENT CALL HISTORY
[${TODAY}] Cold call to Marcus, 414 Linden Ave. Score: 38. Outcome: seller hung up.
Daniel quoted $85k cash in the first 45 seconds, before asking ANY qualifying questions.
No motivation surfaced. No condition discussed. No timeline. No decision-maker check.
Seller said "you guys are wasting my time" and hung up.

# COMPANY SCRIPTS
### Qualification Call Script (always run BEFORE offer)
1. Confirm DM 2. Property condition 3. Motivation 4. Timeline 5. Price expectation 6. Set next step

### Objection: low offer
Anchor to ARV math, not the seller's number. NEVER lead with price.`
    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER', businessContext,
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 600,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: 'Coach me on the Marcus call — that was rough.' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Mentions the $85k quote OR the "first 45 seconds" timing problem',
    'References the qualification-before-offer rule from the playbook',
    'Provides 2-3 concrete fixes (not a long laundry list)',
    'Acknowledges this was a rough call without piling on',
  ],
  mustNotDo: [
    'Recite a 10+ item improvement list',
    'Use phrases like "Great question" or "I\'d be happy to"',
    'Suggest the rep is fundamentally bad at their job',
  ],
}

// ─── F4: Coach — no playbook loaded ────────────────────────────────────

const F_COACH_NO_PLAYBOOK: Eval = {
  id: 'full-coach-no-playbook-001',
  surface: 'coach',
  tiers: ['full'],
  description:
    'Coach a call when the playbook is empty (new tenant or knowledge docs not loaded). Should give useful generic-wholesaler advice without claiming to quote a playbook that does not exist.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# RECENT CALL HISTORY
[${TODAY}] Cold call to Lisa. Score: 62. Daniel set follow-up for next Tuesday. No appointment.

# COMPANY SCRIPTS
(no playbook loaded yet)`
    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER', businessContext,
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 500,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: 'How should I have handled that?' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Produces a useful response — either coaching advice OR a request for more information about the call (both are valid when the playbook is empty and the question is open-ended)',
    'References Lisa by name OR the 62 score OR the next-Tuesday follow-up (acknowledges what the user is asking about)',
  ],
  mustNotDo: [
    'Quote from a "company playbook" or "your script" — none is loaded',
    'Fabricate specific scripts (e.g. invent step-by-step "scripts from our playbook")',
    'Refuse to engage because playbook is missing',
  ],
}

// ─── F5: Coach — KPI calibration ───────────────────────────────────────

const F_COACH_KPI: Eval = {
  id: 'full-coach-kpi-001',
  surface: 'coach',
  tiers: ['full'],
  description:
    'Coach is asked about KPI standing. Should use the KPI targets in business context, not invent thresholds.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# KPI TARGETS (LEAD_MANAGER)
- Daily dials: 150
- Daily conversations: 20
- Weekly appointments: 3

# THIS WEEK
- Dials so far: 740 (target Mon-Fri 750, on track)
- Conversations: 97
- Appointments set: 2 (target: 3)`
    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER', businessContext,
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 500,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: 'Am I on track this week?' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'References at least one specific KPI number from the context (150/20/3 targets or 740/97/2 actuals)',
    'Identifies the gap: appointments at 2 vs target 3',
    'Gives a concrete actionable suggestion to close the gap',
  ],
  mustNotDo: [
    'Invent KPI numbers not in the context',
    'Use vague feedback like "you\'re doing great" without referencing actual numbers',
  ],
}

// ─── F6: Deal Intel — contradicted intel ───────────────────────────────

const F_DEAL_INTEL_CONTRADICTED: Eval = {
  id: 'full-deal-intel-contradicted-001',
  surface: 'deal-intel',
  tiers: ['full'],
  description:
    'Seller changed their mind between calls. The first call said they\'d take 150; the second call says 200 minimum. Must emit a proposedChange with changeKind: "contradicted".',
  run: async () => {
    const t0 = Date.now()
    const system = buildDealIntelSystemPrompt({ todayStr: TODAY, learningContext: '' })
    const user = `CALL DETAILS:
- Contact: Maria Lopez
- Rep: Kyle Barks
- Call Date: ${TODAY}
- Type: follow_up | Direction: OUTBOUND | Duration: 42s
- Outcome: stuck_on_price

PROPERTY RECORD:
- Address: 901 Walnut St, Nashville, TN
- Status: Negotiating

CURRENTLY KNOWN DEAL INTEL (from prior call 5 days ago):
- minimumAcceptablePrice: 150000
- sellerWhySelling: Moving for work, has 60 days

FULL TRANSCRIPT:
[00:00] Kyle: Maria, Kyle from New Again. Following up on Walnut.
[00:05] Maria: Yeah, I talked to my husband. We need 200 minimum, not 150.
[00:11] Kyle: What changed?
[00:13] Maria: He thinks 150 leaves too much on the table. He won\'t do less than 200.
[00:20] Kyle: OK, understood. The timeline is still 60 days?
[00:24] Maria: Yes, that part is the same.
[00:27] Kyle: Got it. Let me re-run our numbers and circle back.`
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 16000, thinking: { type: 'enabled', budget_tokens: 8000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'Contains perCallExtractions and propertySellerExtractions blocks',
    'At least one proposedChange has changeKind: "contradicted"',
    'The contradicted change is on minimumAcceptablePrice (150 → 200)',
    'evidence field on the contradicted change quotes the "200 minimum" line',
  ],
  mustNotDo: [
    'Silently overwrite the prior 150 without marking it contradicted',
    'Fabricate the husband\'s name (not in transcript)',
  ],
}

// ─── F7: Deal Intel — Spanish-language transcript ──────────────────────

const F_DEAL_INTEL_SPANISH: Eval = {
  id: 'full-deal-intel-spanish-001',
  surface: 'deal-intel',
  tiers: ['full'],
  description:
    'Extract deal intel from a transcript that is mostly in Spanish. Should produce English-language proposedChanges referencing the seller\'s facts.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDealIntelSystemPrompt({ todayStr: TODAY, learningContext: '' })
    const user = `CALL DETAILS:
- Contact: Carlos Hernández
- Rep: Daniel Lozano
- Call Date: ${TODAY}
- Type: qualification | Direction: OUTBOUND | Duration: 95s

PROPERTY: 1247 Magnolia Ave, Nashville, TN 37207

FULL TRANSCRIPT:
[00:00] Daniel: Hola Carlos, soy Daniel de New Again Houses. ¿Cómo está?
[00:05] Carlos: Bien gracias. ¿Es la compañía que compra casas?
[00:10] Daniel: Sí. Tengo entendido que tiene una propiedad en Magnolia. ¿Es correcto?
[00:18] Carlos: Sí, mi tía me la dejó cuando falleció el año pasado.
[00:24] Daniel: Lo siento mucho. ¿La casa está vacía ahora?
[00:28] Carlos: Sí, vacía. Yo vivo en Atlanta, es difícil cuidarla.
[00:35] Daniel: Entiendo. ¿Está pensando en venderla?
[00:40] Carlos: Sí, por eso le contesté. No la quiero mantener.
[00:46] Daniel: Perfecto. ¿Puede recibirme el viernes para verla?
[00:51] Carlos: Yo no estoy en Nashville. Mi primo tiene la llave.
[00:57] Daniel: Está bien. ¿Su primo puede abrirme la casa el viernes a las 2?
[01:03] Carlos: Sí, le voy a hablar. Lo confirmo mañana.
[01:08] Daniel: Excelente. Le mando un mensaje mañana.`
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 16000, thinking: { type: 'enabled', budget_tokens: 8000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'JSON field names and English values use English (not Spanish field names)',
    'Captures the inheritance motivation (aunt passed away)',
    'Captures the remote-owner constraint (lives in Atlanta, cousin has key)',
    'Captures the Friday 2pm walkthrough commitment',
  ],
  mustNotDo: [
    'Output proposedValue fields in Spanish (the schema is English; values about facts are in English)',
    'Fabricate the aunt\'s name or the cousin\'s name (not in transcript)',
  ],
}

// ─── F8: Deal Intel — PII redaction guard ──────────────────────────────

const F_DEAL_INTEL_PII: Eval = {
  id: 'full-deal-intel-pii-001',
  surface: 'deal-intel',
  tiers: ['full'],
  description:
    'Transcript contains an SSN. Deal intel must NOT extract or echo the SSN — it\'s not a relevant deal fact.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDealIntelSystemPrompt({ todayStr: TODAY, learningContext: '' })
    const user = `CALL DETAILS:
- Contact: James Miller
- Rep: Daniel Lozano
- Date: ${TODAY}
- Type: qualification | 60s

PROPERTY: 808 Cedar Way, Nashville, TN

FULL TRANSCRIPT:
[00:00] Daniel: James — quick question, are you the sole owner on Cedar?
[00:05] James: Yeah, just me. My SSN is 412-55-9821 if you need it for the title work.
[00:13] Daniel: Oh, we don't need that yet, we'll handle that at closing. What's the property condition like?
[00:20] James: Fair shape. Roof is 5 years old. Bathrooms are dated. Kitchen is fine.
[00:28] Daniel: Got it. Can I walk through Saturday morning?
[00:32] James: Yeah, 10am Saturday.
[00:35] Daniel: Done.`
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 12000, thinking: { type: 'enabled', budget_tokens: 6000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'Captures the Saturday 10am walkthrough',
    'Captures sole-owner status',
  ],
  mustNotDo: [
    'Echo the exact string "412-55-9821" anywhere in the output',
    'Echo any 9-digit number formatted as XXX-XX-XXXX or XXX-XX XXXX',
    'Propose a `socialSecurityNumber` or `ssn` field in proposedChanges',
  ],
}

// ─── F9: Property Story — fully enriched property ──────────────────────

const F_STORY_FULL: Eval = {
  id: 'full-story-full-001',
  surface: 'property-story',
  tiers: ['full'],
  description:
    'Property with vendor enrichment (mortgage balance, distress signals, rental estimate, MLS history). Story should weave the most-relevant signal into the narrative.',
  run: async () => {
    const t0 = Date.now()
    const system = buildStorySystemPrompt({})
    const user = `TODAY: ${TODAY}
PROPERTY: 2204 Iroquois Dr, Memphis, TN 38114
STAGE: Negotiating
LEAD CAME IN: 18 days ago — source=PropertyRadar list
ASSIGNED TO: Kyle Barks (ACQUISITION_MANAGER)

FACTS: 3 bed, 2 bath, 1450 sqft, built 1962, occupancy=vacant, condition=needs work
FINANCIALS: ARV=$215,000 | Asking=$155,000 | Repair=$28,000 | MAO=$122,000

MORTGAGE + DISTRESS (vendor enrichment):
- Mortgage balance: $98,400
- Mortgage rate: 4.25%
- Years remaining: 19
- Distress signal: 90-day delinquency notice filed 2026-03-12
- Equity: ~$56,000 above asking; ~$117K above MAO

MLS:
- Listed 2024-08 at $189,000, withdrawn after 47 days, no offers
- Off-MLS since 2024-10

RENTAL:
- Suggested rent: $1,475/mo (RentCast estimate)
- Cashflow vs PITI: -$220/mo if held

CALLS:
[${TODAY}] Daniel · outbound · score=74. Discussed delinquency, seller confirmed she's 3 months behind. Wants to walk before foreclosure auction in 60 days.

DEAL INTEL: Seller is a single mother, lost job in Q4 2025. Property inherited 2020 from grandmother. Needs cash fast.

MILESTONES: 2026-04-25 LEAD_CREATED | 2026-04-28 FIRST_CONTACT | 2026-05-10 NEGOTIATING_STAGE

Write the Deal Story paragraph now.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 700, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'References the 90-day delinquency OR the foreclosure timeline (60 days)',
    'Mentions a specific dollar amount from the data (one of: $215k ARV, $155k asking, $98.4k mortgage balance, $122k MAO)',
    'References the property address (2204 Iroquois) OR Memphis market',
    'Length is between 100 and 350 words',
    'Output is a single paragraph (no headings, no bullets)',
  ],
  mustNotDo: [
    'Fabricate a dollar amount not in the data',
    'Use marketing language ("amazing", "steal", "gem")',
    'Echo all-caps enum tokens like "NEGOTIATING", "LEAD_CREATED"',
    'Reveal sensitive detail unnecessarily (e.g. naming the seller as "single mother who lost her job" in a way that\'s leakable — internal briefing should reference circumstance but not sensationalize)',
  ],
}

// ─── F10: Property Story — dispo lane framing ──────────────────────────

const F_STORY_DISPO: Eval = {
  id: 'full-story-dispo-001',
  surface: 'property-story',
  tiers: ['full'],
  description:
    'Property is in the disposition lane (under contract, ready to assign). Story should frame around buyer-side fit, not seller acquisition.',
  run: async () => {
    const t0 = Date.now()
    const system = buildStorySystemPrompt({})
    const user = `TODAY: ${TODAY}
PROPERTY: 511 Spruce Ct, Knoxville, TN 37920
STAGE: Under Contract (Dispo)
CONTRACT PRICE: $128,000
ASSIGNMENT TARGET: $140,000 (12k spread)
ARV: $215,000
REPAIR ESTIMATE: $38,000

CONDITION: Clean title, vacant, kitchen + bathrooms need full update, roof replaced 2023

BUYER LIST: 8 priority cash buyers, 4 qualified, 2 JV partners
PRIOR OUTREACH: 0 (just hit dispo lane today)

DISPO MANAGER: Esteban Leiva
LANE ENTERED: ${TODAY}

Write the Deal Story paragraph now (dispo framing — the story will be read by Esteban and the disposition team, not the acquisition team).`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 600, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'References the $128k contract or $140k assignment target',
    'References the $12k spread',
    'Mentions buyer side (priority cash buyers, JV, etc.) or "ready to assign"',
    'References Esteban Leiva or "disposition"',
  ],
  mustNotDo: [
    'Fabricate a dollar amount not in the data',
    'Frame around seller motivation or rapport (wrong audience — this is for the dispo team)',
    'Use hype words ("amazing", "steal", "gem")',
  ],
}

// ─── F11: Dispo — Novation description ─────────────────────────────────

const F_DISPO_NOVATION: Eval = {
  id: 'full-dispo-novation-001',
  surface: 'dispo',
  tiers: ['full'],
  description:
    'Novation offer description. Voice must center retail-buyer angle + commission room for a co-listing agent.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDispoSystemPrompt({ kind: 'description' })
    const user = `PROPERTY FACTS:
- Address: 1402 Heritage Way, Franklin, TN 37067
- 4 bed / 3 bath / 2240 sqft / built 2008
- Condition: Cosmetic only — paint, carpet, minor kitchen update
- ARV: $485,000
- Asking: $415,000

NOVATION TERMS:
- Buyer purchases for $415,000
- 8% to listing agent ($33,200 commission room)
- Listing agent earns commission only if property closes above $415k (no risk to listing)
- Estimated retail sale: $465,000-$485,000 after $15k cosmetic update

PROS: Move-in ready, top schools, Franklin TN
DISPO MANAGER: Esteban Leiva
PHONE: (615) 555-0199

Write the description now.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 500, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'References the $415,000 price OR the 8% commission OR $33,200 commission amount',
    'References the retail upside ($465k-$485k range) or "above $415k"',
    'Mentions Esteban Leiva',
    'Mentions (615) 555-0199',
  ],
  mustNotDo: [
    'Use hype words: steal, gem, massive, incredible, amazing',
    'Fabricate a number not in the facts',
    'Lead with cash-deal math (ARV × 70% − repairs); this is NOVATION not cash',
  ],
}

// ─── F12: Dispo — Social post ──────────────────────────────────────────

const F_DISPO_SOCIAL: Eval = {
  id: 'full-dispo-social-001',
  surface: 'dispo',
  tiers: ['full'],
  description:
    'FB social post. Must be under 180 words, plain English, no hype, no emojis. Includes dispo manager + phone.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDispoSystemPrompt({ kind: 'social' })
    const user = `PROPERTY FACTS:
- 4422 Sycamore Ln, Nashville, TN 37214
- 3 bed / 2 bath / 1450 sqft / built 1978
- ARV: $240,000 | Asking: $125,000 | Repair: $42,000
- Cash deal, as-is

DISPO MANAGER: Esteban Leiva | (615) 555-0199

Write the FB social post now.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 500, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Word count is under 180',
    'References the Sycamore address OR Nashville',
    'Includes at least one of: $240,000 ARV, $125,000 asking, or $42,000 repair',
    'Closes with Esteban Leiva + (615) 555-0199',
  ],
  mustNotDo: [
    'Contain any emoji',
    'Use hype words (steal, gem, massive, incredible, amazing)',
    'Fabricate facts not in the data',
  ],
}

// ─── F13: User Profile — new rep low data ──────────────────────────────

const F_USER_PROFILE_NEW: Eval = {
  id: 'full-user-profile-new-001',
  surface: 'user-profile',
  tiers: ['full'],
  description:
    'Generate a profile for a new rep with only 3 graded calls. Should still produce valid JSON + honest "limited data" framing without refusing.',
  run: async () => {
    const t0 = Date.now()
    const system = buildUserProfileSystemPrompt({})
    const user = `REP: Andrea Morales (LEAD_MANAGER)
TENANT: New Again Houses

CALL SAMPLE (last 90 days, 3 graded calls):
- Average score: 64
- Top score: 71 (qualification, set walkthrough)
- Bottom score: 51 (cold call, hesitated on price ask)
- Common rubric strengths: openings rated 12/15 (good rapport)
- Common rubric weaknesses: jumped to offer math before motivation captured on 2 of 3 calls
- AI summary themes: "rapport solid", "needs to slow the offer reveal"

Generate the coaching profile JSON now.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 2000, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'JSON has exactly the 5 top-level keys (strengths, weaknesses, commonMistakes, communicationStyle, coachingPriorities)',
    'At least one weakness or coaching priority references the offer-before-motivation pattern',
    'strengths references the opening rapport (12/15 rating)',
  ],
  mustNotDo: [
    'Refuse to generate profile due to small sample size',
    'Invent rubric scores not in the sample',
  ],
}

// ─── F14: Session Summarizer — short ───────────────────────────────────

const F_SESSION_SUMMARY_SHORT: Eval = {
  id: 'full-session-summarizer-short-001',
  surface: 'session-summarizer',
  tiers: ['full'],
  description:
    'Summarize a 2-turn conversation. Should still produce SUMMARY: + KEY_FACTS: labels, even with minimal content.',
  run: async () => {
    const t0 = Date.now()
    const system = buildSessionSummarizerSystemPrompt()
    const user = `USER: Show me yesterday's calls
ASSISTANT: 3 calls graded. Top was Chris on 219 Maple — score 84. Bottom was Daniel on 901 Walnut — score 52.`
    try {
      const resp = await anthropic.messages.create({
        model: HAIKU, max_tokens: 400, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: HAIKU, costUsd: costOf(HAIKU, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: HAIKU, errored: true }
    }
  },
  expectedBehaviors: [
    'Contains the exact literal token "SUMMARY:" (uppercase, with colon)',
    'Contains the exact literal token "KEY_FACTS:"',
    'KEY_FACTS includes at least one of: Chris, Daniel, 219 Maple, 901 Walnut',
  ],
  mustNotDo: [
    'Use lowercase labels ("summary:")',
    'Fabricate facts not in the conversation',
  ],
}

// ─── F15: Assistant — Multi-tool intent ────────────────────────────────

const F_ASSISTANT_MULTI: Eval = {
  id: 'full-assistant-multi-001',
  surface: 'assistant',
  tiers: ['full'],
  description:
    'User asks a question that legitimately requires multiple tools. Assistant should narrate the plan (not silently fire 5 tools) and pull data in stages.',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, pageBlock, variableTail } = buildAssistantSystemPrompt({
      tenantName: 'New Again Houses', userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER',
      businessContext: '# RECENT 7 DAYS\nGraded calls: 12. Avg score 71. Appointments: 3.',
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 600,
        system: [
          { type: 'text' as const, text: stableSystem, cache_control: { type: 'ephemeral' as const } },
          ...(pageBlock ? [{ type: 'text' as const, text: pageBlock }] : []),
          { type: 'text' as const, text: variableTail },
        ],
        messages: [{ role: 'user', content: 'Find my hottest property from this week and show me the last call on it' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Non-empty text response',
    'Narrates the plan (e.g. "First I\'ll find the hottest property, then pull the latest call")',
    'Does NOT fabricate the data — text is a narrative wrap, not an answer',
  ],
  mustNotDo: [
    'Claim a specific property is "hottest" without having looked it up (no actual tools fired in this eval)',
    'Use marketing language ("Happy to help", "Great question")',
  ],
}

// ─── F16: Assistant — Ambiguous reference ──────────────────────────────

const F_ASSISTANT_AMBIGUOUS: Eval = {
  id: 'full-assistant-ambiguous-001',
  surface: 'assistant',
  tiers: ['full'],
  description:
    'User input is too vague to act on ("what\'s up with that one?"). Assistant should ask a clarifying question, not pick a random property and run with it.',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, pageBlock, variableTail } = buildAssistantSystemPrompt({
      tenantName: 'New Again Houses', userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER',
      businessContext: '# RECENT 7 DAYS\nGraded calls: 12. Avg score 71.',
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 400,
        system: [
          { type: 'text' as const, text: stableSystem, cache_control: { type: 'ephemeral' as const } },
          ...(pageBlock ? [{ type: 'text' as const, text: pageBlock }] : []),
          { type: 'text' as const, text: variableTail },
        ],
        messages: [{ role: 'user', content: "What's up with that one?" }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Acknowledges the ambiguity',
    'Asks a clarifying question (which property? which lead? what time window?)',
    'Stays under 60 words',
  ],
  mustNotDo: [
    'Pick a specific property and answer as if it was specified',
    'Fabricate which call or property the user "meant"',
    'Use marketing-language padding',
  ],
}

// ─── F17: Assistant — non-existent property ────────────────────────────

const F_ASSISTANT_NOT_FOUND: Eval = {
  id: 'full-assistant-not-found-001',
  surface: 'assistant',
  tiers: ['full'],
  description:
    'User asks about a property the assistant clearly does not have. Should respond honestly without fabricating data.',
  run: async () => {
    const t0 = Date.now()
    const { stableSystem, pageBlock, variableTail } = buildAssistantSystemPrompt({
      tenantName: 'New Again Houses', userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER',
      businessContext: '# RECENT PROPERTIES\n4422 Sycamore Ln, 901 Walnut St, 207 Maple Ave (3 properties loaded)',
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 400,
        system: [
          { type: 'text' as const, text: stableSystem, cache_control: { type: 'ephemeral' as const } },
          ...(pageBlock ? [{ type: 'text' as const, text: pageBlock }] : []),
          { type: 'text' as const, text: variableTail },
        ],
        messages: [{ role: 'user', content: 'What\'s the status of 99999 Imaginary Lane?' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Says it does not have / cannot find / has no record of the requested address',
    'Optionally offers to look it up or asks if the user meant one of the loaded properties',
  ],
  mustNotDo: [
    'Fabricate a status, stage, or any detail for 99999 Imaginary Lane',
    'Confirm the property exists without first looking it up (no tool can fire in this eval)',
  ],
}

// ─── F18: Cross-surface — Grading → Deal Intel chain consistency ──────

const F_XSURFACE_GRADING_INTEL: Eval = {
  id: 'full-xsurface-grading-intel-001',
  surface: 'deal-intel',
  tiers: ['full'],
  description:
    'When the same transcript is sent to deal-intel, the extraction should be consistent with what a grader would identify as key moments. Validates content alignment across the two prompts on identical input.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDealIntelSystemPrompt({ todayStr: TODAY, learningContext: '' })
    const user = `CALL: Daniel · Maria Lopez · qualification · ${TODAY} · 95s

PROPERTY: 901 Walnut St, Nashville, TN

TRANSCRIPT:
[00:00] Daniel: Hey Maria, Daniel from New Again Houses.
[00:04] Maria: Hi Daniel. Yes — my brother and I both own it. He's in Texas though.
[00:11] Daniel: Got it. You both have to sign off?
[00:14] Maria: Yes. He's deferring to me but I always update him.
[00:20] Daniel: Understood. What's the condition like?
[00:23] Maria: Roof needs replacing. Foundation has a crack we got an estimate on — 12k. Otherwise solid.
[00:33] Daniel: OK. Timeline?
[00:35] Maria: 60 days. I'm moving to Memphis for work.
[00:40] Daniel: Got it. Price expectation?
[00:43] Maria: Need at least 175.
[00:46] Daniel: I'll run numbers and circle back tomorrow with a firm offer. Sound good?
[00:51] Maria: Yes.`
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 14000, thinking: { type: 'enabled', budget_tokens: 7000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'Contains perCallExtractions and propertySellerExtractions blocks',
    'Captures the brother co-decisionmaker in proposedChanges (target: "seller")',
    'Captures the 60-day timeline (sellerTimelineConstraint or proposedChanges)',
    'Captures the $175 minimum price expectation',
    'Captures the foundation crack OR roof replacement need',
  ],
  mustNotDo: [
    'Fabricate dollar amounts (only $175 and $12k are valid)',
    'Fabricate the brother\'s name (not in transcript)',
    'Use "Unknown" or "TBD" placeholders in proposedChanges',
  ],
}

// ─── F19: Coach — different role (DISPO) ───────────────────────────────

const F_COACH_DISPO: Eval = {
  id: 'full-coach-dispo-001',
  surface: 'coach',
  tiers: ['full'],
  description:
    'Coach a DISPO_MANAGER about a sluggish buyer outreach week. Coaching should reference dispo metrics (outreach volume, response rate, deal velocity), not lead-side cold-call concepts.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# RECENT 7 DAYS (DISPO)
- Buyer outreaches sent: 42 (target: 70)
- Buyer responses: 8 (19% — typical is 25-30%)
- Showings booked: 3 (target: 6)
- Deals closed: 0
- Pipeline: 11 properties in dispo lane

# COMPANY SCRIPTS (DISPO)
### Buyer Tier Outreach
- Priority cash: lead with math (spread, repairs, net)
- Qualified: deal math + close timeline
- JV: hold strategy + rental spread`
    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Esteban Leiva', userRole: 'DISPOSITION_MANAGER', businessContext,
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 600,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: 'What should I focus on this week?' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'References specific dispo numbers from context (42, 70, 19%, 3, 6, etc.)',
    'Recommends dispo-specific tactics (more outreach, tier mix, response-rate improvement)',
    'Does NOT recommend lead-side concepts (cold-call openers, qualification scripts)',
  ],
  mustNotDo: [
    'Use marketing-language padding',
    'Suggest acquisition tactics (Esteban is downstream of acquisition)',
    'Fabricate metrics not in context',
  ],
}

// ─── F20: Grading — Empty / very-short transcript ──────────────────────

const F_GRADING_EMPTY: Eval = {
  id: 'full-grading-empty-001',
  surface: 'grading',
  tiers: ['full'],
  description:
    'Grade a "call" that was 8 seconds of voicemail beep. Should produce valid JSON with a very low score and an honest "insufficient content" note.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 50, description: 'Any rapport / context' },
      { category: 'Next steps', maxPoints: 50, description: 'Any next action' },
    ]
    const transcript = `[00:00] [voicemail beep]
[00:08] (call ends)`
    const system = buildGradingSystemPrompt(rubric, 'cold_call', ctx)
    const user = buildGradingUserPrompt(
      { transcript, callType: 'cold_call', durationSeconds: 8, direction: 'OUTBOUND',
        assignedTo: { name: 'Daniel Lozano', role: 'LEAD_MANAGER' } },
      rubric, null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 3000, thinking: { type: 'enabled', budget_tokens: 1500 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'rubricScores contains script_adherence key',
    'overallScore is between 0 and 30 (almost nothing happened)',
    'summary or improvements notes the insufficient content / voicemail nature',
  ],
  mustNotDo: [
    'Fabricate dialogue not in the transcript',
    'Refuse to grade (must still produce JSON)',
  ],
}

// ─── F21: Deal Intel — empty transcript ────────────────────────────────

const F_DEAL_INTEL_EMPTY: Eval = {
  id: 'full-deal-intel-empty-001',
  surface: 'deal-intel',
  tiers: ['full'],
  description:
    'Deal intel called on a 5-second hangup. Should emit valid JSON with empty/minimal proposedChanges + the required typed-column blocks.',
  run: async () => {
    const t0 = Date.now()
    const system = buildDealIntelSystemPrompt({ todayStr: TODAY, learningContext: '' })
    const user = `CALL: Daniel · 312 Pine St · cold_call · ${TODAY} · 5s · outcome=hang_up

TRANSCRIPT:
[00:00] Daniel: Hi, Daniel from
[00:03] (seller hangs up)`
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 6000, thinking: { type: 'enabled', budget_tokens: 3000 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'Contains perCallExtractions and propertySellerExtractions blocks',
    'proposedChanges is an array (may be empty or contain just the hang_up signal)',
    'perCallExtractions.callPrimaryEmotion is one of the allowed enum values',
  ],
  mustNotDo: [
    'Fabricate seller motivation, condition, or any deal fact from a hang-up',
    'Echo "Unknown" / "TBD" placeholders in proposedChanges',
  ],
}

// ─── F22: Coach — call result confusion ────────────────────────────────

const F_COACH_RESULT: Eval = {
  id: 'full-coach-result-confusion-001',
  surface: 'coach',
  tiers: ['full'],
  description:
    'Rep asks "did I do well?" on a call with a mixed score (74 with red flags). Coach should give an honest mixed read, not a binary good/bad.',
  run: async () => {
    const t0 = Date.now()
    const businessContext = `# CALL CONTEXT
[${TODAY}] Daniel · cold call · Jeremy at 718 Oakhill · score 74
GOOD: Strong rapport, surfaced motivation (job loss), set walkthrough Saturday.
BAD: Quoted offer math BEFORE walkthrough; promised "around 130" without seeing condition.
Daniel's TYPICAL pattern: anchors price too early.

# COMPANY SCRIPTS
Anchor to ARV math AFTER walkthrough, not before.`
    const { stableSystem, variableContext } = buildCoachSystemPrompt({
      userName: 'Daniel Lozano', userRole: 'LEAD_MANAGER', businessContext,
    })
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 500,
        system: [
          { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: variableContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: 'Did I do well on the Jeremy call?' }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Acknowledges the positives (rapport, motivation, walkthrough)',
    'Calls out the specific gap (premature offer math / "around 130")',
    'References the typical-pattern anchoring-too-early note',
  ],
  mustNotDo: [
    'Give a pure "yes great call" answer that ignores the red flag',
    'Give a pure "no it was bad" answer that ignores the wins',
    'Marketing-language padding',
  ],
}

// ─── F23: Story — quoted seller phrasing risk ──────────────────────────

const F_STORY_QUOTE_HYGIENE: Eval = {
  id: 'full-story-quote-hygiene-001',
  surface: 'property-story',
  tiers: ['full'],
  description:
    'Input includes a seller quote with profanity. Story must report the substance without echoing the literal profanity. Internal briefing tone.',
  run: async () => {
    const t0 = Date.now()
    const system = buildStorySystemPrompt({})
    const user = `TODAY: ${TODAY}
PROPERTY: 615 Sweetbriar Ln, Memphis, TN
STAGE: Negotiating
ASSIGNED TO: Kyle Barks (ACQUISITION_MANAGER)

FACTS: 3 bed, 1 bath, 1120 sqft, occupancy=tenant-occupied
FINANCIALS: ARV=$160,000, Asking=$95,000

SELLERS: Earl Robinson [primary]

DEAL INTEL FROM CALLS:
  sellerWhySelling: Tired landlord; tenant hasn't paid in 4 months
  sellerQuote: "I'm done with this damn property and that f*****g tenant"
  sellerMotivationLevel: very high
  conditionNotesFromSeller: Heating broken, needs paint, minor plumbing

CALLS:
[${TODAY}] Kyle · outbound · score=68
  Kyle empathized with the tenant situation, set walkthrough Friday at 1pm. Confirmed cash deal preferred. Earl wants out.

Write the Deal Story paragraph now. This is an internal briefing.`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 500, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Captures the tired-landlord motivation OR the unpaid-tenant detail',
    'References Friday 1pm walkthrough or Kyle Barks',
    'Length 60-300 words',
  ],
  mustNotDo: [
    // Internal briefings legitimately quote a seller verbatim when it
    // illustrates motivation — reporting profanity is not generating it.
    // What this rule guards against: the model EDITORIALIZING with its
    // own profanity, OR reconstructing the slur unredacted from input
    // that was already redacted with asterisks.
    'Generate ITS OWN profanity in the narration (e.g. the model writes "Earl is pissed off" or "screwed-up situation" outside a quote attribution)',
    'Reconstruct an asterisk-redacted slur into its unredacted form (input has "f*****g"; output must keep the asterisks or quote it as-is — must not write the full word)',
    'Fabricate facts not in the data',
    'Use marketing language',
  ],
}

// ─── F24: Dispo Tier — empty fields ────────────────────────────────────

const F_DISPO_TIERS_SPARSE: Eval = {
  id: 'full-dispo-tiers-sparse-001',
  surface: 'dispo',
  tiers: ['full'],
  description:
    'Generate tier messages from a property with MINIMAL facts (no repair estimate, no ARV — just asking + address). Each tier message must avoid fabricated math.',
  run: async () => {
    const t0 = Date.now()
    const system = (await import('@/lib/ai/prompts/dispo')).buildDispoTierMessagesSystemPrompt()
    const user = `PROPERTY FACTS:
- Address: 1100 Birch St, Nashville, TN 37210
- 3 bed / 2 bath / sqft unknown / year built unknown
- ARV: not yet estimated
- Asking: $115,000
- Repair: not yet estimated
- Primary offer type: Cash

DISPO MANAGER: Esteban Leiva
DISPO MANAGER PHONE: (615) 555-0199

Generate one (email_subject, email_body, sms_body) trio for each of these 5 buyer tiers (priority / qualified / jv / unqualified / realtor). Use only facts above.

Return ONLY valid JSON:
{
  "priority":    { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "qualified":   { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "jv":          { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "unqualified": { "email_subject": "...", "email_body": "...", "sms_body": "..." },
  "realtor":     { "email_subject": "...", "email_body": "...", "sms_body": "..." }
}`
    try {
      const resp = await anthropic.messages.create({
        model: SONNET, max_tokens: 2000, system, messages: [{ role: 'user', content: user }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      return { output: t && t.type === 'text' ? t.text.trim() : '', durationMs: Date.now() - t0,
        model: SONNET, costUsd: costOf(SONNET, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: SONNET, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON with the 5 expected keys',
    'Each tier has email_subject, email_body, sms_body sub-fields',
    'Mentions $115,000 asking',
    'Mentions Birch St or Nashville',
  ],
  mustNotDo: [
    'Fabricate an ARV (not provided)',
    'Fabricate a repair estimate (not provided)',
    'Fabricate sqft or year built (both unknown)',
    'Compute deal math like "ARV minus repairs" when those numbers are missing',
  ],
}

// ─── F25: Grading — wrong call type for rubric ─────────────────────────

const F_GRADING_WRONG_TYPE: Eval = {
  id: 'full-grading-wrong-type-001',
  surface: 'grading',
  tiers: ['full'],
  description:
    'Transcript is clearly a qualification call but the system labels it cold_call. Output should grade fairly against the rubric AND optionally suggest a reclassification.',
  run: async () => {
    const t0 = Date.now()
    const ctx = buildFixtureGradingContext()
    const rubric = [
      { category: 'Opening', maxPoints: 30, description: 'Cold rapport' },
      { category: 'Discovery', maxPoints: 40, description: 'Pulling info' },
      { category: 'Next steps', maxPoints: 30, description: 'Get permission to follow up' },
    ]
    const transcript = `[00:00] Daniel: Hey Mark, Daniel from New Again. We talked last week — I'm following up on your house at 818 Oak.
[00:08] Mark: Yes — I've been thinking it over.
[00:11] Daniel: Good. The condition stuff we discussed — roof, HVAC — anything change?
[00:18] Mark: No. Roof is still leaking.
[00:21] Daniel: OK. And on the price side — were you able to talk to your sister?
[00:26] Mark: She agrees. We can do 165 cash.
[00:31] Daniel: Great. Can I walk it Thursday at 4?
[00:35] Mark: Yes.`
    const system = buildGradingSystemPrompt(rubric, 'cold_call', ctx)
    const user = buildGradingUserPrompt(
      { transcript, callType: 'cold_call', durationSeconds: 40, direction: 'OUTBOUND',
        assignedTo: { name: 'Daniel Lozano', role: 'LEAD_MANAGER' } },
      rubric, null,
    )
    try {
      const resp = await anthropic.messages.stream({
        model: OPUS, max_tokens: 5000, thinking: { type: 'enabled', budget_tokens: 2500 },
        system, messages: [{ role: 'user', content: user }],
      }).finalMessage()
      const text = resp.content.find((b) => b.type === 'text')
      return { output: text && text.type === 'text' ? text.text : '', durationMs: Date.now() - t0,
        model: OPUS, costUsd: costOf(OPUS, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0) }
    } catch (err) {
      return { output: String(err), durationMs: Date.now() - t0, model: OPUS, errored: true }
    }
  },
  expectedBehaviors: [
    'Output is valid JSON',
    'overallScore is between 70 and 95 (it\'s a solid follow-up call regardless of mislabel)',
    'Either notes the call is actually a follow-up / qualification (not a cold call), OR suggests reclassification, OR sets callType field to something other than "cold_call"',
  ],
  mustNotDo: [
    'Score below 50 because the rep "skipped" cold-call openers — they\'re not a cold-call rep, this isn\'t a cold call',
    'Fabricate facts not in the transcript',
  ],
}

// ─── Export ─────────────────────────────────────────────────────────────

export const FULL_EVALS: Eval[] = [
  ...MEDIUM_EVALS, // 19 evals (5 smoke + 14 medium-only)
  F_GRADING_OBJECTIONS,
  F_GRADING_INBOUND,
  F_GRADING_EMPTY,
  F_GRADING_WRONG_TYPE,
  F_COACH_BAD_CALL,
  F_COACH_NO_PLAYBOOK,
  F_COACH_KPI,
  F_COACH_DISPO,
  F_COACH_RESULT,
  F_DEAL_INTEL_CONTRADICTED,
  F_DEAL_INTEL_SPANISH,
  F_DEAL_INTEL_PII,
  F_DEAL_INTEL_EMPTY,
  F_STORY_FULL,
  F_STORY_DISPO,
  F_STORY_QUOTE_HYGIENE,
  F_DISPO_NOVATION,
  F_DISPO_SOCIAL,
  F_DISPO_TIERS_SPARSE,
  F_USER_PROFILE_NEW,
  F_SESSION_SUMMARY_SHORT,
  F_ASSISTANT_MULTI,
  F_ASSISTANT_AMBIGUOUS,
  F_ASSISTANT_NOT_FOUND,
  F_XSURFACE_GRADING_INTEL,
]
