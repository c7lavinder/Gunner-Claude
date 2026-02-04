import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "test-email-id" }, error: null }),
    },
  })),
}));

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
  sendEmail,
  sendPasswordResetEmail,
  sendTeamInviteEmail,
  sendWelcomeEmail,
  sendChurnOutreachEmail,
  recordOutreachHistory
} from "./emailService";
import { notifyOwner } from "./_core/notification";

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

  describe("sendEmail", () => {
    it("should send password reset email via Resend", async () => {
      const result = await sendPasswordResetEmail(
        "test@example.com",
        "token123",
        "https://example.com"
      );
      
      // With Resend configured, it should return true (email sent)
      expect(result).toBe(true);
    });

    it("should send team invite email via Resend", async () => {
      const result = await sendTeamInviteEmail(
        "new@example.com",
        "John Doe",
        "Test Company",
        "admin",
        "https://example.com"
      );
      
      expect(result).toBe(true);
    });

    it("should send welcome email via Resend", async () => {
      const result = await sendWelcomeEmail(
        "Jane Doe",
        "jane@example.com",
        "Test Company",
        "user"
      );
      
      expect(result).toBe(true);
    });

    it("should send churn outreach email via notifyOwner (internal notification)", async () => {
      const result = await sendChurnOutreachEmail(
        "Test Tenant",
        "John",
        "john@example.com",
        15,
        "2026-01-15"
      );
      
      expect(result).toBe(true);
      // Churn emails still go through notifyOwner
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("URGENT"),
          content: expect.stringContaining("two weeks"),
        })
      );
    });
  });

  describe("Email Template Content", () => {
    it("should include gentle language in 7-day template", async () => {
      await sendChurnOutreachEmail(
        "Test Tenant",
        "John",
        "john@example.com",
        7,
        "2026-01-20"
      );
      
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("checking in"),
        })
      );
    });

    it("should include urgent language in 14-day template", async () => {
      await sendChurnOutreachEmail(
        "Test Tenant",
        "John",
        "john@example.com",
        14,
        "2026-01-15"
      );
      
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("URGENT"),
          content: expect.stringContaining("miss you"),
        })
      );
    });

    it("should include win-back offer in 30-day template", async () => {
      await sendChurnOutreachEmail(
        "Test Tenant",
        "John",
        "john@example.com",
        35,
        "2026-01-01"
      );
      
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("CRITICAL"),
          content: expect.stringContaining("FREE 30-minute strategy call"),
        })
      );
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
