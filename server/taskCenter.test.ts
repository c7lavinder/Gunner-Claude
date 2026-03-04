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

  it("searchLocationTasks uses location-level task search API", () => {
    // Uses POST /locations/:locationId/tasks/search endpoint
    expect(serviceSource).toContain("/locations/");
    expect(serviceSource).toContain("/tasks/search");
    expect(serviceSource).toContain("searchAfter");
  });

  it("searchLocationTasks parses contactDetails from API response", () => {
    // The API returns contactDetails.firstName and contactDetails.lastName inline
    expect(serviceSource).toContain("contactDetails?.firstName");
    expect(serviceSource).toContain("contactDetails?.lastName");
  });

  it("has contact info cache for enriching tasks with contact addresses, phones, and emails", () => {
    expect(serviceSource).toContain("contactInfoCache");
    expect(serviceSource).toContain("ensureContactInfoCache");
    expect(serviceSource).toContain("CONTACT_INFO_CACHE_TTL_MS");
  });

  it("uses cursor-based pagination with searchAfter", () => {
    const funcBody = serviceSource.substring(
      serviceSource.indexOf("export async function searchLocationTasks"),
      serviceSource.indexOf("function applyTaskFilters")
    );
    expect(funcBody).toContain("searchAfter");
    expect(funcBody).toContain("PAGE_SIZE");
    expect(funcBody).toContain("MAX_PAGES");
  });

  it("caches all tasks before applying filters", () => {
    const funcBody = serviceSource.substring(
      serviceSource.indexOf("export async function searchLocationTasks"),
      serviceSource.indexOf("function applyTaskFilters")
    );
    expect(funcBody).toContain("taskCache.set");
    expect(funcBody).toContain("applyTaskFilters");
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

  it("uses trpc.taskCenter.getPriorityTasks.useQuery", () => {
    expect(componentSource).toContain("trpc.taskCenter.getPriorityTasks.useQuery");
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

  it("search filter includes contact address matching", () => {
    expect(componentSource).toContain("t.contactAddress && t.contactAddress.toLowerCase().includes(q)");
  });

  it("uses priority-based task categories", () => {
    expect(componentSource).toContain('"overdue"');
    expect(componentSource).toContain('"today"');
    expect(componentSource).toContain('"upcoming"');
    expect(componentSource).toContain("priorityScore");
    expect(componentSource).toContain("category");
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

  it("shows notes tab in expanded section", () => {
    expect(componentSource).toContain("Notes");
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
    expect(componentSource).toContain("utils.taskCenter.getPriorityTasks.invalidate");
  });
});

// ─── Navigation tests ──────────────────────────────────────

describe("TaskCenter Navigation", () => {
  it("has /tasks route in App.tsx", () => {
    const appSource = readFileSync(join(CLIENT_DIR, "App.tsx"), "utf-8");
    expect(appSource).toContain('path="/tasks"');
    expect(appSource).toContain("TaskCenter");
  });

  it("has Day Hub nav item in DashboardLayout for admins", () => {
    const layoutSource = readFileSync(
      join(CLIENT_DIR, "components", "DashboardLayout.tsx"),
      "utf-8"
    );
    expect(layoutSource).toContain('"Day Hub"');
    expect(layoutSource).toContain('"/tasks"');
  });

  it("Tasks nav item uses ClipboardList icon", () => {
    const layoutSource = readFileSync(
      join(CLIENT_DIR, "components", "DashboardLayout.tsx"),
      "utf-8"
    );
    expect(layoutSource).toContain("ClipboardList");
  });

  it("Day Hub nav item is only shown to admins and super_admins", () => {
    const layoutSource = readFileSync(
      join(CLIENT_DIR, "components", "DashboardLayout.tsx"),
      "utf-8"
    );
    // The Day Hub item should be inside an admin/super_admin conditional
    const tasksIndex = layoutSource.indexOf('"Day Hub"');
    const beforeTasks = layoutSource.substring(Math.max(0, tasksIndex - 200), tasksIndex);
    expect(beforeTasks).toMatch(/isAdmin|isSuperAdmin/);
  });
});

// ─── Task Row Actions tests (edit, delete, checkbox) ─────────

describe("TaskCenter — Task Row Actions (Edit, Delete, Checkbox)", () => {
  const componentSource = readFileSync(
    join(CLIENT_DIR, "pages", "TaskCenter.tsx"),
    "utf-8"
  );

  it("has edit task mutation wired to trpc.taskCenter.editTask", () => {
    expect(componentSource).toContain("trpc.taskCenter.editTask.useMutation");
  });

  it("has delete task mutation wired to trpc.taskCenter.deleteTask", () => {
    expect(componentSource).toContain("trpc.taskCenter.deleteTask.useMutation");
  });

  it("renders Pencil (edit) icon on each task row", () => {
    expect(componentSource).toContain("Pencil");
    expect(componentSource).toContain("Edit task");
  });

  it("renders Trash2 (delete) icon on each task row", () => {
    expect(componentSource).toContain("Trash2");
    expect(componentSource).toContain("Delete task");
  });

  it("has a prominent checkbox for marking tasks complete", () => {
    expect(componentSource).toContain("Mark as complete");
    // The checkbox is a round button with border
    expect(componentSource).toContain("rounded-full");
  });

  it("has edit dialog with title, description, and due date fields", () => {
    expect(componentSource).toContain("Edit Task");
    expect(componentSource).toContain("edit-title");
    expect(componentSource).toContain("edit-body");
    expect(componentSource).toContain("edit-due-date");
    expect(componentSource).toContain("Save Changes");
  });

  it("has delete confirmation dialog with destructive button", () => {
    expect(componentSource).toContain("Delete Task");
    expect(componentSource).toContain("Are you sure you want to delete this task");
    expect(componentSource).toContain('variant="destructive"');
    expect(componentSource).toContain("Delete Task");
  });

  it("edit and delete buttons appear on hover (opacity transition)", () => {
    expect(componentSource).toContain("opacity-0 group-hover:opacity-100");
  });

  it("checkbox shows green check icon on hover", () => {
    expect(componentSource).toContain("oklch(0.7 0.15 150)");
    expect(componentSource).toContain("CheckCircle2");
  });

  it("passes onEdit and onDelete callbacks to task rows", () => {
    expect(componentSource).toContain("onEdit");
    expect(componentSource).toContain("onDelete");
    expect(componentSource).toContain("handleEdit");
    expect(componentSource).toContain("handleDelete");
  });

  it("invalidates task list after editing a task", () => {
    const editMutationBlock = componentSource.substring(
      componentSource.indexOf("editTaskMutation"),
      componentSource.indexOf("deleteTaskMutation")
    );
    expect(editMutationBlock).toContain("utils.taskCenter.getPriorityTasks.invalidate");
  });

  it("invalidates task list after deleting a task", () => {
    const deleteMutationBlock = componentSource.substring(
      componentSource.indexOf("deleteTaskMutation"),
      componentSource.indexOf("// Get GHL user IDs")
    );
    expect(deleteMutationBlock).toContain("utils.taskCenter.getPriorityTasks.invalidate");
  });

  it("shows toast on successful edit", () => {
    expect(componentSource).toContain('"Task updated"');
  });

  it("shows toast on successful delete", () => {
    expect(componentSource).toContain('"Task deleted"');
  });
});

// ─── Backend endpoints for edit and delete ─────────────────

describe("TaskCenter Backend — Edit & Delete Endpoints", () => {
  const routerSource = readFileSync(
    join(SERVER_DIR, "routers.ts"),
    "utf-8"
  );

  it("has deleteTask endpoint in taskCenter router", () => {
    expect(routerSource).toContain("deleteTask: protectedProcedure");
  });

  it("has editTask endpoint in taskCenter router", () => {
    expect(routerSource).toContain("editTask: protectedProcedure");
  });

  it("deleteTask imports deleteTask from ghlActions", () => {
    // Find the deleteTask procedure block
    const deleteBlock = routerSource.substring(
      routerSource.indexOf("deleteTask: protectedProcedure"),
      routerSource.indexOf("editTask: protectedProcedure")
    );
    expect(deleteBlock).toContain('import("./ghlActions")');
    expect(deleteBlock).toContain("deleteTask");
  });

  it("editTask imports updateTask from ghlActions", () => {
    const editBlock = routerSource.substring(
      routerSource.indexOf("editTask: protectedProcedure"),
      routerSource.indexOf("createTask: protectedProcedure")
    );
    expect(editBlock).toContain('import("./ghlActions")');
    expect(editBlock).toContain("updateTask");
  });

  it("deleteTask function exists in ghlActions", () => {
    const ghlSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlSource).toContain("export async function deleteTask");
    expect(ghlSource).toContain("DELETE");
  });
});

// ─── React Hooks Safety — no hooks after early returns ───────

describe("TaskCenter Frontend — React Hooks Safety", () => {
  const componentSource = readFileSync(
    join(CLIENT_DIR, "pages", "TaskCenter.tsx"),
    "utf-8"
  );

  it("KpiBar does not call useMemo after an early return", () => {
    // Extract the KpiBar function body
    const kpiBarStart = componentSource.indexOf("function KpiBar(");
    expect(kpiBarStart).toBeGreaterThan(-1);

    // Find the function body by counting braces
    let braceCount = 0;
    let bodyStart = componentSource.indexOf("{", kpiBarStart);
    let i = bodyStart;
    while (i < componentSource.length) {
      if (componentSource[i] === "{") braceCount++;
      if (componentSource[i] === "}") {
        braceCount--;
        if (braceCount === 0) break;
      }
      i++;
    }
    const kpiBarBody = componentSource.substring(bodyStart, i + 1);
    const lines = kpiBarBody.split("\n");

    // Find the first top-level return statement (not inside callbacks/arrow functions)
    let firstReturnLine = -1;
    let depth = 0;
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j].trim();
      // Track nested braces (skip hooks inside callbacks)
      for (const ch of line) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
      // Only check returns at function body level (depth 1, since we start inside the function)
      if (depth <= 1 && (line.startsWith("return ") || line.startsWith("return(") || line === "return;") && !line.includes("=>")) {
        firstReturnLine = j;
        break;
      }
    }

    // All useMemo calls should be BEFORE the first return
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].includes("useMemo")) {
        if (firstReturnLine !== -1) {
          expect(j).toBeLessThan(firstReturnLine);
        }
      }
    }
  });

  it("KpiBar has useMemo for KPI targets calculation", () => {
    const kpiBarStart = componentSource.indexOf("function KpiBar(");
    const kpiBarEnd = componentSource.indexOf("function LeftPanel(");
    const kpiBarBody = componentSource.substring(kpiBarStart, kpiBarEnd);
    expect(kpiBarBody).toContain("useMemo");
    expect(kpiBarBody).toContain("targets");
  });

  it("main TaskCenter component calls all hooks before JSX return", () => {
    // Verify that the main component has hooks in the right order
    const mainStart = componentSource.indexOf("export default function TaskCenter()");
    expect(mainStart).toBeGreaterThan(-1);
    const mainBody = componentSource.substring(mainStart);

    // All these hooks should exist and be called
    expect(mainBody).toContain("useAuth()");
    expect(mainBody).toContain("trpc.useUtils()");
    expect(mainBody).toContain("useState");
    expect(mainBody).toContain("useMemo");

    // The JSX return should come after all hooks
    const firstUseMemo = mainBody.indexOf("useMemo");
    const jsxReturn = mainBody.indexOf("return (\n    <div");
    expect(firstUseMemo).toBeLessThan(jsxReturn);
  });
});

// ─── Inbox SMS Modal Tests ────────────────────────────────

describe("Inbox SMS Modal — frontend wiring", () => {
  const componentSource = readFileSync(join(CLIENT_DIR, "pages", "TaskCenter.tsx"), "utf-8");

  it("LeftPanel has SMS modal state variables", () => {
    expect(componentSource).toContain("inboxSmsOpen");
    expect(componentSource).toContain("inboxSmsContact");
    expect(componentSource).toContain("inboxSmsMessage");
    expect(componentSource).toContain("inboxSmsFromGhlUserId");
  });

  it("LeftPanel has sendSms mutation wired", () => {
    // Find LeftPanel function body
    const leftPanelStart = componentSource.indexOf("function LeftPanel(");
    expect(leftPanelStart).toBeGreaterThan(-1);
    const leftPanelBody = componentSource.substring(leftPanelStart, leftPanelStart + 5000);
    expect(leftPanelBody).toContain("trpc.taskCenter.sendSms.useMutation");
  });

  it("LeftPanel renders SMS Dialog with From/To fields", () => {
    const leftPanelStart = componentSource.indexOf("function LeftPanel(");
    const nextFunctionStart = componentSource.indexOf("\nfunction ", leftPanelStart + 1);
    const leftPanelBody = componentSource.substring(leftPanelStart, nextFunctionStart);
    expect(leftPanelBody).toContain("Send SMS to");
    expect(leftPanelBody).toContain("From");
    expect(leftPanelBody).toContain("To");
    expect(leftPanelBody).toContain("Type your message");
    expect(leftPanelBody).toContain("Schedule for Later");
  });

  it("UnreadConvoItem accepts onTextContact prop instead of using sms: link", () => {
    // The UnreadConvoItem should accept onTextContact
    expect(componentSource).toContain("onTextContact: (contactId: string, contactName: string, contactPhone: string) => void");
    // Should NOT use window.open('sms:...')
    expect(componentSource).not.toContain("window.open(`sms:");
    // Should call onTextContact instead
    const unreadStart = componentSource.indexOf("function UnreadConvoItem(");
    const unreadEnd = componentSource.indexOf("\nfunction ", unreadStart + 1);
    const unreadBody = componentSource.substring(unreadStart, unreadEnd > -1 ? unreadEnd : unreadStart + 3000);
    expect(unreadBody).toContain("onTextContact(conv.contactId");
  });

  it("LeftPanel passes handleTextContact to UnreadConvoItem", () => {
    expect(componentSource).toContain("onTextContact={handleTextContact}");
  });
});

// ─── Appointment Contact Enrichment Tests ────────────────

describe("Appointment contact enrichment — backend", () => {
  const dayHubSource = readFileSync(join(SERVER_DIR, "dayHub.ts"), "utf-8");

  it("getTodayAppointments enriches contacts from local cache", () => {
    expect(dayHubSource).toContain("contactIdsToEnrich");
    expect(dayHubSource).toContain("contactCache");
    expect(dayHubSource).toContain("cacheMap");
  });

  it("enrichment fills in contactName when it is Unknown", () => {
    expect(dayHubSource).toContain('apt.contactName === "Unknown"');
    expect(dayHubSource).toContain("cached.name");
    expect(dayHubSource).toContain("cached.firstName");
  });

  it("enrichment fills in address and phone from cache", () => {
    expect(dayHubSource).toContain("!apt.address && cached.address");
    expect(dayHubSource).toContain("!apt.contactPhone && cached.phone");
  });

  it("enrichment handles errors gracefully", () => {
    expect(dayHubSource).toContain("Failed to enrich appointments from cache");
  });
});


// ─── Phone-based inbox filtering ──────────────────────────

describe("Phone-based inbox filtering — backend", () => {
  const dayHubSource = readFileSync(join(SERVER_DIR, "dayHub.ts"), "utf-8");

  it("UnreadConversation interface includes teamPhone field", () => {
    expect(dayHubSource).toContain("teamPhone: string");
  });

  it("fetches last inbound message per conversation to determine teamPhone", () => {
    expect(dayHubSource).toContain("/conversations/");
    expect(dayHubSource).toContain("/messages?limit=");
  });

  it("checks message direction to identify inbound messages", () => {
    expect(dayHubSource).toContain('direction === "inbound"');
    expect(dayHubSource).toContain("msg.to");
  });

  it("falls back to outbound message from field for teamPhone", () => {
    expect(dayHubSource).toContain('direction === "outbound"');
    expect(dayHubSource).toContain("msg.from");
  });

  it("batches message fetches to avoid rate limiting", () => {
    expect(dayHubSource).toContain("batchSize");
    expect(dayHubSource).toContain("Promise.all");
  });

  it("handles message fetch errors gracefully", () => {
    expect(dayHubSource).toContain("Failed to fetch messages for");
  });
});

describe("Phone-based inbox filtering — getTeamMembersForFilter", () => {
  const serviceSource = readFileSync(join(SERVER_DIR, "taskCenter.ts"), "utf-8");

  it("getTeamMembersForFilter returns lcPhones field", () => {
    expect(serviceSource).toContain("lcPhones: teamMembers.lcPhones");
  });

  it("getTeamMembersForFilter includes lcPhones in return type", () => {
    expect(serviceSource).toContain("lcPhones: string | null");
  });
});

describe("Phone-based inbox filtering — frontend LeftPanel", () => {
  const tcSource = readFileSync(join(CLIENT_DIR, "pages", "TaskCenter.tsx"), "utf-8");

  it("LeftPanel accepts teamMembers prop", () => {
    expect(tcSource).toContain("teamMembers: teamMembersList");
  });

  it("builds rolePhoneNumbers set from team members lcPhones", () => {
    expect(tcSource).toContain("rolePhoneNumbers");
    expect(tcSource).toContain("JSON.parse(m.lcPhones)");
    expect(tcSource).toContain("phones.add(p)");
  });

  it("filters conversations by teamPhone matching rolePhoneNumbers", () => {
    expect(tcSource).toContain("c.teamPhone && rolePhoneNumbers.has(c.teamPhone)");
  });

  it("falls back to assignedTo when teamPhone is not available", () => {
    expect(tcSource).toContain("!c.teamPhone && c.assignedTo && roleFilteredGhlUserIds");
  });

  it("admin tab shows all conversations (rolePhoneNumbers is null)", () => {
    expect(tcSource).toContain('roleTab === "admin"');
    expect(tcSource).toContain("return null; // null = show all");
  });

  it("passes teamMembers to LeftPanel from main component", () => {
    expect(tcSource).toContain("teamMembers={data?.teamMembers}");
  });

  it("TeamMember interface includes lcPhones field", () => {
    expect(tcSource).toContain("lcPhones?: string | null");
  });
});
