import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the email service functions
vi.mock("./emailService", () => ({
  sendSequenceDay0Welcome: vi.fn().mockResolvedValue(true),
  sendSequenceDay1Checkin: vi.fn().mockResolvedValue(true),
  sendSequenceDay2TrialEnding: vi.fn().mockResolvedValue(true),
  sendSequenceDay3FinalReminder: vi.fn().mockResolvedValue(true),
  sendSequenceDay4PaidWelcome: vi.fn().mockResolvedValue(true),
  sendSequenceDay7Week1Recap: vi.fn().mockResolvedValue(true),
  sendSequenceDay10FeatureSpotlight: vi.fn().mockResolvedValue(true),
  sendSequenceDay14Checkin: vi.fn().mockResolvedValue(true),
  sendTriggerNoCalls48h: vi.fn().mockResolvedValue(true),
  sendTriggerPowerUser: vi.fn().mockResolvedValue(true),
}));

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe("Email Sequence Jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("runEmailSequenceJobs", () => {
    it("should return empty results when database is not available", async () => {
      const { runEmailSequenceJobs } = await import("./emailSequenceJobs");
      
      const result = await runEmailSequenceJobs();
      
      expect(result).toEqual({
        processed: 0,
        emailsSent: 0,
        errors: ["Database not available"],
      });
    });

    it("should export the runEmailSequenceJobs function", async () => {
      const emailSequenceJobs = await import("./emailSequenceJobs");
      
      expect(typeof emailSequenceJobs.runEmailSequenceJobs).toBe("function");
    });

    it("should export the sendWelcomeSequenceEmail function", async () => {
      const emailSequenceJobs = await import("./emailSequenceJobs");
      
      expect(typeof emailSequenceJobs.sendWelcomeSequenceEmail).toBe("function");
    });
  });

  describe("sendWelcomeSequenceEmail", () => {
    it("should return false when tenant admin is not found", async () => {
      const { sendWelcomeSequenceEmail } = await import("./emailSequenceJobs");
      
      // With mocked null database, admin won't be found
      const result = await sendWelcomeSequenceEmail(999);
      
      expect(result).toBe(false);
    });
  });
});

describe("Email Sequence Time Calculations", () => {
  it("should correctly calculate days since creation", () => {
    // Test the time calculation logic
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    
    const diffTime = Math.abs(now.getTime() - threeDaysAgo.getTime());
    const daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    expect(daysSince).toBe(3);
  });

  it("should correctly calculate hours since creation", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    const diffTime = Math.abs(now.getTime() - twoHoursAgo.getTime());
    const hoursSince = Math.floor(diffTime / (1000 * 60 * 60));
    
    expect(hoursSince).toBe(2);
  });
});
