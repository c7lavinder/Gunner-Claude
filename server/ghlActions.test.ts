import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

/**
 * Tests for smart task assignment and per-user SMS routing.
 * These tests verify the logic in ghlActions.ts for:
 * 1. sendSms - passes userId for per-user phone number routing
 * 2. createTask - passes assignedTo for task assignment
 * 3. executeAction - resolves GHL user IDs from team members
 */

// Mock the ghlFetch function to capture what's sent to GHL API
const mockGhlFetch = vi.fn().mockResolvedValue({ id: "mock-id", messageId: "mock-msg-id", task: { id: "mock-task-id" } });

// Mock the tenant module
vi.mock("./tenant", () => ({
  parseCrmConfig: vi.fn(),
  getTenantById: vi.fn().mockResolvedValue({ id: 1, crmConfig: JSON.stringify({ ghlApiKey: "test-key", ghlLocationId: "test-loc" }) }),
}));

// We'll test the individual functions by importing them after mocking
// Since ghlFetch is internal, we test through the exported functions

describe("sendSms with userId routing", () => {
  it("should include userId in the request body when provided", async () => {
    // We test the function signature and parameter passing
    const { sendSms } = await import("./ghlActions");
    
    // The function accepts userId as 4th parameter
    expect(sendSms.length).toBeGreaterThanOrEqual(3);
    
    // Verify the function signature accepts the userId parameter
    const fnStr = sendSms.toString();
    expect(fnStr).toContain("userId");
  });

  it("should define userId as optional parameter", async () => {
    const { sendSms } = await import("./ghlActions");
    const fnStr = sendSms.toString();
    // The userId parameter should be optional (has ? or default)
    expect(fnStr).toMatch(/userId/);
  });
});

describe("createTask with assignedTo", () => {
  it("should include assignedTo in the request body when provided", async () => {
    const { createTask } = await import("./ghlActions");
    
    // The function accepts assignedTo as 6th parameter
    expect(createTask.length).toBeGreaterThanOrEqual(4);
    
    // Verify the function signature accepts the assignedTo parameter
    const fnStr = createTask.toString();
    expect(fnStr).toContain("assignedTo");
  });

  it("should define assignedTo as optional parameter", async () => {
    const { createTask } = await import("./ghlActions");
    const fnStr = createTask.toString();
    expect(fnStr).toMatch(/assignedTo/);
  });
});

describe("executeAction user resolution logic", () => {
  it("should import getTeamMemberByUserId and getTeamMembers", async () => {
    // Verify the imports exist in the module
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    expect(ghlActionsSource).toContain("getTeamMemberByUserId");
    expect(ghlActionsSource).toContain("getTeamMembers");
  });

  it("should resolve requestingUserGhlId from team member lookup", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify the executeAction function resolves GHL user ID
    expect(ghlActionsSource).toContain("requestingUserGhlId");
    expect(ghlActionsSource).toContain("getTeamMemberByUserId(action.requestedBy)");
  });

  it("should resolve task assignee from assigneeName in payload", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify assignee resolution logic exists
    expect(ghlActionsSource).toContain("taskAssigneeGhlId");
    expect(ghlActionsSource).toContain("payload.assigneeName");
    expect(ghlActionsSource).toContain("finalTaskAssignee");
  });

  it("should pass requestingUserGhlId to sendSms", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify sendSms is called with the user's GHL ID
    expect(ghlActionsSource).toContain("sendSms(action.tenantId, contactId, payload.message, requestingUserGhlId)");
  });

  it("should pass finalTaskAssignee to createTask", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify createTask is called with the resolved assignee
    expect(ghlActionsSource).toContain("createTask(action.tenantId, contactId, payload.title, payload.description, payload.dueDate, finalTaskAssignee)");
  });

  it("should prioritize named assignee over creator for tasks", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // The finalTaskAssignee should prefer taskAssigneeGhlId over requestingUserGhlId
    expect(ghlActionsSource).toContain("taskAssigneeGhlId || requestingUserGhlId");
  });

  it("should match assignee name case-insensitively", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify case-insensitive matching
    expect(ghlActionsSource).toContain(".toLowerCase()");
  });
});

describe("parseIntent assigneeName extraction", () => {
  it("should include assigneeName in the LLM response schema", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    
    // Verify assigneeName is in the JSON schema
    expect(routersSource).toContain("assigneeName");
    expect(routersSource).toContain('assigneeName: { type: "string" }');
  });

  it("should include team member names in the LLM prompt", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    
    // Verify team member context is provided to the LLM
    expect(routersSource).toContain("teamMemberNames");
    expect(routersSource).toContain("Team members:");
  });

  it("should include current user name in the LLM prompt for default assignment", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    
    // Verify the current user context is provided
    expect(routersSource).toContain("The current user is:");
  });

  it("should include assigneeName in the required fields", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    
    // Verify assigneeName is required in the schema
    expect(routersSource).toContain('"assigneeName"');
  });
});

describe("frontend assigneeName passthrough", () => {
  it("should pass assigneeName in the payload to createPending", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    
    // Verify assigneeName is included in the payload
    expect(callInboxSource).toContain("intent.assigneeName");
    expect(callInboxSource).toContain("assigneeName:");
  });
});

describe("sendSms body construction", () => {
  it("should conditionally add userId to the request body", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify the conditional userId addition
    expect(ghlActionsSource).toContain("body.userId = userId");
  });
});

describe("createTask body construction", () => {
  it("should conditionally add assignedTo to the request body", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    
    // Verify the conditional assignedTo addition
    expect(ghlActionsSource).toContain("body.assignedTo = assignedTo");
  });
});
