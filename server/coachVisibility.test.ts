import { describe, it, expect } from "vitest";

/**
 * Tests for AI Coach role-based visibility logic.
 * Verifies that the visibility set is correctly computed based on
 * user role and team assignments.
 */

interface TeamMember {
  id: number;
  name: string;
  teamRole: string;
  userId: number | null;
}

interface TeamAssignment {
  leadManagerId: number;
  acquisitionManagerId: number;
}

function computeVisibleMemberIds(
  isAdmin: boolean,
  currentUserTeamMemberId: number | null,
  teamMembersList: TeamMember[],
  assignments: TeamAssignment[]
): Set<number> {
  const visibleMemberIds = new Set<number>();
  if (isAdmin) {
    teamMembersList.forEach(m => visibleMemberIds.add(m.id));
  } else if (currentUserTeamMemberId) {
    visibleMemberIds.add(currentUserTeamMemberId);
    for (const a of assignments) {
      if (a.acquisitionManagerId === currentUserTeamMemberId) {
        visibleMemberIds.add(a.leadManagerId);
      }
    }
  }
  return visibleMemberIds;
}

const teamMembers: TeamMember[] = [
  { id: 1, name: "Chris Segura", teamRole: "lead_manager", userId: 390001 },
  { id: 2, name: "Daniel Lozano", teamRole: "lead_manager", userId: 840050 },
  { id: 3, name: "Kyle Barks", teamRole: "acquisition_manager", userId: 90493 },
  { id: 30001, name: "Alex Diaz", teamRole: "lead_generator", userId: 630001 },
  { id: 30002, name: "Efren Valenzuala", teamRole: "lead_generator", userId: 630002 },
  { id: 30003, name: "Mirna Razo", teamRole: "lead_generator", userId: 630003 },
];

const assignments: TeamAssignment[] = [
  { leadManagerId: 30003, acquisitionManagerId: 2 }, // Mirna → Daniel
  { leadManagerId: 30002, acquisitionManagerId: 2 }, // Efren → Daniel
  { leadManagerId: 30001, acquisitionManagerId: 2 }, // Alex → Daniel
  { leadManagerId: 2, acquisitionManagerId: 3 },     // Daniel → Kyle
  { leadManagerId: 1, acquisitionManagerId: 3 },     // Chris → Kyle
];

describe("AI Coach Role-Based Visibility", () => {
  it("admin sees all team members", () => {
    const visible = computeVisibleMemberIds(true, null, teamMembers, assignments);
    expect(visible.size).toBe(6);
    teamMembers.forEach(m => expect(visible.has(m.id)).toBe(true));
  });

  it("Daniel (lead_manager) sees himself + his 3 lead generators", () => {
    const visible = computeVisibleMemberIds(false, 2, teamMembers, assignments);
    expect(visible.has(2)).toBe(true);      // himself
    expect(visible.has(30001)).toBe(true);   // Alex
    expect(visible.has(30002)).toBe(true);   // Efren
    expect(visible.has(30003)).toBe(true);   // Mirna
    expect(visible.has(1)).toBe(false);      // Chris (not his report)
    expect(visible.has(3)).toBe(false);      // Kyle (his supervisor, not his report)
    expect(visible.size).toBe(4);
  });

  it("Kyle (acquisition_manager) sees himself + Chris + Daniel", () => {
    const visible = computeVisibleMemberIds(false, 3, teamMembers, assignments);
    expect(visible.has(3)).toBe(true);      // himself
    expect(visible.has(1)).toBe(true);      // Chris (his report)
    expect(visible.has(2)).toBe(true);      // Daniel (his report)
    expect(visible.has(30001)).toBe(false);  // Alex (Daniel's report, not Kyle's direct)
    expect(visible.size).toBe(3);
  });

  it("Chris (lead_manager, no reports) sees only himself", () => {
    const visible = computeVisibleMemberIds(false, 1, teamMembers, assignments);
    expect(visible.has(1)).toBe(true);      // himself
    expect(visible.size).toBe(1);
  });

  it("Alex (lead_generator, no reports) sees only himself", () => {
    const visible = computeVisibleMemberIds(false, 30001, teamMembers, assignments);
    expect(visible.has(30001)).toBe(true);  // himself
    expect(visible.size).toBe(1);
  });

  it("user not on team sees nothing", () => {
    const visible = computeVisibleMemberIds(false, null, teamMembers, assignments);
    expect(visible.size).toBe(0);
  });

  it("access denied when asking about non-visible member", () => {
    // Daniel asks about Chris
    const visible = computeVisibleMemberIds(false, 2, teamMembers, assignments);
    const mentionedMember = teamMembers.find(m => m.name === "Chris Segura")!;
    const accessDenied = !visible.has(mentionedMember.id);
    expect(accessDenied).toBe(true);
  });

  it("access allowed when asking about own report", () => {
    // Daniel asks about Alex
    const visible = computeVisibleMemberIds(false, 2, teamMembers, assignments);
    const mentionedMember = teamMembers.find(m => m.name === "Alex Diaz")!;
    const accessDenied = !visible.has(mentionedMember.id);
    expect(accessDenied).toBe(false);
  });
});
