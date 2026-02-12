import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("team router", () => {
  it("should list team members", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.team.list();
    
    // Result should be an array (may be empty initially)
    expect(Array.isArray(result)).toBe(true);
  });

  it("should seed team members successfully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.team.seed();
    
    expect(result).toEqual({ success: true });
    
    // Verify team members were created
    const teamMembers = await caller.team.list();
    expect(teamMembers.length).toBeGreaterThanOrEqual(3);
    
    // Check for Chris Segura, Daniel Lozano, and Kyle Barks
    const names = teamMembers.map(m => m.name);
    expect(names.some(n => n?.includes("Chris"))).toBe(true);
    expect(names.some(n => n?.includes("Daniel"))).toBe(true);
    expect(names.some(n => n?.includes("Kyle"))).toBe(true);
  });
});

describe("calls router", () => {
  it("should list calls", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.calls.list();
    
    // Result should be an array
    expect(Array.isArray(result)).toBe(true);
  });

  it("should get recent calls", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.calls.recent({ limit: 10 });
    
    // Result should be an array
    expect(Array.isArray(result)).toBe(true);
  });

  it("should get calls with grades", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.calls.withGrades({ limit: 10 });
    
    // Result should be a paginated object with items array and total count
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
  });
});

describe("leaderboard router", () => {
  it("should get leaderboard data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.leaderboard.get();
    
    // Result should be an array
    expect(Array.isArray(result)).toBe(true);
    
    // Each entry should have required fields
    if (result.length > 0) {
      const entry = result[0];
      expect(entry).toHaveProperty("teamMember");
      expect(entry).toHaveProperty("totalCalls");
      expect(entry).toHaveProperty("gradeDistribution");
    }
  });
});

describe("analytics router", () => {
  it("should get call stats with classification breakdown", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analytics.stats();
    
    // Result should have expected properties
    expect(result).toHaveProperty("totalCalls");
    expect(result).toHaveProperty("gradedCalls");
    expect(result).toHaveProperty("skippedCalls");
    expect(result).toHaveProperty("pendingCalls");
    expect(result).toHaveProperty("callsToday");
    expect(result).toHaveProperty("callsThisWeek");
    expect(result).toHaveProperty("classificationBreakdown");
    
    // Values should be numbers
    expect(typeof result.totalCalls).toBe("number");
    expect(typeof result.gradedCalls).toBe("number");
    expect(typeof result.skippedCalls).toBe("number");
    
    // Classification breakdown should have all categories
    expect(result.classificationBreakdown).toHaveProperty("conversation");
    expect(result.classificationBreakdown).toHaveProperty("voicemail");
    expect(result.classificationBreakdown).toHaveProperty("no_answer");
    expect(result.classificationBreakdown).toHaveProperty("callback_request");
    expect(result.classificationBreakdown).toHaveProperty("too_short");
  });
});

describe("grading rubrics", () => {
  it("should have correct Lead Manager criteria", async () => {
    // Import the grading module to verify rubrics
    const { LEAD_MANAGER_RUBRIC } = await import("./grading");
    
    expect(LEAD_MANAGER_RUBRIC).toBeDefined();
    expect(LEAD_MANAGER_RUBRIC.name).toContain("Lead Manager");
    expect(Array.isArray(LEAD_MANAGER_RUBRIC.criteria)).toBe(true);
    expect(LEAD_MANAGER_RUBRIC.criteria.length).toBeGreaterThan(0);
    
    // Check for key criteria
    const criteriaNames = LEAD_MANAGER_RUBRIC.criteria.map((c: any) => c.name);
    expect(criteriaNames).toContain("Tonality & Empathy");
    expect(criteriaNames).toContain("Motivation Extraction");
  });

  it("should have correct Acquisition Manager criteria", async () => {
    const { ACQUISITION_MANAGER_RUBRIC } = await import("./grading");
    
    expect(ACQUISITION_MANAGER_RUBRIC).toBeDefined();
    expect(ACQUISITION_MANAGER_RUBRIC.name).toContain("Acquisition Manager");
    expect(Array.isArray(ACQUISITION_MANAGER_RUBRIC.criteria)).toBe(true);
    expect(ACQUISITION_MANAGER_RUBRIC.criteria.length).toBeGreaterThan(0);
    
    // Check for key criteria
    const criteriaNames = ACQUISITION_MANAGER_RUBRIC.criteria.map((c: any) => c.name);
    expect(criteriaNames).toContain("Motivation Restatement");
    expect(criteriaNames).toContain("Price Delivery");
  });
});

describe("call classification", () => {
  it("should classify too short calls without AI", async () => {
    const { classifyCall } = await import("./grading");
    
    const result = await classifyCall("Some transcript", 30);
    
    expect(result.classification).toBe("too_short");
    expect(result.shouldGrade).toBe(false);
    expect(result.reason).toContain("60s minimum");
  });
});
