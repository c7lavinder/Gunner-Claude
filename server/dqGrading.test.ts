import { describe, it, expect } from "vitest";

/**
 * Tests for DQ-Aware Grading and Prior Context Awareness.
 * Validates that the grading prompt and AI Coach system prompt
 * include proper instructions for handling:
 * 1. Early disqualification calls (not in buybox, no motivation, etc.)
 * 2. Prior context from previous conversations/text leads
 */

// ============ GRADING PROMPT: EARLY DISQUALIFICATION ============

describe("Grading Prompt - Early Disqualification Awareness", () => {
  it("should include EARLY DISQUALIFICATION AWARENESS section", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("EARLY DISQUALIFICATION AWARENESS");
  });

  it("should list common DQ reasons", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("not in buybox");
    expect(content).toContain("manufactured home");
    expect(content).toContain("going to list with agent");
    expect(content).toContain("not in service area");
  });

  it("should instruct not to penalize for skipping deep qualification on DQ calls", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("DO NOT penalize for skipping deep qualification");
    expect(content).toContain("Property Condition, Motivation Extraction, Price Discussion");
  });

  it("should instruct to grade DQ calls on DQ quality", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    // Should grade on probing questions, correct identification, professional exit, door left open
    expect(content).toContain("probing questions to CONFIRM the DQ is real");
    expect(content).toContain("correctly identify the DQ reason");
    expect(content).toContain("exit professionally");
    expect(content).toContain("leave the door open");
  });

  it("should acknowledge that quick DQ is good performance", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("quickly identifies a dead lead and moves on efficiently is doing their job WELL");
  });

  it("should still flag reps who give up too easily without probing", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("gave up too easily without any probing");
    expect(content).toContain("IS a legitimate area for improvement");
  });

  it("should instruct neutral scoring for N/A criteria on DQ calls", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("neutral score (50-70% of max points)");
    expect(content).toContain("Not applicable");
  });

  it("should mention the balance between speed and thoroughness", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    // Should mention that "I'm thinking about listing" is different from clear DQ
    expect(content).toContain("2-4 minute DQ call should NOT be graded the same as a 15-minute qualification call");
  });
});

// ============ GRADING PROMPT: PRIOR CONTEXT AWARENESS ============

describe("Grading Prompt - Prior Context Awareness", () => {
  it("should include PRIOR CONTEXT AWARENESS section", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("PRIOR CONTEXT AWARENESS");
  });

  it("should list phrases that indicate prior context", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("based on what you told me before");
    expect(content).toContain("from our text conversation");
    expect(content).toContain("I see in my notes");
    expect(content).toContain("last time we spoke");
    expect(content).toContain("we texted about this");
  });

  it("should instruct not to penalize for not re-gathering known info", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("DO NOT penalize for \"not gathering\" information that was clearly already known");
  });

  it("should mention text leads and inbound leads with pre-filled info", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("Text leads and inbound leads often come with pre-filled information");
  });

  it("should focus on whether rep HAS the info, not whether they asked on this call", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("Does the rep HAVE the information (from any source), not whether they asked for it on THIS specific call");
  });

  it("should give full credit when rep confirms prior info", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    expect(content).toContain("give full credit for those information-gathering criteria");
  });
});

// ============ AI COACH PROMPT: DQ CONTEXT ============

describe("AI Coach Prompt - Early Disqualification Context", () => {
  it("should include EARLY DISQUALIFICATION CONTEXT section", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("EARLY DISQUALIFICATION CONTEXT");
  });

  it("should instruct coach to acknowledge DQ calls are graded differently", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("quick DQ calls should be graded differently");
    expect(content).toContain("correctly identifies a dead lead and exits efficiently is doing their job well");
  });

  it("should explain DQ grading criteria when user disputes", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("DQ calls are graded on how well you confirmed the disqualification");
    expect(content).toContain("probing questions, correct identification, professional exit");
  });

  it("should emphasize the balance between quick exits and probing", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("always confirm with at least 1-2 probing questions before giving up");
    expect(content).toContain("manufactured home, fully remodeled, going to list next week");
  });

  it("should distinguish between ambiguous and clear DQ scenarios", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    // "thinking about listing" is ambiguous, "manufactured home going to list" is clear
    expect(content).toContain("I'm thinking about listing");
    expect(content).toContain("might still be persuadable");
  });
});

// ============ AI COACH PROMPT: PRIOR CONTEXT ============

describe("AI Coach Prompt - Prior Context Awareness", () => {
  it("should include PRIOR CONTEXT AWARENESS section in coach prompt", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    // Should appear in the system prompt rules section
    expect(content).toContain("PRIOR CONTEXT AWARENESS:\n24.");
  });

  it("should instruct coach to acknowledge prior context is valid", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("already had notes");
    expect(content).toContain("already knew the info");
    expect(content).toContain("acknowledge this is valid");
  });

  it("should mention text leads and CRM notes as valid prior context sources", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("texts, prior calls, or CRM notes");
  });
});

// ============ DANIEL'S SPECIFIC SCENARIOS ============

describe("Daniel's Specific Feedback Scenarios", () => {
  it("grading prompt should handle 'manufactured home fully remodeled going to list' scenario", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    // The DQ awareness section should cover this exact scenario type
    expect(content).toContain("manufactured home");
    expect(content).toContain("fully remodeled");
    expect(content).toContain("going to list");
  });

  it("grading prompt should handle 'not near his number and no motivation' scenario", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    // Should cover both "not in service area" and "no motivation"
    expect(content).toContain("not in service area");
    expect(content).toContain("no motivation");
  });

  it("grading prompt should handle 'already had notes from previous conversation' scenario", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/grading.ts", "utf-8");
    // Should cover prior context from previous conversations
    expect(content).toContain("previous conversations, text messages, CRM notes");
    expect(content).toContain("already known");
  });

  it("coach prompt should handle user saying 'not in buybox' as DQ justification", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/routers.ts", "utf-8");
    expect(content).toContain("not in buybox");
  });
});

// ============ INTEGRATION: BOTH SYSTEMS ALIGNED ============

describe("Grading and Coach Systems Alignment", () => {
  it("both grading.ts and routers.ts should have DQ awareness", async () => {
    const fs = await import("fs");
    const grading = fs.readFileSync("server/grading.ts", "utf-8");
    const routers = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(grading).toContain("EARLY DISQUALIFICATION AWARENESS");
    expect(routers).toContain("EARLY DISQUALIFICATION CONTEXT");
  });

  it("both grading.ts and routers.ts should have prior context awareness", async () => {
    const fs = await import("fs");
    const grading = fs.readFileSync("server/grading.ts", "utf-8");
    const routers = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(grading).toContain("PRIOR CONTEXT AWARENESS");
    expect(routers).toContain("PRIOR CONTEXT AWARENESS");
  });

  it("grading system should mention probing questions requirement (the balance)", async () => {
    const fs = await import("fs");
    const grading = fs.readFileSync("server/grading.ts", "utf-8");
    
    // Both should emphasize the balance: quick DQ is good, but verify first
    expect(grading).toContain("at least 1-2 probing questions");
    expect(grading).toContain("gave up too easily");
  });
});
