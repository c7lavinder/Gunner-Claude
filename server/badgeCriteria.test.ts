import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Badge Criteria Score Parsing", () => {
  const gamificationSource = fs.readFileSync(
    path.join(__dirname, "../server/gamification.ts"),
    "utf-8"
  );

  it("evaluateBadgesForCall should parse array-format criteria scores", () => {
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const nextExport = gamificationSource.indexOf("\nexport async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 5000);
    
    // Should handle Array.isArray check
    expect(funcBody).toContain("Array.isArray(raw)");
    // Should extract name and score from array items
    expect(funcBody).toContain("item.name");
    expect(funcBody).toContain("item.score");
    // Should convert to Record<string, number>
    expect(funcBody).toContain("criteriaScores[item.name] = item.score");
  });

  it("batchEvaluateBadges should also parse array-format criteria scores", () => {
    const funcStart = gamificationSource.indexOf("export async function batchEvaluateBadges");
    const funcBody = gamificationSource.substring(funcStart, funcStart + 5000);
    
    // Should handle Array.isArray check
    expect(funcBody).toContain("Array.isArray(raw)");
    expect(funcBody).toContain("criteriaScores[item.name] = item.score");
  });

  it("should NOT use the old flat-object-only parsing pattern", () => {
    // The old pattern was: criteriaScores = typeof ... ? JSON.parse(...) : (... as Record<string, number>)
    // This should no longer be the primary parsing path in either function
    
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const nextExport = gamificationSource.indexOf("\nexport async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 5000);
    
    // Should NOT directly assign JSON.parse result to criteriaScores without array check
    expect(funcBody).not.toContain("criteriaScores = typeof grade.criteriaScores");
  });

  it("badge definitions should have valid criteriaName values matching real data", () => {
    // Known criteria names from the database
    const validLMCriteria = [
      "Introduction & Rapport", "Setting Expectations", "Property Condition",
      "Roadblock Identification", "Motivation Extraction", "Price Discussion",
      "Tonality & Empathy", "Objection Handling", "Call Outcome"
    ];
    const validAMCriteria = [
      "Intro & Confirmation", "Setting the Stage", "Roadblock Confirmation",
      "Motivation Restatement", "Offer Setup", "Price Delivery",
      "Tonality & Confidence", "Closing Technique"
    ];
    
    // Check that badge criteriaName values exist in the source
    // Lead Manager badges
    expect(gamificationSource).toContain('"Motivation Extraction"');
    expect(gamificationSource).toContain('"Price Discussion"');
    expect(gamificationSource).toContain('"Tonality & Empathy"');
    
    // Acquisition Manager badges
    expect(gamificationSource).toContain('"Offer Setup"');
    expect(gamificationSource).toContain('"Price Delivery"');
    expect(gamificationSource).toContain('"Closing Technique"');
  });

  it("intro_combined should sum Introduction & Rapport + Setting Expectations", () => {
    const funcStart = gamificationSource.indexOf("export async function evaluateBadgesForCall");
    const nextExport = gamificationSource.indexOf("\nexport async function", funcStart + 10);
    const funcBody = gamificationSource.substring(funcStart, nextExport > 0 ? nextExport : funcStart + 5000);
    
    expect(funcBody).toContain('criteriaName === "intro_combined"');
    expect(funcBody).toContain('"Introduction & Rapport"');
    expect(funcBody).toContain('"Setting Expectations"');
  });
});
