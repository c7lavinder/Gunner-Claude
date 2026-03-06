import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opportunityDetectionSource = readFileSync(
  resolve(__dirname, "opportunityDetection.ts"),
  "utf-8"
);

describe("Signal Deduplication & Daily Cap", () => {
  it("isAlreadyFlagged accepts teamMemberId parameter for team-level signals", () => {
    // The function signature should include teamMemberId as an optional parameter
    const fnMatch = opportunityDetectionSource.match(
      /async function isAlreadyFlagged\([^)]+\)/s
    );
    expect(fnMatch).toBeTruthy();
    const fnSignature = fnMatch![0];
    expect(fnSignature).toContain("teamMemberId");
  });

  it("isAlreadyFlagged handles null ghlContactId with teamMemberId for team-level dedup", () => {
    // When ghlContactId is null but teamMemberId is provided, it should check by teamMemberId
    const fnBody = opportunityDetectionSource.slice(
      opportunityDetectionSource.indexOf("async function isAlreadyFlagged"),
      opportunityDetectionSource.indexOf("async function isAlreadyFlagged") + 2000
    );
    // Should have a branch for !ghlContactId && teamMemberId
    expect(fnBody).toContain("!ghlContactId && teamMemberId");
    // Should query by teamMemberId
    expect(fnBody).toContain("eq(opportunities.teamMemberId, teamMemberId)");
  });

  it("isAlreadyFlagged is called with teamMemberId in Phase 4 save loop", () => {
    // The call in Phase 4 should pass detection.teamMemberId
    expect(opportunityDetectionSource).toContain(
      "isAlreadyFlagged(db, tenantId, detection.ghlContactId, primaryRule, detection.teamMemberId)"
    );
  });

  it("has a per-tier daily signal cap", () => {
    // Implementation uses PER_TIER_CAP instead of a flat DAILY_SIGNAL_CAP
    expect(opportunityDetectionSource).toContain("PER_TIER_CAP");
  });

  it("checks how many signals were already created today per tier before saving", () => {
    // Should count today's signals per tier
    expect(opportunityDetectionSource).toContain("todayTierCounts");
    expect(opportunityDetectionSource).toContain("todayStart");
  });

  it("sorts detections by priority before saving (highest first)", () => {
    // Should sort by tier weight + priority score
    expect(opportunityDetectionSource).toContain("tierWeight");
    expect(opportunityDetectionSource).toContain("detections.sort");
    // missed tier should have highest weight
    // Verify tierWeight record exists with correct ordering
    expect(opportunityDetectionSource).toContain("missed: 300");
    expect(opportunityDetectionSource).toContain("warning: 200");
    expect(opportunityDetectionSource).toContain("possible: 100");
  });

  it("skips saving when all tier caps are reached", () => {
    // Should check if all tiers are full and skip
    expect(opportunityDetectionSource).toContain("allTiersFull");
    expect(opportunityDetectionSource).toContain("Skipping new signals");
  });

  it("early returns when all tier caps are reached", () => {
    // Should return early if all tiers are at capacity
    expect(opportunityDetectionSource).toContain("if (allTiersFull)");
    expect(opportunityDetectionSource).toContain("All tier caps reached");
  });
});
