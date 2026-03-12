/**
 * Unit tests for sorting algorithm config objects.
 */
import { describe, it, expect } from "vitest";
import { SOFTWARE_PLAYBOOK } from "../../../server/services/playbooks";

describe("Algorithm Framework", () => {
  describe("inventorySort", () => {
    it("has defined tiers", () => {
      const tiers = SOFTWARE_PLAYBOOK.algorithmFramework.inventorySort.tiers;
      expect(tiers).toHaveLength(4);
      expect(tiers).toContain("immediate_attention");
      expect(tiers).toContain("new");
      expect(tiers).toContain("active_working");
      expect(tiers).toContain("contacted_today");
    });
  });

  describe("buyerMatch", () => {
    it("has defined steps", () => {
      const steps = SOFTWARE_PLAYBOOK.algorithmFramework.buyerMatch.steps;
      expect(steps).toHaveLength(3);
      expect(steps[0]).toBe("hard_filter_market");
      expect(steps[1]).toBe("score");
      expect(steps[2]).toBe("sort");
    });
  });

  describe("taskSort", () => {
    it("has defined tiers", () => {
      const tiers = SOFTWARE_PLAYBOOK.algorithmFramework.taskSort.tiers;
      expect(tiers).toHaveLength(5);
      expect(tiers).toContain("urgent");
      expect(tiers).toContain("inbound");
      expect(tiers).toContain("scheduled");
      expect(tiers).toContain("overdue");
      expect(tiers).toContain("regular");
    });
  });
});
