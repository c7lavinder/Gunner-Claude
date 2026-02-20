import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

/**
 * Tests for new AI Coach actions:
 * 1. update_task - Update existing task (due date, title, status)
 * 2. add_to_workflow / remove_from_workflow - Workflow management
 * 3. SMS sender display - Show which user's line the SMS sends from
 */

describe("update_task backend implementation", () => {
  it("should export getTasksForContact function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function getTasksForContact");
  });

  it("should export updateTask function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function updateTask");
  });

  it("should handle update_task case in executeAction switch", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('case "update_task"');
  });

  it("should search for matching task by title keyword", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // The update_task case should fetch tasks and find a match
    expect(ghlActionsSource).toContain("getTasksForContact");
  });

  it("should call updateTask with the matched task ID", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("updateTask(action.tenantId");
  });

  it("getTasksForContact should use GHL contacts tasks endpoint", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should use the contacts/{contactId}/tasks endpoint
    expect(ghlActionsSource).toContain("/contacts/${contactId}/tasks");
  });

  it("updateTask should use GHL contacts tasks endpoint with PUT", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should use PUT to update the task
    expect(ghlActionsSource).toContain("/contacts/${contactId}/tasks/${taskId}");
    expect(ghlActionsSource).toContain('"PUT"');
  });
});

describe("workflow backend implementation", () => {
  it("should export addContactToWorkflow function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function addContactToWorkflow");
  });

  it("should export removeContactFromWorkflow function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function removeContactFromWorkflow");
  });

  it("should handle add_to_workflow case in executeAction", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('case "add_to_workflow"');
  });

  it("should handle remove_from_workflow case in executeAction", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('case "remove_from_workflow"');
  });

  it("should use GHL contacts workflow endpoint", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("/contacts/${contactId}/workflow/${workflowId}");
  });
});

describe("update_task in parseIntent LLM prompt", () => {
  it("should include update_task in available action types", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("update_task - Update an existing task");
  });

  it("should include update_task examples in conversational patterns", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("Move the pending task for John to due on Monday");
    expect(routersSource).toContain("Change the task due date");
  });

  it("should include update_task instructions for params", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("For update_task:");
    expect(routersSource).toContain("params.taskStatus");
  });

  it("should include workflowName and taskStatus in JSON schema", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain('workflowName: { type: "string" }');
    expect(routersSource).toContain('taskStatus: { type: "string" }');
  });

  it("should include update_task in VALID_ACTION_TYPES for parseIntent", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    // There should be at least one VALID_ACTION_TYPES array that includes update_task
    expect(routersSource).toContain('"update_task"');
  });

  it("should include workflow actions in VALID_ACTION_TYPES", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain('"add_to_workflow"');
    expect(routersSource).toContain('"remove_from_workflow"');
  });
});

describe("update_task in createPending validation", () => {
  it("should include update_task in createPending VALID_ACTION_TYPES", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    // The createPending procedure should accept update_task
    const createPendingSection = routersSource.substring(
      routersSource.indexOf("createPending:"),
      routersSource.indexOf("confirmAndExecute:")
    );
    expect(createPendingSection).toContain("update_task");
  });

  it("should include workflow actions in createPending VALID_ACTION_TYPES", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const createPendingSection = routersSource.substring(
      routersSource.indexOf("createPending:"),
      routersSource.indexOf("confirmAndExecute:")
    );
    expect(createPendingSection).toContain("add_to_workflow");
    expect(createPendingSection).toContain("remove_from_workflow");
  });
});

describe("frontend action card updates", () => {
  it("should include update_task in ACTION_TYPE_LABELS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('update_task: "Update Task"');
  });

  it("should include workflow actions in ACTION_TYPE_LABELS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('add_to_workflow: "Add to Workflow"');
    expect(callInboxSource).toContain('remove_from_workflow: "Remove from Workflow"');
  });

  it("should include update_task in ACTION_ICONS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("update_task:");
  });

  it("should include workflow actions in ACTION_ICONS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("add_to_workflow:");
    expect(callInboxSource).toContain("remove_from_workflow:");
  });

  it("should display SMS sender info on pending SMS cards", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("Sending from:");
    expect(callInboxSource).toContain("currentUser?.name");
    expect(callInboxSource).toContain("'s line");
  });

  it("should display update_task details (due date, status)", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("New due date:");
    expect(callInboxSource).toContain("msg.payload.taskStatus");
  });

  it("should display workflow name for workflow action cards", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("msg.payload.workflowName");
    expect(callInboxSource).toContain('msg.actionType === "add_to_workflow"');
  });
});

describe("SMS sender routing verification", () => {
  it("should resolve requesting user GHL ID before sending SMS", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // executeAction should resolve the requesting user's GHL ID
    expect(ghlActionsSource).toContain("requestingUserGhlId");
    expect(ghlActionsSource).toContain("getTeamMemberByUserId(action.requestedBy)");
  });

  it("should log SMS sender details for debugging", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should have logging for SMS routing
    expect(ghlActionsSource).toContain("[GHLActions] SMS action:");
    expect(ghlActionsSource).toContain("[sendSms] Sending SMS");
  });

  it("should pass requestingUserGhlId (not opportunity assignee) to sendSms", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // The SMS case should use requestingUserGhlId, not any opportunity-based ID
    expect(ghlActionsSource).toContain("sendSms(action.tenantId, contactId, payload.message, requestingUserGhlId)");
  });
});

describe("schema update for new action types", () => {
  it("should include update_task in the actionType enum", async () => {
    const schemaSource = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schemaSource).toContain('"update_task"');
  });

  it("should include add_to_workflow in the actionType enum", async () => {
    const schemaSource = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schemaSource).toContain('"add_to_workflow"');
  });

  it("should include remove_from_workflow in the actionType enum", async () => {
    const schemaSource = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schemaSource).toContain('"remove_from_workflow"');
  });
});

describe("conversational feedback routing fix", () => {
  it("parseIntent prompt should instruct LLM to return empty actions for feedback messages", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("CONVERSATIONAL MESSAGES ARE NOT ACTIONS");
    expect(routersSource).toContain("That was not sent from my number");
    expect(routersSource).toContain("return an empty actions array");
  });

  it("Q&A coach prompt should distinguish conversational feedback from CRM actions", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("CONVERSATIONAL FEEDBACK vs CRM ACTIONS");
    expect(routersSource).toContain("Do NOT use [ACTION_REDIRECT] for these types of messages");
  });

  it("streaming coach prompt should also have conversational feedback rules", async () => {
    const coachStreamSource = readFileSync(join(SERVER_DIR, "coachStream.ts"), "utf-8");
    expect(coachStreamSource).toContain("CONVERSATIONAL FEEDBACK vs CRM ACTIONS");
    expect(coachStreamSource).toContain("Do NOT use [ACTION_REDIRECT] for these types of messages");
  });

  it("frontend should fall through to Q&A coach when ACTION_REDIRECT returns empty actions", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    // The streaming path should call streamCoachQuestion when ACTION_REDIRECT returns empty
    expect(callInboxSource).toContain("parseIntent returned empty after ACTION_REDIRECT");
    expect(callInboxSource).toContain("streamCoachQuestion(userMessage, chatHistory)");
  });
});
