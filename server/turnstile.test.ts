import { describe, it, expect } from "vitest";

describe("Turnstile Configuration", () => {
  it("TURNSTILE_SECRET_KEY is set and has correct format", () => {
    const key = process.env.TURNSTILE_SECRET_KEY;
    expect(key).toBeTruthy();
    expect(key!.startsWith("0x")).toBe(true);
    expect(key!.length).toBeGreaterThan(10);
  });

  it("VITE_TURNSTILE_SITE_KEY is set and has correct format", () => {
    const key = process.env.VITE_TURNSTILE_SITE_KEY;
    expect(key).toBeTruthy();
    expect(key!.startsWith("0x")).toBe(true);
    expect(key!.length).toBeGreaterThan(10);
  });

  it("Turnstile siteverify API rejects invalid token with real secret key", async () => {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) throw new Error("TURNSTILE_SECRET_KEY not set");

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: secretKey,
        response: "invalid-token-for-testing",
      }).toString(),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    // With a REAL secret key, Cloudflare should return success: false for an invalid token
    // but NOT return "invalid-input-secret" error code
    expect(result.success).toBe(false);
    const errorCodes = result["error-codes"] || [];
    expect(errorCodes).not.toContain("invalid-input-secret");
    console.log("[Turnstile] Secret key validated — API accepted the key, rejected invalid token as expected");
  });
});
