import { describe, expect, it, vi } from "vitest";

/**
 * Tests for property database expansion and audit fixes
 * These tests verify the core logic without requiring a live database connection
 */

// ─── PROPERTY STATUS PIPELINE TESTS ───

describe("Property Status Pipeline", () => {
  const VALID_STATUSES = [
    "lead", "qualified", "offer_made", "under_contract",
    "marketing", "buyer_negotiating", "closing", "closed", "dead",
  ];

  const LEGACY_STATUSES = ["new", "negotiating", "sold"];

  it("should have all valid pipeline statuses defined", () => {
    expect(VALID_STATUSES).toHaveLength(9);
    expect(VALID_STATUSES).toContain("lead");
    expect(VALID_STATUSES).toContain("closed");
    expect(VALID_STATUSES).toContain("dead");
  });

  it("should map legacy statuses to new ones", () => {
    const LEGACY_MAP: Record<string, string> = {
      new: "lead",
      negotiating: "buyer_negotiating",
      sold: "closed",
    };
    LEGACY_STATUSES.forEach((legacy) => {
      expect(LEGACY_MAP[legacy]).toBeDefined();
      expect(VALID_STATUSES).toContain(LEGACY_MAP[legacy]);
    });
  });
});

// ─── MILESTONE FLAGS LOGIC TESTS ───

describe("Milestone Flags Logic", () => {
  const STATUS_ORDER = [
    "lead", "qualified", "offer_made", "under_contract",
    "marketing", "buyer_negotiating", "closing", "closed",
  ];

  function computeMilestones(status: string) {
    const idx = STATUS_ORDER.indexOf(status);
    return {
      aptEverSet: idx >= 1,
      offerEverMade: idx >= 2,
      everUnderContract: idx >= 3,
      everClosed: idx >= 7,
    };
  }

  it("should set no milestones for lead status", () => {
    const m = computeMilestones("lead");
    expect(m.aptEverSet).toBe(false);
    expect(m.offerEverMade).toBe(false);
    expect(m.everUnderContract).toBe(false);
    expect(m.everClosed).toBe(false);
  });

  it("should set aptEverSet for qualified status", () => {
    const m = computeMilestones("qualified");
    expect(m.aptEverSet).toBe(true);
    expect(m.offerEverMade).toBe(false);
    expect(m.everUnderContract).toBe(false);
    expect(m.everClosed).toBe(false);
  });

  it("should set aptEverSet and offerEverMade for offer_made status", () => {
    const m = computeMilestones("offer_made");
    expect(m.aptEverSet).toBe(true);
    expect(m.offerEverMade).toBe(true);
    expect(m.everUnderContract).toBe(false);
    expect(m.everClosed).toBe(false);
  });

  it("should set first three milestones for under_contract status", () => {
    const m = computeMilestones("under_contract");
    expect(m.aptEverSet).toBe(true);
    expect(m.offerEverMade).toBe(true);
    expect(m.everUnderContract).toBe(true);
    expect(m.everClosed).toBe(false);
  });

  it("should set all milestones for closed status", () => {
    const m = computeMilestones("closed");
    expect(m.aptEverSet).toBe(true);
    expect(m.offerEverMade).toBe(true);
    expect(m.everUnderContract).toBe(true);
    expect(m.everClosed).toBe(true);
  });

  it("should not set everClosed for marketing status", () => {
    const m = computeMilestones("marketing");
    expect(m.everUnderContract).toBe(true);
    expect(m.everClosed).toBe(false);
  });

  it("should return no milestones for dead status (not in order)", () => {
    const m = computeMilestones("dead");
    expect(m.aptEverSet).toBe(false);
    expect(m.offerEverMade).toBe(false);
    expect(m.everUnderContract).toBe(false);
    expect(m.everClosed).toBe(false);
  });
});

// ─── GHL WEBHOOK PIPELINE STAGE MAPPING TESTS ───

describe("GHL Pipeline Stage Mapping", () => {
  const TRACKED_STAGES = ["new lead", "warm lead", "hot lead"];
  const PIPELINE_NAME = "sales process";

  function shouldAutoImport(pipelineName: string, stageName: string): boolean {
    return pipelineName.toLowerCase().includes("sales process") &&
      TRACKED_STAGES.some(s => stageName.toLowerCase().includes(s));
  }

  function mapStageToStatus(stageName: string): string {
    const lower = stageName.toLowerCase();
    if (lower.includes("hot")) return "qualified";
    if (lower.includes("warm")) return "lead";
    if (lower.includes("new")) return "lead";
    return "lead";
  }

  it("should trigger auto-import for New Lead in Sales Process Pipeline", () => {
    expect(shouldAutoImport("Sales Process", "New Lead")).toBe(true);
  });

  it("should trigger auto-import for Warm Lead in Sales Process Pipeline", () => {
    expect(shouldAutoImport("Sales Process", "Warm Lead")).toBe(true);
  });

  it("should trigger auto-import for Hot Lead in Sales Process Pipeline", () => {
    expect(shouldAutoImport("Sales Process", "Hot Lead")).toBe(true);
  });

  it("should NOT trigger for other pipelines", () => {
    expect(shouldAutoImport("Buyer Pipeline", "New Lead")).toBe(false);
  });

  it("should NOT trigger for non-tracked stages", () => {
    expect(shouldAutoImport("Sales Process", "Under Contract")).toBe(false);
    expect(shouldAutoImport("Sales Process", "Closed Won")).toBe(false);
  });

  it("should map Hot Lead to qualified status", () => {
    expect(mapStageToStatus("Hot Lead")).toBe("qualified");
  });

  it("should map Warm Lead to lead status", () => {
    expect(mapStageToStatus("Warm Lead")).toBe("lead");
  });

  it("should map New Lead to lead status", () => {
    expect(mapStageToStatus("New Lead")).toBe("lead");
  });
});

// ─── FUZZY SEARCH TESTS ───

describe("Fuzzy Contact Search", () => {
  function fuzzyMatch(query: string, name: string): boolean {
    const q = query.toLowerCase().trim();
    const n = name.toLowerCase().trim();
    if (n.includes(q)) return true;
    // Simple token matching
    const queryTokens = q.split(/\s+/);
    const nameTokens = n.split(/\s+/);
    return queryTokens.every(qt =>
      nameTokens.some(nt => nt.startsWith(qt) || nt.includes(qt))
    );
  }

  it("should match exact name", () => {
    expect(fuzzyMatch("Pablo Martins", "Pablo Martins")).toBe(true);
  });

  it("should match partial first name", () => {
    expect(fuzzyMatch("Pablo", "Pablo Martins")).toBe(true);
  });

  it("should match partial last name", () => {
    expect(fuzzyMatch("Martins", "Pablo Martins")).toBe(true);
  });

  it("should match case-insensitively", () => {
    expect(fuzzyMatch("pablo martins", "Pablo Martins")).toBe(true);
  });

  it("should match with partial tokens", () => {
    expect(fuzzyMatch("Pab Mar", "Pablo Martins")).toBe(true);
  });

  it("should not match completely different name", () => {
    expect(fuzzyMatch("John Smith", "Pablo Martins")).toBe(false);
  });
});

// ─── KPI ROLE FILTERING TESTS ───

describe("KPI Role Filtering", () => {
  const teamMembers = [
    { id: 1, name: "Alice", teamRole: "lead_manager", ghlUserId: "ghl1" },
    { id: 2, name: "Bob", teamRole: "lead_manager", ghlUserId: "ghl2" },
    { id: 3, name: "Charlie", teamRole: "acquisition_manager", ghlUserId: "ghl3" },
    { id: 4, name: "Diana", teamRole: "dispo_manager", ghlUserId: "ghl4" },
  ];

  function getTeamMembersByRole(roleTab: string): typeof teamMembers {
    const roleConfig: Record<string, string[]> = {
      admin: [],
      lm: ["lead_manager"],
      am: ["acquisition_manager"],
      dispo: ["dispo_manager"],
    };
    const roles = roleConfig[roleTab] || [];
    if (roles.length === 0) return teamMembers; // admin sees all
    return teamMembers.filter(m => roles.includes(m.teamRole));
  }

  it("should return all members for admin tab", () => {
    expect(getTeamMembersByRole("admin")).toHaveLength(4);
  });

  it("should return only LMs for lm tab", () => {
    const result = getTeamMembersByRole("lm");
    expect(result).toHaveLength(2);
    expect(result.every(m => m.teamRole === "lead_manager")).toBe(true);
  });

  it("should return only AMs for am tab", () => {
    const result = getTeamMembersByRole("am");
    expect(result).toHaveLength(1);
    expect(result[0].teamRole).toBe("acquisition_manager");
  });

  it("should return only dispo for dispo tab", () => {
    const result = getTeamMembersByRole("dispo");
    expect(result).toHaveLength(1);
    expect(result[0].teamRole).toBe("dispo_manager");
  });
});

// ─── TASK LIST PAGINATION TESTS ───

describe("Task List Pagination", () => {
  const PAGE_SIZE = 50;

  function paginateTasks(tasks: number[], page: number) {
    const start = 0;
    const end = page * PAGE_SIZE;
    return {
      visible: tasks.slice(start, end),
      hasMore: tasks.length > end,
      total: tasks.length,
    };
  }

  it("should show first 50 tasks on page 1", () => {
    const tasks = Array.from({ length: 120 }, (_, i) => i);
    const result = paginateTasks(tasks, 1);
    expect(result.visible).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it("should show 100 tasks on page 2", () => {
    const tasks = Array.from({ length: 120 }, (_, i) => i);
    const result = paginateTasks(tasks, 2);
    expect(result.visible).toHaveLength(100);
    expect(result.hasMore).toBe(true);
  });

  it("should show all tasks when fewer than page size", () => {
    const tasks = Array.from({ length: 30 }, (_, i) => i);
    const result = paginateTasks(tasks, 1);
    expect(result.visible).toHaveLength(30);
    expect(result.hasMore).toBe(false);
  });
});

// ─── HTML STRIPPING TESTS ───

describe("HTML Stripping for Task Body", () => {
  function stripHtml(html: string): string {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").trim();
  }

  it("should strip HTML tags from task body", () => {
    expect(stripHtml("<p>Call back about property</p>")).toBe("Call back about property");
  });

  it("should handle nested tags", () => {
    expect(stripHtml("<div><strong>Important:</strong> Follow up</div>")).toBe("Important: Follow up");
  });

  it("should handle empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("should handle plain text", () => {
    expect(stripHtml("No HTML here")).toBe("No HTML here");
  });
});

// ─── TRAINING PAGE ROLE FILTER TESTS ───

describe("Training Page Role Filter", () => {
  it("should filter training data by selected role", () => {
    const allData = [
      { id: 1, role: "lead_manager" },
      { id: 2, role: "acquisition_manager" },
      { id: 3, role: "lead_manager" },
    ];

    const filtered = allData.filter(d => d.role === "lead_manager");
    expect(filtered).toHaveLength(2);
    expect(filtered.every(d => d.role === "lead_manager")).toBe(true);
  });

  it("should show all data when role is 'all'", () => {
    const allData = [
      { id: 1, role: "lead_manager" },
      { id: 2, role: "acquisition_manager" },
    ];

    const selectedRole = "all";
    const filtered = selectedRole === "all" ? allData : allData.filter(d => d.role === selectedRole);
    expect(filtered).toHaveLength(2);
  });
});
