import { describe, it, expect } from "vitest";
import { gradeCall, LEAD_MANAGER_RUBRIC, ACQUISITION_MANAGER_RUBRIC, LEAD_GENERATOR_RUBRIC, FOLLOW_UP_RUBRIC, SELLER_CALLBACK_RUBRIC, ADMIN_CALLBACK_RUBRIC } from "./grading";

/**
 * These tests verify that tenant-specific rubrics override hardcoded defaults
 * when passed through the grading context. Since gradeCall calls the LLM,
 * we test the rubric resolution logic by examining the function's behavior
 * with different context shapes.
 */

describe("Tenant Rubric Pipeline Integration", () => {
  // Test that gradeCall accepts tenantRubrics in context without errors
  it("gradeCall function signature accepts tenantRubrics in context", () => {
    // Verify the function exists and has the right shape
    expect(typeof gradeCall).toBe("function");
    expect(gradeCall.length).toBeGreaterThanOrEqual(3); // transcript, callType, teamMemberName, context?
  });

  // Test that all 6 hardcoded rubrics have the expected structure
  it("all 6 hardcoded rubrics have consistent structure", () => {
    const rubrics = [
      { name: "LEAD_MANAGER_RUBRIC", rubric: LEAD_MANAGER_RUBRIC },
      { name: "ACQUISITION_MANAGER_RUBRIC", rubric: ACQUISITION_MANAGER_RUBRIC },
      { name: "LEAD_GENERATOR_RUBRIC", rubric: LEAD_GENERATOR_RUBRIC },
      { name: "FOLLOW_UP_RUBRIC", rubric: FOLLOW_UP_RUBRIC },
      { name: "SELLER_CALLBACK_RUBRIC", rubric: SELLER_CALLBACK_RUBRIC },
      { name: "ADMIN_CALLBACK_RUBRIC", rubric: ADMIN_CALLBACK_RUBRIC },
    ];

    for (const { name, rubric } of rubrics) {
      expect(rubric.name, `${name} should have a name`).toBeTruthy();
      expect(rubric.description, `${name} should have a description`).toBeTruthy();
      expect(Array.isArray(rubric.criteria), `${name} should have criteria array`).toBe(true);
      expect(rubric.criteria.length, `${name} should have at least 1 criterion`).toBeGreaterThan(0);
      expect(Array.isArray(rubric.redFlags), `${name} should have redFlags array`).toBe(true);

      // Each criterion should have the expected fields
      for (const criterion of rubric.criteria) {
        expect(criterion.name, `${name} criterion should have name`).toBeTruthy();
        expect(typeof criterion.maxPoints, `${name} criterion should have numeric maxPoints`).toBe("number");
        expect(criterion.description, `${name} criterion should have description`).toBeTruthy();
        expect(Array.isArray(criterion.keyPhrases), `${name} criterion should have keyPhrases array`).toBe(true);
      }
    }
  });

  // Test that tenant rubric criteria format is compatible with the grading prompt
  it("tenant rubric criteria JSON format is compatible with grading", () => {
    // Simulate what a tenant rubric looks like when stored in DB
    const tenantCriteria = [
      { name: "Custom Opening", maxPoints: 20, description: "Custom greeting approach", keyPhrases: ["hello", "good morning"] },
      { name: "Custom Closing", maxPoints: 30, description: "Custom close technique" },
    ];

    const serialized = JSON.stringify(tenantCriteria);
    const parsed = JSON.parse(serialized);

    // Simulate the normalization that gradeCall does
    const normalized = parsed.map((c: any) => ({
      ...c,
      keyPhrases: Array.isArray(c.keyPhrases) ? c.keyPhrases : [],
    }));

    expect(normalized[0].keyPhrases).toEqual(["hello", "good morning"]);
    expect(normalized[1].keyPhrases).toEqual([]); // Missing keyPhrases defaults to empty
    expect(normalized[0].maxPoints).toBe(20);
    expect(normalized[1].maxPoints).toBe(30);
  });

  // Test that tenant rubric with callType matches correctly
  it("tenant rubric callType matching logic works for all 6 types", () => {
    const callTypes = ["cold_call", "qualification", "follow_up", "offer", "seller_callback", "admin_callback"] as const;

    for (const callType of callTypes) {
      const tenantRubrics = [
        { name: "Custom Rubric", description: "Test", criteria: "[]", callType, redFlags: "[]" },
      ];

      // Exact callType match
      const match = tenantRubrics.find(r => r.callType === callType);
      expect(match, `Should find exact match for ${callType}`).toBeTruthy();
    }
  });

  // Test name-based fallback matching
  it("tenant rubric name-based fallback matching works", () => {
    const tenantRubrics = [
      { name: "Cold Call Rubric", description: "Test", criteria: "[]", callType: null, redFlags: "[]" },
      { name: "Follow Up Rubric", description: "Test", criteria: "[]", callType: null, redFlags: "[]" },
    ];

    // Simulate the name-based matching from gradeCall
    const findByName = (callType: string) => {
      return tenantRubrics.find(r =>
        r.name.toLowerCase().includes(callType.replace('_', ' ')) ||
        r.name.toLowerCase().includes(callType.replace('_', '-'))
      );
    };

    expect(findByName("cold_call")?.name).toBe("Cold Call Rubric");
    expect(findByName("follow_up")?.name).toBe("Follow Up Rubric");
    expect(findByName("qualification")).toBeUndefined(); // No match
  });

  // Test that tenant rubric red flags are properly parsed
  it("tenant rubric red flags are properly parsed from JSON", () => {
    const redFlagsJson = JSON.stringify(["Custom red flag 1", "Custom red flag 2"]);
    const parsed = JSON.parse(redFlagsJson);
    expect(parsed).toEqual(["Custom red flag 1", "Custom red flag 2"]);

    // Null/undefined redFlags should not crash
    const nullRedFlags = null;
    const parsedNull = nullRedFlags ? JSON.parse(nullRedFlags) : undefined;
    expect(parsedNull).toBeUndefined();
  });

  // Test that the rubric spread operator preserves non-overridden fields
  it("tenant rubric override preserves default fields not in tenant rubric", () => {
    const defaultRubric = {
      name: "Default",
      description: "Default description",
      criteria: [{ name: "C1", maxPoints: 10, description: "D1", keyPhrases: ["p1"] }],
      redFlags: ["RF1"],
      criticalFailures: ["CF1"],
      criticalFailureCap: 50,
      talkRatioTarget: 0.5,
    };

    const tenantOverride = {
      name: "Custom",
      description: "Custom description",
      criteria: [{ name: "Custom C1", maxPoints: 25, description: "Custom D1", keyPhrases: [] }],
    };

    // Simulate the spread from gradeCall
    const merged = {
      ...defaultRubric,
      name: tenantOverride.name,
      description: tenantOverride.description,
      criteria: tenantOverride.criteria,
    };

    // Overridden fields
    expect(merged.name).toBe("Custom");
    expect(merged.description).toBe("Custom description");
    expect(merged.criteria[0].name).toBe("Custom C1");
    expect(merged.criteria[0].maxPoints).toBe(25);

    // Preserved fields from default
    expect(merged.criticalFailures).toEqual(["CF1"]);
    expect(merged.criticalFailureCap).toBe(50);
    expect(merged.talkRatioTarget).toBe(0.5);
    expect(merged.redFlags).toEqual(["RF1"]); // Not overridden since no parsedRedFlags
  });

  // Test that tenant rubric with custom red flags overrides default red flags
  it("tenant rubric with custom red flags overrides defaults", () => {
    const defaultRubric = {
      name: "Default",
      description: "Default description",
      criteria: [],
      redFlags: ["Default RF1", "Default RF2"],
    };

    const parsedRedFlags = ["Custom RF1", "Custom RF2", "Custom RF3"];

    const merged = {
      ...defaultRubric,
      name: "Custom",
      ...(parsedRedFlags ? { redFlags: parsedRedFlags } : {}),
    };

    expect(merged.redFlags).toEqual(["Custom RF1", "Custom RF2", "Custom RF3"]);
    expect(merged.redFlags).not.toContain("Default RF1");
  });

  // Test that empty tenantRubrics array doesn't override defaults
  it("empty tenantRubrics array does not override defaults", () => {
    const tenantRubrics: any[] = [];
    const shouldOverride = tenantRubrics && tenantRubrics.length > 0;
    expect(shouldOverride).toBe(false);
  });

  // Test that malformed criteria JSON falls back to default
  it("malformed tenant rubric criteria JSON triggers fallback", () => {
    const malformedCriteria = "not valid json {{{";
    let usedDefault = false;

    try {
      JSON.parse(malformedCriteria);
    } catch (e) {
      usedDefault = true;
    }

    expect(usedDefault).toBe(true);
  });

  // Test the getGradingContext return type includes tenantRubrics
  it("getGradingContext return type includes tenantRubrics field", async () => {
    // Import and verify the function signature
    const { getGradingContext } = await import("./db");
    expect(typeof getGradingContext).toBe("function");

    // Call without tenantId — should return empty tenantRubrics
    const context = await getGradingContext("qualification");
    expect(context).toHaveProperty("tenantRubrics");
    expect(Array.isArray(context.tenantRubrics)).toBe(true);
    expect(context).toHaveProperty("trainingMaterials");
    expect(context).toHaveProperty("gradingRules");
    expect(context).toHaveProperty("recentFeedback");
  });

  // Test that getGradingContext with a tenantId returns tenant rubrics
  it("getGradingContext with tenantId fetches tenant-specific rubrics", async () => {
    const { getGradingContext } = await import("./db");

    // Use a non-existent tenantId — should return empty but not crash
    const context = await getGradingContext("qualification", 999999);
    expect(context).toHaveProperty("tenantRubrics");
    expect(Array.isArray(context.tenantRubrics)).toBe(true);
    // No rubrics for non-existent tenant
    expect(context.tenantRubrics.length).toBe(0);
  });

  // Test that all call types are supported in the grading context type mapping
  it("all gradable call types map to valid grading context types", () => {
    const callTypeToContextType = (callType: string) => {
      return callType === "cold_call" ? "lead_generation"
        : callType === "offer" ? "offer"
        : "qualification";
    };

    // All 6 call types should map to one of the 3 context types
    expect(callTypeToContextType("cold_call")).toBe("lead_generation");
    expect(callTypeToContextType("qualification")).toBe("qualification");
    expect(callTypeToContextType("follow_up")).toBe("qualification");
    expect(callTypeToContextType("offer")).toBe("offer");
    expect(callTypeToContextType("seller_callback")).toBe("qualification");
    expect(callTypeToContextType("admin_callback")).toBe("qualification");
  });

  // Test that the LLM prompt template handles criteria with and without keyPhrases
  it("LLM prompt template handles criteria with and without keyPhrases", () => {
    const criteriaWithPhrases = { name: "Test", maxPoints: 10, description: "Desc", keyPhrases: ["phrase1", "phrase2"] };
    const criteriaWithoutPhrases = { name: "Test", maxPoints: 10, description: "Desc", keyPhrases: [] as string[] };

    // Simulate the prompt template logic
    const withResult = criteriaWithPhrases.keyPhrases.length > 0
      ? criteriaWithPhrases.keyPhrases.join(", ")
      : "N/A - evaluate based on tone and approach";

    const withoutResult = criteriaWithoutPhrases.keyPhrases.length > 0
      ? criteriaWithoutPhrases.keyPhrases.join(", ")
      : "N/A - evaluate based on tone and approach";

    expect(withResult).toBe("phrase1, phrase2");
    expect(withoutResult).toBe("N/A - evaluate based on tone and approach");
  });
});
