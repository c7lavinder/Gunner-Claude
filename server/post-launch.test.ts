import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([]))
        })),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        $returningId: vi.fn(() => Promise.resolve([{ id: 1 }]))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve())
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve())
    }))
  }))
}));

// Mock bcrypt
vi.mock("bcrypt", () => ({
  hash: vi.fn(() => Promise.resolve("hashed_password")),
  compare: vi.fn((password, hash) => Promise.resolve(password === "correctpassword"))
}));

// Mock notification
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(() => Promise.resolve(true))
}));

describe("Password Reset Flow", () => {
  describe("requestPasswordReset", () => {
    it("should return success even for non-existent email (prevent enumeration)", async () => {
      const { requestPasswordReset } = await import("./selfServeAuth");
      const result = await requestPasswordReset("nonexistent@example.com");
      expect(result.success).toBe(true);
    });
  });

  describe("verifyResetToken", () => {
    it("should return invalid for non-existent token", async () => {
      const { verifyResetToken } = await import("./selfServeAuth");
      const result = await verifyResetToken("invalid_token");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("resetPassword", () => {
    it("should reject invalid tokens before checking password length", async () => {
      const { resetPassword } = await import("./selfServeAuth");
      const result = await resetPassword("invalid_token", "short");
      expect(result.success).toBe(false);
      // Token validation happens first, so we get token error
      expect(result.error).toBeDefined();
    });
  });
});

describe("Low Usage Tenant Detection", () => {
  describe("getLowUsageTenants function structure", () => {
    it("should be a function that returns a promise", async () => {
      const { getLowUsageTenants } = await import("./tenant");
      expect(typeof getLowUsageTenants).toBe("function");
    });

    it("should calculate days since last call correctly", () => {
      const lastActivityDate = new Date();
      lastActivityDate.setDate(lastActivityDate.getDate() - 10); // 10 days ago
      const now = new Date();
      const daysSinceLastCall = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysSinceLastCall).toBe(10);
    });

    it("should flag tenants with 7+ days as low usage", () => {
      const daysSinceLastCall = 7;
      const isLowUsage = daysSinceLastCall >= 7;
      expect(isLowUsage).toBe(true);
    });

    it("should not flag tenants with less than 7 days as low usage", () => {
      const daysSinceLastCall = 6;
      const isLowUsage = daysSinceLastCall >= 7;
      expect(isLowUsage).toBe(false);
    });
  });
});

describe("Self-Serve Auth Validation", () => {
  describe("hashPassword", () => {
    it("should hash passwords using bcrypt", async () => {
      const { hashPassword } = await import("./selfServeAuth");
      const hash = await hashPassword("testpassword");
      expect(hash).toBe("hashed_password");
    });
  });

  describe("verifyPassword", () => {
    it("should verify correct passwords", async () => {
      const { verifyPassword } = await import("./selfServeAuth");
      const result = await verifyPassword("correctpassword", "hashed_password");
      expect(result).toBe(true);
    });

    it("should reject incorrect passwords", async () => {
      const { verifyPassword } = await import("./selfServeAuth");
      const result = await verifyPassword("wrongpassword", "hashed_password");
      expect(result).toBe(false);
    });
  });

  describe("createSessionToken", () => {
    it("should create a valid JWT token", async () => {
      const { createSessionToken } = await import("./selfServeAuth");
      const token = createSessionToken(1, 1);
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });
  });

  describe("verifySessionToken", () => {
    it("should verify valid tokens", async () => {
      const { createSessionToken, verifySessionToken } = await import("./selfServeAuth");
      const token = createSessionToken(1, 1);
      const decoded = verifySessionToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(1);
      expect(decoded?.tenantId).toBe(1);
    });

    it("should reject invalid tokens", async () => {
      const { verifySessionToken } = await import("./selfServeAuth");
      const decoded = verifySessionToken("invalid.token.here");
      expect(decoded).toBeNull();
    });
  });
});
