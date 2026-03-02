import { describe, it, expect } from "vitest";
import * as fs from "fs";

/**
 * Tests for DQ-Aware Grading and Prior Context Awareness.
 * Validates that the grading prompt and AI Coach system prompt
 * include proper instructions for handling:
 * 1. Early disqualification calls — rewarded, not penalized
 * 2. Prior context from previous conversations/text leads
 */

const gradingContent = fs.readFileSync("server/grading.ts", "utf-8");
const routersContent = fs.readFileSync("server/routers.ts", "utf-8");

// ============ GRADING PROMPT: EARLY DISQUALIFICATION ============

describe("Grading Prompt - Early Disqualification Awareness", () => {
  it("should include EARLY DISQUALIFICATION AWARENESS section marked as CRITICAL", () => {
    expect(gradingContent).toContain("EARLY DISQUALIFICATION AWARENESS");
    expect(gradingContent).toContain("THIS IS CRITICAL");
  });

  it("should state efficient DQ is one of the most important skills", () => {
    expect(gradingContent).toContain("MOST IMPORTANT skills in sales");
  });

  it("should state a clean DQ is A/B-level performance, not a failure", () => {
    expect(gradingContent).toContain("A/B-level performance, NOT a failure");
  });

  it("should list common DQ reasons", () => {
    expect(gradingContent).toContain("not in buybox");
    expect(gradingContent).toContain("manufactured home");
    expect(gradingContent).toContain("fully remodeled");
    expect(gradingContent).toContain("going to list with agent");
    expect(gradingContent).toContain("not in service area");
    expect(gradingContent).toContain("price expectations are wildly above");
  });

  it("should instruct not to penalize for skipping deep qualification on DQ calls", () => {
    expect(gradingContent).toContain("DO NOT penalize for skipping deep qualification");
  });

  it("should instruct to give 75-90% for skipped criteria on DQ calls (not 50-70%)", () => {
    expect(gradingContent).toContain("75-90% of max points");
    // Old 50-70% neutral score should be gone
    expect(gradingContent).not.toContain("neutral score (50-70%");
  });

  it("should instruct DQ calls score 70-90% overall (B to A range)", () => {
    expect(gradingContent).toContain("70-90% overall (B to A range)");
  });

  it("should grade DQ calls on correct identification, professional exit, efficiency", () => {
    expect(gradingContent).toContain("Did the rep correctly identify WHY the lead doesn't work");
    expect(gradingContent).toContain("Was the exit professional and respectful");
    expect(gradingContent).toContain("Was the call efficient");
  });

  it("should state probing questions are nice-to-have, NOT required", () => {
    expect(gradingContent).toContain("Probing questions before DQ are nice-to-have, NOT required");
  });

  it("should include examples of good DQ behavior with B+ or higher scores", () => {
    expect(gradingContent).toContain("Examples of GOOD DQ behavior");
    expect(gradingContent).toContain("should score B+ or higher");
    expect(gradingContent).toContain("Score: 80-90%");
    expect(gradingContent).toContain("Score: 75-85%");
    expect(gradingContent).toContain("Score: 75-90%");
  });

  it("should still flag reps who give up on leads with actual potential", () => {
    expect(gradingContent).toContain("gave up on a lead that actually HAD potential");
    expect(gradingContent).toContain("Was the DQ CORRECT? If yes, reward it");
  });
});

// ============ GRADING PROMPT: PRIOR CONTEXT AWARENESS ============

describe("Grading Prompt - Prior Context Awareness", () => {
  it("should include PRIOR CONTEXT AWARENESS section", () => {
    expect(gradingContent).toContain("PRIOR CONTEXT AWARENESS");
  });

  it("should list phrases that indicate prior context", () => {
    expect(gradingContent).toContain("based on what you told me before");
    expect(gradingContent).toContain("from our text conversation");
    expect(gradingContent).toContain("I see in my notes");
    expect(gradingContent).toContain("last time we spoke");
    expect(gradingContent).toContain("we texted about this");
  });

  it("should instruct not to penalize for not re-gathering known info", () => {
    expect(gradingContent).toContain("DO NOT penalize for \"not gathering\" information that was clearly already known");
  });

  it("should mention text leads and inbound leads with pre-filled info", () => {
    expect(gradingContent).toContain("Text leads and inbound leads often come with pre-filled information");
  });

  it("should focus on whether rep HAS the info, not whether they asked on this call", () => {
    expect(gradingContent).toContain("Does the rep HAVE the information (from any source), not whether they asked for it on THIS specific call");
  });
});

// ============ AI COACH PROMPT: DQ CONTEXT ============

describe("AI Coach Prompt - Early Disqualification Context", () => {
  it("should include EARLY DISQUALIFICATION CONTEXT section", () => {
    expect(routersContent).toContain("EARLY DISQUALIFICATION CONTEXT");
  });

  it("should instruct coach to acknowledge DQ calls are graded differently", () => {
    expect(routersContent).toContain("quick DQ calls should be graded differently");
    expect(routersContent).toContain("correctly identifies a dead lead and exits efficiently is doing their job well");
  });

  it("should explain DQ grading criteria when user disputes", () => {
    expect(routersContent).toContain("DQ calls are graded on how well you confirmed the disqualification");
  });
});

// ============ AI COACH PROMPT: PRIOR CONTEXT ============

describe("AI Coach Prompt - Prior Context Awareness", () => {
  it("should include PRIOR CONTEXT AWARENESS section in coach prompt", () => {
    expect(routersContent).toContain("PRIOR CONTEXT AWARENESS");
  });

  it("should instruct coach to acknowledge prior context is valid", () => {
    expect(routersContent).toContain("already had notes");
    expect(routersContent).toContain("acknowledge this is valid");
  });
});

// ============ INTEGRATION: BOTH SYSTEMS ALIGNED ============

describe("Grading and Coach Systems Alignment", () => {
  it("both grading.ts and routers.ts should have DQ awareness", () => {
    expect(gradingContent).toContain("EARLY DISQUALIFICATION AWARENESS");
    expect(routersContent).toContain("EARLY DISQUALIFICATION CONTEXT");
  });

  it("both grading.ts and routers.ts should have prior context awareness", () => {
    expect(gradingContent).toContain("PRIOR CONTEXT AWARENESS");
    expect(routersContent).toContain("PRIOR CONTEXT AWARENESS");
  });
});
