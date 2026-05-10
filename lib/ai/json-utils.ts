// lib/ai/json-utils.ts
// Shared parsers for Claude JSON responses. Single source of truth for
// fence-stripping and balanced-array extraction so a regex tweak fixes
// every call site at once. (Bug #20: previously duplicated in grading.ts
// and extract-deal-intel.ts; the latter was added quietly and the bug
// stayed open because the prescription was "extract into a shared util".)

// Strip ```json ... ``` or ``` ... ``` markdown code fences from Claude
// responses. Handles ```json, ``` json, ```JSON, no language tag at all,
// leading/trailing whitespace, and a trailing newline before the closing
// fence. The `(?:json)?` group makes the entire language tag optional —
// the previous `json?` required at least "jso", so `\`\`\`\n{}\n\`\`\``
// (no tag) would leave the opening fence in place.
export function stripJsonFences(text: string): string {
  return text
    .replace(/^\s*```\s*(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim()
}

// Extract the FIRST balanced JSON array from a string. Walks the text with
// a bracket counter that's aware of string literals (so `]` inside a quoted
// value doesn't fool the counter) and escapes. Returns null if no balanced
// array is found.
//
// Why not /\[[\s\S]*\]/? That regex is greedy and will happily grab content
// AFTER the actual array's closing bracket when the model appends explanatory
// prose — "Unexpected non-whitespace character after JSON" is the symptom.
// The non-greedy variant has the opposite problem (stops at the first `]`,
// even nested).
export function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}
