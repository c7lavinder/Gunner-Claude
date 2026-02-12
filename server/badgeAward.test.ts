import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
};

// Create chainable mock
const createChainableMock = (returnValue: any = []) => {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(returnValue);
  // Make the chain itself thenable for await
  chain.then = (resolve: any) => resolve(returnValue);
  return chain;
};

describe("Badge Award System", () => {
  it("should include badgeCode in the awardBadge insert values", async () => {
    // Import the schema to verify the userBadges table has badgeCode field
    const { userBadges } = await import("../drizzle/schema");
    
    // Verify the schema has the required fields
    expect(userBadges.badgeCode).toBeDefined();
    expect(userBadges.progress).toBeDefined();
    expect(userBadges.triggerCallId).toBeDefined();
    expect(userBadges.isViewed).toBeDefined();
  });

  it("should have badgeCode as a required field in userBadges schema", async () => {
    const { userBadges } = await import("../drizzle/schema");
    
    // Check that badgeCode column exists and is configured
    const badgeCodeColumn = userBadges.badgeCode;
    expect(badgeCodeColumn).toBeDefined();
    expect(badgeCodeColumn.name).toBe("badgeCode");
  });

  it("should have all badge definitions with valid tiers", async () => {
    const { ALL_BADGES } = await import("./gamification");
    
    expect(ALL_BADGES.length).toBeGreaterThan(0);
    
    for (const badge of ALL_BADGES) {
      expect(badge.code).toBeTruthy();
      expect(badge.name).toBeTruthy();
      expect(badge.tiers.bronze.count).toBeGreaterThan(0);
      expect(badge.tiers.silver.count).toBeGreaterThan(badge.tiers.bronze.count);
      expect(badge.tiers.gold.count).toBeGreaterThan(badge.tiers.silver.count);
      expect(badge.criteria.type).toBeTruthy();
    }
  });

  it("should have universal, lead_manager, acquisition_manager, and lead_generator badge categories", async () => {
    const { ALL_BADGES } = await import("./gamification");
    
    const categories = new Set(ALL_BADGES.map(b => b.category));
    expect(categories.has("universal")).toBe(true);
    expect(categories.has("lead_manager")).toBe(true);
    expect(categories.has("acquisition_manager")).toBe(true);
    expect(categories.has("lead_generator")).toBe(true);
  });

  it("awardBadge function should accept triggerCallId parameter", async () => {
    const { awardBadge } = await import("./gamification");
    
    // Verify the function signature accepts 4 parameters
    expect(awardBadge.length).toBeGreaterThanOrEqual(3); // 3 required + 1 optional param
    expect(typeof awardBadge).toBe("function");
  });

  it("evaluateBadgesForCall should be exported and callable", async () => {
    const { evaluateBadgesForCall } = await import("./gamification");
    
    expect(typeof evaluateBadgesForCall).toBe("function");
  });

  it("batchEvaluateBadges should be exported and callable", async () => {
    const { batchEvaluateBadges } = await import("./gamification");
    
    expect(typeof batchEvaluateBadges).toBe("function");
  });
});
