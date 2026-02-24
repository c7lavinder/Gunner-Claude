/**
 * Tests for AI Coach outcome formatting and response quality improvements.
 * Verifies that:
 * 1. Call outcomes are formatted as clean English in the data fed to the AI
 * 2. System prompt rules prevent generic filler and training material padding
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const coachStreamPath = path.join(__dirname, "coachStream.ts");
const coachStreamContent = fs.readFileSync(coachStreamPath, "utf-8");

describe("Outcome formatting in AI Coach data", () => {
  it("should have a formatOutcome helper function", () => {
    expect(coachStreamContent).toContain("const formatOutcome = (outcome: string): string =>");
  });

  it("should map all standard outcomes to clean English labels", () => {
    const expectedLabels = [
      "appointment_set: 'Appointment Set'",
      "offer_made: 'Offer Made'",
      "callback_scheduled: 'Callback Scheduled'",
      "interested: 'Interested'",
      "left_vm: 'Left Voicemail'",
      "no_answer: 'No Answer'",
      "not_interested: 'Not Interested'",
      "dead: 'Dead Lead'",
      "none: 'No Outcome'",
      "follow_up: 'Follow Up'",
    ];
    for (const label of expectedLabels) {
      expect(coachStreamContent).toContain(label);
    }
  });

  it("should have a fallback for unknown outcomes that converts snake_case to Title Case", () => {
    expect(coachStreamContent).toContain("outcome.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase())");
  });

  it("should use formatOutcome when building recent calls summary", () => {
    expect(coachStreamContent).toContain("Outcome: ${formatOutcome(call.callOutcome)}");
  });

  it("should use formatOutcome when building member outcome counts", () => {
    expect(coachStreamContent).toContain("${formatOutcome(o)}: ${c}");
  });
});

describe("System prompt anti-filler rules", () => {
  it("should limit response length to 2-4 sentences", () => {
    expect(coachStreamContent).toContain("Keep responses to 2-4 sentences");
  });

  it("should instruct not to pad with generic coaching advice", () => {
    expect(coachStreamContent).toContain("Do NOT pad responses with generic coaching advice or motivational filler");
  });

  it("should only mention training materials when user specifically asks", () => {
    expect(coachStreamContent).toContain("Only mention training materials if the user SPECIFICALLY asks about training, scripts, or talk tracks");
  });

  it("should not volunteer training material references", () => {
    expect(coachStreamContent).toContain("Do NOT volunteer training material references just to fill space");
  });

  it("should instruct to use clean English for data values", () => {
    expect(coachStreamContent).toContain("Use clean English for all data values");
    expect(coachStreamContent).toContain('Never output raw snake_case identifiers like "callback_scheduled"');
  });

  it("should instruct not to end with generic paragraphs", () => {
    expect(coachStreamContent).toContain("Do NOT end responses with generic paragraphs about persistence, strategy alignment, or training philosophy");
    expect(coachStreamContent).toContain("If you've answered the question, stop");
  });
});

describe("CallDetail.tsx outcome formatting", () => {
  const callDetailPath = path.join(__dirname, "../client/src/pages/CallDetail.tsx");
  const callDetailContent = fs.readFileSync(callDetailPath, "utf-8");

  it("should have proper outcome label mapping instead of raw replace", () => {
    expect(callDetailContent).toContain("appointment_set: 'Appointment Set'");
    expect(callDetailContent).toContain("callback_scheduled: 'Callback Scheduled'");
    expect(callDetailContent).toContain("offer_made: 'Offer Made'");
    expect(callDetailContent).toContain("left_vm: 'Left Voicemail'");
  });
});
