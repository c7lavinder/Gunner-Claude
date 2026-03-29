// lib/call-types.ts
// Locked call type definitions — used by AI grading and UI dropdowns
// UPGRADED: RubricCriterion now includes keyPhrases and redFlags per rubric
// UPGRADED: criticalFailures + criticalFailureCap for follow_up and dispo

export interface CallResult {
  id: string
  name: string
}

export interface RubricCriterion {
  category: string
  maxPoints: number
  description: string
  keyPhrases?: string[]
}

export interface CallTypeDefinition {
  id: string
  name: string
  description: string
  results: CallResult[]
  rubric: RubricCriterion[]
  redFlags: string[]
  criticalFailures?: string[]
  criticalFailureCap?: number
  aiContext: string
}

export const CALL_TYPES: CallTypeDefinition[] = [
  {
    id: 'cold_call',
    name: 'Cold Call',
    description: 'Outbound call to an uncontacted seller to gauge interest in selling.',
    results: [
      { id: 'not_interested', name: 'Not Interested' },
      { id: 'interested', name: 'Interested' },
    ],
    rubric: [
      {
        category: 'Opening Hook & Tone',
        maxPoints: 20,
        description: 'Professional, non-pushy opener that gets to the point fast. Introduced themselves clearly, gave a reason for calling that creates curiosity without sounding like a script. Calm and confident — not robotic or salesy.',
        keyPhrases: ['is this a good time', 'reaching out about your property', 'interested in selling', 'quick question'],
      },
      {
        category: 'Rapport Building',
        maxPoints: 20,
        description: 'Built quick genuine connection with a stranger. Found something real to bond over — not empty small talk. Used their name naturally. Matched the seller\'s energy and pace.',
        keyPhrases: ['how long have you', 'tell me about', 'that makes sense', 'I understand', 'sounds like'],
      },
      {
        category: 'Qualifying Interest',
        maxPoints: 25,
        description: 'Discovered if there is any interest in selling without interrogating. Asked about situation, timeline, and property condition conversationally. Did not rush to price. Gauged motivation level.',
        keyPhrases: ['why are you looking to sell', 'what\'s the situation', 'how long has that been', 'when were you thinking', 'what would need to happen'],
      },
      {
        category: 'Handling Resistance',
        maxPoints: 20,
        description: 'Handled "not interested" and initial objections smoothly. Did not argue or get defensive. Stayed calm and curious. Used Reversing or Cushioning techniques.',
        keyPhrases: ['I understand', 'that\'s fair', 'no pressure at all', 'just a quick question', 'makes sense'],
      },
      {
        category: 'Securing Next Step',
        maxPoints: 15,
        description: 'Got a callback agreement, soft appointment, or left the door open with a specific follow-up plan. Did NOT just hang up. Every cold call should end with a concrete next touchpoint.',
        keyPhrases: ['when would be a good time', 'can I call you', 'I\'ll reach out', 'follow up'],
      },
    ],
    redFlags: [
      'Talking too fast or rushing through the call',
      'Sounding scripted or robotic',
      'Being pushy or aggressive when seller shows resistance',
      'Jumping to price before gauging interest',
      'Getting defensive or arguing when seller objects',
      'Ending the call without any follow-up plan',
      'No personality adaptation — same flat energy throughout',
    ],
    aiContext: `COLD CALL — First contact with an uncontacted seller. Goal is to gauge interest only — NOT to qualify, set appointments, or close. Do NOT penalize for skipping deep qualification. Grade on: opener quality, building rapport with a stranger, gauging interest, handling resistance calmly, and securing any kind of next step. A great cold call leaves the door open even if the seller isn't ready today.`,
  },

  {
    id: 'qualification_call',
    name: 'Qualification Call',
    description: 'Call to an inbound lead to determine fit and set an appointment.',
    results: [
      { id: 'not_qualified', name: 'Not Qualified' },
      { id: 'appointment_set', name: 'Appointment Set' },
      { id: 'follow_up_scheduled', name: 'Follow-Up Scheduled' },
    ],
    rubric: [
      {
        category: 'Speed & Energy',
        maxPoints: 15,
        description: 'Responded quickly to the lead with enthusiasm and confidence. Set a positive tone from the first second — inbound leads are warm, energy should match.',
        keyPhrases: ['glad you reached out', 'thanks for calling', 'great timing'],
      },
      {
        category: 'Qualification Depth',
        maxPoints: 25,
        description: 'Thoroughly qualified: timeline (when to close?), motivation (WHY selling — not just surface reason), property condition, financial situation (liens, mortgage), and all decision makers. No major gaps.',
        keyPhrases: ['why are you looking to sell', 'when do you need to close', 'who else is involved', 'what\'s the condition', 'is there a mortgage', 'how long has that been going on', 'what happens if nothing changes'],
      },
      {
        category: 'Trust & Credibility',
        maxPoints: 20,
        description: 'Built trust by explaining the company\'s process, being transparent about how the offer works. Did not overpromise. Handled skepticism with honesty.',
        keyPhrases: ['here\'s how we work', 'I want to be transparent', 'no obligation', 'I\'ll be straight with you'],
      },
      {
        category: 'Appointment Setting',
        maxPoints: 25,
        description: 'Clearly pitched the appointment, handled scheduling objections, and locked in a SPECIFIC date and time for a walkthrough or offer meeting. Vague follow-ups do not count.',
        keyPhrases: ['Tuesday at 2', 'Wednesday morning', 'let\'s schedule', 'what time works', 'confirmed for'],
      },
      {
        category: 'Professionalism',
        maxPoints: 15,
        description: 'Clear communication, appropriate pace, no excessive filler words, respectful and organized throughout.',
        keyPhrases: [],
      },
    ],
    redFlags: [
      'Only asking surface-level "why are you selling?" without digging deeper',
      'Not confirming all decision makers are on board',
      'Giving a price range before seeing the property',
      'Setting a vague follow-up instead of a specific appointment date/time',
      'Not explaining what the appointment/walkthrough involves',
      'Seller offered a timeline window but rep didn\'t lock in a specific time',
    ],
    aiContext: `QUALIFICATION CALL — Lead has already entered the system. Goal is to determine fit AND set a firm appointment. Grade on: energy matching a warm lead, thorough qualification (timeline, motivation, condition, liens, decision makers), building trust, explaining the process, and locking in a specific appointment date and time.`,
  },

  {
    id: 'admin_call',
    name: 'Admin Call',
    description: 'Operational call for scheduling, updates, or resolving issues.',
    results: [
      { id: 'solved', name: 'Solved' },
      { id: 'not_solved', name: 'Not Solved' },
    ],
    rubric: [
      {
        category: 'Problem Identification',
        maxPoints: 25,
        description: 'Quickly understood the issue, question, or need. Asked clarifying questions to get to the root without making caller repeat themselves.',
        keyPhrases: ['just to make sure I understand', 'so what you\'re saying is', 'let me confirm'],
      },
      {
        category: 'Active Listening',
        maxPoints: 20,
        description: 'Let the other party fully explain. Did not rush, interrupt, or dismiss their concern. Reflected back what they heard.',
        keyPhrases: ['I hear you', 'that makes sense', 'I understand', 'so what happened was'],
      },
      {
        category: 'Problem Solving',
        maxPoints: 25,
        description: 'Offered clear solutions or took ownership of resolving the issue. Did not pass the buck without a specific callback time.',
        keyPhrases: ['here\'s what I can do', 'I\'ll take care of that', 'let me handle'],
      },
      {
        category: 'Next Steps & Timeline',
        maxPoints: 20,
        description: 'Established clear action items with SPECIFIC timelines. "We\'ll have it to you by Thursday at noon" not "we\'ll send it soon."',
        keyPhrases: ['by Thursday', 'tomorrow morning', 'within 24 hours', 'I\'ll send it by'],
      },
      {
        category: 'Efficiency',
        maxPoints: 10,
        description: 'Handled the call concisely without unnecessary tangents. Respected everyone\'s time.',
        keyPhrases: [],
      },
    ],
    redFlags: [
      'Never stated the purpose of the call clearly',
      'Ended without confirming what happens next',
      'Vague timeline: "soon", "shortly" instead of a specific date/time',
      'Passed the problem to someone else without taking ownership',
    ],
    aiContext: `ADMIN CALL — Operational call for scheduling, updates, or problem resolution. No critical failures — low-stakes call. Grade purely on task execution: identified issue, solved or took ownership, confirmed specific next steps with real timelines.`,
  },

  {
    id: 'follow_up_call',
    name: 'Follow-Up Call',
    description: 'Re-engaging a lead where a previous offer was already presented.',
    results: [
      { id: 'interested', name: 'Interested' },
      { id: 'not_interested', name: 'Not Interested' },
      { id: 'appointment_set', name: 'Appointment Set' },
    ],
    criticalFailures: [
      'Never referenced the previous offer amount',
      'Never asked for a decision',
      'Talked through the seller\'s silence after the roadblock question',
      'Did not identify or confirm who the decision maker is',
    ],
    criticalFailureCap: 50,
    rubric: [
      {
        category: 'Referenced Previous Conversation',
        maxPoints: 15,
        description: 'Mentioned the date of last call, what was discussed, and/or the specific offer already on the table. Rep remembers this seller specifically.',
        keyPhrases: ['last time we spoke', 'we talked about', 'the offer we put on the table', 'when we last connected', 'you mentioned'],
      },
      {
        category: 'Re-confirmed Decision Maker',
        maxPoints: 15,
        description: '"Is it still just you making the call, or is anyone else involved now?" Must be confirmed explicitly.',
        keyPhrases: ['still just you', 'anyone else involved', 'decision maker', 'spouse', 'partner', 'family'],
      },
      {
        category: 'Re-qualified Motivation & Timeline',
        maxPoints: 15,
        description: '"You mentioned [motivation]. Is that still the situation? Has anything changed?" Not full re-qualification — just checking for shifts.',
        keyPhrases: ['you mentioned', 'still the situation', 'has anything changed', 'still looking to', 'timeline still'],
      },
      {
        category: 'Surfaced Roadblocks',
        maxPoints: 20,
        description: '"What\'s been the biggest thing holding you back?" Then PAUSED and let the seller speak. The pause is critical — score zero if rep filled the silence immediately.',
        keyPhrases: ['holding you back', 'what\'s been stopping', 'biggest concern', 'what\'s the hesitation'],
      },
      {
        category: 'Pushed for a Decision',
        maxPoints: 20,
        description: 'The reality check close — "Is that a yes or a no for you today?" Binary by design. A vague "let me know when you\'re ready" is NOT asking for a decision.',
        keyPhrases: ['yes or no', 'where do you stand', 'are you ready to move forward', 'what\'s your decision', 'ready to accept'],
      },
      {
        category: 'Handled Objection & Set Next Step',
        maxPoints: 15,
        description: 'If no → "What would need to change for this to make sense?" Must be specific and time-bound, not vague.',
        keyPhrases: ['what would need to change', 'what should I come prepared with', 'specific date'],
      },
    ],
    redFlags: [
      'Never referenced the previous offer amount',
      'Never asked for a direct yes or no decision',
      'Talked through the seller\'s silence after the roadblock question',
      'Ran a full cold call or qualification script instead of targeted follow-up',
      'Did not confirm who the decision maker is',
      'No concrete next step — ended with a vague "I\'ll call you later"',
      'Seller offered a timeline window but rep didn\'t lock in a specific date/time',
    ],
    aiContext: `FOLLOW-UP CALL — Re-engaging a known lead after a previous offer was already discussed. Full qualification already happened. DO NOT penalize for skipping qualification steps. Focus ONLY on: referencing the previous conversation and offer, confirming decision maker, checking for situation changes, surfacing roadblocks (and PAUSING), and pushing for a binary yes/no. Talk ratio target: seller talks at least 50%. CRITICAL FAILURE CAP at 50% if: never referenced prior offer, never asked for decision, talked through seller's silence, or failed to confirm decision maker.`,
  },

  {
    id: 'offer_call',
    name: 'Offer Call',
    description: 'Presenting an offer and explaining the process of working together.',
    results: [
      { id: 'accepted', name: 'Accepted' },
      { id: 'rejected', name: 'Rejected' },
      { id: 'follow_up_scheduled', name: 'Follow-Up Scheduled' },
    ],
    rubric: [
      {
        category: 'Rapport & Motivation Restatement',
        maxPoints: 20,
        description: 'Revisited seller\'s motivation using THEIR OWN WORDS before presenting any numbers. Getting them to re-affirm their situation sets up the proposal. Confirmed ALL decision makers are present.',
        keyPhrases: ['you mentioned', 'you told me', 'sounds like', 'based on what you shared', 'all decision makers'],
      },
      {
        category: 'Confidence & Authority',
        maxPoints: 20,
        description: 'Presented the offer with conviction. No apologizing ("I know it\'s not what you hoped for..."), no hedging. Came across as someone who does this every day.',
        keyPhrases: ['our offer is', 'we can close at', 'we\'re prepared to', 'here\'s what we can do'],
      },
      {
        category: 'Process Walkthrough',
        maxPoints: 15,
        description: 'Clearly explained what working together looks like: timeline, as-is purchase, no agent fees, closing process. Seller should know exactly what happens after they say yes.',
        keyPhrases: ['here\'s how it works', 'what happens next', 'no repairs needed', 'we handle everything'],
      },
      {
        category: 'Objection Handling',
        maxPoints: 25,
        description: 'Handled price pushback professionally. Used comps, repair estimates, or logic to justify the number without being combative. Never argued — explained.',
        keyPhrases: ['here\'s how we got there', 'comparable sales show', 'repairs we\'d need to cover', 'when you factor in'],
      },
      {
        category: 'Closing & Commitment',
        maxPoints: 20,
        description: 'Moved toward agreement by asking directly. Did not wait for the seller to volunteer yes. If accepted — confirmed the commitment. If not — got a clear counter-offer discussion or specific follow-up date.',
        keyPhrases: ['are you ready to move forward', 'does that work for you', 'should we get started'],
      },
    ],
    redFlags: [
      'Presenting the offer BEFORE restating the seller\'s motivation',
      'Apologizing for the offer price or hedging ("I know it\'s low but...")',
      'Not confirming all decision makers are present',
      'Getting defensive when seller pushes back on price',
      'Not explaining the process or what happens after they say yes',
      'Ending without a firm commitment or specific follow-up date',
    ],
    aiContext: `OFFER CALL — Presenting a specific offer to buy the property. Proposal comes LAST — after motivation is restated and seller re-commits. Grade on: restating motivation in seller's own words, presenting offer with confidence (no apologies), explaining the process, handling objections with logic, confirming decision makers, and moving toward commitment.`,
  },

  {
    id: 'purchase_agreement_call',
    name: 'Purchase Agreement Call',
    description: 'Walking through and getting a contract signed.',
    results: [
      { id: 'signed', name: 'Signed' },
      { id: 'not_signed', name: 'Not Signed' },
      { id: 'follow_up_scheduled', name: 'Follow-Up Scheduled' },
    ],
    rubric: [
      {
        category: 'Contract Walkthrough',
        maxPoints: 25,
        description: 'Explained each key section of the contract in plain language. Seller understood what they were signing and why. No jargon. No rushing.',
        keyPhrases: ['this section means', 'what this says is', 'in plain terms', 'this protects you'],
      },
      {
        category: 'Concern Handling',
        maxPoints: 25,
        description: 'Addressed hesitations, cold feet, spouse concerns, and last-minute doubts with patience. Every objection at this stage is a potential deal killer — treated seriously.',
        keyPhrases: ['I understand your concern', 'that\'s completely normal', 'a lot of sellers feel that way', 'let me address that'],
      },
      {
        category: 'Maintaining Momentum',
        maxPoints: 20,
        description: 'Kept the conversation moving toward signing without rushing. Balanced urgency with patience.',
        keyPhrases: ['we\'re almost there', 'just a few more questions', 'once you sign', 'next step is'],
      },
      {
        category: 'Terms Confirmation',
        maxPoints: 15,
        description: 'Confirmed all key terms verbally before signing: purchase price, closing date, inspection period, earnest money, any special conditions.',
        keyPhrases: ['just to confirm', 'the purchase price is', 'closing on', 'earnest money', 'we agreed to'],
      },
      {
        category: 'Securing the Signature',
        maxPoints: 15,
        description: 'Successfully guided the seller through signing. If not signed — established a SPECIFIC plan and timeline, not a vague "let me know."',
        keyPhrases: ['once you sign here', 'you\'re all set', 'you\'re officially under contract'],
      },
    ],
    redFlags: [
      'Rushing through contract terms without explaining them',
      'Dismissing or minimizing seller concerns about what they\'re signing',
      'Allowing cold feet to derail the call without addressing the underlying concern',
      'Not confirming all terms verbally before signing',
      'Ending without a signature AND without a specific plan to get one',
    ],
    aiContext: `PURCHASE AGREEMENT CALL — Walking seller through signing the contract. Grade on: clear contract explanation in plain language, patiently handling hesitations and cold feet, maintaining momentum, confirming all terms verbally, and getting the contract executed. Cold feet at this stage are common — rep should be confident, reassuring, and thorough.`,
  },

  {
    id: 'dispo_call',
    name: 'Dispo Call',
    description: 'Disposition team call to buyers about a deal.',
    results: [
      { id: 'interested', name: 'Interested' },
      { id: 'not_interested', name: 'Not Interested' },
      { id: 'showing_scheduled', name: 'Showing Scheduled' },
      { id: 'offer_collected', name: 'Offer Collected' },
    ],
    criticalFailures: [
      'Did not know basic deal details (address, condition, ARV, asking price)',
      'Agreed to or implied a price below the company\'s cost',
      'Let buyer hang up without any next step or follow-up plan',
    ],
    criticalFailureCap: 50,
    rubric: [
      {
        category: 'Deal Presentation',
        maxPoints: 20,
        description: 'Clearly presented the deal: address, condition, ARV, estimated rehab cost, asking price. Sold the deal — didn\'t just read numbers.',
        keyPhrases: ['ARV is', 'rehab estimate', 'asking price', 'here\'s the deal', 'profit potential'],
      },
      {
        category: 'Running the Numbers',
        maxPoints: 20,
        description: 'Walked the buyer through the math: ARV minus rehab minus holding costs minus asking price = profit margin. Made the deal make sense on paper.',
        keyPhrases: ['after repair value', 'your profit would be', 'rehab budget', 'holding costs', 'your margin'],
      },
      {
        category: 'Creating Urgency',
        maxPoints: 20,
        description: 'Built FOMO without lying. Other buyers looking, timeline pressure, limited availability. Made buyer feel they could lose this deal.',
        keyPhrases: ['other buyers looking', 'we need to move quickly', 'first solid offer', 'won\'t last', 'multiple buyers'],
      },
      {
        category: 'Question Handling',
        maxPoints: 20,
        description: 'Answered buyer questions accurately and confidently. Knew the deal inside and out — no guessing, no deflecting.',
        keyPhrases: ['great question', 'the condition is', 'based on the inspection', 'comparable sales show'],
      },
      {
        category: 'Getting Commitment',
        maxPoints: 20,
        description: 'Got a firm offer, a number, or a commitment to walk the property. Did NOT let the conversation end without a next step.',
        keyPhrases: ['can you put that in writing', 'what number works for you', 'when can you walk it', 'ready to move forward'],
      },
    ],
    redFlags: [
      'Did not know basic deal details — address, condition, ARV, asking price',
      'Could not run the numbers confidently when buyer asked',
      'No urgency created — presented deal flatly without FOMO',
      'Got defensive or unsure when buyer pushed back on price',
      'Ended without a firm next step (showing, offer, specific callback)',
      'Agreed to or implied price below company cost',
    ],
    aiContext: `DISPO CALL — Selling a wholesale deal to a buyer/investor. Grade on: knowing the deal cold (ARV, condition, asking price, rehab estimate), compelling presentation, running the numbers so buyer sees profit potential, creating genuine urgency, handling buyer questions accurately, and getting buyer to commit to a showing or submit a number. CRITICAL FAILURE CAP at 50% if: didn't know basic deal details, implied price below cost, or let buyer hang up without any next step.`,
  },
]

// ─── Utility functions — all existing signatures preserved ──���────────────────

export function getCallType(id: string): CallTypeDefinition | undefined {
  return CALL_TYPES.find(t => t.id === id)
}

export function getRubricForCallType(callTypeId: string): RubricCriterion[] {
  const ct = CALL_TYPES.find(t => t.id === callTypeId)
  if (ct) return ct.rubric
  const lower = callTypeId.toLowerCase()
  const byName = CALL_TYPES.find(t => t.name.toLowerCase() === lower)
  return byName?.rubric ?? CALL_TYPES[0].rubric
}

export function getResultsForCallType(callTypeId: string): CallResult[] {
  return CALL_TYPES.find(t => t.id === callTypeId)?.results ?? []
}

export function getAllResultIds(): string[] {
  const ids = new Set<string>()
  for (const ct of CALL_TYPES) {
    for (const r of ct.results) ids.add(r.id)
  }
  return [...ids]
}

export const RESULT_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const ct of CALL_TYPES) {
    for (const r of ct.results) map[r.id] = r.name
  }
  return map
})()

export function getCallTypeAIContext(nameOrId: string): string | null {
  const byId = CALL_TYPES.find(t => t.id === nameOrId)
  if (byId) return byId.aiContext
  const lower = nameOrId.toLowerCase()
  const byName = CALL_TYPES.find(t => t.name.toLowerCase() === lower)
  if (byName) return byName.aiContext
  const byPartial = CALL_TYPES.find(t => lower.includes(t.name.toLowerCase().split(' ')[0].toLowerCase()))
  return byPartial?.aiContext ?? null
}

// NEW exports
export function getRedFlagsForCallType(callTypeId: string): string[] {
  return CALL_TYPES.find(t => t.id === callTypeId)?.redFlags ?? []
}

export function getCriticalFailuresForCallType(callTypeId: string): { failures: string[]; cap: number } | null {
  const ct = CALL_TYPES.find(t => t.id === callTypeId)
  if (!ct?.criticalFailures?.length) return null
  return { failures: ct.criticalFailures, cap: ct.criticalFailureCap ?? 50 }
}
