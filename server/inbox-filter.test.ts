import { describe, expect, it } from "vitest";

/**
 * Test the inbox phone filtering logic that was added to the
 * getUnreadConversations procedure.
 *
 * The server-side filter works as follows:
 * - If rolePhoneFilter is provided, only return conversations where
 *   teamPhone matches one of the filter phones
 * - If teamPhone is empty but assignedTo matches the ghlUserId, include it
 * - Otherwise, exclude the conversation
 */

interface MockConversation {
  conversationId: string;
  contactName: string;
  teamPhone: string;
  assignedTo: string;
  isMissedCall: boolean;
}

// Replicate the server-side filtering logic from routers.ts
function filterByRolePhones(
  conversations: MockConversation[],
  rolePhoneFilter: string[] | undefined,
  ghlUserId: string | undefined
): MockConversation[] {
  if (!rolePhoneFilter || rolePhoneFilter.length === 0) {
    return conversations;
  }
  const phoneSet = new Set(rolePhoneFilter);
  return conversations.filter((c) => {
    // Primary: match by teamPhone
    if (c.teamPhone && phoneSet.has(c.teamPhone)) return true;
    // Fallback: if teamPhone is empty but assignedTo matches ghlUserId
    if (!c.teamPhone && ghlUserId && c.assignedTo === ghlUserId) return true;
    return false;
  });
}

// Replicate the frontend rolePhoneArray builder
function buildRolePhoneArray(
  teamMembers: Array<{
    teamRole: string;
    lcPhones: string | null;
    lcPhone: string | null;
  }>,
  targetRole: string
): string[] | null {
  const phones: string[] = [];
  for (const m of teamMembers) {
    if (m.teamRole !== targetRole) continue;
    if (m.lcPhones) {
      try {
        const parsed = JSON.parse(m.lcPhones) as string[];
        parsed.forEach((p) => {
          if (!phones.includes(p)) phones.push(p);
        });
      } catch {
        /* skip */
      }
    }
    if (m.lcPhone && !phones.includes(m.lcPhone)) phones.push(m.lcPhone);
  }
  return phones.length > 0 ? phones : null;
}

describe("Inbox phone filtering", () => {
  const mockConversations: MockConversation[] = [
    {
      conversationId: "conv1",
      contactName: "Lead A",
      teamPhone: "+19312885429", // Chris (LM)
      assignedTo: "ghl-chris",
      isMissedCall: false,
    },
    {
      conversationId: "conv2",
      contactName: "Lead B",
      teamPhone: "+16152405127", // Daniel (LM)
      assignedTo: "ghl-daniel",
      isMissedCall: true,
    },
    {
      conversationId: "conv3",
      contactName: "Lead C",
      teamPhone: "+16158525930", // Esteban (Dispo)
      assignedTo: "",
      isMissedCall: false,
    },
    {
      conversationId: "conv4",
      contactName: "Lead D",
      teamPhone: "+16157688784", // Kyle (AM)
      assignedTo: "ghl-kyle",
      isMissedCall: false,
    },
    {
      conversationId: "conv5",
      contactName: "Lead E",
      teamPhone: "", // Unknown phone
      assignedTo: "ghl-chris",
      isMissedCall: false,
    },
    {
      conversationId: "conv6",
      contactName: "Lead F",
      teamPhone: "+12565215239", // Chris second number (LM)
      assignedTo: "ghl-chris",
      isMissedCall: false,
    },
  ];

  const teamMembers = [
    {
      name: "Chris Segura",
      teamRole: "lead_manager",
      lcPhone: "+19312885429",
      lcPhones: '["+19312885429", "+12565215239", "+16155909651"]',
    },
    {
      name: "Daniel Lozano",
      teamRole: "lead_manager",
      lcPhone: "+16152405127",
      lcPhones: '["+16152405127"]',
    },
    {
      name: "Kyle Barks",
      teamRole: "acquisition_manager",
      lcPhone: "+16157688784",
      lcPhones: '["+16157688784"]',
    },
    {
      name: "Esteban Leiva",
      teamRole: "dispo_manager",
      lcPhone: "+16158525930",
      lcPhones: null,
    },
  ];

  describe("buildRolePhoneArray", () => {
    it("returns LM phone numbers", () => {
      const phones = buildRolePhoneArray(teamMembers, "lead_manager");
      expect(phones).not.toBeNull();
      expect(phones).toContain("+19312885429");
      expect(phones).toContain("+12565215239");
      expect(phones).toContain("+16155909651");
      expect(phones).toContain("+16152405127");
      expect(phones).not.toContain("+16158525930"); // dispo
      expect(phones).not.toContain("+16157688784"); // AM
    });

    it("returns dispo phone numbers (including lcPhone fallback)", () => {
      const phones = buildRolePhoneArray(teamMembers, "dispo_manager");
      expect(phones).not.toBeNull();
      expect(phones).toContain("+16158525930");
      expect(phones).toHaveLength(1);
    });

    it("returns AM phone numbers", () => {
      const phones = buildRolePhoneArray(teamMembers, "acquisition_manager");
      expect(phones).not.toBeNull();
      expect(phones).toContain("+16157688784");
      expect(phones).toHaveLength(1);
    });

    it("returns null for role with no phone numbers", () => {
      const phones = buildRolePhoneArray(teamMembers, "lead_generator");
      expect(phones).toBeNull();
    });
  });

  describe("filterByRolePhones", () => {
    it("returns all conversations when no filter is provided", () => {
      const result = filterByRolePhones(mockConversations, undefined, undefined);
      expect(result).toHaveLength(mockConversations.length);
    });

    it("filters to only dispo conversations", () => {
      const dispoPhones = buildRolePhoneArray(teamMembers, "dispo_manager")!;
      const result = filterByRolePhones(mockConversations, dispoPhones, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].contactName).toBe("Lead C");
      expect(result[0].teamPhone).toBe("+16158525930");
    });

    it("filters to only LM conversations (includes both Chris and Daniel numbers)", () => {
      const lmPhones = buildRolePhoneArray(teamMembers, "lead_manager")!;
      const result = filterByRolePhones(mockConversations, lmPhones, undefined);
      // conv1 (Chris), conv2 (Daniel), conv6 (Chris second number)
      expect(result).toHaveLength(3);
      const names = result.map((c) => c.contactName);
      expect(names).toContain("Lead A");
      expect(names).toContain("Lead B");
      expect(names).toContain("Lead F");
    });

    it("filters to only AM conversations", () => {
      const amPhones = buildRolePhoneArray(teamMembers, "acquisition_manager")!;
      const result = filterByRolePhones(mockConversations, amPhones, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].contactName).toBe("Lead D");
    });

    it("includes conversations with empty teamPhone if assignedTo matches ghlUserId", () => {
      const lmPhones = buildRolePhoneArray(teamMembers, "lead_manager")!;
      const result = filterByRolePhones(mockConversations, lmPhones, "ghl-chris");
      // conv1, conv2, conv5 (empty teamPhone but assigned to Chris), conv6
      expect(result).toHaveLength(4);
      const names = result.map((c) => c.contactName);
      expect(names).toContain("Lead E"); // fallback match
    });

    it("excludes conversations with empty teamPhone when no ghlUserId provided", () => {
      const dispoPhones = buildRolePhoneArray(teamMembers, "dispo_manager")!;
      const result = filterByRolePhones(mockConversations, dispoPhones, undefined);
      // Only conv3 matches dispo phone; conv5 has empty teamPhone but no ghlUserId
      expect(result).toHaveLength(1);
      const names = result.map((c) => c.contactName);
      expect(names).not.toContain("Lead E");
    });

    it("does not mix LM and Dispo conversations", () => {
      const dispoPhones = buildRolePhoneArray(teamMembers, "dispo_manager")!;
      const result = filterByRolePhones(mockConversations, dispoPhones, undefined);
      const teamPhones = result.map((c) => c.teamPhone);
      // Should not contain any LM or AM phone numbers
      expect(teamPhones).not.toContain("+19312885429");
      expect(teamPhones).not.toContain("+16152405127");
      expect(teamPhones).not.toContain("+16157688784");
    });
  });
});
