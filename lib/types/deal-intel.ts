// lib/types/deal-intel.ts
// Complete deal intelligence type definitions
// This is the contract between: AI grading prompt, merge pipeline, property storage, and UI rendering.
// Every field extracted from calls is documented here with its update strategy.

// ─── Top-level deal intel stored on Property.dealIntel ──────────────────────

export interface DealIntel {
  // ── Seller Profile ──────────────────────────────────────────────────────
  sellerMotivationLevel?: FieldValue<number>          // 1-10 scale
  sellerMotivationReason?: FieldValue<string>
  statedVsImpliedMotivation?: FieldValue<string>      // "Says 'exploring options' but mentioned foreclosure"
  sellerWhySelling?: FieldValue<string>                // Full paragraph
  sellerTimeline?: FieldValue<string>                  // "By June", "ASAP", "no rush"
  sellerTimelineUrgency?: FieldValue<'high' | 'medium' | 'low' | 'unknown'>
  sellerKnowledgeLevel?: FieldValue<'savvy' | 'moderate' | 'naive'>
  sellerCommunicationStyle?: FieldValue<'direct' | 'rapport-first' | 'analytical' | 'emotional'>
  sellerContactPreference?: FieldValue<string>         // "text after 5pm", "call mornings"
  sellerPersonalityProfile?: FieldValue<{
    style: string; pacePreference: string; trustLevel: string; topicPreferences: string[]
  }>
  sellerEmotionalTriggers?: AccumulatedField<string>   // ["Mom passed", "overwhelmed"]
  sellerFamilySituation?: FieldValue<string>
  sellerPreviousInvestorContact?: AccumulatedField<string> // ["Talked to Opendoor", "had offer from wholesaler"]
  sellerAlternativePlan?: FieldValue<string>            // "I'll rent it out" vs "no other option"
  sellerOnlineBehavior?: FieldValue<string>             // If trackable
  costOfInaction?: FieldValue<string>                   // "What happens if you don't sell?" — strongest negotiating lever
  costOfInactionMonthly?: FieldValue<number>            // Dollar amount seller bleeds per month by NOT selling
  painQuantification?: FieldValue<string>               // Specific pain: "lose house to foreclosure in 90 days", "paying $2k/mo on vacant house"

  // ── Decision Making ─────────────────────────────────────────────────────
  decisionMakers?: AccumulatedField<{ name: string; role: string; onBoard: boolean; hasVetoPower?: boolean; presentOnCalls?: boolean; separateMotivation?: string }>
  decisionMakersConfirmed?: FieldValue<boolean>
  decisionMakerNotes?: FieldValue<string>
  documentReadiness?: FieldValue<string>                // "I have the deed" / "in probate" / "need to find paperwork"

  // ── Price Negotiation ───────────────────────────────────────────────────
  sellerAskingHistory?: AccumulatedField<{ amount: number; date: string; callId: string }>
  offersWeHaveMade?: AccumulatedField<{ amount: number; date: string; response: string; callId: string }>
  competingOffers?: AccumulatedField<{ amount: number; source: string; date: string; terms?: string; callId: string }>
  priceAnchors?: AccumulatedField<string>               // Numbers the seller mentioned
  stickingPoints?: AccumulatedField<string>             // "Won't go below 190k", "needs 30 days post-close"
  counterOffers?: AccumulatedField<{ from: 'us' | 'seller' | 'buyer'; amount: number; termsChanged?: string; whyRejected?: string; date: string; callId: string }>

  // ── Property Condition (from seller) ────────────────────────────────────
  conditionNotesFromSeller?: FieldValue<string>
  repairItemsMentioned?: AccumulatedField<string>       // ["roof", "kitchen", "foundation crack"]
  accessSituation?: FieldValue<string>                  // "lockbox", "call first", "meet Tuesday"
  gateCodeAccessNotes?: FieldValue<string>              // "Gate code 1234", "dog in backyard", "enter from alley"
  tenantSituation?: FieldValue<{ occupied: boolean; leaseEnd?: string; rentAmount?: number; cooperative?: boolean; moveOutCost?: number; tenantContactInfo?: string; leaseTerms?: string; evictionRisk?: string }>
  utilityStatus?: FieldValue<string>                    // "Water off", "electric disconnected"
  environmentalConcerns?: AccumulatedField<string>      // Mold, asbestos, underground tanks, lead paint
  unpermittedWork?: FieldValue<string>                  // "Addition without permits"
  permitHistoryFromSeller?: FieldValue<string>
  insuranceSituation?: FieldValue<string>               // "Dropped after storm"
  neighborhoodComplaints?: AccumulatedField<string>     // "Neighbor is a problem", "HOA aggressive"
  previousDealFellThrough?: FieldValue<string>          // Why prior deal fell through
  // Walkthrough / site visit notes (from AM's on-site inspection)
  walkthroughNotes?: FieldValue<string>                  // Full walkthrough narrative
  walkthroughRepairList?: AccumulatedField<{ item: string; severity: 'minor' | 'moderate' | 'major'; estimatedCost?: number }>
  walkthroughConditionVsSeller?: FieldValue<string>     // "Seller said minor repairs but foundation has major crack"
  walkthroughPhotosNotes?: FieldValue<string>            // Notes about what was photographed

  // ── Legal & Title ───────────────────────────────────────────────────────
  titleIssuesMentioned?: AccumulatedField<string>
  legalComplications?: AccumulatedField<string>         // Probate, divorce decree, trust dissolution, code violations
  liensMentioned?: AccumulatedField<string>
  backTaxesMentioned?: FieldValue<string>
  hoaMentioned?: FieldValue<{ monthly?: number; notes?: string }>
  mortgageBalanceMentioned?: FieldValue<number>

  // ── Communication Intel ─────────────────────────────────────────────────
  whatNotToSay?: AccumulatedField<string>
  toneShiftMoments?: AccumulatedField<{ moment: string; cause: string; callId: string }>
  exactTriggerPhrases?: AccumulatedField<{ phrase: string; reaction: 'positive' | 'negative'; callId: string }>
  questionsSellerAskedUs?: AccumulatedField<string>
  infoVolunteeredVsExtracted?: AccumulatedField<{ info: string; volunteered: boolean; callId: string }>
  silencePausePatterns?: FieldValue<string>
  appointmentLogisticsPreferences?: FieldValue<string>  // "Can only meet weekday mornings", "needs 48hr notice"
  bestApproachNotes?: FieldValue<string>

  // ── Deal Status & Promises ──────────────────────────────────────────────
  rollingDealSummary?: FieldValue<string>               // AI rewrites on each call — cumulative narrative
  commitmentsWeMade?: AccumulatedField<{ what: string; when?: string; callId: string }>
  promisesTheyMade?: AccumulatedField<{ what: string; when?: string; callId: string }>
  promiseDeadlines?: AccumulatedField<{ what: string; dueDate: string; callId: string }>
  nextStepAgreed?: FieldValue<{ action: string; date?: string }>
  triggerEvents?: AccumulatedField<{ event: string; date?: string; urgency: string }>
  topicsNotYetDiscussed?: FieldValue<string[]>          // Shrinks over time as topics are covered
  objectionsEncountered?: AccumulatedField<{ objection: string; whatWorked?: string; whatDidntWork?: string; effectivenessRating?: 'resolved' | 'partially' | 'unresolved'; callId: string }>
  relationshipRapportLevel?: FieldValue<'cold' | 'warming' | 'warm' | 'strong'>
  bestRepForThisSeller?: FieldValue<string>             // userId

  // ── Deal Health Signals ───────────────────────────────────────────────────
  dealRedFlags?: AccumulatedField<string>               // "Seller shopping offers", "title in probate", "unrealistic expectations"
  dealGreenFlags?: AccumulatedField<string>             // "Motivated seller", "clear title", "vacant property", "ASAP timeline"
  dealHealthTrajectory?: FieldValue<'improving' | 'stable' | 'declining'>
  dealRiskLevel?: FieldValue<'low' | 'medium' | 'high'>

  // ── Engagement Metrics (computed, stored for historical reference) ────────
  totalTouchCount?: FieldValue<number>                  // Total calls + texts + emails
  touchBreakdown?: FieldValue<{ calls: number; texts: number; emails: number; visits: number }>
  daysSinceFirstContact?: FieldValue<number>
  daysSinceLastContact?: FieldValue<number>
  speedToFirstResponse?: FieldValue<number>             // Hours from lead creation to first contact
  appointmentHistory?: AccumulatedField<{ date: string; type: 'showing' | 'closing' | 'inspection'; status: 'scheduled' | 'showed' | 'no_show' | 'cancelled' }>

  // ── Marketing Attribution ───────────────────────────────────────────────
  howTheyFoundUs?: FieldValue<string>                   // "Saw your mailer", "Google search"
  referralSource?: FieldValue<string>                   // Who referred them
  referralChain?: AccumulatedField<string>              // Network effects: "John told me, neighbor Mary also called"
  firstMarketingPieceReceived?: FieldValue<string>      // "Yellow letter in January"
  whichMarketingMessageResonated?: FieldValue<string>   // What about our marketing made them respond
}

// ─── Field wrapper types ────────────────────────────────────────────────────

/** Single-value field — latest call overwrites */
export interface FieldValue<T> {
  value: T
  updatedAt: string       // ISO date
  sourceCallId: string    // which call this came from
  confidence: 'high' | 'medium' | 'low'
}

/** Accumulated field — new items added, never removed */
export interface AccumulatedField<T> {
  items: Array<T & { _addedAt?: string; _sourceCallId?: string }>
  updatedAt: string
}

// ─── Proposed change (stored on Call.dealIntelHistory) ───────────────────────

export interface ProposedDealIntelChange {
  field: string                 // key path in DealIntel, e.g. "sellerMotivationLevel"
  label: string                 // human-readable label: "Seller Motivation Level"
  category: DealIntelCategory
  currentValue: unknown         // what's currently on the property
  proposedValue: unknown        // what the AI extracted from this call
  confidence: 'high' | 'medium' | 'low'
  evidence: string              // verbatim quote or paraphrase from transcript
  updateType: 'overwrite' | 'accumulate' // single-value vs list append
  // Decision tracking (filled when user acts)
  decision?: 'approved' | 'edited' | 'skipped' | 'auto_approved'
  editedValue?: unknown         // if user edited before approving
  decidedAt?: string            // ISO date
  decidedBy?: string            // userId
}

export type DealIntelCategory =
  | 'seller_profile'
  | 'decision_making'
  | 'price_negotiation'
  | 'property_condition'
  | 'legal_title'
  | 'communication_intel'
  | 'deal_status'
  | 'marketing'

// ─── Category display config ────────────────────────────────────────────────

export const DEAL_INTEL_CATEGORIES: Record<DealIntelCategory, { label: string; icon: string; color: string }> = {
  seller_profile:      { label: 'Seller Profile',          icon: 'User',          color: 'text-semantic-blue' },
  decision_making:     { label: 'Decision Making',         icon: 'Users',         color: 'text-semantic-purple' },
  price_negotiation:   { label: 'Price Negotiation',       icon: 'DollarSign',    color: 'text-semantic-green' },
  property_condition:  { label: 'Property Condition',       icon: 'Home',          color: 'text-semantic-amber' },
  legal_title:         { label: 'Legal & Title',            icon: 'ShieldCheck',   color: 'text-semantic-red' },
  communication_intel: { label: 'Communication Intel',      icon: 'MessageSquare', color: 'text-teal-600' },
  deal_status:         { label: 'Deal Status & Promises',   icon: 'CheckCircle',   color: 'text-orange-600' },
  marketing:           { label: 'Marketing Attribution',    icon: 'Target',        color: 'text-pink-600' },
}

// ─── Field → Category mapping ───────────────────────────────────────────────

export const FIELD_CATEGORY: Record<string, DealIntelCategory> = {
  // Seller Profile
  sellerMotivationLevel: 'seller_profile', sellerMotivationReason: 'seller_profile',
  statedVsImpliedMotivation: 'seller_profile', sellerWhySelling: 'seller_profile',
  sellerTimeline: 'seller_profile', sellerTimelineUrgency: 'seller_profile',
  sellerKnowledgeLevel: 'seller_profile', sellerCommunicationStyle: 'seller_profile',
  sellerContactPreference: 'seller_profile', sellerPersonalityProfile: 'seller_profile',
  sellerEmotionalTriggers: 'seller_profile', sellerFamilySituation: 'seller_profile',
  sellerPreviousInvestorContact: 'seller_profile', sellerAlternativePlan: 'seller_profile',
  sellerOnlineBehavior: 'seller_profile',
  costOfInaction: 'seller_profile', costOfInactionMonthly: 'seller_profile', painQuantification: 'seller_profile',
  // Decision Making
  decisionMakers: 'decision_making', decisionMakersConfirmed: 'decision_making',
  decisionMakerNotes: 'decision_making', documentReadiness: 'decision_making',
  // Price Negotiation
  sellerAskingHistory: 'price_negotiation', offersWeHaveMade: 'price_negotiation',
  competingOffers: 'price_negotiation', priceAnchors: 'price_negotiation',
  stickingPoints: 'price_negotiation', counterOffers: 'price_negotiation',
  // Property Condition
  conditionNotesFromSeller: 'property_condition', repairItemsMentioned: 'property_condition',
  accessSituation: 'property_condition', gateCodeAccessNotes: 'property_condition',
  tenantSituation: 'property_condition', utilityStatus: 'property_condition',
  environmentalConcerns: 'property_condition', unpermittedWork: 'property_condition',
  permitHistoryFromSeller: 'property_condition', insuranceSituation: 'property_condition',
  neighborhoodComplaints: 'property_condition', previousDealFellThrough: 'property_condition',
  walkthroughNotes: 'property_condition', walkthroughRepairList: 'property_condition',
  walkthroughConditionVsSeller: 'property_condition', walkthroughPhotosNotes: 'property_condition',
  // Legal & Title
  titleIssuesMentioned: 'legal_title', legalComplications: 'legal_title',
  liensMentioned: 'legal_title', backTaxesMentioned: 'legal_title',
  hoaMentioned: 'legal_title', mortgageBalanceMentioned: 'legal_title',
  // Communication Intel
  whatNotToSay: 'communication_intel', toneShiftMoments: 'communication_intel',
  exactTriggerPhrases: 'communication_intel', questionsSellerAskedUs: 'communication_intel',
  infoVolunteeredVsExtracted: 'communication_intel', silencePausePatterns: 'communication_intel',
  appointmentLogisticsPreferences: 'communication_intel', bestApproachNotes: 'communication_intel',
  // Deal Status
  rollingDealSummary: 'deal_status', commitmentsWeMade: 'deal_status',
  promisesTheyMade: 'deal_status', promiseDeadlines: 'deal_status',
  nextStepAgreed: 'deal_status', triggerEvents: 'deal_status',
  topicsNotYetDiscussed: 'deal_status', objectionsEncountered: 'deal_status',
  relationshipRapportLevel: 'deal_status', bestRepForThisSeller: 'deal_status',
  dealRedFlags: 'deal_status', dealGreenFlags: 'deal_status',
  dealHealthTrajectory: 'deal_status', dealRiskLevel: 'deal_status',
  totalTouchCount: 'deal_status', touchBreakdown: 'deal_status',
  daysSinceFirstContact: 'deal_status', daysSinceLastContact: 'deal_status',
  speedToFirstResponse: 'deal_status', appointmentHistory: 'deal_status',
  // Marketing
  howTheyFoundUs: 'marketing', referralSource: 'marketing',
  referralChain: 'marketing', firstMarketingPieceReceived: 'marketing',
  whichMarketingMessageResonated: 'marketing',
}

// ─── Field labels for UI ────────────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  sellerMotivationLevel: 'Seller Motivation (1-10)',
  sellerMotivationReason: 'Motivation Reason',
  statedVsImpliedMotivation: 'Stated vs Implied Motivation',
  sellerWhySelling: 'Why Selling',
  sellerTimeline: 'Timeline to Sell',
  sellerTimelineUrgency: 'Timeline Urgency',
  sellerKnowledgeLevel: 'Seller Knowledge Level',
  sellerCommunicationStyle: 'Communication Style',
  sellerContactPreference: 'Contact Preference',
  sellerPersonalityProfile: 'Personality Profile',
  sellerEmotionalTriggers: 'Emotional Triggers',
  sellerFamilySituation: 'Family Situation',
  sellerPreviousInvestorContact: 'Previous Investor Contact',
  sellerAlternativePlan: 'Seller\'s Alternative Plan',
  costOfInaction: 'Cost of Inaction',
  costOfInactionMonthly: 'Monthly Cost of Not Selling ($)',
  painQuantification: 'Pain Quantification',
  decisionMakers: 'Decision Makers',
  decisionMakersConfirmed: 'Decision Makers Confirmed',
  decisionMakerNotes: 'Decision Maker Notes',
  documentReadiness: 'Document Readiness',
  sellerAskingHistory: 'Asking Price History',
  offersWeHaveMade: 'Our Offers',
  competingOffers: 'Competing Offers',
  priceAnchors: 'Price Anchors',
  stickingPoints: 'Sticking Points',
  counterOffers: 'Counter Offers',
  conditionNotesFromSeller: 'Condition (from Seller)',
  repairItemsMentioned: 'Repair Items Mentioned',
  accessSituation: 'Access Situation',
  gateCodeAccessNotes: 'Gate Code / Access Notes',
  tenantSituation: 'Tenant Situation',
  utilityStatus: 'Utility Status',
  environmentalConcerns: 'Environmental Concerns',
  unpermittedWork: 'Unpermitted Work',
  permitHistoryFromSeller: 'Permit History (from Seller)',
  insuranceSituation: 'Insurance Situation',
  neighborhoodComplaints: 'Neighborhood Issues',
  previousDealFellThrough: 'Previous Deal Fell Through',
  walkthroughNotes: 'Walkthrough Notes',
  walkthroughRepairList: 'Walkthrough Repair List',
  walkthroughConditionVsSeller: 'Condition vs Seller\'s Claims',
  walkthroughPhotosNotes: 'Walkthrough Photos Notes',
  titleIssuesMentioned: 'Title Issues',
  legalComplications: 'Legal Complications',
  liensMentioned: 'Liens Mentioned',
  backTaxesMentioned: 'Back Taxes',
  hoaMentioned: 'HOA Details',
  mortgageBalanceMentioned: 'Mortgage Balance (from Seller)',
  whatNotToSay: 'What Not to Say',
  toneShiftMoments: 'Tone Shift Moments',
  exactTriggerPhrases: 'Trigger Phrases',
  questionsSellerAskedUs: 'Questions Seller Asked',
  infoVolunteeredVsExtracted: 'Info Volunteered vs Extracted',
  silencePausePatterns: 'Silence/Pause Patterns',
  appointmentLogisticsPreferences: 'Appointment Preferences',
  bestApproachNotes: 'Best Approach Notes',
  rollingDealSummary: 'Deal Summary',
  commitmentsWeMade: 'Our Commitments',
  promisesTheyMade: 'Seller\'s Promises',
  promiseDeadlines: 'Promise Deadlines',
  nextStepAgreed: 'Next Step Agreed',
  triggerEvents: 'Trigger Events',
  topicsNotYetDiscussed: 'Topics Not Yet Discussed',
  objectionsEncountered: 'Objections & What Worked',
  relationshipRapportLevel: 'Rapport Level',
  bestRepForThisSeller: 'Best Rep for This Seller',
  howTheyFoundUs: 'How They Found Us',
  referralSource: 'Referral Source',
  referralChain: 'Referral Chain',
  firstMarketingPieceReceived: 'First Marketing Piece',
  whichMarketingMessageResonated: 'Message That Resonated',
  // Deal Health & Engagement
  dealRedFlags: 'Deal Red Flags',
  dealGreenFlags: 'Deal Green Flags',
  dealHealthTrajectory: 'Deal Health Trajectory',
  dealRiskLevel: 'Deal Risk Level',
  totalTouchCount: 'Total Touch Count',
  touchBreakdown: 'Touch Breakdown',
  daysSinceFirstContact: 'Days Since First Contact',
  daysSinceLastContact: 'Days Since Last Contact',
  speedToFirstResponse: 'Speed to First Response (hrs)',
  appointmentHistory: 'Appointment History',
}
