import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue({}),
  }),
}));

import { 
  getOutreachTemplate, 
  sendPasswordResetEmail,
  sendTeamInviteEmail,
  sendWelcomeEmail,
  sendChurnOutreachEmail,
  recordOutreachHistory
} from "./emailService";

describe("Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOutreachTemplate", () => {
    it("should return 7-day template for 0-13 days inactive", () => {
      expect(getOutreachTemplate(0)).toEqual({ type: "churn_7_day", templateType: "7_day" });
      expect(getOutreachTemplate(7)).toEqual({ type: "churn_7_day", templateType: "7_day" });
      expect(getOutreachTemplate(13)).toEqual({ type: "churn_7_day", templateType: "7_day" });
    });

    it("should return 14-day template for 14-29 days inactive", () => {
      expect(getOutreachTemplate(14)).toEqual({ type: "churn_14_day", templateType: "14_day" });
      expect(getOutreachTemplate(20)).toEqual({ type: "churn_14_day", templateType: "14_day" });
      expect(getOutreachTemplate(29)).toEqual({ type: "churn_14_day", templateType: "14_day" });
    });

    it("should return 30-day template for 30+ days inactive", () => {
      expect(getOutreachTemplate(30)).toEqual({ type: "churn_30_day", templateType: "30_day" });
      expect(getOutreachTemplate(45)).toEqual({ type: "churn_30_day", templateType: "30_day" });
      expect(getOutreachTemplate(100)).toEqual({ type: "churn_30_day", templateType: "30_day" });
    });
  });

  describe("sendEmail — all disabled after spam attack", () => {
    it("should return false for password reset email (sending disabled)", async () => {
      const result = await sendPasswordResetEmail(
        "test@example.com",
        "token123",
        "https://example.com"
      );
      
      // All email sending is disabled — returns false
      expect(result).toBe(false);
    });

    it("should return false for team invite email (sending disabled)", async () => {
      const result = await sendTeamInviteEmail(
        "new@example.com",
        "John Doe",
        "Test Company",
        "admin",
        "https://example.com"
      );
      
      expect(result).toBe(false);
    });

    it("should return false for welcome email (sending disabled)", async () => {
      const result = await sendWelcomeEmail(
        "Jane Doe",
        "jane@example.com",
        "Test Company",
        "user"
      );
      
      expect(result).toBe(false);
    });

    it("should return false for churn outreach email (sending disabled)", async () => {
      const result = await sendChurnOutreachEmail(
        "Test Tenant",
        "John",
        "john@example.com",
        15,
        "2026-01-15"
      );
      
      // All emails disabled including churn
      expect(result).toBe(false);
    });
  });

  describe("recordOutreachHistory", () => {
    it("should record outreach history successfully", async () => {
      const result = await recordOutreachHistory(
        1,
        "7_day",
        "test@example.com",
        "John Doe",
        7,
        new Date(),
        1,
        "Admin User"
      );
      
      expect(result).toBe(true);
    });
  });
});
