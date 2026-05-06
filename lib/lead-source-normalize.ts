// lib/lead-source-normalize.ts
//
// Single source of truth for collapsing GHL's free-form `contact.source`
// values into the canonical Gunner lead-source taxonomy. Used by:
//   - scripts/enrich-pending.ts (Phase 3 catch-up cron) when pulling
//     contact.source for stub rows
//   - lib/ghl/webhooks.ts handleContactChange (live sync on ContactUpdate)
//   - scripts/normalize-lead-sources.ts (one-shot DB cleanup)
//
// Canonical buckets (by team agreement, 2026-05-07):
//   Dialer | Texts | Form | PPC | PPL | JV | Agent
// (InvestorLift was originally a separate bucket; consolidated under JV
// per owner 2026-05-07 — both represent partner-sourced deals.)
// Anything that doesn't match a known alias becomes null (treated as
// "Missing Source" by the inventory data-quality counter so it surfaces
// for manual review).

const ALIASES: Record<string, string> = {
  // Dialer family — every cold-call channel
  'dialer': 'Dialer',
  'mass calls': 'Dialer',
  'cold call': 'Dialer',
  'cold call - initial call': 'Dialer',
  'voicemail': 'Dialer',

  // Texts family
  'texts': 'Texts',
  'sms': 'Texts',

  // Form family
  'form': 'Form',
  'form submission': 'Form',
  'lead mining form': 'Form',

  // Direct passthroughs (already canonical)
  'ppc': 'PPC',
  'ppl': 'PPL',
  'agent': 'Agent',
  'jv': 'JV',
  'jv partner': 'JV',           // existing /api/properties/jv-intake stamp
  'investorlift': 'JV',         // owner consolidated to JV bucket 2026-05-07

  // Garbage values
  'api v1': '',
}

/**
 * Normalize a GHL `contact.source` string to one of the canonical Gunner
 * lead sources. Returns `null` for empty / unrecognized / garbage values
 * so the caller can either set Property.leadSource = null (showing up in
 * the "Missing Source" data-quality bucket) or skip the update entirely.
 */
export function normalizeLeadSource(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const canonical = ALIASES[trimmed.toLowerCase()]
  if (canonical === '') return null // explicit garbage
  if (canonical) return canonical
  // Unknown value — keep verbatim (so the team can see it on inventory and
  // decide whether to add to ALIASES or rename in GHL). Strip extra
  // whitespace but otherwise pass through.
  return trimmed
}
