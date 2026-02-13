import { describe, it, expect, vi, beforeEach } from "vitest";

// ============ BatchLeads Service Tests ============

describe("BatchLeads Service", () => {
  describe("validateApiKey", () => {
    it("should return invalid when no API key is provided", async () => {
      // Mock ENV to have no key
      vi.doMock("./_core/env", () => ({
        ENV: { batchLeadsApiKey: "" },
      }));
      const { validateApiKey } = await import("./batchLeadsService");
      const result = await validateApiKey("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("No API key");
      vi.doUnmock("./_core/env");
    });

    it("should return valid with usage stats for a valid API key", async () => {
      const { validateApiKey } = await import("./batchLeadsService");
      const { ENV } = await import("./_core/env");
      
      if (!ENV.batchLeadsApiKey) {
        console.log("Skipping: No BatchLeads API key configured");
        return;
      }

      const result = await validateApiKey(ENV.batchLeadsApiKey);
      expect(result.valid).toBe(true);
      expect(result.usage).toBeDefined();
      expect(result.usage?.Properties).toBeDefined();
      expect(result.usage?.Properties.total_properties).toBeGreaterThanOrEqual(0);
    });

    it("should return invalid for a bogus API key", async () => {
      const { validateApiKey } = await import("./batchLeadsService");
      const result = await validateApiKey("invalid-key-12345");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("searchPropertyByAddress", () => {
    it("should return null when no API key is available", async () => {
      vi.doMock("./_core/env", () => ({
        ENV: { batchLeadsApiKey: "" },
      }));
      // Re-import to get fresh module
      const mod = await import("./batchLeadsService");
      const result = await mod.searchPropertyByAddress("123 Main St", "");
      expect(result).toBeNull();
      vi.doUnmock("./_core/env");
    });
  });
});

// ============ BatchLeads Sync Tests ============

describe("BatchLeads Sync", () => {
  it("should export syncBatchLeadsForTenant function", async () => {
    const mod = await import("./batchLeadsSync");
    expect(typeof mod.syncBatchLeadsForTenant).toBe("function");
  });

  it("should export syncBatchLeadsCalls function", async () => {
    const mod = await import("./batchLeadsSync");
    expect(typeof mod.syncBatchLeadsCalls).toBe("function");
  });

  it("should export startBatchLeadsPolling and stopBatchLeadsPolling", async () => {
    const mod = await import("./batchLeadsSync");
    expect(typeof mod.startBatchLeadsPolling).toBe("function");
    expect(typeof mod.stopBatchLeadsPolling).toBe("function");
  });
});

// ============ CRM Config Parsing Tests ============

describe("CRM Config Parsing for Multi-Integration", () => {
  it("should parse empty config correctly", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const config = parseCrmConfig({ crmConfig: null });
    expect(config.ghlApiKey).toBeUndefined();
    expect(config.batchDialerApiKey).toBeUndefined();
    expect(config.batchLeadsApiKey).toBeUndefined();
  });

  it("should parse config with all three integrations", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const crmConfig = JSON.stringify({
      ghlApiKey: "ghl-key-123",
      ghlLocationId: "loc-456",
      batchDialerEnabled: true,
      batchDialerApiKey: "bd-key-789",
      batchLeadsApiKey: "bl-key-abc",
    });
    const config = parseCrmConfig({ crmConfig });
    expect(config.ghlApiKey).toBe("ghl-key-123");
    expect(config.ghlLocationId).toBe("loc-456");
    expect(config.batchDialerEnabled).toBe(true);
    expect(config.batchDialerApiKey).toBe("bd-key-789");
    expect(config.batchLeadsApiKey).toBe("bl-key-abc");
  });

  it("should handle config with only BatchDialer", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const crmConfig = JSON.stringify({
      batchDialerEnabled: true,
      batchDialerApiKey: "bd-only-key",
    });
    const config = parseCrmConfig({ crmConfig });
    expect(config.batchDialerApiKey).toBe("bd-only-key");
    expect(config.ghlApiKey).toBeUndefined();
    expect(config.batchLeadsApiKey).toBeUndefined();
  });

  it("should handle config with only BatchLeads", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const crmConfig = JSON.stringify({
      batchLeadsApiKey: "bl-only-key",
    });
    const config = parseCrmConfig({ crmConfig });
    expect(config.batchLeadsApiKey).toBe("bl-only-key");
    expect(config.ghlApiKey).toBeUndefined();
    expect(config.batchDialerApiKey).toBeUndefined();
  });

  it("should handle malformed JSON gracefully", async () => {
    const { parseCrmConfig } = await import("./tenant");
    const config = parseCrmConfig({ crmConfig: "not-valid-json" });
    // Should return empty/default config without throwing
    expect(config).toBeDefined();
  });
});
