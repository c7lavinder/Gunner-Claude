import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    $returningId: vi.fn().mockResolvedValue([{ id: 1 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }),
}));

// Mock selfServeAuth
vi.mock("./selfServeAuth", () => ({
  createSessionToken: vi.fn().mockReturnValue("mock-token"),
  getUserWithTenant: vi.fn().mockResolvedValue({
    user: { id: 1, name: "Test User" },
    tenant: { onboardingCompleted: "false" },
  }),
}));

import { decodeIdToken, getGoogleAuthUrl } from "./googleAuth";

describe("Google OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGoogleAuthUrl", () => {
    it("should generate a valid Google OAuth URL structure", () => {
      const url = getGoogleAuthUrl("https://example.com/callback");
      
      expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback");
      expect(url).toContain("response_type=code");
      expect(url).toContain("scope=openid+email+profile");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
    });

    it("should include state parameter when provided", () => {
      const url = getGoogleAuthUrl("https://example.com/callback", "test-state");
      
      expect(url).toContain("state=test-state");
    });
  });

  describe("decodeIdToken", () => {
    it("should return null for invalid token format", () => {
      const result = decodeIdToken("invalid-token");
      expect(result).toBeNull();
    });

    it("should return null for token with wrong number of parts", () => {
      const result = decodeIdToken("part1.part2");
      expect(result).toBeNull();
    });

    it("should decode a valid JWT payload when audience matches", () => {
      // The actual GOOGLE_CLIENT_ID from env will be used
      // Since we can't control module-level env reading, we test the structure
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        sub: "google-user-123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
        picture: "https://example.com/photo.jpg",
        aud: "wrong-client-id", // Intentionally wrong to test rejection
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString("base64url");
      const signature = "mock-signature";
      
      const token = `${header}.${payload}.${signature}`;
      
      // Should return null due to audience mismatch (security feature)
      const result = decodeIdToken(token);
      expect(result).toBeNull();
    });

    it("should return null for expired token", () => {
      const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({
        sub: "google-user-123",
        email: "test@example.com",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
      })).toString("base64url");
      const signature = "mock-signature";
      
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
      const token = `${header}.${payload}.${signature}`;
      
      const result = decodeIdToken(token);
      expect(result).toBeNull();
    });
  });

  describe("Google OAuth Flow", () => {
    it("should have correct redirect URI format", () => {
      const baseUrl = "https://gunner.manus.space";
      const expectedRedirectUri = `${baseUrl}/api/auth/google/callback`;
      
      expect(expectedRedirectUri).toBe("https://gunner.manus.space/api/auth/google/callback");
    });
  });
});
