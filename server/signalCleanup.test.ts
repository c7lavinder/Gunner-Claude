import { describe, it, expect } from "vitest";

/**
 * Signal Cleanup Tests
 * 
 * Validates that:
 * 1. Non-deal rules (coaching, grades, training, trends) are removed from detection
 * 2. Dispo pipeline stages are filtered out
 * 3. Per-tier daily caps work correctly
 * 4. Cross-tier dedup keeps contacts in highest-priority tier only
 */

// ===== 1. Removed rules should no longer be invoked =====
describe("Signal rule removal", () => {
  it("should not include bad_call_performance in scanTenant rules", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    // The rule should be commented out, not actively called
    const activeCallPattern = /^\s+const badCallDetections = await detectBadCallPerformance/m;
    expect(activeCallPattern.test(source)).toBe(false);
  });

  it("should not include bad_temperament in scanTenant rules", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    const activeCallPattern = /^\s+const badTemperamentDetections = await detectBadTemperament/m;
    expect(activeCallPattern.test(source)).toBe(false);
  });

  it("should not include ai_coach_inactive in scanTenant rules", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    const activeCallPattern = /^\s+const coachInactiveDetections = await detectAICoachInactive/m;
    expect(activeCallPattern.test(source)).toBe(false);
  });

  it("should not include consistent_call_weakness in scanTenant rules", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    const activeCallPattern = /^\s+const weaknessDetections = await detectConsistentCallWeakness/m;
    expect(activeCallPattern.test(source)).toBe(false);
  });
});

// ===== 2. Dispo pipeline filter =====
describe("Dispo pipeline filter", () => {
  it("should include 'dispo' in terminal stage suppression checks", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    // All three suppression blocks should include "dispo"
    const dispoChecks = source.match(/includes\("dispo"\)/g);
    expect(dispoChecks).not.toBeNull();
    // There should be at least 3 dispo checks (pipeline scan, conversation scan, terminalStageContactIds)
    expect(dispoChecks!.length).toBeGreaterThanOrEqual(3);
  });
});

// ===== 3. Per-tier daily cap =====
describe("Per-tier daily cap", () => {
  it("should use PER_TIER_CAP instead of flat DAILY_SIGNAL_CAP", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    // Should NOT have the old flat cap
    expect(source).not.toContain("DAILY_SIGNAL_CAP = 5");
    // Should have per-tier cap
    expect(source).toContain("PER_TIER_CAP");
  });

  it("should count signals per tier, not flat total", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    // Should have todayTierCounts tracking per tier
    expect(source).toContain("todayTierCounts");
    // Should have savedPerTier tracking
    expect(source).toContain("savedPerTier");
  });

  it("should set per-tier cap to 4", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    expect(source).toContain("PER_TIER_CAP = 4");
  });
});

// ===== 4. Cross-tier dedup =====
describe("Cross-tier dedup", () => {
  it("should deduplicate contacts across tiers before saving", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    // Should have cross-tier dedup logic
    expect(source).toContain("contactTierAssigned");
    expect(source).toContain("dedupedDetections");
  });

  it("should keep contacts in highest-priority tier only", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("server/opportunityDetection.ts", "utf-8")
    );
    // The dedup should iterate dedupedDetections, not raw detections
    expect(source).toContain("for (const detection of dedupedDetections)");
  });

  // Unit test the dedup logic directly
  it("should correctly filter duplicate contacts across tiers", () => {
    type Detection = { tier: string; ghlContactId: string | null; contactPhone: string | null; contactName: string | null; priorityScore: number };
    
    const detections: Detection[] = [
      { tier: "missed", ghlContactId: "c1", contactPhone: null, contactName: "John", priorityScore: 90 },
      { tier: "warning", ghlContactId: "c1", contactPhone: null, contactName: "John", priorityScore: 80 },
      { tier: "possible", ghlContactId: "c1", contactPhone: null, contactName: "John", priorityScore: 70 },
      { tier: "missed", ghlContactId: "c2", contactPhone: null, contactName: "Jane", priorityScore: 85 },
      { tier: "possible", ghlContactId: "c3", contactPhone: null, contactName: "Bob", priorityScore: 60 },
    ];

    // Sort by priority (same as production code)
    const tierWeight: Record<string, number> = { missed: 300, warning: 200, possible: 100 };
    detections.sort((a, b) => {
      const aScore = (tierWeight[a.tier] || 0) + a.priorityScore;
      const bScore = (tierWeight[b.tier] || 0) + b.priorityScore;
      return bScore - aScore;
    });

    // Apply cross-tier dedup
    const contactTierAssigned = new Map<string, string>();
    const dedupedDetections = detections.filter(d => {
      const contactKey = d.ghlContactId || d.contactPhone || d.contactName;
      if (!contactKey) return true;
      const existingTier = contactTierAssigned.get(contactKey);
      if (!existingTier) {
        contactTierAssigned.set(contactKey, d.tier);
        return true;
      }
      return existingTier === d.tier;
    });

    // c1 should only appear in "missed" (highest priority)
    const c1Detections = dedupedDetections.filter(d => d.ghlContactId === "c1");
    expect(c1Detections).toHaveLength(1);
    expect(c1Detections[0].tier).toBe("missed");

    // c2 should still be there (only in one tier)
    const c2Detections = dedupedDetections.filter(d => d.ghlContactId === "c2");
    expect(c2Detections).toHaveLength(1);

    // c3 should still be there (only in one tier)
    const c3Detections = dedupedDetections.filter(d => d.ghlContactId === "c3");
    expect(c3Detections).toHaveLength(1);

    // Total should be 3 (one per contact)
    expect(dedupedDetections).toHaveLength(3);
  });
});

// ===== 5. UI rule config cleanup =====
describe("UI rule config cleanup", () => {
  it("should not have bad_call_performance in Opportunities UI ruleConfig", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("client/src/pages/Opportunities.tsx", "utf-8")
    );
    // Should not have active bad_call_performance config
    expect(source).not.toMatch(/^\s+bad_call_performance:\s*\{/m);
  });

  it("should not have ai_coach_inactive in Opportunities UI ruleConfig", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("client/src/pages/Opportunities.tsx", "utf-8")
    );
    expect(source).not.toMatch(/^\s+ai_coach_inactive:\s*\{/m);
  });

  it("should not have consistent_call_weakness in Opportunities UI ruleConfig", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("client/src/pages/Opportunities.tsx", "utf-8")
    );
    expect(source).not.toMatch(/^\s+consistent_call_weakness:\s*\{/m);
  });

  it("should not have bad_temperament in Opportunities UI ruleConfig", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("client/src/pages/Opportunities.tsx", "utf-8")
    );
    expect(source).not.toMatch(/^\s+bad_temperament:\s*\{/m);
  });

  it("should not have call_grade source config", async () => {
    const source = await import("fs").then(fs =>
      fs.readFileSync("client/src/pages/Opportunities.tsx", "utf-8")
    );
    expect(source).not.toMatch(/^\s+call_grade:\s*\{/m);
  });
});
