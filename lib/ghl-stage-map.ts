// lib/ghl-stage-map.ts — Maps GHL pipeline stage names to app stages
// Spelling matters — these are the exact stage names from GHL pipelines

import type { AppStage } from '@/types/property'

// GHL "Sales Process" Pipeline → ACQUISITION track
// GHL "Dispo Pipeline" → DISPOSITION track
// GHL "Follow Up Pipeline" → LONGTERM track
export const GHL_STAGE_MAP: Record<string, AppStage> = {
  // ─── Sales Process Pipeline (Acquisition) ────────────────────────
  'New Lead (1)':                'acquisition.new_lead',
  'Warm Leads(2)':               'acquisition.new_lead',
  'Hot Leads(2)':                'acquisition.new_lead',
  'Pending Apt(3)':              'acquisition.appt_set',
  'Walkthrough Apt Scheduled':   'acquisition.appt_set',
  'Offer Apt Scheduled (3)':     'acquisition.appt_set',
  'Made Offer (4)':              'acquisition.offer_made',
  'Under Contract (5)':          'acquisition.contract',
  'Purchased (6)':               'acquisition.closed',
  'SOLD':                        'acquisition.closed',
  '1 Month Follow Up':           'longterm.follow_up',
  '4 Month Follow Up':           'longterm.follow_up',
  '1 Year Follow Up':            'longterm.follow_up',
  'Ghosted Lead':                'longterm.dead',
  'Agreement not closed':        'longterm.dead',
  'DO NOT WANT':                 'longterm.dead',

  // ─── Dispo Pipeline (Disposition) ────────────────────────────────
  'New deal':                    'disposition.new_deal',
  'Clear to Send Out':           'disposition.pushed_out',
  'Sent to buyers':              'disposition.pushed_out',
  'Offers Received':             'disposition.offers_received',
  '<1 Day — Need to Terminate':  'disposition.offers_received',
  'With JV Partner':             'disposition.contracted',
  'UC W/ Buyer':                 'disposition.contracted',
  'Working w/ Title':            'disposition.contracted',
  'Closed':                      'disposition.closed',

  // ─── Follow Up Pipeline → longterm track ─────────────────────────
  'New Lead':                    'longterm.follow_up',
  'New Offer':                   'longterm.follow_up',
  'New Walkthrough':             'longterm.follow_up',
  // '4 Month Follow Up' already mapped above
  // '1 Year Follow Up' already mapped above
  'Purchased':                   'acquisition.closed',
  'Agreement Not Closed':        'longterm.dead',
  // 'SOLD' already mapped above
  'Ghosted':                     'longterm.dead',
  'Trash':                       'longterm.dead',
}

/**
 * Get the app stage for a GHL stage name.
 * Falls back to acquisition.new_lead if no mapping found.
 */
export function getAppStage(ghlStageName: string): AppStage {
  // Exact match first
  if (GHL_STAGE_MAP[ghlStageName]) return GHL_STAGE_MAP[ghlStageName]

  // Case-insensitive match
  const lower = ghlStageName.toLowerCase().trim()
  for (const [key, value] of Object.entries(GHL_STAGE_MAP)) {
    if (key.toLowerCase().trim() === lower) return value
  }

  // Keyword fallback
  if (lower.includes('follow up') || lower.includes('followup')) return 'longterm.follow_up'
  if (lower.includes('ghost') || lower.includes('trash') || lower.includes('dead') || lower.includes('do not')) return 'longterm.dead'
  if (lower.includes('contract') || lower.includes('uc ')) return 'acquisition.contract'
  if (lower.includes('offer')) return 'acquisition.offer_made'
  if (lower.includes('apt') || lower.includes('appt') || lower.includes('walkthrough')) return 'acquisition.appt_set'
  if (lower.includes('sold') || lower.includes('closed') || lower.includes('purchased')) return 'acquisition.closed'
  if (lower.includes('dispo') || lower.includes('new deal')) return 'disposition.new_deal'
  if (lower.includes('buyer') || lower.includes('sent to')) return 'disposition.pushed_out'

  return 'acquisition.new_lead'
}

/**
 * Get the pipeline track from a GHL pipeline name.
 */
export function getTrackFromPipelineName(pipelineName: string): 'acquisition' | 'disposition' | 'longterm' {
  const lower = pipelineName.toLowerCase()
  if (lower.includes('dispo')) return 'disposition'
  if (lower.includes('follow')) return 'longterm'
  return 'acquisition'
}
