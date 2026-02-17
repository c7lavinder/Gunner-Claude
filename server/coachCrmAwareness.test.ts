import { describe, it, expect } from "vitest";
import { PLATFORM_KNOWLEDGE } from "./platformKnowledge";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to ensure the AI Coach system prompts ALWAYS include CRM action awareness.
 * This prevents the LLM from saying "I can't add notes" or "I don't have CRM access".
 */

describe("AI Coach CRM Action Awareness", () => {
  describe("PLATFORM_KNOWLEDGE includes CRM actions", () => {
    it("should list all 6 CRM action types", () => {
      expect(PLATFORM_KNOWLEDGE).toContain("Add a note to any contact");
      expect(PLATFORM_KNOWLEDGE).toContain("Change a contact's pipeline stage");
      expect(PLATFORM_KNOWLEDGE).toContain("Send an SMS to a contact");
      expect(PLATFORM_KNOWLEDGE).toContain("Create a follow-up task");
      expect(PLATFORM_KNOWLEDGE).toContain("Add or remove tags on a contact");
      expect(PLATFORM_KNOWLEDGE).toContain("Update a custom field on a contact");
    });

    it("should contain CRM Actions section header", () => {
      expect(PLATFORM_KNOWLEDGE).toContain("CRM Actions");
    });

    it("should mention GoHighLevel CRM", () => {
      expect(PLATFORM_KNOWLEDGE).toContain("GoHighLevel CRM");
    });

    it("should include usage examples", () => {
      expect(PLATFORM_KNOWLEDGE).toContain("Add a note to John Smith");
      expect(PLATFORM_KNOWLEDGE).toContain("Move John Smith to Pending Appointment");
      expect(PLATFORM_KNOWLEDGE).toContain("Send a text to Jane Doe");
    });

    it("should explain multi-action support", () => {
      expect(PLATFORM_KNOWLEDGE).toContain("multiple actions in one message");
    });

    it("should explain the preview/confirm flow", () => {
      expect(PLATFORM_KNOWLEDGE).toContain("preview card");
      expect(PLATFORM_KNOWLEDGE).toContain("review and edit before confirming");
    });
  });

  describe("Streaming coach prompt includes CRM awareness with ACTION_REDIRECT", () => {
    it("should contain CRM ACTION CAPABILITIES block in coachStream.ts", () => {
      const coachStreamPath = path.join(__dirname, "coachStream.ts");
      const content = fs.readFileSync(coachStreamPath, "utf-8");

      // Must contain the CRM capabilities block
      expect(content).toContain("CRM ACTION CAPABILITIES:");
      expect(content).toContain("You have FULL access to the team's GoHighLevel CRM");
      expect(content).toContain("Add notes to contacts");
      expect(content).toContain("Change pipeline stages");
      expect(content).toContain("Send SMS messages to contacts");
      expect(content).toContain("Create follow-up tasks");
      expect(content).toContain("Add or remove tags on contacts");
      expect(content).toContain("Update custom fields on contacts");
    });

    it("should explicitly prohibit denying CRM access", () => {
      const coachStreamPath = path.join(__dirname, "coachStream.ts");
      const content = fs.readFileSync(coachStreamPath, "utf-8");

      expect(content).toContain("NEVER say");
      expect(content).toContain("I can't directly add notes");
      expect(content).toContain("I don't have access to your CRM");
    });

    it("should use ACTION_REDIRECT signal instead of telling user to retype", () => {
      const coachStreamPath = path.join(__dirname, "coachStream.ts");
      const content = fs.readFileSync(coachStreamPath, "utf-8");

      expect(content).toContain("[ACTION_REDIRECT]");
      expect(content).toContain("automatically route the request to the action handler");
      // Must NOT contain the old "retype as command" instruction
      expect(content).not.toContain("Just type your request as a command");
      expect(content).not.toContain("type your request as a command and I'll create it for you");
    });

    it("should explicitly prohibit telling users to retype", () => {
      const coachStreamPath = path.join(__dirname, "coachStream.ts");
      const content = fs.readFileSync(coachStreamPath, "utf-8");

      expect(content).toContain("NEVER tell the user to retype or rephrase their request as a command");
    });
  });

  describe("tRPC askQuestion prompt includes CRM awareness with ACTION_REDIRECT", () => {
    it("should contain CRM ACTION CAPABILITIES block in routers.ts", () => {
      const routersPath = path.join(__dirname, "routers.ts");
      const content = fs.readFileSync(routersPath, "utf-8");

      // Must contain the CRM capabilities block (at least once for the askQuestion prompt)
      expect(content).toContain("CRM ACTION CAPABILITIES:");
      expect(content).toContain("You have FULL access to the team's GoHighLevel CRM");
    });

    it("should explicitly prohibit denying CRM access in routers.ts", () => {
      const routersPath = path.join(__dirname, "routers.ts");
      const content = fs.readFileSync(routersPath, "utf-8");

      // The routers.ts should also have the anti-denial rule
      expect(content).toContain("NEVER say");
      expect(content).toContain("I don't have access to your CRM");
    });

    it("should use ACTION_REDIRECT signal in routers.ts instead of retype instruction", () => {
      const routersPath = path.join(__dirname, "routers.ts");
      const content = fs.readFileSync(routersPath, "utf-8");

      expect(content).toContain("[ACTION_REDIRECT]");
      // Must NOT contain the old instruction
      expect(content).not.toContain("Just type your request as a command and I'll create it for you");
    });
  });

  describe("parseIntent prompt detects conversational action requests", () => {
    it("should contain examples of conversational action phrasing", () => {
      const routersPath = path.join(__dirname, "routers.ts");
      const content = fs.readFileSync(routersPath, "utf-8");

      expect(content).toContain("DETECT CONVERSATIONAL ACTION REQUESTS");
      expect(content).toContain("Can you add a note to John?");
      expect(content).toContain("I need to update the stage for this contact");
      expect(content).toContain("Could you send a text to Jane?");
      expect(content).toContain("Set a reminder to call back tomorrow");
    });

    it("should instruct not to return empty actions for conversational requests", () => {
      const routersPath = path.join(__dirname, "routers.ts");
      const content = fs.readFileSync(routersPath, "utf-8");

      expect(content).toContain("Do NOT return empty actions for these");
    });
  });

  describe("Frontend ACTION_REDIRECT handling", () => {
    it("should detect ACTION_REDIRECT in streaming response and re-route to parseIntent", () => {
      const callInboxPath = path.join(__dirname, "../client/src/pages/CallInbox.tsx");
      const content = fs.readFileSync(callInboxPath, "utf-8");

      // Must check for ACTION_REDIRECT in streamed content
      expect(content).toContain('[ACTION_REDIRECT]');
      expect(content).toContain('actionRedirectDetected');
      // Must re-route through parseIntent when detected
      expect(content).toContain('parseIntentMutation.mutateAsync');
    });

    it("should handle ACTION_REDIRECT in non-streaming fallback", () => {
      const callInboxPath = path.join(__dirname, "../client/src/pages/CallInbox.tsx");
      const content = fs.readFileSync(callInboxPath, "utf-8");

      // Non-streaming fallback should also check for ACTION_REDIRECT
      expect(content).toContain('response.answer.includes("[ACTION_REDIRECT]")');
    });

    it("should show processing message during ACTION_REDIRECT re-routing", () => {
      const callInboxPath = path.join(__dirname, "../client/src/pages/CallInbox.tsx");
      const content = fs.readFileSync(callInboxPath, "utf-8");

      expect(content).toContain('creating that for you now');
    });
  });
});
