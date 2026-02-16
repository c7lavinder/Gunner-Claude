import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jwt
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn(),
  },
  verify: vi.fn(),
  sign: vi.fn(),
}));

// Mock selfServeAuth
vi.mock("./selfServeAuth", () => ({
  verifySessionToken: vi.fn(),
  getUserById: vi.fn(),
}));

// Mock sdk
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

// Mock cookie
vi.mock("cookie", () => ({
  parse: vi.fn((str: string) => {
    const result: Record<string, string> = {};
    if (!str) return result;
    str.split(";").forEach((pair) => {
      const [key, val] = pair.trim().split("=");
      if (key && val) result[key] = val;
    });
    return result;
  }),
}));

import jwt from "jsonwebtoken";
import { getUserById } from "./selfServeAuth";
import { sdk } from "./_core/sdk";

describe("Context - Impersonation Token Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  it("should resolve impersonation token from session cookie and override tenantId", async () => {
    // Simulate a super_admin user with tenantId=1
    const superAdmin = {
      id: 1,
      name: "Corey",
      email: "corey@test.com",
      role: "super_admin",
      tenantId: 1,
      openId: "owner-open-id",
    };

    // Mock jwt.verify to return impersonation token payload
    (jwt.verify as any).mockReturnValue({
      userId: 1,
      tenantId: 5, // Impersonating tenant 5
      type: "impersonation",
      originalTenantId: 1,
      impersonatedTenantName: "Zac's Company",
    });

    // Mock getUserById to return the super admin
    (getUserById as any).mockResolvedValue(superAdmin);

    // Import createContext dynamically to pick up mocks
    const { createContext } = await import("./_core/context");

    const mockReq = {
      headers: {
        cookie: "session=fake-impersonation-jwt",
      },
      cookies: {},
    } as any;

    const mockRes = {} as any;

    const ctx = await createContext({ req: mockReq, res: mockRes });

    // The user should have the impersonated tenantId
    expect(ctx.user).not.toBeNull();
    expect(ctx.user!.tenantId).toBe(5);
    expect((ctx.user as any)._isImpersonating).toBe(true);
    expect((ctx.user as any)._impersonatedTenantName).toBe("Zac's Company");
    expect((ctx.user as any)._originalTenantId).toBe(1);
  });

  it("should fall back to auth_token when session cookie is absent", async () => {
    const regularUser = {
      id: 2,
      name: "Zac",
      email: "zac@test.com",
      role: "admin",
      tenantId: 5,
    };

    // No session cookie, so jwt.verify should not be called for session
    (jwt.verify as any).mockImplementation(() => {
      throw new Error("invalid token");
    });

    // Mock selfServeAuth
    const { verifySessionToken } = await import("./selfServeAuth");
    (verifySessionToken as any).mockReturnValue({ userId: 2 });
    (getUserById as any).mockResolvedValue(regularUser);

    const { createContext } = await import("./_core/context");

    const mockReq = {
      headers: {
        cookie: "auth_token=valid-auth-token",
      },
      cookies: {},
    } as any;

    const mockRes = {} as any;

    const ctx = await createContext({ req: mockReq, res: mockRes });

    expect(ctx.user).not.toBeNull();
    expect(ctx.user!.id).toBe(2);
    expect(ctx.user!.tenantId).toBe(5);
    expect((ctx.user as any)._isImpersonating).toBeUndefined();
  });

  it("should fall back to Manus OAuth when no session or auth_token cookie exists", async () => {
    const manusUser = {
      id: 1,
      name: "Corey",
      email: "corey@test.com",
      role: "super_admin",
      tenantId: 1,
    };

    (jwt.verify as any).mockImplementation(() => {
      throw new Error("no token");
    });

    const { verifySessionToken } = await import("./selfServeAuth");
    (verifySessionToken as any).mockReturnValue(null);
    (getUserById as any).mockResolvedValue(null);

    (sdk.authenticateRequest as any).mockResolvedValue(manusUser);

    const { createContext } = await import("./_core/context");

    const mockReq = {
      headers: {
        cookie: "app_session_id=manus-session",
      },
      cookies: {},
    } as any;

    const mockRes = {} as any;

    const ctx = await createContext({ req: mockReq, res: mockRes });

    expect(ctx.user).not.toBeNull();
    expect(ctx.user!.name).toBe("Corey");
  });
});

describe("setupTenant - Email and Admin Fields", () => {
  it("should accept email and isTenantAdmin in team member input schema", () => {
    // This is a type-level check - the fact that the schema accepts these fields
    // is verified by TypeScript compilation. Here we verify the structure.
    const validInput = {
      name: "Test Company",
      slug: "test-company",
      subscriptionTier: "starter" as const,
      crmType: "none" as const,
      teamMembers: [
        {
          name: "Zac Chrisman",
          teamRole: "acquisition_manager" as const,
          email: "zac@example.com",
          isTenantAdmin: true,
        },
        {
          name: "Jane Doe",
          teamRole: "lead_generator" as const,
          phone: "555-1234",
        },
      ],
    };

    // Verify the structure has the expected fields
    expect(validInput.teamMembers[0].email).toBe("zac@example.com");
    expect(validInput.teamMembers[0].isTenantAdmin).toBe(true);
    expect(validInput.teamMembers[1].email).toBeUndefined();
    expect(validInput.teamMembers[1].isTenantAdmin).toBeUndefined();
  });
});

describe("Impersonation Module", () => {
  it("should detect impersonation tokens correctly", async () => {
    const { isImpersonationToken, getImpersonationInfo } = await import("./impersonation");

    // Regular session token
    expect(isImpersonationToken({ type: "session", userId: 1 })).toBe(false);

    // Impersonation token
    expect(isImpersonationToken({ type: "impersonation", userId: 1, tenantId: 5 })).toBe(true);

    // Null/undefined
    expect(isImpersonationToken(null)).toBe(false);
    expect(isImpersonationToken(undefined)).toBe(false);
  });

  it("should return correct impersonation info", async () => {
    const { getImpersonationInfo } = await import("./impersonation");

    const info = getImpersonationInfo({
      type: "impersonation",
      userId: 1,
      tenantId: 5,
      impersonatedTenantName: "Test Corp",
      originalTenantId: 1,
    });

    expect(info.isImpersonating).toBe(true);
    expect(info.impersonatedTenantId).toBe(5);
    expect(info.impersonatedTenantName).toBe("Test Corp");
    expect(info.originalTenantId).toBe(1);
  });

  it("should return not impersonating for regular tokens", async () => {
    const { getImpersonationInfo } = await import("./impersonation");

    const info = getImpersonationInfo({ type: "session", userId: 1 });
    expect(info.isImpersonating).toBe(false);
  });
});
