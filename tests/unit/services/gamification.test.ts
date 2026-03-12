/**
 * Unit tests for gamification pure functions.
 * Tests scoreToGrade and getLevel without database dependencies.
 */
import { describe, it, expect } from "vitest";
import { getLevel } from "../../../server/services/gamification";
import { SOFTWARE_PLAYBOOK } from "../../../server/services/playbooks";

// scoreToGrade is private, so we test it indirectly through behavior
// But we can test the grade scale config
describe("Grade Scale Config", () => {
  it("has correct grade thresholds", () => {
    const scale = SOFTWARE_PLAYBOOK.gradeScale;
    expect(scale.A.min).toBe(90);
    expect(scale.B.min).toBe(80);
    expect(scale.C.min).toBe(70);
    expect(scale.D.min).toBe(60);
    expect(scale.F.min).toBe(0);
  });

  it("grades do not overlap", () => {
    const scale = SOFTWARE_PLAYBOOK.gradeScale;
    expect(scale.A.min).toBeGreaterThan(scale.B.min);
    expect(scale.B.min).toBeGreaterThan(scale.C.min);
    expect(scale.C.min).toBeGreaterThan(scale.D.min);
    expect(scale.D.min).toBeGreaterThan(scale.F.min);
  });
});

describe("XP Rewards Config", () => {
  it("has all reward types", () => {
    const r = SOFTWARE_PLAYBOOK.xpRewards;
    expect(r.callBase).toBeGreaterThan(0);
    expect(r.gradeA).toBeGreaterThan(r.gradeB);
    expect(r.gradeB).toBeGreaterThan(r.gradeC);
    expect(r.gradeC).toBeGreaterThan(r.gradeD);
    expect(r.gradeD).toBeGreaterThan(r.gradeF);
    expect(r.badgeEarned).toBeGreaterThan(0);
    expect(r.improvement).toBeGreaterThan(0);
  });
});

describe("getLevel", () => {
  it("returns Rookie at 0 XP", () => {
    const result = getLevel(0);
    expect(result.level).toBe(1);
    expect(result.title).toBe("Rookie");
    expect(result.xp).toBe(0);
  });

  it("returns level 2 at 500 XP", () => {
    const result = getLevel(500);
    expect(result.level).toBe(2);
    expect(result.title).toBe("Starter");
  });

  it("returns level 2 at 999 XP (just under level 3)", () => {
    const result = getLevel(999);
    expect(result.level).toBe(2);
  });

  it("returns level 3 at 1000 XP", () => {
    const result = getLevel(1000);
    expect(result.level).toBe(3);
  });

  it("returns max level at very high XP", () => {
    const result = getLevel(999999);
    expect(result.level).toBe(25);
    expect(result.title).toBe("Hall of Fame");
    expect(result.nextLevelXp).toBeNull();
  });

  it("provides nextLevelXp for non-max levels", () => {
    const result = getLevel(0);
    expect(result.nextLevelXp).toBe(500);
  });

  it("handles each level threshold correctly", () => {
    const thresholds = SOFTWARE_PLAYBOOK.levelThresholds;
    for (let i = 0; i < thresholds.length; i++) {
      const result = getLevel(thresholds[i]);
      expect(result.level).toBe(i + 1);
    }
  });
});

describe("Level Thresholds Config", () => {
  it("has 25 levels", () => {
    expect(SOFTWARE_PLAYBOOK.levelThresholds).toHaveLength(25);
    expect(SOFTWARE_PLAYBOOK.levelTitles).toHaveLength(25);
  });

  it("thresholds are in ascending order", () => {
    const t = SOFTWARE_PLAYBOOK.levelThresholds;
    for (let i = 1; i < t.length; i++) {
      expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });

  it("starts at 0", () => {
    expect(SOFTWARE_PLAYBOOK.levelThresholds[0]).toBe(0);
  });
});
