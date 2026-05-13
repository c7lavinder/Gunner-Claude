// lib/ai/prompts/role-overrides.ts
//
// Phase 2 of the LLM Rewiring Plan — System Prompt Overhaul.
// One paragraph per role. Injected into every system prompt's USER CONTEXT
// section so the assistant frames answers around what the role actually does.
//
// READ BY: every prompt file in lib/ai/prompts/

export interface RoleOverride {
  role: string                // Prisma UserRole enum
  displayName: string         // human-readable
  responsibilities: string    // what they own day-to-day
  successLooksLike: string    // their KPI goals + behavioral wins
  failureModes: string        // the mistakes the assistant should flag
  toneForThem: string         // how to talk to this role specifically
}

export const ROLE_OVERRIDES: Record<string, RoleOverride> = {
  OWNER: {
    role: 'OWNER',
    displayName: 'Owner / CEO',
    responsibilities:
      'Strategy, hiring, team performance, financial health, vendor decisions. Not on dial roster.',
    successLooksLike:
      'Team hitting KPIs, deal flow healthy, cost-per-deal trending down, no fires.',
    failureModes:
      'Drifting into IC work. Optimizing what the team should own.',
    toneForThem:
      'Executive-summary first. Numbers, not narratives. Surface team-level patterns; the owner does not want per-rep coaching from you.',
  },

  ADMIN: {
    role: 'ADMIN',
    displayName: 'Admin / Ops',
    responsibilities:
      'Lead intake, task assignment, GHL hygiene, appointment booking, transactional ops. Not on dial roster.',
    successLooksLike:
      'Every lead routed in <15 min. No tasks falling through. Calendar conflicts caught before they happen.',
    failureModes:
      'Missing duplicate leads. Tasks created without owner. Old leads never archived.',
    toneForThem:
      'Operational and procedural. Confirm-before-act on bulk operations. Surface anomalies (dupes, gaps).',
  },

  TEAM_LEAD: {
    role: 'TEAM_LEAD',
    displayName: 'Team Lead / Manager',
    responsibilities:
      'Coaching reps, reviewing calls, weekly 1:1s, ensuring playbook adherence, escalation handler.',
    successLooksLike:
      'Reps trending up on rubric scores. Coaching priorities translating into behavior change. Hot leads not stalling.',
    failureModes:
      'Reviewing surface metrics instead of call quality. Letting weak reps drift. Skipping playbook references during coaching.',
    toneForThem:
      'Coaching-focused. Reference specific reps, specific call moments, specific playbook steps. Never generic "best practices."',
  },

  LEAD_MANAGER: {
    role: 'LEAD_MANAGER',
    displayName: 'Lead Manager',
    responsibilities:
      'Inbound + warm-transfer calls. Qualify motivation, extract deal intel, set appointments for Acquisition. KPI: 150 dials, 20 convos, 3 appointments per day.',
    successLooksLike:
      'High convo rate, appointments that show up, complete deal-intel capture on every call.',
    failureModes:
      'Skipping motivation questions. Setting appointments without confirming decision-maker. Letting follow-ups slip.',
    toneForThem:
      'Tactical. Reference specific scripts, motivation questions, and recent calls. Coaching tied to today\'s actions.',
  },

  ACQUISITION_MANAGER: {
    role: 'ACQUISITION_MANAGER',
    displayName: 'Acquisition Manager',
    responsibilities:
      'Walkthroughs, offer calls, negotiation, signing purchase agreements. KPI: 50 calls, 4 offers, 1 contract per day.',
    successLooksLike:
      'Offers built on real ARV/repair logic. Strong post-offer follow-through. Contracts close without title surprises.',
    failureModes:
      'Delivering offer numbers without offer logic. Exiting calls when price gaps appear. No follow-up path on no-decision calls.',
    toneForThem:
      'Negotiation-focused. Quote the 10-Step Close. Reference offer logic (ARV × 70% − repairs − fee). Push back on weak frame.',
  },

  DISPOSITION_MANAGER: {
    role: 'DISPOSITION_MANAGER',
    displayName: 'Disposition Manager',
    responsibilities:
      'Selling contracted deals to buyer list. KPI: 500 properties pushed, 3 dispo offers, 1 dispo contract per day.',
    successLooksLike:
      'High buyer engagement on blasts. Clean walkthrough logistics. Backup buyers warm.',
    failureModes:
      'Blasting weak deals. Letting buyer conversations stall. No backup buyer when primary falls through.',
    toneForThem:
      'Distribution-focused. Reference buyer fit (markets, buy box, recent purchases). Track which buyers are warm vs cold.',
  },
}

/**
 * Get the override block for a role, with safe fallback for unknown roles.
 */
export function getRoleOverride(role: string | null | undefined): RoleOverride | null {
  if (!role) return null
  return ROLE_OVERRIDES[role] ?? null
}

/**
 * Render the role override as a compact prompt block.
 * Used inside the USER CONTEXT section of every assistant-style prompt.
 */
export function formatRoleOverride(role: string | null | undefined): string {
  const ro = getRoleOverride(role)
  if (!ro) return ''
  return [
    `Role: ${ro.displayName}`,
    `Owns: ${ro.responsibilities}`,
    `Wins look like: ${ro.successLooksLike}`,
    `Watch for: ${ro.failureModes}`,
    `Tone: ${ro.toneForThem}`,
  ].join('\n')
}
