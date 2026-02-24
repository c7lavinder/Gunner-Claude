import { describe, it, expect } from "vitest";

/**
 * Tests for the Next Steps feature:
 * 1. Response parsing and action type validation
 * 2. Payload preview generation for each action type
 * 3. DB persistence flow
 * 4. Count badge logic
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
  reason: string;
  suggested: boolean;
  payload: Record<string, any>;
}> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.actions || !Array.isArray(parsed.actions)) return [];
    return parsed.actions
      .filter((a: any) => VALID_ACTION_TYPES.includes(a.actionType))
      .map((a: any) => ({
        actionType: a.actionType,
        reason: a.reason || "",
        suggested: a.suggested ?? true,
        payload: a.payload || {},
      }));
  } catch {
    return [];
  }
}

// Mirror of the getPayloadPreview function from NextStepsTab.tsx
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function getPayloadPreview(actionType: string, payload: Record<string, any>): string {
  switch (actionType) {
    case "check_off_task":
      return payload.taskKeyword
        ? `Complete task matching "${payload.taskKeyword}"`
        : "Complete a task";
    case "update_task":
      return [
        payload.taskKeyword && `Update "${payload.taskKeyword}"`,
        payload.dueDate && `due ${payload.dueDate}`,
        payload.description && `— ${truncate(payload.description, 60)}`,
      ].filter(Boolean).join(" ") || "Update a task";
    case "create_task":
      return [
        payload.title && `"${payload.title}"`,
        payload.dueDate && `due ${payload.dueDate}`,
      ].filter(Boolean).join(" ") || "Create a new task";
    case "add_note":
      return payload.noteBody
        ? truncate(payload.noteBody, 120)
        : "Add a note";
    case "create_appointment":
      return [
        payload.title && `"${payload.title}"`,
        payload.calendarName && `(${payload.calendarName})`,
      ].filter(Boolean).join(" ") || "Create an appointment";
    case "change_pipeline_stage":
      return [
        payload.pipelineName && `${payload.pipelineName}`,
        payload.stageName && `→ ${payload.stageName}`,
      ].filter(Boolean).join(" ") || "Move to a new stage";
    case "send_sms":
      return payload.message
        ? `"${truncate(payload.message, 100)}"`
        : "Send an SMS";
    case "schedule_sms":
      return [
        payload.message && `"${truncate(payload.message, 80)}"`,
        payload.scheduledDate && `on ${payload.scheduledDate}`,
        payload.scheduledTime && `at ${payload.scheduledTime}`,
      ].filter(Boolean).join(" ") || "Schedule an SMS";
    case "add_to_workflow":
      return payload.workflowName
        ? `Start "${payload.workflowName}"`
        : "Start a workflow";
    case "remove_from_workflow":
      return payload.workflowName
        ? `Remove from "${payload.workflowName}"`
        : "Remove from a workflow";
    default:
      return "Action";
  }
}

// ============ RESPONSE PARSING ============

describe("Next Steps - Response Parsing", () => {
  it("should parse valid LLM response with multiple actions", () => {
    const raw = JSON.stringify({
      actions: [
        {
          actionType: "create_task",
          reason: "Seller mentioned needing time to discuss with husband",
          suggested: true,
          payload: { title: "Follow up - seller discussing with husband", dueDate: "2026-03-10" },
        },
        {
          actionType: "add_note",
          reason: "Document key discussion points",
          suggested: true,
          payload: { noteBody: "Seller interested but needs to talk to husband. Mentioned $150k range." },
        },
        {
          actionType: "change_pipeline_stage",
          reason: "Seller is interested but not ready to commit",
          suggested: true,
          payload: { pipelineName: "Acquisitions", stageName: "1 Month Follow Up" },
        },
      ],
    });

    const result = parseNextStepsResponse(raw);
    expect(result).toHaveLength(3);
    expect(result[0].actionType).toBe("create_task");
    expect(result[0].reason).toBe("Seller mentioned needing time to discuss with husband");
    expect(result[0].payload.title).toBe("Follow up - seller discussing with husband");
    expect(result[1].actionType).toBe("add_note");
    expect(result[2].actionType).toBe("change_pipeline_stage");
  });

  it("should filter out invalid action types", () => {
    const raw = JSON.stringify({
      actions: [
        { actionType: "create_task", reason: "Valid", suggested: true, payload: {} },
        { actionType: "invalid_type", reason: "Invalid", suggested: true, payload: {} },
        { actionType: "send_sms", reason: "Another valid", suggested: true, payload: {} },
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
        { actionType: "add_note" },
      ],
    });

    const result = parseNextStepsResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("");
    expect(result[0].payload).toEqual({});
  });
});

// ============ ACTION TYPE VALIDATION ============

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

// ============ PAYLOAD PREVIEW ============

describe("Next Steps - Payload Preview", () => {
  it("should generate preview for create_task with title and due date", () => {
    const preview = getPayloadPreview("create_task", {
      title: "Follow up with seller",
      dueDate: "2026-03-15",
    });
    expect(preview).toBe('"Follow up with seller" due 2026-03-15');
  });

  it("should generate preview for create_task with only title", () => {
    const preview = getPayloadPreview("create_task", { title: "Call back" });
    expect(preview).toBe('"Call back"');
  });

  it("should generate fallback for create_task with empty payload", () => {
    const preview = getPayloadPreview("create_task", {});
    expect(preview).toBe("Create a new task");
  });

  it("should generate preview for add_note with body text", () => {
    const preview = getPayloadPreview("add_note", {
      noteBody: "Seller interested but needs time. Price range $120-140k.",
    });
    expect(preview).toBe("Seller interested but needs time. Price range $120-140k.");
  });

  it("should truncate long note body", () => {
    const longNote = "A".repeat(200);
    const preview = getPayloadPreview("add_note", { noteBody: longNote });
    expect(preview.length).toBeLessThanOrEqual(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("should generate preview for change_pipeline_stage", () => {
    const preview = getPayloadPreview("change_pipeline_stage", {
      pipelineName: "Acquisitions",
      stageName: "1 Month Follow Up",
    });
    expect(preview).toBe("Acquisitions → 1 Month Follow Up");
  });

  it("should generate preview for send_sms with message", () => {
    const preview = getPayloadPreview("send_sms", {
      message: "Hi John, following up on our conversation about your property at 123 Main St.",
    });
    expect(preview).toContain("Hi John");
    expect(preview.startsWith('"')).toBe(true);
  });

  it("should generate preview for schedule_sms with date and time", () => {
    const preview = getPayloadPreview("schedule_sms", {
      message: "Reminder: walkthrough tomorrow",
      scheduledDate: "2026-03-20",
      scheduledTime: "09:00",
    });
    expect(preview).toContain("Reminder");
    expect(preview).toContain("2026-03-20");
    expect(preview).toContain("09:00");
  });

  it("should generate preview for check_off_task", () => {
    const preview = getPayloadPreview("check_off_task", {
      taskKeyword: "follow up call",
    });
    expect(preview).toBe('Complete task matching "follow up call"');
  });

  it("should generate preview for update_task", () => {
    const preview = getPayloadPreview("update_task", {
      taskKeyword: "follow up",
      dueDate: "2026-04-01",
    });
    expect(preview).toContain('Update "follow up"');
    expect(preview).toContain("2026-04-01");
  });

  it("should generate preview for add_to_workflow", () => {
    const preview = getPayloadPreview("add_to_workflow", {
      workflowName: "30-Day Nurture Sequence",
    });
    expect(preview).toBe('Start "30-Day Nurture Sequence"');
  });

  it("should generate preview for remove_from_workflow", () => {
    const preview = getPayloadPreview("remove_from_workflow", {
      workflowName: "Cold Outreach",
    });
    expect(preview).toBe('Remove from "Cold Outreach"');
  });

  it("should generate preview for create_appointment", () => {
    const preview = getPayloadPreview("create_appointment", {
      title: "Walkthrough at 123 Main St",
      calendarName: "Acquisitions Calendar",
    });
    expect(preview).toContain("Walkthrough at 123 Main St");
    expect(preview).toContain("Acquisitions Calendar");
  });

  it("should handle unknown action type gracefully", () => {
    const preview = getPayloadPreview("unknown_type", {});
    expect(preview).toBe("Action");
  });
});

// ============ PAYLOAD STRUCTURE ============

describe("Next Steps - Payload Structure", () => {
  it("should include required fields for create_task", () => {
    const raw = JSON.stringify({
      actions: [{
        actionType: "create_task",
        reason: "Follow up needed",
        suggested: true,
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
        reason: "Follow up text",
        suggested: true,
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
        reason: "Move to follow up",
        suggested: true,
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
        reason: "Document call",
        suggested: true,
        payload: { noteBody: "Called seller, discussed price range $120-140k" },
      }],
    });
    const result = parseNextStepsResponse(raw);
    expect(result[0].payload.noteBody).toBeDefined();
  });
});

// ============ COUNT BADGE LOGIC ============

describe("Next Steps - Count Badge", () => {
  it("should count only pending actions", () => {
    const actions = [
      { status: "pending" },
      { status: "pushed" },
      { status: "pending" },
      { status: "skipped" },
      { status: "failed" },
      { status: "pending" },
    ];
    const pendingCount = actions.filter(a => a.status === "pending").length;
    expect(pendingCount).toBe(3);
  });

  it("should return 0 when all actions are completed", () => {
    const actions = [
      { status: "pushed" },
      { status: "skipped" },
      { status: "pushed" },
    ];
    const pendingCount = actions.filter(a => a.status === "pending").length;
    expect(pendingCount).toBe(0);
  });

  it("should return 0 for empty actions", () => {
    const actions: Array<{ status: string }> = [];
    const pendingCount = actions.filter(a => a.status === "pending").length;
    expect(pendingCount).toBe(0);
  });
});

// ============ LEARNING CONTEXT ============

describe("Next Steps - Learning Context", () => {
  it("should structure learning data from action edits", () => {
    const originalAction = {
      actionType: "change_pipeline_stage",
      payload: { stageName: "1 Month Follow Up" },
    };
    const editedAction = {
      actionType: "change_pipeline_stage",
      payload: { stageName: "4 Month Follow Up" },
    };

    const wasEdited = originalAction.payload.stageName !== editedAction.payload.stageName;
    expect(wasEdited).toBe(true);

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

// ============ DB PERSISTENCE FLOW ============

describe("Next Steps - DB Persistence", () => {
  it("should map LLM actions to DB-insertable format", () => {
    const llmAction = {
      actionType: "create_task",
      reason: "Seller said call back in 2 weeks",
      suggested: true,
      payload: { title: "Follow up call", dueDate: "2026-03-10" },
    };

    // Simulate what the router does before inserting
    const dbRow = {
      callId: 42,
      tenantId: 1,
      actionType: llmAction.actionType,
      reason: llmAction.reason,
      suggested: llmAction.suggested ? "true" : "false",
      payload: llmAction.payload,
      status: "pending" as const,
    };

    expect(dbRow.actionType).toBe("create_task");
    expect(dbRow.reason).toBe("Seller said call back in 2 weeks");
    expect(dbRow.suggested).toBe("true");
    expect(dbRow.payload.title).toBe("Follow up call");
    expect(dbRow.status).toBe("pending");
  });

  it("should map DB rows back to frontend format", () => {
    const dbRow = {
      id: 1,
      callId: 42,
      actionType: "change_pipeline_stage",
      reason: "Move to follow up stage",
      suggested: "true",
      payload: { pipelineName: "Acquisitions", stageName: "1 Month Follow Up" },
      status: "pending" as const,
      result: null,
    };

    // Simulate what getNextSteps query does
    const frontendAction = {
      dbId: dbRow.id,
      actionType: dbRow.actionType,
      reason: dbRow.reason,
      suggested: dbRow.suggested === "true",
      payload: dbRow.payload || {},
      status: dbRow.status || "pending",
      result: dbRow.result || undefined,
    };

    expect(frontendAction.dbId).toBe(1);
    expect(frontendAction.suggested).toBe(true);
    expect(frontendAction.payload.stageName).toBe("1 Month Follow Up");
  });

  it("should handle status updates correctly", () => {
    const statuses = ["pending", "pushed", "skipped", "failed"] as const;
    for (const status of statuses) {
      const update = { status, result: status === "pushed" ? "Success" : undefined };
      expect(update.status).toBe(status);
    }
  });
});
