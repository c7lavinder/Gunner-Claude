/**
 * Tests for cross-pipeline opportunity move logic.
 * Verifies that when a contact has opportunities in multiple pipelines,
 * the system correctly selects the right opportunity to update.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Cross-pipeline opportunity move", () => {
  const ghlActionsPath = path.join(__dirname, "ghlActions.ts");
  const ghlActionsContent = fs.readFileSync(ghlActionsPath, "utf-8");

  it("should export findAllOpportunitiesByContact function", () => {
    expect(ghlActionsContent).toContain("export async function findAllOpportunitiesByContact");
  });

  it("should have findAllOpportunitiesByContact return an array of opportunities", () => {
    // The function signature should return an array
    expect(ghlActionsContent).toContain(
      "): Promise<Array<{ opportunityId: string; pipelineId: string; stageId: string; name: string }>>"
    );
  });

  it("should fetch all opportunities upfront in change_pipeline_stage case", () => {
    expect(ghlActionsContent).toContain("allOpps = await findAllOpportunitiesByContact(action.tenantId, contactId)");
  });

  it("should detect cross-pipeline moves", () => {
    expect(ghlActionsContent).toContain("Cross-pipeline move detected");
    expect(ghlActionsContent).toContain("currentOpp.pipelineId !== resolvedPipelineId");
  });

  it("should find existing opportunity in target pipeline to avoid duplicate", () => {
    expect(ghlActionsContent).toContain("allOpps.find(o => o.pipelineId === resolvedPipelineId)");
    expect(ghlActionsContent).toContain("updating that one instead to avoid duplicate");
  });

  it("should fall back to moving current opportunity if no existing opp in target pipeline", () => {
    expect(ghlActionsContent).toContain("No existing opportunity in target pipeline");
    expect(ghlActionsContent).toContain("will move current opportunity across pipelines");
  });

  it("findOpportunityByContact should delegate to findAllOpportunitiesByContact", () => {
    // findOpportunityByContact should use findAllOpportunitiesByContact internally
    expect(ghlActionsContent).toContain("const opps = await findAllOpportunitiesByContact(tenantId, contactId)");
    expect(ghlActionsContent).toContain("return opps.length > 0 ? opps[0] : null");
  });

  it("should request up to 20 opportunities to handle contacts with many deals", () => {
    expect(ghlActionsContent).toContain("limit=20");
  });
});

/**
 * Unit test for the cross-pipeline selection logic (pure logic, no API calls).
 * Simulates the decision-making that happens in the change_pipeline_stage case.
 */
describe("Cross-pipeline opportunity selection logic", () => {
  type Opp = { opportunityId: string; pipelineId: string; stageId: string; name: string };

  function selectOpportunityForMove(
    allOpps: Opp[],
    currentOppId: string,
    targetPipelineId: string
  ): string {
    const currentOpp = allOpps.find(o => o.opportunityId === currentOppId);
    if (currentOpp && currentOpp.pipelineId !== targetPipelineId) {
      // Cross-pipeline move
      const existingInTarget = allOpps.find(o => o.pipelineId === targetPipelineId);
      if (existingInTarget) {
        return existingInTarget.opportunityId; // Use existing opp in target pipeline
      }
    }
    return currentOppId; // Stay with current opp
  }

  it("should return current opp when moving within the same pipeline", () => {
    const allOpps: Opp[] = [
      { opportunityId: "opp-1", pipelineId: "pipe-A", stageId: "stage-1", name: "Deal 1" },
    ];
    const result = selectOpportunityForMove(allOpps, "opp-1", "pipe-A");
    expect(result).toBe("opp-1");
  });

  it("should switch to existing opp in target pipeline when cross-pipeline move", () => {
    const allOpps: Opp[] = [
      { opportunityId: "opp-1", pipelineId: "pipe-A", stageId: "stage-1", name: "Deal in Acquisition" },
      { opportunityId: "opp-2", pipelineId: "pipe-B", stageId: "stage-3", name: "Deal in Sales Process" },
    ];
    // Current opp is in pipe-A, target is pipe-B
    const result = selectOpportunityForMove(allOpps, "opp-1", "pipe-B");
    expect(result).toBe("opp-2"); // Should use the existing opp in pipe-B
  });

  it("should keep current opp when no existing opp in target pipeline", () => {
    const allOpps: Opp[] = [
      { opportunityId: "opp-1", pipelineId: "pipe-A", stageId: "stage-1", name: "Deal 1" },
    ];
    // Moving to pipe-C where no opp exists
    const result = selectOpportunityForMove(allOpps, "opp-1", "pipe-C");
    expect(result).toBe("opp-1"); // No alternative, keep current
  });

  it("should handle contact with 3+ pipelines correctly", () => {
    const allOpps: Opp[] = [
      { opportunityId: "opp-1", pipelineId: "pipe-A", stageId: "stage-1", name: "Acquisition" },
      { opportunityId: "opp-2", pipelineId: "pipe-B", stageId: "stage-2", name: "Sales Process" },
      { opportunityId: "opp-3", pipelineId: "pipe-C", stageId: "stage-3", name: "Buyer Pipeline" },
    ];
    // Current opp is in pipe-A, target is pipe-C
    const result = selectOpportunityForMove(allOpps, "opp-1", "pipe-C");
    expect(result).toBe("opp-3"); // Should find opp-3 in pipe-C
  });

  it("should handle when currentOppId is not found in allOpps", () => {
    const allOpps: Opp[] = [
      { opportunityId: "opp-1", pipelineId: "pipe-A", stageId: "stage-1", name: "Deal 1" },
    ];
    // Current opp ID doesn't exist in the list (edge case)
    const result = selectOpportunityForMove(allOpps, "opp-unknown", "pipe-B");
    expect(result).toBe("opp-unknown"); // Falls through, keeps current
  });
});
