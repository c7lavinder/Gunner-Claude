import { describe, it, expect } from "vitest";

/**
 * Tests for personalStats computation logic in getCallStats.
 * Verifies that when currentTeamMemberId is provided, the returned
 * personalStats reflect only that member's calls, not the team aggregate.
 */

// Simulate the personalStats computation logic from getCallStats
function computePersonalStats(
  allCalls: Array<{
    id: number;
    teamMemberId: number | null;
    status: string;
    classification: string | null;
    createdAt: Date;
  }>,
  grades: Array<{
    callId: number;
    overallScore: string;
  }>,
  currentTeamMemberId: number,
  todayStart: Date
) {
  const myCalls = allCalls.filter(c => c.teamMemberId === currentTeamMemberId);
  const myGradedCalls = myCalls.filter(
    c => c.status === 'completed' && (c.classification === 'conversation' || c.classification === 'admin_call')
  );
  const myGradedCallIds = myGradedCalls.map(c => c.id);
  const myGrades = grades.filter(g => myGradedCallIds.includes(g.callId));
  const myTotalScore = myGrades.reduce((sum, g) => sum + parseFloat(g.overallScore || '0'), 0);
  const myAvgScore = myGrades.length > 0 ? myTotalScore / myGrades.length : 0;
  const myCallsToday = myCalls.filter(c => c.createdAt >= todayStart).length;
  const myGradedToday = myGradedCalls.filter(c => c.createdAt >= todayStart).length;

  return {
    totalCalls: myCalls.length,
    gradedCalls: myGradedCalls.length,
    averageScore: myAvgScore,
    callsToday: myCallsToday,
    gradedToday: myGradedToday,
  };
}

const todayStart = new Date("2026-02-23T06:00:00Z"); // Midnight CST = 6AM UTC
const yesterday = new Date("2026-02-22T15:00:00Z");
const todayMorning = new Date("2026-02-23T14:00:00Z");

// Daniel Lozano (LM, id=3) has 5 calls total, 3 graded
// Mirna Razo (LG, id=6) has 10 calls total, 7 graded (assigned to Daniel)
// Team aggregate would be 15 calls, 10 graded
const mockCalls = [
  // Daniel's calls
  { id: 1, teamMemberId: 3, status: "completed", classification: "conversation", createdAt: yesterday },
  { id: 2, teamMemberId: 3, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 3, teamMemberId: 3, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 4, teamMemberId: 3, status: "skipped", classification: "voicemail", createdAt: todayMorning },
  { id: 5, teamMemberId: 3, status: "completed", classification: "too_short", createdAt: todayMorning },
  // Mirna's calls
  { id: 10, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: yesterday },
  { id: 11, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: yesterday },
  { id: 12, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 13, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 14, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 15, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 16, teamMemberId: 6, status: "completed", classification: "conversation", createdAt: todayMorning },
  { id: 17, teamMemberId: 6, status: "skipped", classification: "voicemail", createdAt: todayMorning },
  { id: 18, teamMemberId: 6, status: "completed", classification: "too_short", createdAt: todayMorning },
  { id: 19, teamMemberId: 6, status: "pending", classification: null, createdAt: todayMorning },
];

const mockGrades = [
  // Daniel's grades
  { callId: 1, overallScore: "75" },
  { callId: 2, overallScore: "80" },
  { callId: 3, overallScore: "85" },
  // Mirna's grades
  { callId: 10, overallScore: "60" },
  { callId: 11, overallScore: "65" },
  { callId: 12, overallScore: "70" },
  { callId: 13, overallScore: "55" },
  { callId: 14, overallScore: "72" },
  { callId: 15, overallScore: "68" },
  { callId: 16, overallScore: "62" },
];

describe("Dashboard Personal Stats", () => {
  describe("Daniel Lozano (Lead Manager, id=3)", () => {
    it("should show only Daniel's total calls, not team aggregate", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      expect(ps.totalCalls).toBe(5); // Daniel has 5 calls
    });

    it("should show only Daniel's graded calls", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      expect(ps.gradedCalls).toBe(3); // 3 conversations
    });

    it("should show Daniel's average score, not team average", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      expect(ps.averageScore).toBe(80); // (75+80+85)/3 = 80
    });

    it("should show Daniel's calls today only", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      expect(ps.callsToday).toBe(4); // 4 calls today (ids 2,3,4,5)
    });

    it("should show Daniel's graded today only", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      expect(ps.gradedToday).toBe(2); // 2 graded conversations today (ids 2,3)
    });
  });

  describe("Mirna Razo (Lead Generator, id=6)", () => {
    it("should show only Mirna's total calls", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 6, todayStart);
      expect(ps.totalCalls).toBe(10); // Mirna has 10 calls
    });

    it("should show only Mirna's graded calls", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 6, todayStart);
      expect(ps.gradedCalls).toBe(7); // 7 conversations
    });

    it("should show Mirna's average score", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 6, todayStart);
      // (60+65+70+55+72+68+62)/7 = 452/7 ≈ 64.57
      expect(ps.averageScore).toBeCloseTo(64.57, 1);
    });

    it("should show Mirna's calls today only", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 6, todayStart);
      expect(ps.callsToday).toBe(8); // 8 calls today (ids 12-19)
    });

    it("should show Mirna's graded today only", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 6, todayStart);
      expect(ps.gradedToday).toBe(5); // 5 graded conversations today (ids 12-16)
    });
  });

  describe("Team aggregate vs personal stats", () => {
    it("Daniel's personal totalCalls should be less than team aggregate", () => {
      const danielStats = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      const teamTotal = mockCalls.length;
      expect(danielStats.totalCalls).toBeLessThan(teamTotal);
    });

    it("Daniel's personal averageScore should differ from team average", () => {
      const danielStats = computePersonalStats(mockCalls, mockGrades, 3, todayStart);
      const allScores = mockGrades.map(g => parseFloat(g.overallScore));
      const teamAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      // Daniel's avg is 80, team avg is ~69.2 — they should differ
      expect(danielStats.averageScore).not.toBeCloseTo(teamAvg, 0);
    });
  });

  describe("Edge cases", () => {
    it("should return zeros for a member with no calls", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 999, todayStart);
      expect(ps.totalCalls).toBe(0);
      expect(ps.gradedCalls).toBe(0);
      expect(ps.averageScore).toBe(0);
      expect(ps.callsToday).toBe(0);
      expect(ps.gradedToday).toBe(0);
    });

    it("should handle member with calls but no grades", () => {
      const callsNoGrades = [
        { id: 100, teamMemberId: 50, status: "completed", classification: "conversation", createdAt: todayMorning },
      ];
      const ps = computePersonalStats(callsNoGrades, [], 50, todayStart);
      expect(ps.totalCalls).toBe(1);
      expect(ps.gradedCalls).toBe(1);
      expect(ps.averageScore).toBe(0); // No grades = 0 avg
    });

    it("should not count skipped or pending calls as graded", () => {
      const ps = computePersonalStats(mockCalls, mockGrades, 6, todayStart);
      // Mirna has 10 total calls but only 7 are completed conversations
      expect(ps.gradedCalls).toBe(7);
      expect(ps.totalCalls).toBe(10);
    });
  });
});
