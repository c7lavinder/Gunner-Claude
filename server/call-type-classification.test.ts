import { describe, it, expect, vi } from "vitest";

// Test the classification prompt logic by verifying the prompt content
// We can't easily test the LLM output, but we can verify the prompt structure

describe("Call Type Classification Prompt", () => {
  it("should contain qualification distinction for acquisition managers", async () => {
    // Read the grading module to check the prompt content
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("./server/grading.ts", "utf-8");
    
    // Verify the prompt contains the key distinction about AM calls not being qualification
    expect(gradingContent).toContain("qualification\" is specifically for Lead Managers qualifying leads");
    expect(gradingContent).toContain("If an Acquisition Manager references a prior conversation with a colleague");
    expect(gradingContent).toContain("this does NOT make it a qualification call");
  });

  it("should contain follow_up distinction for previously-made offers", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("./server/grading.ts", "utf-8");
    
    // Verify the prompt distinguishes follow_up from offer based on previously-stated price
    expect(gradingContent).toContain("PREVIOUS OFFER was already discussed or presented");
    expect(gradingContent).toContain("seller immediately references or rejects a PREVIOUS offer amount");
    expect(gradingContent).toContain("this is a follow_up — NOT an offer");
  });

  it("should contain offer distinction for AM building toward first offer", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("./server/grading.ts", "utf-8");
    
    // Verify the prompt recognizes AM gathering details as offer, not qualification
    expect(gradingContent).toContain("BUILDING TOWARD an offer for the first time");
    expect(gradingContent).toContain("KEY DISTINCTION FROM QUALIFICATION");
    expect(gradingContent).toContain("KEY DISTINCTION FROM FOLLOW_UP");
  });

  it("should have AM role-based guidance with follow_up exception", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("./server/grading.ts", "utf-8");
    
    // Verify AM guidance includes follow_up as an exception
    expect(gradingContent).toContain("EXCEPTIONS for acquisition_manager");
    expect(gradingContent).toContain("DO NOT classify an AM's call as \"qualification\" just because the AM references a prior conversation");
    expect(gradingContent).toContain("follow_up\": AM is referencing a SPECIFIC DOLLAR AMOUNT");
  });

  it("should distinguish offer vs follow_up based on whether a price was previously stated", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("./server/grading.ts", "utf-8");
    
    // The critical rule: if a specific dollar amount was already presented in a previous call
    expect(gradingContent).toContain("OFFER vs FOLLOW_UP: If a SPECIFIC DOLLAR AMOUNT was already presented in a PREVIOUS call");
    expect(gradingContent).toContain("this is \"follow_up\" — NOT \"offer\"");
    expect(gradingContent).toContain("Even short calls where the seller immediately rejects a previously-stated price are \"follow_up\"");
  });

  it("should distinguish offer vs qualification for AM pipeline stage", async () => {
    const fs = await import("fs");
    const gradingContent = fs.readFileSync("./server/grading.ts", "utf-8");
    
    // The critical rule: AM calling a lead previously contacted by someone else = offer
    expect(gradingContent).toContain("OFFER vs QUALIFICATION: If an Acquisition Manager is calling a lead that was previously contacted by someone else");
    expect(gradingContent).toContain("this is \"offer\", NOT \"qualification\"");
    expect(gradingContent).toContain("The qualification stage already happened");
  });
});
