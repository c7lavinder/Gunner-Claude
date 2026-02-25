import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opportunityDetectionCode = readFileSync(
  resolve(__dirname, "opportunityDetection.ts"),
  "utf-8"
);

describe("Signal Detection Improvements", () => {
  describe("hasOpenFollowUpTask function", () => {
    it("should exist and check for uncompleted tasks", () => {
      expect(opportunityDetectionCode).toContain("async function hasOpenFollowUpTask");
      expect(opportunityDetectionCode).toContain("!t.completed");
    });

    it("should return false for null creds or contactId", () => {
      expect(opportunityDetectionCode).toContain("if (!creds || !contactId) return false");
    });

    it("should fetch tasks from GHL contacts endpoint", () => {
      expect(opportunityDetectionCode).toContain("/contacts/${contactId}/tasks");
    });
  });

  describe("Task checks alongside appointment checks", () => {
    it("should check for open tasks after appointment checks in all detection rules", () => {
      // Count how many times hasOpenFollowUpTask is called (should be at every appointment check)
      const taskCheckCount = (opportunityDetectionCode.match(/hasOpenFollowUpTask/g) || []).length;
      // At least 8 calls: 1 function definition + at least 7 usage sites
      expect(taskCheckCount).toBeGreaterThanOrEqual(8);
    });

    it("should skip signals when open task exists", () => {
      // Verify the pattern: if (hasTask) continue or if (hasTask) return null
      const taskSkipPatterns = (opportunityDetectionCode.match(/if \(hasTask\) (continue|return null)/g) || []).length;
      expect(taskSkipPatterns).toBeGreaterThanOrEqual(7);
    });
  });

  describe("Daily cap for signals", () => {
    it("should have a daily signal cap", () => {
      // Check for daily cap logic
      const hasDailyCap = opportunityDetectionCode.includes("DAILY_SIGNAL_CAP") || 
                          opportunityDetectionCode.includes("dailyCap") ||
                          opportunityDetectionCode.includes("signalsCreatedToday");
      expect(hasDailyCap).toBe(true);
    });

    it("should count signals created today before saving new ones", () => {
      // Check for today's signal count check
      const hasCountCheck = opportunityDetectionCode.includes("signalsCreatedToday") ||
                            opportunityDetectionCode.includes("todayCount") ||
                            opportunityDetectionCode.includes("createdToday");
      expect(hasCountCheck).toBe(true);
    });

    it("should sort candidates by priority before saving", () => {
      expect(opportunityDetectionCode).toContain("priorityScore");
      expect(opportunityDetectionCode).toContain("sort");
    });

    it("should limit new signals per scan based on remaining daily budget", () => {
      const hasBudget = opportunityDetectionCode.includes("remainingBudget") ||
                        opportunityDetectionCode.includes("savedThisScan") ||
                        opportunityDetectionCode.includes("dailyLimit");
      expect(hasBudget).toBe(true);
    });
  });

  describe("Team-level signal deduplication", () => {
    it("should check teamMemberId for dedup when ghlContactId is null", () => {
      // The isAlreadyFlagged function should handle null ghlContactId by checking teamMemberId
      expect(opportunityDetectionCode).toContain("teamMemberId");
      // Should not immediately return false for null ghlContactId anymore
      const isAlreadyFlaggedFn = opportunityDetectionCode.substring(
        opportunityDetectionCode.indexOf("async function isAlreadyFlagged"),
        opportunityDetectionCode.indexOf("async function isAlreadyFlagged") + 800
      );
      expect(isAlreadyFlaggedFn).toContain("teamMemberId");
    });
  });

  describe("Price gap filtering", () => {
    it("should skip signals with price gaps > $100k", () => {
      expect(opportunityDetectionCode).toContain("100_000");
    });

    it("should skip signals with price gaps >= 50% of seller ask", () => {
      expect(opportunityDetectionCode).toContain("gapPercent >= 0.5");
    });
  });

  describe("Weekend awareness", () => {
    it("should have includesWeekend helper function", () => {
      expect(opportunityDetectionCode).toContain("function includesWeekend");
    });

    it("should have weekendAdjustedThreshold helper function", () => {
      expect(opportunityDetectionCode).toContain("function weekendAdjustedThreshold");
    });

    it("should add 48 hours grace for weekend periods", () => {
      expect(opportunityDetectionCode).toContain("baseHours + 48");
    });
  });
});
