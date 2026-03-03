import { describe, it, expect } from "vitest";
import { enrichTasks, type GHLTask } from "./taskCenter";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

// ─── enrichTasks unit tests ────────────────────────────────

function makeTask(overrides: Partial<GHLTask> = {}): GHLTask {
  return {
    id: "task-1",
    title: "Follow up with seller",
    body: "",
    assignedTo: "ghl-user-1",
    dueDate: new Date().toISOString(),
    completed: false,
    contactId: "contact-1",
    contactName: "John Smith",
    contactPhone: "555-1234",
    contactEmail: "john@example.com",
    ...overrides,
  };
}

describe("enrichTasks — grouping logic", () => {
  const memberMap = new Map([
    ["ghl-user-1", "Chris Segura"],
    ["ghl-user-2", "Kyle Barks"],
  ]);

  it("classifies tasks with past due dates as 'overdue'", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 3);
    const tasks = [makeTask({ dueDate: yesterday.toISOString() })];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].group).toBe("overdue");
    expect(result[0].overdueDays).toBeGreaterThanOrEqual(3);
  });

  it("classifies tasks due today as 'today'", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0); // Noon today
    const tasks = [makeTask({ dueDate: today.toISOString() })];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].group).toBe("today");
    expect(result[0].overdueDays).toBe(0);
  });

  it("classifies tasks with future due dates as 'upcoming'", () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const tasks = [makeTask({ dueDate: nextWeek.toISOString() })];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].group).toBe("upcoming");
    expect(result[0].overdueDays).toBe(0);
  });

  it("maps assignedTo to team member names", () => {
    const tasks = [
      makeTask({ assignedTo: "ghl-user-1" }),
      makeTask({ id: "task-2", assignedTo: "ghl-user-2" }),
    ];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].assignedMemberName).toBe("Chris Segura");
    expect(result[1].assignedMemberName).toBe("Kyle Barks");
  });

  it("returns undefined assignedMemberName for unknown GHL user IDs", () => {
    const tasks = [makeTask({ assignedTo: "unknown-user" })];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].assignedMemberName).toBeUndefined();
  });

  it("sorts overdue tasks before today, and today before upcoming", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const tasks = [
      makeTask({ id: "upcoming-1", dueDate: nextWeek.toISOString() }),
      makeTask({ id: "overdue-1", dueDate: yesterday.toISOString() }),
      makeTask({ id: "today-1", dueDate: today.toISOString() }),
    ];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].group).toBe("overdue");
    expect(result[1].group).toBe("today");
    expect(result[2].group).toBe("upcoming");
  });

  it("sorts tasks within the same group by due date ascending", () => {
    const day1 = new Date();
    day1.setDate(day1.getDate() - 5);
    const day2 = new Date();
    day2.setDate(day2.getDate() - 2);

    const tasks = [
      makeTask({ id: "overdue-recent", dueDate: day2.toISOString() }),
      makeTask({ id: "overdue-old", dueDate: day1.toISOString() }),
    ];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].id).toBe("overdue-old");
    expect(result[1].id).toBe("overdue-recent");
  });

  it("handles tasks with no due date as 'upcoming' with 0 overdue days", () => {
    const tasks = [makeTask({ dueDate: "" })];
    const result = enrichTasks(tasks, memberMap);
    expect(result[0].group).toBe("upcoming");
    expect(result[0].overdueDays).toBe(0);
  });

  it("handles empty task list", () => {
    const result = enrichTasks([], memberMap);
    expect(result).toHaveLength(0);
  });
});

// ─── Router access control tests ──────────────────────────

describe("TaskCenter Router — Access Control", () => {
  const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  it("getTasks requires super_admin or admin role", () => {
    // The getTasks handler should check for super_admin or admin role
    expect(routersSource).toContain('ctx.user.role !== "super_admin" && ctx.user.role !== "admin"');
  });

  it("getTaskContext requires super_admin or admin role", () => {
    // The getTaskContext handler should also check for admin access
    const getTaskContextSection = routersSource.substring(
      routersSource.indexOf("getTaskContext:"),
      routersSource.indexOf("completeTask:")
    );
    expect(getTaskContextSection).toContain("super_admin");
    expect(getTaskContextSection).toContain("admin");
  });

  it("getTasks uses protectedProcedure", () => {
    const taskCenterSection = routersSource.substring(
      routersSource.indexOf("taskCenter: router({"),
      routersSource.indexOf("export type AppRouter")
    );
    // All procedures should use protectedProcedure
    const procedureMatches = taskCenterSection.match(/protectedProcedure/g);
    expect(procedureMatches).not.toBeNull();
    expect(procedureMatches!.length).toBeGreaterThanOrEqual(7); // getTasks, getTaskContext, completeTask, sendSms, addNote, startWorkflow, getWorkflows, createTask
  });

  it("getTasks allows admin to filter by team member GHL user ID", () => {
    expect(routersSource).toContain("assignedToGhlUserId");
  });

  it("getTasks returns empty for non-admin users without GHL user ID", () => {
    const getTasksSection = routersSource.substring(
      routersSource.indexOf("getTasks: protectedProcedure"),
      routersSource.indexOf("getTaskContext:")
    );
    expect(getTasksSection).toContain("tasks: [], teamMembers: []");
  });
});

// ─── Router endpoints completeness ────────────────────────

describe("TaskCenter Router — Endpoints", () => {
  const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  it("has getTasks endpoint", () => {
    expect(routersSource).toContain("getTasks: protectedProcedure");
  });

  it("has getTaskContext endpoint", () => {
    expect(routersSource).toContain("getTaskContext: protectedProcedure");
  });

  it("has completeTask endpoint", () => {
    expect(routersSource).toContain("completeTask: protectedProcedure");
  });

  it("has sendSms endpoint", () => {
    const taskCenterSection = routersSource.substring(
      routersSource.indexOf("taskCenter: router({")
    );
    expect(taskCenterSection).toContain("sendSms: protectedProcedure");
  });

  it("has addNote endpoint", () => {
    const taskCenterSection = routersSource.substring(
      routersSource.indexOf("taskCenter: router({")
    );
    expect(taskCenterSection).toContain("addNote: protectedProcedure");
  });

  it("has startWorkflow endpoint", () => {
    const taskCenterSection = routersSource.substring(
      routersSource.indexOf("taskCenter: router({")
    );
    expect(taskCenterSection).toContain("startWorkflow: protectedProcedure");
  });

  it("has getWorkflows endpoint", () => {
    const taskCenterSection = routersSource.substring(
      routersSource.indexOf("taskCenter: router({")
    );
    expect(taskCenterSection).toContain("getWorkflows: protectedProcedure");
  });

  it("has createTask endpoint", () => {
    const taskCenterSection = routersSource.substring(
      routersSource.indexOf("taskCenter: router({")
    );
    expect(taskCenterSection).toContain("createTask: protectedProcedure");
  });
});

// ─── Service module tests ──────────────────────────────────

describe("TaskCenter Service — Module Structure", () => {
  const serviceSource = readFileSync(join(SERVER_DIR, "taskCenter.ts"), "utf-8");

  it("exports searchLocationTasks function", () => {
    expect(serviceSource).toContain("export async function searchLocationTasks");
  });

  it("exports enrichTasks function", () => {
    expect(serviceSource).toContain("export function enrichTasks");
  });

  it("exports getContactNotes function", () => {
    expect(serviceSource).toContain("export async function getContactNotes");
  });

  it("exports getLastCallSummary function", () => {
    expect(serviceSource).toContain("export async function getLastCallSummary");
  });

  it("exports getTaskContactContext function", () => {
    expect(serviceSource).toContain("export async function getTaskContactContext");
  });

  it("exports getTeamMemberGhlMap function", () => {
    expect(serviceSource).toContain("export async function getTeamMemberGhlMap");
  });

  it("exports getTeamMembersForFilter function", () => {
    expect(serviceSource).toContain("export async function getTeamMembersForFilter");
  });

  it("searchLocationTasks uses contact-level task API via getTasksForContact", () => {
    expect(serviceSource).toContain("getTasksForContact");
    // Uses the per-contact API since location-level search requires locations/tasks.readonly scope
    expect(serviceSource).toContain("contactIds");
  });

  it("searchLocationTasks handles errors gracefully by returning empty array", () => {
    const funcBody = serviceSource.substring(
      serviceSource.indexOf("export async function searchLocationTasks"),
      serviceSource.indexOf("export function enrichTasks")
    );
    expect(funcBody).toContain("catch");
    expect(funcBody).toContain("return []");
  });

  it("getTaskContactContext fetches contact, notes, and last call in parallel", () => {
    const funcBody = serviceSource.substring(
      serviceSource.indexOf("export async function getTaskContactContext"),
      serviceSource.indexOf("// ─── TEAM MEMBER MAPPING")
    );
    expect(funcBody).toContain("Promise.all");
  });

  it("getLastCallSummary queries completed calls ordered by most recent", () => {
    const funcBody = serviceSource.substring(
      serviceSource.indexOf("export async function getLastCallSummary"),
      serviceSource.indexOf("export async function getTaskContactContext")
    );
    expect(funcBody).toContain('eq(calls.status, "completed")');
    expect(funcBody).toContain("desc(calls.createdAt)");
    expect(funcBody).toContain("limit(1)");
  });
});

// ─── Frontend component tests ──────────────────────────────

describe("TaskCenter Frontend — Component Structure", () => {
  const componentSource = readFileSync(
    join(CLIENT_DIR, "pages", "TaskCenter.tsx"),
    "utf-8"
  );

  it("imports trpc for API calls", () => {
    expect(componentSource).toContain('import { trpc } from "@/lib/trpc"');
  });

  it("imports useAuth for user state", () => {
    expect(componentSource).toContain("useAuth");
  });

  it("uses trpc.taskCenter.getTasks.useQuery", () => {
    expect(componentSource).toContain("trpc.taskCenter.getTasks.useQuery");
  });

  it("uses trpc.taskCenter.getTaskContext.useQuery for expanded tasks", () => {
    expect(componentSource).toContain("trpc.taskCenter.getTaskContext.useQuery");
  });

  it("uses trpc.taskCenter.completeTask.useMutation", () => {
    expect(componentSource).toContain("trpc.taskCenter.completeTask.useMutation");
  });

  it("uses trpc.taskCenter.sendSms.useMutation", () => {
    expect(componentSource).toContain("trpc.taskCenter.sendSms.useMutation");
  });

  it("uses trpc.taskCenter.addNote.useMutation", () => {
    expect(componentSource).toContain("trpc.taskCenter.addNote.useMutation");
  });

  it("uses trpc.taskCenter.startWorkflow.useMutation", () => {
    expect(componentSource).toContain("trpc.taskCenter.startWorkflow.useMutation");
  });

  it("has team member filter for admins", () => {
    expect(componentSource).toContain("selectedMember");
    expect(componentSource).toContain("All Team Members");
  });

  it("has search functionality", () => {
    expect(componentSource).toContain("searchQuery");
    expect(componentSource).toContain("Search tasks or contacts");
  });

  it("displays three task groups: overdue, today, upcoming", () => {
    expect(componentSource).toContain('"overdue"');
    expect(componentSource).toContain('"today"');
    expect(componentSource).toContain('"upcoming"');
    expect(componentSource).toContain("Overdue");
    expect(componentSource).toContain("Due Today");
    expect(componentSource).toContain("Upcoming");
  });

  it("shows overdue badge with days count", () => {
    expect(componentSource).toContain("overdueDays");
    expect(componentSource).toContain("d overdue");
  });

  it("has quick action buttons: Call, Text, Workflow, Add Note", () => {
    // In JSX, these are rendered with icons before the text
    expect(componentSource).toContain("Call");
    expect(componentSource).toContain("Text");
    expect(componentSource).toContain("Workflow");
    expect(componentSource).toContain("Add Note");
  });

  it("shows last call summary from Gunner when available", () => {
    expect(componentSource).toContain("Last Call Summary");
    expect(componentSource).toContain("lastCallSummary");
  });

  it("shows recent notes from GHL", () => {
    expect(componentSource).toContain("Recent Notes");
    expect(componentSource).toContain("recentNotes");
  });

  it("has empty state when no tasks", () => {
    expect(componentSource).toContain("All Clear");
    expect(componentSource).toContain("No pending tasks");
  });

  it("has error state with retry button", () => {
    expect(componentSource).toContain("Failed to load tasks");
    expect(componentSource).toContain("Retry");
  });

  it("auto-refreshes every 60 seconds", () => {
    expect(componentSource).toContain("refetchInterval: 60000");
  });

  it("invalidates task list after completing a task", () => {
    expect(componentSource).toContain("utils.taskCenter.getTasks.invalidate");
  });
});

// ─── Navigation tests ──────────────────────────────────────

describe("TaskCenter Navigation", () => {
  it("has /tasks route in App.tsx", () => {
    const appSource = readFileSync(join(CLIENT_DIR, "App.tsx"), "utf-8");
    expect(appSource).toContain('path="/tasks"');
    expect(appSource).toContain("TaskCenter");
  });

  it("has Tasks nav item in DashboardLayout for admins", () => {
    const layoutSource = readFileSync(
      join(CLIENT_DIR, "components", "DashboardLayout.tsx"),
      "utf-8"
    );
    expect(layoutSource).toContain('"Tasks"');
    expect(layoutSource).toContain('"/tasks"');
  });

  it("Tasks nav item uses ClipboardList icon", () => {
    const layoutSource = readFileSync(
      join(CLIENT_DIR, "components", "DashboardLayout.tsx"),
      "utf-8"
    );
    expect(layoutSource).toContain("ClipboardList");
  });

  it("Tasks nav item is only shown to admins and super_admins", () => {
    const layoutSource = readFileSync(
      join(CLIENT_DIR, "components", "DashboardLayout.tsx"),
      "utf-8"
    );
    // The Tasks item should be inside an admin/super_admin conditional
    const tasksIndex = layoutSource.indexOf('"Tasks"');
    const beforeTasks = layoutSource.substring(Math.max(0, tasksIndex - 200), tasksIndex);
    expect(beforeTasks).toMatch(/isAdmin|isSuperAdmin/);
  });
});
