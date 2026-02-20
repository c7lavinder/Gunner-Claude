import { describe, it, expect } from "vitest";

describe("Prior Period Comparison", () => {
  describe("getCallStats returns priorPeriod data", () => {
    it("should return priorPeriod for 'week' dateRange", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "week" });
      
      expect(result).toBeDefined();
      expect(typeof result.totalCalls).toBe("number");
      expect(typeof result.gradedCalls).toBe("number");
      expect(typeof result.appointmentsSet).toBe("number");
      expect(typeof result.offerCallsCompleted).toBe("number");
      expect(typeof result.averageScore).toBe("number");
      
      // priorPeriod should be present for 'week' filter
      expect(result.priorPeriod).toBeDefined();
      expect(typeof result.priorPeriod!.totalCalls).toBe("number");
      expect(typeof result.priorPeriod!.gradedCalls).toBe("number");
      expect(typeof result.priorPeriod!.appointmentsSet).toBe("number");
      expect(typeof result.priorPeriod!.offerCallsCompleted).toBe("number");
      expect(typeof result.priorPeriod!.averageScore).toBe("number");
    });

    it("should return priorPeriod for 'today' dateRange", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "today" });
      
      expect(result.priorPeriod).toBeDefined();
      expect(typeof result.priorPeriod!.totalCalls).toBe("number");
    });

    it("should return priorPeriod for 'month' dateRange", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "month" });
      
      expect(result.priorPeriod).toBeDefined();
      expect(typeof result.priorPeriod!.totalCalls).toBe("number");
    });

    it("should NOT return priorPeriod for 'all' dateRange", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "all" });
      
      // 'all' has no meaningful prior period
      expect(result.priorPeriod).toBeUndefined();
    });

    it("should NOT return priorPeriod for 'ytd' dateRange", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "ytd" });
      
      // 'ytd' has no meaningful prior period
      expect(result.priorPeriod).toBeUndefined();
    });

    it("should return non-negative values in priorPeriod", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "week" });
      
      expect(result.priorPeriod!.totalCalls).toBeGreaterThanOrEqual(0);
      expect(result.priorPeriod!.gradedCalls).toBeGreaterThanOrEqual(0);
      expect(result.priorPeriod!.appointmentsSet).toBeGreaterThanOrEqual(0);
      expect(result.priorPeriod!.offerCallsCompleted).toBeGreaterThanOrEqual(0);
      expect(result.priorPeriod!.averageScore).toBeGreaterThanOrEqual(0);
    });

    it("priorPeriod gradedCalls should be <= totalCalls", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "week" });
      
      expect(result.priorPeriod!.gradedCalls).toBeLessThanOrEqual(result.priorPeriod!.totalCalls);
    });

    it("priorPeriod averageScore should be between 0 and 100", async () => {
      const { getCallStats } = await import("./db");
      const result = await getCallStats({ dateRange: "week" });
      
      expect(result.priorPeriod!.averageScore).toBeGreaterThanOrEqual(0);
      expect(result.priorPeriod!.averageScore).toBeLessThanOrEqual(100);
    });
  });

  describe("StatCard percentage change calculation logic", () => {
    // Test the percentage change calculation logic that StatCard uses
    function calculateChange(
      currentValue: number,
      priorValue: number,
      isPercentage: boolean = false
    ): { pct: number; direction: "up" | "down" | "flat" } | null {
      if (isPercentage) {
        const diff = currentValue - priorValue;
        if (Math.abs(diff) < 0.5) return { pct: 0, direction: "flat" };
        return {
          pct: Math.round(Math.abs(diff)),
          direction: diff > 0 ? "up" : "down",
        };
      }

      if (priorValue === 0 && currentValue === 0) return { pct: 0, direction: "flat" };
      if (priorValue === 0) return { pct: 100, direction: "up" };
      const pctChange = Math.round(((currentValue - priorValue) / priorValue) * 100);
      if (pctChange === 0) return { pct: 0, direction: "flat" };
      return {
        pct: Math.abs(pctChange),
        direction: pctChange > 0 ? "up" : "down",
      };
    }

    it("should show 'up' when current > prior", () => {
      const result = calculateChange(15, 10);
      expect(result).toEqual({ pct: 50, direction: "up" });
    });

    it("should show 'down' when current < prior", () => {
      const result = calculateChange(5, 10);
      expect(result).toEqual({ pct: 50, direction: "down" });
    });

    it("should show 'flat' when both are zero", () => {
      const result = calculateChange(0, 0);
      expect(result).toEqual({ pct: 0, direction: "flat" });
    });

    it("should show 100% up when prior is 0 and current > 0", () => {
      const result = calculateChange(5, 0);
      expect(result).toEqual({ pct: 100, direction: "up" });
    });

    it("should show 'flat' when values are equal", () => {
      const result = calculateChange(10, 10);
      expect(result).toEqual({ pct: 0, direction: "flat" });
    });

    it("should handle percentage metrics with point difference", () => {
      // Avg score went from 72% to 80% = +8pt
      const result = calculateChange(80, 72, true);
      expect(result).toEqual({ pct: 8, direction: "up" });
    });

    it("should handle percentage decrease", () => {
      // Avg score went from 80% to 65% = -15pt
      const result = calculateChange(65, 80, true);
      expect(result).toEqual({ pct: 15, direction: "down" });
    });

    it("should show flat for tiny percentage differences", () => {
      // Less than 0.5pt difference should be flat
      const result = calculateChange(80.2, 80, true);
      expect(result).toEqual({ pct: 0, direction: "flat" });
    });

    it("should handle large increases correctly", () => {
      const result = calculateChange(100, 10);
      expect(result).toEqual({ pct: 900, direction: "up" });
    });

    it("should handle 100% decrease correctly", () => {
      const result = calculateChange(0, 10);
      expect(result).toEqual({ pct: 100, direction: "down" });
    });
  });
});
