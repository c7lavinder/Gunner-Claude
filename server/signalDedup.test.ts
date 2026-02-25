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

  it("has a daily signal cap of 5 per tenant", () => {
    expect(opportunityDetectionSource).toContain("DAILY_SIGNAL_CAP = 5");
  });

  it("checks how many signals were already created today before saving", () => {
    // Should count today's signals
    expect(opportunityDetectionSource).toContain("alreadyCreatedToday");
    expect(opportunityDetectionSource).toContain("remainingSlots");
  });

  it("sorts detections by priority before saving (highest first)", () => {
    // Should sort by tier weight + priority score
    expect(opportunityDetectionSource).toContain("tierWeight");
    expect(opportunityDetectionSource).toContain("detections.sort");
    // missed tier should have highest weight
    const tierWeightMatch = opportunityDetectionSource.match(
      /missed:\s*(\d+).*warning:\s*(\d+).*possible:\s*(\d+)/s
    );
    expect(tierWeightMatch).toBeTruthy();
    const missedWeight = parseInt(tierWeightMatch![1]);
    const warningWeight = parseInt(tierWeightMatch![2]);
    const possibleWeight = parseInt(tierWeightMatch![3]);
    expect(missedWeight).toBeGreaterThan(warningWeight);
    expect(warningWeight).toBeGreaterThan(possibleWeight);
  });

  it("stops saving when daily cap is reached", () => {
    // Should break out of the loop when savedThisScan >= remainingSlots
    expect(opportunityDetectionSource).toContain("savedThisScan >= remainingSlots");
    expect(opportunityDetectionSource).toContain("savedThisScan++");
  });

  it("early returns when daily cap is already at 0", () => {
    // Should return early if remainingSlots === 0
    expect(opportunityDetectionSource).toContain("if (remainingSlots === 0)");
    expect(opportunityDetectionSource).toContain("Daily cap reached");
  });
});
