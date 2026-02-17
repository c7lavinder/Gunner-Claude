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

  describe("Streaming coach prompt includes CRM awareness", () => {
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

    it("should instruct the LLM to guide users to phrase action commands", () => {
      const coachStreamPath = path.join(__dirname, "coachStream.ts");
      const content = fs.readFileSync(coachStreamPath, "utf-8");

      expect(content).toContain("guide them to phrase it as a direct command");
    });
  });

  describe("tRPC askQuestion prompt includes CRM awareness", () => {
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
});
