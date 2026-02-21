import { describe, it, expect } from "vitest";
import { LEAD_MANAGER_RUBRIC } from "./grading";

/**
 * Tests for AI Coach pushback/disagreement handling improvements:
 * 1. Self-reference detection (user asking about their own calls)
 * 2. Transcript inclusion in member call context
 * 3. Per-criterion score inclusion in member call context
 * 4. Pushback handling rules in system prompt
 * 5. Grading rubric flexibility for natural conversation styles
 */

// ============ SELF-REFERENCE DETECTION ============

describe("Self-Reference Detection", () => {
  // Simulate the self-reference regex from routers.ts
  const selfReferencePatterns = /\b(my calls|my score|my grade|my performance|i already|i do that|i do it|i say that|i always|my approach|my style|my technique|my opening|my intro|how i|what i say|what i do|when i call|i set expectations|i handle|i ask|my last call|my recent|my average|grade me|my transcript)\b/i;

  it("should detect 'i already do it' as self-reference", () => {
    expect(selfReferencePatterns.test("i already do it")).toBe(true);
  });

  it("should detect 'my calls' as self-reference", () => {
    expect(selfReferencePatterns.test("show me my calls")).toBe(true);
  });

  it("should detect 'my score' as self-reference", () => {
    expect(selfReferencePatterns.test("what is my score")).toBe(true);
  });

  it("should detect 'my grade' as self-reference", () => {
    expect(selfReferencePatterns.test("why is my grade so low")).toBe(true);
  });

  it("should detect 'I already set expectations' as self-reference", () => {
    expect(selfReferencePatterns.test("I already set expectations on my calls")).toBe(true);
  });

  it("should detect 'my approach' as self-reference", () => {
    expect(selfReferencePatterns.test("my approach works fine")).toBe(true);
  });

  it("should detect 'i do that' as self-reference", () => {
    expect(selfReferencePatterns.test("i do that on every call")).toBe(true);
  });

  it("should detect 'what i say' as self-reference", () => {
    expect(selfReferencePatterns.test("for example, what i say is...")).toBe(true);
  });

  it("should detect 'my last call' as self-reference", () => {
    expect(selfReferencePatterns.test("check my last call")).toBe(true);
  });

  it("should detect 'grade me' as self-reference", () => {
    expect(selfReferencePatterns.test("grade me on that")).toBe(true);
  });

  it("should detect 'my average' as self-reference", () => {
    expect(selfReferencePatterns.test("what is my average")).toBe(true);
  });

  it("should detect 'i handle objections' as self-reference", () => {
    expect(selfReferencePatterns.test("i handle objections differently")).toBe(true);
  });

  it("should NOT detect 'how is Daniel doing' as self-reference", () => {
    expect(selfReferencePatterns.test("how is Daniel doing")).toBe(false);
  });

  it("should NOT detect 'show me the team stats' as self-reference", () => {
    expect(selfReferencePatterns.test("show me the team stats")).toBe(false);
  });

  it("should NOT detect 'what is the best approach' as self-reference", () => {
    expect(selfReferencePatterns.test("what is the best approach for cold calls")).toBe(false);
  });
});

// ============ GRADE DISPUTE DETECTION ============

describe("Grade Dispute Detection", () => {
  // Simulate the dispute detection regex from routers.ts
  const isDisputingGrade = /\b(i already|i do that|i do it|but i|i always|i say|that's not fair|disagree|wrong|incorrect|i did|i said|my approach|my style|should.*score|should.*pass|should.*count)\b/i;

  it("should detect 'i already do it' as dispute", () => {
    expect(isDisputingGrade.test("i already do it")).toBe(true);
  });

  it("should detect 'that's not fair' as dispute", () => {
    expect(isDisputingGrade.test("that's not fair, I set expectations")).toBe(true);
  });

  it("should detect 'I disagree with the grade' as dispute", () => {
    expect(isDisputingGrade.test("I disagree with the grade")).toBe(true);
  });

  it("should detect 'that score is wrong' as dispute", () => {
    expect(isDisputingGrade.test("that score is wrong")).toBe(true);
  });

  it("should detect 'my approach should count' as dispute", () => {
    expect(isDisputingGrade.test("my approach should count for setting expectations")).toBe(true);
  });

  it("should detect 'should pass the setting expectations' as dispute", () => {
    expect(isDisputingGrade.test("should be able to pass the setting up expectations")).toBe(true);
  });

  it("should detect 'but I always say that' as dispute", () => {
    expect(isDisputingGrade.test("but I always say that at the beginning")).toBe(true);
  });

  it("should detect 'I said that on the call' as dispute", () => {
    expect(isDisputingGrade.test("I said that on the call")).toBe(true);
  });

  it("should detect 'my style works' as dispute", () => {
    expect(isDisputingGrade.test("my style works for me")).toBe(true);
  });

  it("should NOT detect 'how can I improve' as dispute", () => {
    expect(isDisputingGrade.test("how can I improve my score")).toBe(false);
  });

  it("should NOT detect 'what should I do differently' as dispute", () => {
    expect(isDisputingGrade.test("what should I do differently")).toBe(false);
  });
});

// ============ RUBRIC FLEXIBILITY ============

describe("Setting Expectations Rubric Flexibility", () => {
  const settingExpectations = LEAD_MANAGER_RUBRIC.criteria.find(
    c => c.name === "Setting Expectations"
  );

  it("should have a Setting Expectations criterion", () => {
    expect(settingExpectations).toBeDefined();
  });

  it("should mention both explicit AND conversational approaches in description", () => {
    expect(settingExpectations!.description).toContain("explicitly");
    expect(settingExpectations!.description).toContain("conversationally");
  });

  it("should mention 'mutual fit check' as a valid approach", () => {
    expect(settingExpectations!.description).toContain("mutual fit check");
  });

  it("should mention partial credit for conversational framing", () => {
    expect(settingExpectations!.description).toContain("partial credit");
  });

  it("should include conversational key phrases alongside scripted ones", () => {
    const phrases = settingExpectations!.keyPhrases;
    // Scripted phrases
    expect(phrases).toContain("Let me explain what this call will look like");
    expect(phrases).toContain("comfortable saying not a good fit");
    // Conversational phrases
    expect(phrases).toContain("good fit to work together");
    expect(phrases).toContain("couple of minutes to chat");
    expect(phrases).toContain("see if we can help");
  });

  it("should have at least 5 key phrases covering both styles", () => {
    expect(settingExpectations!.keyPhrases.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Red Flags Updated for Flexibility", () => {
  it("should not have the old rigid 'Not setting clear expectations' red flag", () => {
    expect(LEAD_MANAGER_RUBRIC.redFlags).not.toContain("Not setting clear expectations");
  });

  it("should have a more nuanced expectations red flag", () => {
    const expectationsFlag = LEAD_MANAGER_RUBRIC.redFlags.find(
      f => f.toLowerCase().includes("expectation") || f.toLowerCase().includes("frame")
    );
    expect(expectationsFlag).toBeDefined();
    // Should mention both explicit and conversational
    expect(expectationsFlag!.toLowerCase()).toContain("neither");
  });
});

// ============ GRADING PROMPT PHILOSOPHY ============

describe("Grading Prompt Philosophy", () => {
  it("should include GRADING PHILOSOPHY section in grading.ts", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("server/grading.ts", "utf-8");
    
    expect(gradingContent).toContain("GRADING PHILOSOPHY");
  });

  it("should mention different communication styles are valid", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("server/grading.ts", "utf-8");
    
    expect(gradingContent).toContain("different communication styles");
    expect(gradingContent).toContain("Both approaches are valid");
  });

  it("should mention focusing on goal achievement not just scripted phrases", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("server/grading.ts", "utf-8");
    
    expect(gradingContent).toContain("WHETHER the rep accomplished the goal");
    expect(gradingContent).toContain("not just whether they used specific scripted phrases");
  });

  it("should include a conversational expectation-setting example", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("server/grading.ts", "utf-8");
    
    expect(gradingContent).toContain("good fit to work together");
  });

  it("should label key phrases as examples not requirements", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("server/grading.ts", "utf-8");
    
    expect(gradingContent).toContain("examples, not requirements");
  });
});

// ============ SYSTEM PROMPT PUSHBACK RULES ============

describe("System Prompt Pushback Handling Rules", () => {
  it("should include GRADE DISPUTE & PUSHBACK HANDLING section", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("GRADE DISPUTE & PUSHBACK HANDLING");
  });

  it("should instruct AI to check transcript excerpts first", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("FIRST check the TRANSCRIPT EXCERPTS");
    expect(routersContent).toContain("Quote their exact words from the transcript");
  });

  it("should instruct AI to never dismiss self-reported behavior without evidence", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("NEVER dismiss a user's self-reported behavior without checking the evidence");
  });

  it("should distinguish between three levels of gap", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    // Three levels: (a) don't do it at all, (b) do it naturally, (c) do it well
    expect(routersContent).toContain("You don't do this at all");
    expect(routersContent).toContain("You do this naturally/conversationally");
    expect(routersContent).toContain("You do this well");
  });

  it("should instruct positive framing for partial credit", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("Your approach works and shows");
    expect(routersContent).toContain("push your score even higher");
  });

  it("should instruct honest evaluation of user-provided examples", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("evaluate it honestly");
    expect(routersContent).toContain("What does it accomplish");
    expect(routersContent).toContain("What could make it even stronger");
  });

  it("should instruct collaborative tone for self-reference", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("collaborative tone");
    expect(routersContent).toContain("let's look at your calls");
  });
});

// ============ TRANSCRIPT INCLUSION IN MEMBER CONTEXT ============

describe("Transcript Inclusion in Member Call Context", () => {
  it("should include transcript excerpts when self-referencing", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    // Verify the transcript inclusion logic exists
    expect(routersContent).toContain("call.transcript && (isDisputingGrade || isSelfReference)");
    expect(routersContent).toContain("Transcript excerpt:");
  });

  it("should truncate transcripts to 2000 chars", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("call.transcript.length > 2000");
    expect(routersContent).toContain("call.transcript.substring(0, 2000)");
  });

  it("should include per-criterion scores in member context", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("grade.criteriaScores");
    expect(routersContent).toContain("Criteria breakdown:");
  });

  it("should annotate self-reference in member context header", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersContent).toContain("THIS IS THE CURRENT USER");
    expect(routersContent).toContain("asking about their own calls");
  });
});

// ============ SELF-REFERENCE RESOLUTION LOGIC ============

describe("Self-Reference Resolution to Team Member", () => {
  it("should resolve self-reference to currentUserTeamMember before isAskingAboutMember check", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    // The self-reference resolution should happen BEFORE isAskingAboutMember is computed
    const selfRefIndex = routersContent.indexOf("isSelfReference && !mentionedMember && currentUserTeamMember");
    const isAskingIndex = routersContent.indexOf("const isAskingAboutMember = !!mentionedMember");
    
    expect(selfRefIndex).toBeGreaterThan(-1);
    expect(isAskingIndex).toBeGreaterThan(-1);
    expect(selfRefIndex).toBeLessThan(isAskingIndex);
  });

  it("should only resolve self-reference when no other member is mentioned", async () => {
    const fs = await import("fs");
    const routersContent = fs.readFileSync("server/routers.ts", "utf-8");
    
    // Should check !mentionedMember before resolving
    expect(routersContent).toContain("isSelfReference && !mentionedMember && currentUserTeamMember");
  });
});

// ============ DANIEL'S SPECIFIC SCENARIO ============

describe("Daniel's Scenario - Setting Expectations Dispute", () => {
  it("Daniel's phrase should match conversational key phrases in rubric", () => {
    const danielsPhrase = "do you have a couple of minutes to chat, just want to make sure we are a good fit to work together";
    const settingExpectations = LEAD_MANAGER_RUBRIC.criteria.find(c => c.name === "Setting Expectations")!;
    
    // Check if any key phrase appears in Daniel's phrase
    const matchesAnyPhrase = settingExpectations.keyPhrases.some(phrase => 
      danielsPhrase.toLowerCase().includes(phrase.toLowerCase())
    );
    
    expect(matchesAnyPhrase).toBe(true);
  });

  it("'i already do it' should trigger both self-reference and dispute detection", () => {
    const selfRef = /\b(my calls|my score|my grade|my performance|i already|i do that|i do it|i say that|i always|my approach|my style|my technique|my opening|my intro|how i|what i say|what i do|when i call|i set expectations|i handle|i ask|my last call|my recent|my average|grade me|my transcript)\b/i;
    const dispute = /\b(i already|i do that|i do it|but i|i always|i say|that's not fair|disagree|wrong|incorrect|i did|i said|my approach|my style|should.*score|should.*pass|should.*count)\b/i;
    
    expect(selfRef.test("i already do it")).toBe(true);
    expect(dispute.test("i already do it")).toBe(true);
  });

  it("'should be able to pass the setting up expectations' should trigger dispute detection", () => {
    const dispute = /\b(i already|i do that|i do it|but i|i always|i say|that's not fair|disagree|wrong|incorrect|i did|i said|my approach|my style|should.*score|should.*pass|should.*count)\b/i;
    
    expect(dispute.test("should be able to pass the setting up expectations")).toBe(true);
  });
});
