import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to verify the improved Next Steps prompt generates the right types of actions
 * and includes the proper context (calendars, style preferences, first-person notes).
 */

describe("Next Steps prompt improvements", () => {
  const gradingPath = path.join(__dirname, "grading.ts");
  const gradingContent = fs.readFileSync(gradingPath, "utf-8");
  const routersPath = path.join(__dirname, "routers.ts");
  const routersContent = fs.readFileSync(routersPath, "utf-8");

  describe("Auto-generation prompt (grading.ts - generateAndStoreNextSteps)", () => {
    // Extract the auto-generation function
    const autoGenSection = gradingContent.substring(
      gradingContent.indexOf("async function generateAndStoreNextSteps"),
      gradingContent.lastIndexOf("// ============ AUTO-GENERATE NEXT STEPS") > 0
        ? gradingContent.length
        : gradingContent.length
    );

    it("should fetch available calendars for appointment suggestions", () => {
      expect(autoGenSection).toContain("getCalendarsForTenant");
      expect(autoGenSection).toContain("AVAILABLE CALENDARS");
    });

    it("should fetch user style preferences", () => {
      expect(autoGenSection).toContain("buildPreferenceContext");
      expect(autoGenSection).toContain("USER STYLE PREFERENCES");
      expect(autoGenSection).toContain("styleContext");
    });

    it("should include styleContext in the user prompt", () => {
      // The user prompt should include styleContext so the LLM can match writing style
      expect(autoGenSection).toContain("${styleContext}");
    });

    it("should instruct the LLM to write first-person notes", () => {
      expect(autoGenSection).toContain("first-person paragraph");
      expect(autoGenSection).toContain("from the rep's perspective");
      expect(autoGenSection).toContain("NOT a template with labels");
    });

    it("should include specific note content requirements", () => {
      expect(autoGenSection).toContain("Exact motivation");
      expect(autoGenSection).toContain("Timeline");
      expect(autoGenSection).toContain("Property condition");
      expect(autoGenSection).toContain("Decision makers");
      expect(autoGenSection).toContain("Price expectations");
    });

    it("should include an example of a good note", () => {
      expect(autoGenSection).toContain("I spoke with Maria about her property on 4th Street");
    });

    it("should instruct against generic notes", () => {
      expect(autoGenSection).toContain('Do NOT write generic notes like "Motivated seller, follow up needed."');
    });

    it("should define the 4 core actions in priority order", () => {
      const addNoteIdx = autoGenSection.indexOf("1. ADD NOTE");
      const checkOffIdx = autoGenSection.indexOf("2. CHECK OFF TASK");
      const createTaskIdx = autoGenSection.indexOf("3. CREATE TASK");
      const createApptIdx = autoGenSection.indexOf("4. CREATE APPOINTMENT");

      expect(addNoteIdx).toBeGreaterThan(-1);
      expect(checkOffIdx).toBeGreaterThan(addNoteIdx);
      expect(createTaskIdx).toBeGreaterThan(checkOffIdx);
      expect(createApptIdx).toBeGreaterThan(createTaskIdx);
    });

    it("should include calendar selection guidance for appointments", () => {
      expect(autoGenSection).toContain("Offer Call");
      expect(autoGenSection).toContain("Walkthrough");
      expect(autoGenSection).toContain("CALENDAR SELECTION");
    });

    it("should instruct specific task titles", () => {
      expect(autoGenSection).toContain('Task titles should be specific');
    });

    it("should always request a detailed note in the user prompt", () => {
      expect(autoGenSection).toContain("ALWAYS include a detailed first-person note");
    });
  });

  describe("Manual generation prompt (routers.ts - generateNextSteps)", () => {
    const manualGenSection = routersContent.substring(
      routersContent.indexOf("generateNextSteps:"),
      routersContent.indexOf("getNextSteps:")
    );

    it("should instruct the LLM to write first-person notes", () => {
      expect(manualGenSection).toContain("first-person paragraph");
      expect(manualGenSection).toContain("from the rep's perspective");
    });

    it("should include the 4 core actions", () => {
      expect(manualGenSection).toContain("1. ADD NOTE");
      expect(manualGenSection).toContain("2. CHECK OFF TASK");
      expect(manualGenSection).toContain("3. CREATE TASK");
      expect(manualGenSection).toContain("4. CREATE APPOINTMENT");
    });

    it("should include calendar selection guidance", () => {
      expect(manualGenSection).toContain("Offer Call");
      expect(manualGenSection).toContain("Walkthrough");
      expect(manualGenSection).toContain("CALENDAR SELECTION");
    });

    it("should include the example good note", () => {
      expect(manualGenSection).toContain("I spoke with Maria about her property on 4th Street");
    });

    it("should request detailed first-person note in user prompt", () => {
      expect(manualGenSection).toContain("ALWAYS include a detailed first-person note");
    });
  });

  describe("Auto-generation is triggered after grading", () => {
    it("should call generateAndStoreNextSteps in processCall Step 10", () => {
      expect(gradingContent).toContain("Step 10: Auto-generate next steps");
      expect(gradingContent).toContain("await generateAndStoreNextSteps(callId)");
    });

    it("should not fail the whole grading process if next steps generation fails", () => {
      // The try-catch around generateAndStoreNextSteps should not rethrow
      const step10Section = gradingContent.substring(
        gradingContent.indexOf("Step 10: Auto-generate next steps"),
        gradingContent.indexOf("Successfully processed call")
      );
      expect(step10Section).toContain("catch (nextStepsError)");
      expect(step10Section).toContain("Don't fail the whole process");
    });
  });

  describe("Valid action types consistency", () => {
    it("should have matching valid types in auto-gen and manual-gen", () => {
      const autoTypes = [
        "check_off_task", "update_task", "create_task", "add_note",
        "create_appointment", "change_pipeline_stage", "send_sms",
        "schedule_sms", "add_to_workflow", "remove_from_workflow",
      ];

      for (const type of autoTypes) {
        expect(gradingContent).toContain(`"${type}"`);
        expect(routersContent).toContain(`"${type}"`);
      }
    });
  });
});
