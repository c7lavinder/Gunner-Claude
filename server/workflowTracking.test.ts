import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

// ─── Backend: Workflow enrollment tracking via Task Center UI ───

describe("Workflow Tracking — Backend startWorkflow logs to coach_action_log", () => {
  const routerSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  // Extract the startWorkflow block
  const startWorkflowBlock = routerSource.substring(
    routerSource.indexOf("// Start a workflow for a contact"),
    routerSource.indexOf("// Get available workflows for the tenant")
  );

  it("startWorkflow accepts optional workflowName parameter", () => {
    expect(startWorkflowBlock).toContain("workflowName: z.string().optional()");
  });

  it("startWorkflow accepts optional contactName parameter", () => {
    expect(startWorkflowBlock).toContain("contactName: z.string().optional()");
  });

  it("startWorkflow inserts into coachActionLog after GHL API call", () => {
    expect(startWorkflowBlock).toContain("db.insert(coachActionLog)");
  });

  it("startWorkflow logs with actionType add_to_workflow", () => {
    expect(startWorkflowBlock).toContain('actionType: "add_to_workflow"');
  });

  it("startWorkflow logs with status executed", () => {
    expect(startWorkflowBlock).toContain('status: "executed"');
  });

  it("startWorkflow includes workflowId and workflowName in payload", () => {
    expect(startWorkflowBlock).toContain("workflowId: input.workflowId");
    expect(startWorkflowBlock).toContain("workflowName: input.workflowName");
  });

  it("startWorkflow sets targetContactId from input", () => {
    expect(startWorkflowBlock).toContain("targetContactId: input.contactId");
  });

  it("startWorkflow does not fail the mutation if logging fails", () => {
    // The logging is wrapped in try/catch and the error is only logged
    expect(startWorkflowBlock).toContain("catch (logErr)");
    expect(startWorkflowBlock).toContain("Failed to log workflow enrollment");
  });
});

describe("Workflow Tracking — Backend removeFromWorkflow logs to coach_action_log", () => {
  const routerSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  // Extract the removeFromWorkflow block
  const removeBlock = routerSource.substring(
    routerSource.indexOf("// Remove contact from a workflow"),
    routerSource.indexOf("// Get available calendars for the tenant")
  );

  it("removeFromWorkflow accepts optional workflowName parameter", () => {
    expect(removeBlock).toContain("workflowName: z.string().optional()");
  });

  it("removeFromWorkflow accepts optional contactName parameter", () => {
    expect(removeBlock).toContain("contactName: z.string().optional()");
  });

  it("removeFromWorkflow inserts into coachActionLog after GHL API call", () => {
    expect(removeBlock).toContain("db.insert(coachActionLog)");
  });

  it("removeFromWorkflow logs with actionType remove_from_workflow", () => {
    expect(removeBlock).toContain('actionType: "remove_from_workflow"');
  });

  it("removeFromWorkflow logs with status executed", () => {
    expect(removeBlock).toContain('status: "executed"');
  });

  it("removeFromWorkflow includes workflowId and workflowName in payload", () => {
    expect(removeBlock).toContain("workflowId: input.workflowId");
    expect(removeBlock).toContain("workflowName: input.workflowName");
  });

  it("removeFromWorkflow does not fail the mutation if logging fails", () => {
    expect(removeBlock).toContain("catch (logErr)");
    expect(removeBlock).toContain("Failed to log workflow removal");
  });
});

// ─── Frontend: Workflow mutations pass name and invalidate upcoming ───

describe("Workflow Tracking — Frontend passes workflowName and invalidates upcoming", () => {
  const componentSource = readFileSync(
    join(CLIENT_DIR, "pages", "TaskCenter.tsx"),
    "utf-8"
  );

  it("startWorkflow mutation call includes workflowName", () => {
    // The mutation call should pass workflowName from the selected workflow
    const mutateBlock = componentSource.substring(
      componentSource.indexOf("startWorkflowMutation.mutate({"),
      componentSource.indexOf("startWorkflowMutation.mutate({") + 300
    );
    expect(mutateBlock).toContain("workflowName:");
  });

  it("startWorkflow mutation call includes contactName", () => {
    const mutateBlock = componentSource.substring(
      componentSource.indexOf("startWorkflowMutation.mutate({"),
      componentSource.indexOf("startWorkflowMutation.mutate({") + 300
    );
    expect(mutateBlock).toContain("contactName:");
  });

  it("removeWorkflow mutation call includes workflowName", () => {
    const mutateBlock = componentSource.substring(
      componentSource.indexOf("removeWorkflowMutation.mutate({"),
      componentSource.indexOf("removeWorkflowMutation.mutate({") + 300
    );
    expect(mutateBlock).toContain("workflowName:");
  });

  it("removeWorkflow mutation call includes contactName", () => {
    const mutateBlock = componentSource.substring(
      componentSource.indexOf("removeWorkflowMutation.mutate({"),
      componentSource.indexOf("removeWorkflowMutation.mutate({") + 300
    );
    expect(mutateBlock).toContain("contactName:");
  });

  it("startWorkflow onSuccess invalidates getContactUpcomingActions", () => {
    const startMutationBlock = componentSource.substring(
      componentSource.indexOf("startWorkflowMutation = trpc.taskCenter.startWorkflow.useMutation"),
      componentSource.indexOf("removeWorkflowMutation = trpc.taskCenter.removeFromWorkflow.useMutation")
    );
    expect(startMutationBlock).toContain("getContactUpcomingActions.invalidate");
  });

  it("startWorkflow onSuccess invalidates getContactWorkflowHistory", () => {
    const startMutationBlock = componentSource.substring(
      componentSource.indexOf("startWorkflowMutation = trpc.taskCenter.startWorkflow.useMutation"),
      componentSource.indexOf("removeWorkflowMutation = trpc.taskCenter.removeFromWorkflow.useMutation")
    );
    expect(startMutationBlock).toContain("getContactWorkflowHistory.invalidate");
  });

  it("removeWorkflow onSuccess invalidates getContactUpcomingActions", () => {
    const removeMutationBlock = componentSource.substring(
      componentSource.indexOf("removeWorkflowMutation = trpc.taskCenter.removeFromWorkflow.useMutation"),
      componentSource.indexOf("createAptMutation")
    );
    expect(removeMutationBlock).toContain("getContactUpcomingActions.invalidate");
  });

  it("removeWorkflow onSuccess invalidates getContactWorkflowHistory", () => {
    const removeMutationBlock = componentSource.substring(
      componentSource.indexOf("removeWorkflowMutation = trpc.taskCenter.removeFromWorkflow.useMutation"),
      componentSource.indexOf("createAptMutation")
    );
    expect(removeMutationBlock).toContain("getContactWorkflowHistory.invalidate");
  });
});

// ─── Frontend: Pluralization fix ───

describe("Pluralization Fix — Activity counts", () => {
  const componentSource = readFileSync(
    join(CLIENT_DIR, "pages", "TaskCenter.tsx"),
    "utf-8"
  );

  it("uses singular 'Call' when count is 1", () => {
    expect(componentSource).toContain('todayActivity.callsMade === 1 ? "Call" : "Calls"');
  });

  it("uses singular 'Email' when count is 1", () => {
    expect(componentSource).toContain('todayActivity.emailsSent === 1 ? "Email" : "Emails"');
  });

  it("SMS label does not need pluralization (SMS is same singular/plural)", () => {
    // SMS should just say "SMS" regardless of count
    expect(componentSource).toContain("} SMS");
  });
});

// ─── Frontend: Improved empty state messaging ───

describe("Upcoming Tab — Improved empty state messaging", () => {
  const componentSource = readFileSync(
    join(CLIENT_DIR, "pages", "TaskCenter.tsx"),
    "utf-8"
  );

  it("empty state mentions the Update Workflow button", () => {
    expect(componentSource).toContain("Update Workflow");
    // The empty state should guide users to use the button
    expect(componentSource).toContain("Update Workflow");
  });

  it("empty state explains what will appear in the tab", () => {
    expect(componentSource).toContain("Workflows, scheduled SMS, and future tasks will appear here");
  });
});
