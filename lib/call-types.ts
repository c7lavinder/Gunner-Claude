// lib/call-types.ts
// Locked call type definitions — used by AI grading and UI dropdowns
// Each type has a name, short label, and AI grading context

export interface CallResult {
  id: string
  name: string
}

export interface RubricCriterion {
  category: string
  maxPoints: number
  description: string
}

export interface CallTypeDefinition {
  id: string
  name: string
  description: string
  results: CallResult[]
  rubric: RubricCriterion[]
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
      { category: 'Opening Hook & Tone', maxPoints: 20, description: 'Professional, non-pushy opener that grabs attention. Did they introduce themselves clearly and give a reason for calling that creates curiosity?' },
      { category: 'Rapport Building', maxPoints: 20, description: 'Built quick connection with a stranger. Found common ground, used their name, matched energy. Seller felt comfortable.' },
      { category: 'Qualifying Interest', maxPoints: 25, description: 'Discovered if there is any interest in selling. Asked about situation, timeline, property condition without interrogating.' },
      { category: 'Handling Resistance', maxPoints: 20, description: 'Addressed "not interested" and initial objections smoothly. Did not argue or get defensive. Stayed calm and curious.' },
      { category: 'Securing Next Step', maxPoints: 15, description: 'Got a callback, follow-up agreement, or left the door open for future contact. Did not just hang up.' },
    ],
    aiContext: `COLD CALL — This is an outbound call to a seller who has never been contacted before. The rep is trying to determine if the homeowner has any interest in selling their house. Grade on: opening hook and tone (did they come across professional and non-pushy?), ability to quickly build rapport with a stranger, qualifying the seller's situation and motivation, handling initial resistance or objections ("I'm not interested"), and whether they secured a next step (callback, appointment, or clear follow-up). A great cold call leaves the door open even if the seller isn't ready today.`,
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
      { category: 'Speed & Energy', maxPoints: 15, description: 'Responded quickly to the lead, brought enthusiasm and confidence. Set a positive tone from the first second.' },
      { category: 'Qualification Depth', maxPoints: 25, description: 'Thoroughly qualified: timeline, motivation for selling, property condition, financial situation, decision makers. No gaps.' },
      { category: 'Trust & Credibility', maxPoints: 20, description: 'Built trust by explaining the process, being transparent, and making the seller feel this is a real company that delivers.' },
      { category: 'Appointment Setting', maxPoints: 25, description: 'Clearly pitched the appointment, handled scheduling objections, and locked in a specific date/time for walkthrough or offer meeting.' },
      { category: 'Professionalism', maxPoints: 15, description: 'Clear communication, proper pace, no filler words, respectful and organized throughout.' },
    ],
    aiContext: `QUALIFICATION CALL — This is a call to a lead who has already come into the system (inbound). The goal is to determine if the company and the seller are a good fit to work together, and to set up an appointment for either a property walk-through or an offer presentation with an acquisition specialist. Grade on: speed to lead (how quickly the rep engaged), thorough qualification (timeline, motivation, property condition, financial situation), building trust and credibility, clearly explaining what working together looks like, and successfully setting a firm appointment with a specific date/time. The outcome should be a qualified appointment or a clear reason why the lead doesn't fit.`,
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
      { category: 'Problem Identification', maxPoints: 25, description: 'Quickly understood the issue, question, or need. Asked clarifying questions to get to the root of the matter.' },
      { category: 'Active Listening', maxPoints: 20, description: 'Let the other party fully explain. Did not rush, interrupt, or dismiss their concern.' },
      { category: 'Problem Solving', maxPoints: 25, description: 'Offered clear solutions, alternatives, or took ownership of resolving the issue. Did not pass the buck.' },
      { category: 'Next Steps & Timeline', maxPoints: 20, description: 'Established clear action items with specific timelines. The other party knows exactly what happens next and when.' },
      { category: 'Efficiency', maxPoints: 10, description: 'Handled the call concisely without unnecessary tangents. Respected everyone\'s time.' },
    ],
    aiContext: `ADMIN CALL — This is an administrative/operational call covering things like: scheduling a showing, getting an update on a problem, hearing about an issue, coordinating logistics, or general communication. The goal is to identify the problem or need and establish a clear next step. Grade on: professionalism, active listening to understand the issue, problem-solving ability, clear communication of next steps and timelines, and whether the call accomplished its purpose efficiently. Admin calls should be concise and action-oriented — the rep should leave the other party knowing exactly what happens next.`,
  },
  {
    id: 'follow_up_call',
    name: 'Follow-Up Call',
    description: 'Re-engaging a lead in follow-up to see if they are more interested now.',
    results: [
      { id: 'interested', name: 'Interested' },
      { id: 'not_interested', name: 'Not Interested' },
      { id: 'appointment_set', name: 'Appointment Set' },
    ],
    rubric: [
      { category: 'Context Recall', maxPoints: 20, description: 'Referenced previous conversations and showed they remember the seller\'s situation. Made it personal, not generic.' },
      { category: 'Temperature Reading', maxPoints: 20, description: 'Effectively gauged the seller\'s current interest level. Read between the lines on whether motivation has changed.' },
      { category: 'Re-Qualification', maxPoints: 20, description: 'Checked for changes in situation: timeline shifts, new motivation, competing offers, life changes that affect selling.' },
      { category: 'Urgency Creation', maxPoints: 20, description: 'Created a reason to act now without being pushy. Market conditions, buyer interest, or timing-based urgency.' },
      { category: 'Advancing the Deal', maxPoints: 20, description: 'Moved the conversation forward: set an appointment, got a firmer commitment, or established a concrete next touchpoint.' },
    ],
    aiContext: `FOLLOW-UP CALL — This is a call to someone already in follow-up. The rep is checking whether the seller is any more interested in selling compared to last time they spoke, and whether it's time to start the selling process. Grade on: referencing previous conversations (showing they remember the seller), reading the seller's current temperature, creating urgency without being pushy, re-qualifying any changes in situation (timeline, motivation, competing offers), and advancing the conversation toward a next step. A great follow-up call either moves the deal forward or sets a specific future touchpoint.`,
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
      { category: 'Confidence & Authority', maxPoints: 20, description: 'Presented the offer with conviction. No apologizing, no hedging. Came across as someone who does this every day.' },
      { category: 'Process Walkthrough', maxPoints: 20, description: 'Clearly explained what working together looks like: timeline, inspection, closing process, what the seller needs to do.' },
      { category: 'Expectation Setting', maxPoints: 15, description: 'Set proper expectations on timeline, as-is purchase, closing costs, and what happens after they accept.' },
      { category: 'Objection Handling', maxPoints: 25, description: 'Handled price pushback and seller hesitation. Used comps, repair estimates, or logic to justify the offer without being combative.' },
      { category: 'Closing', maxPoints: 20, description: 'Moved toward agreement. Asked for the close directly. If not accepted, secured a clear counter-offer discussion or follow-up.' },
    ],
    aiContext: `OFFER CALL — This is when an acquisitions manager (or anyone) gets on a call to walk the seller through what working together looks like, establish expectations, and present an offer to buy the house. Grade on: confidence and authority in presenting the offer, clearly explaining the process and timeline, setting proper expectations (inspection, closing timeline, as-is purchase), handling price objections and seller pushback, using comparable sales or logic to justify the offer, and moving toward agreement or a clear counter-offer discussion. The rep should never apologize for the offer — they should present it with conviction.`,
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
      { category: 'Contract Walkthrough', maxPoints: 25, description: 'Explained each section of the contract in plain, simple language. Seller understood what they were signing and why.' },
      { category: 'Concern Handling', maxPoints: 25, description: 'Addressed hesitations, cold feet, spouse concerns, and last-minute doubts with patience and reassurance.' },
      { category: 'Maintaining Momentum', maxPoints: 20, description: 'Kept the conversation moving toward signing without rushing. Balanced urgency with patience.' },
      { category: 'Terms Confirmation', maxPoints: 15, description: 'Confirmed all key terms: purchase price, closing date, inspection period, earnest money, any special conditions.' },
      { category: 'Securing the Signature', maxPoints: 15, description: 'Successfully guided the seller through signing. If not signed, established a specific plan to get it done.' },
    ],
    aiContext: `PURCHASE AGREEMENT CALL — This is the call where the rep walks the seller through signing a purchase agreement/contract. Grade on: clearly explaining each section of the contract in plain language, addressing seller concerns or hesitations, maintaining momentum toward signing, handling last-minute objections (cold feet, wanting to think about it, spouse concerns), confirming all key terms (price, closing date, inspection period, earnest money), and successfully getting the contract executed. This is a closing call — the rep should be confident, reassuring, and thorough without rushing the seller.`,
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
    rubric: [
      { category: 'Property Presentation', maxPoints: 20, description: 'Clearly presented the deal: address, condition, ARV, rehab estimate, asking price. Buyer has a complete picture.' },
      { category: 'Running Numbers', maxPoints: 20, description: 'Walked the buyer through the math: ARV, rehab costs, holding costs, profit potential. Made the deal make sense on paper.' },
      { category: 'Creating Urgency', maxPoints: 20, description: 'Built anxiety and FOMO: other buyers looking, timeline pressure, first-come-first-served energy. Made them feel they could lose it.' },
      { category: 'Question Handling', maxPoints: 20, description: 'Answered buyer questions accurately and confidently. Knew the deal inside and out — no guessing or deflecting.' },
      { category: 'Getting Commitment', maxPoints: 20, description: 'Got a firm offer, a number, or the buyer committed to walk the property. Did not let the conversation end without a next step.' },
    ],
    aiContext: `DISPOSITION CALL — This is a call from the disposition team to a buyer or potential buyer about a deal/property. Grade on: clearly presenting the property details and opportunity, answering buyer questions accurately, creating urgency and anxiety around the deal (other buyers looking, timeline pressure), running numbers with the buyer (ARV, rehab estimates, profit potential), getting the buyer to commit to a number or to go walk the property, and overall salesmanship. A great dispo call either gets a firm offer from the buyer or gets them physically out to the property. The rep should know the deal inside and out.`,
  },
]

// Get a call type by ID
export function getCallType(id: string): CallTypeDefinition | undefined {
  return CALL_TYPES.find(t => t.id === id)
}

// Get default rubric for a call type
export function getRubricForCallType(callTypeId: string): RubricCriterion[] {
  const ct = CALL_TYPES.find(t => t.id === callTypeId)
  if (ct) return ct.rubric

  // Fuzzy match by name
  const lower = callTypeId.toLowerCase()
  const byName = CALL_TYPES.find(t => t.name.toLowerCase() === lower)
  return byName?.rubric ?? CALL_TYPES[0].rubric // fallback to cold call rubric
}

// Get valid results for a call type
export function getResultsForCallType(callTypeId: string): CallResult[] {
  return CALL_TYPES.find(t => t.id === callTypeId)?.results ?? []
}

// Get all unique result IDs across all call types
export function getAllResultIds(): string[] {
  const ids = new Set<string>()
  for (const ct of CALL_TYPES) {
    for (const r of ct.results) ids.add(r.id)
  }
  return [...ids]
}

// Map result ID to display name
export const RESULT_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const ct of CALL_TYPES) {
    for (const r of ct.results) map[r.id] = r.name
  }
  return map
})()

// Get AI context for a call type by name (fuzzy match for legacy data)
export function getCallTypeAIContext(nameOrId: string): string | null {
  const byId = CALL_TYPES.find(t => t.id === nameOrId)
  if (byId) return byId.aiContext

  const lower = nameOrId.toLowerCase()
  const byName = CALL_TYPES.find(t => t.name.toLowerCase() === lower)
  if (byName) return byName.aiContext

  // Fuzzy: check if any call type name is contained in the input
  const byPartial = CALL_TYPES.find(t => lower.includes(t.name.toLowerCase().split(' ')[0].toLowerCase()))
  return byPartial?.aiContext ?? null
}
