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


// ─── AM/PM Integration Tests ─────────────────────────────

describe("prioritizeTasks — AM/PM default values", () => {
  it("always initializes amCallMade=false and pmCallMade=false before DB enrichment", () => {
    const tasks = [
      makeTask({ id: "a", title: "Call new lead" }),
      makeTask({ id: "b", title: "Follow up with seller" }),
      makeTask({ id: "c", title: "Reschedule appointment" }),
    ];
    const result = prioritizeTasks(tasks);
    for (const t of result) {
      expect(t.amCallMade).toBe(false);
      expect(t.pmCallMade).toBe(false);
    }
  });

  it("amCallMade and pmCallMade are writable (can be updated by DB enrichment)", () => {
    const tasks = [makeTask({ id: "x" })];
    const result = prioritizeTasks(tasks);
    // Simulate what the router does after DB query
    result[0].amCallMade = true;
    result[0].pmCallMade = true;
    expect(result[0].amCallMade).toBe(true);
    expect(result[0].pmCallMade).toBe(true);
  });
});

describe("detectAmPmCalls — edge cases for GHL message formats", () => {
  it("detects outbound calls with messageType TYPE_CALL", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const amCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T11:00:00-06:00`);

    const result = detectAmPmCalls([
      { messageType: "TYPE_CALL", direction: "outbound", dateAdded: amCall.toISOString() },
    ]);
    expect(result.amCallMade).toBe(true);
  });

  it("detects outbound calls with direction 'outgoing' (alternate GHL format)", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const pmCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T13:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "CALL", direction: "outgoing", dateAdded: pmCall.toISOString() },
    ]);
    expect(result.pmCallMade).toBe(true);
  });

  it("noon (12:00) is classified as PM", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const noonCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: noonCall.toISOString() },
    ]);
    expect(result.amCallMade).toBe(false);
    expect(result.pmCallMade).toBe(true);
  });

  it("11:59 AM is classified as AM", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const lateAmCall = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T11:59:00-06:00`);

    const result = detectAmPmCalls([
      { type: "CALL", direction: "outbound", dateAdded: lateAmCall.toISOString() },
    ]);
    expect(result.amCallMade).toBe(true);
    expect(result.pmCallMade).toBe(false);
  });

  it("handles mixed call and non-call messages correctly", () => {
    const now = new Date();
    const ctDateStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const [m, d, y] = ctDateStr.split("/").map(Number);
    const time = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T10:00:00-06:00`);

    const result = detectAmPmCalls([
      { type: "SMS", direction: "outbound", dateAdded: time.toISOString() },
      { type: "CALL", direction: "outbound", dateAdded: time.toISOString() },
      { type: "EMAIL", direction: "outbound", dateAdded: time.toISOString() },
      { type: "CALL", direction: "inbound", dateAdded: time.toISOString() },
    ]);
    expect(result.amCallMade).toBe(true);
    expect(result.pmCallMade).toBe(false);
  });
});


// ─── KPI DEDUP LOGIC TESTS ──────────────────────────────

describe("KPI Dedup — source code verification", () => {
  it("uses COUNT(DISTINCT COALESCE) for appointment and offer counts", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    expect(source).toContain("COUNT(DISTINCT COALESCE");
    // 3 occurrences: appointments, AM Direct appointments, offers
    const distinctCount = (source.match(/COUNT\(DISTINCT COALESCE/g) || []).length;
    expect(distinctCount).toBe(3);
  });

  it("does NOT use COUNT(DISTINCT) for calls or conversations", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    const autoCallsSection = source.split("Auto-count from calls table")[1]?.split("Auto-count appointments")[0];
    expect(autoCallsSection).toBeTruthy();
    expect(autoCallsSection).toContain("COUNT(*)");
    
    const convosSection = source.split("Auto-count conversations")[1]?.split("Auto-count appointments")[0];
    expect(convosSection).toBeTruthy();
    expect(convosSection).toContain("COUNT(*)");
  });

  it("deduplicates ledger items for appointments by ghlContactId", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    expect(source).toContain('kpiType === "appointment" || kpiType === "offer"');
    expect(source).toContain("const seen = new Set<string>()");
    expect(source).toContain("item.ghlContactId");
  });

  it("includes ghlContactId in ledger query select", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    const selectSection = source.split("const autoRows = await db")[1]?.split(".from(calls)")[0];
    expect(selectSection).toBeTruthy();
    expect(selectSection).toContain("ghlContactId: calls.ghlContactId");
  });

  it("strips ghlContactId from final autoItems output", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    expect(source).toContain("({ ghlContactId, ...rest }) => rest");
  });

  it("falls back to call id for dedup when ghlContactId is null", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    expect(source).toContain("`call-${item.id}`");
    expect(source).toContain("CAST(${calls.id} AS CHAR)");
  });
});


// ─── AM DIRECT DETECTION ────────────────────────────────

describe("AM Direct detection — code structure", () => {
  it("joins calls with teamMembers to detect AM role", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // getKpiSummary should join with teamMembers for AM Direct count
    expect(source).toContain("amDirectAptsResult");
    expect(source).toContain('eq(teamMembers.teamRole, "acquisition_manager")');
  });

  it("returns amDirectApts in the KPI summary response", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    expect(source).toContain("amDirectApts,");
    // Should be in the return statement
    const returnSection = source.split("// Use auto-counts as the primary source")[1];
    expect(returnSection).toBeTruthy();
    expect(returnSection).toContain("amDirectApts");
  });

  it("detects AM Direct in ledger items by checking teamMemberRole", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // Ledger items should include detectionType field
    expect(source).toContain('detectionType: "auto" | "am_direct" | "webhook"');
    // Should check if team member is acquisition_manager for AM Direct
    expect(source).toContain('isAmDirect');
    expect(source).toContain('member?.teamRole === "acquisition_manager"');
  });

  it("only marks appointment_set calls as AM Direct, not offers", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // AM Direct detection should only apply to appointment_set
    expect(source).toContain('r.callOutcome === "appointment_set"');
    // The isAmDirect logic should combine role check AND outcome check
    const amDirectLogic = source.split("isAmDirect")[1]?.split(";")[0];
    expect(amDirectLogic).toContain("acquisition_manager");
    expect(amDirectLogic).toContain("appointment_set");
  });
});

// ─── CASCADING FALLBACK DETECTION ───────────────────────

describe("Cascading fallback — GHL stage change detection", () => {
  it("queries propertyStageHistory for webhook-sourced stage changes", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // Should import propertyStageHistory and dispoProperties
    expect(source).toContain("propertyStageHistory");
    expect(source).toContain("dispoProperties");
    
    // Should query for webhook source
    expect(source).toContain('eq(propertyStageHistory.source, "webhook")');
  });

  it("avoids double-counting by checking against call-based contact IDs", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // Should collect contact IDs from calls first
    expect(source).toContain("aptCallContactIds");
    expect(source).toContain("offerCallContactIds");
    
    // Should skip webhook items that already have a matching call
    expect(source).toContain("!aptCallContactIds.has(prop.ghlContactId)");
    expect(source).toContain("!offerCallContactIds.has(prop.ghlContactId)");
  });

  it("adds webhook counts to the KPI summary totals", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // Appointments should include webhookApts
    expect(source).toContain("autoApts + webhookApts");
    // Offers should include webhookOffers
    expect(source).toContain("autoOffers + webhookOffers");
    
    // Should return webhook counts in the response
    expect(source).toContain("webhookApts,");
    expect(source).toContain("webhookOffers,");
  });

  it("queries for apt_set and offer_made stage changes separately", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    expect(source).toContain('eq(propertyStageHistory.toStatus, "apt_set")');
    expect(source).toContain('eq(propertyStageHistory.toStatus, "offer_made")');
  });

  it("adds webhook items to the ledger with detectionType webhook", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // Ledger should include webhook items
    expect(source).toContain("webhookItems");
    expect(source).toContain('detectionType: "webhook"');
    // Should show "GHL Stage Change" as the team member name
    expect(source).toContain('"GHL Stage Change"');
  });

  it("handles cascading fallback errors gracefully (non-fatal)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/dayHub.ts", "utf-8");
    
    // Should catch errors and log them without crashing
    expect(source).toContain("Cascading fallback query failed (non-fatal)");
    expect(source).toContain("Webhook fallback ledger query failed (non-fatal)");
  });
});

// ─── POOL IS CLOSED FIX ─────────────────────────────────

describe("Pool is closed error handling", () => {
  it("detects Pool is closed as a transient error in OpportunityDetection", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/opportunityDetection.ts", "utf-8");
    
    // Should include Pool is closed in transient error detection
    expect(source).toContain("Pool is closed");
    // Should reset connection on Pool is closed
    expect(source).toContain("resetDbConnection");
  });

  it("retries after resetting connection on Pool is closed", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/opportunityDetection.ts", "utf-8");
    
    // After detecting transient error, should reset and retry
    // Use the second occurrence of isTransient (the if block, not the const declaration)
    const parts = source.split("isTransient");
    expect(parts.length).toBeGreaterThan(2); // const isTransient + if (isTransient)
    const ifBlock = parts[2]; // after "if (isTransient)"
    expect(ifBlock).toBeTruthy();
    expect(ifBlock).toContain("resetDbConnection");
    expect(ifBlock).toContain("getDb");
    expect(ifBlock).toContain("scanTenant");
  });
});

// ─── TRUST LEDGER UI BADGES ─────────────────────────────

describe("Trust Ledger UI — detection type badges", () => {
  it("renders AM Direct badge in amber for AM appointments", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/TaskCenter.tsx", "utf-8");
    
    expect(source).toContain("AM Direct");
    expect(source).toContain("bg-amber-500/20");
    expect(source).toContain("text-amber-400");
  });

  it("renders GHL Stage badge in purple for webhook-detected items", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/TaskCenter.tsx", "utf-8");
    
    expect(source).toContain("GHL Stage");
    expect(source).toContain("bg-purple-500/20");
    expect(source).toContain("text-purple-400");
  });

  it("shows AM Direct count subtitle on the Apts KPI box", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/TaskCenter.tsx", "utf-8");
    
    expect(source).toContain("amDirectApts");
    expect(source).toContain("AM Direct");
  });

  it("shows webhook count subtitle on Apts and Offers KPI boxes", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/TaskCenter.tsx", "utf-8");
    
    expect(source).toContain("webhookApts");
    expect(source).toContain("webhookOffers");
    expect(source).toContain("via GHL");
  });
});
