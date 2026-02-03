import { describe, it, expect } from "vitest";
import { getPlanLimits } from "./planLimits";

describe("Plan Limits", () => {
  describe("getPlanLimits", () => {
    it("should return correct limits for starter plan", () => {
      const limits = getPlanLimits("starter");
      expect(limits.maxUsers).toBe(3);
      expect(limits.maxCallsPerMonth).toBe(500);
      expect(limits.maxCrmIntegrations).toBe(1);
    });

    it("should return correct limits for growth plan", () => {
      const limits = getPlanLimits("growth");
      expect(limits.maxUsers).toBe(10);
      expect(limits.maxCallsPerMonth).toBe(2000);
      expect(limits.maxCrmIntegrations).toBe(2);
    });

    it("should return correct limits for scale plan", () => {
      const limits = getPlanLimits("scale");
      expect(limits.maxUsers).toBe(999); // Unlimited
      expect(limits.maxCallsPerMonth).toBe(-1); // Unlimited
      expect(limits.maxCrmIntegrations).toBe(5);
    });

    it("should return starter limits for unknown plan", () => {
      const limits = getPlanLimits("unknown");
      expect(limits.maxUsers).toBe(3);
      expect(limits.maxCallsPerMonth).toBe(500);
      expect(limits.maxCrmIntegrations).toBe(1);
    });

    it("should return starter limits for trial plan", () => {
      // Trial should default to starter limits
      const limits = getPlanLimits("trial");
      expect(limits.maxUsers).toBe(3);
      expect(limits.maxCallsPerMonth).toBe(500);
    });
  });
});
