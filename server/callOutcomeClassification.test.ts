/**
 * Tests for the call outcome classification priority hierarchy.
 * Verifies that the grading prompt has a clear priority system that prevents
 * "callback_scheduled" from overriding substantive outcomes like offer_rejected,
 * offer_made, interested, etc.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const gradingPath = path.join(__dirname, "grading.ts");
const gradingContent = fs.readFileSync(gradingPath, "utf-8");

describe("Call outcome classification — priority hierarchy", () => {
  it("should establish outcome reflects DEAL STATUS, not follow-up logistics", () => {
    expect(gradingContent).toContain("outcome reflects the DEAL STATUS, not follow-up logistics");
    expect(gradingContent).toContain("SUBSTANTIVE RESULT of the call");
    expect(gradingContent).toContain("what happened BEFORE the \"let's talk again\" part");
  });

  it("should have a numbered priority hierarchy", () => {
    expect(gradingContent).toContain("Use this priority order");
    expect(gradingContent).toContain("1. offer_rejected (HIGHEST for rejected offers)");
    expect(gradingContent).toContain("2. offer_made");
    expect(gradingContent).toContain("3. appointment_set");
    expect(gradingContent).toContain("4. not_interested");
    expect(gradingContent).toContain("5. interested");
    expect(gradingContent).toContain("6. callback_scheduled (LOWEST priority among live conversations)");
  });

  it("should explicitly say offer_rejected wins even when callback is scheduled", () => {
    expect(gradingContent).toContain("EVEN IF a callback is scheduled after the rejection, the outcome is STILL \"offer_rejected\"");
    expect(gradingContent).toContain("I can't do $85k... but yeah, call me next week");
  });

  it("should explicitly say offer_made wins even when callback is scheduled", () => {
    expect(gradingContent).toContain("EVEN IF a callback is scheduled to discuss further, the outcome is \"offer_made\"");
    expect(gradingContent).toContain("Let me think about the $95k... call me Thursday");
  });

  it("should say callback_scheduled is RARE and LOWEST priority for live conversations", () => {
    expect(gradingContent).toContain("ONLY use this when literally nothing else happened on the call except agreeing to talk at a specific time");
    expect(gradingContent).toContain("This is RARE");
    expect(gradingContent).toContain("LOWEST priority among live conversations");
  });

  it("should list examples that do NOT qualify as callback_scheduled", () => {
    expect(gradingContent).toContain("I'll call you back");
    expect(gradingContent).toContain("Call me sometime next week");
    expect(gradingContent).toContain("I'll think about it and get back to you");
    expect(gradingContent).toContain("Feel free to reach out");
    expect(gradingContent).toContain("agent saying they will follow up");
  });

  it("should explicitly exclude offer calls from callback_scheduled", () => {
    expect(gradingContent).toContain("ANY call where an offer was discussed (use offer_made or offer_rejected instead)");
    expect(gradingContent).toContain("ANY call where the seller expressed clear interest or disinterest (use interested or not_interested)");
  });

  it("should have expanded interested definition as the default for positive calls", () => {
    expect(gradingContent).toContain("USE THIS when the conversation was positive but ended without a firm deal-related next step");
    expect(gradingContent).toContain("seller saying \"call me back\" without a specific time");
  });

  it("should have a CRITICAL RULE about callback_scheduled being almost never correct", () => {
    expect(gradingContent).toContain("callback_scheduled\" should almost NEVER be used for calls where a real conversation happened");
    expect(gradingContent).toContain("callback_scheduled' is almost never correct for real conversations");
  });

  it("should instruct to default to interested over callback_scheduled when in doubt", () => {
    expect(gradingContent).toContain('Default to "interested" over "callback_scheduled" when in doubt');
  });

  it("should require appointment_set to have a SPECIFIC date/time agreed upon", () => {
    expect(gradingContent).toContain("seller and agent agreed on an exact day and time to meet");
    expect(gradingContent).toContain("Vague statements like \"call me next week\" do NOT count");
  });

  it("should still require SPECIFIC date/time for callback_scheduled", () => {
    expect(gradingContent).toContain("seller explicitly agreed to receive a call back at a SPECIFIC date/time");
  });
});
