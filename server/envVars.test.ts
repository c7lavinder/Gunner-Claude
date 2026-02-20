import { describe, it, expect } from "vitest";

describe("Environment Variables - APP_URL and EMAIL_LOGO_URL", () => {
  it("APP_URL should be set and be a valid URL", () => {
    const appUrl = process.env.APP_URL;
    expect(appUrl).toBeDefined();
    expect(appUrl).not.toBe("");
    expect(appUrl).toMatch(/^https?:\/\//);
    expect(appUrl).toBe("https://getgunner.ai");
  });

  it("EMAIL_LOGO_URL should be set and be a valid URL", () => {
    const logoUrl = process.env.EMAIL_LOGO_URL;
    expect(logoUrl).toBeDefined();
    expect(logoUrl).not.toBe("");
    expect(logoUrl).toMatch(/^https?:\/\//);
    expect(logoUrl).toBe("https://getgunner.ai/logo.png");
  });

  it("EMAIL_LOGO_URL should not contain manus or manuscdn", () => {
    const logoUrl = process.env.EMAIL_LOGO_URL || "";
    expect(logoUrl.toLowerCase()).not.toContain("manus");
  });

  it("APP_URL should not contain manus.space", () => {
    const appUrl = process.env.APP_URL || "";
    expect(appUrl.toLowerCase()).not.toContain("manus.space");
  });
});
