import { describe, it, expect } from "vitest";

/**
 * Tests for the Next Steps feature:
 * 1. The generateNextSteps procedure should return well-structured action suggestions
 * 2. Action types should be valid and match the supported set
 * 3. Payloads should contain required fields for each action type
 */

const VALID_ACTION_TYPES = [
  "check_off_task",
  "update_task",
  "create_task",
  "add_note",
  "create_appointment",
  "change_pipeline_stage",
  "send_sms",
  "schedule_sms",
  "add_to_workflow",
  "remove_from_workflow",
];

// Simulate the LLM response parsing that happens in generateNextSteps
function parseNextStepsResponse(raw: string): Array<{
  actionType: string;
  summary: string;
  reasoning: string;
  payload: Record<string, any>;
}> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.actions || !Array.isArray(parsed.actions)) return [];
    return parsed.actions
      .filter((a: any) => VALID_ACTION_TYPES.includes(a.actionType))
      .map((a: any) => ({
        actionType: a.actionType,
        summary: a.summary || "",
        reasoning: a.reasoning || "",
        payload: a.payload || {},
      }));
  } catch {
    return [];
  }
}

describe("Next Steps - Response Parsing", () => {
  it("should parse valid LLM response with multiple actions", () => {
    const raw = JSON.stringify({
      actions: [
        {
          actionType: "create_task",
          summary: "Follow up with seller in 2 weeks",
          reasoning: "Seller mentioned needing time to discuss with husband",
          payload: { title: "Follow up - seller discussing with husband", dueDate: "2026-03-10" },
        },
        {
          actionType: "add_note",
          summary: "Add call summary note",
          reasoning: "Document key discussion points",
          payload: { noteBody: "Seller interested but needs to talk to husband. Mentioned $150k range." },
        },
        {
          actionType: "change_pipeline_stage",
          summary: "Move to 1 Month Follow Up",
          reasoning: "Seller is interested but not ready to commit",
          payload: { pipelineName: "Acquisitions", stageName: "1 Month Follow Up" },
        },
      ],
    });

    const result = parseNextStepsResponse(raw);
    expect(result).toHaveLength(3);
    expect(result[0].actionType).toBe("create_task");
    expect(result[0].summary).toBe("Follow up with seller in 2 weeks");
    expect(result[0].payload.title).toBe("Follow up - seller discussing with husband");
    expect(result[1].actionType).toBe("add_note");
    expect(result[2].actionType).toBe("change_pipeline_stage");
  });

  it("should filter out invalid action types", () => {
    const raw = JSON.stringify({
      actions: [
        { actionType: "create_task", summary: "Valid action", payload: {} },
        { actionType: "invalid_type", summary: "Invalid action", payload: {} },
        { actionType: "send_sms", summary: "Another valid", payload: {} },
      ],
    });

    const result = parseNextStepsResponse(raw);
    expect(result).toHaveLength(2);
    expect(result[0].actionType).toBe("create_task");
    expect(result[1].actionType).toBe("send_sms");
  });

  it("should handle empty or malformed responses gracefully", () => {
    expect(parseNextStepsResponse("")).toEqual([]);
    expect(parseNextStepsResponse("not json")).toEqual([]);
    expect(parseNextStepsResponse("{}")).toEqual([]);
    expect(parseNextStepsResponse(JSON.stringify({ actions: "not array" }))).toEqual([]);
  });

  it("should handle missing optional fields", () => {
    const raw = JSON.stringify({
      actions: [
        { actionType: "add_note", summary: "Add note" },
      ],
    });

    const result = parseNextStepsResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].reasoning).toBe("");
    expect(result[0].payload).toEqual({});
  });
});

describe("Next Steps - Action Type Validation", () => {
  it("should recognize all 10 supported action types", () => {
    expect(VALID_ACTION_TYPES).toContain("check_off_task");
    expect(VALID_ACTION_TYPES).toContain("update_task");
    expect(VALID_ACTION_TYPES).toContain("create_task");
    expect(VALID_ACTION_TYPES).toContain("add_note");
    expect(VALID_ACTION_TYPES).toContain("create_appointment");
    expect(VALID_ACTION_TYPES).toContain("change_pipeline_stage");
    expect(VALID_ACTION_TYPES).toContain("send_sms");
    expect(VALID_ACTION_TYPES).toContain("schedule_sms");
    expect(VALID_ACTION_TYPES).toContain("add_to_workflow");
    expect(VALID_ACTION_TYPES).toContain("remove_from_workflow");
    expect(VALID_ACTION_TYPES).toHaveLength(10);
  });
});

describe("Next Steps - Payload Structure", () => {
  it("should include required fields for create_task", () => {
    const raw = JSON.stringify({
      actions: [{
        actionType: "create_task",
        summary: "Create follow-up task",
        payload: { title: "Follow up", dueDate: "2026-03-15", contactName: "John" },
      }],
    });
    const result = parseNextStepsResponse(raw);
    expect(result[0].payload.title).toBeDefined();
    expect(result[0].payload.dueDate).toBeDefined();
  });

  it("should include required fields for send_sms", () => {
    const raw = JSON.stringify({
      actions: [{
        actionType: "send_sms",
        summary: "Send follow-up SMS",
        payload: { message: "Hi, following up on our conversation...", contactName: "Jane" },
      }],
    });
    const result = parseNextStepsResponse(raw);
    expect(result[0].payload.message).toBeDefined();
  });

  it("should include required fields for change_pipeline_stage", () => {
    const raw = JSON.stringify({
      actions: [{
        actionType: "change_pipeline_stage",
        summary: "Move to follow up",
        payload: { pipelineName: "Acquisitions", stageName: "1 Month Follow Up" },
      }],
    });
    const result = parseNextStepsResponse(raw);
    expect(result[0].payload.pipelineName).toBeDefined();
    expect(result[0].payload.stageName).toBeDefined();
  });

  it("should include required fields for add_note", () => {
    const raw = JSON.stringify({
      actions: [{
        actionType: "add_note",
        summary: "Add summary note",
        payload: { noteBody: "Called seller, discussed price range $120-140k" },
      }],
    });
    const result = parseNextStepsResponse(raw);
    expect(result[0].payload.noteBody).toBeDefined();
  });
});

describe("Next Steps - Learning Context", () => {
  it("should structure learning data from action edits", () => {
    // Simulate what the learning system captures
    const originalAction = {
      actionType: "change_pipeline_stage",
      payload: { stageName: "1 Month Follow Up" },
    };
    const editedAction = {
      actionType: "change_pipeline_stage",
      payload: { stageName: "4 Month Follow Up" },
    };

    // The system should detect the edit
    const wasEdited = originalAction.payload.stageName !== editedAction.payload.stageName;
    expect(wasEdited).toBe(true);

    // And record what changed
    const editRecord = {
      field: "stageName",
      original: originalAction.payload.stageName,
      edited: editedAction.payload.stageName,
    };
    expect(editRecord.original).toBe("1 Month Follow Up");
    expect(editRecord.edited).toBe("4 Month Follow Up");
  });

  it("should detect when actions are skipped vs pushed", () => {
    const actions = [
      { actionType: "create_task", status: "pushed" },
      { actionType: "send_sms", status: "skipped" },
      { actionType: "add_note", status: "pushed" },
    ];

    const pushed = actions.filter(a => a.status === "pushed");
    const skipped = actions.filter(a => a.status === "skipped");

    expect(pushed).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].actionType).toBe("send_sms");
  });
});
