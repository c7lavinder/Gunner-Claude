import { describe, it, expect, vi, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { tenants, teamMembers, userStreaks, userXp } from "../drizzle/schema";
import { like, ne, and } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPlatformOwnerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "U3JEthPNs4UbYRrgRBbShj",
    email: "corey@newagainhouses.com",
    name: "Corey",
    loginMethod: "manus",
    role: "super_admin",
    teamRole: "admin",
    isTenantAdmin: "true",
    tenantId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
    emailVerified: "true",
    profilePicture: null,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createRegularUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user-123",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "email_password",
    role: "user",
    teamRole: "lead_manager",
    isTenantAdmin: "false",
    tenantId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
    emailVerified: "true",
    profilePicture: null,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createTenantAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 3,
    openId: "tenant-admin-456",
    email: "admin@abcbuyers.com",
    name: "Tenant Admin",
    loginMethod: "email_password",
    role: "user",
    teamRole: "admin",
    isTenantAdmin: "true",
    tenantId: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
    emailVerified: "true",
    profilePicture: null,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("tenant.testGhlConnection", () => {
  it("rejects unauthenticated users", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: { origin: "https://test.example.com" },
      } as TrpcContext["req"],
      res: {
        clearCookie: () => {},
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.testGhlConnection({
        apiKey: "test-key",
        locationId: "test-location",
      })
    ).rejects.toThrow();
  });

  it("allows tenant admin to test connection", async () => {
    const ctx = createTenantAdminContext();
    const caller = appRouter.createCaller(ctx);

    // This will fail because the API key is fake, but it should not throw an auth error
    const result = await caller.tenant.testGhlConnection({
      apiKey: "pit-fake-key-12345",
      locationId: "fake-location-id",
    });

    // Should return a structured result (success: false because key is invalid)
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    // With a fake key, it should fail gracefully
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("allows platform owner to test connection", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.testGhlConnection({
      apiKey: "pit-fake-key-99999",
      locationId: "fake-location-99999",
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("allows regular user to test connection (for onboarding)", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.testGhlConnection({
      apiKey: "pit-fake-key-regular",
      locationId: "fake-location-regular",
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    // Fake key should fail
    expect(result.success).toBe(false);
  });
});

describe("tenant.fetchGhlPipelines", () => {
  it("rejects unauthenticated users", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: { origin: "https://test.example.com" },
      } as TrpcContext["req"],
      res: {
        clearCookie: () => {},
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.fetchGhlPipelines({
        apiKey: "test-key",
        locationId: "test-location",
      })
    ).rejects.toThrow();
  });

  it("returns structured result for invalid credentials", async () => {
    const ctx = createTenantAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.fetchGhlPipelines({
      apiKey: "pit-invalid-key",
      locationId: "invalid-location",
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(Array.isArray(result.pipelines)).toBe(true);
    // With invalid credentials, should fail gracefully
    expect(result.success).toBe(false);
    expect(result.pipelines).toHaveLength(0);
  });

  it("allows platform owner to fetch pipelines", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.fetchGhlPipelines({
      apiKey: "pit-fake-pipeline-key",
      locationId: "fake-pipeline-location",
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(Array.isArray(result.pipelines)).toBe(true);
  });
});

describe("tenant.savePipelineMapping", () => {
  it("rejects regular users", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.savePipelineMapping({
        pipelineMapping: {
          dispoPipelineName: "Test Pipeline",
          newDealStageName: "New Deal",
          stageMapping: { "stage-1": "lead_gen" },
        },
      })
    ).rejects.toThrow();
  });

  it("allows tenant admin to save pipeline mapping", async () => {
    const ctx = createTenantAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Create a tenant first for this admin
    const ownerCtx = createPlatformOwnerContext();
    const ownerCaller = appRouter.createCaller(ownerCtx);
    const tenant = await ownerCaller.tenant.setup({
      name: "Pipeline Test Co",
      slug: "pipeline-test-co-" + Date.now(),
      crmType: "ghl",
      crmConfig: {
        ghlApiKey: "test-key",
        ghlLocationId: "test-loc",
      },
    });

    // Update the tenant admin context to use the new tenant
    const adminCtx = createTenantAdminContext();
    (adminCtx.user as AuthenticatedUser).tenantId = tenant!.id;

    const adminCaller = appRouter.createCaller(adminCtx);

    const result = await adminCaller.tenant.savePipelineMapping({
      pipelineMapping: {
        dispoPipelineName: "Dispo Pipeline",
        dispoPipelineId: "pipeline-123",
        newDealStageName: "New Deal",
        newDealStageId: "stage-456",
        stageMapping: {
          "stage-1": "lead_gen",
          "stage-2": "qualification",
          "stage-3": "acquisition",
        },
      },
    });

    expect(result).toBeDefined();
  });

  it("allows platform owner to save pipeline mapping for specific tenant", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.savePipelineMapping({
      tenantId: 1,
      pipelineMapping: {
        dispoPipelineName: "Owner Pipeline",
        newDealStageName: "Fresh Deal",
        stageMapping: {
          "stage-a": "lead_gen",
          "stage-b": "follow_up",
        },
      },
    });

    expect(result).toBeDefined();
  });
});

afterAll(async () => {
  // Clean up test tenants created during tests
  const db = await getDb();
  if (db) {
    // Delete test tenants (Pipeline Test Co, Stage Mapping Test Co, etc.)
    await db.delete(tenants).where(
      and(
        ne(tenants.id, 1),
        like(tenants.name, "%Test%")
      )
    );
    console.log("[Test Cleanup] Deleted test tenants from ghlConnection tests");
  }
});

describe("TenantCrmConfig stageMapping field", () => {
  it("saves and retrieves stageMapping in CRM config via setup", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.setup({
      name: "Stage Mapping Test Co",
      slug: "stage-mapping-test-" + Date.now(),
      crmType: "ghl",
      crmConfig: {
        ghlApiKey: "test-key",
        ghlLocationId: "test-loc",
        dispoPipelineName: "Dispo",
        dispoPipelineId: "pipe-123",
        newDealStageName: "New Deal",
        newDealStageId: "stage-nd",
        stageMapping: {
          "stage-1": "lead_gen",
          "stage-2": "qualification",
          "stage-3": "acquisition",
        },
      },
    });

    expect(result).toBeDefined();
    const config = JSON.parse(result!.crmConfig as string);
    expect(config.stageMapping).toBeDefined();
    expect(config.stageMapping["stage-1"]).toBe("lead_gen");
    expect(config.stageMapping["stage-2"]).toBe("qualification");
    expect(config.stageMapping["stage-3"]).toBe("acquisition");
    expect(config.dispoPipelineId).toBe("pipe-123");
    expect(config.newDealStageId).toBe("stage-nd");
  });
});
