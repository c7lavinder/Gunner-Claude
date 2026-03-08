import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

/**
 * Tests for Dispo AI Action capabilities:
 * 1. Backend: ghlActions.ts has dispo action handlers in executeAction
 * 2. Backend: dispoAssistantStream.ts has ACTION_REDIRECT system prompt + parse-intent endpoint
 * 3. Backend: routers.ts has dispo action types in VALID_ACTION_TYPES
 * 4. Frontend: Inventory.tsx has action card rendering and confirm/cancel flow
 * 5. Schema: coachActionLog has dispo action types in the enum
 * 6. Dispo AI has CRM actions (send_sms, create_task, etc.)
 * 7. Dispo AI has conversation memory, coaching preferences, user instructions
 * 8. AI Coach has property action awareness
 */

describe("Dispo action types in schema", () => {
  const schema = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");

  const DISPO_ACTIONS = [
    "update_property_price",
    "update_property_status",
    "add_property_offer",
    "schedule_property_showing",
    "record_property_send",
    "add_property_note",
  ];

  for (const action of DISPO_ACTIONS) {
    it(`should include "${action}" in coachActionLog enum`, () => {
      expect(schema).toContain(`"${action}"`);
    });
  }
});

describe("Dispo action handlers in ghlActions.ts", () => {
  const ghlActions = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");

  it("should import inventory functions", () => {
    expect(ghlActions).toContain("updateProperty");
    expect(ghlActions).toContain("addPropertyOffer");
    expect(ghlActions).toContain("addPropertyShowing");
    expect(ghlActions).toContain("addPropertySend");
    expect(ghlActions).toContain("logPropertyActivity");
  });

  it("should handle update_property_price action", () => {
    expect(ghlActions).toContain('case "update_property_price"');
  });

  it("should handle update_property_status action", () => {
    expect(ghlActions).toContain('case "update_property_status"');
  });

  it("should handle add_property_offer action", () => {
    expect(ghlActions).toContain('case "add_property_offer"');
    expect(ghlActions).toContain("addPropertyOffer(action.tenantId");
  });

  it("should handle schedule_property_showing action", () => {
    expect(ghlActions).toContain('case "schedule_property_showing"');
    expect(ghlActions).toContain("addPropertyShowing(action.tenantId");
  });

  it("should handle record_property_send action", () => {
    expect(ghlActions).toContain('case "record_property_send"');
    expect(ghlActions).toContain("addPropertySend(action.tenantId");
  });

  it("should handle add_property_note action", () => {
    expect(ghlActions).toContain('case "add_property_note"');
    expect(ghlActions).toContain("logPropertyActivity(action.tenantId");
  });

  it("should log activity for all dispo actions", () => {
    const actionCases = ghlActions.match(/case "(?:update_property_price|update_property_status|add_property_offer|schedule_property_showing|record_property_send|add_property_note)"/g);
    expect(actionCases).toHaveLength(6);
  });

  it("should use action.requestedBy in dispo handlers", () => {
    const dispoSection = ghlActions.substring(
      ghlActions.indexOf('// ─── DISPO PROPERTY ACTIONS ───'),
      ghlActions.indexOf('default:', ghlActions.indexOf('// ─── DISPO PROPERTY ACTIONS ───'))
    );
    expect(dispoSection).toContain("action.requestedBy");
  });
});

describe("Dispo action types in VALID_ACTION_TYPES (routers.ts)", () => {
  const routers = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  const DISPO_ACTIONS = [
    "update_property_price",
    "update_property_status",
    "add_property_offer",
    "schedule_property_showing",
    "record_property_send",
    "add_property_note",
  ];

  it("should include all dispo action types in VALID_ACTION_TYPES", () => {
    const firstIdx = routers.indexOf("VALID_ACTION_TYPES");
    const firstLine = routers.substring(firstIdx, routers.indexOf(";", firstIdx));
    for (const action of DISPO_ACTIONS) {
      expect(firstLine).toContain(`"${action}"`);
    }
  });
});

describe("DispoAssistantStream with ACTION_REDIRECT", () => {
  const stream = readFileSync(join(SERVER_DIR, "dispoAssistantStream.ts"), "utf-8");

  it("should include ACTION_REDIRECT in system prompt", () => {
    expect(stream).toContain("[ACTION_REDIRECT]");
  });

  it("should define supported dispo actions in system prompt", () => {
    expect(stream).toContain("update_property_price");
    expect(stream).toContain("update_property_status");
    expect(stream).toContain("add_property_offer");
    expect(stream).toContain("schedule_property_showing");
    expect(stream).toContain("record_property_send");
    expect(stream).toContain("add_property_note");
  });

  it("should have parse-intent endpoint", () => {
    expect(stream).toContain("/api/dispo-assistant/parse-intent");
  });

  it("should use JSON schema response format for parse-intent", () => {
    expect(stream).toContain("response_format");
    expect(stream).toContain("json_schema");
  });

  it("should validate actions against VALID_DISPO_ACTIONS", () => {
    expect(stream).toContain("VALID_DISPO_ACTIONS");
  });

  it("should include property context in system prompt", () => {
    expect(stream).toContain("PROPERTY ID:");
  });

  it("should explain when to use and not use ACTION_REDIRECT", () => {
    expect(stream).toContain("When to use [ACTION_REDIRECT]");
    expect(stream).toContain("When NOT to use [ACTION_REDIRECT]");
  });
});

describe("Dispo AI CRM action support", () => {
  const stream = readFileSync(join(SERVER_DIR, "dispoAssistantStream.ts"), "utf-8");

  it("should support CRM actions in VALID_DISPO_ACTIONS", () => {
    expect(stream).toContain('"send_sms"');
    expect(stream).toContain('"create_task"');
    expect(stream).toContain('"add_note_contact"');
    expect(stream).toContain('"add_tag"');
    expect(stream).toContain('"remove_tag"');
  });

  it("should document CRM actions in the system prompt", () => {
    expect(stream).toContain("Send a text message to a buyer");
    expect(stream).toContain("Create a follow-up task for a buyer");
  });

  it("should document CRM actions in the parse-intent prompt", () => {
    expect(stream).toContain("send_sms");
    expect(stream).toContain("create_task");
    expect(stream).toContain("add_note_contact");
  });

  it("should document CRM action params in parse-intent prompt", () => {
    // CRM action params are documented in the prompt text (params is additionalProperties:true)
    expect(stream).toContain("Params: { message }");
    expect(stream).toContain("dueDate");
    expect(stream).toContain("tags (comma-separated)");
  });
});

describe("Dispo AI conversation memory", () => {
  const stream = readFileSync(join(SERVER_DIR, "dispoAssistantStream.ts"), "utf-8");

  it("should load conversation memory from coachMessages", () => {
    expect(stream).toContain("buildCoachMemoryContext");
    expect(stream).toContain("conversationMemory");
  });

  it("should save exchanges to coachMessages", () => {
    expect(stream).toContain("saveCoachExchange");
  });
});

describe("Dispo AI coaching preferences and user instructions", () => {
  const stream = readFileSync(join(SERVER_DIR, "dispoAssistantStream.ts"), "utf-8");

  it("should load coaching preferences", () => {
    expect(stream).toContain("buildPreferenceContext");
  });

  it("should load user instructions", () => {
    expect(stream).toContain("buildInstructionContext");
  });
});

describe("Frontend DispoAITab action support", () => {
  const inventory = readFileSync(join(CLIENT_DIR, "pages", "Inventory.tsx"), "utf-8");

  it("should define DISPO_ACTION_LABELS for property actions", () => {
    expect(inventory).toContain("DISPO_ACTION_LABELS");
    expect(inventory).toContain('"Update Price"');
    expect(inventory).toContain('"Change Status"');
    expect(inventory).toContain('"Record Offer"');
    expect(inventory).toContain('"Schedule Showing"');
    expect(inventory).toContain('"Record Send"');
  });

  it("should define DISPO_ACTION_LABELS for CRM actions", () => {
    expect(inventory).toContain('"Send SMS"');
    expect(inventory).toContain('"Create Task"');
    expect(inventory).toContain('"Add CRM Note"');
    expect(inventory).toContain('"Add Tag"');
    expect(inventory).toContain('"Remove Tag"');
    expect(inventory).toContain('"Create Appointment"');
  });

  it("should define DISPO_ACTION_ICONS for CRM actions", () => {
    expect(inventory).toContain("send_sms: MessageSquare");
    expect(inventory).toContain("create_task: CheckCircle2");
    expect(inventory).toContain("add_note: FileText");
  });

  it("should define DispoMessage type with actionCards", () => {
    expect(inventory).toContain("type DispoMessage");
    expect(inventory).toContain("actionCards?:");
  });

  it("should use coachActions.createPending mutation", () => {
    expect(inventory).toContain("trpc.coachActions.createPending.useMutation()");
  });

  it("should use coachActions.confirmAndExecute mutation", () => {
    expect(inventory).toContain("trpc.coachActions.confirmAndExecute.useMutation()");
  });

  it("should use coachActions.cancel mutation", () => {
    expect(inventory).toContain("trpc.coachActions.cancel.useMutation()");
  });

  it("should detect ACTION_REDIRECT in streaming response", () => {
    expect(inventory).toContain("[ACTION_REDIRECT]");
    expect(inventory).toContain("actionRedirectDetected");
  });

  it("should call parseIntent after ACTION_REDIRECT", () => {
    expect(inventory).toContain("parseIntent(originalUserText)");
  });

  it("should call /api/dispo-assistant/parse-intent", () => {
    expect(inventory).toContain("/api/dispo-assistant/parse-intent");
  });

  it("should render action cards with confirm and cancel buttons", () => {
    expect(inventory).toContain("renderActionCard");
    expect(inventory).toContain("handleConfirmAction");
    expect(inventory).toContain("handleCancelAction");
  });

  it("should show action status badges", () => {
    expect(inventory).toContain(">Done<");
    expect(inventory).toContain(">Failed<");
    expect(inventory).toContain(">Cancelled<");
    expect(inventory).toContain(">Executing...<");
  });

  it("should invalidate property queries after successful action", () => {
    expect(inventory).toContain("utils.inventory.getPropertyById.invalidate");
    expect(inventory).toContain("utils.inventory.getProperties.invalidate");
  });

  it("should show 'Preparing action...' during intent parsing", () => {
    expect(inventory).toContain("Preparing action...");
  });
});

describe("AI Coach property action awareness", () => {
  const routers = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
  const coachStream = readFileSync(join(SERVER_DIR, "coachStream.ts"), "utf-8");

  it("should document property action types in parseIntent prompt", () => {
    expect(routers).toContain("PROPERTY/DISPO ACTIONS");
    expect(routers).toContain("update_property_price - Update a property");
    expect(routers).toContain("update_property_status - Change a property");
    expect(routers).toContain("add_property_offer - Record a new offer");
    expect(routers).toContain("schedule_property_showing - Schedule a showing");
    expect(routers).toContain("record_property_send - Record an outreach");
    expect(routers).toContain("add_property_note - Add an activity note");
  });

  it("should include property action examples in parseIntent prompt", () => {
    expect(routers).toContain("Update the asking price");
    expect(routers).toContain("Change the property status");
    expect(routers).toContain("Add an offer from Mike");
    expect(routers).toContain("Schedule a showing for John");
    expect(routers).toContain("Record that I sent");
    expect(routers).toContain("Add a note to the property");
  });

  it("should include property params in parseIntent JSON schema", () => {
    expect(routers).toContain('propertyId: { type: "number" }');
    expect(routers).toContain('askingPrice: { type: "number" }');
    expect(routers).toContain('dispoAskingPrice: { type: "number" }');
    expect(routers).toContain('offerAmount: { type: "number" }');
    expect(routers).toContain('newStatus: { type: "string" }');
    expect(routers).toContain('buyerName: { type: "string" }');
    expect(routers).toContain('showingDate: { type: "string" }');
    expect(routers).toContain('channel: { type: "string" }');
  });

  it("should include property params in required array", () => {
    expect(routers).toContain('"propertyId"');
    expect(routers).toContain('"askingPrice"');
    expect(routers).toContain('"newStatus"');
    expect(routers).toContain('"buyerName"');
    expect(routers).toContain('"offerAmount"');
  });

  it("should document property action param formats in parseIntent", () => {
    expect(routers).toContain("all in CENTS");
    expect(routers).toContain("params.propertyId (required");
    expect(routers).toContain("params.newStatus");
  });

  it("should tell AI Coach it can execute property actions in stream prompt", () => {
    expect(coachStream).toContain("PROPERTY/DISPO actions");
    expect(coachStream).toContain("Update property pricing");
    expect(coachStream).toContain("Change property pipeline status");
    expect(coachStream).toContain("Record offers from buyers");
    expect(coachStream).toContain("Schedule property showings");
    expect(coachStream).toContain("Record outreach sends");
    expect(coachStream).toContain("Add activity notes to properties");
  });

  it("should include property actions in ACTION_REDIRECT trigger list", () => {
    expect(coachStream).toContain("CRM or property");
  });

  it("should not claim it cannot update properties", () => {
    expect(coachStream).toContain("property management access");
  });

  it("should have property action labels in TaskCenter", () => {
    const taskCenter = readFileSync(join(CLIENT_DIR, "pages", "TaskCenter.tsx"), "utf-8");
    expect(taskCenter).toContain('"Update Property Price"');
    expect(taskCenter).toContain('"Change Property Status"');
    expect(taskCenter).toContain('"Record Offer"');
    expect(taskCenter).toContain('"Schedule Showing"');
    expect(taskCenter).toContain('"Record Send"');
    expect(taskCenter).toContain('"Add Property Note"');
  });
});

describe("Bulk Send to Buyers", () => {
  const schema = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");
  const ghlActions = readFileSync(join(SERVER_DIR, "ghlActions.ts"), "utf-8");
  const routers = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
  const stream = readFileSync(join(SERVER_DIR, "dispoAssistantStream.ts"), "utf-8");
  const inventory = readFileSync(join(CLIENT_DIR, "pages", "Inventory.tsx"), "utf-8");
  const taskCenter = readFileSync(join(CLIENT_DIR, "pages", "TaskCenter.tsx"), "utf-8");

  it("should include bulk_send_buyers in schema enum", () => {
    expect(schema).toContain('"bulk_send_buyers"');
  });

  it("should handle bulk_send_buyers in executeAction", () => {
    expect(ghlActions).toContain('case "bulk_send_buyers"');
  });

  it("should include bulk_send_buyers in VALID_ACTION_TYPES", () => {
    expect(routers).toContain('"bulk_send_buyers"');
  });

  it("should have bulkSendToBuyers tRPC procedure", () => {
    expect(routers).toContain("bulkSendToBuyers:");
  });

  it("should include bulk_send_buyers in VALID_DISPO_ACTIONS", () => {
    expect(stream).toContain('"bulk_send_buyers"');
  });

  it("should document bulk_send_buyers in Dispo AI system prompt", () => {
    expect(stream).toContain("bulk_send_buyers");
    expect(stream).toContain("Send message to ALL interested buyers");
  });

  it("should have bulk_send_buyers label in DispoAITab", () => {
    expect(inventory).toContain('bulk_send_buyers: "Bulk Send to Buyers"');
  });

  it("should have bulk_send_buyers label in TaskCenter", () => {
    expect(taskCenter).toContain('bulk_send_buyers: "Bulk Send to Buyers"');
  });

  it("should have bulk_send_buyers icon in DispoAITab", () => {
    expect(inventory).toContain("bulk_send_buyers: Users");
  });
});

describe("AI Suggestions Widget", () => {
  const routers = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");
  const inventory = readFileSync(join(CLIENT_DIR, "pages", "Inventory.tsx"), "utf-8");

  it("should have getPropertySuggestions tRPC procedure", () => {
    expect(routers).toContain("getPropertySuggestions:");
  });

  it("should use LLM for generating suggestions", () => {
    const suggestionsSection = routers.substring(
      routers.indexOf("getPropertySuggestions:"),
      routers.indexOf("bulkSendToBuyers:")
    );
    expect(suggestionsSection).toContain("invokeLLM");
    expect(suggestionsSection).toContain("json_schema");
  });

  it("should analyze property data for suggestions", () => {
    const suggestionsSection = routers.substring(
      routers.indexOf("getPropertySuggestions:"),
      routers.indexOf("bulkSendToBuyers:")
    );
    expect(suggestionsSection).toContain("Days on Market");
    expect(suggestionsSection).toContain("Offers:");
    expect(suggestionsSection).toContain("Showings:");
    expect(suggestionsSection).toContain("Interested Buyers:");
  });

  it("should return suggestions with title, description, priority, and actionType", () => {
    const suggestionsSection = routers.substring(
      routers.indexOf("getPropertySuggestions:"),
      routers.indexOf("bulkSendToBuyers:")
    );
    expect(suggestionsSection).toContain('"title"');
    expect(suggestionsSection).toContain('"description"');
    expect(suggestionsSection).toContain('"priority"');
    expect(suggestionsSection).toContain('"actionType"');
  });

  it("should render AISuggestionsWidget in OverviewTab", () => {
    expect(inventory).toContain("AISuggestionsWidget");
    expect(inventory).toContain("getPropertySuggestions");
  });

  it("should show priority-colored suggestion cards", () => {
    expect(inventory).toContain("priorityColors");
    expect(inventory).toContain("rgba(239,68,68,0.1)"); // high priority
    expect(inventory).toContain("rgba(234,179,8,0.1)"); // medium priority
    expect(inventory).toContain("rgba(59,130,246,0.1)"); // low priority
  });

  it("should have a refresh button for suggestions", () => {
    expect(inventory).toContain("refetch");
    expect(inventory).toContain("Analyzing property...");
  });
});
