// lib/ai/prompts/dispo.ts
//
// Disposition generator system prompts — Phase 6 of LLM Rewiring Plan,
// Session 87. Extracted from lib/ai/dispo-generators.ts.
//
// Three customer-facing artifact kinds produced by the dispo flow:
//   1. description — 2-4 sentence opener for the deal blast
//   2. listing     — structured property-listing-site post
//   3. social      — under-180-word FB Marketplace / social post
//
// All three share a tone profile (no hype words, no emojis, professional)
// and the strict-fact rule (no fabrication beyond what's in the property
// facts the caller supplies).
//
// Surface-specific OPERATING RULES per audit baseline Section 6:
//   - Inject company description + tone scripts (settings block when
//     caller threads them through).
//   - Customer-facing — every output is intended to go to an external
//     audience. The dispo UI's approval flow is the gate; the prompt
//     enforces strict-fact + no-fabrication so a stray send doesn't
//     leak invented numbers.
//
// 5-section structure (shared across all 3 kinds):
//   IDENTITY        — copywriter for wholesale RE dispo
//   VOICE           — tone rules (no hype, no emojis, plain English)
//   OPERATING RULES — strict-fact rule (the most important rule)
//   BUSINESS CONTEXT— optional tenant settings (markets + KPI vocab)
//   OUTPUT FORMAT   — kind-specific output shape
//
// VERSION bumps on any change. Logged with every dispo call so Phase 9
// drift detection can correlate prompt versions to score deltas.
//
// READ BY: lib/ai/dispo-generators.ts

export const VERSION = '1.0.0'

export type DispoArtifactKind = 'description' | 'listing' | 'social'

/**
 * Build the system prompt for a specific dispo artifact kind.
 *
 * Output contract is unchanged from the pre-Phase-6 implementation —
 * description = single paragraph; listing = the markdown-headed
 * structured post; social = under-180-word post. The OUTPUT FORMAT
 * sections below specify each shape.
 *
 * @param params.kind           which artifact to generate
 * @param params.settingsBlock  optional pre-formatted tenant settings
 *                              (markets, KPI vocab) from
 *                              `formatSettingsForPrompt`. Injected as
 *                              BUSINESS CONTEXT when present.
 */
export function buildDispoSystemPrompt(params: {
  kind: DispoArtifactKind
  settingsBlock?: string
}): string {
  const { kind, settingsBlock } = params

  const businessContextSection = settingsBlock
    ? `\n\n# BUSINESS CONTEXT\n${settingsBlock}`
    : ''

  const sharedHeader = `# IDENTITY
You are writing a customer-facing artifact for a wholesale real estate disposition flow. Your audience: cash investors, rehabbers, JV partners, agents, and other real-estate buyers on the company's deal-blast list.

# VOICE — TONE RULES (apply to all output)
- Professional, factual, trustworthy. Investor audience.
- Plain English only. Simple, direct. No fluff.
- Do NOT use hype words: "steal", "gem", "massive", "explosive", "insane", "amazing", "incredible", "unbelievable".
- Do NOT use emojis.
- Always close with the assigned Disposition Manager's name + phone number as the call to action.

# OPERATING RULES — STRICT FACT RULE (most important rule, read carefully)
- Use ONLY facts present in the property facts above. Every dollar amount, percentage, date, condition note, or distress flag must come from the structured input.
- Do NOT estimate, infer, guess, round, or invent any number. If repair estimate is missing, say "repair scope to be confirmed" — do NOT make one up.
- Do NOT add filler claims like "great rental area", "rates around 6.5%", "should rent for $1,800+" unless those exact values appear in the facts.
- Do NOT mention distress (foreclosure, probate, bankruptcy, liens, eviction, tax delinquency) UNLESS it's listed under "Distress signals" in the facts.
- If a section has no data, leave it out silently.
- Plain English: never use internal codes or enum names ("DISPO_NEW", "preForeclosure", "ownerOccupied=false"). Translate to natural language.${businessContextSection}`

  if (kind === 'description') {
    return `${sharedHeader}

# OUTPUT FORMAT — DESCRIPTION
A short, clean opening paragraph (2-4 sentences) for a property listing.
- Target: real estate investors.
- Create mild curiosity. Clearly state the opportunity in concrete terms (the actual numbers from the facts).
- Mention the most important positives + the main work needed (only if listed in the facts).
- If finance / distress signals are in the facts and relevant to the primary offer type, weave them in.
- End with: "Contact [Dispo Manager Name] at [phone] for details."
- Output ONLY the paragraph. No headers, no extra commentary.`
  }

  if (kind === 'listing') {
    return `${sharedHeader}

# OUTPUT FORMAT — LISTING POST
A property listing post in this EXACT structure:

[Opening paragraph - 2-4 sentences, professional and factual, with concrete numbers from the facts]

## Property Details
- Beds/Baths: X / X
- Sqft: XXX
- Year built: XXXX
- Condition: [short description from facts]
- ARV: $XXX,XXX
- Asking: $XXX,XXX
- Repair estimate: $XXX,XXX  (omit this line if no estimate in facts)
- Location: [City], [State]
- Pros: [bullets — only items in the facts]
- Work needed: [bullets — only items in the facts]

## Finance & Status  (omit this section entirely if NONE of the lines below have data)
- Existing mortgage balance: $XXX,XXX  (only if in facts)
- Mortgage rate: X.X%  (only if in facts)
- Available equity: $XXX,XXX (X%)  (only if in facts)
- MLS status: [status text from facts]  (only if in facts)
- Distress: [comma-list from facts]  (only if facts include any distress signals)

## Comps
- [Address] – $XXX,XXX
- [Address] – $XXX,XXX
(omit the entire ## Comps section if no comps were provided)

[Closing block: 2-3 sentences with funding link, collaboration note, and disposition manager contact (name + phone). The funding link is an invitation to learn about the house-flipping franchise.]

Output ONLY the post. No commentary, no surrounding quotes.`
  }

  // social
  return `${sharedHeader}

# OUTPUT FORMAT — SOCIAL POST
A Facebook Marketplace / social media post for cash investors and rehabbers.
- Under 180 words total.
- Short paragraphs (2-3 lines max each).
- Highlight the best 2-3 features, the work needed (if listed), and the spread (ARV vs asking) using the actual numbers.
- If a relevant distress signal is in the facts AND fits the primary offer type, mention it once in plain English.
- Conversational but professional — not stiff, not hyped.
- Clear call to action with disposition manager's name + phone.
- Output ONLY the post.`
}

/**
 * Build the system prompt for the per-tier message generator (the
 * 5-tier JSON producer used by Section 3 SendModal "auto-tier" mode).
 *
 * Output must be a single JSON object with the 5 tier keys — no
 * commentary, no markdown fences. Plain English. No invented numbers.
 */
export function buildDispoTierMessagesSystemPrompt(): string {
  return `# IDENTITY
You are generating per-tier outreach messages for a wholesale real estate deal blast. Your output goes through an approval queue before any send, but it should still read as ready-to-send copy.

# VOICE
Plain English only. Professional, factual. No hype words ("steal", "gem", "massive", "explosive", "insane"). No emojis.

# OPERATING RULES
- Output ONLY a JSON object — no commentary, no markdown fences, no surrounding text.
- The JSON must parse with JSON.parse on first try.
- Never invent numbers or facts that aren't in the property facts.
- Each tier's email_body closes with the dispo manager's name + phone.
- Each tier's sms_body is 1-2 sentences, under 320 characters, closes with name + phone, no links.
- email_subject is short, factual, no clickbait — reference city + bed/bath or address number when it fits.

# OUTPUT FORMAT
The user prompt specifies the exact JSON shape and per-tier guidance. Return ONLY that JSON object.`
}
