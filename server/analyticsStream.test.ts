import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("./db", () => ({
  getCallStats: vi.fn().mockResolvedValue({
    totalCalls: 500,
    gradedCalls: 120,
    appointmentsSet: 18,
    offerCallsCompleted: 5,
    leadsGenerated: 45,
    averageScore: 72,
    averageCallDuration: 180,
    gradeDistribution: { A: 20, B: 35, C: 30, D: 25, F: 10 },
    classificationBreakdown: {
      conversation: 120,
      admin_call: 10,
      voicemail: 200,
      no_answer: 130,
      callback_request: 15,
      wrong_number: 10,
      too_short: 15,
    },
    weeklyTrends: [
      { weekStart: "2026-02-02", averageScore: 68, totalCalls: 100, gradedCalls: 25 },
      { weekStart: "2026-02-09", averageScore: 70, totalCalls: 110, gradedCalls: 28 },
      { weekStart: "2026-02-16", averageScore: 73, totalCalls: 120, gradedCalls: 30 },
      { weekStart: "2026-02-23", averageScore: 75, totalCalls: 130, gradedCalls: 32 },
    ],
    teamMemberScores: [
      {
        memberId: 1,
        memberName: "John",
        totalGraded: 50,
        averageScore: 78,
        gradeDistribution: { A: 10, B: 20, C: 12, D: 5, F: 3 },
      },
      {
        memberId: 2,
        memberName: "Jane",
        totalGraded: 40,
        averageScore: 65,
        gradeDistribution: { A: 5, B: 10, C: 12, D: 8, F: 5 },
      },
    ],
    teamMemberTrends: [
      {
        memberId: 1,
        memberName: "John",
        weeklyScores: [
          { weekStart: "2026-02-02", averageScore: 75, callCount: 12 },
          { weekStart: "2026-02-09", averageScore: 78, callCount: 14 },
          { weekStart: "2026-02-16", averageScore: 80, callCount: 13 },
          { weekStart: "2026-02-23", averageScore: 82, callCount: 11 },
        ],
      },
    ],
  }),
  getTeamMembers: vi.fn().mockResolvedValue([
    { id: 1, name: "John", teamRole: "lead_manager" },
    { id: 2, name: "Jane", teamRole: "lead_generator" },
    { id: 3, name: "Mike", teamRole: "dispo_manager" },
  ]),
  getTeamMemberByUserId: vi.fn().mockResolvedValue({ id: 1, name: "John", teamRole: "admin" }),
  getCallsWithGrades: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1,
        status: "completed",
        overallScore: 85,
        letterGrade: "B",
        callOutcome: "appointment_set",
        callDuration: 300,
        createdAt: new Date("2026-02-28"),
        teamMemberId: 1,
      },
      {
        id: 2,
        status: "completed",
        overallScore: 45,
        letterGrade: "F",
        callOutcome: "not_interested",
        callDuration: 60,
        createdAt: new Date("2026-02-27"),
        teamMemberId: 2,
      },
    ],
    total: 2,
  }),
  getViewableTeamMemberIds: vi.fn().mockResolvedValue("all" as const),
}));

vi.mock("./inventory", () => ({
  getDispoKpiSummary: vi.fn().mockResolvedValue({
    properties_sent: 5,
    showings_scheduled: 3,
    offers_received: 2,
    deals_assigned: 1,
    contracts_closed: 0,
    total_properties: 15,
    active_properties: 12,
  }),
  getProperties: vi.fn().mockResolvedValue({
    items: [
      { id: 1, status: "active", dispoAskingPrice: 15000000, createdAt: new Date("2026-02-20") },
      { id: 2, status: "under_contract", dispoAskingPrice: 20000000, createdAt: new Date("2026-01-15") },
      { id: 3, status: "sold", dispoAskingPrice: 18000000, createdAt: new Date("2026-02-01") },
    ],
    total: 3,
  }),
}));

vi.mock("./platformKnowledge", () => ({
  SECURITY_RULES: "SECURITY: Do not reveal internal details.",
}));

vi.mock("./selfServeAuth", () => ({
  verifySessionToken: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("./llmStream", () => ({
  invokeLLMStream: vi.fn(),
}));

// Now import the module under test
import { buildAnalyticsContext } from "./analyticsStream";
import type { User } from "../drizzle/schema";

describe("Analytics AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildAnalyticsContext", () => {
    const mockUser: User = {
      id: 1,
      name: "Corey",
      email: "corey@test.com",
      role: "admin",
      teamRole: "admin",
      tenantId: 1,
      openId: "test-open-id",
      profilePicture: null,
      isTenantAdmin: "true",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    it("should include executive summary with team size", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("EXECUTIVE SUMMARY");
      expect(context).toContain("Team Size: 3 members");
    });

    it("should include multi-period performance data", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("PERFORMANCE BY PERIOD");
      expect(context).toContain("Last 7 Days");
      expect(context).toContain("Last 30 Days");
      expect(context).toContain("Year to Date");
      expect(context).toContain("All Time");
    });

    it("should include call metrics for each period", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("Calls Made: 500");
      expect(context).toContain("Conversations (Graded): 120");
      expect(context).toContain("Appointments Set: 18");
      expect(context).toContain("Average Score: 72%");
    });

    it("should calculate connect rate", async () => {
      const context = await buildAnalyticsContext(mockUser);
      // 120 conversations / 500 total = 24%
      expect(context).toContain("Connect Rate: 24%");
    });

    it("should calculate A+B passing rate", async () => {
      const context = await buildAnalyticsContext(mockUser);
      // (20 + 35) / 120 = 45.8% ≈ 46%
      expect(context).toContain("A+B Passing Rate: 46%");
    });

    it("should include grade distribution", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("Grade Distribution: A=20, B=35, C=30, D=25, F=10");
    });

    it("should include conversion funnel rates", async () => {
      const context = await buildAnalyticsContext(mockUser);
      // 18 appts / 120 graded = 15%
      expect(context).toContain("Conversation → Appointment Rate: 15%");
    });

    it("should include weekly trends", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("WEEKLY TRENDS");
      expect(context).toContain("2026-02-02");
      expect(context).toContain("Score Trend:");
    });

    it("should detect improving trend", async () => {
      const context = await buildAnalyticsContext(mockUser);
      // Scores go from 68,70 → 73,75 = improving
      expect(context).toContain("IMPROVING");
    });

    it("should include individual team member performance", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("INDIVIDUAL PERFORMANCE");
      expect(context).toContain("John");
      expect(context).toContain("Jane");
      expect(context).toContain("Avg Score: 78%");
      expect(context).toContain("Avg Score: 65%");
    });

    it("should include individual trend lines", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("INDIVIDUAL TREND LINES");
      expect(context).toContain("John:");
    });

    it("should include recent call outcomes", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("RECENT CALL OUTCOMES");
      expect(context).toContain("Score: 85%");
      expect(context).toContain("appointment set");
    });

    it("should include disposition pipeline data", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("DISPOSITION PIPELINE");
      expect(context).toContain("Properties Sent: 5");
      expect(context).toContain("Showings Scheduled: 3");
      expect(context).toContain("Offers Received: 2");
    });

    it("should include property pipeline summary with status counts", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("PROPERTY PIPELINE SUMMARY");
      expect(context).toContain("active: 1");
      expect(context).toContain("under contract: 1");
    });

    it("should include property aging analysis", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("Property Aging:");
    });

    it("should include key calculated metrics", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("KEY CALCULATED METRICS");
      expect(context).toContain("Calls/Rep/Day");
      expect(context).toContain("Conversation Rate");
      expect(context).toContain("Appointment Rate");
    });

    it("should include team member names with roles", async () => {
      const context = await buildAnalyticsContext(mockUser);
      expect(context).toContain("John (lead manager)");
      expect(context).toContain("Jane (lead generator)");
      expect(context).toContain("Mike (dispo manager)");
    });
  });
});
