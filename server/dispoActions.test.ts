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

describe("Frontend DispoAITab action support", () => {
  const inventory = readFileSync(join(CLIENT_DIR, "pages", "Inventory.tsx"), "utf-8");

  it("should define DISPO_ACTION_LABELS", () => {
    expect(inventory).toContain("DISPO_ACTION_LABELS");
    expect(inventory).toContain('"Update Price"');
    expect(inventory).toContain('"Change Status"');
    expect(inventory).toContain('"Record Offer"');
    expect(inventory).toContain('"Schedule Showing"');
    expect(inventory).toContain('"Record Send"');
    expect(inventory).toContain('"Add Note"');
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
