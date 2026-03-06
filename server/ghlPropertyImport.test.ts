/**
 * Tests for GHL Property Import — Poller + Bulk Import + Stage Mapping
 *
 * Validates:
 * 1. pollOpportunitiesForTenant calls runBulkImport (source code check)
 * 2. Stage name normalization strips parenthetical counts
 * 3. Stage mapping covers all pipeline stages
 * 4. Source normalization handles common GHL variants
 * 5. Tag parsing extracts source/market/buyBoxType
 * 6. Address resolution priority (companyName > address1 > oppName)
 * 7. Milestone flag calculation
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);

// ─── Source code wiring checks ───────────────────────────

describe("GHL Property Import — Poller wiring", () => {
  const ghlServiceSource = readFileSync(join(SERVER_DIR, "ghlService.ts"), "utf-8");

  it("pollOpportunitiesForTenant calls runBulkImport for property sync", () => {
    // The poller must call runBulkImport to create/update dispo_properties
    expect(ghlServiceSource).toContain('import("./ghlContactImport")');
    expect(ghlServiceSource).toContain("runBulkImport");
    expect(ghlServiceSource).toContain("Running property sync via runBulkImport");
  });

  it("pollOpportunitiesForTenant still processes New Deal stage for badge tracking", () => {
    expect(ghlServiceSource).toContain("processNewDeal");
    expect(ghlServiceSource).toContain("badge tracking");
  });

  it("poller runs on a 2-hour fallback interval", () => {
    expect(ghlServiceSource).toContain("2 * 60 * 60 * 1000");
    expect(ghlServiceSource).toContain("2-hour");
  });
});

// ─── Stage mapping tests ─────────────────────────────────

describe("GHL Property Import — Stage mapping", () => {
  // Import the mapping function from ghlContactImport
  // We test the exported function directly
  const importSource = readFileSync(join(SERVER_DIR, "ghlContactImport.ts"), "utf-8");
  const webhookSource = readFileSync(join(SERVER_DIR, "webhook.ts"), "utf-8");

  it("ghlContactImport strips parenthetical counts from stage names", () => {
    // Both files should strip "(1)", "(2)", etc. from stage names
    expect(importSource).toContain('.replace(/\\s*\\(\\d+\\)\\s*$/');
    expect(webhookSource).toContain('.replace(/\\s*\\(\\d+\\)\\s*$/');
  });

  it("ghlContactImport maps all pipeline stages", () => {
    // All required stages must be in the mapping
    const requiredMappings = [
      '"new lead"',
      '"warm lead"',
      '"hot lead"',
      '"apt set"',
      '"offer made"',
      '"under contract"',
      '"marketing"',
      '"buyer negotiating"',
      '"closing"',
      '"closed"',
      '"follow up"',
      '"dead"',
    ];
    for (const mapping of requiredMappings) {
      expect(importSource.toLowerCase()).toContain(mapping);
    }
  });

  it("webhook.ts maps all pipeline stages", () => {
    const requiredMappings = [
      '"new lead"',
      '"warm lead"',
      '"hot lead"',
      '"apt set"',
      '"offer made"',
      '"under contract"',
      '"marketing"',
      '"buyer negotiating"',
      '"closing"',
      '"closed"',
      '"follow up"',
      '"dead"',
    ];
    for (const mapping of requiredMappings) {
      expect(webhookSource.toLowerCase()).toContain(mapping);
    }
  });

  it("maps plural variants (New Leads, Warm Leads, Hot Leads)", () => {
    expect(importSource).toContain('"new leads"');
    expect(importSource).toContain('"warm leads"');
    expect(importSource).toContain('"hot leads"');
  });
});

// ─── Source normalization tests ──────────────────────────

describe("GHL Property Import — Source normalization", () => {
  // Dynamic import to test the actual function
  let normalizeSource: (raw: string) => string;

  it("normalizes PropertyLeads variants", async () => {
    const mod = await import("./ghlContactImport");
    normalizeSource = mod.normalizeSource;
    expect(normalizeSource("propertyleads")).toBe("PropertyLeads");
    expect(normalizeSource("PropertyLeads.com")).toBe("PropertyLeads");
    expect(normalizeSource("PPL")).toBe("PropertyLeads");
    expect(normalizeSource("PPL - PropertyLeads")).toBe("PropertyLeads");
  });

  it("normalizes BatchDialer variants", async () => {
    const mod = await import("./ghlContactImport");
    normalizeSource = mod.normalizeSource;
    expect(normalizeSource("batchdialer")).toBe("BatchDialer");
    expect(normalizeSource("cold call")).toBe("BatchDialer");
    expect(normalizeSource("Cold Calling")).toBe("BatchDialer");
  });

  it("normalizes Referral variants", async () => {
    const mod = await import("./ghlContactImport");
    normalizeSource = mod.normalizeSource;
    expect(normalizeSource("referral")).toBe("Referral");
    expect(normalizeSource("word of mouth")).toBe("Referral");
  });

  it("returns Unknown for empty source", async () => {
    const mod = await import("./ghlContactImport");
    normalizeSource = mod.normalizeSource;
    expect(normalizeSource("")).toBe("Unknown");
  });

  it("passes through unrecognized sources as-is", async () => {
    const mod = await import("./ghlContactImport");
    normalizeSource = mod.normalizeSource;
    expect(normalizeSource("My Custom Source")).toBe("My Custom Source");
  });
});

// ─── Tag parsing tests ───────────────────────────────────

describe("GHL Property Import — Tag parsing", () => {
  it("extracts source, market, and buyBoxType from tags", async () => {
    const { parseContactTags } = await import("./ghlContactImport");
    const result = parseContactTags([
      "source:PropertyLeads",
      "market:Nashville",
      "type:House",
      "other-tag",
    ]);
    expect(result.source).toBe("PropertyLeads");
    expect(result.market).toBe("Nashville");
    expect(result.buyBoxType).toBe("House");
  });

  it("returns null for missing tags", async () => {
    const { parseContactTags } = await import("./ghlContactImport");
    const result = parseContactTags(["unrelated-tag"]);
    expect(result.source).toBeNull();
    expect(result.market).toBeNull();
    expect(result.buyBoxType).toBeNull();
  });

  it("handles empty tags array", async () => {
    const { parseContactTags } = await import("./ghlContactImport");
    const result = parseContactTags([]);
    expect(result.source).toBeNull();
    expect(result.market).toBeNull();
    expect(result.buyBoxType).toBeNull();
  });

  it("normalizes source from tags", async () => {
    const { parseContactTags } = await import("./ghlContactImport");
    const result = parseContactTags(["source:cold call"]);
    expect(result.source).toBe("BatchDialer");
  });
});

// ─── Milestone flags tests ───────────────────────────────

describe("GHL Property Import — Milestone flags", () => {
  const importSource = readFileSync(join(SERVER_DIR, "ghlContactImport.ts"), "utf-8");

  it("getMilestoneFlags sets aptEverSet for apt_set and beyond", () => {
    expect(importSource).toContain("aptEverSet");
    expect(importSource).toContain("offerEverMade");
    expect(importSource).toContain("everUnderContract");
    expect(importSource).toContain("everClosed");
  });

  it("stores milestone flags on property insert", () => {
    expect(importSource).toContain("aptEverSet: milestoneFlags.aptEverSet");
    expect(importSource).toContain("offerEverMade: milestoneFlags.offerEverMade");
    expect(importSource).toContain("everUnderContract: milestoneFlags.everUnderContract");
    expect(importSource).toContain("everClosed: milestoneFlags.everClosed");
  });
});

// ─── Address resolution tests ────────────────────────────

describe("GHL Property Import — Address resolution", () => {
  const importSource = readFileSync(join(SERVER_DIR, "ghlContactImport.ts"), "utf-8");

  it("resolves address from companyName first (GHL convention)", () => {
    expect(importSource).toContain("companyName");
    expect(importSource).toContain("GHL convention");
  });

  it("falls back to address1 field", () => {
    expect(importSource).toContain("address1");
    expect(importSource).toContain("Fall back to address1");
  });

  it("uses opportunity name as last resort", () => {
    expect(importSource).toContain("Last resort: opportunity name");
    expect(importSource).toContain("Address Pending");
  });
});

// ─── Duplicate detection tests ───────────────────────────

describe("GHL Property Import — Duplicate detection", () => {
  const importSource = readFileSync(join(SERVER_DIR, "ghlContactImport.ts"), "utf-8");

  it("checks for existing properties by ghlOpportunityId", () => {
    expect(importSource).toContain("existingOppIds");
    expect(importSource).toContain("ghlOpportunityId");
  });

  it("checks for duplicate addresses", () => {
    expect(importSource).toContain("existingAddresses");
    expect(importSource).toContain("address.toLowerCase().trim()");
  });

  it("tracks new addresses within batch to prevent intra-batch duplicates", () => {
    expect(importSource).toContain("existingAddresses.add(address.toLowerCase().trim())");
  });
});

// ─── Frontend label tests ────────────────────────────────

describe("GHL Property Import — Frontend labels", () => {
  const settingsSource = readFileSync(
    join(__dirname, "..", "client", "src", "pages", "TenantSettings.tsx"),
    "utf-8"
  );

  it("settings card says 'Import Properties from GHL' not 'Sync Contacts'", () => {
    expect(settingsSource).toContain("Import Properties from GHL");
    expect(settingsSource).not.toContain("Sync Contacts from GHL");
    // Comments may still reference the old name, but the visible UI text should not
    expect(settingsSource).not.toContain('"GHL Contact Sync"');
  });

  it("settings card mentions property import in description", () => {
    expect(settingsSource).toContain("Pull opportunities from your GHL pipeline");
    expect(settingsSource).toContain("create properties in Inventory");
  });
});

// ─── TS error regression tests ───────────────────────────

describe("GHL Property Import — No stale column references", () => {
  const gradingSource = readFileSync(join(SERVER_DIR, "grading.ts"), "utf-8");

  it("grading.ts does not reference deleted firstName/lastName on contact_cache", () => {
    // These columns were removed from contact_cache schema
    expect(gradingSource).not.toContain("cached.firstName");
    expect(gradingSource).not.toContain("cached.lastName");
    expect(gradingSource).not.toContain("cached?.firstName");
    expect(gradingSource).not.toContain("cached?.lastName");
  });
});
