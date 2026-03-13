/**
 * Unit tests for playbook resolver pure functions.
 * No database — tests the resolution logic directly.
 */
import { describe, it, expect } from "vitest";
import {
  SOFTWARE_PLAYBOOK,
  DEFAULT_TERMINOLOGY,
  resolveTerminology,
  resolveRoles,
  resolveStages,
  resolveCallTypes,
  resolveAlgorithmConfig,
} from "../../../server/services/playbooks";
import type { IndustryPlaybook, TenantPlaybook } from "../../../shared/types";

const mockIndustry: IndustryPlaybook = {
  code: "re_wholesaling",
  name: "RE Wholesaling",
  terminology: { contact: "Seller", contactPlural: "Sellers", asset: "Property", assetPlural: "Properties", deal: "Deal", dealPlural: "Deals", walkthrough: "Walkthrough" },
  roles: [
    { code: "lead_manager", name: "Lead Manager", description: "Handles inbound leads", color: "#3b82f6" },
    { code: "acquisition", name: "Acquisition Manager", description: "Closes deals", color: "#22c55e" },
  ],
  stages: [
    { code: "new", name: "New Lead", pipeline: "acquisition", order: 0 },
    { code: "contacted", name: "Contacted", pipeline: "acquisition", order: 1 },
  ],
  callTypes: [
    { code: "cold_call", name: "Cold Call", description: "First contact" },
    { code: "follow_up", name: "Follow Up", description: "Subsequent contact" },
  ],
  rubrics: [],
  outcomeTypes: ["appointment_set", "offer_made"],
  kpiFunnelStages: ["leads", "contacts", "appointments", "offers"],
  algorithmDefaults: { inventorySort: { urgencyWeight: 0.6 }, buyerMatch: {}, taskSort: {} },
  roleplayPersonas: [],
  trainingCategories: [],
};

const mockTenant: TenantPlaybook = {
  tenantId: 1,
  companyName: "New Again Houses",
  industryCode: "re_wholesaling",
  crmType: "ghl",
  roles: [
    { code: "closer", name: "Closer", description: "Custom role", color: "#ef4444" },
  ],
  stages: [
    { code: "hot_lead", name: "Hot Lead", pipeline: "custom", order: 0 },
  ],
  markets: [],
  leadSources: [],
  terminology: { contact: "Homeowner", contactPlural: "Homeowners" },
};

describe("resolveTerminology", () => {
  it("returns defaults when no playbooks provided", () => {
    const result = resolveTerminology();
    expect(result).toEqual(DEFAULT_TERMINOLOGY);
  });

  it("applies industry terminology over defaults", () => {
    const result = resolveTerminology(mockIndustry);
    expect(result.contact).toBe("Seller");
    expect(result.asset).toBe("Property");
  });

  it("applies tenant terminology over industry (most specific wins)", () => {
    const result = resolveTerminology(mockIndustry, mockTenant);
    expect(result.contact).toBe("Homeowner"); // tenant overrides industry
    expect(result.asset).toBe("Property"); // industry still applies where tenant doesn't override
  });

  it("handles null playbooks gracefully", () => {
    const result = resolveTerminology(null, null);
    expect(result).toEqual(DEFAULT_TERMINOLOGY);
  });
});

describe("resolveRoles", () => {
  it("returns default role when no playbooks", () => {
    const result = resolveRoles();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("member");
  });

  it("uses industry roles when no tenant roles", () => {
    const result = resolveRoles(mockIndustry);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe("lead_manager");
  });

  it("tenant roles override industry roles", () => {
    const result = resolveRoles(mockIndustry, mockTenant);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("closer");
  });
});

describe("resolveStages", () => {
  it("returns default stage when no playbooks", () => {
    const result = resolveStages();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("new");
  });

  it("uses industry stages when no tenant stages", () => {
    const result = resolveStages(mockIndustry);
    expect(result).toHaveLength(2);
  });

  it("tenant stages override industry stages", () => {
    const result = resolveStages(mockIndustry, mockTenant);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("hot_lead");
  });
});

describe("resolveCallTypes", () => {
  it("returns default call type when no industry", async () => {
    const result = await resolveCallTypes();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("sales");
  });

  it("uses industry call types", async () => {
    const result = await resolveCallTypes(mockIndustry);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe("cold_call");
  });
});

describe("resolveAlgorithmConfig", () => {
  it("returns software defaults when no playbooks", () => {
    const result = resolveAlgorithmConfig();
    expect(result).toHaveProperty("inventorySort");
    expect(result).toHaveProperty("buyerMatch");
    expect(result).toHaveProperty("taskSort");
  });

  it("merges industry defaults", () => {
    const result = resolveAlgorithmConfig(mockIndustry) as Record<string, unknown>;
    expect(result.inventorySort).toHaveProperty("urgencyWeight");
  });
});

describe("SOFTWARE_PLAYBOOK", () => {
  it("has 8 action types", () => {
    expect(SOFTWARE_PLAYBOOK.actionTypes).toHaveLength(8);
  });

  it("action rules require confirmation", () => {
    expect(SOFTWARE_PLAYBOOK.actionRules.requireConfirmation).toBe(true);
  });

  it("has algorithm framework with all sections", () => {
    expect(SOFTWARE_PLAYBOOK.algorithmFramework).toHaveProperty("inventorySort");
    expect(SOFTWARE_PLAYBOOK.algorithmFramework).toHaveProperty("buyerMatch");
    expect(SOFTWARE_PLAYBOOK.algorithmFramework).toHaveProperty("taskSort");
  });
});
