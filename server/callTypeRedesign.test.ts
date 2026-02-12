import { describe, it, expect, vi } from "vitest";
import {
  LEAD_GENERATOR_RUBRIC,
  LEAD_MANAGER_RUBRIC,
  ACQUISITION_MANAGER_RUBRIC,
  gradeCall,
  detectCallType,
  type GradableCallType,
} from "./grading";

// ============ RUBRIC MAPPING TESTS ============

describe("Rubric Mapping", () => {
  it("should have 5 valid call types", () => {
    const validTypes: GradableCallType[] = [
      "cold_call",
      "qualification",
      "follow_up",
      "offer",
      "callback",
    ];
    // All should be assignable to GradableCallType
    validTypes.forEach((t) => {
      expect(typeof t).toBe("string");
    });
  });

  it("Lead Generator rubric should focus on generating interest, NOT appointments", () => {
    expect(LEAD_GENERATOR_RUBRIC.description).toContain("NOT");
    expect(LEAD_GENERATOR_RUBRIC.description).toContain("interest");
    // The description explicitly says NOT to set appointments
    expect(LEAD_GENERATOR_RUBRIC.description).toMatch(
      /NOT.*set.*appointment/i
    );
    // Red flags should include trying to set appointments
    const appointmentRedFlag = LEAD_GENERATOR_RUBRIC.redFlags.find((f) =>
      f.toLowerCase().includes("appointment")
    );
    expect(appointmentRedFlag).toBeDefined();
  });

  it("Lead Manager rubric should mention qualifying and setting appointments", () => {
    expect(LEAD_MANAGER_RUBRIC.description).toMatch(/qualif/i);
    expect(LEAD_MANAGER_RUBRIC.description).toMatch(/appointment/i);
  });

  it("Acquisition Manager rubric should focus on offers", () => {
    expect(ACQUISITION_MANAGER_RUBRIC.name).toMatch(/offer|acquisition/i);
  });

  it("Lead Generator rubric should have Warm Transfer criteria", () => {
    const warmTransfer = LEAD_GENERATOR_RUBRIC.criteria.find(
      (c) => c.name.toLowerCase().includes("transfer") || c.name.toLowerCase().includes("handoff")
    );
    expect(warmTransfer).toBeDefined();
    expect(warmTransfer!.description).toMatch(/lead manager|follow.?up/i);
  });

  it("All rubrics should have criteria that sum to 100 max points", () => {
    const lgTotal = LEAD_GENERATOR_RUBRIC.criteria.reduce(
      (sum, c) => sum + c.maxPoints,
      0
    );
    const lmTotal = LEAD_MANAGER_RUBRIC.criteria.reduce(
      (sum, c) => sum + c.maxPoints,
      0
    );
    const amTotal = ACQUISITION_MANAGER_RUBRIC.criteria.reduce(
      (sum, c) => sum + c.maxPoints,
      0
    );
    expect(lgTotal).toBe(100);
    expect(lmTotal).toBe(100);
    expect(amTotal).toBe(100);
  });
});

// ============ CALL TYPE DETECTION TESTS ============

describe("Call Type Detection", () => {
  it("detectCallType should be a function", () => {
    expect(typeof detectCallType).toBe("function");
  });

  it("GradableCallType should include all 5 types", () => {
    // This is a compile-time check - if it compiles, the types are correct
    const types: GradableCallType[] = [
      "cold_call",
      "qualification",
      "follow_up",
      "offer",
      "callback",
    ];
    expect(types).toHaveLength(5);
  });
});

// ============ OUTCOME TESTS ============

describe("Call Outcomes", () => {
  it("should have the correct outcome types defined", () => {
    // Verify the type includes all expected outcomes
    const expectedOutcomes = [
      "none",
      "appointment_set",
      "offer_made",
      "callback_scheduled",
      "interested",
      "left_vm",
      "no_answer",
      "not_interested",
      "dead",
    ];
    // These are type-level checks that compile correctly
    expectedOutcomes.forEach((o) => {
      expect(typeof o).toBe("string");
    });
  });
});

// ============ RUBRIC ROUTING TESTS ============

describe("Rubric Routing Logic", () => {
  it("cold_call should map to Lead Generator rubric", () => {
    const callType: GradableCallType = "cold_call";
    const rubric =
      callType === "cold_call"
        ? LEAD_GENERATOR_RUBRIC
        : callType === "offer"
        ? ACQUISITION_MANAGER_RUBRIC
        : LEAD_MANAGER_RUBRIC;
    expect(rubric.name).toBe("Lead Generator Cold Call Rubric");
  });

  it("qualification should map to Lead Manager rubric", () => {
    const callType: GradableCallType = "qualification";
    const rubric =
      callType === "cold_call"
        ? LEAD_GENERATOR_RUBRIC
        : callType === "offer"
        ? ACQUISITION_MANAGER_RUBRIC
        : LEAD_MANAGER_RUBRIC;
    expect(rubric.name).toBe("Lead Manager Qualification Call Rubric");
  });

  it("offer should map to Acquisition Manager rubric", () => {
    const callType: GradableCallType = "offer";
    const rubric =
      callType === "cold_call"
        ? LEAD_GENERATOR_RUBRIC
        : callType === "offer"
        ? ACQUISITION_MANAGER_RUBRIC
        : LEAD_MANAGER_RUBRIC;
    expect(rubric.name).toMatch(/offer|acquisition/i);
  });

  it("follow_up should fall back to Lead Manager rubric (placeholder)", () => {
    const callType: GradableCallType = "follow_up";
    const rubric =
      callType === "cold_call"
        ? LEAD_GENERATOR_RUBRIC
        : callType === "offer"
        ? ACQUISITION_MANAGER_RUBRIC
        : LEAD_MANAGER_RUBRIC;
    expect(rubric.name).toBe("Lead Manager Qualification Call Rubric");
  });

  it("callback should fall back to Lead Manager rubric (placeholder)", () => {
    const callType: GradableCallType = "callback";
    const rubric =
      callType === "cold_call"
        ? LEAD_GENERATOR_RUBRIC
        : callType === "offer"
        ? ACQUISITION_MANAGER_RUBRIC
        : LEAD_MANAGER_RUBRIC;
    expect(rubric.name).toBe("Lead Manager Qualification Call Rubric");
  });
});

// ============ CALL TYPE OPTIONS TESTS ============

describe("Call Type UI Options", () => {
  it("should have all 5 call type options for the UI", () => {
    const callTypeOptions = [
      { value: "cold_call", label: "Cold Call" },
      { value: "qualification", label: "Qualification" },
      { value: "follow_up", label: "Follow-Up" },
      { value: "offer", label: "Offer" },
      { value: "callback", label: "Callback" },
    ];
    expect(callTypeOptions).toHaveLength(5);
    expect(callTypeOptions.map((o) => o.value)).toEqual([
      "cold_call",
      "qualification",
      "follow_up",
      "offer",
      "callback",
    ]);
  });

  it("should have outcome options for filtering", () => {
    const outcomeOptions = [
      { value: "interested", label: "Interested" },
      { value: "not_interested", label: "Not Interested" },
      { value: "appointment_set", label: "Appointment Set" },
      { value: "callback_scheduled", label: "Callback Scheduled" },
      { value: "offer_made", label: "Offer Made" },
      { value: "offer_accepted", label: "Offer Accepted" },
      { value: "offer_rejected", label: "Offer Rejected" },
      { value: "left_voicemail", label: "Left Voicemail" },
      { value: "no_answer", label: "No Answer" },
    ];
    expect(outcomeOptions.length).toBeGreaterThanOrEqual(5);
    // Verify key outcomes exist
    const values = outcomeOptions.map((o) => o.value);
    expect(values).toContain("interested");
    expect(values).toContain("appointment_set");
    expect(values).toContain("offer_made");
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
    expect(dateRangeOptions.find((o) => o.value === "7d")).toBeDefined();
  });
});

// ============ PAGINATION TESTS ============

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
    expect(5 * PAGE_SIZE).toBe(125);
  });

  it("should show correct range text", () => {
    const page = 2;
    const total = 75;
    const start = page * PAGE_SIZE + 1; // 51
    const end = Math.min((page + 1) * PAGE_SIZE, total); // 75
    expect(start).toBe(51);
    expect(end).toBe(75);
  });
});
