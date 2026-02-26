import { describe, expect, it, beforeEach } from "vitest";
import {
  ghlCircuitBreaker,
  getCachedContactSearch,
  setCachedContactSearch,
  clearContactSearchCache,
  getContactCacheStats,
} from "./ghlRateLimiter";

describe("GHL Circuit Breaker", () => {
  beforeEach(() => {
    ghlCircuitBreaker.reset();
  });

  it("starts in closed state", () => {
    const status = ghlCircuitBreaker.getStatus();
    expect(status.state).toBe("closed");
    expect(status.consecutive429s).toBe(0);
    expect(status.totalTrips).toBe(0);
  });

  it("allows both high and normal priority requests when closed", () => {
    expect(ghlCircuitBreaker.canProceed("high")).toBe(true);
    expect(ghlCircuitBreaker.canProceed("normal")).toBe(true);
  });

  it("records successful responses and stays closed", () => {
    ghlCircuitBreaker.recordSuccess();
    ghlCircuitBreaker.recordSuccess();
    const status = ghlCircuitBreaker.getStatus();
    expect(status.state).toBe("closed");
    expect(status.consecutive429s).toBe(0);
  });

  it("increments consecutive 429 count on record429", () => {
    ghlCircuitBreaker.record429();
    expect(ghlCircuitBreaker.getStatus().consecutive429s).toBe(1);
    ghlCircuitBreaker.record429();
    expect(ghlCircuitBreaker.getStatus().consecutive429s).toBe(2);
  });

  it("trips to open state after reaching failure threshold (default 3)", () => {
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    expect(ghlCircuitBreaker.getStatus().state).toBe("closed");
    
    ghlCircuitBreaker.record429();
    expect(ghlCircuitBreaker.getStatus().state).toBe("open");
    expect(ghlCircuitBreaker.getStatus().totalTrips).toBe(1);
  });

  it("blocks normal priority when circuit is open", () => {
    // Trip the circuit
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    
    expect(ghlCircuitBreaker.canProceed("normal")).toBe(false);
  });

  it("allows high priority requests even when circuit is open (rate limit permitting)", () => {
    // Trip the circuit
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    
    // High priority bypasses circuit breaker state
    expect(ghlCircuitBreaker.canProceed("high")).toBe(true);
  });

  it("resets consecutive 429 count on success", () => {
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    expect(ghlCircuitBreaker.getStatus().consecutive429s).toBe(2);
    
    ghlCircuitBreaker.recordSuccess();
    expect(ghlCircuitBreaker.getStatus().consecutive429s).toBe(0);
  });

  it("transitions from open to half-open after cooldown", () => {
    // Configure a very short cooldown for testing
    ghlCircuitBreaker.configure({ cooldownMs: 10 });
    
    // Trip the circuit
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    expect(ghlCircuitBreaker.getStatus().state).toBe("open");
    
    // Wait for cooldown
    return new Promise<void>(resolve => {
      setTimeout(() => {
        // canProceed triggers the transition check
        ghlCircuitBreaker.canProceed("normal");
        expect(ghlCircuitBreaker.getStatus().state).toBe("half-open");
        resolve();
      }, 20);
    });
  });

  it("transitions from half-open to closed on success", () => {
    ghlCircuitBreaker.configure({ cooldownMs: 10 });
    
    // Trip the circuit
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    
    return new Promise<void>(resolve => {
      setTimeout(() => {
        ghlCircuitBreaker.canProceed("normal");
        expect(ghlCircuitBreaker.getStatus().state).toBe("half-open");
        
        ghlCircuitBreaker.recordSuccess();
        expect(ghlCircuitBreaker.getStatus().state).toBe("closed");
        resolve();
      }, 20);
    });
  });

  it("records requests in sliding window", () => {
    ghlCircuitBreaker.recordRequest();
    ghlCircuitBreaker.recordRequest();
    ghlCircuitBreaker.recordRequest();
    
    const status = ghlCircuitBreaker.getStatus();
    expect(status.requestsInWindow).toBe(3);
  });

  it("reserves slots for high priority - normal blocked when near limit", () => {
    // Configure low limits for testing
    ghlCircuitBreaker.configure({ maxRequestsPerMinute: 20, reservedHighPrioritySlots: 15 });
    
    // Fill up to the normal priority limit (20 - 15 = 5 slots for normal)
    for (let i = 0; i < 6; i++) {
      ghlCircuitBreaker.recordRequest();
    }
    
    // Normal should be blocked (6 used, only 5 available for normal)
    expect(ghlCircuitBreaker.canProceed("normal")).toBe(false);
    // High should still be allowed (14 slots remaining out of 20)
    expect(ghlCircuitBreaker.canProceed("high")).toBe(true);
  });

  it("reset clears all state", () => {
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.recordRequest();
    
    ghlCircuitBreaker.reset();
    
    const status = ghlCircuitBreaker.getStatus();
    expect(status.state).toBe("closed");
    expect(status.consecutive429s).toBe(0);
    expect(status.requestsInWindow).toBe(0);
  });

  it("reports cooldown remaining when open", () => {
    ghlCircuitBreaker.configure({ cooldownMs: 60000 });
    
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    ghlCircuitBreaker.record429();
    
    const status = ghlCircuitBreaker.getStatus();
    expect(status.cooldownRemainingMs).toBeGreaterThan(0);
    expect(status.cooldownRemainingMs).toBeLessThanOrEqual(60000);
  });

  it("reports zero cooldown when closed", () => {
    const status = ghlCircuitBreaker.getStatus();
    expect(status.cooldownRemainingMs).toBe(0);
  });
});

describe("Contact Search Cache", () => {
  beforeEach(() => {
    clearContactSearchCache();
  });

  it("returns null for uncached queries", () => {
    expect(getCachedContactSearch(1, "John Doe")).toBeNull();
  });

  it("stores and retrieves cached results", () => {
    const results = [
      { id: "ghl_abc", name: "John Doe", phone: "+15551234567", email: "john@test.com" },
    ];
    
    setCachedContactSearch(1, "John Doe", results);
    
    const cached = getCachedContactSearch(1, "John Doe");
    expect(cached).toEqual(results);
  });

  it("is case-insensitive for query matching", () => {
    const results = [
      { id: "ghl_abc", name: "John Doe", phone: "+15551234567", email: "john@test.com" },
    ];
    
    setCachedContactSearch(1, "John Doe", results);
    
    expect(getCachedContactSearch(1, "john doe")).toEqual(results);
    expect(getCachedContactSearch(1, "JOHN DOE")).toEqual(results);
  });

  it("trims whitespace from queries", () => {
    const results = [
      { id: "ghl_abc", name: "John Doe", phone: "+15551234567", email: "john@test.com" },
    ];
    
    setCachedContactSearch(1, "  John Doe  ", results);
    
    expect(getCachedContactSearch(1, "John Doe")).toEqual(results);
  });

  it("separates cache by tenantId", () => {
    const results1 = [{ id: "ghl_1", name: "John", phone: "", email: "" }];
    const results2 = [{ id: "ghl_2", name: "Jane", phone: "", email: "" }];
    
    setCachedContactSearch(1, "John", results1);
    setCachedContactSearch(2, "John", results2);
    
    expect(getCachedContactSearch(1, "John")).toEqual(results1);
    expect(getCachedContactSearch(2, "John")).toEqual(results2);
  });

  it("caches empty results (no contacts found)", () => {
    setCachedContactSearch(1, "Nobody", []);
    
    expect(getCachedContactSearch(1, "Nobody")).toEqual([]);
  });

  it("clears all cache entries", () => {
    setCachedContactSearch(1, "John", [{ id: "1", name: "John", phone: "", email: "" }]);
    setCachedContactSearch(1, "Jane", [{ id: "2", name: "Jane", phone: "", email: "" }]);
    
    clearContactSearchCache();
    
    expect(getCachedContactSearch(1, "John")).toBeNull();
    expect(getCachedContactSearch(1, "Jane")).toBeNull();
  });

  it("reports cache stats", () => {
    expect(getContactCacheStats()).toEqual({ size: 0, oldestMs: null });
    
    setCachedContactSearch(1, "John", [{ id: "1", name: "John", phone: "", email: "" }]);
    
    const stats = getContactCacheStats();
    expect(stats.size).toBe(1);
    expect(stats.oldestMs).toBeGreaterThanOrEqual(0);
    expect(stats.oldestMs).toBeLessThan(1000); // Just created, should be < 1s old
  });
});
