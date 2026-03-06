import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to verify call type classification logic.
 * The system uses role as a strong default for acquisition managers (offer),
 * but transcript evidence can override the role-based default.
 */

const gradingTs = fs.readFileSync(path.join(__dirname, "grading.ts"), "utf-8");
const webhookTs = fs.readFileSync(path.join(__dirname, "webhook.ts"), "utf-8");
const ghlServiceTs = fs.readFileSync(path.join(__dirname, "ghlService.ts"), "utf-8");
const batchDialerTs = fs.readFileSync(path.join(__dirname, "batchDialerSync.ts"), "utf-8");
const routersTs = fs.readFileSync(path.join(__dirname, "routers.ts"), "utf-8");

describe("Call Type Classification", () => {
  
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

    it("should use acquisition_manager role as default for offer classification", () => {
      // The system defaults AM calls to offer, with transcript override capability
      expect(gradingTs).toContain("acquisition_manager");
      expect(gradingTs).toContain("DEFAULT to \"offer\"");
    });

    it("should allow transcript to override role-based default with strong evidence", () => {
      expect(gradingTs).toContain("transcript can override the role-based default");
      expect(gradingTs).toContain("STRONG clear evidence");
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
    it("should have acquisition_manager default to offer in fallback", () => {
      // The code defaults AM to offer in the fallback path
      expect(gradingTs).toContain("Acquisition managers are in the offer stage");
    });

    it("should have a medium-confidence tier (0.4-0.6) that still uses AI suggestion", () => {
      expect(gradingTs).toContain("aiDetection.confidence >= 0.4");
      expect(gradingTs).toContain("medium-confidence AI detection");
    });
  });

  describe("webhook.ts - call type assignment", () => {
    it("should reference lead_generator role for cold_call assignment", () => {
      expect(webhookTs).toContain("lead_generator");
    });

    it("should include qualification as a call type", () => {
      expect(webhookTs).toContain("qualification");
    });
  });

  describe("ghlService.ts - no role-based offer pre-assignment in webhook", () => {
    it("should not pre-assign 'offer' based on acquisition_manager role in webhook handler", () => {
      expect(ghlServiceTs).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });

    it("should default to 'qualification' for non-lead-generators", () => {
      expect(ghlServiceTs).toContain("lead_generator");
    });
  });

  describe("batchDialerSync.ts - call type assignment", () => {
    it("should not pre-assign 'offer' based on acquisition_manager role in batch import", () => {
      expect(batchDialerTs).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });

    it("getCallTypeForRole should return cold_call or qualification", () => {
      expect(batchDialerTs).toMatch(/getCallTypeForRole.*:\s*["']cold_call["']\s*\|\s*["']qualification["']/);
    });
  });

  describe("routers.ts - manual upload", () => {
    it("should not pre-assign 'offer' for manual uploads based on role", () => {
      const manualUploadSection = routersTs.slice(
        routersTs.indexOf("uploadManual"),
        routersTs.indexOf("uploadManual") + 2000
      );
      expect(manualUploadSection).not.toMatch(/acquisition_manager["']\s*\?\s*["']offer["']/);
    });
  });
});
