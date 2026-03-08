import { describe, it, expect } from "vitest";
import { determineTier, type BuyerTier } from "./buyerAutoTier";

const baseBuyer = {
  ghlTier: null as string | null,
  verifiedFunding: false,
  hasPurchasedBefore: false,
  responseSpeed: null as string | null,
  totalOffers: 0,
  totalSends: 0,
  totalResponses: 0,
  hasAccepted: false,
  isVip: false,
};

describe("determineTier", () => {
  // ─── GHL CRM overrides ───
  it("returns halted when GHL tier is Halted", () => {
    const result = determineTier({ ...baseBuyer, ghlTier: "Halted" });
    expect(result.tier).toBe("halted");
    expect(result.reason).toContain("Manually halted");
  });

  it("returns jv_partner when GHL tier is JV Partner", () => {
    const result = determineTier({ ...baseBuyer, ghlTier: "JV Partner" });
    expect(result.tier).toBe("jv_partner");
  });

  it("returns priority when GHL tier is Priority", () => {
    const result = determineTier({ ...baseBuyer, ghlTier: "Priority" });
    expect(result.tier).toBe("priority");
  });

  it("returns qualified when GHL tier is Qualified", () => {
    const result = determineTier({ ...baseBuyer, ghlTier: "Qualified" });
    expect(result.tier).toBe("qualified");
  });

  it("returns unqualified when GHL tier is Unqualified", () => {
    const result = determineTier({ ...baseBuyer, ghlTier: "Unqualified" });
    expect(result.tier).toBe("unqualified");
  });

  it("GHL tier is case-insensitive", () => {
    expect(determineTier({ ...baseBuyer, ghlTier: "HALTED" }).tier).toBe("halted");
    expect(determineTier({ ...baseBuyer, ghlTier: "jv_partner" }).tier).toBe("jv_partner");
    expect(determineTier({ ...baseBuyer, ghlTier: "PRIORITY" }).tier).toBe("priority");
  });

  // ─── Auto-scoring: Priority tier (score >= 45) ───
  it("assigns priority for verified funding + purchased before", () => {
    const result = determineTier({
      ...baseBuyer,
      verifiedFunding: true,   // +30
      hasPurchasedBefore: true, // +25 = 55
    });
    expect(result.tier).toBe("priority");
    expect(result.reason).toContain("verified funding");
    expect(result.reason).toContain("purchased before");
  });

  it("assigns priority for VIP + verified funding + lightning responder", () => {
    const result = determineTier({
      ...baseBuyer,
      verifiedFunding: true,     // +30
      responseSpeed: "lightning", // +20
      isVip: true,                // +15 = 65
    });
    expect(result.tier).toBe("priority");
  });

  it("assigns priority for proven closer with funding and offers", () => {
    const result = determineTier({
      ...baseBuyer,
      verifiedFunding: true,  // +30
      hasAccepted: true,       // +20
      totalOffers: 3,          // +15 = 65
    });
    expect(result.tier).toBe("priority");
  });

  // ─── Auto-scoring: Qualified tier (score 20-44) ───
  it("assigns qualified for purchased before only", () => {
    const result = determineTier({
      ...baseBuyer,
      hasPurchasedBefore: true, // +25
    });
    expect(result.tier).toBe("qualified");
  });

  it("assigns qualified for verified funding only", () => {
    const result = determineTier({
      ...baseBuyer,
      verifiedFunding: true, // +30
    });
    // 30 >= 20 but < 45, so qualified
    expect(result.tier).toBe("qualified");
  });

  it("assigns qualified for same-day responder + some offers", () => {
    const result = determineTier({
      ...baseBuyer,
      responseSpeed: "same day", // +12
      totalOffers: 1,            // +8 = 20
    });
    expect(result.tier).toBe("qualified");
  });

  it("assigns qualified for VIP with some activity", () => {
    const result = determineTier({
      ...baseBuyer,
      isVip: true,       // +15
      totalOffers: 1,    // +8 = 23
    });
    expect(result.tier).toBe("qualified");
  });

  // ─── Auto-scoring: Unqualified tier (score < 20) ───
  it("assigns unqualified for brand new buyer with no data", () => {
    const result = determineTier({ ...baseBuyer });
    expect(result.tier).toBe("unqualified");
    expect(result.reason).toContain("no qualifying signals");
  });

  it("assigns unqualified for slow responder with 1 offer", () => {
    const result = determineTier({
      ...baseBuyer,
      responseSpeed: "slow", // +5
      totalOffers: 1,        // +8 = 13
    });
    expect(result.tier).toBe("unqualified");
  });

  it("assigns unqualified for ghost responder", () => {
    const result = determineTier({
      ...baseBuyer,
      responseSpeed: "ghost", // +0
      totalSends: 5,          // no points for sends
    });
    expect(result.tier).toBe("unqualified");
  });

  // ─── Edge cases ───
  it("GHL tier overrides even high auto-score", () => {
    // Even with perfect auto-score data, GHL "Unqualified" wins
    const result = determineTier({
      ...baseBuyer,
      ghlTier: "Unqualified",
      verifiedFunding: true,
      hasPurchasedBefore: true,
      isVip: true,
    });
    expect(result.tier).toBe("unqualified");
  });

  it("handles null/empty GHL tier gracefully", () => {
    const result1 = determineTier({ ...baseBuyer, ghlTier: null });
    expect(result1.tier).toBe("unqualified");
    const result2 = determineTier({ ...baseBuyer, ghlTier: "" });
    expect(result2.tier).toBe("unqualified");
  });

  it("active responder bonus applies at 3+ responses", () => {
    const result = determineTier({
      ...baseBuyer,
      totalResponses: 3,       // +10
      totalOffers: 1,          // +8
      responseSpeed: "slow",   // +5 = 23
    });
    expect(result.tier).toBe("qualified");
  });

  it("same-day hyphenated variant works", () => {
    const result = determineTier({
      ...baseBuyer,
      responseSpeed: "same-day", // +12
      totalOffers: 1,            // +8 = 20
    });
    expect(result.tier).toBe("qualified");
  });
});
