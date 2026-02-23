import { describe, it, expect } from "vitest";

/**
 * Tests for LG Dashboard layout changes and XP progress rounding fix
 */

// Import the getLevelFromXp function to test the rounding fix
import { getLevelFromXp } from "./gamification";

describe("XP Progress Percentage Rounding", () => {
  it("should return an integer progress percentage, not a floating point", () => {
    // 145 XP: level 1 (minXp=0), next level at 500
    // progress = (145/500)*100 = 29% (was 28.999999999996% before fix)
    const result = getLevelFromXp(145);
    expect(result.progress).toBe(29);
    expect(Number.isInteger(result.progress)).toBe(true);
  });

  it("should return 0 progress at level start", () => {
    const result = getLevelFromXp(0);
    expect(result.progress).toBe(0);
    expect(result.level).toBe(1);
  });

  it("should return 100 progress at max level", () => {
    // Max level is 25 at 350000 XP - when at max, nextLevel === currentLevel so progress = 100
    const result = getLevelFromXp(350000);
    expect(result.progress).toBe(100);
    expect(result.level).toBe(25);
  });

  it("should handle exact level boundaries", () => {
    const result = getLevelFromXp(500);
    // At exactly 500 XP, should be level 2 with 0% progress
    expect(result.level).toBe(2);
    expect(result.progress).toBe(0);
  });

  it("should round progress to nearest integer for various XP values", () => {
    // Test several values that could produce floating point issues
    const testCases = [
      { xp: 1, expectedInteger: true },
      { xp: 33, expectedInteger: true },
      { xp: 67, expectedInteger: true },
      { xp: 100, expectedInteger: true },
      { xp: 250, expectedInteger: true },
      { xp: 333, expectedInteger: true },
      { xp: 499, expectedInteger: true },
    ];

    for (const tc of testCases) {
      const result = getLevelFromXp(tc.xp);
      expect(Number.isInteger(result.progress)).toBe(true);
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
    }
  });
});
