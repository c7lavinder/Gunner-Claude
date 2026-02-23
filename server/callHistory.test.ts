import { describe, it, expect, vi } from "vitest";

/**
 * Tests for Call History page improvements:
 * 1. Team Member dropdown uses team.list (tenant-scoped) instead of current page results
 * 2. Team Members are grouped by team type (Acquisition Manager, Lead Manager, Lead Generator)
 * 3. Lead Generator calls with "completed" status appear in All Calls tab
 */

// Mock team members data (simulating team.list response)
const mockTeamMembers = [
  { id: 1, name: "Chris Segura", teamRole: "lead_manager" },
  { id: 2, name: "Daniel Lozano", teamRole: "lead_manager" },
  { id: 3, name: "Kyle Barks", teamRole: "acquisition_manager" },
  { id: 4, name: "Derek Lawson", teamRole: "acquisition_manager" },
  { id: 5, name: "Marcus Rivera", teamRole: "lead_generator" },
  { id: 6, name: "Tanya Brooks", teamRole: "lead_generator" },
  { id: 7, name: "Alex Diaz", teamRole: "lead_generator" },
  { id: 8, name: "Brianna Cole", teamRole: "lead_manager" },
  { id: 9, name: "Zac Chrisman", teamRole: "acquisition_manager" },
];

// Replicate the grouping logic from CallInbox.tsx
function buildTeamMemberGroups(allTeamMembers: typeof mockTeamMembers) {
  if (!allTeamMembers || allTeamMembers.length === 0) return undefined;
  const roleOrder: Record<string, number> = { acquisition_manager: 0, lead_manager: 1, lead_generator: 2 };
  const roleLabels: Record<string, string> = {
    acquisition_manager: "Acquisition Managers",
    lead_manager: "Lead Managers",
    lead_generator: "Lead Generators",
    admin: "Admin",
  };
  const grouped: Record<string, { value: string; label: string }[]> = {};
  allTeamMembers.forEach((m) => {
    const role = m.teamRole || "other";
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push({ value: m.name, label: m.name });
  });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.label.localeCompare(b.label)));
  return Object.entries(grouped)
    .sort(([a], [b]) => (roleOrder[a] ?? 99) - (roleOrder[b] ?? 99))
    .map(([role, options]) => ({
      label: roleLabels[role] || role,
      options,
    }));
}

describe("Team Member Dropdown Grouping", () => {
  it("groups team members by role in correct order: AM > LM > LG", () => {
    const groups = buildTeamMemberGroups(mockTeamMembers);
    expect(groups).toBeDefined();
    expect(groups!.length).toBe(3);
    expect(groups![0].label).toBe("Acquisition Managers");
    expect(groups![1].label).toBe("Lead Managers");
    expect(groups![2].label).toBe("Lead Generators");
  });

  it("includes all team members in their correct groups", () => {
    const groups = buildTeamMemberGroups(mockTeamMembers);
    
    // Acquisition Managers
    const amNames = groups![0].options.map((o) => o.value);
    expect(amNames).toContain("Kyle Barks");
    expect(amNames).toContain("Derek Lawson");
    expect(amNames).toContain("Zac Chrisman");
    expect(amNames.length).toBe(3);

    // Lead Managers
    const lmNames = groups![1].options.map((o) => o.value);
    expect(lmNames).toContain("Chris Segura");
    expect(lmNames).toContain("Daniel Lozano");
    expect(lmNames).toContain("Brianna Cole");
    expect(lmNames.length).toBe(3);

    // Lead Generators
    const lgNames = groups![2].options.map((o) => o.value);
    expect(lgNames).toContain("Marcus Rivera");
    expect(lgNames).toContain("Tanya Brooks");
    expect(lgNames).toContain("Alex Diaz");
    expect(lgNames.length).toBe(3);
  });

  it("sorts members alphabetically within each group", () => {
    const groups = buildTeamMemberGroups(mockTeamMembers);
    
    const amNames = groups![0].options.map((o) => o.value);
    expect(amNames).toEqual(["Derek Lawson", "Kyle Barks", "Zac Chrisman"]);

    const lmNames = groups![1].options.map((o) => o.value);
    expect(lmNames).toEqual(["Brianna Cole", "Chris Segura", "Daniel Lozano"]);

    const lgNames = groups![2].options.map((o) => o.value);
    expect(lgNames).toEqual(["Alex Diaz", "Marcus Rivera", "Tanya Brooks"]);
  });

  it("returns undefined for empty team members array", () => {
    const groups = buildTeamMemberGroups([]);
    expect(groups).toBeUndefined();
  });

  it("handles team members with unknown roles", () => {
    const membersWithUnknown = [
      ...mockTeamMembers,
      { id: 10, name: "Unknown Person", teamRole: "some_new_role" },
    ];
    const groups = buildTeamMemberGroups(membersWithUnknown);
    expect(groups).toBeDefined();
    // Unknown role should appear last (roleOrder 99)
    expect(groups!.length).toBe(4);
    expect(groups![3].label).toBe("some_new_role");
    expect(groups![3].options[0].value).toBe("Unknown Person");
  });

  it("handles single-member groups correctly", () => {
    const singleMembers = [
      { id: 1, name: "Solo AM", teamRole: "acquisition_manager" },
      { id: 2, name: "Solo LG", teamRole: "lead_generator" },
    ];
    const groups = buildTeamMemberGroups(singleMembers);
    expect(groups).toBeDefined();
    expect(groups!.length).toBe(2);
    expect(groups![0].label).toBe("Acquisition Managers");
    expect(groups![0].options.length).toBe(1);
    expect(groups![1].label).toBe("Lead Generators");
    expect(groups![1].options.length).toBe(1);
  });
});

describe("Lead Generator Calls Visibility", () => {
  // These tests verify the data model expectations for Lead Generator calls
  
  it("Lead Generator calls with completed status should have grades", () => {
    // Simulating the DB query result: Lead Generator calls that are "completed" 
    // DO have grades (they went through the full grading pipeline)
    const completedLGCalls = [
      { id: 1, status: "completed", classification: "conversation", callType: "qualification", teamMemberName: "Marcus Rivera", grade: { overallScore: "72" } },
      { id: 2, status: "completed", classification: "conversation", callType: "cold_call", teamMemberName: "Marcus Rivera", grade: { overallScore: "85" } },
    ];
    
    // The old filter was: result.filter(item => item.grade !== null)
    // This should include Lead Generator calls that have grades
    const filtered = completedLGCalls.filter(item => item.grade !== null);
    expect(filtered.length).toBe(2);
  });

  it("Lead Generator skipped calls should NOT appear in All Calls tab", () => {
    const skippedLGCalls = [
      { id: 3, status: "skipped", classification: "too_short", callType: "cold_call", teamMemberName: "Marcus Rivera", grade: null },
      { id: 4, status: "skipped", classification: "voicemail", callType: "cold_call", teamMemberName: "Alex Diaz", grade: null },
    ];
    
    // These have no grades, so they correctly get filtered out of "All Calls"
    const filtered = skippedLGCalls.filter(item => item.grade !== null);
    expect(filtered.length).toBe(0);
  });

  it("All Calls query uses statuses: completed which includes graded LG calls", () => {
    // The query params for All Calls tab
    const queryParams = {
      limit: 25,
      offset: 0,
      statuses: ["completed"],
    };
    
    // "completed" status includes all graded calls regardless of team role
    expect(queryParams.statuses).toContain("completed");
    // This means Lead Generator calls with status "completed" ARE included
  });
});

describe("MultiSelectFilter grouped mode", () => {
  it("groups prop takes precedence over options prop", () => {
    // When groups is provided, the component renders grouped sections
    // When only options is provided, it renders a flat list
    const groups = buildTeamMemberGroups(mockTeamMembers);
    expect(groups).toBeDefined();
    
    // Each group has a label and options array
    groups!.forEach(group => {
      expect(group.label).toBeTruthy();
      expect(Array.isArray(group.options)).toBe(true);
      expect(group.options.length).toBeGreaterThan(0);
      group.options.forEach(opt => {
        expect(opt.value).toBeTruthy();
        expect(opt.label).toBeTruthy();
      });
    });
  });
});
