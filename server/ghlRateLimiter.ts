/**
 * GHL Circuit Breaker & Rate Limiter
 * 
 * GoHighLevel API has rate limits (~100 requests per minute per location).
 * This module provides:
 * 
 * 1. **Circuit Breaker** — tracks consecutive 429 errors and "trips" the circuit
 *    when a threshold is reached. While tripped, background (normal-priority)
 *    requests are rejected immediately, preserving quota for user-initiated
 *    (high-priority) requests. The circuit auto-recovers after a cooldown.
 * 
 * 2. **Sliding Window Rate Limiter** — tracks request timestamps in a 60-second
 *    window and enforces a max request count. High-priority requests reserve
 *    headroom so user actions aren't starved by background polling.
 * 
 * 3. **Contact Search Cache** — short-lived cache for GHL contact search results
 *    to avoid redundant API calls when performing multiple actions on the same contact.
 * 
 * Usage:
 *   import { ghlCircuitBreaker } from "./ghlRateLimiter";
 *   
 *   // Before a background GHL call:
 *   if (!ghlCircuitBreaker.canProceed("normal")) {
 *     console.log("Circuit breaker open, skipping background request");
 *     return;
 *   }
 *   
 *   // After a 429 response:
 *   ghlCircuitBreaker.record429();
 *   
 *   // After a successful response:
 *   ghlCircuitBreaker.recordSuccess();
 */

// ============ CIRCUIT BREAKER STATE ============

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  /** Number of consecutive 429s before tripping the circuit */
  failureThreshold: number;
  /** How long (ms) the circuit stays open before trying half-open */
  cooldownMs: number;
  /** Max requests per minute (sliding window) */
  maxRequestsPerMinute: number;
  /** Slots reserved for high-priority (user) requests */
  reservedHighPrioritySlots: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 3 * 60 * 1000, // 3 minutes
  maxRequestsPerMinute: 85, // GHL allows 100/min; we use 85 to leave buffer
  reservedHighPrioritySlots: 10, // Reserve 10 slots for user-initiated actions
};

let state: CircuitState = "closed";
let consecutive429Count = 0;
let lastTripTime: number = 0;
let totalTrips = 0;
let config = { ...DEFAULT_CONFIG };

// Sliding window for rate limiting
const requestTimestamps: number[] = [];
const WINDOW_MS = 60_000;

// ============ INTERNAL HELPERS ============

function cleanOldTimestamps(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

function getUsedSlots(): number {
  cleanOldTimestamps();
  return requestTimestamps.length;
}

function getAvailableSlots(priority: "high" | "normal"): number {
  const used = getUsedSlots();
  const max = config.maxRequestsPerMinute;
  
  if (priority === "high") {
    // High priority can use the full budget
    return Math.max(0, max - used);
  }
  
  // Normal priority must leave reserved slots for high-priority
  return Math.max(0, max - config.reservedHighPrioritySlots - used);
}

// ============ CIRCUIT BREAKER API ============

export const ghlCircuitBreaker = {
  /**
   * Check whether a request with the given priority is allowed to proceed.
   * 
   * - "high" (user-initiated): Allowed unless the sliding window is completely full.
   *   High-priority requests bypass the circuit breaker open state.
   * - "normal" (background): Blocked when the circuit is open or when available
   *   slots (after reserving headroom for high-priority) are exhausted.
   */
  canProceed(priority: "high" | "normal" = "normal"): boolean {
    // Check if circuit should transition from open → half-open
    if (state === "open") {
      const elapsed = Date.now() - lastTripTime;
      if (elapsed >= config.cooldownMs) {
        state = "half-open";
        console.log(`[GHL CircuitBreaker] Transitioning to half-open after ${Math.round(elapsed / 1000)}s cooldown`);
      }
    }

    // High-priority requests bypass the circuit breaker (only respect rate limit)
    if (priority === "high") {
      return getAvailableSlots("high") > 0;
    }

    // Normal-priority: blocked when circuit is open
    if (state === "open") {
      return false;
    }

    // Half-open: allow a trickle of normal requests (1 at a time to test)
    if (state === "half-open") {
      return getAvailableSlots("normal") > 5; // Only proceed if plenty of headroom
    }

    // Closed: normal rate limiting
    return getAvailableSlots("normal") > 0;
  },

  /**
   * Record that a request is being sent (consumes a rate limit slot).
   */
  recordRequest(): void {
    requestTimestamps.push(Date.now());
  },

  /**
   * Record a successful GHL API response. Resets the failure counter
   * and transitions half-open → closed.
   */
  recordSuccess(): void {
    consecutive429Count = 0;
    if (state === "half-open") {
      state = "closed";
      console.log("[GHL CircuitBreaker] Circuit closed — API recovered");
    }
  },

  /**
   * Record a 429 (rate limit) response. Increments the failure counter
   * and trips the circuit if the threshold is reached.
   */
  record429(): void {
    consecutive429Count++;
    console.log(`[GHL CircuitBreaker] 429 recorded (${consecutive429Count}/${config.failureThreshold})`);

    if (consecutive429Count >= config.failureThreshold && state !== "open") {
      state = "open";
      lastTripTime = Date.now();
      totalTrips++;
      console.log(`[GHL CircuitBreaker] Circuit OPEN — pausing background requests for ${config.cooldownMs / 1000}s (trip #${totalTrips})`);
    }
  },

  /**
   * Get the current circuit breaker status for debugging / admin UI.
   */
  getStatus(): {
    state: CircuitState;
    consecutive429s: number;
    totalTrips: number;
    cooldownRemainingMs: number;
    requestsInWindow: number;
    availableHighPriority: number;
    availableNormalPriority: number;
  } {
    const cooldownRemaining =
      state === "open"
        ? Math.max(0, config.cooldownMs - (Date.now() - lastTripTime))
        : 0;

    return {
      state,
      consecutive429s: consecutive429Count,
      totalTrips,
      cooldownRemainingMs: cooldownRemaining,
      requestsInWindow: getUsedSlots(),
      availableHighPriority: getAvailableSlots("high"),
      availableNormalPriority: getAvailableSlots("normal"),
    };
  },

  /**
   * Force-reset the circuit breaker (for admin use).
   */
  reset(): void {
    state = "closed";
    consecutive429Count = 0;
    lastTripTime = 0;
    requestTimestamps.length = 0;
    console.log("[GHL CircuitBreaker] Manually reset");
  },

  /**
   * Update configuration (for testing or runtime tuning).
   */
  configure(partial: Partial<CircuitBreakerConfig>): void {
    config = { ...config, ...partial };
  },

  /** Expose state for testing */
  get currentState(): CircuitState { return state; },
};

// ============ CONTACT SEARCH CACHE ============

interface CachedContactResult {
  results: Array<{ id: string; name: string; phone: string; email: string }>;
  timestamp: number;
}

const contactSearchCache = new Map<string, CachedContactResult>();
const CONTACT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached contact search results.
 * Returns null if not cached or expired.
 */
export function getCachedContactSearch(
  tenantId: number,
  query: string
): Array<{ id: string; name: string; phone: string; email: string }> | null {
  const key = `${tenantId}:${query.toLowerCase().trim()}`;
  const cached = contactSearchCache.get(key);
  
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CONTACT_CACHE_TTL_MS) {
    contactSearchCache.delete(key);
    return null;
  }
  
  return cached.results;
}

/**
 * Store contact search results in cache.
 */
export function setCachedContactSearch(
  tenantId: number,
  query: string,
  results: Array<{ id: string; name: string; phone: string; email: string }>
): void {
  const key = `${tenantId}:${query.toLowerCase().trim()}`;
  contactSearchCache.set(key, { results, timestamp: Date.now() });
  
  // Evict old entries if cache grows too large (>500 entries)
  if (contactSearchCache.size > 500) {
    const cutoff = Date.now() - CONTACT_CACHE_TTL_MS;
    const keysToDelete: string[] = [];
    contactSearchCache.forEach((v, k) => {
      if (v.timestamp < cutoff) keysToDelete.push(k);
    });
    keysToDelete.forEach(k => contactSearchCache.delete(k));
    // If still too large, remove oldest entries
    if (contactSearchCache.size > 500) {
      const entries = Array.from(contactSearchCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < entries.length - 300; i++) {
        contactSearchCache.delete(entries[i][0]);
      }
    }
  }
}

/**
 * Clear the entire contact search cache (e.g., after a contact is modified).
 */
export function clearContactSearchCache(): void {
  contactSearchCache.clear();
}

/**
 * Get cache stats for debugging.
 */
export function getContactCacheStats(): { size: number; oldestMs: number | null } {
  if (contactSearchCache.size === 0) return { size: 0, oldestMs: null };
  let oldest = Infinity;
  contactSearchCache.forEach(v => {
    if (v.timestamp < oldest) oldest = v.timestamp;
  });
  return { size: contactSearchCache.size, oldestMs: Date.now() - oldest };
}
