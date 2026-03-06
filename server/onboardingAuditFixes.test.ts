import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============ TEST 1: isPlatformOwner uses env var only ============

describe("isPlatformOwner", () => {
  const originalEnv = process.env.OWNER_OPEN_ID;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OWNER_OPEN_ID = originalEnv;
    } else {
      delete process.env.OWNER_OPEN_ID;
    }
  });

  it("returns true when openId matches OWNER_OPEN_ID env var", async () => {
    process.env.OWNER_OPEN_ID = "test-owner-123";
    const { isPlatformOwner } = await import("./tenant");
    expect(isPlatformOwner("test-owner-123")).toBe(true);
  });

  it("returns false when openId does not match", async () => {
    process.env.OWNER_OPEN_ID = "test-owner-123";
    const { isPlatformOwner } = await import("./tenant");
    expect(isPlatformOwner("some-other-id")).toBe(false);
  });

  it("returns false when OWNER_OPEN_ID env var is not set", async () => {
    delete process.env.OWNER_OPEN_ID;
    // Need to re-import to get fresh module
    vi.resetModules();
    const { isPlatformOwner } = await import("./tenant");
    expect(isPlatformOwner("any-id")).toBe(false);
  });

  it("does NOT contain hardcoded Google OAuth ID", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/tenant.ts", "utf-8");
    // The old hardcoded ID should be gone
    expect(content).not.toContain("google_112815946311339322655");
    // The old hardcoded Manus OAuth fallback should be gone
    expect(content).not.toContain('|| "U3JEthPNs4UbYRrgRBbShj"');
  });
});

// ============ TEST 2: adminRouter uses env var for platform owner ============

describe("adminRouter platform owner check", () => {
  it("does NOT contain hardcoded PLATFORM_OWNER_OPEN_ID constant", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/adminRouter.ts", "utf-8");
    expect(content).not.toContain('const PLATFORM_OWNER_OPEN_ID = "U3JEthPNs4UbYRrgRBbShj"');
    expect(content).toContain("process.env.OWNER_OPEN_ID");
  });
});

// ============ TEST 3: Opportunity detection stage classification ============

describe("Opportunity detection stage classification", () => {
  it("exports setTenantStageConfig and StageClassificationConfig", async () => {
    const mod = await import("./opportunityDetection");
    expect(typeof mod.setTenantStageConfig).toBe("function");
  });

  it("does NOT contain hardcoded stage names from the old arrays", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/opportunityDetection.ts", "utf-8");
    // Should not have the old exact hardcoded arrays
    expect(content).not.toContain('"warm leads", "sms warm leads"');
    expect(content).not.toContain('"walkthrough apt scheduled"');
    expect(content).not.toContain('"offer apt scheduled"');
    expect(content).not.toContain('"ghosted lead"');
    expect(content).not.toContain('"1 month follow up"');
    expect(content).not.toContain('"4 month follow up"');
  });

  it("uses broad keyword patterns instead of exact stage names", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/opportunityDetection.ts", "utf-8");
    // Should have generic patterns
    expect(content).toContain("DEFAULT_ACTIVE_PATTERNS");
    expect(content).toContain("DEFAULT_FOLLOW_UP_PATTERNS");
    expect(content).toContain("DEFAULT_DEAD_PATTERNS");
  });

  it("does NOT hardcode 'sales process' as pipeline name", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/opportunityDetection.ts", "utf-8");
    // Should use config.dispoPipelineName with fallback
    expect(content).toContain("config.dispoPipelineName");
    // Should not have direct .includes("sales process") without config fallback
    const directSalesProcess = content.match(/\.includes\("sales process"\)/g);
    expect(directSalesProcess).toBeNull();
  });
});

// ============ TEST 4: TenantCrmConfig has stageClassification and engineWebhookUrl ============

describe("TenantCrmConfig interface", () => {
  it("includes stageClassification and engineWebhookUrl fields", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/tenant.ts", "utf-8");
    expect(content).toContain("stageClassification?:");
    expect(content).toContain("activeStages?: string[]");
    expect(content).toContain("followUpStages?: string[]");
    expect(content).toContain("deadStages?: string[]");
    expect(content).toContain("highValueStages?: string[]");
    expect(content).toContain("offerStages?: string[]");
    expect(content).toContain("engineWebhookUrl?: string");
  });
});

// ============ TEST 5: Gunner Engine webhook is per-tenant ============

describe("Gunner Engine webhook URL", () => {
  it("does NOT use a single global GUNNER_ENGINE_WEBHOOK_URL constant", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/gunnerEngineWebhook.ts", "utf-8");
    // Should not have the old global constant name
    expect(content).not.toContain("const GUNNER_ENGINE_WEBHOOK_URL =");
    // Should have per-tenant URL resolution
    expect(content).toContain("getWebhookUrl");
    expect(content).toContain("config.engineWebhookUrl");
  });

  it("webhookRetryQueue also uses per-tenant URL", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/webhookRetryQueue.ts", "utf-8");
    expect(content).not.toContain("const GUNNER_ENGINE_WEBHOOK_URL =");
    expect(content).toContain("getWebhookUrlForTenant");
  });

  it("skips webhook for non-owner tenants without engineWebhookUrl", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/gunnerEngineWebhook.ts", "utf-8");
    // Checks if tenant is platform owner by looking up OWNER_OPEN_ID in users table
    expect(content).toContain("OWNER_OPEN_ID");
    expect(content).toContain("isPlatformOwner");
    expect(content).toContain("return null");
  });
});

// ============ TEST 6: KPI module has no hardcoded team member names ============

describe("KPI module dynamic types", () => {
  it("updateKpiDeal uses string types for lmName, amName, dmName, location", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/kpi.ts", "utf-8");
    // Should NOT have hardcoded names
    expect(content).not.toContain('"chris" | "daniel"');
    expect(content).not.toContain('"kyle"');
    expect(content).not.toContain('"esteban" | "steve"');
    expect(content).not.toContain('"nashville" | "nash_sw"');
    // Should use generic string types
    expect(content).toMatch(/lmName: string/);
    expect(content).toMatch(/amName: string/);
    expect(content).toMatch(/dmName: string/);
    expect(content).toMatch(/location: string/);
  });

  it("upsertCampaignKpi uses string types for market and channel", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/kpi.ts", "utf-8");
    // Should NOT have hardcoded market enum
    expect(content).not.toContain('"tennessee" | "global"');
  });
});

// ============ TEST 7: Email templates use env vars ============

describe("Email templates and URLs", () => {
  it("emailService uses EMAIL_LOGO_URL variable instead of hardcoded URL", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/emailService.ts", "utf-8");
    // Should define EMAIL_LOGO_URL from env
    expect(content).toContain("EMAIL_LOGO_URL");
    expect(content).toContain("process.env.EMAIL_LOGO_URL");
    // All logo references should use the variable
    const hardcodedLogos = content.match(/src="https:\/\/www\.getgunner\.ai\/gunner-logo\.png"/g);
    expect(hardcodedLogos).toBeNull();
  });

  it("emailTemplates uses APP_URL from env var", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/emailTemplates.ts", "utf-8");
    expect(content).toContain("process.env.APP_URL");
    expect(content).not.toMatch(/const APP_URL = "https:\/\/getgunner\.ai"/);
  });

  it("emailSequenceJobs uses APP_URL env var for baseUrl", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/emailSequenceJobs.ts", "utf-8");
    expect(content).toContain("process.env.APP_URL");
  });

  it("selfServeAuth uses APP_URL env var for baseUrl", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/selfServeAuth.ts", "utf-8");
    expect(content).toContain("process.env.APP_URL");
  });

  it("tenant invite uses APP_URL env var for baseUrl", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/tenant.ts", "utf-8");
    // Should use env var, not hardcoded URL
    expect(content).not.toContain("const baseUrl = 'https://getgunner.ai'");
    expect(content).toContain("process.env.APP_URL");
  });
});

// ============ TEST 8: Trial length consistency ============

describe("Trial length consistency", () => {
  it("Onboarding page says 14-day trial, not 3-day", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/pages/Onboarding.tsx", "utf-8");
    expect(content).toContain("14-day free trial");
    expect(content).not.toContain("3-day free trial");
  });

  it("setupTenant creates 14-day trial", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/tenant.ts", "utf-8");
    expect(content).toContain("14 * 24 * 60 * 60 * 1000");
  });

  it("selfServeAuth defaults to 14-day trial", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/selfServeAuth.ts", "utf-8");
    expect(content).toContain("trialDays: 14");
  });
});

// ============ TEST 9: Schema uses varchar for dynamic fields ============

describe("Database schema dynamic fields", () => {
  it("campaignKpis market and channel are varchar, not enum", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./drizzle/schema.ts", "utf-8");
    // Find the campaignKpis table definition
    const campaignSection = content.substring(
      content.indexOf("export const campaignKpis"),
      content.indexOf("export type CampaignKpi")
    );
    expect(campaignSection).toContain('market: varchar("market"');
    expect(campaignSection).toContain('channel: varchar("channel"');
    expect(campaignSection).not.toContain('"tennessee"');
  });

  it("kpiDeals leadSource is varchar, not enum", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./drizzle/schema.ts", "utf-8");
    const dealsSection = content.substring(
      content.indexOf("export const kpiDeals"),
      content.indexOf("export type KpiDeal")
    );
    expect(dealsSection).toContain('leadSource: varchar("leadSource"');
  });

  it("kpiGoals channel is varchar, not enum", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./drizzle/schema.ts", "utf-8");
    const goalsSection = content.substring(
      content.indexOf("export const kpiGoals"),
      content.indexOf("export type KpiGoal")
    );
    expect(goalsSection).toContain('channel: varchar("channel"');
  });
});
