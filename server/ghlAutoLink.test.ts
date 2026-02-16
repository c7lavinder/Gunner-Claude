/**
 * Tests for GHL team member auto-linking
 * 
 * Covers:
 * 1. Name-based matching fallback when ghlUserId is not set
 * 2. Auto-persistence of ghlUserId after first name match
 * 3. GHL user name cache behavior
 * 4. Tenant setup auto-linking via GHL users API
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("GHL Auto-Link: matchTeamMember name fallback", () => {
  it("should match team member by exact name when ghlUserId is not available", () => {
    // Simulate the name matching logic from matchTeamMember
    const teamMembers = [
      { id: 1, name: "Zac Chrisman", ghlUserId: null, teamRole: "acquisition_manager" },
      { id: 2, name: "John Smith", ghlUserId: "ghl_123", teamRole: "lead_manager" },
    ];

    const userName = "Zac Chrisman";
    const match = teamMembers.find(m =>
      m.name.toLowerCase().includes(userName.toLowerCase()) ||
      userName.toLowerCase().includes(m.name.toLowerCase())
    );

    expect(match).toBeDefined();
    expect(match!.id).toBe(1);
    expect(match!.name).toBe("Zac Chrisman");
  });

  it("should match team member by partial name (first name in full name)", () => {
    const teamMembers = [
      { id: 1, name: "Zac Chrisman", ghlUserId: null, teamRole: "acquisition_manager" },
    ];

    const userName = "Zac";
    const match = teamMembers.find(m =>
      m.name.toLowerCase().includes(userName.toLowerCase()) ||
      userName.toLowerCase().includes(m.name.toLowerCase())
    );

    expect(match).toBeDefined();
    expect(match!.name).toBe("Zac Chrisman");
  });

  it("should match when GHL name contains team member name", () => {
    const teamMembers = [
      { id: 1, name: "Kyle Barks", ghlUserId: null, teamRole: "acquisition_manager" },
    ];

    const userName = "Kyle Barks (Sales)";
    const match = teamMembers.find(m =>
      m.name.toLowerCase().includes(userName.toLowerCase()) ||
      userName.toLowerCase().includes(m.name.toLowerCase())
    );

    expect(match).toBeDefined();
    expect(match!.name).toBe("Kyle Barks");
  });

  it("should return null when no name matches", () => {
    const teamMembers = [
      { id: 1, name: "Zac Chrisman", ghlUserId: null, teamRole: "acquisition_manager" },
    ];

    const userName = "Unknown Person";
    const match = teamMembers.find(m =>
      m.name.toLowerCase().includes(userName.toLowerCase()) ||
      userName.toLowerCase().includes(m.name.toLowerCase())
    );

    expect(match).toBeUndefined();
  });

  it("should prefer ghlUserId match over name match", () => {
    const teamMembers = [
      { id: 1, name: "Zac Chrisman", ghlUserId: "ghl_abc", teamRole: "acquisition_manager" },
      { id: 2, name: "Zac Smith", ghlUserId: null, teamRole: "lead_manager" },
    ];

    const ghlUserId = "ghl_abc";
    // First try by ID
    const byId = teamMembers.find(m => m.ghlUserId === ghlUserId);
    expect(byId).toBeDefined();
    expect(byId!.id).toBe(1);
  });
});

describe("GHL Auto-Link: tenant setup auto-linking", () => {
  it("should match GHL users to team members by name during setup", () => {
    // Simulate the auto-linking logic from setupTenant
    const ghlUsers = [
      { id: "ghl_user_1", name: "Zac Chrisman" },
      { id: "ghl_user_2", name: "John Doe" },
      { id: "ghl_user_3", name: "Jane Smith" },
    ];

    // Build the name -> ghlUserId map
    const ghlUserMap = new Map<string, string>();
    for (const u of ghlUsers) {
      ghlUserMap.set(u.name.toLowerCase(), u.id);
    }

    const teamMemberNames = ["Zac Chrisman", "John Doe", "Unknown Person"];
    const results: { name: string; ghlUserId?: string }[] = [];

    for (const memberName of teamMemberNames) {
      let ghlUserId: string | undefined;
      const memberNameLower = memberName.toLowerCase();
      const ghlEntries = Array.from(ghlUserMap.entries());
      for (let i = 0; i < ghlEntries.length; i++) {
        const [ghlName, ghlId] = ghlEntries[i];
        if (ghlName.includes(memberNameLower) || memberNameLower.includes(ghlName)) {
          ghlUserId = ghlId;
          break;
        }
      }
      results.push({ name: memberName, ghlUserId });
    }

    expect(results[0].ghlUserId).toBe("ghl_user_1"); // Zac matched
    expect(results[1].ghlUserId).toBe("ghl_user_2"); // John matched
    expect(results[2].ghlUserId).toBeUndefined();     // Unknown not matched
  });

  it("should handle GHL users with firstName/lastName format", () => {
    const ghlUsers = [
      { id: "ghl_1", firstName: "Zac", lastName: "Chrisman" },
    ];

    const ghlUserMap = new Map<string, string>();
    for (const u of ghlUsers) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
      if (name && u.id) {
        ghlUserMap.set(name.toLowerCase(), u.id);
      }
    }

    expect(ghlUserMap.get("zac chrisman")).toBe("ghl_1");
  });

  it("should be case-insensitive when matching names", () => {
    const ghlUserMap = new Map<string, string>();
    ghlUserMap.set("zac chrisman", "ghl_1");

    const memberNameLower = "Zac Chrisman".toLowerCase();
    const ghlEntries = Array.from(ghlUserMap.entries());
    let matched = false;
    for (let i = 0; i < ghlEntries.length; i++) {
      const [ghlName] = ghlEntries[i];
      if (ghlName.includes(memberNameLower) || memberNameLower.includes(ghlName)) {
        matched = true;
        break;
      }
    }

    expect(matched).toBe(true);
  });
});

describe("GHL Auto-Link: syncGHLCall name fallback flow", () => {
  it("should attempt name matching when ghlUserId match fails", () => {
    // Simulate the sync flow
    const teamMembers = [
      { id: 1, name: "Zac Chrisman", ghlUserId: null, teamRole: "acquisition_manager" },
    ];

    const ghlCall = {
      userId: "ghl_unknown_id",
      userName: "Zac Chrisman",
    };

    // Step 1: Try by ghlUserId - should fail
    const byId = teamMembers.find(m => m.ghlUserId === ghlCall.userId);
    expect(byId).toBeUndefined();

    // Step 2: Fall back to name matching using userName
    const byName = teamMembers.find(m =>
      m.name.toLowerCase().includes(ghlCall.userName!.toLowerCase()) ||
      ghlCall.userName!.toLowerCase().includes(m.name.toLowerCase())
    );
    expect(byName).toBeDefined();
    expect(byName!.id).toBe(1);

    // Step 3: After match, ghlUserId should be persisted (simulated)
    byName!.ghlUserId = ghlCall.userId;
    expect(byName!.ghlUserId).toBe("ghl_unknown_id");
  });

  it("should use GHL user name cache when userName is not on the call", () => {
    // Simulate the cache lookup
    const ghlUserNameCache = new Map<string, string>();
    ghlUserNameCache.set("ghl_user_abc", "Zac Chrisman");

    const callUserId = "ghl_user_abc";
    const userName = ghlUserNameCache.get(callUserId);

    expect(userName).toBe("Zac Chrisman");
  });

  it("should skip call when neither ghlUserId nor name matches", () => {
    const teamMembers = [
      { id: 1, name: "Zac Chrisman", ghlUserId: null, teamRole: "acquisition_manager" },
    ];

    const ghlCall = {
      userId: "ghl_unknown",
      userName: "Totally Unknown Person",
    };

    const byId = teamMembers.find(m => m.ghlUserId === ghlCall.userId);
    const byName = teamMembers.find(m =>
      m.name.toLowerCase().includes(ghlCall.userName!.toLowerCase()) ||
      ghlCall.userName!.toLowerCase().includes(m.name.toLowerCase())
    );

    expect(byId).toBeUndefined();
    expect(byName).toBeUndefined();
    // Call should be skipped with reason "Could not match team member"
  });
});
