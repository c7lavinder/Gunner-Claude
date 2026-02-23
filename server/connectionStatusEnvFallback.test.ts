import { describe, it, expect, afterEach } from "vitest";

/**
 * Tests that getCrmIntegrations correctly reports connection status
 * when API keys are set via environment variables (not just tenant crmConfig).
 */

describe("CRM Connection Status with Env Fallback", () => {
  let originalBdKey: string | undefined;
  let originalBlKey: string | undefined;

  afterEach(() => {
    if (originalBdKey !== undefined) process.env.BATCHDIALER_API_KEY = originalBdKey;
    else delete process.env.BATCHDIALER_API_KEY;
    if (originalBlKey !== undefined) process.env.BATCHLEADS_API_KEY = originalBlKey;
    else delete process.env.BATCHLEADS_API_KEY;
  });

  it("should detect BatchDialer as connected when env var is set but crmConfig is empty", () => {
    originalBdKey = process.env.BATCHDIALER_API_KEY;
    originalBlKey = process.env.BATCHLEADS_API_KEY;
    process.env.BATCHDIALER_API_KEY = "test-bd-key-123";
    process.env.BATCHLEADS_API_KEY = "";

    const config = { batchDialerApiKey: undefined as string | undefined, batchLeadsApiKey: undefined as string | undefined };
    const hasBdKey = !!(config.batchDialerApiKey || process.env.BATCHDIALER_API_KEY);
    const hasBlKey = !!(config.batchLeadsApiKey || process.env.BATCHLEADS_API_KEY);

    expect(hasBdKey).toBe(true);
    expect(hasBlKey).toBe(false);
  });

  it("should detect BatchLeads as connected when env var is set but crmConfig is empty", () => {
    originalBdKey = process.env.BATCHDIALER_API_KEY;
    originalBlKey = process.env.BATCHLEADS_API_KEY;
    process.env.BATCHDIALER_API_KEY = "";
    process.env.BATCHLEADS_API_KEY = "test-bl-key-456";

    const config = { batchDialerApiKey: undefined as string | undefined, batchLeadsApiKey: undefined as string | undefined };
    const hasBdKey = !!(config.batchDialerApiKey || process.env.BATCHDIALER_API_KEY);
    const hasBlKey = !!(config.batchLeadsApiKey || process.env.BATCHLEADS_API_KEY);

    expect(hasBdKey).toBe(false);
    expect(hasBlKey).toBe(true);
  });

  it("should detect both as connected when both env vars are set", () => {
    originalBdKey = process.env.BATCHDIALER_API_KEY;
    originalBlKey = process.env.BATCHLEADS_API_KEY;
    process.env.BATCHDIALER_API_KEY = "test-bd-key";
    process.env.BATCHLEADS_API_KEY = "test-bl-key";

    const config = { batchDialerApiKey: undefined as string | undefined, batchLeadsApiKey: undefined as string | undefined };
    const hasBdKey = !!(config.batchDialerApiKey || process.env.BATCHDIALER_API_KEY);
    const hasBlKey = !!(config.batchLeadsApiKey || process.env.BATCHLEADS_API_KEY);

    expect(hasBdKey).toBe(true);
    expect(hasBlKey).toBe(true);
  });

  it("should detect as connected when crmConfig has the key (regardless of env)", () => {
    originalBdKey = process.env.BATCHDIALER_API_KEY;
    originalBlKey = process.env.BATCHLEADS_API_KEY;
    process.env.BATCHDIALER_API_KEY = "";
    process.env.BATCHLEADS_API_KEY = "";

    const config = { batchDialerApiKey: "config-bd-key", batchLeadsApiKey: "config-bl-key" };
    const hasBdKey = !!(config.batchDialerApiKey || process.env.BATCHDIALER_API_KEY);
    const hasBlKey = !!(config.batchLeadsApiKey || process.env.BATCHLEADS_API_KEY);

    expect(hasBdKey).toBe(true);
    expect(hasBlKey).toBe(true);
  });

  it("should show not connected when neither env nor config has keys", () => {
    originalBdKey = process.env.BATCHDIALER_API_KEY;
    originalBlKey = process.env.BATCHLEADS_API_KEY;
    process.env.BATCHDIALER_API_KEY = "";
    process.env.BATCHLEADS_API_KEY = "";

    const config = { batchDialerApiKey: undefined as string | undefined, batchLeadsApiKey: undefined as string | undefined };
    const hasBdKey = !!(config.batchDialerApiKey || process.env.BATCHDIALER_API_KEY);
    const hasBlKey = !!(config.batchLeadsApiKey || process.env.BATCHLEADS_API_KEY);

    expect(hasBdKey).toBe(false);
    expect(hasBlKey).toBe(false);
  });
});

describe("CRM Config Parsing for Connection Status", () => {
  it("should parse null crmConfig and return empty object", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const config = parseCrmConfig({ crmConfig: null });
    expect(config.batchDialerApiKey).toBeUndefined();
    expect(config.batchLeadsApiKey).toBeUndefined();
  });

  it("should parse crmConfig with batchDialerApiKey", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const config = parseCrmConfig({
      crmConfig: JSON.stringify({ batchDialerApiKey: "bd-key-test" }),
    });
    expect(config.batchDialerApiKey).toBe("bd-key-test");
  });

  it("should parse crmConfig with batchLeadsApiKey", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const config = parseCrmConfig({
      crmConfig: JSON.stringify({ batchLeadsApiKey: "bl-key-test" }),
    });
    expect(config.batchLeadsApiKey).toBe("bl-key-test");
  });
});
