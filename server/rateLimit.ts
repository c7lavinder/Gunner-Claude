/**
 * Rate Limiting per Tenant
 * 
 * Implements sliding window rate limiting to prevent any single tenant
 * from overwhelming the system with too many requests.
 */

import { TRPCError } from "@trpc/server";

// In-memory store for rate limiting
// S9 NOTE: Acceptable for single-instance deployment.
// When scaling to multiple server instances, migrate to Redis-backed rate limiting.
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration for different rate limit tiers
export const RATE_LIMITS = {
  // General API calls
  default: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },
  // AI/LLM operations (expensive)
  ai: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
  },
  // File uploads
  upload: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  // Authentication attempts
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
  },
  // Content generation
  contentGeneration: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },
  // Call grading
  grading: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMITS;

/**
 * Check if a request should be rate limited
 * @param tenantId - The tenant making the request
 * @param tier - The rate limit tier to apply
 * @returns true if the request should be allowed, throws TRPCError if rate limited
 */
export function checkRateLimit(
  tenantId: number | null | undefined,
  tier: RateLimitTier = "default"
): void {
  // Skip rate limiting for requests without tenant (public endpoints)
  if (!tenantId) return;

  const config = RATE_LIMITS[tier];
  const key = `${tenantId}:${tier}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    // Start new window
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
    });
    return;
  }

  // Within current window
  if (entry.count >= config.maxRequests) {
    const resetTime = Math.ceil((entry.windowStart + config.windowMs - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Please try again in ${resetTime} seconds.`,
    });
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
}

/**
 * Get current rate limit status for a tenant
 */
export function getRateLimitStatus(
  tenantId: number,
  tier: RateLimitTier = "default"
): { remaining: number; resetIn: number } {
  const config = RATE_LIMITS[tier];
  const key = `${tenantId}:${tier}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    return {
      remaining: config.maxRequests,
      resetIn: 0,
    };
  }

  return {
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetIn: Math.ceil((entry.windowStart + config.windowMs - now) / 1000),
  };
}

/**
 * Clear rate limit data for a tenant (useful for testing)
 */
export function clearRateLimit(tenantId: number, tier?: RateLimitTier): void {
  if (tier) {
    rateLimitStore.delete(`${tenantId}:${tier}`);
  } else {
    // Clear all tiers for this tenant
    for (const t of Object.keys(RATE_LIMITS)) {
      rateLimitStore.delete(`${tenantId}:${t}`);
    }
  }
}

/**
 * Cleanup old entries periodically (call this from a cron job or similar)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  rateLimitStore.forEach((entry, key) => {
    // Extract tier from key to get correct window
    const tier = key.split(":")[1] as RateLimitTier;
    const config = RATE_LIMITS[tier] || RATE_LIMITS.default;
    
    if (now - entry.windowStart > config.windowMs * 2) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => rateLimitStore.delete(key));
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

// ============ USAGE ANALYTICS TRACKING ============

// Store for tracking cumulative usage per tenant per category
interface UsageEntry {
  count: number;
  lastUpdated: number;
}

// Map: tenantId -> category -> usage entry
const usageStore = new Map<number, Map<string, UsageEntry>>();

/**
 * Track API usage for analytics
 */
export function trackUsage(
  tenantId: number | null | undefined,
  category: string
): void {
  if (!tenantId) return;

  let tenantUsage = usageStore.get(tenantId);
  if (!tenantUsage) {
    tenantUsage = new Map();
    usageStore.set(tenantId, tenantUsage);
  }

  const entry = tenantUsage.get(category);
  if (entry) {
    entry.count++;
    entry.lastUpdated = Date.now();
  } else {
    tenantUsage.set(category, {
      count: 1,
      lastUpdated: Date.now(),
    });
  }
}

/**
 * Get usage statistics for a tenant
 */
export function getTenantUsage(tenantId: number): Record<string, number> {
  const tenantUsage = usageStore.get(tenantId);
  if (!tenantUsage) return {};

  const result: Record<string, number> = {};
  tenantUsage.forEach((entry, category) => {
    result[category] = entry.count;
  });
  return result;
}

/**
 * Get usage statistics for all tenants (for admin dashboard)
 */
export function getAllTenantsUsage(): Array<{ tenantId: number; usage: Record<string, number> }> {
  const result: Array<{ tenantId: number; usage: Record<string, number> }> = [];
  
  usageStore.forEach((tenantUsage, tenantId) => {
    const usage: Record<string, number> = {};
    tenantUsage.forEach((entry, category) => {
      usage[category] = entry.count;
    });
    result.push({ tenantId, usage });
  });
  
  return result;
}

/**
 * Reset usage for a tenant (useful for billing cycles)
 */
export function resetTenantUsage(tenantId: number): void {
  usageStore.delete(tenantId);
}
