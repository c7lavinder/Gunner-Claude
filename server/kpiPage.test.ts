import { describe, expect, it } from "vitest";
import { getDateRange } from "./kpiPage";
import { getMilestoneFlags, getStageTimestamps, normalizeSource } from "./ghlContactImport";

// ─── getDateRange Tests ─────────────────────────────────

describe("getDateRange", () => {
  it("returns current and previous month for this_month", () => {
    const result = getDateRange("this_month");
    expect(result.current.start).toBeInstanceOf(Date);
    expect(result.current.end).toBeInstanceOf(Date);
    expect(result.previous.start).toBeInstanceOf(Date);
    expect(result.previous.end).toBeInstanceOf(Date);
    // Current start should be 1st of current month
    expect(result.current.start.getDate()).toBe(1);
    // Previous start should be 1st of previous month
    expect(result.previous.start.getDate()).toBe(1);
    // Previous end should be before current start
    expect(result.previous.end.getTime()).toBeLessThan(result.current.start.getTime() + 86400000);
  });

  it("returns last month for last_month", () => {
    const result = getDateRange("last_month");
    expect(result.current.start.getDate()).toBe(1);
    // Current month should be before this month
    const now = new Date();
    expect(result.current.start.getMonth()).toBeLessThan(now.getMonth() || 12);
  });

  it("returns quarter boundaries for this_quarter", () => {
    const result = getDateRange("this_quarter");
    // Quarter start month should be 0, 3, 6, or 9
    expect([0, 3, 6, 9]).toContain(result.current.start.getMonth());
    expect(result.current.start.getDate()).toBe(1);
  });

  it("returns year-to-date for ytd", () => {
    const result = getDateRange("ytd");
    expect(result.current.start.getMonth()).toBe(0);
    expect(result.current.start.getDate()).toBe(1);
  });

  it("handles custom date range", () => {
    const result = getDateRange("custom", "2025-01-01", "2025-01-31");
    // Custom range should produce valid date ranges
    expect(result.current.start).toBeInstanceOf(Date);
    expect(result.current.end).toBeInstanceOf(Date);
    // Current start should be before current end
    expect(result.current.start.getTime()).toBeLessThan(result.current.end.getTime());
    // Previous period should end before current start
    expect(result.previous.end.getTime()).toBeLessThan(result.current.start.getTime());
    // Previous period should have same duration as current
    const currentDuration = result.current.end.getTime() - result.current.start.getTime();
    const previousDuration = result.previous.end.getTime() - result.previous.start.getTime();
    expect(Math.abs(currentDuration - previousDuration)).toBeLessThan(86400000); // within 1 day
  });

  it("defaults to this_month for unknown period", () => {
    const result = getDateRange("unknown_period");
    expect(result.current.start.getDate()).toBe(1);
    expect(result.previous.start.getDate()).toBe(1);
  });
});

// ─── getMilestoneFlags Tests ────────────────────────────

describe("getMilestoneFlags", () => {
  it("returns empty flags for lead status", () => {
    const flags = getMilestoneFlags("lead");
    expect(flags.aptEverSet).toBeUndefined();
    expect(flags.offerEverMade).toBeUndefined();
    expect(flags.everUnderContract).toBeUndefined();
    expect(flags.everClosed).toBeUndefined();
  });

  it("sets aptEverSet for apt_set status", () => {
    const flags = getMilestoneFlags("apt_set");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBeUndefined();
    expect(flags.everUnderContract).toBeUndefined();
    expect(flags.everClosed).toBeUndefined();
  });

  it("sets aptEverSet and offerEverMade for offer_made status", () => {
    const flags = getMilestoneFlags("offer_made");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBe(true);
    expect(flags.everUnderContract).toBeUndefined();
    expect(flags.everClosed).toBeUndefined();
  });

  it("sets apt, offer, contract flags for under_contract status", () => {
    const flags = getMilestoneFlags("under_contract");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBe(true);
    expect(flags.everUnderContract).toBe(true);
    expect(flags.everClosed).toBeUndefined();
  });

  it("sets all flags for closed status", () => {
    const flags = getMilestoneFlags("closed");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBe(true);
    expect(flags.everUnderContract).toBe(true);
    expect(flags.everClosed).toBe(true);
  });

  it("does NOT auto-fill all stages for follow_up status (critical bug fix)", () => {
    const flags = getMilestoneFlags("follow_up");
    expect(flags.aptEverSet).toBeUndefined();
    expect(flags.offerEverMade).toBeUndefined();
    expect(flags.everUnderContract).toBeUndefined();
    expect(flags.everClosed).toBeUndefined();
  });

  it("does NOT auto-fill all stages for dead status", () => {
    const flags = getMilestoneFlags("dead");
    expect(flags.aptEverSet).toBeUndefined();
    expect(flags.offerEverMade).toBeUndefined();
    expect(flags.everUnderContract).toBeUndefined();
    expect(flags.everClosed).toBeUndefined();
  });

  it("treats marketing as under_contract level (implies UC)", () => {
    const flags = getMilestoneFlags("marketing");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBe(true);
    expect(flags.everUnderContract).toBe(true);
    expect(flags.everClosed).toBeUndefined();
  });

  it("treats buyer_negotiating as under_contract level", () => {
    const flags = getMilestoneFlags("buyer_negotiating");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBe(true);
    expect(flags.everUnderContract).toBe(true);
    expect(flags.everClosed).toBeUndefined();
  });

  it("treats closing as under_contract level", () => {
    const flags = getMilestoneFlags("closing");
    expect(flags.aptEverSet).toBe(true);
    expect(flags.offerEverMade).toBe(true);
    expect(flags.everUnderContract).toBe(true);
    expect(flags.everClosed).toBeUndefined();
  });
});

// ─── getStageTimestamps Tests ───────────────────────────

describe("getStageTimestamps", () => {
  it("returns no timestamps for lead status", () => {
    const ts = getStageTimestamps("lead");
    expect(Object.keys(ts)).toHaveLength(0);
  });

  it("returns aptSetAt for apt_set status", () => {
    const ts = getStageTimestamps("apt_set");
    expect(ts.aptSetAt).toBeInstanceOf(Date);
    expect(ts.offerMadeAt).toBeUndefined();
    expect(ts.underContractAt).toBeUndefined();
    expect(ts.closedAt).toBeUndefined();
  });

  it("returns aptSetAt and offerMadeAt for offer_made status", () => {
    const ts = getStageTimestamps("offer_made");
    expect(ts.aptSetAt).toBeInstanceOf(Date);
    expect(ts.offerMadeAt).toBeInstanceOf(Date);
    expect(ts.underContractAt).toBeUndefined();
    expect(ts.closedAt).toBeUndefined();
  });

  it("returns all timestamps for closed status", () => {
    const ts = getStageTimestamps("closed");
    expect(ts.aptSetAt).toBeInstanceOf(Date);
    expect(ts.offerMadeAt).toBeInstanceOf(Date);
    expect(ts.underContractAt).toBeInstanceOf(Date);
    expect(ts.closedAt).toBeInstanceOf(Date);
  });

  it("returns no timestamps for follow_up (critical: no auto-fill)", () => {
    const ts = getStageTimestamps("follow_up");
    expect(Object.keys(ts)).toHaveLength(0);
  });

  it("returns no timestamps for dead status", () => {
    const ts = getStageTimestamps("dead");
    expect(Object.keys(ts)).toHaveLength(0);
  });
});

// ─── normalizeSource Tests ──────────────────────────────

describe("normalizeSource", () => {
  it("normalizes PropertyLeads variants", () => {
    expect(normalizeSource("propertyleads")).toBe("PropertyLeads");
    expect(normalizeSource("PropertyLeads.com")).toBe("PropertyLeads");
    expect(normalizeSource("PPL - PropertyLeads")).toBe("PropertyLeads");
    expect(normalizeSource("ppl")).toBe("PropertyLeads");
  });

  it("normalizes BatchDialer variants", () => {
    expect(normalizeSource("batchdialer")).toBe("BatchDialer");
    expect(normalizeSource("cold call")).toBe("BatchDialer");
    expect(normalizeSource("Cold Calling")).toBe("BatchDialer");
  });

  it("normalizes Referral variants", () => {
    expect(normalizeSource("referral")).toBe("Referral");
    expect(normalizeSource("Referrals")).toBe("Referral");
    expect(normalizeSource("word of mouth")).toBe("Referral");
  });

  it("normalizes Social Media variants", () => {
    expect(normalizeSource("facebook")).toBe("Social Media");
    expect(normalizeSource("Instagram")).toBe("Social Media");
    expect(normalizeSource("social media")).toBe("Social Media");
  });

  it("returns Unknown for empty source", () => {
    expect(normalizeSource("")).toBe("Unknown");
  });

  it("returns original string for unrecognized sources", () => {
    expect(normalizeSource("SomeNewSource")).toBe("SomeNewSource");
  });

  it("handles case insensitivity", () => {
    expect(normalizeSource("BATCHDIALER")).toBe("BatchDialer");
    expect(normalizeSource("REFERRAL")).toBe("Referral");
  });
});
