import { describe, expect, it } from "vitest";
import {
  SOFTWARE_PLAYBOOK_CRITERIA,
  SOFTWARE_PLAYBOOK_RED_FLAGS,
  REAL_ESTATE_WHOLESALING_PLAYBOOK,
  INDUSTRY_PLAYBOOKS,
  getPlaybookByCode,
  getEffectiveTerminology,
  parseTenantSettings,
  type PlaybookTerminology,
  type TenantPlaybookSettings,
} from "../shared/playbooks";

// ============ SOFTWARE PLAYBOOK (Layer 1) ============

describe("Software Playbook (Layer 1)", () => {
  it("has universal criteria that apply to any industry", () => {
    expect(SOFTWARE_PLAYBOOK_CRITERIA.length).toBeGreaterThanOrEqual(3);
    
    // Every criterion should have a name, maxPoints, and description
    for (const criterion of SOFTWARE_PLAYBOOK_CRITERIA) {
      expect(criterion.name).toBeTruthy();
      expect(criterion.maxPoints).toBeGreaterThan(0);
      expect(criterion.description).toBeTruthy();
    }
  });

  it("has universal red flags", () => {
    expect(SOFTWARE_PLAYBOOK_RED_FLAGS.length).toBeGreaterThanOrEqual(3);
    for (const flag of SOFTWARE_PLAYBOOK_RED_FLAGS) {
      expect(flag).toBeTruthy();
    }
  });

  it("criteria total points should be reasonable (40-100)", () => {
    const total = SOFTWARE_PLAYBOOK_CRITERIA.reduce((sum, c) => sum + c.maxPoints, 0);
    expect(total).toBeGreaterThanOrEqual(40);
    expect(total).toBeLessThanOrEqual(100);
  });
});

// ============ INDUSTRY PLAYBOOKS (Layer 2) ============

describe("Industry Playbooks (Layer 2)", () => {
  it("has at least one industry playbook registered", () => {
    expect(Object.keys(INDUSTRY_PLAYBOOKS).length).toBeGreaterThanOrEqual(1);
  });

  it("can retrieve the real estate wholesaling playbook by code", () => {
    const playbook = getPlaybookByCode("real_estate_wholesaling");
    expect(playbook).toBeDefined();
    expect(playbook!.code).toBe("real_estate_wholesaling");
    expect(playbook!.name).toBe("Real Estate Wholesaling");
  });

  it("returns null for unknown playbook codes", () => {
    const playbook = getPlaybookByCode("nonexistent_industry");
    expect(playbook).toBeNull();
  });

  describe("Real Estate Wholesaling Playbook", () => {
    const playbook = REAL_ESTATE_WHOLESALING_PLAYBOOK;

    it("has the required roles for wholesaling", () => {
      expect(playbook.roles.length).toBeGreaterThanOrEqual(3);
      
      const roleCodes = playbook.roles.map(r => r.code);
      expect(roleCodes).toContain("lead_generator");
      expect(roleCodes).toContain("lead_manager");
      expect(roleCodes).toContain("acquisition_manager");
    });

    it("each role has a valid legacy role mapping", () => {
      const validLegacyRoles = ["lead_manager", "acquisition_manager", "lead_generator", "admin"];
      for (const role of playbook.roles) {
        expect(validLegacyRoles).toContain(role.legacyRole);
      }
    });

    it("has the required call types for wholesaling", () => {
      expect(playbook.callTypes.length).toBeGreaterThanOrEqual(4);
      
      const callTypeCodes = playbook.callTypes.map(ct => ct.code);
      expect(callTypeCodes).toContain("cold_call");
      expect(callTypeCodes).toContain("qualification");
      expect(callTypeCodes).toContain("offer");
      expect(callTypeCodes).toContain("follow_up");
    });

    it("each call type references a valid rubric call type", () => {
      const rubricCallTypes = playbook.rubrics.map(r => r.callType);
      for (const ct of playbook.callTypes) {
        expect(rubricCallTypes).toContain(ct.rubricCallType);
      }
    });

    it("has rubrics with valid criteria that sum to 100 points", () => {
      for (const rubric of playbook.rubrics) {
        expect(rubric.criteria.length).toBeGreaterThanOrEqual(3);
        
        const total = rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
        expect(total).toBe(100);
        
        // Each criterion should have a name and description
        for (const criterion of rubric.criteria) {
          expect(criterion.name).toBeTruthy();
          expect(criterion.maxPoints).toBeGreaterThan(0);
          expect(criterion.description).toBeTruthy();
        }
      }
    });

    it("has red flags for each rubric", () => {
      for (const rubric of playbook.rubrics) {
        expect(rubric.redFlags.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("has outcomes defined", () => {
      expect(playbook.outcomes.length).toBeGreaterThanOrEqual(4);
      for (const outcome of playbook.outcomes) {
        expect(outcome.code).toBeTruthy();
        expect(outcome.label).toBeTruthy();
      }
    });

    it("has KPIs defined", () => {
      expect(playbook.kpis.length).toBeGreaterThanOrEqual(2);
      for (const kpi of playbook.kpis) {
        expect(kpi.code).toBeTruthy();
        expect(kpi.label).toBeTruthy();
      }
    });

    it("has terminology with all required fields", () => {
      const t = playbook.terminology;
      expect(t.contactLabel).toBeTruthy();
      expect(t.contactLabelPlural).toBeTruthy();
      expect(t.dealLabel).toBeTruthy();
      expect(t.dealLabelPlural).toBeTruthy();
      expect(t.assetLabel).toBeTruthy();
      expect(t.assetLabelPlural).toBeTruthy();
    });

    it("has an industry prompt for LLM context", () => {
      expect(playbook.industryPrompt).toBeTruthy();
      expect(playbook.industryPrompt.length).toBeGreaterThan(5);
    });
  });
});

// ============ TENANT SETTINGS PARSING ============

describe("parseTenantSettings", () => {
  it("returns defaults for null input", () => {
    const result = parseTenantSettings(null);
    expect(result).toBeDefined();
    expect(result.industryPlaybook).toBeUndefined();
  });

  it("returns defaults for empty string", () => {
    const result = parseTenantSettings("");
    expect(result).toBeDefined();
  });

  it("parses valid JSON settings", () => {
    const settings = JSON.stringify({
      industryPlaybook: "real_estate_wholesaling",
      terminology: { contactLabel: "Seller" },
    });
    const result = parseTenantSettings(settings);
    expect(result.industryPlaybook).toBe("real_estate_wholesaling");
    expect(result.terminology?.contactLabel).toBe("Seller");
  });

  it("handles invalid JSON gracefully", () => {
    const result = parseTenantSettings("not-valid-json{{{");
    expect(result).toBeDefined();
  });

  it("preserves existing CRM config when parsing", () => {
    const settings = JSON.stringify({
      ghlApiKey: "test-key",
      ghlLocationId: "test-loc",
      industryPlaybook: "real_estate_wholesaling",
    });
    const result = parseTenantSettings(settings);
    expect(result.industryPlaybook).toBe("real_estate_wholesaling");
    // CRM config should be preserved
    expect((result as any).ghlApiKey).toBe("test-key");
  });
});

// ============ EFFECTIVE TERMINOLOGY (3-Layer Merge) ============

describe("getEffectiveTerminology", () => {
  it("returns defaults when no playbook or overrides are set", () => {
    const result = getEffectiveTerminology({});
    expect(result.contactLabel).toBe("Contact");
    expect(result.dealLabel).toBe("Deal");
    expect(result.assetLabel).toBe("Asset");
    expect(result.roleLabels).toBeDefined();
    expect(result.callTypeLabels).toBeDefined();
  });

  it("applies industry playbook terminology (Layer 2)", () => {
    const result = getEffectiveTerminology({
      industryPlaybook: "real_estate_wholesaling",
    });
    // Wholesaling playbook should set these
    expect(result.contactLabel).toBe("Seller");
    expect(result.assetLabel).toBe("Property");
    expect(result.dealLabel).toBe("Deal");
  });

  it("applies tenant overrides on top of industry playbook (Layer 3)", () => {
    const result = getEffectiveTerminology({
      industryPlaybook: "real_estate_wholesaling",
      terminology: {
        contactLabel: "Homeowner", // Override the playbook's "Seller"
        contactLabelPlural: "Homeowners",
        dealLabel: "Contract",
        dealLabelPlural: "Contracts",
        assetLabel: "Property",
        assetLabelPlural: "Properties",
      },
    });
    expect(result.contactLabel).toBe("Homeowner"); // Tenant override wins
    expect(result.dealLabel).toBe("Contract"); // Tenant override wins
    expect(result.assetLabel).toBe("Property"); // Same as playbook
  });

  it("merges role labels from all three layers", () => {
    const result = getEffectiveTerminology({
      industryPlaybook: "real_estate_wholesaling",
      terminology: {
        contactLabel: "Seller",
        contactLabelPlural: "Sellers",
        dealLabel: "Deal",
        dealLabelPlural: "Deals",
        assetLabel: "Property",
        assetLabelPlural: "Properties",
        roleLabels: {
          lead_generator: "Cold Caller", // Override the playbook's "Lead Generator"
        },
      },
    });
    expect(result.roleLabels?.lead_generator).toBe("Cold Caller"); // Tenant override
    expect(result.roleLabels?.lead_manager).toBe("Lead Manager"); // From playbook
    expect(result.roleLabels?.acquisition_manager).toBe("Acquisition Manager"); // From playbook
  });

  it("merges call type labels from all three layers", () => {
    const result = getEffectiveTerminology({
      industryPlaybook: "real_estate_wholesaling",
      terminology: {
        contactLabel: "Seller",
        contactLabelPlural: "Sellers",
        dealLabel: "Deal",
        dealLabelPlural: "Deals",
        assetLabel: "Property",
        assetLabelPlural: "Properties",
        callTypeLabels: {
          cold_call: "Prospecting Call", // Override
        },
      },
    });
    expect(result.callTypeLabels?.cold_call).toBe("Prospecting Call"); // Tenant override
    expect(result.callTypeLabels?.qualification).toBeTruthy(); // From playbook
  });

  it("handles unknown industry playbook gracefully", () => {
    const result = getEffectiveTerminology({
      industryPlaybook: "nonexistent_industry",
    });
    // Should fall back to defaults
    expect(result.contactLabel).toBe("Contact");
    expect(result.roleLabels).toBeDefined();
  });
});

// ============ PLAYBOOK STRUCTURE VALIDATION ============

describe("Playbook Structure Validation", () => {
  const allPlaybooks = Object.values(INDUSTRY_PLAYBOOKS);

  it("all registered playbooks have unique codes", () => {
    const codes = allPlaybooks.map(p => p.code);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });

  it("all playbook role codes are unique within each playbook", () => {
    for (const playbook of allPlaybooks) {
      const roleCodes = playbook.roles.map(r => r.code);
      const uniqueRoleCodes = new Set(roleCodes);
      expect(roleCodes.length).toBe(uniqueRoleCodes.size);
    }
  });

  it("all playbook call type codes are unique within each playbook", () => {
    for (const playbook of allPlaybooks) {
      const ctCodes = playbook.callTypes.map(ct => ct.code);
      const uniqueCtCodes = new Set(ctCodes);
      expect(ctCodes.length).toBe(uniqueCtCodes.size);
    }
  });

  it("all playbook outcome codes are unique within each playbook", () => {
    for (const playbook of allPlaybooks) {
      const outcomeCodes = playbook.outcomes.map(o => o.code);
      const uniqueOutcomeCodes = new Set(outcomeCodes);
      expect(outcomeCodes.length).toBe(uniqueOutcomeCodes.size);
    }
  });
});
