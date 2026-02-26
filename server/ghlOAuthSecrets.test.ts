import { describe, it, expect } from "vitest";

describe("GHL OAuth Secrets", () => {
  it("GHL_CLIENT_ID should be set as an environment variable", () => {
    const clientId = process.env.GHL_CLIENT_ID;
    expect(clientId).toBeDefined();
    expect(clientId).not.toBe("");
    // GHL client IDs are typically UUID-like strings
    expect(clientId!.length).toBeGreaterThan(10);
  });

  it("GHL_CLIENT_SECRET should be set as an environment variable", () => {
    const clientSecret = process.env.GHL_CLIENT_SECRET;
    expect(clientSecret).toBeDefined();
    expect(clientSecret).not.toBe("");
    expect(clientSecret!.length).toBeGreaterThan(10);
  });

  it("ENV object should expose ghlClientId and ghlClientSecret", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.ghlClientId).toBeDefined();
    expect(ENV.ghlClientId).not.toBe("");
    expect(ENV.ghlClientSecret).toBeDefined();
    expect(ENV.ghlClientSecret).not.toBe("");
  });

  it("isOAuthConfigured should return true when both secrets are set", async () => {
    const { isOAuthConfigured } = await import("./ghlOAuth");
    expect(isOAuthConfigured()).toBe(true);
  });
});
