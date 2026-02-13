import { describe, it, expect, vi } from "vitest";
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const ctx = createAuthContext();
const caller = appRouter.createCaller(ctx);

describe("Audit Fix #1-2: Stats consistency and admin_call inclusion", () => {
  it("should include admin_call in classification breakdown", async () => {
    const result = await caller.analytics.stats();
    
    // Classification breakdown should include admin_call
    expect(result.classificationBreakdown).toHaveProperty("admin_call");
    expect(typeof result.classificationBreakdown.admin_call).toBe("number");
    expect(result.classificationBreakdown.admin_call).toBeGreaterThanOrEqual(0);
  });

  it("should have consistent gradedCalls count", async () => {
    const result = await caller.analytics.stats();
    
    // gradedCalls should be a non-negative number
    expect(result.gradedCalls).toBeGreaterThanOrEqual(0);
    
    // gradedCalls should not exceed totalCalls
    expect(result.gradedCalls).toBeLessThanOrEqual(result.totalCalls);
    
    // Average score should be between 0 and 100 (or 0 if no graded calls)
    expect(result.averageScore).toBeGreaterThanOrEqual(0);
    expect(result.averageScore).toBeLessThanOrEqual(100);
  });

  it("should return stable results on consecutive calls", async () => {
    const result1 = await caller.analytics.stats();
    const result2 = await caller.analytics.stats();
    
    // Same query should return same results
    expect(result1.totalCalls).toBe(result2.totalCalls);
    expect(result1.gradedCalls).toBe(result2.gradedCalls);
    expect(result1.averageScore).toBe(result2.averageScore);
    expect(result1.skippedCalls).toBe(result2.skippedCalls);
  });
});

describe("Audit Fix #6: Leaderboard data", () => {
  it("should return leaderboard with valid scores", async () => {
    const result = await caller.leaderboard.get();
    
    expect(Array.isArray(result)).toBe(true);
    
    for (const member of result) {
      // Leaderboard entries have teamMember object with name
      expect(member).toHaveProperty("teamMember");
      expect(member.teamMember).toHaveProperty("name");
      expect(member).toHaveProperty("averageScore");
      expect(member).toHaveProperty("totalCalls");
      
      // Scores should be valid
      expect(member.averageScore).toBeGreaterThanOrEqual(0);
      expect(member.averageScore).toBeLessThanOrEqual(100);
      expect(member.totalCalls).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Audit Fix #8: Opportunity detection scan limit", () => {
  it("should have scan limit of 200 in source code", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/opportunityDetection.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // The fetchRecentConversations function should have limit = 200
    const match = content.match(/async function fetchRecentConversations[\s\S]*?limit\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("200");
  });
});

describe("Audit Fix #12: URL consistency", () => {
  it("should not have gunner.ai without 'get' prefix in any email references", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    // Check key files for URL consistency
    const filesToCheck = [
      path.join(process.cwd(), "client/src/pages/Pricing.tsx"),
      path.join(process.cwd(), "server/emailService.ts"),
    ];
    
    for (const filePath of filesToCheck) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        // Find any @gunner.ai that's NOT @getgunner.ai
        const badMatches = content.match(/@(?!getgunner)gunner\.ai/g);
        expect(badMatches).toBeNull();
      }
    }
  });
});

describe("Training Materials: Seeded content", () => {
  it("should list training materials", async () => {
    const result = await caller.training.list();
    
    expect(Array.isArray(result)).toBe(true);
    // We seeded 15 materials
    expect(result.length).toBeGreaterThanOrEqual(15);
  });

  it("should have materials for all roles", async () => {
    const result = await caller.training.list();
    
    const roles = new Set(result.map((m: any) => m.applicableTo));
    expect(roles.has("all")).toBe(true);
    expect(roles.has("lead_manager")).toBe(true);
    expect(roles.has("acquisition_manager")).toBe(true);
    expect(roles.has("lead_generator")).toBe(true);
  });

  it("should have materials in multiple categories", async () => {
    const result = await caller.training.list();
    
    const categories = new Set(result.map((m: any) => m.category));
    // We used script, objection_handling, methodology, best_practices
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });
});

describe("Rubric types: All 6 types available", () => {
  it("should return all 6 rubric types from getAll", async () => {
    const result = await caller.rubrics.getAll();
    
    expect(result).toHaveProperty("leadManager");
    expect(result).toHaveProperty("acquisitionManager");
    expect(result).toHaveProperty("leadGenerator");
    expect(result).toHaveProperty("followUp");
    expect(result).toHaveProperty("sellerCallback");
    expect(result).toHaveProperty("adminCallback");
    
    // Each should have criteria
    expect(result.leadManager.criteria.length).toBeGreaterThan(0);
    expect(result.acquisitionManager.criteria.length).toBeGreaterThan(0);
    expect(result.leadGenerator.criteria.length).toBeGreaterThan(0);
    expect(result.followUp.criteria.length).toBeGreaterThan(0);
    expect(result.sellerCallback.criteria.length).toBeGreaterThan(0);
    expect(result.adminCallback.criteria.length).toBeGreaterThan(0);
  });
});
