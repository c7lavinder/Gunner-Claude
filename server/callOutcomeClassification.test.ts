/**
 * Tests for the tightened call outcome classification criteria.
 * Verifies that the grading prompt has strict definitions that prevent
 * over-classification of calls as "callback_scheduled".
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const gradingPath = path.join(__dirname, "grading.ts");
const gradingContent = fs.readFileSync(gradingPath, "utf-8");

describe("Call outcome classification criteria", () => {
  it("should have strict callback_scheduled definition requiring SPECIFIC date/time", () => {
    expect(gradingContent).toContain("seller explicitly agreed to receive a call back at a SPECIFIC date/time");
    expect(gradingContent).toContain("mutually agreed-upon specific time");
  });

  it("should list examples that do NOT qualify as callback_scheduled", () => {
    expect(gradingContent).toContain("I'll call you back");
    expect(gradingContent).toContain("Call me sometime next week");
    expect(gradingContent).toContain("I'll think about it and get back to you");
    expect(gradingContent).toContain("Feel free to reach out");
    expect(gradingContent).toContain("agent saying they will follow up");
  });

  it("should have expanded interested definition as the default for positive calls", () => {
    expect(gradingContent).toContain("USE THIS when the conversation was positive but ended without a firm next step");
    expect(gradingContent).toContain("seller saying \"call me back\" without a specific time");
  });

  it("should instruct to default to interested over callback_scheduled when in doubt", () => {
    expect(gradingContent).toContain('Default to "interested" over "callback_scheduled" when in doubt');
  });

  it("should have the default instruction in the JSON format example too", () => {
    expect(gradingContent).toContain("default to 'interested' over 'callback_scheduled' when in doubt");
  });

  it("should prioritize offer_made over callback_scheduled when an offer was discussed", () => {
    expect(gradingContent).toContain("This takes priority over callback_scheduled if an offer was discussed");
  });

  it("should require appointment_set to have a SPECIFIC date/time agreed upon", () => {
    expect(gradingContent).toContain("seller and agent agreed on an exact day and time to meet");
    expect(gradingContent).toContain("Vague statements like \"call me next week\" do NOT count");
  });

  it("should instruct to choose the MOST SPECIFIC outcome", () => {
    expect(gradingContent).toContain("choose the MOST SPECIFIC outcome that fits");
  });
});
