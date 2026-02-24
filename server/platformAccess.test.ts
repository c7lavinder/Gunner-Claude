import { describe, it, expect, afterEach, vi } from "vitest";

describe("Platform Access Control", () => {
  const originalOwnerOpenId = process.env.OWNER_OPEN_ID;

  afterEach(() => {
    if (originalOwnerOpenId !== undefined) {
      process.env.OWNER_OPEN_ID = originalOwnerOpenId;
    } else {
      delete process.env.OWNER_OPEN_ID;
    }
    vi.resetModules();
  });

  describe("isPlatformOwner", () => {
    it("should return true when openId matches OWNER_OPEN_ID", async () => {
      process.env.OWNER_OPEN_ID = "test-owner-123";
      const { isPlatformOwner } = await import("./tenant");
      expect(isPlatformOwner("test-owner-123")).toBe(true);
    });

    it("should return false when openId does not match", async () => {
      process.env.OWNER_OPEN_ID = "test-owner-123";
      const { isPlatformOwner } = await import("./tenant");
      expect(isPlatformOwner("different-id")).toBe(false);
    });

    it("should return false when OWNER_OPEN_ID is not set", async () => {
      delete process.env.OWNER_OPEN_ID;
      const { isPlatformOwner } = await import("./tenant");
      expect(isPlatformOwner("any-id")).toBe(false);
    });
  });

  describe("hasPlatformAccess", () => {
    it("should grant access to super_admin role regardless of openId", async () => {
      process.env.OWNER_OPEN_ID = "some-other-id";
      const { hasPlatformAccess } = await import("./tenant");
      expect(hasPlatformAccess({ role: "super_admin", openId: "google_12345" })).toBe(true);
    });

    it("should grant access when openId matches OWNER_OPEN_ID", async () => {
      process.env.OWNER_OPEN_ID = "manus-owner-id";
      const { hasPlatformAccess } = await import("./tenant");
      expect(hasPlatformAccess({ role: "user", openId: "manus-owner-id" })).toBe(true);
    });

    it("should deny access for regular user with non-matching openId", async () => {
      process.env.OWNER_OPEN_ID = "manus-owner-id";
      const { hasPlatformAccess } = await import("./tenant");
      expect(hasPlatformAccess({ role: "user", openId: "google_random" })).toBe(false);
    });

    it("should deny access for admin role (not super_admin)", async () => {
      process.env.OWNER_OPEN_ID = "manus-owner-id";
      const { hasPlatformAccess } = await import("./tenant");
      expect(hasPlatformAccess({ role: "admin", openId: "google_random" })).toBe(false);
    });

    it("should deny access for empty user object", async () => {
      const { hasPlatformAccess } = await import("./tenant");
      expect(hasPlatformAccess({})).toBe(false);
    });

    it("should grant access to super_admin even without openId", async () => {
      const { hasPlatformAccess } = await import("./tenant");
      expect(hasPlatformAccess({ role: "super_admin" })).toBe(true);
    });
  });

  describe("Frontend access checks", () => {
    it("SuperAdmin.tsx should use role-based check not hardcoded openId", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const content = fs.readFileSync(
        path.join(__dirname, "../client/src/pages/SuperAdmin.tsx"),
        "utf-8"
      );
      expect(content).not.toContain("U3JEthPNs4UbYRrgRBbShj");
      expect(content).toContain('role === "super_admin"');
    });

    it("routers.ts tenant procedures should use hasPlatformAccess", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const content = fs.readFileSync(
        path.join(__dirname, "routers.ts"),
        "utf-8"
      );
      const tenantSection = content.slice(content.indexOf("tenant: router({"));
      expect(tenantSection).toContain("hasPlatformAccess");
      expect(tenantSection).not.toContain("isPlatformOwner");
    });
  });
});
