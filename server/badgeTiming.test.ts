import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Badge Evaluation Timing", () => {
  it("processCall should call evaluateBadgesForCall after grading", () => {
    // Read the grading.ts source to verify badge evaluation is in the pipeline
    const gradingSource = fs.readFileSync(
      path.join(__dirname, "../server/grading.ts"),
      "utf-8"
    );
    
    // Verify evaluateBadgesForCall is imported
    expect(gradingSource).toContain("evaluateBadgesForCall");
    expect(gradingSource).toContain("import { processCallViewRewards, evaluateBadgesForCall } from \"./gamification\"");
    
    // Verify badge evaluation happens in processCall (Step 8)
    expect(gradingSource).toContain("Step 8: Evaluate badges at grading time");
    expect(gradingSource).toContain("await evaluateBadgesForCall(call.teamMemberId, call.id)");
  });

  it("processCallViewRewards should NOT call evaluateBadgesForCall", () => {
    // Read the gamification.ts source to verify badge evaluation is removed from view rewards
    const gamificationSource = fs.readFileSync(
      path.join(__dirname, "../server/gamification.ts"),
      "utf-8"
    );
    
    // Find the processCallViewRewards function body (from function declaration to next export)
    const funcStart = gamificationSource.indexOf("export async function processCallViewRewards");
    const nextExport = gamificationSource.indexOf("\nexport ", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 2000);
    
    // Verify badge evaluation is NOT called in processCallViewRewards
    expect(funcBody).not.toContain("evaluateBadgesForCall(teamMemberId");
    
    // Verify the comment explaining the change is present
    expect(funcBody).toContain("Badge evaluation now happens at grading time");
  });

  it("evaluateBadgesForCall should use chronological call order for improvement badge", () => {
    const gamificationSource = fs.readFileSync(
      path.join(__dirname, "../server/gamification.ts"),
      "utf-8"
    );
    
    // Find the evaluateBadgesForCall function
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const funcEnd = gamificationSource.indexOf("export async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, funcEnd);
    
    // Verify it uses call ID ordering (chronological) not view order
    expect(funcBody).toContain("calls.id} < ${callId}");
    expect(funcBody).toContain("orderBy(desc(calls.id))");
    expect(funcBody).toContain("limit(1)");
  });

  it("grading pipeline should evaluate badges after marking call complete", () => {
    const gradingSource = fs.readFileSync(
      path.join(__dirname, "../server/grading.ts"),
      "utf-8"
    );
    
    // Step 6 (mark complete) should come before Step 8 (badges)
    const step6Pos = gradingSource.indexOf("Step 6: Mark complete");
    const step8Pos = gradingSource.indexOf("Step 8: Evaluate badges");
    
    expect(step6Pos).toBeGreaterThan(0);
    expect(step8Pos).toBeGreaterThan(0);
    expect(step8Pos).toBeGreaterThan(step6Pos);
  });

  it("badge evaluation in processCall should be wrapped in try-catch", () => {
    const gradingSource = fs.readFileSync(
      path.join(__dirname, "../server/grading.ts"),
      "utf-8"
    );
    
    // Find the badge evaluation section
    const badgeSection = gradingSource.indexOf("Step 8: Evaluate badges");
    const afterBadge = gradingSource.indexOf("Successfully processed call", badgeSection);
    const section = gradingSource.substring(badgeSection, afterBadge);
    
    // Verify it has error handling
    expect(section).toContain("try {");
    expect(section).toContain("catch (badgeError)");
    expect(section).toContain("Failed to evaluate badges");
  });
});
