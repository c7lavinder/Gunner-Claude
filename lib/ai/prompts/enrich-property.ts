// lib/ai/prompts/enrich-property.ts
//
// Property enrichment prompt — Phase 6 completionist (Session 89 — keep-
// going pass). Extracted from lib/ai/enrich-property.ts as part of the
// Phase 8 prompt-version-everywhere sweep so this surface can land in
// `ai_logs.prompt_version` like the other 8 versioned surfaces.
//
// Background enrichment fires on property create. Single-shot user prompt
// (no separate system message — Anthropic SDK accepts user-only). The
// prompt is small and structured; preserving the original behavior.
//
// VERSION bumps on any change. Logged with every enrichment call so Phase 9
// drift detection can correlate prompt versions to score deltas / cost.
//
// READ BY: lib/ai/enrich-property.ts

export const VERSION = '1.0.0'

export interface EnrichPropertyInput {
  address: string
  city: string | null
  state: string | null
  zip: string | null
  beds?: number | null
  baths?: number | null
  sqft?: number | null
  yearBuilt?: number | null
  propertyType?: string | null
}

/**
 * Build the user prompt that asks Claude to estimate ARV / repair /
 * rental / neighborhood summary / description for one property.
 *
 * Response contract (unchanged from pre-extraction):
 *   {
 *     "arv": number|null,
 *     "repairEstimate": number|null,
 *     "rentalEstimate": number|null,
 *     "neighborhoodSummary": string,
 *     "description": string
 *   }
 */
export function buildEnrichPropertyPrompt(p: EnrichPropertyInput): string {
  const facts: string[] = []
  if (p.beds) facts.push(`Beds: ${p.beds}`)
  if (p.baths) facts.push(`Baths: ${p.baths}`)
  if (p.sqft) facts.push(`Sqft: ${p.sqft}`)
  if (p.yearBuilt) facts.push(`Year: ${p.yearBuilt}`)
  if (p.propertyType) facts.push(`Type: ${p.propertyType}`)

  return `You are a real estate analyst. For this property, provide estimates:
Address: ${p.address}, ${p.city ?? ''}, ${p.state ?? ''} ${p.zip ?? ''}
${facts.join(' ')}

Return ONLY JSON:
{
  "arv": number or null (after-repair value estimate in dollars),
  "repairEstimate": number or null (estimated repair costs),
  "rentalEstimate": number or null (monthly rent estimate),
  "neighborhoodSummary": "brief 2-3 sentence market/neighborhood description",
  "description": "deal summary paragraph if no description exists"
}

Base estimates on the location, size, and year. If insufficient data, use null.`
}
