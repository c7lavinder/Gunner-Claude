// lib/call-types.ts
// Locked call type definitions — used by AI grading and UI dropdowns
// Each type has a name, short label, and AI grading context

export interface CallTypeDefinition {
  id: string
  name: string
  description: string
  aiContext: string
}

export const CALL_TYPES: CallTypeDefinition[] = [
  {
    id: 'cold_call',
    name: 'Cold Call',
    description: 'Outbound call to an uncontacted seller to gauge interest in selling.',
    aiContext: `COLD CALL — This is an outbound call to a seller who has never been contacted before. The rep is trying to determine if the homeowner has any interest in selling their house. Grade on: opening hook and tone (did they come across professional and non-pushy?), ability to quickly build rapport with a stranger, qualifying the seller's situation and motivation, handling initial resistance or objections ("I'm not interested"), and whether they secured a next step (callback, appointment, or clear follow-up). A great cold call leaves the door open even if the seller isn't ready today.`,
  },
  {
    id: 'qualification_call',
    name: 'Qualification Call',
    description: 'Call to an inbound lead to determine fit and set an appointment.',
    aiContext: `QUALIFICATION CALL — This is a call to a lead who has already come into the system (inbound). The goal is to determine if the company and the seller are a good fit to work together, and to set up an appointment for either a property walk-through or an offer presentation with an acquisition specialist. Grade on: speed to lead (how quickly the rep engaged), thorough qualification (timeline, motivation, property condition, financial situation), building trust and credibility, clearly explaining what working together looks like, and successfully setting a firm appointment with a specific date/time. The outcome should be a qualified appointment or a clear reason why the lead doesn't fit.`,
  },
  {
    id: 'admin_call',
    name: 'Admin Call',
    description: 'Operational call for scheduling, updates, or resolving issues.',
    aiContext: `ADMIN CALL — This is an administrative/operational call covering things like: scheduling a showing, getting an update on a problem, hearing about an issue, coordinating logistics, or general communication. The goal is to identify the problem or need and establish a clear next step. Grade on: professionalism, active listening to understand the issue, problem-solving ability, clear communication of next steps and timelines, and whether the call accomplished its purpose efficiently. Admin calls should be concise and action-oriented — the rep should leave the other party knowing exactly what happens next.`,
  },
  {
    id: 'follow_up_call',
    name: 'Follow-Up Call',
    description: 'Re-engaging a lead in follow-up to see if they are more interested now.',
    aiContext: `FOLLOW-UP CALL — This is a call to someone already in follow-up. The rep is checking whether the seller is any more interested in selling compared to last time they spoke, and whether it's time to start the selling process. Grade on: referencing previous conversations (showing they remember the seller), reading the seller's current temperature, creating urgency without being pushy, re-qualifying any changes in situation (timeline, motivation, competing offers), and advancing the conversation toward a next step. A great follow-up call either moves the deal forward or sets a specific future touchpoint.`,
  },
  {
    id: 'offer_call',
    name: 'Offer Call',
    description: 'Presenting an offer and explaining the process of working together.',
    aiContext: `OFFER CALL — This is when an acquisitions manager (or anyone) gets on a call to walk the seller through what working together looks like, establish expectations, and present an offer to buy the house. Grade on: confidence and authority in presenting the offer, clearly explaining the process and timeline, setting proper expectations (inspection, closing timeline, as-is purchase), handling price objections and seller pushback, using comparable sales or logic to justify the offer, and moving toward agreement or a clear counter-offer discussion. The rep should never apologize for the offer — they should present it with conviction.`,
  },
  {
    id: 'purchase_agreement_call',
    name: 'Purchase Agreement Call',
    description: 'Walking through and getting a contract signed.',
    aiContext: `PURCHASE AGREEMENT CALL — This is the call where the rep walks the seller through signing a purchase agreement/contract. Grade on: clearly explaining each section of the contract in plain language, addressing seller concerns or hesitations, maintaining momentum toward signing, handling last-minute objections (cold feet, wanting to think about it, spouse concerns), confirming all key terms (price, closing date, inspection period, earnest money), and successfully getting the contract executed. This is a closing call — the rep should be confident, reassuring, and thorough without rushing the seller.`,
  },
  {
    id: 'dispo_call',
    name: 'Dispo Call',
    description: 'Disposition team call to buyers about a deal.',
    aiContext: `DISPOSITION CALL — This is a call from the disposition team to a buyer or potential buyer about a deal/property. Grade on: clearly presenting the property details and opportunity, answering buyer questions accurately, creating urgency and anxiety around the deal (other buyers looking, timeline pressure), running numbers with the buyer (ARV, rehab estimates, profit potential), getting the buyer to commit to a number or to go walk the property, and overall salesmanship. A great dispo call either gets a firm offer from the buyer or gets them physically out to the property. The rep should know the deal inside and out.`,
  },
]

// Get a call type by ID
export function getCallType(id: string): CallTypeDefinition | undefined {
  return CALL_TYPES.find(t => t.id === id)
}

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
