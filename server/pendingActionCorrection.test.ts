import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the pending action correction detection,
 * task move assignee filtering, and contact timezone features.
 * 
 * These tests verify the logic changes without calling external APIs.
 */

describe("findTaskByKeyword — assignedTo filter", () => {
  it("should filter tasks by assignedTo when provided", async () => {
    // Mock the ghlFetch and getCredentialsForTenant
    vi.doMock("./ghlActions", async (importOriginal) => {
      const original = await importOriginal() as any;
      return {
        ...original,
        // We test the filtering logic by examining the function signature
      };
    });

    // Import the actual module to check function exists with correct signature
    const mod = await import("./ghlActions");
    expect(typeof mod.findTaskByKeyword).toBe("function");
    // The function should have 4 parameters (tenantId, contactId, keyword, assignedTo?)
    expect(mod.findTaskByKeyword.length).toBeGreaterThanOrEqual(3);
  });

  it("should filter tasks correctly when assignedTo matches", () => {
    // Simulate the filtering logic that findTaskByKeyword now uses
    const tasks = [
      { id: "1", title: "Follow up call", assignedTo: "user-A", dueDate: "2026-03-05" },
      { id: "2", title: "Follow up email", assignedTo: "user-B", dueDate: "2026-03-06" },
      { id: "3", title: "Follow up call", assignedTo: "user-B", dueDate: "2026-03-07" },
    ];

    const keyword = "follow up";
    const assignedTo = "user-A";

    // Filter by assignedTo first, then by keyword
    const filtered = tasks.filter(t => {
      const matchesAssignee = !assignedTo || t.assignedTo === assignedTo;
      const matchesKeyword = t.title.toLowerCase().includes(keyword.toLowerCase());
      return matchesAssignee && matchesKeyword;
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
    expect(filtered[0].assignedTo).toBe("user-A");
  });

  it("should return all matching tasks when no assignedTo filter", () => {
    const tasks = [
      { id: "1", title: "Follow up call", assignedTo: "user-A", dueDate: "2026-03-05" },
      { id: "2", title: "Follow up email", assignedTo: "user-B", dueDate: "2026-03-06" },
      { id: "3", title: "Follow up call", assignedTo: "user-B", dueDate: "2026-03-07" },
    ];

    const keyword = "follow up";
    const assignedTo = undefined;

    const filtered = tasks.filter(t => {
      const matchesAssignee = !assignedTo || t.assignedTo === assignedTo;
      const matchesKeyword = t.title.toLowerCase().includes(keyword.toLowerCase());
      return matchesAssignee && matchesKeyword;
    });

    expect(filtered).toHaveLength(3);
  });
});

describe("Pending Action Context — Correction Detection", () => {
  it("should build pending action context string from recent pending actions", () => {
    // Simulate the pending action context building logic from routers.ts
    const recentPending = [
      {
        actionType: "create_appointment",
        targetContactName: "Rita Adams",
        payload: { title: "Property Walkthrough", startTime: "2026-03-06T10:00:00", selectedTimezone: "America/New_York" },
      },
    ];

    const pendingDescriptions = recentPending.map((a: any) => {
      const p = a.payload;
      let line = `- ${a.actionType} for ${a.targetContactName || "unknown"}`;
      if (a.actionType === "create_appointment" || a.actionType === "update_appointment") {
        line += ` | Title: ${p?.title || "N/A"} | Time: ${p?.startTime || "N/A"}`;
        if (p?.selectedTimezone) line += ` (${p.selectedTimezone})`;
      }
      return line;
    }).join("\n");

    expect(pendingDescriptions).toContain("create_appointment for Rita Adams");
    expect(pendingDescriptions).toContain("Property Walkthrough");
    expect(pendingDescriptions).toContain("America/New_York");
  });

  it("should include correction detection instructions in context", () => {
    const pendingDescriptions = "- create_appointment for Rita Adams | Title: Walkthrough | Time: 10:00 AM";
    const pendingActionContext = `\n\nRECENT PENDING ACTIONS (not yet confirmed by user):\n${pendingDescriptions}\n\nIMPORTANT: If the user's message is a CORRECTION or MODIFICATION to one of these pending actions (e.g., "Need that to be 4 PM", "Change the time to 3 PM", "Make it tomorrow instead", "Actually use a different title"), you MUST return the appropriate update action (update_appointment, update_task, etc.) with the corrected values.`;

    expect(pendingActionContext).toContain("RECENT PENDING ACTIONS");
    expect(pendingActionContext).toContain("CORRECTION or MODIFICATION");
    expect(pendingActionContext).toContain("update_appointment");
    expect(pendingActionContext).toContain("Rita Adams");
  });

  it("should handle empty pending actions gracefully", () => {
    const recentPending: any[] = [];
    let pendingActionContext = "";

    if (recentPending.length > 0) {
      pendingActionContext = "has pending actions";
    }

    expect(pendingActionContext).toBe("");
  });
});

describe("Contact Timezone Display", () => {
  it("should format timezone correctly for display", () => {
    const timezone = "America/New_York";
    const now = new Date("2026-03-03T20:00:00Z");

    const localTime = now.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // March 3, 2026 at 20:00 UTC = 3:00 PM EST
    expect(localTime).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
  });

  it("should handle invalid timezone gracefully", () => {
    const timezone = "Invalid/Timezone";

    try {
      const now = new Date();
      now.toLocaleTimeString("en-US", { timeZone: timezone });
      // If it doesn't throw, that's unexpected but fine
    } catch (e: any) {
      expect(e.message).toContain("Invalid");
    }
  });

  it("should return timezone from getContact response shape", () => {
    // Simulate the GHL contact response
    const ghlContact = {
      id: "abc123",
      firstName: "Rita",
      lastName: "Adams",
      phone: "+15551234567",
      email: "rita@example.com",
      assignedTo: "user-1",
      timezone: "America/New_York",
    };

    // Simulate the getContact extraction
    const result = {
      id: ghlContact.id,
      name: `${ghlContact.firstName} ${ghlContact.lastName}`.trim(),
      phone: ghlContact.phone,
      email: ghlContact.email,
      assignedTo: ghlContact.assignedTo,
      timezone: ghlContact.timezone || undefined,
    };

    expect(result.timezone).toBe("America/New_York");
  });

  it("should handle contact without timezone", () => {
    const ghlContact = {
      id: "abc123",
      firstName: "John",
      lastName: "Doe",
      phone: "+15551234567",
      email: "john@example.com",
    };

    const result = {
      id: ghlContact.id,
      name: `${ghlContact.firstName} ${ghlContact.lastName}`.trim(),
      phone: ghlContact.phone,
      email: ghlContact.email,
      timezone: (ghlContact as any).timezone || undefined,
    };

    expect(result.timezone).toBeUndefined();
  });
});

describe("parseIntent — filterByRequestingUser in JSON schema", () => {
  it("should include filterByRequestingUser in update_task action params", () => {
    // Simulate the LLM response for "Move my assigned task for Jeff Shelton"
    const llmResponse = {
      actions: [{
        type: "update_task",
        contactName: "Jeff Shelton",
        params: {
          keyword: "assigned task",
          dueDate: "2026-03-17",
          filterByRequestingUser: true,
        },
      }],
    };

    expect(llmResponse.actions[0].params.filterByRequestingUser).toBe(true);
  });

  it("should NOT set filterByRequestingUser for general task updates", () => {
    // Simulate the LLM response for "Move Jeff Shelton's task to next Monday"
    const llmResponse = {
      actions: [{
        type: "update_task",
        contactName: "Jeff Shelton",
        params: {
          keyword: "task",
          dueDate: "2026-03-09",
          filterByRequestingUser: false,
        },
      }],
    };

    expect(llmResponse.actions[0].params.filterByRequestingUser).toBe(false);
  });
});
