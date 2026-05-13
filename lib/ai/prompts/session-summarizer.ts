// lib/ai/prompts/session-summarizer.ts
//
// Cross-session memory summarizer — Phase 6 of LLM Rewiring Plan,
// Session 87. Extracted from lib/ai/session-summarizer.ts.
//
// Haiku 4.5, runs end-of-session or every N messages. Compresses a day's
// assistant conversation into a 1-paragraph rollup + 3-6 key facts. The
// rollup loads as `# RECENT HISTORY` context in the next day's session
// via `getRecentSessionMemory`.
//
// Surface-specific OPERATING RULES:
//   - 3-5 sentences max, no bullets, past tense, third person.
//   - Mention specific entities (people, addresses, deals) — those are
//     the memory hooks the next session needs.
//   - End with open threads so the next session knows what's pending.
//   - Output a two-section structure (SUMMARY + KEY_FACTS) so the
//     parser can extract structured key-facts alongside the prose.
//
// Open issue D (audit baseline Section 9): Haiku usage near zero despite
// being wired here. Likely cause: assistant sessions short enough that
// `messages.length < 4` skips summarization on most days. Phase 8
// instrumentation will quantify; not addressed in this refactor.
//
// No tenant settings injection — this is a meta task summarizing the
// user's own conversation. Adding tenant context would bloat the prompt
// without improving summary quality.
//
// 5-section structure (compact):
//   IDENTITY        — memory writer
//   VOICE           — terse, factual, no fluff
//   OPERATING RULES — length, tense, entity specificity, output shape
//   OUTPUT FORMAT   — the two-section SUMMARY + KEY_FACTS shape
//
// VERSION bumps on any change. Logged with every summarize call so
// Phase 9 drift detection can correlate prompt versions to score deltas.
//
// READ BY: lib/ai/session-summarizer.ts

export const VERSION = '1.0.0'

/**
 * Build the session-summarizer system prompt.
 *
 * Pure function, no parameters today. The transcript itself is the user
 * message; the system prompt is fully static.
 */
export function buildSessionSummarizerSystemPrompt(): string {
  return `# IDENTITY
You write 1-paragraph memory summaries of AI assistant conversations. The summary will be loaded as context in future conversations so the assistant remembers what was discussed.

# VOICE
Specific, factual, terse. Past tense. Third person ("the user asked about X"). No fluff. No restating context the reader already has.

# OPERATING RULES
- 3-5 sentences MAX. No bullet points.
- Lead with the user's main goal or topic.
- Mention specific entities by name (people, properties, deals, dollar amounts).
- Note any commitments made or actions taken.
- End with anything still open or pending — that's the hook the next session needs.

# OUTPUT FORMAT
Return exactly two sections — nothing else:

SUMMARY: <one paragraph, 3-5 sentences>
KEY_FACTS: <comma-separated list of 3-6 specific facts (names, addresses, decisions, dollar amounts, dates)>

The parser is strict about these two labels — emit them in this exact order, in uppercase, with the colon.`
}
