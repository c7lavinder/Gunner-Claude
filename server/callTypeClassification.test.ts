import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to verify that call type classification never defaults to "offer" based on role alone.
 * The "offer" type should only be assigned when a specific dollar amount is presented in the transcript.
 */

const gradingTs = fs.readFileSync(path.join(__dirname, "grading.ts"), "utf-8");
const webhookTs = fs.readFileSync(path.join(__dirname, "webhook.ts"), "utf-8");
const ghlServiceTs = fs.readFileSync(path.join(__dirname, "ghlService.ts"), "utf-8");
const batchDialerTs = fs.readFileSync(path.join(__dirname, "batchDialerSync.ts"), "utf-8");
const routersTs = fs.readFileSync(path.join(__dirname, "routers.ts"), "utf-8");

describe("Call Type Classification - No Role-Based Offer Default", () => {
  
  describe("grading.ts - detectCallType prompt", () => {
    it("should require a SPECIFIC DOLLAR AMOUNT for offer classification", () => {
      expect(gradingTs).toContain("SPECIFIC DOLLAR AMOUNT");
    });

    it("should state that the word 'offer' alone does NOT make it an offer call", () => {
      expect(gradingTs).toContain("The word \"offer\" appearing in the transcript does NOT automatically make this an offer call");
    });

    it("should classify busy/unavailable callback scheduling as admin_callback", () => {
      expect(gradingTs).toContain("busy/unavailable and the rep just schedules a callback");
      expect(gradingTs).toContain("admin_callback");
    });

    it("should instruct not to default to offer based on team member role", () => {
      expect(gradingTs).toContain("Do NOT default to \"offer\" just because the team member is an acquisition manager");
    });

    it("should use role as a WEAK hint only", () => {
      expect(gradingTs).toContain("WEAK hint only");
    });

    it("should classify short callback-only calls as admin_callback", () => {
      expect(gradingTs).toContain("under 2 minutes");
      expect(gradingTs).toContain("scheduling a callback time");
    });

    it("should handle 'discuss an offer' without actual offer as admin_callback", () => {
      expect(gradingTs).toContain("mentions wanting to \"discuss an offer\" but the other person is unavailable");
    });
  });

  describe("grading.ts - processCall fallback logic", () => {
    it("should never default acquisition_manager to 'offer' in low-confidence fallback", () => {
      // The old code had: if (teamMemberRole === "acquisition_manager") callType = "offer"
      // This should no longer exist
      expect(gradingTs).not.toMatch(/teamMemberRole\s*===?\s*["']acquisition_manager["']\s*\)?\s*\{?\s*\n?\s*callType\s*=\s*["']offer["']/);
    });

    it("should have a medium-confidence tier (0.4-0.6) that still uses AI suggestion", () => {
      expect(gradingTs).toContain("aiDetection.confidence >= 0.4");
      expect(gradingTs).toContain("medium-confidence AI detection");
    });

    it("should comment explaining why offer is not a role-based default", () => {
      expect(gradingTs).toContain("Never default to \"offer\" based on role alone");
    });
  });

  describe("webhook.ts - no role-based offer pre-assignment", () => {
    it("should not pre-assign 'offer' based on acquisition_manager role", () => {
      // Should NOT contain the old pattern: acquisition_manager ? "offer"
      expect(webhookTs).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });

    it("should default acquisition managers to 'qualification' not 'offer'", () => {
      // Should use lead_generator ? cold_call : qualification pattern
      expect(webhookTs).toContain("lead_generator");
      expect(webhookTs).toContain("qualification");
    });

    it("should have a comment explaining the design decision", () => {
      expect(webhookTs).toContain("AI detection in processCall will determine the real type");
    });
  });

  describe("ghlService.ts - no role-based offer pre-assignment", () => {
    it("should not pre-assign 'offer' based on acquisition_manager role", () => {
      expect(ghlServiceTs).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });

    it("should default to 'qualification' for non-lead-generators", () => {
      expect(ghlServiceTs).toContain("lead_generator");
    });
  });

  describe("batchDialerSync.ts - no role-based offer pre-assignment", () => {
    it("should not pre-assign 'offer' based on acquisition_manager role", () => {
      expect(batchDialerTs).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });

    it("getCallTypeForRole should not return 'offer'", () => {
      // The function return type should not include "offer"
      expect(batchDialerTs).toMatch(/getCallTypeForRole.*:\s*["']cold_call["']\s*\|\s*["']qualification["']/);
    });
  });

  describe("routers.ts - manual upload no role-based offer", () => {
    it("should not pre-assign 'offer' for manual uploads based on role", () => {
      // Find the manual upload section and verify no acquisition_manager -> offer mapping
      const manualUploadSection = routersTs.slice(
        routersTs.indexOf("uploadManual"),
        routersTs.indexOf("uploadManual") + 2000
      );
      expect(manualUploadSection).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });
  });
});
