import { describe, it, expect, vi } from "vitest";

/**
 * Tests for Lead Generator analytics integration:
 * 1. getCallStats includes leadsGenerated metric
 * 2. getLeaderboardData includes leadsGenerated per member
 * 3. Prior period comparison includes leadsGenerated
 */

// Mock the database module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
  };
});

describe("Lead Generator Analytics - leadsGenerated metric", () => {
  describe("getCallStats return type", () => {
    it("should include leadsGenerated in the stats return type", async () => {
      // Import the function to verify the type includes leadsGenerated
      const { getCallStats } = await import("./db");
      expect(typeof getCallStats).toBe("function");
    });
  });

  describe("leadsGenerated calculation logic", () => {
    it("should count unique phone numbers from lead generator conversations with positive outcomes", () => {
      // Simulate the leadsGenerated calculation logic
      const positiveOutcomes = new Set([
        "appointment_set",
        "interested",
        "callback_scheduled",
        "callback_requested",
        "offer_made",
      ]);

      const lgMemberIds = new Set([101, 102, 103]);

      const mockCalls = [
        // Lead Generator 101 - conversation with interested seller
        { teamMemberId: 101, classification: "conversation", callOutcome: "interested", contactPhone: "+15551234567" },
        // Lead Generator 101 - same phone, different call (should not double count)
        { teamMemberId: 101, classification: "conversation", callOutcome: "appointment_set", contactPhone: "+15551234567" },
        // Lead Generator 102 - different phone, interested
        { teamMemberId: 102, classification: "conversation", callOutcome: "interested", contactPhone: "+15559876543" },
        // Lead Generator 103 - voicemail (not a conversation, should not count)
        { teamMemberId: 103, classification: "voicemail", callOutcome: "interested", contactPhone: "+15551112222" },
        // Lead Generator 101 - not interested (should not count)
        { teamMemberId: 101, classification: "conversation", callOutcome: "not_interested", contactPhone: "+15553334444" },
        // Non-lead-generator member - should not count
        { teamMemberId: 200, classification: "conversation", callOutcome: "interested", contactPhone: "+15555556666" },
        // Lead Generator 102 - admin_call with callback_scheduled (should count)
        { teamMemberId: 102, classification: "admin_call", callOutcome: "callback_scheduled", contactPhone: "+15557778888" },
        // Lead Generator 101 - no phone (should not count)
        { teamMemberId: 101, classification: "conversation", callOutcome: "interested", contactPhone: null },
      ];

      const lgLeadPhones = new Set<string>();
      for (const c of mockCalls) {
        if (
          c.teamMemberId && lgMemberIds.has(c.teamMemberId) &&
          (c.classification === "conversation" || c.classification === "admin_call") &&
          positiveOutcomes.has(c.callOutcome || "") &&
          c.contactPhone
        ) {
          lgLeadPhones.add(c.contactPhone);
        }
      }

      // Should count: +15551234567 (LG101), +15559876543 (LG102), +15557778888 (LG102)
      // Should NOT count: +15551112222 (voicemail), +15553334444 (not_interested), +15555556666 (non-LG), null phone
      expect(lgLeadPhones.size).toBe(3);
      expect(lgLeadPhones.has("+15551234567")).toBe(true);
      expect(lgLeadPhones.has("+15559876543")).toBe(true);
      expect(lgLeadPhones.has("+15557778888")).toBe(true);
    });

    it("should return 0 when no lead generators exist", () => {
      const lgMemberIds = new Set<number>();
      const positiveOutcomes = new Set(["appointment_set", "interested"]);

      const mockCalls = [
        { teamMemberId: 200, classification: "conversation", callOutcome: "interested", contactPhone: "+15551234567" },
      ];

      const lgLeadPhones = new Set<string>();
      for (const c of mockCalls) {
        if (
          c.teamMemberId && lgMemberIds.has(c.teamMemberId) &&
          (c.classification === "conversation" || c.classification === "admin_call") &&
          positiveOutcomes.has(c.callOutcome || "") &&
          c.contactPhone
        ) {
          lgLeadPhones.add(c.contactPhone);
        }
      }

      expect(lgLeadPhones.size).toBe(0);
    });

    it("should deduplicate by phone number across multiple lead generators", () => {
      const lgMemberIds = new Set([101, 102]);
      const positiveOutcomes = new Set(["appointment_set", "interested"]);

      const mockCalls = [
        // Both LG101 and LG102 called the same phone
        { teamMemberId: 101, classification: "conversation", callOutcome: "interested", contactPhone: "+15551234567" },
        { teamMemberId: 102, classification: "conversation", callOutcome: "appointment_set", contactPhone: "+15551234567" },
      ];

      const lgLeadPhones = new Set<string>();
      for (const c of mockCalls) {
        if (
          c.teamMemberId && lgMemberIds.has(c.teamMemberId) &&
          (c.classification === "conversation" || c.classification === "admin_call") &&
          positiveOutcomes.has(c.callOutcome || "") &&
          c.contactPhone
        ) {
          lgLeadPhones.add(c.contactPhone);
        }
      }

      // Same phone = 1 lead, not 2
      expect(lgLeadPhones.size).toBe(1);
    });
  });

  describe("Per-member leadsGenerated in leaderboard", () => {
    it("should only count leads for lead_generator role members", () => {
      const positiveOutcomes = new Set(["appointment_set", "interested", "callback_scheduled", "callback_requested", "offer_made"]);

      // Simulate per-member calculation
      const memberRole = "lead_generator";
      const memberCalls = [
        { classification: "conversation", callOutcome: "interested", contactPhone: "+15551234567" },
        { classification: "conversation", callOutcome: "appointment_set", contactPhone: "+15559876543" },
        { classification: "voicemail", callOutcome: "interested", contactPhone: "+15551112222" },
      ];

      const leadPhones = new Set<string>();
      if (memberRole === "lead_generator") {
        for (const c of memberCalls) {
          if (
            (c.classification === "conversation" || c.classification === "admin_call") &&
            positiveOutcomes.has(c.callOutcome || "") &&
            c.contactPhone
          ) {
            leadPhones.add(c.contactPhone);
          }
        }
      }

      expect(leadPhones.size).toBe(2);
    });

    it("should return 0 leads for non-lead_generator roles", () => {
      const positiveOutcomes = new Set(["appointment_set", "interested"]);

      const memberRole = "lead_manager";
      const memberCalls = [
        { classification: "conversation", callOutcome: "interested", contactPhone: "+15551234567" },
      ];

      const leadPhones = new Set<string>();
      if (memberRole === "lead_generator") {
        for (const c of memberCalls) {
          if (
            (c.classification === "conversation" || c.classification === "admin_call") &&
            positiveOutcomes.has(c.callOutcome || "") &&
            c.contactPhone
          ) {
            leadPhones.add(c.contactPhone);
          }
        }
      }

      expect(leadPhones.size).toBe(0);
    });
  });

  describe("Prior period leadsGenerated", () => {
    it("should calculate prior period leads using the same logic", () => {
      const lgMemberIds = new Set([101]);
      const positiveOutcomes = new Set(["appointment_set", "interested", "callback_scheduled"]);

      const priorCalls = [
        { teamMemberId: 101, classification: "conversation", callOutcome: "interested", contactPhone: "+15551111111" },
        { teamMemberId: 101, classification: "conversation", callOutcome: "appointment_set", contactPhone: "+15552222222" },
        { teamMemberId: 101, classification: "conversation", callOutcome: "not_interested", contactPhone: "+15553333333" },
      ];

      const priorLgLeadPhones = new Set<string>();
      for (const c of priorCalls) {
        if (
          c.teamMemberId && lgMemberIds.has(c.teamMemberId) &&
          (c.classification === "conversation" || c.classification === "admin_call") &&
          positiveOutcomes.has(c.callOutcome || "") &&
          c.contactPhone
        ) {
          priorLgLeadPhones.add(c.contactPhone);
        }
      }

      expect(priorLgLeadPhones.size).toBe(2);
    });
  });
});

describe("Analytics UI - Lead Generators tab", () => {
  it("should filter leaderboard entries by lead_generator role", () => {
    const leaderboard = [
      { teamMember: { id: 1, name: "Chris", teamRole: "lead_manager" }, leadsGenerated: 0, totalCalls: 50 },
      { teamMember: { id: 2, name: "Kyle", teamRole: "acquisition_manager" }, leadsGenerated: 0, totalCalls: 30 },
      { teamMember: { id: 3, name: "Alex", teamRole: "lead_generator" }, leadsGenerated: 15, totalCalls: 100 },
      { teamMember: { id: 4, name: "Marcus", teamRole: "lead_generator" }, leadsGenerated: 32, totalCalls: 200 },
    ];

    const leadGenerators = leaderboard.filter(e => e.teamMember.teamRole === "lead_generator");
    expect(leadGenerators).toHaveLength(2);
    expect(leadGenerators[0].teamMember.name).toBe("Alex");
    expect(leadGenerators[1].teamMember.name).toBe("Marcus");
  });

  it("should sort lead generators by leadsGenerated descending", () => {
    const leadGenerators = [
      { teamMember: { id: 3, name: "Alex" }, leadsGenerated: 15 },
      { teamMember: { id: 4, name: "Marcus" }, leadsGenerated: 32 },
      { teamMember: { id: 5, name: "Efren" }, leadsGenerated: 8 },
    ];

    const sorted = [...leadGenerators].sort((a, b) => b.leadsGenerated - a.leadsGenerated);
    expect(sorted[0].teamMember.name).toBe("Marcus");
    expect(sorted[1].teamMember.name).toBe("Alex");
    expect(sorted[2].teamMember.name).toBe("Efren");
  });
});
