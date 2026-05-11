// lib/ai/rate-limit.ts
// In-memory sliding-window rate limiter for AI endpoints.
//
// Same pattern already used in app/api/[tenant]/calls/upload/route.ts. The
// project does not have Redis/Upstash; for a Next.js app on Railway with
// one or a small number of node processes this is fine. If/when the app
// scales horizontally, swap the Map for a Redis store with the same API.
//
// Why this exists:
//  - Stops a buggy client from spamming the assistant or execute endpoint
//    a thousand times in a second.
//  - Stops a compromised session from being used to send a high-volume
//    blast of SMS messages.
//  - Caps cost — every assistant call hits Claude (paid). 30 chat turns
//    per minute is well above real usage and below a runaway-loop bug.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Soft cleanup — drop expired buckets when the map gets large so we don't
// leak memory in long-running node processes. Cheap O(n) sweep.
function gc(now: number) {
  if (buckets.size < 10_000) return
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k)
  }
}

export interface RateLimitOk {
  ok: true
  remaining: number
  resetAt: number
}

export interface RateLimitDenied {
  ok: false
  retryAfterMs: number
  resetAt: number
}

/**
 * checkRateLimit — fixed-window counter, increments on every call.
 *
 * @param key         The thing being rate-limited (usually userId).
 * @param scope       A bucket namespace so a user's chat budget and execute
 *                    budget don't share a single counter.
 * @param limit       Max requests allowed in the window.
 * @param windowMs    Window length, in ms.
 */
export function checkRateLimit(
  key: string,
  scope: string,
  limit: number,
  windowMs: number,
): RateLimitOk | RateLimitDenied {
  const now = Date.now()
  gc(now)

  const bucketKey = `${scope}:${key}`
  const existing = buckets.get(bucketKey)

  if (!existing || existing.resetAt <= now) {
    // Open a new window.
    const resetAt = now + windowMs
    buckets.set(bucketKey, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, resetAt }
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterMs: existing.resetAt - now, resetAt: existing.resetAt }
  }

  existing.count += 1
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt }
}

/**
 * Test-only helper — wipe all buckets. Do not use in production code.
 */
export function __resetForTests() {
  buckets.clear()
}
