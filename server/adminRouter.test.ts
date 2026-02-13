import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ────────────────────────────────────────────────────────────

function createSuperAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "U3JEthPNs4UbYRrgRBbShj", // Platform owner
      email: "corey@getgunner.ai",
      name: "Corey",
      loginMethod: "manus",
      role: "super_admin",
      teamRole: "admin",
      tenantId: 1,
      isTenantAdmin: "true",
      emailVerified: "true",
      passwordHash: null,
      profilePicture: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createRegularUserContext(): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "regular-user-id",
      email: "user@example.com",
      name: "Regular User",
      loginMethod: "email_password",
      role: "user",
      teamRole: "lead_manager",
      tenantId: 2,
      isTenantAdmin: "false",
      emailVerified: "true",
      passwordHash: null,
      profilePicture: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 50,
      openId: "admin-user-id",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "email_password",
      role: "admin",
      teamRole: "admin",
      tenantId: 2,
      isTenantAdmin: "true",
      emailVerified: "true",
      passwordHash: null,
      profilePicture: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Admin Router - Access Control", () => {
  it("super_admin can access getStats", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getStats();
    
    expect(result).toBeDefined();
    // MySQL COUNT returns strings or numbers depending on driver; just check they're defined and coercible
    expect(Number(result.totalTenants)).toBeGreaterThanOrEqual(0);
    expect(Number(result.activeTenants)).toBeGreaterThanOrEqual(0);
    expect(Number(result.totalUsers)).toBeGreaterThanOrEqual(0);
    expect(Number(result.totalCalls)).toBeGreaterThanOrEqual(0);
    expect(Number(result.gradedCalls)).toBeGreaterThanOrEqual(0);
    expect(Number(result.monthlyRevenue)).toBeGreaterThanOrEqual(0);
  });

  it("platform owner (by openId) can access getStats even without super_admin role", async () => {
    const ctx = createSuperAdminContext();
    // Set role to admin but keep platform owner openId
    ctx.user!.role = "admin";
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getStats();
    
    expect(result).toBeDefined();
    expect(typeof result.totalTenants).toBe("number");
  });

  it("regular user CANNOT access getStats", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getStats()).rejects.toThrow(/FORBIDDEN|Access denied/);
  });

  it("tenant admin CANNOT access getStats", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getStats()).rejects.toThrow(/FORBIDDEN|Access denied/);
  });

  it("unauthenticated user CANNOT access getStats", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getStats()).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN|login/);
  });
});

describe("Admin Router - getTenants", () => {
  it("super_admin can list tenants", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getTenants({});
    
    expect(Array.isArray(result)).toBe(true);
    // Each tenant should have expected shape
    if (result.length > 0) {
      const tenant = result[0];
      expect(tenant).toHaveProperty("id");
      expect(tenant).toHaveProperty("name");
      expect(tenant).toHaveProperty("slug");
      expect(tenant).toHaveProperty("subscriptionTier");
      expect(tenant).toHaveProperty("subscriptionStatus");
      expect(tenant).toHaveProperty("userCount");
      expect(tenant).toHaveProperty("callCount");
    }
  });

  it("super_admin can search tenants by name", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getTenants({ search: "gunner" });
    
    expect(Array.isArray(result)).toBe(true);
    // All results should match the search term
    for (const tenant of result) {
      expect(tenant.name.toLowerCase()).toContain("gunner");
    }
  });

  it("regular user CANNOT list tenants", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getTenants({})).rejects.toThrow(/FORBIDDEN|Access denied/);
  });
});

describe("Admin Router - getTenantDetails", () => {
  it("super_admin can get tenant details", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    // First get a tenant ID
    const tenants = await caller.admin.getTenants({});
    if (tenants.length === 0) {
      // Skip if no tenants exist
      return;
    }
    
    const result = await caller.admin.getTenantDetails({ tenantId: tenants[0].id });
    
    expect(result).toBeDefined();
    expect(result.id).toBe(tenants[0].id);
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("users");
    expect(Array.isArray(result.users)).toBe(true);
    expect(result).toHaveProperty("stats");
    expect(typeof result.stats.userCount).toBe("number");
    expect(typeof result.stats.callCount).toBe("number");
    expect(typeof result.stats.gradedCallCount).toBe("number");
  });

  it("throws NOT_FOUND for non-existent tenant", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getTenantDetails({ tenantId: 999999 })).rejects.toThrow(/NOT_FOUND|Tenant not found/);
  });

  it("regular user CANNOT get tenant details", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getTenantDetails({ tenantId: 1 })).rejects.toThrow(/FORBIDDEN|Access denied/);
  });
});

describe("Admin Router - updateTenant", () => {
  it("super_admin can update tenant subscription tier", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    // Get a tenant first
    const tenants = await caller.admin.getTenants({});
    if (tenants.length === 0) return;
    
    const tenantId = tenants[0].id;
    const originalTier = tenants[0].subscriptionTier;
    
    // Update to a different tier
    const result = await caller.admin.updateTenant({
      tenantId,
      subscriptionTier: "growth",
    });
    
    expect(result).toEqual({ success: true });
    
    // Verify the update
    const updated = await caller.admin.getTenantDetails({ tenantId });
    expect(updated.subscriptionTier).toBe("growth");
    
    // Restore original tier
    await caller.admin.updateTenant({
      tenantId,
      subscriptionTier: originalTier as "trial" | "starter" | "growth" | "scale",
    });
  });

  it("super_admin can update maxUsers", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    const tenants = await caller.admin.getTenants({});
    if (tenants.length === 0) return;
    
    const result = await caller.admin.updateTenant({
      tenantId: tenants[0].id,
      maxUsers: 25,
    });
    
    expect(result).toEqual({ success: true });
    
    // Restore
    await caller.admin.updateTenant({
      tenantId: tenants[0].id,
      maxUsers: 3,
    });
  });

  it("returns success even with no updates", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    const tenants = await caller.admin.getTenants({});
    if (tenants.length === 0) return;
    
    const result = await caller.admin.updateTenant({
      tenantId: tenants[0].id,
    });
    
    expect(result).toEqual({ success: true });
  });

  it("regular user CANNOT update tenant", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.admin.updateTenant({ tenantId: 1, subscriptionTier: "scale" })
    ).rejects.toThrow(/FORBIDDEN|Access denied/);
  });
});

describe("Admin Router - getUsageAnalytics", () => {
  it("super_admin can get usage analytics", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getUsageAnalytics();
    
    expect(Array.isArray(result)).toBe(true);
    // Each entry should have expected shape
    for (const entry of result) {
      expect(entry).toHaveProperty("tenantId");
      expect(entry).toHaveProperty("tenantName");
      expect(entry).toHaveProperty("usage");
      expect(entry).toHaveProperty("totalRequests");
    }
  });

  it("regular user CANNOT get usage analytics", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getUsageAnalytics()).rejects.toThrow(/FORBIDDEN|Access denied/);
  });
});

describe("Admin Router - Platform Settings", () => {
  it("super_admin can get platform settings", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getPlatformSettings();
    
    expect(typeof result).toBe("object");
  });

  it("super_admin can update a platform setting", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.admin.updatePlatformSetting({
      key: "test_setting",
      value: "test_value",
      description: "A test setting for vitest",
    });
    
    expect(result).toEqual({ success: true });
    
    // Verify it was saved
    const settings = await caller.admin.getPlatformSettings();
    expect(settings["test_setting"]).toBe("test_value");
    
    // Clean up - update to empty
    await caller.admin.updatePlatformSetting({
      key: "test_setting",
      value: "",
    });
  });

  it("regular user CANNOT get platform settings", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getPlatformSettings()).rejects.toThrow(/FORBIDDEN|Access denied/);
  });
});

describe("Admin Router - Plans Management", () => {
  it("super_admin can get plans", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getPlans();
    
    expect(Array.isArray(result)).toBe(true);
    for (const plan of result) {
      expect(plan).toHaveProperty("id");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("code");
      expect(plan).toHaveProperty("priceMonthly");
      expect(plan).toHaveProperty("maxUsers");
      expect(plan).toHaveProperty("features");
      expect(Array.isArray(plan.features)).toBe(true);
    }
  });

  it("regular user CANNOT get plans", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(caller.admin.getPlans()).rejects.toThrow(/FORBIDDEN|Access denied/);
  });
});

describe("Admin Router - getStats shape", () => {
  it("returns all expected metric fields", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.getStats();
    
    // MySQL COUNT may return strings; verify all fields exist and are coercible to numbers
    expect(result).toHaveProperty("totalTenants");
    expect(result).toHaveProperty("activeTenants");
    expect(result).toHaveProperty("totalUsers");
    expect(result).toHaveProperty("totalCalls");
    expect(result).toHaveProperty("gradedCalls");
    expect(result).toHaveProperty("monthlyRevenue");
    
    // Revenue should be non-negative
    expect(Number(result.monthlyRevenue)).toBeGreaterThanOrEqual(0);
    // Counts should be non-negative
    expect(Number(result.totalTenants)).toBeGreaterThanOrEqual(0);
    expect(Number(result.totalUsers)).toBeGreaterThanOrEqual(0);
    expect(Number(result.totalCalls)).toBeGreaterThanOrEqual(0);
  });
});
