import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests to ensure check_off_task is properly recognized as a valid action type
 * throughout the system. This was a bug where the GHL executor and NextSteps UI
 * supported check_off_task, but the parseIntent and createPending validation
 * arrays didn't include it, causing "I couldn't determine the action type" errors.
 */

describe("check_off_task action type validation", () => {
  const routersPath = path.join(__dirname, "routers.ts");
  const routersContent = fs.readFileSync(routersPath, "utf-8");

  it("should include check_off_task in parseIntent VALID_ACTION_TYPES", () => {
    // The parseIntent route validates action types returned by the LLM
    // check_off_task must be in this list or the LLM's response gets filtered out
    const parseIntentSection = routersContent.substring(
      routersContent.indexOf("parseIntent:"),
      routersContent.indexOf("createPending:")
    );
    expect(parseIntentSection).toContain('"check_off_task"');
  });

  it("should include check_off_task in createPending VALID_ACTION_TYPES", () => {
    // The createPending route validates the actionType before creating a pending action
    // check_off_task must be in this list or the Push to GHL button fails
    const createPendingSection = routersContent.substring(
      routersContent.indexOf("createPending:")
    );
    expect(createPendingSection).toContain('"check_off_task"');
  });

  it("should handle check_off_task in ghlActions executor", () => {
    const ghlActionsPath = path.join(__dirname, "ghlActions.ts");
    const ghlActionsContent = fs.readFileSync(ghlActionsPath, "utf-8");
    expect(ghlActionsContent).toContain('case "check_off_task"');
  });

  it("should have check_off_task config in NextStepsTab UI", () => {
    const nextStepsPath = path.join(__dirname, "../client/src/components/NextStepsTab.tsx");
    const nextStepsContent = fs.readFileSync(nextStepsPath, "utf-8");
    expect(nextStepsContent).toContain("check_off_task:");
    expect(nextStepsContent).toContain('"Check Off Task"');
  });

  it("should have matching VALID_ACTION_TYPES in both parseIntent and createPending", () => {
    // Extract both VALID_ACTION_TYPES arrays and ensure they match
    const matches = routersContent.match(/const VALID_ACTION_TYPES = \[([^\]]+)\]/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
    // Both arrays should be identical
    expect(matches![0]).toBe(matches![1]);
  });
});
