// lib/ai/role-gates.ts
// Role-based capability gates for the Role Assistant tools.
//
// Rule 4 (CLAUDE.md): "Prompt instructions are not security boundaries."
// The system prompt tells Claude not to do certain things, but Claude can
// be coaxed. The only durable boundary is a code-level check. This file
// is that check.
//
// Defense in depth — gate at TWO places:
//  1. Tool *filter* in app/api/ai/assistant/route.ts — Claude never sees
//     forbidden tools. Cheaper, friendlier, but a client could still POST
//     a forged toolCallId.
//  2. Tool *enforcement* in app/api/ai/assistant/execute/route.ts — refuse
//     with 403 if the actor's role isn't on the allow-list for that tool.
//
// To add a new tool: add it to ROLE_TOOL_MATRIX with its allow-list. If
// you don't list it, OWNER + ADMIN can use it by default (see canUseTool).
//
// UserRole enum (prisma/schema.prisma:187): OWNER, ADMIN, TEAM_LEAD,
// LEAD_MANAGER, ACQUISITION_MANAGER, DISPOSITION_MANAGER

import type { UserRole } from '@prisma/client'

// All roles — keep this in sync with prisma UserRole enum.
const ALL_ROLES: UserRole[] = [
  'OWNER',
  'ADMIN',
  'TEAM_LEAD',
  'LEAD_MANAGER',
  'ACQUISITION_MANAGER',
  'DISPOSITION_MANAGER',
]

// Helper sets — readability shortcuts for the matrix below.
const ADMIN_ONLY: UserRole[] = ['OWNER', 'ADMIN']
const MANAGERS: UserRole[] = ['OWNER', 'ADMIN', 'TEAM_LEAD', 'LEAD_MANAGER', 'ACQUISITION_MANAGER', 'DISPOSITION_MANAGER']
const ACQ_PLUS_ADMIN: UserRole[] = ['OWNER', 'ADMIN', 'TEAM_LEAD', 'ACQUISITION_MANAGER']
const DISPO_PLUS_ADMIN: UserRole[] = ['OWNER', 'ADMIN', 'TEAM_LEAD', 'DISPOSITION_MANAGER']

// Tools the OPS team (everyone) can use — read/light-touch actions.
const EVERYONE: UserRole[] = ALL_ROLES

/**
 * ROLE_TOOL_MATRIX — single source of truth for who can use what.
 *
 * Categorization principles:
 *  - Tenant/team admin (roles, billing, pipeline config): OWNER + ADMIN only.
 *  - Acquisition-only (negotiating, offers, deal intel): ACQ_PLUS_ADMIN.
 *  - Disposition-only (blasts, buyer management): DISPO_PLUS_ADMIN.
 *  - Manager-only writes (regrade, reclassify, mark reviewed): MANAGERS.
 *  - Read/light-touch (add note, query, summarize, schedule SMS to known
 *    contacts on their property): EVERYONE.
 *  - HIGH-STAKES bulk actions (sms_blast, email_blast, bulk_tag): managers
 *    only, AND require approval gate (see lib/gates/requireApproval.ts).
 */
export const ROLE_TOOL_MATRIX: Record<string, UserRole[]> = {
  // ─── Admin / tenant-config — OWNER + ADMIN only ───
  update_user_role: ADMIN_ONLY,
  update_pipeline_config: ADMIN_ONLY,
  set_kpi_goals: ADMIN_ONLY,
  invite_team_member: ADMIN_ONLY,

  // ─── High-stakes bulk — managers + admin only, plus approval gate ───
  send_sms_blast: MANAGERS,
  send_email_blast: MANAGERS,
  bulk_tag_contacts: MANAGERS,

  // ─── Acquisition workflow ───
  log_offer: ACQ_PLUS_ADMIN,
  log_counter_offer: ACQ_PLUS_ADMIN,
  log_milestone: ACQ_PLUS_ADMIN,
  update_deal_intel: ACQ_PLUS_ADMIN,
  approve_all_deal_intel: ACQ_PLUS_ADMIN,
  calculate_mao: EVERYONE, // pure calc, no write
  create_opportunity: ACQ_PLUS_ADMIN,
  update_opportunity_status: ACQ_PLUS_ADMIN,
  update_opportunity_value: ACQ_PLUS_ADMIN,
  change_pipeline_stage: ACQ_PLUS_ADMIN,

  // ─── Disposition workflow ───
  generate_deal_blast: DISPO_PLUS_ADMIN,
  add_buyer: DISPO_PLUS_ADMIN,
  update_buyer: DISPO_PLUS_ADMIN,
  move_buyer_in_pipeline: DISPO_PLUS_ADMIN,
  rematch_buyers: DISPO_PLUS_ADMIN,

  // ─── Property writes (team-level) ───
  update_property: MANAGERS,
  change_property_status: MANAGERS,
  add_team_member_to_property: MANAGERS,
  remove_team_member: MANAGERS,
  set_property_markets: MANAGERS,
  set_project_types: MANAGERS,
  trigger_property_enrichment: MANAGERS,
  add_contact_to_property: MANAGERS,
  remove_contact_from_property: MANAGERS,
  add_internal_note: MANAGERS,
  create_comp_analysis: MANAGERS,

  // ─── Call writes (manager-level — calibration affects AI training) ───
  regrade_call: MANAGERS,
  reclassify_call: MANAGERS,
  mark_call_reviewed: MANAGERS,
  flag_calibration: MANAGERS,
  generate_next_steps: EVERYONE,
  push_next_step: EVERYONE,

  // ─── GHL contact actions (anyone can touch their own contacts) ───
  send_sms: EVERYONE,
  send_email: EVERYONE,
  add_note: EVERYONE,
  create_task: EVERYONE,
  update_task: EVERYONE,
  complete_task: EVERYONE,
  schedule_sms: EVERYONE,
  schedule_email: EVERYONE,
  create_contact: EVERYONE,
  update_contact: EVERYONE,
  assign_contact_to_user: MANAGERS,
  add_tags_to_contact: EVERYONE,
  remove_tags_from_contact: EVERYONE,
  add_contact_to_workflow: EVERYONE,
  remove_contact_from_workflow: EVERYONE,

  // ─── Calendar ───
  create_appointment: EVERYONE,
  reschedule_appointment: EVERYONE,
  cancel_appointment: EVERYONE,
  update_appointment_status: EVERYONE,

  // ─── Information / read-only — everyone ───
  summarize_property: EVERYONE,
  // The 13 dispatcher tools below were removed in Phase 3b (Session 86,
  // 2026-05-13). Entries kept here as deprecation markers — canUseTool
  // still returns admin-only for tool names not in this map. If/when
  // the assistant somehow invokes them, the execute endpoint will refuse
  // for non-admins by default. See docs/TOOL_AUDIT.md for replacement map.
  // Removed: call_analysis, deal_blast_info, deal_health, compare_deals,
  // what_next, rep_performance, team_overview, pipeline_health,
  // explain_field, contact_objections, seller_profile, title_risk,
  // market_analysis.

  // ─── Query tools (Phase B) — everyone can read ───
  query_properties: EVERYONE,
  search_calls: EVERYONE,
  semantic_search_calls: EVERYONE,
  query_tasks: EVERYONE,
  get_kpi_metrics: EVERYONE,
  get_team_performance: MANAGERS, // performance data — managers only
  query_sellers: EVERYONE,
  query_buyers: EVERYONE,
  get_ghl_pipeline_state: EVERYONE,
  cross_entity_query: EVERYONE,
  find_similar_deals: EVERYONE,
}

/**
 * Resolve a string role (e.g. ctx.userRole from withTenant) into a typed
 * UserRole, or null if it's not recognized. Defensive: never trust the
 * session blindly — an invalid role here means deny everything.
 */
export function normalizeRole(role: string | null | undefined): UserRole | null {
  if (!role) return null
  if (ALL_ROLES.includes(role as UserRole)) return role as UserRole
  return null
}

/**
 * canUseTool — the single function every gate calls.
 *
 * Default-deny philosophy: if the tool is not in ROLE_TOOL_MATRIX, only
 * OWNER + ADMIN can use it. This means newly-added tools fail closed
 * until someone explicitly grants other roles access.
 */
export function canUseTool(toolName: string, role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  if (!normalized) return false

  const allowed = ROLE_TOOL_MATRIX[toolName]
  if (!allowed) {
    // Unknown tool — default-deny to admin-only. Forces explicit allow-listing.
    return ADMIN_ONLY.includes(normalized)
  }

  return allowed.includes(normalized)
}

/**
 * filterToolsForRole — used by the assistant route to drop tools Claude
 * is not allowed to even propose. Cheaper than rejecting at execute time,
 * and makes the prompt smaller for limited roles.
 */
export function filterToolsForRole<T extends { name: string }>(
  tools: readonly T[],
  role: string | null | undefined,
): T[] {
  const normalized = normalizeRole(role)
  if (!normalized) return []
  return tools.filter(t => canUseTool(t.name, normalized))
}

/**
 * HIGH_STAKES_TOOLS — tools that must additionally pass through the
 * approval gate (lib/gates/requireApproval.ts) regardless of role.
 *
 * Phase 4 (Session 86, 2026-05-13): replaced the hard-coded 5-tool set
 * with a derived view of the tier system in `lib/ai/approval-tiers.ts`.
 * The high-stakes class is now equivalent to RED-tier — tools that need
 * the FULL-TEXT preview modal before sending.
 *
 * For YELLOW-tier tools (state mutations like change_property_status),
 * the execute endpoint enforces approval via `requiresExplicitApproval()`
 * directly from the tier module — see app/api/ai/assistant/execute/route.ts.
 *
 * Kept as `HIGH_STAKES_TOOLS` for backwards compatibility with existing
 * call sites. New code should import from `lib/ai/approval-tiers.ts`.
 */
import { RED_TIER_TOOLS, requiresExplicitApproval } from './approval-tiers'
export const HIGH_STAKES_TOOLS = RED_TIER_TOOLS

/**
 * isHighStakes — server-side check used by the execute endpoint to refuse
 * actions that the client did not explicitly mark as approved.
 *
 * Phase 4 expansion: previously only the 5-tool HIGH_STAKES_TOOLS set
 * required approval. Now any RED or YELLOW tool requires approval, per
 * the traffic-light rule in lib/ai/prompts/assistant.ts.
 *
 * The execute endpoint calls this on every request. If true and
 * `approved !== true`, the request returns 409 requiresApproval.
 */
export function isHighStakes(toolName: string): boolean {
  return requiresExplicitApproval(toolName)
}
