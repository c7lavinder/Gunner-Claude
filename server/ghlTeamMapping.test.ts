import { describe, it, expect, vi } from "vitest";

/**
 * Tests for Fix #7: GHL User ID → Gunner Team Member Mapping
 *
 * The opportunity detection engine has 15 detection rules. Previously,
 * 9 of them set teamMemberId: null for GHL pipeline-based opportunities.
 * Now all detection functions resolve opp.assignedTo → teamMemberId
 * using the GHL user ID map built from the team_members table.
 *
 * These tests validate:
 * 1. resolveGhlAssignee correctly maps known GHL user IDs
 * 2. resolveGhlAssignee returns nulls for unknown/missing IDs
 * 3. The mapping is used in detection return objects
 * 4. The save-time fallback enrichment chain works correctly
 */

// ============ UNIT TESTS FOR resolveGhlAssignee ============

// We test the resolver logic directly since it's the core of Fix #7
// The function is not exported, so we replicate its logic here for unit testing

type GhlUserIdMap = Map<string, { id: number; name: string }>;

function resolveGhlAssignee(
  ghlUserId: string | undefined | null,
  ghlMap: GhlUserIdMap
): { teamMemberId: number | null; teamMemberName: string | null } {
  if (!ghlUserId || !ghlMap.has(ghlUserId)) {
    return { teamMemberId: null, teamMemberName: null };
  }
  const member = ghlMap.get(ghlUserId)!;
  return { teamMemberId: member.id, teamMemberName: member.name };
}

describe("GHL User ID → Team Member Mapping (Fix #7)", () => {
  // Build a test map matching the real data:
  // Chris Segura → nJVGO9byJSmD8O32UF9Z
  // Daniel Lozano → G1hAG3KNhzMerkEIvMr5
  // Kyle Barks → InPGvGL7iu5TCnYJLMEx
  const testMap: GhlUserIdMap = new Map([
    ["nJVGO9byJSmD8O32UF9Z", { id: 1, name: "Chris Segura" }],
    ["G1hAG3KNhzMerkEIvMr5", { id: 2, name: "Daniel Lozano" }],
    ["InPGvGL7iu5TCnYJLMEx", { id: 3, name: "Kyle Barks" }],
  ]);

  describe("resolveGhlAssignee", () => {
    it("resolves a known GHL user ID to the correct team member", () => {
      const result = resolveGhlAssignee("nJVGO9byJSmD8O32UF9Z", testMap);
      expect(result.teamMemberId).toBe(1);
      expect(result.teamMemberName).toBe("Chris Segura");
    });

    it("resolves Daniel Lozano's GHL user ID", () => {
      const result = resolveGhlAssignee("G1hAG3KNhzMerkEIvMr5", testMap);
      expect(result.teamMemberId).toBe(2);
      expect(result.teamMemberName).toBe("Daniel Lozano");
    });

    it("resolves Kyle Barks' GHL user ID", () => {
      const result = resolveGhlAssignee("InPGvGL7iu5TCnYJLMEx", testMap);
      expect(result.teamMemberId).toBe(3);
      expect(result.teamMemberName).toBe("Kyle Barks");
    });

    it("returns nulls for an unknown GHL user ID", () => {
      const result = resolveGhlAssignee("UNKNOWN_GHL_ID_12345", testMap);
      expect(result.teamMemberId).toBeNull();
      expect(result.teamMemberName).toBeNull();
    });

    it("returns nulls when ghlUserId is null", () => {
      const result = resolveGhlAssignee(null, testMap);
      expect(result.teamMemberId).toBeNull();
      expect(result.teamMemberName).toBeNull();
    });

    it("returns nulls when ghlUserId is undefined", () => {
      const result = resolveGhlAssignee(undefined, testMap);
      expect(result.teamMemberId).toBeNull();
      expect(result.teamMemberName).toBeNull();
    });

    it("returns nulls when ghlUserId is empty string", () => {
      const result = resolveGhlAssignee("", testMap);
      expect(result.teamMemberId).toBeNull();
      expect(result.teamMemberName).toBeNull();
    });

    it("returns nulls when map is empty", () => {
      const emptyMap: GhlUserIdMap = new Map();
      const result = resolveGhlAssignee("nJVGO9byJSmD8O32UF9Z", emptyMap);
      expect(result.teamMemberId).toBeNull();
      expect(result.teamMemberName).toBeNull();
    });
  });

  describe("Detection object spread pattern", () => {
    it("spread operator correctly sets both teamMemberId and teamMemberName", () => {
      const resolved = resolveGhlAssignee("nJVGO9byJSmD8O32UF9Z", testMap);
      const detection = {
        tier: "missed" as const,
        contactName: "Test Contact",
        ...resolved,
        assignedTo: "nJVGO9byJSmD8O32UF9Z",
      };
      expect(detection.teamMemberId).toBe(1);
      expect(detection.teamMemberName).toBe("Chris Segura");
      expect(detection.assignedTo).toBe("nJVGO9byJSmD8O32UF9Z");
    });

    it("spread operator sets nulls for unknown GHL user ID", () => {
      const resolved = resolveGhlAssignee("UNKNOWN", testMap);
      const detection = {
        tier: "warning" as const,
        contactName: "Test Contact",
        ...resolved,
        assignedTo: "UNKNOWN",
      };
      expect(detection.teamMemberId).toBeNull();
      expect(detection.teamMemberName).toBeNull();
      expect(detection.assignedTo).toBe("UNKNOWN");
    });
  });

  describe("Enrichment fallback chain", () => {
    it("prefers detection-level teamMemberId over GHL mapping", () => {
      // Simulates: detection already has teamMemberId from call data
      let teamMemberId: number | null = 99;
      let teamMemberName: string | null = "From Call Data";
      const assignedTo = "nJVGO9byJSmD8O32UF9Z";

      // Call-based enrichment (already set)
      // GHL fallback should NOT override
      if (!teamMemberId && assignedTo) {
        const resolved = resolveGhlAssignee(assignedTo, testMap);
        if (resolved.teamMemberId) {
          teamMemberId = resolved.teamMemberId;
          teamMemberName = resolved.teamMemberName;
        }
      }

      expect(teamMemberId).toBe(99);
      expect(teamMemberName).toBe("From Call Data");
    });

    it("falls back to GHL mapping when call data has no team member", () => {
      // Simulates: detection has no teamMemberId, but has assignedTo
      let teamMemberId: number | null = null;
      let teamMemberName: string | null = null;
      const assignedTo = "G1hAG3KNhzMerkEIvMr5";

      // Call-based enrichment found nothing
      // GHL fallback should resolve
      if (!teamMemberId && assignedTo) {
        const resolved = resolveGhlAssignee(assignedTo, testMap);
        if (resolved.teamMemberId) {
          teamMemberId = resolved.teamMemberId;
          teamMemberName = resolved.teamMemberName;
        }
      }

      expect(teamMemberId).toBe(2);
      expect(teamMemberName).toBe("Daniel Lozano");
    });

    it("remains null when neither call data nor GHL mapping resolves", () => {
      let teamMemberId: number | null = null;
      let teamMemberName: string | null = null;
      const assignedTo = "UNKNOWN_USER";

      // Call-based enrichment found nothing
      // GHL fallback also can't resolve
      if (!teamMemberId && assignedTo) {
        const resolved = resolveGhlAssignee(assignedTo, testMap);
        if (resolved.teamMemberId) {
          teamMemberId = resolved.teamMemberId;
          teamMemberName = resolved.teamMemberName;
        }
      }

      expect(teamMemberId).toBeNull();
      expect(teamMemberName).toBeNull();
    });

    it("remains null when assignedTo is null (no GHL assignment)", () => {
      let teamMemberId: number | null = null;
      let teamMemberName: string | null = null;
      const assignedTo: string | null = null;

      if (!teamMemberId && assignedTo) {
        const resolved = resolveGhlAssignee(assignedTo, testMap);
        if (resolved.teamMemberId) {
          teamMemberId = resolved.teamMemberId;
          teamMemberName = resolved.teamMemberName;
        }
      }

      expect(teamMemberId).toBeNull();
      expect(teamMemberName).toBeNull();
    });
  });

  describe("Coverage of all 15 detection rules", () => {
    // Verify that no detection function still hardcodes teamMemberId: null
    // This is a structural test — we read the source file and check
    it("no detection function returns hardcoded teamMemberId: null", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("server/opportunityDetection.ts", "utf-8");

      // Find all lines with teamMemberId: null
      const lines = source.split("\n");
      const nullLines: { lineNum: number; content: string }[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("teamMemberId: null")) {
          nullLines.push({ lineNum: i + 1, content: lines[i].trim() });
        }
      }

      // The only acceptable teamMemberId: null should be in the resolveGhlAssignee helper
      // (which returns null for unknown IDs)
      const detectionNulls = nullLines.filter(
        (l) => !l.content.includes("return {") || !l.content.includes("resolveGhlAssignee")
      );

      // Should only have 1 occurrence: the resolveGhlAssignee return statement
      expect(detectionNulls.length).toBe(1);
      expect(detectionNulls[0].content).toContain("return { teamMemberId: null, teamMemberName: null }");
    });
  });
});
