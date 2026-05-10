// lib/ghl/cache.ts
// In-process TTL cache for GHL responses. Railway runs long-lived Node
// processes, so module-level state persists across requests within the
// same instance. With multiple instances each holds its own cache —
// still a big win, and each instance's cache is invalidated by the same
// webhook that updates the underlying GHL record.
//
// Used by: app/(tenant)/[tenant]/day-hub/page.tsx and any other page
// that wants to deduplicate GHL reads across requests.
//
// Cache lifetime guidance:
//   • Reference data (location users, custom fields) → 10–30 min
//   • Contact details → 3–5 min (invalidated on ContactUpdate webhook)
//   • Task lists → 30–60 sec (invalidated on TaskCompleted/Create/Update)
//
// Invalidation: webhook handlers call invalidateCache(prefix) after
// persisting a change, so the next read forces a refetch.

type CacheEntry = { value: unknown; expiresAt: number }

const cache = new Map<string, CacheEntry>()

// Hard cap so a misbehaving caller can't unbounded-grow memory. LRU-ish:
// when full, we evict the entry with the soonest expiry.
const MAX_ENTRIES = 5000

function evictIfNeeded() {
  if (cache.size < MAX_ENTRIES) return
  let oldestKey: string | null = null
  let oldestExpiry = Infinity
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt < oldestExpiry) {
      oldestExpiry = v.expiresAt
      oldestKey = k
    }
  }
  if (oldestKey) cache.delete(oldestKey)
}

/**
 * Memoize an async loader with TTL. If the cached value is still fresh,
 * return it. Otherwise call the loader and cache the result.
 *
 * Failures are NOT cached — if the loader throws, the next call will
 * retry. This is intentional: we don't want a transient GHL outage to
 * pin an error in cache for the whole TTL window.
 */
export async function cachedGHL<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit.value as T
  }
  const value = await loader()
  evictIfNeeded()
  cache.set(key, { value, expiresAt: now + ttlMs })
  return value
}

/**
 * Drop every cache entry whose key starts with `prefix`. Use from
 * webhook handlers so a contact/task update invalidates immediately.
 */
export function invalidateCache(prefix: string): void {
  if (!prefix) return
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k)
  }
}

/** Test/diagnostic helper — current entry count. */
export function _cacheSize(): number {
  return cache.size
}
