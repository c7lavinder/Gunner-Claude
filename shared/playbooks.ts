/**
 * 3-Tier Playbook System
 * 
 * Layer 1: SOFTWARE PLAYBOOK (High Floor)
 *   Universal call coaching fundamentals that work for ANY industry.
 *   Built into the grading engine as defaults.
 * 
 * Layer 2: INDUSTRY PLAYBOOK (Higher Floor)
 *   Pre-built templates for specific industries (e.g., Real Estate Wholesaling).
 *   Provides roles, call types, rubrics, terminology, and KPI labels.
 *   Seeded into tenant_roles, tenant_rubrics, tenant_call_types on tenant creation.
 * 
 * Layer 3: TENANT PLAYBOOK (High Ceiling)
 *   Per-tenant customizations on top of the industry playbook.
 *   Tenant admins can rename roles, adjust rubric weights, change terminology.
 *   Stored in tenant_roles, tenant_rubrics, tenant_call_types, and tenants.settings.
 */

// ============ TYPES ============

export interface PlaybookRoleDef {
  name: string;
  code: string;
  description: string;
  /** Maps to the legacy teamRole enum for backward compatibility */
  legacyRole: "lead_manager" | "acquisition_manager" | "lead_generator" | "admin";
}

export interface PlaybookCriterion {
  name: string;
  maxPoints: number;
  description: string;
  keyPhrases: string[];
}

export interface PlaybookRubricDef {
  name: string;
  description: string;
  /** Maps to the legacy callType for grading engine compatibility */
  callType: "cold_call" | "qualification" | "follow_up" | "offer" | "seller_callback" | "admin_callback";
  criteria: PlaybookCriterion[];
  redFlags: string[];
  criticalFailures?: string[];
  criticalFailureCap?: number;
  talkRatioTarget?: number;
}

export interface PlaybookCallTypeDef {
  name: string;
  code: string;
  description: string;
  /** Which rubric to use (by code/callType) */
  rubricCallType: string;
}

export interface PlaybookOutcomeDef {
  code: string;
  label: string;
  description: string;
}

export interface PlaybookKpiDef {
  code: string;
  label: string;
  description: string;
}

export interface PlaybookTerminology {
  /** What to call the people being contacted (e.g., "Sellers", "Investors", "Prospects") */
  contactLabel: string;
  contactLabelPlural: string;
  /** What to call deals/opportunities */
  dealLabel: string;
  dealLabelPlural: string;
  /** What to call the property/asset/product */
  assetLabel: string;
  assetLabelPlural: string;
  /** Custom role display names (overrides role.name if set) */
  roleLabels?: Record<string, string>;
  /** Custom call type display names */
  callTypeLabels?: Record<string, string>;
  /** Custom outcome display names */
  outcomeLabels?: Record<string, string>;
  /** Custom KPI display names */
  kpiLabels?: Record<string, string>;
}

export interface IndustryPlaybook {
  code: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  roles: PlaybookRoleDef[];
  rubrics: PlaybookRubricDef[];
  callTypes: PlaybookCallTypeDef[];
  outcomes: PlaybookOutcomeDef[];
  kpis: PlaybookKpiDef[];
  terminology: PlaybookTerminology;
  /** Industry string passed to LLM prompts */
  industryPrompt: string;
}

// ============ SOFTWARE PLAYBOOK (Layer 1) ============
// Universal criteria that apply to ANY call in ANY industry

export const SOFTWARE_PLAYBOOK_CRITERIA: PlaybookCriterion[] = [
  {
    name: "Introduction & Rapport",
    maxPoints: 10,
    description: "Professional greeting, verified correct person, established rapport",
    keyPhrases: [],
  },
  {
    name: "Active Listening",
    maxPoints: 15,
    description: "Demonstrated active listening through paraphrasing, asking follow-up questions, and acknowledging the other party's concerns",
    keyPhrases: [],
  },
  {
    name: "Objection Handling",
    maxPoints: 15,
    description: "Addressed objections appropriately, used empathy, didn't get defensive",
    keyPhrases: [],
  },
  {
    name: "Tonality & Professionalism",
    maxPoints: 10,
    description: "Appropriate tone, pace, and professional bearing throughout the call",
    keyPhrases: [],
  },
  {
    name: "Clear Next Steps",
    maxPoints: 10,
    description: "Established clear, specific next steps with timeline before ending the call",
    keyPhrases: [],
  },
];

export const SOFTWARE_PLAYBOOK_RED_FLAGS: string[] = [
  "Getting defensive with objections",
  "Talking over the other party",
  "No clear next steps established",
  "Unprofessional language or tone",
  "Rushing through the conversation",
];

// ============ INDUSTRY PLAYBOOKS (Layer 2) ============

export const REAL_ESTATE_WHOLESALING_PLAYBOOK: IndustryPlaybook = {
  code: "real_estate_wholesaling",
  name: "Real Estate Wholesaling",
  description: "For real estate wholesaling and flipping teams. Includes roles for lead generation, qualification, and acquisition with industry-specific rubrics.",
  icon: "Building2",
  industryPrompt: "real estate wholesaling/investing",

  roles: [
    {
      name: "Lead Generator",
      code: "lead_generator",
      description: "Makes cold calls to homeowners to identify motivated sellers and generate leads for the team.",
      legacyRole: "lead_generator",
    },
    {
      name: "Lead Manager",
      code: "lead_manager",
      description: "Qualifies leads through diagnosis calls, extracts motivation, discusses price, and sets appointments for walkthroughs.",
      legacyRole: "lead_manager",
    },
    {
      name: "Acquisition Manager",
      code: "acquisition_manager",
      description: "Presents offers, negotiates deals, and closes contracts with motivated sellers.",
      legacyRole: "acquisition_manager",
    },
  ],

  callTypes: [
    {
      name: "Cold Call",
      code: "cold_call",
      description: "First contact with a homeowner to gauge interest in selling",
      rubricCallType: "cold_call",
    },
    {
      name: "Qualification Call",
      code: "qualification",
      description: "Qualifying a lead — extracting motivation, discussing price, setting appointments",
      rubricCallType: "qualification",
    },
    {
      name: "Offer Call",
      code: "offer",
      description: "Presenting an offer, negotiating price/terms, closing the deal",
      rubricCallType: "offer",
    },
    {
      name: "Follow-Up Call",
      code: "follow_up",
      description: "Re-engaging a known lead after a previous offer was discussed",
      rubricCallType: "follow_up",
    },
    {
      name: "Seller Callback",
      code: "seller_callback",
      description: "Inbound call where the seller called back — high-intent signal",
      rubricCallType: "seller_callback",
    },
    {
      name: "Admin Callback",
      code: "admin_callback",
      description: "Operational call about documents, scheduling, closing details",
      rubricCallType: "admin_callback",
    },
  ],

  rubrics: [
    {
      name: "Lead Generator Cold Call Rubric",
      description: "For Lead Generators — Cold calling to generate seller interest and identify motivated sellers.",
      callType: "cold_call",
      criteria: [
        { name: "Introduction & Permission", maxPoints: 15, description: "Professional greeting, stated name and company, asked permission to continue", keyPhrases: ["My name is", "calling from", "Do you have a quick minute?"] },
        { name: "Interest Discovery", maxPoints: 25, description: "Asked if the homeowner has any interest in selling, gauged motivation level", keyPhrases: ["interested in selling", "thought about selling", "open to an offer"] },
        { name: "Building Rapport", maxPoints: 20, description: "Built a connection, showed genuine interest, kept conversation natural", keyPhrases: ["How long have you lived there?", "Tell me about", "That makes sense"] },
        { name: "Objection Handling", maxPoints: 15, description: "Addressed concerns appropriately, didn't get defensive", keyPhrases: ["I understand", "That makes sense", "No pressure at all"] },
        { name: "Warm Transfer / Handoff Setup", maxPoints: 15, description: "Set up the lead for a follow-up call with a manager", keyPhrases: ["my manager will follow up", "someone from our team will call"] },
        { name: "Professional Tone", maxPoints: 10, description: "Friendly but professional, not pushy, good pacing", keyPhrases: [] },
      ],
      redFlags: [
        "Talking too fast or rushing",
        "Being pushy or aggressive",
        "Not asking permission to continue",
        "Skipping interest discovery questions",
        "Trying to set appointments instead of generating interest",
        "Getting defensive with objections",
        "Not mentioning Lead Manager follow-up",
      ],
    },
    {
      name: "Lead Manager Qualification Call Rubric",
      description: "For Lead Managers — Qualification/Diagnosis calls. Qualify leads, extract motivation, discuss price, set appointments.",
      callType: "qualification",
      criteria: [
        { name: "Introduction & Rapport", maxPoints: 10, description: "Proper introduction, verified correct person, confirmed good time", keyPhrases: ["Is this a good time for a 5-10 minute conversation?"] },
        { name: "Setting Expectations", maxPoints: 10, description: "Set expectations for the call structure or conversational framing", keyPhrases: ["Let me explain what this call will look like", "see if we can help"] },
        { name: "Property Condition", maxPoints: 10, description: "Gathered beds/baths, property condition, confirmed or updated previous info", keyPhrases: ["number of bedrooms", "condition of the property"] },
        { name: "Roadblock Identification", maxPoints: 10, description: "Identified decision makers, timeline, other obstacles", keyPhrases: ["other decision makers", "within 30 days"] },
        { name: "Motivation Extraction", maxPoints: 20, description: "MOST IMPORTANT — Identified true motivation, asked follow-up questions, pulled emotional pain points", keyPhrases: ["Why do you want to sell?", "How long has that been going on?", "Can you tell me more?"] },
        { name: "Price Discussion", maxPoints: 15, description: "Did NOT give price first, got seller's price, used price anchor", keyPhrases: ["What were you hoping I would at least say?", "other investors are paying around"] },
        { name: "Tonality & Empathy", maxPoints: 10, description: "Matched seller's pace/tone, soft tone during motivation, genuine empathy", keyPhrases: [] },
        { name: "Objection Handling", maxPoints: 10, description: "Addressed objections appropriately, used third party stories", keyPhrases: ["I had a seller just like you"] },
        { name: "Call Outcome", maxPoints: 5, description: "Appropriate disqualification or proper appointment setting, clear next steps", keyPhrases: ["schedule a walkthrough", "within 48 hours"] },
      ],
      redFlags: [
        "Giving price before seller",
        "Not price anchoring",
        "Rushing through motivation",
        "Not asking follow-up questions",
        "Getting defensive with angry sellers",
        "Not confirming all decision makers",
        "Not setting any expectations or frame for the call",
        "Seller offered a timeline but agent left conversation open-ended without locking in a follow-up date",
      ],
    },
    {
      name: "Acquisition Manager Offer Call Rubric",
      description: "For Acquisition Managers — Offer/Closing calls.",
      callType: "offer",
      criteria: [
        { name: "Intro & Confirmation", maxPoints: 10, description: "Confirmed scheduled time works, professional greeting", keyPhrases: ["Is this still a good time?"] },
        { name: "Setting the Stage", maxPoints: 10, description: "Explained what happens if they move forward, confirmed email review capability", keyPhrases: ["Let me explain what happens next"] },
        { name: "Roadblock Confirmation", maxPoints: 15, description: "Confirmed all decision makers present, asked 'In a perfect world' question", keyPhrases: ["all decision makers present", "In a perfect world"] },
        { name: "Motivation Restatement", maxPoints: 20, description: "Revisited their motivation, used empathy phrases, mirrored their words", keyPhrases: ["How long has that been going on?", "Seems like", "Feels like"] },
        { name: "Offer Setup", maxPoints: 15, description: "Reminded of benefits: no closing costs, no commissions, as-is, no repairs", keyPhrases: ["no closing costs", "no commissions", "as-is condition"] },
        { name: "Price Delivery", maxPoints: 15, description: "Gave specific number, stated it's what they walk away with, confident delivery", keyPhrases: ["walk away with", "in your pocket"] },
        { name: "Tonality & Confidence", maxPoints: 10, description: "Confident but empathetic tone, professional bearing", keyPhrases: [] },
        { name: "Closing Technique", maxPoints: 5, description: "Asked for commitment, handled final objections, clear next steps", keyPhrases: ["confident yes or no", "What questions do you have?"] },
      ],
      redFlags: [
        "Not confirming all decision makers",
        "Skipping motivation restatement",
        "Rushing to the price",
        "Not explaining benefits before price",
        "Weak or uncertain price delivery",
        "Not asking for commitment",
        "Getting defensive on objections",
      ],
    },
    {
      name: "Follow-Up Call Rubric",
      description: "For re-engagement calls where the lead went cold or needs nurturing. Full qualification already happened.",
      callType: "follow_up",
      criteria: [
        { name: "Referenced Previous Conversation & Property", maxPoints: 10, description: "Mentioned date of last call, address, what was discussed", keyPhrases: ["last time we spoke", "your property at"] },
        { name: "Anchored the Previous Offer", maxPoints: 15, description: "Led with the previous offer amount — most reps skip this", keyPhrases: ["put an offer", "we offered", "our offer of"] },
        { name: "Re-confirmed Decision Maker", maxPoints: 10, description: "Checked if decision maker situation has changed", keyPhrases: ["still just you", "anyone else involved"] },
        { name: "Re-qualified Motivation/Timeline", maxPoints: 15, description: "Checked for shifts in motivation or timeline", keyPhrases: ["you mentioned", "still the situation", "has anything changed"] },
        { name: "Surfaced Roadblocks", maxPoints: 15, description: "Asked what's been holding them back, then PAUSED", keyPhrases: ["holding you back", "what's been stopping"] },
        { name: "Pushed for a Decision", maxPoints: 20, description: "The reality check close — asked for a binary decision", keyPhrases: ["yes or no", "where do you stand", "are you ready"] },
        { name: "Handled Objection / Set Concrete Next Step", maxPoints: 15, description: "If no → 'What would need to change?' Must be specific.", keyPhrases: ["what would need to change", "specific date"] },
      ],
      redFlags: [
        "Never referenced the previous offer amount",
        "Never asked for a decision",
        "Talked through the seller's silence after the roadblock question",
        "Didn't identify/confirm who the decision maker is",
        "Ran a full qualification script instead of a targeted follow-up",
        "No concrete next step set",
        "Seller offered a timeline but agent left conversation open-ended",
      ],
      criticalFailures: [
        "Never referenced the previous offer amount",
        "Never asked for a decision",
        "Talked through the seller's silence after the roadblock question",
        "Didn't identify/confirm who the decision maker is",
      ],
      criticalFailureCap: 50,
      talkRatioTarget: 50,
    },
    {
      name: "Seller Callback Rubric",
      description: "For inbound calls where the seller called YOU back. High-intent signal.",
      callType: "seller_callback",
      criteria: [
        { name: "Acknowledged They Called Back", maxPoints: 10, description: "Thanked them for calling back, didn't treat it like a cold call", keyPhrases: ["thanks for calling", "glad you reached out"] },
        { name: "Asked What Prompted the Callback", maxPoints: 15, description: "Revealed their current headspace", keyPhrases: ["what made you", "what prompted", "what can I help with"] },
        { name: "Matched Energy to Their Intent", maxPoints: 10, description: "If ready to go, didn't slow them down. If questions, answered them.", keyPhrases: [] },
        { name: "Filled Gaps in Info", maxPoints: 15, description: "Got missing property details, timeline, price expectations without interrogating", keyPhrases: ["can you tell me about", "timeline", "price"] },
        { name: "Moved Toward Commitment", maxPoints: 20, description: "Appointment, offer, walkthrough, contract. Momentum is there.", keyPhrases: ["schedule", "walkthrough", "offer", "next step"] },
        { name: "Handled Their Specific Questions/Concerns", maxPoints: 15, description: "Addressed what they called about directly", keyPhrases: [] },
        { name: "Set Firm Next Step with Timeline", maxPoints: 10, description: "Not 'we'll be in touch.' A date, a time, a specific action.", keyPhrases: ["specific date", "tomorrow at", "this week"] },
        { name: "Talk Ratio — Seller Talks More", maxPoints: 5, description: "They called for a reason. Let them tell you what it is.", keyPhrases: [] },
      ],
      redFlags: [
        "Ran a full cold call script on someone who called back",
        "Didn't ask why they're calling",
        "Let them hang up without a next step",
        "Talked over the seller",
        "Missed the seller's urgency signals",
        "Seller offered a timeline but agent left conversation open-ended",
      ],
      criticalFailures: [
        "Ran a full cold call script on someone who called back",
        "Didn't ask why they're calling",
        "Let them hang up without a next step",
      ],
      criticalFailureCap: 50,
      talkRatioTarget: 60,
    },
    {
      name: "Admin Callback Rubric",
      description: "For operational calls about documents, scheduling, closing details. NOT sales calls.",
      callType: "admin_callback",
      criteria: [
        { name: "Stated Purpose of Call Clearly", maxPoints: 20, description: "Got to the point quickly", keyPhrases: ["I'm calling about", "reason for my call"] },
        { name: "Got the Info/Action Needed", maxPoints: 30, description: "Did the call accomplish its objective?", keyPhrases: [] },
        { name: "Confirmed Next Step + Timeline", maxPoints: 25, description: "Clear on what happens next and when", keyPhrases: ["by Thursday", "tomorrow", "next step is"] },
        { name: "Professional Tone", maxPoints: 10, description: "Courteous, clear, not rushed or dismissive", keyPhrases: [] },
        { name: "Kept It Tight", maxPoints: 15, description: "Didn't ramble, go off-topic, or waste time", keyPhrases: [] },
      ],
      redFlags: [
        "Rambling or going off-topic",
        "Not confirming next steps",
        "Vague timeline ('soon', 'when we can')",
        "Dismissive or rushed tone",
      ],
    },
  ],

  outcomes: [
    { code: "appointment_set", label: "Appointment Set", description: "A walkthrough or meeting was scheduled with a specific date/time" },
    { code: "offer_made", label: "Offer Made", description: "A specific dollar amount was presented and the seller is considering it" },
    { code: "offer_rejected", label: "Offer Rejected", description: "A specific dollar amount was presented and the seller rejected it" },
    { code: "callback_scheduled", label: "Callback Scheduled", description: "Seller agreed to receive a call back at a specific date/time" },
    { code: "interested", label: "Interested", description: "Seller expressed interest but no firm next step was set" },
    { code: "not_interested", label: "Not Interested", description: "Seller clearly stated they are not interested in selling" },
    { code: "left_vm", label: "Left Voicemail", description: "Left a voicemail message" },
    { code: "no_answer", label: "No Answer", description: "Call went unanswered" },
    { code: "dead", label: "Dead Lead", description: "Wrong number, disconnected, or completely dead lead" },
    { code: "none", label: "No Outcome", description: "Call ended without any clear outcome" },
  ],

  kpis: [
    { code: "appointments_set", label: "Appointments Set", description: "Number of walkthroughs/meetings scheduled" },
    { code: "offers_made", label: "Offers Made", description: "Number of offers presented to sellers" },
    { code: "offers_accepted", label: "Offers Accepted", description: "Number of offers accepted by sellers" },
    { code: "calls_graded", label: "Calls Graded", description: "Total number of calls graded" },
    { code: "avg_score", label: "Average Score", description: "Average grading score across all calls" },
    { code: "conversion_rate", label: "Conversion Rate", description: "Percentage of calls resulting in positive outcomes" },
  ],

  terminology: {
    contactLabel: "Seller",
    contactLabelPlural: "Sellers",
    dealLabel: "Deal",
    dealLabelPlural: "Deals",
    assetLabel: "Property",
    assetLabelPlural: "Properties",
    roleLabels: {
      lead_generator: "Lead Generator",
      lead_manager: "Lead Manager",
      acquisition_manager: "Acquisition Manager",
    },
    callTypeLabels: {
      cold_call: "Cold Call",
      qualification: "Qualification Call",
      offer: "Offer Call",
      follow_up: "Follow-Up Call",
      seller_callback: "Seller Callback",
      admin_callback: "Admin Callback",
    },
    outcomeLabels: {
      appointment_set: "Appointment Set",
      offer_made: "Offer Made",
      offer_rejected: "Offer Rejected",
      callback_scheduled: "Callback Scheduled",
      interested: "Interested",
      not_interested: "Not Interested",
      left_vm: "Left Voicemail",
      no_answer: "No Answer",
      dead: "Dead Lead",
      none: "No Outcome",
    },
    kpiLabels: {
      appointments_set: "Appointments Set",
      offers_made: "Offers Made",
      offers_accepted: "Offers Accepted",
    },
  },
};

// ============ PLAYBOOK REGISTRY ============

export const INDUSTRY_PLAYBOOKS: Record<string, IndustryPlaybook> = {
  real_estate_wholesaling: REAL_ESTATE_WHOLESALING_PLAYBOOK,
};

/**
 * Get all available industry playbooks (for onboarding selection)
 */
export function getAvailablePlaybooks(): Array<{ code: string; name: string; description: string; icon: string }> {
  return Object.values(INDUSTRY_PLAYBOOKS).map(p => ({
    code: p.code,
    name: p.name,
    description: p.description,
    icon: p.icon,
  }));
}

/**
 * Get a specific industry playbook by code
 */
export function getPlaybookByCode(code: string): IndustryPlaybook | null {
  return INDUSTRY_PLAYBOOKS[code] || null;
}

// ============ TENANT SETTINGS TYPES ============

/**
 * Structure stored in tenants.settings JSON field
 * This is the Layer 3 (Tenant Playbook) configuration
 */
export interface TenantPlaybookSettings {
  /** Which industry playbook was used as the base template */
  industryPlaybook?: string;
  /** Custom terminology overrides */
  terminology?: Partial<PlaybookTerminology>;
  /** Custom outcome labels */
  outcomeLabels?: Record<string, string>;
  /** Custom KPI labels */
  kpiLabels?: Record<string, string>;
  /** Email tracking (existing functionality) */
  emailsSent?: string[];
  /** Plan limits (existing functionality) */
  maxCallsPerMonth?: number;
  /** Selected plan during signup */
  selectedPlan?: string;
}

/**
 * Parse tenant settings JSON into typed object
 */
export function parseTenantSettings(settingsJson: string | null): TenantPlaybookSettings {
  if (!settingsJson) return {};
  try {
    return JSON.parse(settingsJson) as TenantPlaybookSettings;
  } catch {
    return {};
  }
}

/**
 * Get the effective terminology for a tenant by merging:
 * 1. Software defaults
 * 2. Industry playbook terminology
 * 3. Tenant-specific overrides
 */
export function getEffectiveTerminology(settings: TenantPlaybookSettings): PlaybookTerminology {
  // Start with generic defaults (Software Playbook)
  const defaults: PlaybookTerminology = {
    contactLabel: "Contact",
    contactLabelPlural: "Contacts",
    dealLabel: "Deal",
    dealLabelPlural: "Deals",
    assetLabel: "Asset",
    assetLabelPlural: "Assets",
    roleLabels: {
      lead_generator: "Lead Generator",
      lead_manager: "Lead Manager",
      acquisition_manager: "Acquisition Manager",
    },
    callTypeLabels: {
      cold_call: "Cold Call",
      qualification: "Qualification",
      offer: "Offer",
      follow_up: "Follow-Up",
      seller_callback: "Callback (Inbound)",
      admin_callback: "Admin",
    },
    outcomeLabels: {
      appointment_set: "Appointment Set",
      offer_made: "Offer Made",
      offer_rejected: "Offer Rejected",
      callback_scheduled: "Callback Scheduled",
      interested: "Interested",
      not_interested: "Not Interested",
      left_vm: "Left Voicemail",
      no_answer: "No Answer",
      dead: "Dead",
      none: "No Outcome",
    },
    kpiLabels: {
      appointments_set: "Appointments Set",
      offers_made: "Offers Made",
      offers_accepted: "Offers Accepted",
    },
  };

  // Layer 2: Apply industry playbook terminology
  let merged = { ...defaults };
  if (settings.industryPlaybook) {
    const playbook = getPlaybookByCode(settings.industryPlaybook);
    if (playbook) {
      merged = {
        ...merged,
        ...playbook.terminology,
        roleLabels: { ...merged.roleLabels, ...playbook.terminology.roleLabels },
        callTypeLabels: { ...merged.callTypeLabels, ...playbook.terminology.callTypeLabels },
        outcomeLabels: { ...merged.outcomeLabels, ...playbook.terminology.outcomeLabels },
        kpiLabels: { ...merged.kpiLabels, ...playbook.terminology.kpiLabels },
      };
    }
  }

  // Layer 3: Apply tenant-specific overrides
  if (settings.terminology) {
    merged = {
      ...merged,
      ...settings.terminology,
      roleLabels: { ...merged.roleLabels, ...settings.terminology.roleLabels },
      callTypeLabels: { ...merged.callTypeLabels, ...settings.terminology.callTypeLabels },
      outcomeLabels: { ...merged.outcomeLabels, ...settings.terminology.outcomeLabels },
      kpiLabels: { ...merged.kpiLabels, ...settings.terminology.kpiLabels },
    };
  }

  // Apply top-level outcome/kpi label overrides
  if (settings.outcomeLabels) {
    merged.outcomeLabels = { ...merged.outcomeLabels, ...settings.outcomeLabels };
  }
  if (settings.kpiLabels) {
    merged.kpiLabels = { ...merged.kpiLabels, ...settings.kpiLabels };
  }

  return merged;
}
