import { describe, it, expect } from "vitest";
import { resolveStageByName } from "./ghlActions";

// Realistic GHL pipeline stages with abbreviations and parenthetical numbers
const mockPipelines = [
  {
    id: "pipeline_sales",
    name: "Sales Process",
    stages: [
      { id: "stage_new", name: "New Lead" },
      { id: "stage_qualified", name: "Qualified" },
      { id: "stage_pending", name: "Pending Apt(3)" },
      { id: "stage_offer", name: "Offer Sched" },
      { id: "stage_contract", name: "Under Contract" },
      { id: "stage_closed", name: "Closed Won" },
      { id: "stage_dq", name: "DQ'd" },
      { id: "stage_fup", name: "Follow Up(2)" },
    ],
  },
  {
    id: "pipeline_dispo",
    name: "Dispo Pipeline",
    stages: [
      { id: "dispo_new", name: "New Deal" },
      { id: "dispo_marketed", name: "Marketed" },
      { id: "dispo_assigned", name: "Assigned to Buyer" },
      { id: "dispo_insp", name: "Prop Insp" },
      { id: "dispo_closed", name: "Closed" },
    ],
  },
];

describe("resolveStageByName - Daniel's exact scenarios", () => {
  it("'pending appointment' matches 'Pending Apt(3)'", () => {
    const result = resolveStageByName(mockPipelines, "pending appointment");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
    expect(result!.stageName).toBe("Pending Apt(3)");
  });

  it("'pending Apt stage' matches 'Pending Apt(3)'", () => {
    const result = resolveStageByName(mockPipelines, "pending Apt stage");
    // Should still match since "pending" and "apt" match
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
  });

  it("'pending appointment stage' matches 'Pending Apt(3)'", () => {
    const result = resolveStageByName(mockPipelines, "pending appointment stage");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
  });

  it("'Pending Apt' exact abbreviation matches 'Pending Apt(3)'", () => {
    const result = resolveStageByName(mockPipelines, "Pending Apt");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
  });
});

describe("resolveStageByName - Parenthetical stripping", () => {
  it("strips (3) from 'Pending Apt(3)' for matching", () => {
    const result = resolveStageByName(mockPipelines, "pending apt");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
  });

  it("strips (2) from 'Follow Up(2)' for matching", () => {
    const result = resolveStageByName(mockPipelines, "follow up");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_fup");
  });

  it("'followup' matches 'Follow Up(2)' via abbreviation", () => {
    const result = resolveStageByName(mockPipelines, "followup");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_fup");
  });
});

describe("resolveStageByName - Abbreviation expansion", () => {
  it("'offer scheduled' matches 'Offer Sched'", () => {
    const result = resolveStageByName(mockPipelines, "offer scheduled");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_offer");
  });

  it("'disqualified' matches 'DQ'd'", () => {
    const result = resolveStageByName(mockPipelines, "disqualified");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_dq");
  });

  it("'property inspection' matches 'Prop Insp'", () => {
    const result = resolveStageByName(mockPipelines, "property inspection");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("dispo_insp");
  });
});

describe("resolveStageByName - Exact matches still work", () => {
  it("exact match on 'New Lead'", () => {
    const result = resolveStageByName(mockPipelines, "New Lead");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_new");
  });

  it("exact match on 'Qualified'", () => {
    const result = resolveStageByName(mockPipelines, "Qualified");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_qualified");
  });

  it("exact match on 'Under Contract'", () => {
    const result = resolveStageByName(mockPipelines, "under contract");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_contract");
  });
});

describe("resolveStageByName - Pipeline filtering", () => {
  it("'Closed' in Sales pipeline matches 'Closed Won'", () => {
    const result = resolveStageByName(mockPipelines, "Closed", "Sales");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_closed");
    expect(result!.pipelineId).toBe("pipeline_sales");
  });

  it("'Closed' in Dispo pipeline matches 'Closed'", () => {
    const result = resolveStageByName(mockPipelines, "Closed", "Dispo");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("dispo_closed");
    expect(result!.pipelineId).toBe("pipeline_dispo");
  });
});

describe("resolveStageByName - Fuzzy pipeline name matching (Daniel's bug)", () => {
  it("'sales pipeline' matches pipeline 'Sales Process' (word overlap)", () => {
    const result = resolveStageByName(mockPipelines, "pending apt", "sales pipeline");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
    expect(result!.pipelineId).toBe("pipeline_sales");
  });

  it("'pending appointment' with 'sales pipeline' matches 'Pending Apt(3)' in 'Sales Process'", () => {
    const result = resolveStageByName(mockPipelines, "pending appointment", "sales pipeline");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
    expect(result!.pipelineId).toBe("pipeline_sales");
  });

  it("'dispo' matches pipeline 'Dispo Pipeline'", () => {
    const result = resolveStageByName(mockPipelines, "New Deal", "dispo");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("dispo_new");
    expect(result!.pipelineId).toBe("pipeline_dispo");
  });

  it("completely wrong pipeline name falls back to all pipelines", () => {
    const result = resolveStageByName(mockPipelines, "New Lead", "nonexistent pipeline");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_new");
  });

  it("'sales' alone matches 'Sales Process'", () => {
    const result = resolveStageByName(mockPipelines, "Qualified", "sales");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_qualified");
    expect(result!.pipelineId).toBe("pipeline_sales");
  });
});

describe("resolveStageByName - Edge cases", () => {
  it("returns null for non-existent stage", () => {
    const result = resolveStageByName(mockPipelines, "nonexistent stage");
    expect(result).toBeNull();
  });

  it("returns null for empty pipelines", () => {
    const result = resolveStageByName([], "Pending Appointment");
    expect(result).toBeNull();
  });

  it("handles extra whitespace", () => {
    const result = resolveStageByName(mockPipelines, "  pending  appointment  ");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
  });

  it("case insensitive matching", () => {
    const result = resolveStageByName(mockPipelines, "PENDING APT");
    expect(result).not.toBeNull();
    expect(result!.stageId).toBe("stage_pending");
  });
});
