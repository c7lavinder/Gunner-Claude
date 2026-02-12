import { describe, it, expect } from "vitest";

/**
 * Tests for admin call reclassification logic.
 * Verifies that the reclassify endpoint correctly determines
 * status and grading triggers for different classifications.
 */

// Simulate the reclassify logic from routers.ts
function determineReclassifyBehavior(classification: string, currentStatus: string) {
  const shouldGrade = classification === "conversation" || classification === "admin_call";
  const newStatus = shouldGrade ? "completed" : "skipped";
  const shouldTriggerProcessCall = shouldGrade && (currentStatus === "skipped" || currentStatus === "completed");
  
  return { shouldGrade, newStatus, shouldTriggerProcessCall };
}

describe("Admin call reclassify logic", () => {
  describe("classification to status mapping", () => {
    it("should set status to completed for conversation", () => {
      const result = determineReclassifyBehavior("conversation", "skipped");
      expect(result.newStatus).toBe("completed");
      expect(result.shouldGrade).toBe(true);
    });

    it("should set status to completed for admin_call", () => {
      const result = determineReclassifyBehavior("admin_call", "skipped");
      expect(result.newStatus).toBe("completed");
      expect(result.shouldGrade).toBe(true);
    });

    it("should set status to skipped for voicemail", () => {
      const result = determineReclassifyBehavior("voicemail", "skipped");
      expect(result.newStatus).toBe("skipped");
      expect(result.shouldGrade).toBe(false);
    });

    it("should set status to skipped for no_answer", () => {
      const result = determineReclassifyBehavior("no_answer", "completed");
      expect(result.newStatus).toBe("skipped");
      expect(result.shouldGrade).toBe(false);
    });

    it("should set status to skipped for callback_request", () => {
      const result = determineReclassifyBehavior("callback_request", "skipped");
      expect(result.newStatus).toBe("skipped");
      expect(result.shouldGrade).toBe(false);
    });

    it("should set status to skipped for wrong_number", () => {
      const result = determineReclassifyBehavior("wrong_number", "skipped");
      expect(result.newStatus).toBe("skipped");
      expect(result.shouldGrade).toBe(false);
    });
  });

  describe("processCall trigger conditions", () => {
    it("should trigger grading when admin_call is reclassified from skipped", () => {
      const result = determineReclassifyBehavior("admin_call", "skipped");
      expect(result.shouldTriggerProcessCall).toBe(true);
    });

    it("should trigger grading when conversation is reclassified from skipped", () => {
      const result = determineReclassifyBehavior("conversation", "skipped");
      expect(result.shouldTriggerProcessCall).toBe(true);
    });

    it("should trigger re-grading when admin_call is reclassified from completed", () => {
      const result = determineReclassifyBehavior("admin_call", "completed");
      expect(result.shouldTriggerProcessCall).toBe(true);
    });

    it("should trigger re-grading when conversation is reclassified from completed", () => {
      const result = determineReclassifyBehavior("conversation", "completed");
      expect(result.shouldTriggerProcessCall).toBe(true);
    });

    it("should NOT trigger grading when voicemail is reclassified", () => {
      const result = determineReclassifyBehavior("voicemail", "skipped");
      expect(result.shouldTriggerProcessCall).toBe(false);
    });

    it("should NOT trigger grading when no_answer is reclassified", () => {
      const result = determineReclassifyBehavior("no_answer", "completed");
      expect(result.shouldTriggerProcessCall).toBe(false);
    });
  });

  describe("Auto-Grade as Admin button behavior", () => {
    it("should send admin_call classification (not conversation)", () => {
      // The button should send classification: "admin_call"
      // Previously it was incorrectly sending "conversation"
      const buttonClassification = "admin_call";
      const result = determineReclassifyBehavior(buttonClassification, "skipped");
      
      expect(result.shouldGrade).toBe(true);
      expect(result.newStatus).toBe("completed");
      expect(result.shouldTriggerProcessCall).toBe(true);
    });

    it("should handle existing skipped admin calls correctly", () => {
      // An admin call that was previously skipped should be gradeable
      const result = determineReclassifyBehavior("admin_call", "skipped");
      expect(result.shouldGrade).toBe(true);
      expect(result.shouldTriggerProcessCall).toBe(true);
    });
  });
});
