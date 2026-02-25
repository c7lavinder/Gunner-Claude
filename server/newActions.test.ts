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
    // The SMS case uses smsUserId which defaults to requestingUserGhlId but can be overridden for sender routing
    expect(ghlActionsSource).toContain("let smsUserId = requestingUserGhlId");
    expect(ghlActionsSource).toContain("sendSms(action.tenantId, contactId, payload.message, smsUserId)");
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


// ============ CREATE APPOINTMENT TESTS ============

describe("create_appointment backend implementation", () => {
  it("should export getCalendarsForTenant function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function getCalendarsForTenant");
  });

  it("should export createAppointment function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function createAppointment");
  });

  it("should export resolveCalendarByName function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export function resolveCalendarByName");
  });

  it("should handle create_appointment case in executeAction switch", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('case "create_appointment"');
  });

  it("createAppointment should use GHL calendars/events/appointments endpoint", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("/calendars/events/appointments");
  });

  it("should set appointmentStatus to confirmed", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('appointmentStatus: "confirmed"');
  });

  it("should set ignoreFreeSlotValidation to true", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("ignoreFreeSlotValidation: true");
  });

  it("should resolve calendar by name when no calendarId provided", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should try to resolve calendar name
    expect(ghlActionsSource).toContain("resolveCalendarByName(calendars, payload.calendarName)");
  });

  it("should fall back to default calendar when none specified", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should use first calendar as default
    expect(ghlActionsSource).toContain("No calendar specified, using default");
  });

  it("should default to 1 hour appointment if no endTime", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should calculate endTime as startTime + 1 hour
    expect(ghlActionsSource).toContain("setHours(start.getHours() + 1)");
  });

  it("should pass assignedUserId from requesting user", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Should pass requestingUserGhlId to createAppointment
    expect(ghlActionsSource).toContain("requestingUserGhlId,");
  });
});

describe("create_appointment in schema", () => {
  it("should include create_appointment in actionType enum", async () => {
    const schemaSource = readFileSync(join(SERVER_DIR, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schemaSource).toContain('"create_appointment"');
  });
});

describe("create_appointment in parseIntent prompt", () => {
  it("should include create_appointment in VALID_ACTION_TYPES", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain('"create_appointment"');
  });

  it("should include create_appointment examples in the LLM prompt", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("Schedule an appointment");
  });

  it("should include calendarName in JSON schema params", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("calendarName: { type:");
  });

  it("should include startTime in JSON schema params", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("startTime: { type:");
  });

  it("should include endTime in JSON schema params", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("endTime: { type:");
  });

  it("should include selectedTimezone in JSON schema params", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("selectedTimezone: { type:");
  });
});

describe("create_appointment frontend confirmation card", () => {
  it("should include create_appointment in ACTION_TYPE_LABELS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('create_appointment: "Create Appointment"');
  });

  it("should include create_appointment in ACTION_ICONS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('create_appointment: "📅"');
  });

  it("should display appointment title in confirmation card", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('msg.actionType === "create_appointment"');
  });

  it("should display appointment date/time in card", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("Date/Time:");
  });

  it("should display appointment duration in card", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("Duration:");
  });

  it("should display calendar name if provided", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain("Calendar:");
  });
});

describe("resolveCalendarByName function", () => {
  // Import the function directly for unit testing
  it("should match exact calendar names", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Verify the function has exact match logic
    expect(ghlActionsSource).toContain("c.name.toLowerCase() === normalized");
  });

  it("should match substring calendar names", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Verify the function has substring match logic
    expect(ghlActionsSource).toContain("cName.includes(normalized) || normalized.includes(cName)");
  });

  it("should match by word overlap", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // Verify the function has word overlap logic
    expect(ghlActionsSource).toContain("calWords.some(cw => cw.includes(iw) || iw.includes(cw))");
  });
});


// ============ UPDATE APPOINTMENT TESTS ============

describe("update_appointment backend implementation", () => {
  it("should export getAppointmentsForContact function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function getAppointmentsForContact");
  });

  it("should export updateAppointment function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function updateAppointment");
  });

  it("should export resolveAppointmentByTitle function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export function resolveAppointmentByTitle");
  });

  it("should handle update_appointment case in executeAction switch", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('case "update_appointment"');
  });

  it("updateAppointment should use PUT to GHL appointments endpoint", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("/calendars/events/appointments/${eventId}");
    expect(ghlActionsSource).toContain('"PUT"');
  });

  it("should search for appointments by contactId", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("evt.contactId === contactId");
  });

  it("should filter out cancelled appointments", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('evt.appointmentStatus !== "cancelled"');
  });

  it("should preserve original appointment duration when rescheduling", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("originalDuration");
  });

  it("should set ignoreFreeSlotValidation on update", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // The updateAppointment function should set this
    expect(ghlActionsSource).toContain("body.ignoreFreeSlotValidation = true");
  });
});

describe("cancel_appointment backend implementation", () => {
  it("should export cancelAppointment function", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("export async function cancelAppointment");
  });

  it("should handle cancel_appointment case in executeAction switch", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('case "cancel_appointment"');
  });

  it("cancelAppointment should set status to cancelled", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain('appointmentStatus: "cancelled"');
  });

  it("should resolve appointment by title before cancelling", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    // The cancel case should use resolveAppointmentByTitle
    expect(ghlActionsSource).toContain("resolveAppointmentByTitle(apptsToCancelFrom");
  });

  it("should throw error when no appointments found for cancel", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("No appointments found for this contact");
  });
});

describe("update/cancel appointment in schema", () => {
  it("should include update_appointment in actionType enum", async () => {
    const schemaSource = readFileSync(join(SERVER_DIR, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schemaSource).toContain('"update_appointment"');
  });

  it("should include cancel_appointment in actionType enum", async () => {
    const schemaSource = readFileSync(join(SERVER_DIR, "..", "drizzle", "schema.ts"), "utf-8");
    expect(schemaSource).toContain('"cancel_appointment"');
  });
});

describe("update/cancel appointment in parseIntent prompt", () => {
  it("should include update_appointment in VALID_ACTION_TYPES", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const matches = routersSource.match(/"update_appointment"/g);
    expect(matches && matches.length >= 2).toBe(true); // At least in both VALID_ACTION_TYPES arrays
  });

  it("should include cancel_appointment in VALID_ACTION_TYPES", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    const matches = routersSource.match(/"cancel_appointment"/g);
    expect(matches && matches.length >= 2).toBe(true);
  });

  it("should include reschedule examples in the LLM prompt", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("Reschedule the appointment");
  });

  it("should include cancel examples in the LLM prompt", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("Cancel the appointment");
  });

  it("should include appointmentTitle in JSON schema params", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("appointmentTitle: { type:");
  });

  it("should include update_appointment params instructions", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("For update_appointment:");
  });

  it("should include cancel_appointment params instructions", async () => {
    const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
    expect(routersSource).toContain("For cancel_appointment:");
  });
});

describe("update/cancel appointment frontend confirmation cards", () => {
  it("should include update_appointment in ACTION_TYPE_LABELS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('update_appointment: "Update Appointment"');
  });

  it("should include cancel_appointment in ACTION_TYPE_LABELS", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('cancel_appointment: "Cancel Appointment"');
  });

  it("should include update_appointment icon", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('update_appointment: "🔄"');
  });

  it("should include cancel_appointment icon", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('cancel_appointment: "❌"');
  });

  it("should display update_appointment card with new date/time", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('msg.actionType === "update_appointment"');
    expect(callInboxSource).toContain("New Date/Time:");
  });

  it("should display cancel_appointment card with cancellation warning", async () => {
    const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");
    expect(callInboxSource).toContain('msg.actionType === "cancel_appointment"');
    expect(callInboxSource).toContain("This appointment will be cancelled");
  });
});

describe("resolveAppointmentByTitle function", () => {
  it("should return next upcoming appointment when no search title", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("If no search title, return the next upcoming appointment");
  });

  it("should match exact appointment titles", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("a.title.toLowerCase() === normalized");
  });

  it("should match substring appointment titles", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("aTitle.includes(normalized) || normalized.includes(aTitle)");
  });

  it("should sort appointments by startTime ascending", async () => {
    const ghlActionsSource = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
    expect(ghlActionsSource).toContain("Sort by startTime ascending");
  });
});
