import type { IndustryPlaybook, RoleplayPersona, TrainingCategory, GradingPhilosophy } from "../../shared/types";
import { RE_WHOLESALING_PLAYBOOK } from "./reWholesaling";

// ─── SOLAR ───────────────────────────────────────────────────────────────────

const SOLAR_PERSONAS: RoleplayPersona[] = [
  {
    id: "solar-skeptical-homeowner",
    name: "Skeptical Sandra",
    description: "A homeowner who has already received calls from 3 other solar companies and is fed up with high-pressure pitches",
    role: "setter",
    difficulty: "intermediate",
    personality: "Guarded and impatient. Has heard every solar pitch and dismisses generic openers immediately. Warms up slightly if you differentiate yourself and ask smart questions rather than pitch.",
    scenario: "Owns a 2,100 sq ft home, $220/month electric bill. Has been called by SunPower, Sunrun, and a local installer this week. Hasn't committed to anything because she doesn't trust the savings projections.",
    objections: [
      "I've already talked to three other companies",
      "You all say the same thing about savings",
      "I don't want anything on my roof",
      "How do I know you're not just going to disappear after the install?",
    ],
  },
  {
    id: "solar-has-quotes",
    name: "Comparison Carlos",
    description: "A homeowner who already has two competing proposals in hand and is using them as leverage",
    role: "setter",
    difficulty: "advanced",
    personality: "Savvy, analytical, and in control. Knows his numbers. Will immediately ask how you compare on price-per-watt and whether you use tier-1 panels. Uses the competing quote as a hammer.",
    scenario: "Has a $280/month bill, owns his home free and clear, good credit. Has quotes from SunPower at $38K and a local installer at $31K. Waiting to see if anyone beats them.",
    objections: [
      "SunPower already quoted me $38K for the same system size",
      "The other company offered me a lower rate",
      "I need to see your panel specs before I commit to anything",
      "Why should I give you an appointment when I already have two companies coming out?",
    ],
  },
  {
    id: "solar-busy-reschedule",
    name: "Busy Brian",
    description: "A homeowner who agreed to an appointment last week but keeps rescheduling and going cold",
    role: "setter",
    difficulty: "intermediate",
    personality: "Genuinely busy, not hostile. Feels guilty about rescheduling but isn't prioritizing the appointment. Responds well to brevity and direct asks. Loses interest if the call drags on.",
    scenario: "Has been rescheduled twice. Owns the home, $190/month bill. Works 60-hour weeks. Wife is the actual decision-maker and wasn't home the first two times.",
    objections: [
      "This week isn't great — can we push to next month?",
      "My wife needs to be there and she's been slammed",
      "Is this going to take a long time?",
      "Just send me some info and I'll look it over",
    ],
  },
  {
    id: "solar-price-objector",
    name: "Price-Focused Patricia",
    description: "A homeowner who is interested in solar but has sticker shock at the system cost and fixates on the upfront number",
    role: "setter",
    difficulty: "beginner",
    personality: "Curious about solar but anchored on the upfront price. Hasn't connected the value of $0-down financing. Needs the setter to redirect the conversation to monthly payment vs. current bill.",
    scenario: "Renting — wait, just confirmed she owns. $250/month electric bill. Her neighbor just got solar installed. She called in after seeing a Facebook ad and expected it to cost a few thousand dollars.",
    objections: [
      "I heard these systems cost $30,000 — I can't afford that",
      "I'm not taking out a loan for this",
      "What if I just wait until the prices come down?",
      "My neighbor paid way less than that",
    ],
  },
];

const SOLAR_TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    code: "solar-opening-hook",
    name: "Opening Hook Mastery",
    description: "How to open a solar setter call in a way that earns 30 more seconds — not a hang-up",
    order: 0,
  },
  {
    code: "solar-qualification",
    name: "Solar Qualification",
    description: "Fast, confident qualification: homeownership, roof condition, average electric bill, credit eligibility",
    order: 1,
  },
  {
    code: "solar-objection-handling",
    name: "Objection Handling",
    description: "Proven rebuttals for the top solar objections: price, roof concerns, competitive quotes, trust issues",
    order: 2,
  },
  {
    code: "solar-appointment-setting",
    name: "Appointment Setting",
    description: "How to lock in a firm commitment — date, time, decision-makers present — and reduce no-shows",
    order: 3,
  },
  {
    code: "solar-product-knowledge",
    name: "Product Knowledge",
    description: "Panel types, inverters, financing options, ITC tax credit basics, and how to explain savings projections credibly",
    order: 4,
  },
];

const SOLAR_GRADING_PHILOSOPHY: GradingPhilosophy = {
  overview:
    "Solar setter calls are graded on qualification efficiency and appointment commitment quality. The goal of every setter call is one thing: book a firm consultation with a qualified homeowner and both decision-makers present. We grade on whether the rep earned that appointment through smart qualification, not pressure.",
  criticalFailurePolicy:
    "Critical failure triggers an automatic cap of 50% regardless of other scores. Critical failure conditions: setter pitches solar benefits before confirming homeownership; setter fails to ask about the electric bill; setter books an appointment without confirming the homeowner's spouse or co-borrower will be present.",
  talkRatioGuidance:
    "Setters should be talking no more than 40% of the time. A great setter call is mostly questions. If the rep is dominating the call, they are pitching instead of qualifying — and unqualified appointments waste the closer's time.",
  roleSpecific: {
    setter:
      "Grade primarily on the QUAL sequence: homeownership confirmed, roof age or condition explored, average monthly electric bill captured, credit eligibility addressed. Then grade on appointment lock — was a specific date/time confirmed, and were both decision-makers committed? Penalize heavily for pitching features before completing the QUAL sequence.",
    closer:
      "Grade on needs anchoring (did the closer connect the proposal to the homeowner's actual bill?), proposal clarity, objection handling on price and financing, and contract commitment. A closer who gives a beautiful presentation but doesn't ask for the contract scores no higher than a C.",
    project_mgr:
      "Grade on expectation-setting, timeline accuracy, and proactive communication during the install process. A PM who lets a homeowner go more than 5 days without an update is failing on the job regardless of the install outcome.",
  },
};

export const SOLAR_PLAYBOOK: IndustryPlaybook = {
  code: "solar",
  name: "Solar Sales",
  terminology: {
    contact: "Homeowner", contactPlural: "Homeowners",
    asset: "Property", assetPlural: "Properties",
    deal: "Deal", dealPlural: "Deals",
    walkthrough: "Site Survey",
  },
  roles: [
    { code: "setter", name: "Setter", description: "Sets appointments for closers via door-to-door or phone", color: "#0ea5e9" },
    { code: "closer", name: "Closer", description: "Runs the in-home or virtual consultation and closes the deal", color: "#6366f1" },
    { code: "project_mgr", name: "Project Manager", description: "Manages install timeline, permits, and inspections", color: "#10b981" },
  ],
  stages: [
    { code: "new_lead", name: "New Lead", pipeline: "sales", order: 0 },
    { code: "appointment_set", name: "Appointment Set", pipeline: "sales", order: 1 },
    { code: "consultation_done", name: "Consultation Done", pipeline: "sales", order: 2 },
    { code: "proposal_sent", name: "Proposal Sent", pipeline: "sales", order: 3 },
    { code: "contract_signed", name: "Contract Signed", pipeline: "sales", order: 4 },
    { code: "site_survey", name: "Site Survey", pipeline: "install", order: 5 },
    { code: "permitting", name: "Permitting", pipeline: "install", order: 6 },
    { code: "install_scheduled", name: "Install Scheduled", pipeline: "install", order: 7 },
    { code: "installed", name: "Installed", pipeline: "install", order: 8 },
    { code: "pto", name: "PTO Approved", pipeline: "install", order: 9 },
    { code: "dead", name: "Dead", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "cold_knock", name: "Door Knock / Cold Call", description: "First contact with homeowner" },
    { code: "appointment_confirm", name: "Appointment Confirmation", description: "Confirming scheduled consultation" },
    { code: "consultation", name: "Consultation Call", description: "Running the solar presentation" },
    { code: "follow_up", name: "Follow Up", description: "Post-consultation nurture" },
  ],
  rubrics: [
    {
      id: "solar-setter",
      name: "Solar Setter Call",
      role: "setter",
      callType: "cold_knock",
      totalPoints: 100,
      criteria: [
        { name: "Opening Hook", maxPoints: 20, description: "Captures attention quickly with a relevant hook" },
        { name: "Qualification", maxPoints: 25, description: "Confirms homeownership, roof age, electric bill, credit" },
        { name: "Value Proposition", maxPoints: 20, description: "Clearly explains savings and incentives" },
        { name: "Objection Handling", maxPoints: 20, description: "Handles objections around cost, roof, timing" },
        { name: "Appointment Close", maxPoints: 15, description: "Secures a firm appointment with date/time" },
      ],
    },
  ],
  outcomeTypes: ["Appointment Set", "Proposal Sent", "Contract Signed", "Not Interested", "Not Qualified", "Voicemail"],
  kpiFunnelStages: ["Doors Knocked", "Contacts Made", "Appointments Set", "Proposals Sent", "Contracts Signed", "Installs Completed"],
  algorithmDefaults: {
    inventorySort: { newLeadWeight: 100, staleContactWeight: 75, appointmentTodayWeight: 95 },
    buyerMatch: {},
    taskSort: { urgentCallbackWeight: 100, appointmentPrepWeight: 90, followUpWeight: 70 },
  },
  roleplayPersonas: SOLAR_PERSONAS,
  trainingCategories: SOLAR_TRAINING_CATEGORIES,
  gradingPhilosophy: SOLAR_GRADING_PHILOSOPHY,
};

// ─── INSURANCE ───────────────────────────────────────────────────────────────

const INSURANCE_PERSONAS: RoleplayPersona[] = [
  {
    id: "ins-budget-skeptic",
    name: "Budget-Conscious Bill",
    description: "A price-sensitive prospect who has been shopping rates online and assumes all insurance agents are just trying to upsell him",
    role: "agent",
    difficulty: "intermediate",
    personality: "Blunt and transactional. Opens with 'just give me the cheapest option.' Doesn't want to be educated — just wants a number. Softens when the agent acknowledges his budget concern before pivoting to coverage gaps.",
    scenario: "Currently paying $1,800/year for auto + renters. Just moved to a new apartment and is shopping for a bundle. Has two speeding tickets in the last 3 years he hasn't disclosed yet.",
    objections: [
      "I just want the cheapest policy you have",
      "I can get it cheaper online",
      "I don't need all those extras",
      "Why do you need all this information just to give me a quote?",
    ],
  },
  {
    id: "ins-renewal-loyal",
    name: "Loyal Linda",
    description: "A long-term customer at annual renewal who got a competitor's quote that's 15% cheaper and is considering switching",
    role: "agent",
    difficulty: "intermediate",
    personality: "Polite but conflicted. Has been with the agency 8 years and doesn't want to leave, but feels like she's being taken for granted. Responds strongly to being recognized for her loyalty and having the value explained specifically.",
    scenario: "Home + auto bundle, pays $3,200/year. Got a Geico quote for $2,720. Claims history is clean. No major life changes. Her concern is purely price.",
    objections: [
      "I've been with you for 8 years and my rates keep going up",
      "Geico quoted me $500 less for the same coverage",
      "Can you match that price?",
      "I don't want to go through the hassle of switching but I have to think about my budget",
    ],
  },
  {
    id: "ins-first-time-buyer",
    name: "First-Timer Felix",
    description: "A 24-year-old renter buying insurance for the first time who doesn't understand basic insurance concepts",
    role: "csr",
    difficulty: "beginner",
    personality: "Friendly and open but overwhelmed by jargon. Doesn't know the difference between liability and comprehensive. Will agree to whatever sounds good without really understanding it — the rep's job is to slow down and educate, not just sell.",
    scenario: "Just signed his first apartment lease. Landlord requires renters insurance. Has a new car he financed — dealership mentioned he needs full coverage but he doesn't know what that means.",
    objections: [
      "I'm not sure what I actually need",
      "Can you just tell me what most people my age get?",
      "Is all of this really necessary?",
      "My friend said renters insurance is a waste of money",
    ],
  },
  {
    id: "ins-claims-follow-up",
    name: "Frustrated Fiona",
    description: "A client calling in 3 weeks after filing a claim who hasn't heard any updates and is ready to escalate",
    role: "csr",
    difficulty: "advanced",
    personality: "Visibly frustrated but trying to stay civil. Has called twice before and been given vague timelines. She's organized — has dates, names, and notes from previous calls and will reference them. Will escalate to supervisor if she doesn't get a specific resolution path.",
    scenario: "Filed a water damage claim on her kitchen 3 weeks ago. Adjuster visited once and hasn't called back. She's been staying with her mother and needs a timeline so she can plan. Claim amount is approximately $18,000.",
    objections: [
      "I've called twice and no one can give me a straight answer",
      "This is unacceptable — I'm paying thousands a year for this coverage",
      "I need to know exactly when I'll hear back — not 'as soon as possible'",
      "I'm going to leave a review if this isn't resolved today",
    ],
  },
];

const INSURANCE_TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    code: "ins-prospecting",
    name: "Prospecting and Cold Calls",
    description: "How to open cold calls compliantly, earn the conversation, and set discovery appointments",
    order: 0,
  },
  {
    code: "ins-needs-discovery",
    name: "Needs Discovery",
    description: "Uncovering life events, coverage gaps, and household changes that create real insurance needs",
    order: 1,
  },
  {
    code: "ins-compliance-language",
    name: "Compliance Language",
    description: "Required disclosures, state-specific language rules, and how to document conversations correctly",
    order: 2,
  },
  {
    code: "ins-objection-handling",
    name: "Objection Handling",
    description: "How to respond to price objections, loyalty objections, and 'I'll think about it' without pressure tactics",
    order: 3,
  },
  {
    code: "ins-cross-selling",
    name: "Cross-Selling and Upsells",
    description: "Identifying natural bundle opportunities, presenting umbrella policies, and asking for referrals after a sale",
    order: 4,
  },
];

const INSURANCE_GRADING_PHILOSOPHY: GradingPhilosophy = {
  overview:
    "Insurance calls are graded on compliance, discovery depth, and appropriate next-step commitment. The best agents protect clients from coverage gaps they didn't know they had — not just the cheapest quote available. We reward agents who lead with needs discovery and penalize those who skip it to get to price.",
  criticalFailurePolicy:
    "Any missing required disclosure triggers an automatic critical failure and caps the score at 50%, regardless of other criteria. This is non-negotiable. Compliance failures put the agency's license at risk. Additionally: an agent who commits to a specific coverage scope or price without completing a needs assessment also triggers a critical failure.",
  talkRatioGuidance:
    "On prospecting and discovery calls, the agent should be talking no more than 45% of the time. Needs discovery requires the prospect to talk. On renewal calls and quote follow-ups, a 50/50 split is acceptable as you're explaining coverage specifics. A rep talking 65%+ on a discovery call is presenting, not discovering.",
  roleSpecific: {
    agent:
      "Grade primarily on needs discovery completeness — did the agent uncover life events, coverage gaps, and household composition? Did they present coverage in terms of protection, not just price? Closing is a distant third priority. An agent who books a quote appointment after a thorough discovery call scores higher than one who closes a thin policy immediately.",
    csr:
      "CSRs are graded on empathy, accuracy, and resolution. Did they de-escalate frustrated clients? Did they provide correct information about coverage and claims? Did they set a clear, specific next step with a timeline? Vague responses ('we'll look into it') are scored as failures on the resolution criterion.",
  },
};

export const INSURANCE_PLAYBOOK: IndustryPlaybook = {
  code: "insurance",
  name: "Insurance Sales",
  terminology: {
    contact: "Prospect", contactPlural: "Prospects",
    asset: "Policy", assetPlural: "Policies",
    deal: "Policy", dealPlural: "Policies",
    walkthrough: "Needs Assessment",
  },
  roles: [
    { code: "agent", name: "Insurance Agent", description: "Sells and services insurance policies", color: "#6366f1" },
    { code: "csr", name: "Customer Service Rep", description: "Handles inbound inquiries and policy changes", color: "#0ea5e9" },
  ],
  stages: [
    { code: "new_lead", name: "New Lead", pipeline: "sales", order: 0 },
    { code: "contacted", name: "Contacted", pipeline: "sales", order: 1 },
    { code: "needs_analysis", name: "Needs Analysis", pipeline: "sales", order: 2 },
    { code: "quote_sent", name: "Quote Sent", pipeline: "sales", order: 3 },
    { code: "application", name: "Application", pipeline: "sales", order: 4 },
    { code: "underwriting", name: "Underwriting", pipeline: "sales", order: 5 },
    { code: "policy_issued", name: "Policy Issued", pipeline: "service", order: 6 },
    { code: "dead", name: "Dead", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "cold_call", name: "Cold Call", description: "Outreach to a new prospect" },
    { code: "quote_followup", name: "Quote Follow-Up", description: "Following up after sending a quote" },
    { code: "renewal", name: "Renewal Call", description: "Annual renewal review" },
    { code: "claims_assist", name: "Claims Assist", description: "Helping a client with a claim" },
  ],
  rubrics: [
    {
      id: "ins-cold",
      name: "Insurance Cold Call",
      role: "agent",
      callType: "cold_call",
      totalPoints: 100,
      criteria: [
        { name: "Introduction", maxPoints: 15, description: "Clear intro with name and agency" },
        { name: "Needs Discovery", maxPoints: 25, description: "Uncovers current coverage gaps and life changes" },
        { name: "Value Presentation", maxPoints: 25, description: "Explains coverage benefits, not just price" },
        { name: "Objection Handling", maxPoints: 20, description: "Handles price and loyalty objections" },
        { name: "Next Step", maxPoints: 15, description: "Sets clear next step — quote, appointment, or application" },
      ],
    },
  ],
  outcomeTypes: ["Quote Requested", "Application Started", "Policy Bound", "Not Interested", "Voicemail", "Call Back Later"],
  kpiFunnelStages: ["Leads Generated", "Contacts Made", "Quotes Sent", "Applications", "Policies Issued"],
  algorithmDefaults: {
    inventorySort: { renewalWeight: 100, newLeadWeight: 85, quoteFollowUpWeight: 90 },
    buyerMatch: {},
    taskSort: { claimsPriorityWeight: 100, renewalWeight: 90, followUpWeight: 70 },
  },
  roleplayPersonas: INSURANCE_PERSONAS,
  trainingCategories: INSURANCE_TRAINING_CATEGORIES,
  gradingPhilosophy: INSURANCE_GRADING_PHILOSOPHY,
};

// ─── SAAS ─────────────────────────────────────────────────────────────────────

const SAAS_PERSONAS: RoleplayPersona[] = [
  {
    id: "saas-budget-gatekeeper",
    name: "Gatekeeper Gary (VP)",
    description: "A VP of Operations who has seen every SaaS pitch and guards access to the CFO and budget like a hawk",
    role: "sdr",
    difficulty: "advanced",
    personality: "Professional but dismissive. Has been burned by shelfware before. Responds only to specific ROI claims tied to his team's actual pain, not generic value propositions. Will give you 90 seconds before the brush-off.",
    scenario: "Running a 40-person ops team at a $50M logistics company. Currently using three disconnected tools that don't integrate. Real pain: the team spends 8 hours/week on manual reconciliation. He hasn't connected that to cost yet.",
    objections: [
      "We already have something that does that",
      "Send me an email and I'll take a look",
      "This isn't the right time — we're mid-quarter",
      "Who gave you my number?",
    ],
  },
  {
    id: "saas-skeptical-cto",
    name: "Skeptical CTO Sam",
    description: "A technical CTO who has a graveyard of failed SaaS implementations and needs to see proof before he trusts anything",
    role: "sdr",
    difficulty: "advanced",
    personality: "Technically sharp and quietly skeptical. Won't be impressed by feature lists. Asks about API architecture, uptime SLAs, and security certifications before you've even explained the product. Respects direct, technically literate reps.",
    scenario: "Series B SaaS company, 120 employees. His engineering team is 18 people. Previous platform they bought 2 years ago was abandoned after 6 months due to poor API coverage. Currently evaluating 4 vendors.",
    objections: [
      "What's your uptime SLA and how do you compensate when you miss it?",
      "Can your API handle 10,000 events per minute?",
      "We tried something like this before and it failed",
      "I don't buy anything without a proof of concept first",
    ],
  },
  {
    id: "saas-champion-discovery",
    name: "Champion Chelsea (Mid-Market AE Discovery)",
    description: "A marketing director who is the internal champion but doesn't control the budget — needs the AE to help her build a business case for the CFO",
    role: "ae",
    difficulty: "intermediate",
    personality: "Enthusiastic and collaborative. Genuinely wants the solution to work. Needs the AE to act as a consultant, not a pitcher — helping her frame the ROI in CFO-ready language. Gets nervous when the AE pressures her on timelines.",
    scenario: "Marketing director at a 300-person SaaS company. Her team has 12 people. The tool being evaluated would save 15 hours/week in manual reporting. CFO approval is required for contracts over $25K. Current deal size is $36K.",
    objections: [
      "I love this but I need to get CFO buy-in — can you help me make the case?",
      "The CFO is going to ask about ROI and I need specific numbers",
      "My timeline is flexible but my CFO wants to see a pilot first",
      "Can we start smaller and expand?",
    ],
  },
  {
    id: "saas-csm-qbr",
    name: "At-Risk Account Alex (CSM QBR)",
    description: "A customer success manager running a quarterly business review with a customer who has low adoption and is quietly considering canceling",
    role: "csm",
    difficulty: "advanced",
    personality: "Polite but disengaged. Usage data shows only 3 of 12 seats are active. The champion who bought the product left the company 4 months ago. The new manager never saw the onboarding and doesn't understand the value. The CSM has to rebuild the business case from scratch without being pushy.",
    scenario: "Customer is 8 months into a 12-month contract at $48K/year. Champion departed. New manager (Sarah) joined 3 months ago and was never properly onboarded. NPS score last quarter was 5. Renewal is in 4 months.",
    objections: [
      "Honestly, we haven't really been using it much",
      "The person who bought this is gone — I'm not sure it fits what we're doing",
      "Can you walk me through what we're actually paying for?",
      "I'm going to need to show my leadership why we should renew this",
    ],
  },
];

const SAAS_TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    code: "saas-cold-outreach",
    name: "Cold Outreach and Openers",
    description: "How to open cold calls and emails in a way that earns a real conversation — pattern interrupts, personalization, and threading pain to the opener",
    order: 0,
  },
  {
    code: "saas-discovery",
    name: "Discovery and Pain Mapping",
    description: "MEDDIC/SPIN discovery methodology — identifying Metrics, Economic Buyer, Decision criteria, and mapping pain to quantified business impact",
    order: 1,
  },
  {
    code: "saas-demo-delivery",
    name: "Demo Delivery",
    description: "How to run a pain-led demo — show only what matters to the champion, avoid feature tours, and tie every slide back to their stated pain",
    order: 2,
  },
  {
    code: "saas-objection-handling",
    name: "Objection Handling",
    description: "Frameworks for handling the top SaaS objections: budget, timing, incumbent vendor, and 'we'll build it ourselves'",
    order: 3,
  },
  {
    code: "saas-negotiation",
    name: "Negotiation and Close",
    description: "How to negotiate SaaS contracts without discounting on price — trading value, structuring multi-year deals, and getting clean closes",
    order: 4,
  },
];

const SAAS_GRADING_PHILOSOPHY: GradingPhilosophy = {
  overview:
    "SaaS sales calls are graded on MEDDIC-inspired discovery and consultative approach. The best reps don't pitch — they diagnose. We reward calls where the rep identified at least two specific, quantifiable pain points and connected them to the prospect's economic reality. Closing ability is graded, but it's never worth more than discovery quality.",
  criticalFailurePolicy:
    "Critical failure triggers an automatic cap of 50% on the call score. Critical failure conditions: rep presents a product demo or shares pricing before completing a discovery of at least 2 specific pain points; rep cannot identify the Economic Buyer by the end of a discovery call; rep agrees to send a proposal without confirming next steps and a specific follow-up date.",
  talkRatioGuidance:
    "SDR cold calls: rep should talk no more than 50% (get to the question fast). AE discovery calls: rep should talk no more than 40% — if you're talking more, you're pitching, not discovering. Demo calls: up to 60% rep talk is acceptable since you're demonstrating. Negotiation calls: 50/50 is ideal — listen as much as you talk.",
  roleSpecific: {
    sdr:
      "Grade on opener quality (did it earn the conversation?), qualification efficiency (did they confirm ICP fit within 5 minutes?), pain surface (did they get the prospect to name at least one specific problem?), and meeting commitment (specific date/time secured with the right attendees). An SDR who books a demo with a non-decision-maker scores no higher than a C.",
    ae:
      "Grade on discovery depth (MEDDIC coverage), pain quantification (did the prospect give numbers?), demo alignment (did the demo show only relevant features?), and close quality (mutual action plan established?). An AE who gives a beautiful demo to a prospect who hasn't shared measurable pain is wasting pipeline.",
    csm:
      "Grade on retention risk identification, adoption gap analysis, re-onboarding effectiveness, and renewal path clarity. A CSM who leaves a QBR without a documented success plan and a renewal timeline is failing their book of business, regardless of how pleasant the call was.",
  },
};

export const SAAS_PLAYBOOK: IndustryPlaybook = {
  code: "saas",
  name: "SaaS Sales",
  terminology: {
    contact: "Lead", contactPlural: "Leads",
    asset: "Account", assetPlural: "Accounts",
    deal: "Opportunity", dealPlural: "Opportunities",
    walkthrough: "Demo",
  },
  roles: [
    { code: "sdr", name: "SDR", description: "Qualifies leads and books demos", color: "#0ea5e9" },
    { code: "ae", name: "Account Executive", description: "Runs demos and closes deals", color: "#6366f1" },
    { code: "csm", name: "Customer Success Manager", description: "Onboards and retains customers", color: "#10b981" },
  ],
  stages: [
    { code: "mql", name: "MQL", pipeline: "sales", order: 0 },
    { code: "sql", name: "SQL", pipeline: "sales", order: 1 },
    { code: "demo_scheduled", name: "Demo Scheduled", pipeline: "sales", order: 2 },
    { code: "demo_completed", name: "Demo Completed", pipeline: "sales", order: 3 },
    { code: "proposal", name: "Proposal", pipeline: "sales", order: 4 },
    { code: "negotiation", name: "Negotiation", pipeline: "sales", order: 5 },
    { code: "closed_won", name: "Closed Won", pipeline: "sales", order: 6 },
    { code: "closed_lost", name: "Closed Lost", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "discovery", name: "Discovery Call", description: "Initial qualification and needs assessment" },
    { code: "demo", name: "Demo", description: "Product demonstration" },
    { code: "follow_up", name: "Follow Up", description: "Post-demo nurture" },
    { code: "negotiation", name: "Negotiation Call", description: "Pricing and terms discussion" },
  ],
  rubrics: [
    {
      id: "saas-discovery",
      name: "SaaS Discovery Call",
      role: "sdr",
      callType: "discovery",
      totalPoints: 100,
      criteria: [
        { name: "Agenda Setting", maxPoints: 10, description: "Sets clear agenda for the call" },
        { name: "Pain Discovery", maxPoints: 30, description: "Uncovers 2-3 specific pain points" },
        { name: "Budget & Authority", maxPoints: 20, description: "Identifies decision maker and budget range" },
        { name: "Timeline", maxPoints: 15, description: "Establishes buying timeline and urgency" },
        { name: "Next Step", maxPoints: 15, description: "Secures demo or meeting with decision maker" },
        { name: "Professionalism", maxPoints: 10, description: "Maintains consultative, not pushy, approach" },
      ],
    },
  ],
  outcomeTypes: ["Demo Booked", "Qualified Out", "Proposal Sent", "Closed Won", "Closed Lost", "Voicemail", "No Show"],
  kpiFunnelStages: ["Leads", "SQLs", "Demos", "Proposals", "Closed Won"],
  algorithmDefaults: {
    inventorySort: { demoTodayWeight: 100, proposalFollowUpWeight: 90, newMqlWeight: 70 },
    buyerMatch: {},
    taskSort: { demoFollowUpWeight: 100, proposalWeight: 90, coldOutreachWeight: 50 },
  },
  roleplayPersonas: SAAS_PERSONAS,
  trainingCategories: SAAS_TRAINING_CATEGORIES,
  gradingPhilosophy: SAAS_GRADING_PHILOSOPHY,
};

// ─── HOME SERVICES ────────────────────────────────────────────────────────────

const HOME_SERVICES_PERSONAS: RoleplayPersona[] = [
  {
    id: "hs-urgent-hvac",
    name: "Urgent Urgency Ursula",
    description: "A homeowner calling in a panic because her HVAC went out on a 95-degree day with kids at home",
    role: "csr",
    difficulty: "beginner",
    personality: "Stressed and emotional. Needs reassurance immediately before she can process any information. Will escalate quickly if the CSR doesn't convey urgency and empathy in the first 20 seconds. Once reassured, becomes a very easy booking.",
    scenario: "AC went out at 2pm. Two kids under 8 at home. She's been on hold with another company for 30 minutes. Just hung up and is calling you. The job is yours to lose — she needs someone fast.",
    objections: [
      "How soon can someone actually come out?",
      "The last company I called said they can't come until tomorrow",
      "Do you have emergency service?",
      "What's this going to cost me?",
    ],
  },
  {
    id: "hs-price-shopper",
    name: "Price-Shopper Pete",
    description: "A homeowner who is calling his third roofing company of the day and is using price as his only criterion",
    role: "csr",
    difficulty: "intermediate",
    personality: "Methodical and transactional. Has a spreadsheet. Names the other companies he's called. Wants a price on the phone before he'll agree to an estimate. The CSR's challenge is to reframe around value and certainty of estimate without giving a number over the phone.",
    scenario: "Needs a roof replacement. Storm damage. Already has one estimate at $14,200 from a competitor. Calling to get a second and third opinion on price. Will book the estimate if the CSR can position the company's value without anchoring on price.",
    objections: [
      "I already have an estimate for $14,200 — can you beat that?",
      "Just give me a ballpark number over the phone",
      "Why do I need someone to come out just to give me a price?",
      "I don't want to waste your tech's time if you're going to be more expensive",
    ],
  },
  {
    id: "hs-loyal-addon",
    name: "Loyal Larry",
    description: "A repeat customer calling to schedule his annual HVAC tune-up who is open to hearing about add-on services if approached naturally",
    role: "csr",
    difficulty: "beginner",
    personality: "Warm and trusting. Has used the company three times. Calls by the company name, not by what he needs. Responds enthusiastically to being recognized as a returning customer. Very open to upsell suggestions if they feel like genuine recommendations, not sales pitches.",
    scenario: "Third-year customer. Just wants to book his annual tune-up. His unit is 9 years old. The company offers a maintenance plan that would save him about $180/year and cover emergency dispatch fees. He doesn't know the plan exists.",
    objections: [
      "I'm just looking to get the tune-up scheduled",
      "Is the maintenance plan really worth it?",
      "I've been meaning to ask about a smart thermostat — is that something you do?",
      "I don't want to be locked into anything long-term",
    ],
  },
  {
    id: "hs-difficult-bad-experience",
    name: "Burned Barbara",
    description: "A caller who had a bad experience with a technician last visit — he was rude, left the job site messy, and the problem wasn't fully fixed",
    role: "csr",
    difficulty: "advanced",
    personality: "Angry but articulate. Not yelling — controlled, deliberate anger. Has written down what happened. Wants acknowledgment, accountability, and a clear remediation plan. Will threaten a negative review but is actually looking for a reason to stay if the CSR handles it right.",
    scenario: "Had a plumbing repair 3 weeks ago. Tech was dismissive. Left pipe tape on the floor. The issue recurred within 10 days. She called the office and was put on hold for 20 minutes. Now she's back for a resolution.",
    objections: [
      "Your technician was rude and left my house a mess",
      "I called 10 days ago and nobody called me back",
      "I want to know exactly what you're going to do to fix this",
      "I'm going to leave a Google review if this doesn't get resolved today",
    ],
  },
];

const HOME_SERVICES_TRAINING_CATEGORIES: TrainingCategory[] = [
  {
    code: "hs-inbound-booking",
    name: "Inbound Call Booking",
    description: "How to convert every inbound call into a booked estimate — speed to empathy, needs assessment, and calendar commitment",
    order: 0,
  },
  {
    code: "hs-pricing-confidence",
    name: "Pricing Confidence",
    description: "How to handle price questions on the phone without giving a number — and why giving a price kills the booking rate",
    order: 1,
  },
  {
    code: "hs-objection-handling",
    name: "Objection Handling",
    description: "How to handle the top home services objections: 'I'm just price shopping,' 'I need to talk to my spouse,' and 'I want to wait'",
    order: 2,
  },
  {
    code: "hs-upselling",
    name: "Upselling and Add-Ons",
    description: "How to naturally introduce service plans, add-ons, and bundled services without sounding salesy — timing and language",
    order: 3,
  },
  {
    code: "hs-customer-satisfaction",
    name: "Customer Satisfaction",
    description: "De-escalation techniques, handling complaints, recovery calls, and converting angry customers into loyal ones",
    order: 4,
  },
];

const HOME_SERVICES_GRADING_PHILOSOPHY: GradingPhilosophy = {
  overview:
    "Home services calls are graded primarily on booking rate and booking quality. Every inbound call is a warm lead — the customer already has a problem and is asking for help. Our job is to remove friction, build confidence, and book the estimate. We grade on whether the CSR did their job: book it, confirm it, and set the right expectations.",
  criticalFailurePolicy:
    "Critical failure triggers an automatic cap of 50% on the call score. Critical failure conditions: CSR gives a specific price estimate over the phone before booking an estimate visit; CSR allows a caller to hang up without making a booking attempt; CSR fails to capture the customer's name and phone number on an inbound call. Giving a price over the phone is the most critical failure — it anchors the customer before your tech can assess the actual job and kills the close rate.",
  talkRatioGuidance:
    "Inbound calls should be CSR-led but not CSR-dominated. Target 50-60% CSR talk time — enough to guide the call and instill confidence, but not so much that the customer can't describe their problem. The first 30 seconds should be almost entirely the customer describing their issue while the CSR listens and empathizes.",
  roleSpecific: {
    csr:
      "Grade primarily on booking outcome and booking quality. Did they book an estimate? Did they confirm date, time, and the address? Did they set expectations on what the tech will do? Secondary grade on empathy, professionalism, and upsell attempts (where appropriate). A CSR who books an estimate with incomplete information scores lower than one who spends an extra minute confirming details.",
    estimator:
      "Grade on on-site professionalism (as described by follow-up reviews or recorded interactions), estimate accuracy, close technique, and handling of price objections. An estimator who runs a beautiful visit but doesn't ask for the job scores no higher than a C.",
    tech:
      "Technicians are graded on customer communication during the job, explanation of work completed, and up-sell/add-on conversation quality. A tech who finishes the job and leaves without asking if the customer has any questions or additional needs is leaving money on the table.",
  },
};

export const HOME_SERVICES_PLAYBOOK: IndustryPlaybook = {
  code: "home-services",
  name: "Home Services",
  terminology: {
    contact: "Customer", contactPlural: "Customers",
    asset: "Job", assetPlural: "Jobs",
    deal: "Job", dealPlural: "Jobs",
    walkthrough: "Estimate Visit",
  },
  roles: [
    { code: "csr", name: "CSR", description: "Handles inbound calls and books estimates", color: "#0ea5e9" },
    { code: "estimator", name: "Estimator", description: "Runs on-site estimates and closes jobs", color: "#6366f1" },
    { code: "tech", name: "Technician", description: "Executes the work on-site", color: "#10b981" },
  ],
  stages: [
    { code: "new_lead", name: "New Lead", pipeline: "sales", order: 0 },
    { code: "estimate_scheduled", name: "Estimate Scheduled", pipeline: "sales", order: 1 },
    { code: "estimate_given", name: "Estimate Given", pipeline: "sales", order: 2 },
    { code: "job_sold", name: "Job Sold", pipeline: "production", order: 3 },
    { code: "scheduled", name: "Scheduled", pipeline: "production", order: 4 },
    { code: "in_progress", name: "In Progress", pipeline: "production", order: 5 },
    { code: "completed", name: "Completed", pipeline: "production", order: 6 },
    { code: "dead", name: "Dead", pipeline: "sales", order: 99 },
  ],
  callTypes: [
    { code: "inbound", name: "Inbound Call", description: "Customer calls in for service" },
    { code: "estimate_follow_up", name: "Estimate Follow-Up", description: "Following up after an estimate" },
    { code: "scheduling", name: "Scheduling Call", description: "Scheduling or rescheduling work" },
  ],
  rubrics: [
    {
      id: "hs-inbound",
      name: "Home Services Inbound",
      role: "csr",
      callType: "inbound",
      totalPoints: 100,
      criteria: [
        { name: "Greeting & Energy", maxPoints: 15, description: "Answers with enthusiasm and professionalism" },
        { name: "Needs Assessment", maxPoints: 25, description: "Understands the customer's problem and urgency" },
        { name: "Service Explanation", maxPoints: 20, description: "Explains what they do and how it works" },
        { name: "Pricing Confidence", maxPoints: 15, description: "Handles pricing questions with confidence" },
        { name: "Booking", maxPoints: 25, description: "Books the estimate or service visit" },
      ],
    },
  ],
  outcomeTypes: ["Estimate Booked", "Job Sold", "Follow-Up Set", "Not Interested", "Voicemail", "Wrong Number"],
  kpiFunnelStages: ["Inbound Calls", "Estimates Booked", "Estimates Run", "Jobs Sold", "Jobs Completed"],
  algorithmDefaults: {
    inventorySort: { urgentServiceWeight: 100, estimateFollowUpWeight: 90, newLeadWeight: 75 },
    buyerMatch: {},
    taskSort: { urgentServiceWeight: 100, estimateFollowUpWeight: 90, schedulingWeight: 70 },
  },
  roleplayPersonas: HOME_SERVICES_PERSONAS,
  trainingCategories: HOME_SERVICES_TRAINING_CATEGORIES,
  gradingPhilosophy: HOME_SERVICES_GRADING_PHILOSOPHY,
};

export const ALL_INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  RE_WHOLESALING_PLAYBOOK,
  SOLAR_PLAYBOOK,
  INSURANCE_PLAYBOOK,
  SAAS_PLAYBOOK,
  HOME_SERVICES_PLAYBOOK,
];
