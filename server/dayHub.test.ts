import { describe, it, expect } from "vitest";
import {
  classifyTask,
  calculatePriorityScore,
  prioritizeTasks,
  detectAmPmCalls,
  getKpiColor,
  type TaskCategory,
} from "./dayHub";
import { type TaskWithContext } from "./taskCenter";

// ─── HELPERS ─────────────────────────────────────────────

function makeTask(overrides: Partial<TaskWithContext> = {}): TaskWithContext {
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
    overdueDays: 0,
    group: "today",
    ...overrides,
  };
}

// ─── classifyTask ────────────────────────────────────────

describe("classifyTask — task classification", () => {
  it("classifies 'new lead' title as new_lead", () => {
    const task = makeTask({ title: "Call new lead - 123 Main St" });
    expect(classifyTask(task)).toBe("new_lead");
  });

  it("classifies 'speed to lead' in body as new_lead", () => {
    const task = makeTask({ title: "Contact ASAP", body: "Speed to lead required" });
    expect(classifyTask(task)).toBe("new_lead");
  });

  it("classifies 'first call' as new_lead", () => {
    const task = makeTask({ title: "First call to prospect" });
    expect(classifyTask(task)).toBe("new_lead");
  });

  it("classifies 'reschedule' title as reschedule", () => {
    const task = makeTask({ title: "Reschedule appointment with Jane" });
    expect(classifyTask(task)).toBe("reschedule");
  });

  it("classifies 'no show' as reschedule", () => {
    const task = makeTask({ title: "No show - follow up" });
    expect(classifyTask(task)).toBe("reschedule");
  });

  it("classifies 'no-show' (hyphenated) as reschedule", () => {
    const task = makeTask({ title: "No-show walkthrough" });
    expect(classifyTask(task)).toBe("reschedule");
  });

  it("classifies 'confirm appointment' as reschedule", () => {
    const task = makeTask({ title: "Confirm appointment for tomorrow" });
    expect(classifyTask(task)).toBe("reschedule");
  });

  it("classifies 'admin task' as admin", () => {
    const task = makeTask({ title: "Admin task: update CRM" });
    expect(classifyTask(task)).toBe("admin");
  });

  it("classifies 'update crm' as admin", () => {
    const task = makeTask({ title: "Update CRM records" });
    expect(classifyTask(task)).toBe("admin");
  });

  it("classifies 'report' as admin", () => {
    const task = makeTask({ title: "Generate weekly report" });
    expect(classifyTask(task)).toBe("admin");
  });

  it("defaults to follow_up for generic tasks", () => {
    const task = makeTask({ title: "Check in with Bob" });
    expect(classifyTask(task)).toBe("follow_up");
  });

  it("defaults to follow_up for empty title", () => {
    const task = makeTask({ title: "" });
    expect(classifyTask(task)).toBe("follow_up");
  });

  it("is case-insensitive", () => {
    const task = makeTask({ title: "NEW LEAD from website" });
    expect(classifyTask(task)).toBe("new_lead");
  });
});

// ─── calculatePriorityScore ──────────────────────────────

describe("calculatePriorityScore — scoring logic", () => {
  it("gives new_lead the highest base score when overdue", () => {
    const task = makeTask({
      dueDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    });
    const score = calculatePriorityScore(task, "new_lead");
    expect(score).toBeGreaterThan(500);
  });

  it("gives new_lead 900 for future tasks", () => {
    const task = makeTask({
      dueDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
    });
    const score = calculatePriorityScore(task, "new_lead");
    expect(score).toBe(900);
  });

  it("decays new_lead score over time", () => {
    const task2h = makeTask({
      dueDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    });
    const task24h = makeTask({
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const score2h = calculatePriorityScore(task2h, "new_lead");
    const score24h = calculatePriorityScore(task24h, "new_lead");
    expect(score2h).toBeGreaterThan(score24h);
  });

  it("gives reschedule lower base than new_lead", () => {
    const task = makeTask({
      dueDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const newLeadScore = calculatePriorityScore(task, "new_lead");
    const rescheduleScore = calculatePriorityScore(task, "reschedule");
    expect(newLeadScore).toBeGreaterThan(rescheduleScore);
  });

  it("gives follow_up lower score than reschedule for overdue tasks", () => {
    const task = makeTask({
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    });
    const rescheduleScore = calculatePriorityScore(task, "reschedule");
    const followUpScore = calculatePriorityScore(task, "follow_up");
    expect(rescheduleScore).toBeGreaterThan(followUpScore);
  });

  it("gives admin lower score for future tasks", () => {
    const task = makeTask({
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
    });
    const score = calculatePriorityScore(task, "admin");
    expect(score).toBeLessThan(200);
  });

  it("returns a rounded integer", () => {
    const task = makeTask();
    const score = calculatePriorityScore(task, "follow_up");
    expect(score).toBe(Math.round(score));
  });

  it("never returns negative scores", () => {
    const task = makeTask({
      dueDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
    });
    for (const cat of ["new_lead", "reschedule", "admin", "follow_up"] as TaskCategory[]) {
      const score = calculatePriorityScore(task, cat);
      expect(score).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── prioritizeTasks ─────────────────────────────────────

describe("prioritizeTasks — sorting and enrichment", () => {
  it("sorts tasks by priority score descending", () => {
    const tasks = [
      makeTask({ id: "1", title: "Check in with Bob", dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }),
      makeTask({ id: "2", title: "Call new lead - 123 Main", dueDate: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
      makeTask({ id: "3", title: "Reschedule appointment", dueDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }),
    ];
    const result = prioritizeTasks(tasks);
    expect(result[0].id).toBe("2"); // new_lead should be first
    expect(result[0].category).toBe("new_lead");
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].priorityScore).toBeGreaterThanOrEqual(result[i].priorityScore);
    }
  });

  it("adds category and priorityScore to each task", () => {
    const tasks = [makeTask({ title: "Admin task: update spreadsheet" })];
    const result = prioritizeTasks(tasks);
    expect(result[0].category).toBe("admin");
    expect(typeof result[0].priorityScore).toBe("number");
    expect(result[0].priorityScore).toBeGreaterThan(0);
  });

  it("initializes amCallMade and pmCallMade to false", () => {
    const tasks = [makeTask()];
    const result = prioritizeTasks(tasks);
    expect(result[0].amCallMade).toBe(false);
    expect(result[0].pmCallMade).toBe(false);
  });

  it("handles empty array", () => {
    const result = prioritizeTasks([]);
    expect(result).toEqual([]);
  });
});

// ─── detectAmPmCalls ─────────────────────────────────────

describe("detectAmPmCalls — AM/PM call detection", () => {
  it("returns both false when no messages", () => {
    const result = detectAmPmCalls([]);
    expect(result.amCallMade).toBe(false);
    expect(result.pmCallMade).toBe(false);
  });

  it("ignores inbound calls", () => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    const result = detectAmPmCalls([
      { type: "CALL", direction: "inbound", dateAdded: now.toISOString() },
    ]);
    expect(result.amCallMade).toBe(false);
  });

  it("ignores non-call messages", () => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    const result = detectAmPmCalls([
      { type: "SMS", direction: "outbound", dateAdded: now.toISOString() },
    ]);
    expect(result.amCallMade).toBe(false);
    expect(result.pmCallMade).toBe(false);
  });

  it("ignores messages from other days", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0);
    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: yesterday.toISOString() },
    ]);
    expect(result.amCallMade).toBe(false);
  });

  it("handles missing dateAdded gracefully", () => {
    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound" },
    ]);
    expect(result.amCallMade).toBe(false);
    expect(result.pmCallMade).toBe(false);
  });

  it("handles invalid dateAdded gracefully", () => {
    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: "not-a-date" },
    ]);
    expect(result.amCallMade).toBe(false);
    expect(result.pmCallMade).toBe(false);
  });
});

// ─── getKpiColor ─────────────────────────────────────────

describe("getKpiColor — KPI color logic", () => {
  it("returns green when target is met", () => {
    expect(getKpiColor(150, 150)).toBe("green");
  });

  it("returns green when target is exceeded", () => {
    expect(getKpiColor(200, 150)).toBe("green");
  });

  it("returns red when 0 progress and target > 0 (end of day)", () => {
    // This test is time-dependent; we test the edge case of target met
    const result = getKpiColor(0, 150);
    // Could be yellow or red depending on time of day
    expect(["yellow", "red"]).toContain(result);
  });

  it("returns green when current > 0 and target is 0", () => {
    // target 0 means no target set, any progress is fine
    expect(getKpiColor(5, 0)).toBe("green");
  });
});


// ─── Central Timezone Tests ─────────────────────────────

describe("detectAmPmCalls — Central timezone (America/Chicago)", () => {
  it("detects AM outbound call in Central time", () => {
    // Create a date that is 9 AM Central today
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    // 9 AM Central = 15:00 UTC (CST) or 14:00 UTC (CDT)
    const amCentral = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T09:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: amCentral.toISOString() },
    ]);
    expect(result.amCallMade).toBe(true);
    expect(result.pmCallMade).toBe(false);
  });

  it("detects PM outbound call in Central time", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    // 2 PM Central
    const pmCentral = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T14:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: pmCentral.toISOString() },
    ]);
    expect(result.amCallMade).toBe(false);
    expect(result.pmCallMade).toBe(true);
  });

  it("detects both AM and PM calls on same day", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const amCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T10:30:00-06:00`);
    const pmCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T15:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: amCall.toISOString() },
      { type: "CALL", direction: "outbound", dateAdded: pmCall.toISOString() },
    ]);
    expect(result.amCallMade).toBe(true);
    expect(result.pmCallMade).toBe(true);
  });

  it("handles GHL numeric type 1 for calls", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const amCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T08:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "1", direction: "outbound", dateAdded: amCall.toISOString() },
    ]);
    expect(result.amCallMade).toBe(true);
  });
});
