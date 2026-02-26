/**
 * Global GHL Rate Limiter
 * 
 * GoHighLevel API has rate limits (~100 requests per minute per location).
 * This module provides a centralized rate limiter that all GHL API calls
 * should use to avoid 429 errors.
 * 
 * User-facing requests (coach actions) get priority over background tasks
 * (polling, opportunity detection).
 */

interface QueuedRequest {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: "high" | "normal"; // high = user-facing, normal = background
  timestamp: number;
}

// GHL allows ~100 requests/minute per location. We'll target 60/min to leave headroom.
const MAX_REQUESTS_PER_MINUTE = 50;
const WINDOW_MS = 60_000;

// Track request timestamps for sliding window
const requestTimestamps: number[] = [];

// Priority queues
const highPriorityQueue: QueuedRequest[] = [];
const normalPriorityQueue: QueuedRequest[] = [];

let isProcessing = false;

function cleanOldTimestamps(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

function getAvailableSlots(): number {
  cleanOldTimestamps();
  return Math.max(0, MAX_REQUESTS_PER_MINUTE - requestTimestamps.length);
}

function getWaitTime(): number {
  if (requestTimestamps.length < MAX_REQUESTS_PER_MINUTE) return 0;
  // Wait until the oldest request falls out of the window
  const oldestInWindow = requestTimestamps[0];
  return Math.max(0, (oldestInWindow + WINDOW_MS) - Date.now() + 50); // +50ms buffer
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (highPriorityQueue.length > 0 || normalPriorityQueue.length > 0) {
      const available = getAvailableSlots();
      
      if (available <= 0) {
        const waitTime = getWaitTime();
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // Process high priority first
      let request: QueuedRequest | undefined;
      if (highPriorityQueue.length > 0) {
        request = highPriorityQueue.shift();
      } else if (normalPriorityQueue.length > 0) {
        // Only process normal priority if we have plenty of headroom
        // Reserve at least 10 slots for user-facing requests
        if (getAvailableSlots() > 10) {
          request = normalPriorityQueue.shift();
        } else {
          // Wait a bit before processing background tasks
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }

      if (!request) break;

      // Record the request timestamp
      requestTimestamps.push(Date.now());

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }

      // Small delay between requests to avoid bursts
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Throttle a GHL API call through the global rate limiter.
 * 
 * @param fn - The async function that makes the GHL API call
 * @param priority - "high" for user-facing requests, "normal" for background tasks
 * @returns The result of the API call
 */
export function throttleGHL<T>(
  fn: () => Promise<T>,
  priority: "high" | "normal" = "normal"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request: QueuedRequest = {
      execute: fn,
      resolve,
      reject,
      priority,
      timestamp: Date.now(),
    };

    if (priority === "high") {
      highPriorityQueue.push(request);
    } else {
      normalPriorityQueue.push(request);
    }

    // Start processing if not already running
    processQueue().catch(err => {
      console.error("[GHL RateLimiter] Queue processing error:", err);
    });
  });
}

/**
 * Get current rate limiter status for debugging
 */
export function getRateLimiterStatus(): {
  requestsInWindow: number;
  availableSlots: number;
  highPriorityQueued: number;
  normalPriorityQueued: number;
} {
  cleanOldTimestamps();
  return {
    requestsInWindow: requestTimestamps.length,
    availableSlots: getAvailableSlots(),
    highPriorityQueued: highPriorityQueue.length,
    normalPriorityQueued: normalPriorityQueue.length,
  };
}

/**
 * Check if we're currently rate limited (no available slots)
 */
export function isRateLimited(): boolean {
  return getAvailableSlots() <= 0;
}

/**
 * Record a 429 response - pause all requests briefly to let the rate limit reset
 */
export function recordRateLimit(): void {
  // Fill the window to prevent new requests for a bit
  const now = Date.now();
  while (requestTimestamps.length < MAX_REQUESTS_PER_MINUTE) {
    requestTimestamps.push(now);
  }
}
