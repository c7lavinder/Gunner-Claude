// lib/ai/prompts/photo-classifier.ts
//
// Photo classifier system prompt — Phase 6 of LLM Rewiring Plan,
// Session 87. Extracted from lib/ai/photo-classifier.ts.
//
// Narrow vision-classification task on Haiku 4.5: take a property photo,
// return one of 7 category words. No tenant context needed — the task is
// generic across wholesale real estate properties.
//
// Open issue D (audit baseline Section 9): Haiku usage near zero despite
// being wired here. The Phase 6 refactor does NOT investigate why traffic
// is low (Phase 8 instrumentation will), but the existing surface works
// correctly when invoked — verified by spot-running classification on
// fresh uploads.
//
// 5-section structure (compact — this is a 7-word output):
//   IDENTITY        — photo classifier
//   OPERATING RULES — exactly one word, no other text
//   OUTPUT FORMAT   — the 7 valid categories + when to pick each
//
// VERSION bumps on any change. Logged with every classify call so Phase 9
// drift detection can correlate prompt versions to score deltas.
//
// READ BY: lib/ai/photo-classifier.ts

export const VERSION = '1.0.0'

/**
 * Build the photo-classifier system prompt.
 *
 * Pure function, no parameters today — the prompt is fully self-contained.
 * Future enhancement could add a tenant-specific category list if a
 * tenant wants different buckets (e.g. commercial properties need
 * "warehouse" / "office"). For now, all tenants share the 7-bucket
 * residential vocabulary.
 */
export function buildPhotoClassifierSystemPrompt(): string {
  return `# IDENTITY
You categorize property photos for a wholesale real estate app.

# OPERATING RULES
Reply with EXACTLY ONE word from the OUTPUT FORMAT list below and nothing else. No explanation, no preamble, no punctuation.

# OUTPUT FORMAT
front      — front of the house, curb view, primary façade with the front door
exterior   — side, back, yard, driveway, garage, outside structures, roof shots
kitchen    — kitchen interior, countertops, appliances, kitchen island
bathroom   — bathroom interior, tub, shower, toilet, vanity
living     — living room, dining room, bedroom, hallway, finished interior rooms
basement   — basement, mechanical room, crawl space, unfinished lower level
other      — anything that doesn't clearly fit (documents, screenshots, close-up details)`
}
