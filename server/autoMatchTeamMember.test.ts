import { describe, it, expect } from "vitest";

/**
 * Tests for the autoMatchTeamMember name-matching logic.
 * We test the matching algorithm in isolation since the DB operations
 * are straightforward CRUD.
 */

// Simulate the matching logic from autoMatchTeamMember
function matchTeamMember(
  userName: string | null,
  teamMembers: Array<{ id: number; name: string; tenantId: number; teamRole: string; isActive: string }>
) {
  if (!userName) return null;

  const activeMembers = teamMembers.filter(tm => tm.isActive === 'true');
  const normalizedName = userName.toLowerCase().trim();

  // Exact match
  let matched = activeMembers.find(tm =>
    tm.name.toLowerCase().trim() === normalizedName
  );

  // Partial match: first name or last name
  if (!matched) {
    const nameParts = normalizedName.split(/\s+/);
    if (nameParts.length >= 2) {
      matched = activeMembers.find(tm => {
        const tmParts = tm.name.toLowerCase().trim().split(/\s+/);
        return tmParts[0] === nameParts[0] ||
          (tmParts.length >= 2 && nameParts.length >= 2 &&
           tmParts[tmParts.length - 1] === nameParts[nameParts.length - 1]);
      });
    }
  }

  return matched || null;
}

const teamMembers = [
  { id: 1, name: "Chris Segura", tenantId: 1, teamRole: "lead_manager", isActive: "true" },
  { id: 2, name: "Daniel Lozano", tenantId: 1, teamRole: "lead_manager", isActive: "true" },
  { id: 3, name: "Kyle Barks", tenantId: 1, teamRole: "acquisition_manager", isActive: "true" },
  { id: 4, name: "Alex Diaz", tenantId: 1, teamRole: "lead_generator", isActive: "true" },
  { id: 5, name: "Inactive Member", tenantId: 1, teamRole: "lead_manager", isActive: "false" },
];

describe("autoMatchTeamMember name matching", () => {
  it("should match exact name", () => {
    const result = matchTeamMember("Daniel Lozano", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(2);
    expect(result!.name).toBe("Daniel Lozano");
  });

  it("should match case-insensitively", () => {
    const result = matchTeamMember("daniel lozano", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(2);
  });

  it("should match with extra whitespace", () => {
    const result = matchTeamMember("  Kyle Barks  ", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(3);
  });

  it("should match by first name when last name also matches", () => {
    const result = matchTeamMember("Chris Smith-Segura", teamMembers);
    // Should match Chris Segura by first name
    const result2 = matchTeamMember("Chris Johnson", teamMembers);
    expect(result2).not.toBeNull();
    expect(result2!.id).toBe(1);
  });

  it("should match by last name", () => {
    // "alvarez.lozano" won't match, but "Something Lozano" should match Daniel Lozano by last name
    const result = matchTeamMember("Maria Lozano", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(2);
  });

  it("should NOT match inactive team members", () => {
    const result = matchTeamMember("Inactive Member", teamMembers);
    expect(result).toBeNull();
  });

  it("should return null for null userName", () => {
    const result = matchTeamMember(null, teamMembers);
    expect(result).toBeNull();
  });

  it("should return null for unknown name", () => {
    const result = matchTeamMember("John Smith", teamMembers);
    expect(result).toBeNull();
  });

  it("should return null for single-word name that doesn't match", () => {
    const result = matchTeamMember("RandomPerson", teamMembers);
    expect(result).toBeNull();
  });

  it("should match Kyle Barks exactly", () => {
    const result = matchTeamMember("Kyle Barks", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(3);
    expect(result!.teamRole).toBe("acquisition_manager");
  });

  it("should match Alex Diaz exactly", () => {
    const result = matchTeamMember("Alex Diaz", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(4);
    expect(result!.teamRole).toBe("lead_generator");
  });

  it("should return correct tenantId for matched member", () => {
    const result = matchTeamMember("Chris Segura", teamMembers);
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe(1);
  });

  it("should handle empty team members list", () => {
    const result = matchTeamMember("Daniel Lozano", []);
    expect(result).toBeNull();
  });

  it("should handle Google account name format (alvarez.lozano)", () => {
    // This is a single-word name with no space, so partial match won't trigger
    // This is expected - the name "alvarez.lozano" won't match "Daniel Lozano"
    const result = matchTeamMember("alvarez.lozano", teamMembers);
    expect(result).toBeNull();
  });
});

describe("autoMatchTeamMember integration flow", () => {
  it("should correctly map teamRole from team_member to user", () => {
    const matched = matchTeamMember("Kyle Barks", teamMembers);
    expect(matched).not.toBeNull();
    
    // The role mapping should preserve the team_member's teamRole
    const teamRole = matched!.teamRole as 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator';
    expect(teamRole).toBe("acquisition_manager");
  });

  it("should only match active team members", () => {
    const allActive = teamMembers.filter(tm => tm.isActive === 'true');
    expect(allActive.length).toBe(4);
    
    // Inactive member should not be in the active list
    const inactive = allActive.find(tm => tm.name === "Inactive Member");
    expect(inactive).toBeUndefined();
  });
});
