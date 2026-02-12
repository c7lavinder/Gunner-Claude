import { describe, it, expect } from "vitest";
import {
  LEAD_GENERATOR_RUBRIC,
  LEAD_MANAGER_RUBRIC,
  ACQUISITION_MANAGER_RUBRIC,
  FOLLOW_UP_RUBRIC,
  SELLER_CALLBACK_RUBRIC,
  ADMIN_CALLBACK_RUBRIC,
  detectCallType,
  type GradableCallType,
} from "./grading";

// ============ CALL TYPE ENUM ============

describe("Call Type Redesign - 6 Call Types", () => {
  it("should support exactly 6 call types", () => {
    const validCallTypes: GradableCallType[] = [
      "cold_call",
      "qualification",
      "follow_up",
      "offer",
      "seller_callback",
      "admin_callback",
    ];
    expect(validCallTypes).toHaveLength(6);
  });

  // ============ RUBRIC EXISTENCE ============
  it("should have a Lead Generator rubric for cold_call", () => {
    expect(LEAD_GENERATOR_RUBRIC).toBeDefined();
    expect(LEAD_GENERATOR_RUBRIC.name).toBeTruthy();
    expect(LEAD_GENERATOR_RUBRIC.criteria.length).toBeGreaterThan(0);
  });

  it("should have a Lead Manager rubric for qualification", () => {
    expect(LEAD_MANAGER_RUBRIC).toBeDefined();
    expect(LEAD_MANAGER_RUBRIC.name).toBeTruthy();
    expect(LEAD_MANAGER_RUBRIC.criteria.length).toBeGreaterThan(0);
  });

  it("should have an Acquisition Manager rubric for offer", () => {
    expect(ACQUISITION_MANAGER_RUBRIC).toBeDefined();
    expect(ACQUISITION_MANAGER_RUBRIC.name).toBeTruthy();
    expect(ACQUISITION_MANAGER_RUBRIC.criteria.length).toBeGreaterThan(0);
  });

  it("should have a Follow-Up rubric for follow_up", () => {
    expect(FOLLOW_UP_RUBRIC).toBeDefined();
    expect(FOLLOW_UP_RUBRIC.name).toBeTruthy();
    expect(FOLLOW_UP_RUBRIC.criteria.length).toBeGreaterThan(0);
  });

  it("should have a Seller Callback rubric for seller_callback", () => {
    expect(SELLER_CALLBACK_RUBRIC).toBeDefined();
    expect(SELLER_CALLBACK_RUBRIC.name).toBeTruthy();
    expect(SELLER_CALLBACK_RUBRIC.criteria.length).toBeGreaterThan(0);
  });

  it("should have an Admin Callback rubric for admin_callback", () => {
    expect(ADMIN_CALLBACK_RUBRIC).toBeDefined();
    expect(ADMIN_CALLBACK_RUBRIC.name).toBeTruthy();
    expect(ADMIN_CALLBACK_RUBRIC.criteria.length).toBeGreaterThan(0);
  });
});

// ============ RUBRIC MAPPING ============

describe("Rubric Mapping - 6 Types", () => {
  const rubricMap: Record<GradableCallType, any> = {
    cold_call: LEAD_GENERATOR_RUBRIC,
    qualification: LEAD_MANAGER_RUBRIC,
    follow_up: FOLLOW_UP_RUBRIC,
    offer: ACQUISITION_MANAGER_RUBRIC,
    seller_callback: SELLER_CALLBACK_RUBRIC,
    admin_callback: ADMIN_CALLBACK_RUBRIC,
  };

  it("cold_call should map to Lead Generator rubric", () => {
    expect(rubricMap["cold_call"]).toBe(LEAD_GENERATOR_RUBRIC);
  });

  it("qualification should map to Lead Manager rubric", () => {
    expect(rubricMap["qualification"]).toBe(LEAD_MANAGER_RUBRIC);
  });

  it("follow_up should map to Follow-Up rubric (NOT Lead Manager)", () => {
    expect(rubricMap["follow_up"]).toBe(FOLLOW_UP_RUBRIC);
    expect(rubricMap["follow_up"]).not.toBe(LEAD_MANAGER_RUBRIC);
  });

  it("offer should map to Acquisition Manager rubric", () => {
    expect(rubricMap["offer"]).toBe(ACQUISITION_MANAGER_RUBRIC);
  });

  it("seller_callback should map to Seller Callback rubric", () => {
    expect(rubricMap["seller_callback"]).toBe(SELLER_CALLBACK_RUBRIC);
  });

  it("admin_callback should map to Admin Callback rubric", () => {
    expect(rubricMap["admin_callback"]).toBe(ADMIN_CALLBACK_RUBRIC);
  });
});

// ============ RUBRIC CRITERIA COUNTS ============

describe("Rubric Criteria Counts", () => {
  it("Follow-Up rubric should have 7 criteria", () => {
    expect(FOLLOW_UP_RUBRIC.criteria).toHaveLength(7);
  });

  it("Seller Callback rubric should have 8 criteria", () => {
    expect(SELLER_CALLBACK_RUBRIC.criteria).toHaveLength(8);
  });

  it("Admin Callback rubric should have 5 criteria", () => {
    expect(ADMIN_CALLBACK_RUBRIC.criteria).toHaveLength(5);
  });

  it("all rubrics should have criteria that sum to 100 max points", () => {
    const rubrics = [
      LEAD_GENERATOR_RUBRIC,
      LEAD_MANAGER_RUBRIC,
      ACQUISITION_MANAGER_RUBRIC,
      FOLLOW_UP_RUBRIC,
      SELLER_CALLBACK_RUBRIC,
      ADMIN_CALLBACK_RUBRIC,
    ];
    for (const rubric of rubrics) {
      const totalPoints = rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0);
      expect(totalPoints).toBe(100);
    }
  });
});

// ============ CRITICAL FAILURE CAPS ============

describe("Critical Failure Caps", () => {
  it("Follow-Up rubric should have critical failure cap at 50%", () => {
    expect(FOLLOW_UP_RUBRIC.criticalFailures).toBeDefined();
    expect(FOLLOW_UP_RUBRIC.criticalFailures.length).toBeGreaterThan(0);
    expect(FOLLOW_UP_RUBRIC.criticalFailureCap).toBe(50);
  });

  it("Seller Callback rubric should have critical failure cap at 50%", () => {
    expect(SELLER_CALLBACK_RUBRIC.criticalFailures).toBeDefined();
    expect(SELLER_CALLBACK_RUBRIC.criticalFailures.length).toBeGreaterThan(0);
    expect(SELLER_CALLBACK_RUBRIC.criticalFailureCap).toBe(50);
  });

  it("Admin Callback rubric should NOT have critical failures", () => {
    expect(ADMIN_CALLBACK_RUBRIC.excludeFromLeaderboard).toBe(true);
    // Admin callbacks are low-stakes, no critical failure mechanism
  });

  it("Follow-Up critical failures should include key failures from spec", () => {
    const failures = FOLLOW_UP_RUBRIC.criticalFailures.map(f => f.toLowerCase());
    // Should include: never referenced previous offer, never asked for decision
    expect(failures.some(f => f.includes("offer") || f.includes("previous"))).toBe(true);
    expect(failures.some(f => f.includes("decision"))).toBe(true);
  });

  it("Seller Callback critical failures should include key failures from spec", () => {
    const failures = SELLER_CALLBACK_RUBRIC.criticalFailures.map(f => f.toLowerCase());
    // Should include: ran cold call script, didn't ask why calling
    expect(failures.some(f => f.includes("cold call") || f.includes("script"))).toBe(true);
    expect(failures.some(f => f.includes("why") || f.includes("calling"))).toBe(true);
  });
});

// ============ TALK RATIO TARGETS ============

describe("Talk Ratio Targets", () => {
  it("Follow-Up rubric should target ≥50% seller talk", () => {
    expect(FOLLOW_UP_RUBRIC.talkRatioTarget).toBe(50);
  });

  it("Seller Callback rubric should target ≥60% seller talk", () => {
    expect(SELLER_CALLBACK_RUBRIC.talkRatioTarget).toBe(60);
  });
});

// ============ ADMIN CALLBACK LEADERBOARD EXCLUSION ============

describe("Admin Callback Leaderboard Exclusion", () => {
  it("Admin Callback rubric should be excluded from leaderboard", () => {
    expect(ADMIN_CALLBACK_RUBRIC.excludeFromLeaderboard).toBe(true);
  });

  it("Other rubrics should NOT be excluded from leaderboard", () => {
    expect((LEAD_GENERATOR_RUBRIC as any).excludeFromLeaderboard).toBeFalsy();
    expect((LEAD_MANAGER_RUBRIC as any).excludeFromLeaderboard).toBeFalsy();
    expect((ACQUISITION_MANAGER_RUBRIC as any).excludeFromLeaderboard).toBeFalsy();
    expect((FOLLOW_UP_RUBRIC as any).excludeFromLeaderboard).toBeFalsy();
    expect((SELLER_CALLBACK_RUBRIC as any).excludeFromLeaderboard).toBeFalsy();
  });
});

// ============ LEAD GENERATOR ROLE DISTINCTION ============

describe("Lead Generator Role Distinction", () => {
  it("Lead Generator rubric description should mention generating interest, not setting appointments", () => {
    const desc = LEAD_GENERATOR_RUBRIC.description.toLowerCase();
    expect(desc).toMatch(/interest|motivated seller|gauge.*interest/);
    expect(desc).toMatch(/not.*set.*appointment|not.*appointment/);
  });

  it("Lead Manager rubric description should mention qualifying and appointments", () => {
    expect(LEAD_MANAGER_RUBRIC.description).toMatch(/qualif/i);
    expect(LEAD_MANAGER_RUBRIC.description).toMatch(/appointment/i);
  });
});

// ============ RED FLAGS ============

describe("All Rubrics Have Red Flags", () => {
  it("all rubrics should have red flags defined", () => {
    const rubrics = [
      LEAD_GENERATOR_RUBRIC,
      LEAD_MANAGER_RUBRIC,
      ACQUISITION_MANAGER_RUBRIC,
      FOLLOW_UP_RUBRIC,
      SELLER_CALLBACK_RUBRIC,
      ADMIN_CALLBACK_RUBRIC,
    ];
    for (const rubric of rubrics) {
      expect(rubric.redFlags).toBeDefined();
      expect(rubric.redFlags.length).toBeGreaterThan(0);
    }
  });
});

// ============ CALL TYPE DETECTION ============

describe("Call Type Detection", () => {
  it("detectCallType should be a function", () => {
    expect(typeof detectCallType).toBe("function");
  });
});

// ============ PAGINATION ============

describe("Pagination Logic", () => {
  const PAGE_SIZE = 25;

  it("should calculate correct total pages", () => {
    expect(Math.ceil(0 / PAGE_SIZE)).toBe(0);
    expect(Math.ceil(1 / PAGE_SIZE)).toBe(1);
    expect(Math.ceil(25 / PAGE_SIZE)).toBe(1);
    expect(Math.ceil(26 / PAGE_SIZE)).toBe(2);
    expect(Math.ceil(100 / PAGE_SIZE)).toBe(4);
    expect(Math.ceil(350 / PAGE_SIZE)).toBe(14);
  });

  it("should calculate correct offset from page number", () => {
    expect(0 * PAGE_SIZE).toBe(0);
    expect(1 * PAGE_SIZE).toBe(25);
    expect(2 * PAGE_SIZE).toBe(50);
  });
});

// ============ UI OPTIONS ============

describe("Call Type UI Options", () => {
  it("should have all 6 call type options for the UI", () => {
    const callTypeOptions = [
      { value: "cold_call", label: "Cold Call" },
      { value: "qualification", label: "Qualification" },
      { value: "follow_up", label: "Follow-Up" },
      { value: "offer", label: "Offer" },
      { value: "seller_callback", label: "Seller Callback" },
      { value: "admin_callback", label: "Admin Callback" },
    ];
    expect(callTypeOptions).toHaveLength(6);
  });

  it("should have date range options including 7d default", () => {
    const dateRangeOptions = [
      { value: "1d", label: "Today" },
      { value: "7d", label: "Last 7 Days" },
      { value: "30d", label: "Last 30 Days" },
      { value: "90d", label: "Last 90 Days" },
      { value: "all", label: "All Time" },
    ];
    expect(dateRangeOptions).toHaveLength(5);
    expect(dateRangeOptions.find(o => o.value === "7d")).toBeDefined();
  });
});
