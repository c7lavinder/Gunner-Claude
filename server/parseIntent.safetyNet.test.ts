import { describe, expect, it } from "vitest";

/**
 * Tests for the parseIntent safety net logic that forces needsContactSearch=true
 * when the LLM returns a contactName but empty contactId.
 *
 * This logic lives in server/routers.ts inside the parseIntent procedure,
 * but we extract and test the pure transformation function here.
 */

// Replicate the safety net logic from routers.ts
function applyContactSearchSafetyNet(actions: any[]): any[] {
  for (const action of actions) {
    if (
      action.contactName &&
      action.contactName.trim() !== "" &&
      (!action.contactId || action.contactId.trim() === "")
    ) {
      if (!action.needsContactSearch) {
        action.needsContactSearch = true;
      }
    }
  }
  return actions;
}

// Replicate the frontend safety net logic
function shouldSearchContact(action: { needsContactSearch?: boolean; contactId?: string; contactName?: string }): boolean {
  return (
    (action.needsContactSearch || !action.contactId || !action.contactId.trim()) &&
    !!action.contactName
  );
}

describe("parseIntent safety net: force needsContactSearch when contactId is empty", () => {
  it("forces needsContactSearch=true when contactName exists but contactId is empty string", () => {
    const actions = [
      {
        actionType: "add_note",
        contactName: "Jessica Smith",
        contactId: "",
        needsContactSearch: false,
        params: { noteBody: "Test note" },
        summary: "Add note to Jessica Smith",
      },
    ];

    const result = applyContactSearchSafetyNet(actions);

    expect(result[0].needsContactSearch).toBe(true);
  });

  it("forces needsContactSearch=true when contactId is whitespace-only", () => {
    const actions = [
      {
        actionType: "send_sms",
        contactName: "John Doe",
        contactId: "   ",
        needsContactSearch: false,
        params: { message: "Hello" },
        summary: "Send SMS to John Doe",
      },
    ];

    const result = applyContactSearchSafetyNet(actions);

    expect(result[0].needsContactSearch).toBe(true);
  });

  it("does NOT force needsContactSearch when contactId is already provided", () => {
    const actions = [
      {
        actionType: "add_note",
        contactName: "Jessica Smith",
        contactId: "ghl_abc123",
        needsContactSearch: false,
        params: { noteBody: "Test note" },
        summary: "Add note to Jessica Smith",
      },
    ];

    const result = applyContactSearchSafetyNet(actions);

    expect(result[0].needsContactSearch).toBe(false);
  });

  it("does NOT force needsContactSearch when contactName is empty", () => {
    const actions = [
      {
        actionType: "add_note",
        contactName: "",
        contactId: "",
        needsContactSearch: false,
        params: { noteBody: "General note" },
        summary: "Add general note",
      },
    ];

    const result = applyContactSearchSafetyNet(actions);

    expect(result[0].needsContactSearch).toBe(false);
  });

  it("preserves needsContactSearch=true when already set correctly", () => {
    const actions = [
      {
        actionType: "create_task",
        contactName: "Rita Adams",
        contactId: "",
        needsContactSearch: true,
        params: { title: "Follow up", description: "Call back" },
        summary: "Create task for Rita Adams",
      },
    ];

    const result = applyContactSearchSafetyNet(actions);

    expect(result[0].needsContactSearch).toBe(true);
  });

  it("handles multiple actions, forcing search only where needed", () => {
    const actions = [
      {
        actionType: "add_note",
        contactName: "Jessica Smith",
        contactId: "",
        needsContactSearch: false,
        params: { noteBody: "Note 1" },
        summary: "Add note to Jessica",
      },
      {
        actionType: "send_sms",
        contactName: "John Doe",
        contactId: "ghl_xyz789",
        needsContactSearch: false,
        params: { message: "Hello" },
        summary: "Send SMS to John",
      },
      {
        actionType: "create_task",
        contactName: "Rita Adams",
        contactId: "",
        needsContactSearch: false,
        params: { title: "Follow up" },
        summary: "Create task for Rita",
      },
    ];

    const result = applyContactSearchSafetyNet(actions);

    expect(result[0].needsContactSearch).toBe(true); // Jessica: no contactId → forced
    expect(result[1].needsContactSearch).toBe(false); // John: has contactId → unchanged
    expect(result[2].needsContactSearch).toBe(true); // Rita: no contactId → forced
  });
});

describe("frontend shouldSearchContact helper", () => {
  it("returns true when needsContactSearch is true and contactName exists", () => {
    expect(
      shouldSearchContact({
        needsContactSearch: true,
        contactId: "",
        contactName: "Jessica",
      })
    ).toBe(true);
  });

  it("returns true when needsContactSearch is false but contactId is empty", () => {
    expect(
      shouldSearchContact({
        needsContactSearch: false,
        contactId: "",
        contactName: "Jessica",
      })
    ).toBe(true);
  });

  it("returns true when contactId is undefined", () => {
    expect(
      shouldSearchContact({
        needsContactSearch: false,
        contactId: undefined,
        contactName: "Jessica",
      })
    ).toBe(true);
  });

  it("returns false when contactId is provided and needsContactSearch is false", () => {
    expect(
      shouldSearchContact({
        needsContactSearch: false,
        contactId: "ghl_abc123",
        contactName: "Jessica",
      })
    ).toBe(false);
  });

  it("returns false when contactName is empty", () => {
    expect(
      shouldSearchContact({
        needsContactSearch: false,
        contactId: "",
        contactName: "",
      })
    ).toBe(false);
  });

  it("returns false when contactName is undefined", () => {
    expect(
      shouldSearchContact({
        needsContactSearch: true,
        contactId: "",
        contactName: undefined,
      })
    ).toBe(false);
  });
});
