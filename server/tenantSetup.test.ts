import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPlatformOwnerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "U3JEthPNs4UbYRrgRBbShj", // Corey's openId (platform owner)
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

describe("tenant.setup", () => {
  it("rejects non-platform-owner users", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.setup({
        name: "Test Company",
        slug: "test-company",
      })
    ).rejects.toThrow("Platform owner access required");
  });

  it("rejects tenant admin users (not platform owner)", async () => {
    const ctx = createTenantAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.setup({
        name: "Test Company",
        slug: "test-company",
      })
    ).rejects.toThrow("Platform owner access required");
  });

  it("accepts platform owner and creates tenant", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.setup({
      name: "Test Wholesalers LLC",
      slug: "test-wholesalers",
      subscriptionTier: "trial",
      crmType: "ghl",
      crmConfig: {
        ghlApiKey: "pit-test-key-123",
        ghlLocationId: "loc-test-123",
        batchDialerEnabled: true,
        batchDialerApiKey: "bd-test-key-123",
        dispoPipelineName: "Dispo Pipeline",
        newDealStageName: "New Deal",
      },
      teamMembers: [
        { name: "John Smith", teamRole: "lead_manager" },
        { name: "Jane Doe", teamRole: "lead_generator" },
        { name: "Mike Johnson", teamRole: "acquisition_manager" },
      ],
    });

    expect(result).toBeDefined();
    expect(result!.name).toBe("Test Wholesalers LLC");
    expect(result!.slug).toBe("test-wholesalers");
    expect(result!.crmType).toBe("ghl");
    expect(result!.crmConnected).toBe("true");
    expect(result!.onboardingCompleted).toBe("true");

    // Verify CRM config was saved
    const config = JSON.parse(result!.crmConfig as string);
    expect(config.ghlApiKey).toBe("pit-test-key-123");
    expect(config.ghlLocationId).toBe("loc-test-123");
    expect(config.batchDialerEnabled).toBe(true);
    expect(config.batchDialerApiKey).toBe("bd-test-key-123");
    expect(config.dispoPipelineName).toBe("Dispo Pipeline");
    expect(config.newDealStageName).toBe("New Deal");
  });

  it("creates tenant without CRM config", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.setup({
      name: "No CRM Company",
      slug: "no-crm-company",
      crmType: "none",
    });

    expect(result).toBeDefined();
    expect(result!.name).toBe("No CRM Company");
    expect(result!.crmType).toBe("none");
    expect(result!.crmConnected).toBe("false");
  });
});

describe("tenant.bulkAddMembers", () => {
  it("rejects non-platform-owner users", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.bulkAddMembers({
        tenantId: 1,
        members: [{ name: "Test User", teamRole: "lead_generator" }],
      })
    ).rejects.toThrow("Platform owner access required");
  });

  it("adds multiple team members to a tenant", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    // First create a tenant to add members to
    const tenant = await caller.tenant.setup({
      name: "Bulk Test Company",
      slug: "bulk-test-company",
    });

    expect(tenant).toBeDefined();

    const result = await caller.tenant.bulkAddMembers({
      tenantId: tenant!.id,
      members: [
        { name: "Alice Brown", teamRole: "lead_manager" },
        { name: "Bob Wilson", teamRole: "lead_generator" },
        { name: "Carol Davis", teamRole: "acquisition_manager" },
      ],
    });

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Alice Brown");
    expect(result[0].teamRole).toBe("lead_manager");
    expect(result[1].name).toBe("Bob Wilson");
    expect(result[1].teamRole).toBe("lead_generator");
    expect(result[2].name).toBe("Carol Davis");
    expect(result[2].teamRole).toBe("acquisition_manager");
  });
});

describe("tenant.updateSettings (CRM config)", () => {
  it("allows tenant admin to update CRM config", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    // Platform owner can also update settings (they have admin role)
    const result = await caller.tenant.updateSettings({
      crmType: "ghl",
      crmConfig: JSON.stringify({
        ghlApiKey: "updated-key",
        ghlLocationId: "updated-location",
      }),
      crmConnected: "true",
    });

    expect(result).toBeDefined();
  });

  it("rejects regular users from updating settings", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.updateSettings({
        crmType: "ghl",
        crmConfig: JSON.stringify({ ghlApiKey: "test" }),
      })
    ).rejects.toThrow("Tenant admin access required");
  });
});

describe("tenant.updateTenantCrmConfig", () => {
  it("rejects non-platform-owner users", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tenant.updateTenantCrmConfig({
        tenantId: 1,
        crmType: "ghl",
        crmConfig: {
          ghlApiKey: "test-key",
          ghlLocationId: "test-location",
        },
      })
    ).rejects.toThrow("Platform owner access required");
  });

  it("allows platform owner to update tenant CRM config", async () => {
    const ctx = createPlatformOwnerContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tenant.updateTenantCrmConfig({
      tenantId: 1,
      crmType: "ghl",
      crmConfig: {
        ghlApiKey: "new-ghl-key",
        ghlLocationId: "new-location-id",
        batchDialerEnabled: true,
        batchDialerApiKey: "new-bd-key",
        dispoPipelineName: "New Pipeline",
        newDealStageName: "Fresh Deal",
      },
    });

    expect(result).toBeDefined();
    if (result) {
      const config = JSON.parse(result.crmConfig as string);
      expect(config.ghlApiKey).toBe("new-ghl-key");
      expect(config.ghlLocationId).toBe("new-location-id");
      expect(config.batchDialerApiKey).toBe("new-bd-key");
    }
  });
});
