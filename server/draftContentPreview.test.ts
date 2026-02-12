import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

/**
 * Tests for AI Coach draft content preview.
 * Verifies that:
 * 1. LLM prompt instructs full draft content generation
 * 2. Frontend displays draft content in action cards before confirmation
 * 3. Edit flow works with the visible draft content
 */

describe("Draft Content Preview - LLM Prompt", () => {
  const routersSource = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  it("should instruct LLM to generate full draft text for notes", () => {
    expect(routersSource).toContain("Write the complete note body in params.noteBody");
    expect(routersSource).toContain("write the actual note");
  });

  it("should instruct LLM to generate full draft text for SMS", () => {
    expect(routersSource).toContain("Write the complete SMS message text in params.message");
    expect(routersSource).toContain("write the actual message that will be sent");
  });

  it("should instruct LLM to generate full draft text for tasks", () => {
    expect(routersSource).toContain("Write a clear task title in params.title");
    expect(routersSource).toContain("detailed description in params.description");
  });

  it("should instruct LLM to generate content upfront for review", () => {
    expect(routersSource).toContain("FULL DRAFT TEXT upfront so the user can review and edit");
  });

  it("should instruct LLM to keep summary short since content is shown separately", () => {
    expect(routersSource).toContain("SHORT one-line summary");
    expect(routersSource).toContain("full content will be shown separately");
  });
});

describe("Draft Content Preview - Frontend Display", () => {
  const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");

  it("should show draft content label for SMS actions", () => {
    expect(callInboxSource).toContain("SMS Draft:");
  });

  it("should show draft content label for note actions", () => {
    expect(callInboxSource).toContain("Note Draft:");
  });

  it("should show draft content label for task actions", () => {
    expect(callInboxSource).toContain("Task:");
  });

  it("should display draft content in a preview box when not editing", () => {
    // The dashed border preview box for showing content
    expect(callInboxSource).toContain("border-dashed");
    expect(callInboxSource).toContain("getEditableContent(msg.actionType, msg.payload)");
  });

  it("should show task description below title for create_task actions", () => {
    expect(callInboxSource).toContain("msg.payload?.description");
  });

  it("should check isEditableAction before showing draft preview", () => {
    expect(callInboxSource).toContain("isEditableAction(msg.actionType) && msg.payload");
  });

  it("should show textarea when editing", () => {
    expect(callInboxSource).toContain("editingActionId === msg.actionId");
    expect(callInboxSource).toContain("Textarea");
  });

  it("should fall back to summary for non-editable action types", () => {
    // Non-editable actions still show the summary text
    expect(callInboxSource).toContain("{msg.summary}");
  });

  it("should preserve the edit button for switching to edit mode", () => {
    expect(callInboxSource).toContain("handleStartEdit");
    expect(callInboxSource).toContain("Pencil");
  });
});

describe("Draft Content Preview - Edit Flow Integration", () => {
  const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");

  it("should have getEditableContent function that extracts content per action type", () => {
    expect(callInboxSource).toContain("const getEditableContent = (actionType: string, payload: any)");
  });

  it("should extract message for send_sms", () => {
    expect(callInboxSource).toContain('case "send_sms": return payload.message');
  });

  it("should extract noteBody for add_note actions", () => {
    expect(callInboxSource).toContain('case "add_note_contact"');
    expect(callInboxSource).toContain("return payload.noteBody");
  });

  it("should extract title for create_task", () => {
    expect(callInboxSource).toContain('case "create_task": return payload.title');
  });

  it("should send editedPayload to confirmAndExecute for learning system", () => {
    expect(callInboxSource).toContain("editedPayload");
    expect(callInboxSource).toContain("confirmExecuteMutation.mutateAsync");
  });
});
