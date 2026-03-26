// types/property.ts — Inventory data model

export type PipelineTrack = 'acquisition' | 'disposition' | 'longterm'

export type AppStage =
  | 'acquisition.new_lead'
  | 'acquisition.appt_set'
  | 'acquisition.offer_made'
  | 'acquisition.contract'
  | 'acquisition.closed'
  | 'disposition.new_deal'
  | 'disposition.pushed_out'
  | 'disposition.offers_received'
  | 'disposition.contracted'
  | 'disposition.closed'
  | 'longterm.follow_up'
  | 'longterm.dead'

export type PropertyType = 'House' | 'Land' | 'Multi-Family' | 'Commercial' | 'Other'
export type BuyerTier = 'priority' | 'qualified' | 'jv' | 'unqualified'

// Maps DB PropertyStatus enum to our AppStage system
export const STATUS_TO_APP_STAGE: Record<string, AppStage> = {
  // Acquisition pipeline
  NEW_LEAD: 'acquisition.new_lead',
  CONTACTED: 'acquisition.new_lead',
  APPOINTMENT_SET: 'acquisition.appt_set',
  APPOINTMENT_COMPLETED: 'acquisition.appt_set',
  OFFER_MADE: 'acquisition.offer_made',
  UNDER_CONTRACT: 'acquisition.contract',
  SOLD: 'acquisition.closed',
  // Disposition pipeline
  IN_DISPOSITION: 'disposition.new_deal',
  DISPO_PUSHED: 'disposition.pushed_out',
  DISPO_OFFERS: 'disposition.offers_received',
  DISPO_CONTRACTED: 'disposition.contracted',
  DISPO_CLOSED: 'disposition.closed',
  // Long-term
  FOLLOW_UP: 'longterm.follow_up',
  DEAD: 'longterm.dead',
}

export function getTrackFromStage(stage: AppStage): PipelineTrack {
  return stage.split('.')[0] as PipelineTrack
}

export function getStageLabel(stage: AppStage): string {
  return APP_STAGE_LABELS[stage] ?? stage
}

export const APP_STAGE_LABELS: Record<AppStage, string> = {
  'acquisition.new_lead': 'New Lead',
  'acquisition.appt_set': 'Appt Set',
  'acquisition.offer_made': 'Offer Made',
  'acquisition.contract': 'Contract',
  'acquisition.closed': 'Closed',
  'disposition.new_deal': 'New Deal',
  'disposition.pushed_out': 'Pushed Out',
  'disposition.offers_received': 'Offers Received',
  'disposition.contracted': 'Contracted',
  'disposition.closed': 'Closed',
  'longterm.follow_up': 'Follow Up',
  'longterm.dead': 'Dead',
}

export const APP_STAGE_BADGE_COLORS: Record<AppStage, string> = {
  'acquisition.new_lead': 'bg-blue-100 text-blue-700',
  'acquisition.appt_set': 'bg-orange-100 text-orange-700',
  'acquisition.offer_made': 'bg-purple-100 text-purple-700',
  'acquisition.contract': 'bg-green-100 text-green-700',
  'acquisition.closed': 'bg-gray-100 text-gray-700',
  'disposition.new_deal': 'bg-blue-100 text-blue-700',
  'disposition.pushed_out': 'bg-indigo-100 text-indigo-700',
  'disposition.offers_received': 'bg-teal-100 text-teal-700',
  'disposition.contracted': 'bg-emerald-100 text-emerald-700',
  'disposition.closed': 'bg-gray-100 text-gray-700',
  'longterm.follow_up': 'bg-amber-100 text-amber-700',
  'longterm.dead': 'bg-gray-100 text-gray-500',
}

// Seller contact — fetched fresh from GHL API, not stored locally
export interface SellerContact {
  ghl_contact_id: string
  name: string
  phone: string
  email: string
  lead_source: string | null
}

export interface PropertyBuyer {
  id: string
  ghl_contact_id: string
  name: string
  phone: string
  email: string
  tier: BuyerTier
  markets: string[]
  secondary_markets: string[]
  buy_box: string | null
  verified_funding: boolean
  has_purchased_before: boolean
  response_speed: string | null
  buyer_notes: string | null
  last_contact_date: string | null
  matched_at: string
  match_score: number
}

export interface OutreachLog {
  id: string
  type: 'send' | 'offer' | 'showing'
  channel: 'sms' | 'email' | 'call' | 'in_person'
  recipient_name: string
  recipient_contact: string
  notes: string | null
  logged_at: string
  logged_by_user_id: string
}

export interface ActivityItem {
  id: string
  type: 'stage_change' | 'note' | 'offer_recorded' | 'blast_sent' | 'buyer_matched' | 'system'
  description: string
  metadata: Record<string, unknown> | null
  user_name: string | null
  created_at: string
}

export interface BlastMessage {
  id: string
  property_id: string
  tier: BuyerTier
  email_subject: string
  email_body: string
  sms_body: string
  generated_at: string
  edited: boolean
  sent_at: string | null
  sent_to_count: number
}

export interface Comp {
  address: string
  beds: number
  baths: number
  sqft: number
  sale_price: number
  sale_date: string
}

export interface PriceHistoryItem {
  date: string
  event: 'Sold' | 'Tax Assessment' | 'Listed' | 'Price Change'
  value: number
}
