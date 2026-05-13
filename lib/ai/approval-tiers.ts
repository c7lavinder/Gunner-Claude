// lib/ai/approval-tiers.ts
//
// Phase 4 of LLM Rewiring Plan — Traffic-Light Approval Rule.
// Closes the gap from Phase 2: the prompt-level "always confirm RED actions"
// rule could be bypassed by a clever model or jailbreak. This file is the
// CODE-LEVEL enforcement.
//
// Source of truth for which tools require which approval level.
// `app/api/ai/assistant/execute/route.ts` reads this on every call.
//
// Tier definitions (matches the prompt's TRAFFIC_LIGHT rule in lib/ai/prompts/assistant.ts):
//   RED    — customer-facing. Wait for full-text approval via modal.
//            UI: show EXACT message text + recipient + "Approve" button.
//   YELLOW — changes a deal/lead/schedule. One-click confirm in chat.
//            UI: show summary of change + "Yes/No" buttons.
//   GREEN  — internal-only read or note. Auto-execute.
//            UI: simple approve button (still required today; future Phase
//            may auto-run for true GREEN tools without user click).
//
// READ BY: app/api/ai/assistant/execute/route.ts, lib/ai/role-gates.ts
//          components/ui/coach-sidebar.tsx (UI mirror)

export type ApprovalTier = 'RED' | 'YELLOW' | 'GREEN'

/**
 * Default tier for any tool not explicitly listed. We default to YELLOW so
 * an unknown tool requires confirmation rather than fires silently. New
 * tools must explicitly opt into GREEN to skip the modal.
 */
const DEFAULT_TIER: ApprovalTier = 'YELLOW'

/**
 * TOOL_APPROVAL_TIERS — single source of truth.
 *
 * To add a new tool: pick the right tier. When in doubt, pick the
 * MORE restrictive tier (RED > YELLOW > GREEN). Default-deny semantics.
 */
export const TOOL_APPROVAL_TIERS: Record<string, ApprovalTier> = {
  // ─── RED tier — customer-facing. Requires explicit approved=true. ───
  send_sms: 'RED',
  send_email: 'RED',
  schedule_sms: 'RED',
  schedule_email: 'RED',
  send_sms_blast: 'RED',
  send_email_blast: 'RED',
  add_contact_to_workflow: 'RED',     // GHL workflows trigger customer messages
  remove_contact_from_workflow: 'RED', // same — exiting can trigger drips

  // ─── YELLOW tier — changes deal/lead/schedule state. Requires approved=true. ───
  // Pipeline / Property mutations
  change_property_status: 'YELLOW',
  change_pipeline_stage: 'YELLOW',
  update_property: 'YELLOW',
  update_contact: 'YELLOW',
  update_buyer: 'YELLOW',
  update_deal_intel: 'YELLOW',
  update_opportunity_status: 'YELLOW',
  update_opportunity_value: 'YELLOW',
  set_property_markets: 'YELLOW',
  set_project_types: 'YELLOW',
  log_offer: 'YELLOW',
  log_counter_offer: 'YELLOW',
  log_milestone: 'YELLOW',

  // Tasks + appointments
  create_task: 'YELLOW',
  update_task: 'YELLOW',
  complete_task: 'YELLOW',
  create_appointment: 'YELLOW',
  reschedule_appointment: 'YELLOW',
  cancel_appointment: 'YELLOW',
  update_appointment_status: 'YELLOW',

  // CRM creation
  create_contact: 'YELLOW',
  create_opportunity: 'YELLOW',
  add_contact_to_property: 'YELLOW',
  remove_contact_from_property: 'YELLOW',
  add_buyer: 'YELLOW',
  add_team_member_to_property: 'YELLOW',
  remove_team_member: 'YELLOW',
  move_buyer_in_pipeline: 'YELLOW',

  // Tag operations (bulk = RED, single = YELLOW)
  add_tags_to_contact: 'YELLOW',
  remove_tags_from_contact: 'YELLOW',
  assign_contact_to_user: 'YELLOW',
  bulk_tag_contacts: 'RED',          // bulk → customer-facing-risk class

  // Drafts (no send — just produces content for review)
  generate_deal_blast: 'YELLOW',

  // Settings-style (kept here for safety; the audit recommends DROPPING these)
  update_user_role: 'RED',
  update_pipeline_config: 'RED',
  set_kpi_goals: 'YELLOW',
  invite_team_member: 'YELLOW',

  // ─── GREEN tier — internal reads / notes. Skip the modal. ───
  // Read/query tools
  query_properties: 'GREEN',
  search_calls: 'GREEN',
  semantic_search_calls: 'GREEN',
  query_tasks: 'GREEN',
  get_kpi_metrics: 'GREEN',
  get_team_performance: 'GREEN',
  query_sellers: 'GREEN',
  query_buyers: 'GREEN',
  get_ghl_pipeline_state: 'GREEN',
  cross_entity_query: 'GREEN',
  find_similar_deals: 'GREEN',

  // Internal notes (not customer-visible)
  add_note: 'GREEN',
  add_internal_note: 'GREEN',
  summarize_property: 'GREEN',

  // Pure calculations (no DB write)
  calculate_mao: 'GREEN',

  // Admin/QA actions on AI grading data (no customer impact)
  regrade_call: 'GREEN',
  reclassify_call: 'GREEN',
  mark_call_reviewed: 'GREEN',
  flag_calibration: 'GREEN',
  trigger_property_enrichment: 'GREEN',
  approve_all_deal_intel: 'GREEN',
  rematch_buyers: 'GREEN',
  create_comp_analysis: 'GREEN',
  generate_next_steps: 'GREEN',
  push_next_step: 'YELLOW',  // actually performs the action — bump up
}

/**
 * Get the approval tier for a tool. Unknown tools default to YELLOW
 * (require confirmation) — safer than letting an unmapped tool fire.
 */
export function getApprovalTier(toolName: string): ApprovalTier {
  return TOOL_APPROVAL_TIERS[toolName] ?? DEFAULT_TIER
}

/**
 * Tools that require explicit `approved: true` in the execute request.
 * Currently: every RED tool, plus YELLOW tools to enforce the
 * traffic-light rule at the API level. GREEN tools auto-pass.
 *
 * Future: GREEN tools could auto-execute without any user click. For now
 * the UI still requires a click; this set just controls whether the
 * confirmation modal appears.
 */
export function requiresExplicitApproval(toolName: string): boolean {
  const tier = getApprovalTier(toolName)
  return tier === 'RED' || tier === 'YELLOW'
}

/**
 * Tools that require the FULL-TEXT preview modal (not just yes/no).
 * Currently: RED tools only. Mirrors UI's HIGH_STAKES_TYPES set.
 */
export function requiresFullTextModal(toolName: string): boolean {
  return getApprovalTier(toolName) === 'RED'
}

/**
 * Set of all RED-tier tool names. Used by the UI to decide which tools
 * trigger the full-text preview modal vs the simple yes/no confirmation.
 */
export const RED_TIER_TOOLS = new Set<string>(
  Object.entries(TOOL_APPROVAL_TIERS)
    .filter(([, tier]) => tier === 'RED')
    .map(([name]) => name),
)

/**
 * Set of all YELLOW-tier tool names.
 */
export const YELLOW_TIER_TOOLS = new Set<string>(
  Object.entries(TOOL_APPROVAL_TIERS)
    .filter(([, tier]) => tier === 'YELLOW')
    .map(([name]) => name),
)

/**
 * Set of all GREEN-tier tool names.
 */
export const GREEN_TIER_TOOLS = new Set<string>(
  Object.entries(TOOL_APPROVAL_TIERS)
    .filter(([, tier]) => tier === 'GREEN')
    .map(([name]) => name),
)
