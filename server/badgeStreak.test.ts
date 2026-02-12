import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Badge Streak Logic", () => {
  const gamificationSource = fs.readFileSync(
    path.join(__dirname, "../server/gamification.ts"),
    "utf-8"
  );

  it("resetBadgeProgress function should exist and set currentCount to 0", () => {
    expect(gamificationSource).toContain("export async function resetBadgeProgress");
    expect(gamificationSource).toContain("currentCount: 0");
  });

  it("evaluateBadgesForCall should reset streak on bad grade for consecutive_grade badges", () => {
    // Find the evaluateBadgesForCall function
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const nextExport = gamificationSource.indexOf("\nexport async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 3000);
    
    // Should have shouldResetStreak variable
    expect(funcBody).toContain("shouldResetStreak");
    
    // Should reset progress when streak breaks
    expect(funcBody).toContain("shouldResetStreak = true");
    expect(funcBody).toContain("resetBadgeProgress(teamMemberId, badgeDef.code)");
    
    // Should use else-if pattern: reset OR increment, never both
    expect(funcBody).toContain("if (shouldResetStreak)");
    expect(funcBody).toContain("} else if (shouldIncrement)");
  });

  it("batchEvaluateBadges should also reset streak on bad grade", () => {
    // Find the batchEvaluateBadges function
    const funcStart = gamificationSource.indexOf("export async function batchEvaluateBadges");
    const funcBody = gamificationSource.substring(funcStart, funcStart + 8000);
    
    // Should have shouldResetStreak in batch too
    expect(funcBody).toContain("shouldResetStreak");
    expect(funcBody).toContain("resetBadgeProgress(member.id, badgeDef.code)");
  });

  it("consecutive_grade case should set shouldResetStreak when grade is below minimum", () => {
    // Find the evaluateBadgesForCall consecutive_grade case
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const nextExport = gamificationSource.indexOf("\nexport async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 3000);
    
    // Find the consecutive_grade case within evaluateBadgesForCall
    const caseStart = funcBody.indexOf("case \"consecutive_grade\":");
    const caseEnd = funcBody.indexOf("break;", caseStart);
    const caseBody = funcBody.substring(caseStart, caseEnd);
    
    // Should have both increment and reset paths
    expect(caseBody).toContain("shouldIncrement = true");
    expect(caseBody).toContain("shouldResetStreak = true");
    
    // The reset should be in the else branch (when grade < minGrade)
    expect(caseBody).toContain("} else {");
  });

  it("non-streak badges (criteria_score, call_outcome, improvement) should NOT reset", () => {
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const nextExport = gamificationSource.indexOf("\nexport async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 3000);
    
    // Find criteria_score case - should NOT have shouldResetStreak
    const criteriaStart = funcBody.indexOf("case \"criteria_score\":");
    const criteriaEnd = funcBody.indexOf("break;", criteriaStart);
    const criteriaBody = funcBody.substring(criteriaStart, criteriaEnd);
    expect(criteriaBody).not.toContain("shouldResetStreak");
    
    // Find call_outcome case - should NOT have shouldResetStreak
    const outcomeStart = funcBody.indexOf("case \"call_outcome\":");
    const outcomeEnd = funcBody.indexOf("break;", outcomeStart);
    const outcomeBody = funcBody.substring(outcomeStart, outcomeEnd);
    expect(outcomeBody).not.toContain("shouldResetStreak");
    
    // Find improvement case - should NOT have shouldResetStreak
    const improvStart = funcBody.indexOf("case \"improvement\":");
    const improvEnd = funcBody.indexOf("break;", improvStart);
    const improvBody = funcBody.substring(improvStart, improvEnd);
    expect(improvBody).not.toContain("shouldResetStreak");
  });
});
