import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for team.visibleMembers endpoint logic.
 * Verifies role-based filtering of the Team Member dropdown:
 * - Lead Generators: only see themselves
 * - Lead Managers: see themselves + assigned Lead Generators
 * - Acquisition Managers / Admins: see everyone
 */

// Mock team members
const mockTeamMembers = [
  { id: 1, name: "Kyle Barks", teamRole: "acquisition_manager", isActive: "true", tenantId: 1, userId: 10 },
  { id: 2, name: "Chris Segura", teamRole: "lead_manager", isActive: "true", tenantId: 1, userId: 20 },
  { id: 3, name: "Daniel Lozano", teamRole: "lead_manager", isActive: "true", tenantId: 1, userId: 30 },
  { id: 4, name: "Alex Diaz", teamRole: "lead_generator", isActive: "true", tenantId: 1, userId: 40 },
  { id: 5, name: "Efren Valenzuela", teamRole: "lead_generator", isActive: "true", tenantId: 1, userId: 50 },
  { id: 6, name: "Mirna Razo", teamRole: "lead_generator", isActive: "true", tenantId: 1, userId: 60 },
];

// Mock assignments: Alex & Efren assigned to Chris, Mirna assigned to Daniel
// In team_assignments: leadManagerId = LG, acquisitionManagerId = LM supervisor
const mockAssignments = [
  { id: 1, tenantId: 1, leadManagerId: 4, acquisitionManagerId: 2 }, // Alex → Chris
  { id: 2, tenantId: 1, leadManagerId: 5, acquisitionManagerId: 2 }, // Efren → Chris
  { id: 3, tenantId: 1, leadManagerId: 6, acquisitionManagerId: 3 }, // Mirna → Daniel
];

// Helper to simulate the visibleMembers logic
function getVisibleMembers(
  allMembers: typeof mockTeamMembers,
  currentMember: typeof mockTeamMembers[0] | null,
  isAdmin: boolean,
  assignments: typeof mockAssignments
) {
  // Admins see everyone
  if (isAdmin) return allMembers;

  // No team member record → fallback to all
  if (!currentMember) return allMembers;

  // Lead Generators only see themselves
  if (currentMember.teamRole === 'lead_generator') {
    return allMembers.filter(m => m.id === currentMember.id);
  }

  // Lead Managers see themselves + assigned Lead Generators
  if (currentMember.teamRole === 'lead_manager') {
    // Get LG IDs assigned to this LM
    const assignedLgIds = assignments
      .filter(a => a.acquisitionManagerId === currentMember.id)
      .map(a => a.leadManagerId);
    // Filter to only actual LGs
    const lgIds = assignedLgIds.filter(id => {
      const member = allMembers.find(m => m.id === id);
      return member?.teamRole === 'lead_generator';
    });
    const visibleIds = new Set([currentMember.id, ...lgIds]);
    return allMembers.filter(m => visibleIds.has(m.id));
  }

  // Acquisition Managers see everyone
  if (currentMember.teamRole === 'acquisition_manager') return allMembers;

  // Fallback
  return allMembers;
}

describe("Team Member Dropdown - Role-Based Visibility", () => {
  describe("Lead Generator visibility", () => {
    it("should only see themselves (Alex Diaz)", () => {
      const alex = mockTeamMembers.find(m => m.name === "Alex Diaz")!;
      const visible = getVisibleMembers(mockTeamMembers, alex, false, mockAssignments);

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe("Alex Diaz");
    });

    it("should only see themselves (Efren Valenzuela)", () => {
      const efren = mockTeamMembers.find(m => m.name === "Efren Valenzuela")!;
      const visible = getVisibleMembers(mockTeamMembers, efren, false, mockAssignments);

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe("Efren Valenzuela");
    });

    it("should only see themselves (Mirna Razo)", () => {
      const mirna = mockTeamMembers.find(m => m.name === "Mirna Razo")!;
      const visible = getVisibleMembers(mockTeamMembers, mirna, false, mockAssignments);

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe("Mirna Razo");
    });

    it("should NOT see other Lead Generators", () => {
      const alex = mockTeamMembers.find(m => m.name === "Alex Diaz")!;
      const visible = getVisibleMembers(mockTeamMembers, alex, false, mockAssignments);

      const names = visible.map(m => m.name);
      expect(names).not.toContain("Efren Valenzuela");
      expect(names).not.toContain("Mirna Razo");
    });

    it("should NOT see Lead Managers or Acquisition Managers", () => {
      const alex = mockTeamMembers.find(m => m.name === "Alex Diaz")!;
      const visible = getVisibleMembers(mockTeamMembers, alex, false, mockAssignments);

      const names = visible.map(m => m.name);
      expect(names).not.toContain("Chris Segura");
      expect(names).not.toContain("Daniel Lozano");
      expect(names).not.toContain("Kyle Barks");
    });
  });

  describe("Lead Manager visibility", () => {
    it("Chris Segura should see himself + Alex Diaz + Efren Valenzuela (his assigned LGs)", () => {
      const chris = mockTeamMembers.find(m => m.name === "Chris Segura")!;
      const visible = getVisibleMembers(mockTeamMembers, chris, false, mockAssignments);

      expect(visible).toHaveLength(3);
      const names = visible.map(m => m.name).sort();
      expect(names).toEqual(["Alex Diaz", "Chris Segura", "Efren Valenzuela"]);
    });

    it("Daniel Lozano should see himself + Mirna Razo (his assigned LG)", () => {
      const daniel = mockTeamMembers.find(m => m.name === "Daniel Lozano")!;
      const visible = getVisibleMembers(mockTeamMembers, daniel, false, mockAssignments);

      expect(visible).toHaveLength(2);
      const names = visible.map(m => m.name).sort();
      expect(names).toEqual(["Daniel Lozano", "Mirna Razo"]);
    });

    it("Chris should NOT see Mirna (assigned to Daniel, not Chris)", () => {
      const chris = mockTeamMembers.find(m => m.name === "Chris Segura")!;
      const visible = getVisibleMembers(mockTeamMembers, chris, false, mockAssignments);

      const names = visible.map(m => m.name);
      expect(names).not.toContain("Mirna Razo");
    });

    it("Daniel should NOT see Alex or Efren (assigned to Chris, not Daniel)", () => {
      const daniel = mockTeamMembers.find(m => m.name === "Daniel Lozano")!;
      const visible = getVisibleMembers(mockTeamMembers, daniel, false, mockAssignments);

      const names = visible.map(m => m.name);
      expect(names).not.toContain("Alex Diaz");
      expect(names).not.toContain("Efren Valenzuela");
    });

    it("Lead Managers should NOT see other Lead Managers", () => {
      const chris = mockTeamMembers.find(m => m.name === "Chris Segura")!;
      const visible = getVisibleMembers(mockTeamMembers, chris, false, mockAssignments);

      const names = visible.map(m => m.name);
      expect(names).not.toContain("Daniel Lozano");
    });

    it("Lead Managers should NOT see Acquisition Managers", () => {
      const chris = mockTeamMembers.find(m => m.name === "Chris Segura")!;
      const visible = getVisibleMembers(mockTeamMembers, chris, false, mockAssignments);

      const names = visible.map(m => m.name);
      expect(names).not.toContain("Kyle Barks");
    });
  });

  describe("Acquisition Manager visibility", () => {
    it("Kyle Barks should see all team members", () => {
      const kyle = mockTeamMembers.find(m => m.name === "Kyle Barks")!;
      const visible = getVisibleMembers(mockTeamMembers, kyle, false, mockAssignments);

      expect(visible).toHaveLength(6);
    });
  });

  describe("Admin visibility", () => {
    it("Admin should see all team members regardless of their team member record", () => {
      const visible = getVisibleMembers(mockTeamMembers, null, true, mockAssignments);

      expect(visible).toHaveLength(6);
    });

    it("Admin with a team member record should still see everyone", () => {
      const admin = { id: 99, name: "Admin User", teamRole: "admin" as const, isActive: "true" as const, tenantId: 1, userId: 99 };
      const allWithAdmin = [...mockTeamMembers, admin];
      const visible = getVisibleMembers(allWithAdmin, admin, true, mockAssignments);

      expect(visible).toHaveLength(7);
    });
  });

  describe("Edge cases", () => {
    it("should fallback to all members if no team member record found", () => {
      const visible = getVisibleMembers(mockTeamMembers, null, false, mockAssignments);

      expect(visible).toHaveLength(6);
    });

    it("Lead Manager with no assigned LGs should only see themselves", () => {
      const lmNoAssignments = { id: 99, name: "New LM", teamRole: "lead_manager" as const, isActive: "true" as const, tenantId: 1, userId: 99 };
      const allWithNewLM = [...mockTeamMembers, lmNoAssignments];
      const visible = getVisibleMembers(allWithNewLM, lmNoAssignments, false, mockAssignments);

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe("New LM");
    });

    it("should handle empty team members list", () => {
      const visible = getVisibleMembers([], null, false, []);
      expect(visible).toHaveLength(0);
    });
  });
});
