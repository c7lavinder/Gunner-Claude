import { describe, it, expect } from "vitest";
import {
  LEAD_MANAGER_RUBRIC,
  FOLLOW_UP_RUBRIC,
  SELLER_CALLBACK_RUBRIC,
  ACQUISITION_MANAGER_RUBRIC,
  LEAD_GENERATOR_RUBRIC,
  ADMIN_CALLBACK_RUBRIC,
} from "./grading";

const TIMELINE_RED_FLAG =
  "Seller offered a timeline or availability window but agent left the conversation open-ended without locking in a follow-up date";

describe("Timeline Coaching Nudge — Rubric Red Flags", () => {
  it("Lead Manager rubric includes the timeline red flag", () => {
    expect(LEAD_MANAGER_RUBRIC.redFlags).toContain(TIMELINE_RED_FLAG);
  });

  it("Follow-Up rubric includes the timeline red flag", () => {
    expect(FOLLOW_UP_RUBRIC.redFlags).toContain(TIMELINE_RED_FLAG);
  });

  it("Seller Callback rubric includes the timeline red flag", () => {
    expect(SELLER_CALLBACK_RUBRIC.redFlags).toContain(TIMELINE_RED_FLAG);
  });

  it("Acquisition Manager rubric does NOT include the timeline red flag (offer calls are different)", () => {
    // Offer calls are about presenting price, not scheduling follow-ups from seller timelines
    // This is intentional — the nudge applies to qualification, follow-up, and callback calls
    expect(ACQUISITION_MANAGER_RUBRIC.redFlags).not.toContain(TIMELINE_RED_FLAG);
  });

  it("Lead Generator rubric does NOT include the timeline red flag (cold calls are about generating interest)", () => {
    expect(LEAD_GENERATOR_RUBRIC.redFlags).not.toContain(TIMELINE_RED_FLAG);
  });

  it("Admin Callback rubric does NOT include the timeline red flag (not sales calls)", () => {
    expect(ADMIN_CALLBACK_RUBRIC.redFlags).not.toContain(TIMELINE_RED_FLAG);
  });
});

describe("Timeline Coaching Nudge — Rubric Structure", () => {
  it("Lead Manager rubric has Call Outcome criterion that can be penalized", () => {
    const callOutcome = LEAD_MANAGER_RUBRIC.criteria.find(
      (c) => c.name === "Call Outcome"
    );
    expect(callOutcome).toBeDefined();
    expect(callOutcome!.description).toContain("next steps");
  });

  it("Follow-Up rubric has decision/next step criteria", () => {
    const pushed = FOLLOW_UP_RUBRIC.criteria.find(
      (c) => c.name === "Pushed for a Decision"
    );
    const nextStep = FOLLOW_UP_RUBRIC.criteria.find(
      (c) => c.name === "Handled Objection / Set Concrete Next Step"
    );
    expect(pushed).toBeDefined();
    expect(nextStep).toBeDefined();
  });

  it("Seller Callback rubric has commitment and next step criteria", () => {
    const commitment = SELLER_CALLBACK_RUBRIC.criteria.find(
      (c) => c.name === "Moved Toward Commitment"
    );
    const nextStep = SELLER_CALLBACK_RUBRIC.criteria.find(
      (c) => c.name === "Set Firm Next Step with Timeline"
    );
    expect(commitment).toBeDefined();
    expect(nextStep).toBeDefined();
  });
});

describe("Rule 15 Scan Window", () => {
  it("should use 1-day lookback (not 3-day) for timeline detection", async () => {
    // Read the source file and verify the scan window
    const fs = await import("fs");
    const source = fs.readFileSync(
      "./server/opportunityDetection.ts",
      "utf-8"
    );

    // The detectTimelineNoCommitment function should use 1 day, not 3 days
    // Look for the oneDayAgo variable in the function
    const timelineFunction = source.substring(
      source.indexOf("async function detectTimelineNoCommitment"),
      source.indexOf(
        "// ============",
        source.indexOf("async function detectTimelineNoCommitment") + 1
      ) || source.length
    );

    expect(timelineFunction).toContain("1 * 24 * 60 * 60 * 1000");
    expect(timelineFunction).toContain("oneDayAgo");
    expect(timelineFunction).not.toContain("threeDaysAgo");
  });
});
