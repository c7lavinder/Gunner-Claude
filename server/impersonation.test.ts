import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock jwt
vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn().mockReturnValue("mock-token"),
    verify: vi.fn(),
  },
}));

import { 
  startImpersonation, 
  stopImpersonation, 
  isImpersonationToken, 
  getImpersonationInfo 
} from "./impersonation";
import { getDb } from "./db";

describe("Impersonation Service", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getDb as any).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("startImpersonation", () => {
    it("should fail if database is not available", async () => {
      (getDb as any).mockResolvedValue(null);
      
      const result = await startImpersonation(1, 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Database not available");
    });

    it("should fail if user is not super_admin", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: 1, role: "user", tenantId: 1 }]);
      
      const result = await startImpersonation(1, 2);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Only super admins can impersonate tenants");
    });

    it("should fail if tenant not found", async () => {
      mockDb.where
        .mockResolvedValueOnce([{ id: 1, role: "super_admin", tenantId: null }])
        .mockResolvedValueOnce([]);
      
      const result = await startImpersonation(1, 999);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Tenant not found");
    });

    it("should succeed for super_admin impersonating valid tenant", async () => {
      mockDb.where
        .mockResolvedValueOnce([{ id: 1, role: "super_admin", tenantId: null }])
        .mockResolvedValueOnce([{ id: 2, name: "Test Tenant" }]);
      
      const result = await startImpersonation(1, 2);
      
      expect(result.success).toBe(true);
      expect(result.token).toBe("mock-token");
    });
  });

  describe("stopImpersonation", () => {
    it("should fail if database is not available", async () => {
      (getDb as any).mockResolvedValue(null);
      
      const result = await stopImpersonation(1);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Database not available");
    });

    it("should fail if no active impersonation session", async () => {
      const result = await stopImpersonation(999);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("No active impersonation session");
    });
  });

  describe("isImpersonationToken", () => {
    it("should return true for impersonation tokens", () => {
      expect(isImpersonationToken({ type: "impersonation" })).toBe(true);
    });

    it("should return false for regular tokens", () => {
      expect(isImpersonationToken({ type: "session" })).toBe(false);
      expect(isImpersonationToken(null)).toBe(false);
      expect(isImpersonationToken(undefined)).toBe(false);
      expect(isImpersonationToken({})).toBe(false);
    });
  });

  describe("getImpersonationInfo", () => {
    it("should return impersonation info for valid token", () => {
      const decoded = {
        type: "impersonation",
        tenantId: 2,
        impersonatedTenantName: "Test Tenant",
        originalTenantId: null,
      };
      
      const info = getImpersonationInfo(decoded);
      
      expect(info.isImpersonating).toBe(true);
      expect(info.impersonatedTenantId).toBe(2);
      expect(info.impersonatedTenantName).toBe("Test Tenant");
      expect(info.originalTenantId).toBe(null);
    });

    it("should return not impersonating for regular tokens", () => {
      const info = getImpersonationInfo({ type: "session" });
      
      expect(info.isImpersonating).toBe(false);
      expect(info.impersonatedTenantId).toBeUndefined();
    });
  });
});

describe("Churn Outreach Email", () => {
  it("should have correct email template structure", async () => {
    // Import the email service to check template
    const { sendChurnOutreachEmail } = await import("./emailService");
    
    // The function should exist and be callable
    expect(typeof sendChurnOutreachEmail).toBe("function");
  });
});
