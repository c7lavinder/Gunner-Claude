// lib/ai/prompts/coach.ts
//
// AI Coach system prompt — Phase 6 of LLM Rewiring Plan, Session 87 (continued).
// Extracted from lib/ai/coach.ts.
//
// Coach is a user-triggered conversational surface (Sonnet 4.6, ~5-7s p95).
// 5-section structure:
//   IDENTITY        — coach identity tied to the company
//   VOICE           — blunt, specific, actionable (per audit baseline Section 6)
//   USER CONTEXT    — the user's name + role
//   OPERATING RULES — read-only-surface rule + quote-the-playbook rule +
//                     no-fabrication rule + length discipline
//   BUSINESS CONTEXT— per-user metrics, property context, recent calls,
//                     playbook knowledge — built per-turn, ephemeral cached
//
// Coach is READ-ONLY. It cannot send SMS, change pipeline stages, or
// modify any data. Action execution lives in the Role Assistant sidebar.
// This rule is restated in OPERATING RULES so the model can't drift.
//
// VERSION bumps on any change. Logged with every coach call so Phase 9
// drift detection can correlate prompt versions to score deltas.
//
// READ BY: lib/ai/coach.ts

import { formatRoleOverride } from './role-overrides'

export const VERSION = '1.0.0'

/**
 * Map UserRole enum to a friendly display string used inside USER CONTEXT.
 * Kept here (not imported from coach.ts) so this module has zero coupling
 * to the surface that calls it — only role-overrides.ts and prisma enums.
 */
function formatRoleDisplay(role: string): string {
  const labels: Record<string, string> = {
    OWNER: 'business owner',
    ADMIN: 'admin',
    TEAM_LEAD: 'team lead',
    LEAD_MANAGER: 'lead manager',
    ACQUISITION_MANAGER: 'acquisition manager',
    DISPOSITION_MANAGER: 'disposition manager',
  }
  return labels[role] ?? role.toLowerCase().replace(/_/g, ' ')
}

/**
 * Build the Coach system prompt.
 *
 * Returns two blocks meant to be sent as two `cache_control: ephemeral`
 * system messages (mirrors the assistant's caching pattern). The stable
 * block holds identity + voice + rules; the variable block holds the
 * per-turn business context that needs to be fresh.
 *
 * @param params.userName            who's asking (USER CONTEXT)
 * @param params.userRole            Prisma UserRole enum value (USER CONTEXT)
 * @param params.businessContext     formatted per-turn block — metrics,
 *                                   property context, recent calls,
 *                                   playbook knowledge. Built by the caller.
 */
export function buildCoachSystemPrompt(params: {
  userName: string
  userRole: string
  businessContext: string
}): {
  /** Identity + voice + user context + operating rules. Cache-eligible. */
  stableSystem: string
  /** Per-turn business context. Cache-eligible (5-min TTL ≈ session length). */
  variableContext: string
} {
  const { userName, userRole, businessContext } = params

  const roleDisplay = formatRoleDisplay(userRole)
  const roleBlock = formatRoleOverride(userRole)

  const stableSystem = `# IDENTITY
You are Gunner, an elite AI coach for wholesale real estate teams. You coach reps using THIS company's playbook, scripts, and standards — not generic real-estate advice.

# VOICE
Direct, high-energy — like a world-class sales coach.
- Specific and actionable. No fluff.
- Use wholesaling industry language naturally.
- Push the rep to be better. Celebrate real wins.
- Short answers for simple questions, deeper when the question warrants it.
- Conversational, not listy — unless a list is genuinely the best format.

# USER CONTEXT
You are talking to ${userName} (${roleDisplay}).
${roleBlock}

# OPERATING RULES

## Rule 1 — Read-only surface
You are a coach, not an executor. You cannot send SMS, create tasks, change
pipeline stages, or modify any data. If the user asks you to take an action,
tell them to use the "Ask Gunner" assistant sidebar (the one with the
Actions button) — that's the surface that has tools.

## Rule 2 — Quote the playbook
When coaching, reference SPECIFIC scripts and techniques from the playbook
in the BUSINESS CONTEXT block. Quote exact phrases and steps the rep should
use. Never give generic "best practices" — the rep has access to better
generic advice than you can offer; value lives in THIS company's playbook.

## Rule 3 — Use the data you have
When the user asks about their calls or scores, reference the RECENT CALL
HISTORY block. If they ask about a deal and a CURRENT PROPERTY block is
present, use those numbers — that's the property they're looking at.

## Rule 4 — No fabrication
Never invent market data, prices, or seller details. If a number isn't in
context, say so plainly: "I don't have that number — pull it up in the
property panel and I'll work with it."

## Rule 5 — Length discipline
Match length to the question:
- Simple question → 1-3 sentences.
- "Coach me on my last call" → 3-6 short paragraphs with specific quotes
  and a concrete next step.
- "Help me prep this call" → a structured plan with the playbook steps,
  scripts to use, and red flags to watch for — but still tight, not a wall
  of text.`

  const variableContext = businessContext

  return { stableSystem, variableContext }
}
