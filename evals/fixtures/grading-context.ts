// evals/fixtures/grading-context.ts
//
// Phase 7 — Eval fixtures: synthetic GradingContext that the eval suite
// can pass to lib/ai/prompts/grading.ts without touching the DB.
//
// The fixture covers the most common path (qualification call by a
// Lead Manager on a moderately-motivated seller). Enough detail to
// exercise every section of the grading prompt — scripts, objections,
// rep profile, prior calls, calibration examples — without requiring
// real DB rows.

import type { GradingContext } from '@/lib/ai/context-builder'

export function buildFixtureGradingContext(): GradingContext {
  return {
    companyOverview:
      'New Again Houses buys properties cash, as-is, at discounted prices below market value. We solve seller problems where retail listing won\'t work — distressed condition, urgent timeline, complex title, tenant issues.',
    gradingMethodology:
      'Grade against the C3 Framework (Caring, Certainty, Clarity) and the 7 Core Beliefs. Be transcript-specific — every piece of feedback must reference a moment from this call.',
    companyStandards:
      'Reps must confirm decision-maker on every qualification call. Reps must not promise a specific offer dollar amount on a cold call. Talk ratio target: seller ≥ 50%.',
    scripts: [
      '### Qualification Call Script\n\n1. Confirm decision-maker: "Are you the sole owner of the property at [address]?"\n2. Property condition: "What does the property need? Roof, HVAC, plumbing, electrical?"\n3. Motivation: "What\'s prompting the move? Walk me through your situation."\n4. Timeline: "How quickly do you need this sold? Are we talking 30 days, 60, longer?"\n5. Price expectation: "What number do you have in mind? What\'s the lowest you\'d take?"\n6. Set the next step.',
    ],
    objectionHandling: [
      '### Objection: "Your offer is too low"\n\nResponse:\n"That\'s totally fair — I get it. Can I show you the math? We use a formula: ARV × 70% − repairs − our fee. For your house, that comes out to [X]. Where\'s the gap for you?"\n\nWhat works: walking through the math openly, anchoring to ARV.\nWhat doesn\'t: matching the seller\'s number to "close the deal".',
    ],
    trainingMaterials: [],
    industryKnowledge: [
      '### Wholesaling Fundamentals\n\nWholesalers assign contracts. We don\'t buy retail. Our value: speed + certainty + as-is. Sellers come to us when retail won\'t work for them.',
    ],
    userProfile: {
      strengths: [
        'Builds rapport quickly on cold opens',
        'Patient on price discussions',
        'Asks calibrated questions',
      ],
      weaknesses: [
        'Often skips decision-maker confirmation on follow-up calls',
        'Can talk over the seller when momentum builds',
      ],
      commonMistakes: [
        'Quoting offer ranges before motivation is fully surfaced',
        'Setting appointments without confirming who\'ll be there',
      ],
      communicationStyle: 'Direct/Driver — efficient, fact-forward',
      coachingPriorities: [
        'Slow the offer reveal — restate motivation first',
        'Confirm decision-maker on every call, not just qualification calls',
      ],
      totalCallsGraded: 47,
    },
    priorCalls: [
      {
        calledAt: '2026-04-22T14:30:00.000Z',
        score: 71,
        aiSummary:
          'Cold call with Robert Mendez. Confirmed he\'s the sole owner of 4422 Sycamore. Mentioned inheritance from mother (Q4 2025). Said he\'d "think about it" — no firm appointment, said to follow up in a week.',
        callOutcome: 'follow_up_scheduled',
        callType: 'cold_call',
        assignedToName: 'Daniel Lozano',
      },
    ],
    dealIntelSummary:
      'Property: 4422 Sycamore Ln, Nashville, TN. Inherited from mother (Q4 2025). Robert is sole owner. No mortgage. Vacant since inheritance. Two competing wholesalers contacted him already — he says "they were vague on numbers." Timeline: flexible but wants it gone before summer.',
    calibrationExamples: [
      {
        type: 'good',
        score: 92,
        summary:
          'Daniel restated motivation before delivering offer, walked through ARV math openly, confirmed both heirs on the call, set walkthrough for Thursday 2pm.',
        notes: 'Textbook qualification call — use as a teaching example.',
      },
      {
        type: 'bad',
        score: 38,
        summary:
          'Rep delivered offer ($85k) in the first 90 seconds before asking a single qualifying question. Seller hung up.',
        notes: 'Don\'t lead with price.',
      },
    ],
    feedbackCorrections: null,
    reclassificationCorrections: null,
  }
}

/**
 * Synthetic qualification-call transcript — exercises every section of
 * the grading prompt. Designed so a competent grader would land in the
 * 70-85 range with specific feedback about skipping the
 * decision-maker confirmation (Daniel\'s known weakness).
 */
export const FIXTURE_TRANSCRIPT_QUALIFICATION = `[00:00] Daniel: Hey Robert, this is Daniel from New Again Houses. We spoke last week about your place on Sycamore — wanted to follow up with you on the conversation.

[00:09] Robert: Yeah, yeah, I remember. You guys are the ones that buy houses cash.

[00:13] Daniel: That\'s right. So I just wanted to check in — how are you feeling about everything? Last time you mentioned you were going to think it over.

[00:23] Robert: Yeah, I\'ve been thinking. Honestly, my brother\'s been pushing me to just list it with a realtor. He\'s saying we\'d get more that way.

[00:34] Daniel: I hear you, that\'s a totally fair conversation to have. Can I ask — what\'s the condition look like inside? You mentioned it\'s been vacant since you inherited it.

[00:45] Robert: Yeah, it\'s rough. Roof was leaking last winter, so there\'s some water damage in the back bedroom. Kitchen\'s original from like 1978. Bathrooms need work.

[01:02] Daniel: Got it. And the roof — has anyone been out to look at it?

[01:08] Robert: No, I haven\'t had anyone out. I just know it was leaking because there\'s a stain on the ceiling.

[01:15] Daniel: OK. And the HVAC, plumbing — any issues you know about?

[01:21] Robert: HVAC\'s old. Hasn\'t been used in a while. Plumbing seems OK I guess.

[01:28] Daniel: Alright. So here\'s the thing, Robert. With the condition the way it is — water damage, old kitchen, old HVAC — listing retail means you\'re going to spend probably 40, 50 thousand getting it to where a regular buyer will even tour it. And then you\'re paying agent commissions, holding costs while it sits. That\'s the trade.

[01:51] Robert: Yeah, that\'s what I\'m worried about. I don\'t have that kind of cash to put into it.

[01:58] Daniel: Right. So with us, we buy it as-is. You don\'t do a thing. We close in 14 to 21 days, all cash. The number\'s going to be lower than retail — but you keep what we pay you, no commissions, no repair costs, no holding.

[02:14] Robert: What kind of number are we talking?

[02:17] Daniel: Last time we ran the ARV around 240. So with the formula we use — that\'s 70 percent of ARV, minus repairs, minus our fee — we\'re probably looking at somewhere in the 110 to 125 range. I\'d need to walk through to give you a firm number.

[02:38] Robert: Hmm. That\'s lower than my brother was thinking.

[02:43] Daniel: I get it. Where was he?

[02:46] Robert: He said we could probably get 180, 190 listing it.

[02:51] Daniel: Maybe — if you spent the 50 grand fixing it up first. After commissions you\'re probably netting 165, 170. Versus our 110-125 with zero money out of pocket and 21 days. The math is closer than it sounds.

[03:09] Robert: I see what you\'re saying. Look — I need to talk to my brother. Can you come out and look at the house? That\'d at least give us a real number.

[03:20] Daniel: Absolutely. I\'m looking at Thursday afternoon. Does 2pm work for you?

[03:25] Robert: Thursday\'s good. 2pm at the house.

[03:29] Daniel: Done. I\'ll text you to confirm Wednesday night. Talk soon, Robert.

[03:34] Robert: Sounds good.

[03:35] Daniel: Bye.`

/**
 * Compact transcript variant for the deal-intel eval. The full transcript
 * above exercises grading well, but deal-intel's JSON output blows past
 * the 16K max_tokens budget on dense input (production rate is 3.2% over
 * a 30d window, confirmed Session 88). This shorter slice preserves the
 * extractable facts the eval asserts on (brother co-decisionmaker,
 * inheritance, water damage / old HVAC / 1978 kitchen, ARV $240k, range
 * 110-125, retail comp 180-190, Thursday 2pm walkthrough) so the eval
 * still validates schema + content without truncating mid-array.
 */
export const FIXTURE_TRANSCRIPT_QUALIFICATION_COMPACT = `[00:00] Daniel: Hey Robert — Daniel from New Again Houses.

[00:04] Robert: Hey.

[00:05] Daniel: My brother thing — is he on the deed?

[00:08] Robert: No, just me. He's just giving opinions about listing it.

[00:13] Daniel: Got it. Want me to walk the property Thursday at 2pm?

[00:17] Robert: Thursday 2pm works.`
