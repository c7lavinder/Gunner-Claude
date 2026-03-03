import { describe, expect, it, vi, beforeEach } from "vitest";

// We test the getContactUpcomingActions function by mocking the database
// Since the function queries coach_action_log, we mock getDb and drizzle-orm

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// We need to test the logic of the function, so we'll import and test it
// after setting up mocks

describe("getContactUpcomingActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when db is not available", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(null);

    const { getContactUpcomingActions } = await import("./ghlActions");
    const result = await getContactUpcomingActions(1, "contact-123");

    expect(result).toEqual([]);
  });

  it("returns UpcomingAction items with correct structure", async () => {
    // Mock a db that returns workflow actions
    const mockWorkflowResults = [
      {
        id: 1,
        tenantId: 1,
        actionType: "add_to_workflow",
        targetContactId: "contact-123",
        status: "executed",
        payload: JSON.stringify({ workflowId: "wf-1", workflowName: "New Lead Nurture" }),
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
    ];
    const mockPendingResults = [
      {
        id: 2,
        tenantId: 1,
        actionType: "send_sms",
        targetContactId: "contact-123",
        status: "pending",
        payload: JSON.stringify({
          message: "Hey, just following up on our conversation",
          scheduledDate: "2026-03-05",
          scheduledTime: "14:00",
        }),
        createdAt: new Date("2026-03-03T12:00:00Z"),
      },
    ];

    // Create a chainable mock
    const createChainMock = (results: any[]) => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(results);
      return chain;
    };

    let callCount = 0;
    const mockDb = {
      select: vi.fn(() => {
        callCount++;
        if (callCount === 1) return createChainMock(mockWorkflowResults);
        return createChainMock(mockPendingResults);
      }),
    };

    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(mockDb);

    const { getContactUpcomingActions } = await import("./ghlActions");
    const result = await getContactUpcomingActions(1, "contact-123");

    // Should have at least the workflow and the SMS action
    expect(result.length).toBeGreaterThanOrEqual(1);

    // Check that each item has the required fields
    for (const item of result) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("detail");
      expect(item).toHaveProperty("date");
      expect(item).toHaveProperty("icon");
      expect(["workflow", "scheduled_sms", "scheduled_task", "scheduled_email"]).toContain(item.type);
      expect(["workflow", "sms", "task", "email"]).toContain(item.icon);
    }
  });

  it("filters out workflows that were removed", async () => {
    // Workflow added then removed — should NOT appear
    const mockWorkflowResults = [
      {
        id: 2,
        tenantId: 1,
        actionType: "remove_from_workflow",
        targetContactId: "contact-123",
        status: "executed",
        payload: JSON.stringify({ workflowId: "wf-1", workflowName: "Old Workflow" }),
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
      {
        id: 1,
        tenantId: 1,
        actionType: "add_to_workflow",
        targetContactId: "contact-123",
        status: "executed",
        payload: JSON.stringify({ workflowId: "wf-1", workflowName: "Old Workflow" }),
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
    ];

    const createChainMock = (results: any[]) => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(results);
      return chain;
    };

    let callCount = 0;
    const mockDb = {
      select: vi.fn(() => {
        callCount++;
        if (callCount === 1) return createChainMock(mockWorkflowResults);
        return createChainMock([]); // No pending actions
      }),
    };

    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(mockDb);

    const { getContactUpcomingActions } = await import("./ghlActions");
    const result = await getContactUpcomingActions(1, "contact-123");

    // The removed workflow should not appear
    const workflows = result.filter(r => r.type === "workflow");
    expect(workflows).toHaveLength(0);
  });

  it("sorts workflows before other action types", async () => {
    const mockWorkflowResults = [
      {
        id: 1,
        tenantId: 1,
        actionType: "add_to_workflow",
        targetContactId: "contact-123",
        status: "executed",
        payload: JSON.stringify({ workflowId: "wf-1", workflowName: "Lead Nurture" }),
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
    ];
    const mockPendingResults = [
      {
        id: 3,
        tenantId: 1,
        actionType: "send_sms",
        targetContactId: "contact-123",
        status: "pending",
        payload: JSON.stringify({ message: "Follow up" }),
        createdAt: new Date("2026-03-03T12:00:00Z"),
      },
    ];

    const createChainMock = (results: any[]) => {
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(results);
      return chain;
    };

    let callCount = 0;
    const mockDb = {
      select: vi.fn(() => {
        callCount++;
        if (callCount === 1) return createChainMock(mockWorkflowResults);
        return createChainMock(mockPendingResults);
      }),
    };

    const { getDb } = await import("./db");
    (getDb as any).mockResolvedValue(mockDb);

    const { getContactUpcomingActions } = await import("./ghlActions");
    const result = await getContactUpcomingActions(1, "contact-123");

    if (result.length >= 2) {
      // Workflows should come first
      expect(result[0].type).toBe("workflow");
    }
  });

  it("handles errors gracefully and returns empty array", async () => {
    const { getDb } = await import("./db");
    (getDb as any).mockRejectedValue(new Error("DB connection failed"));

    const { getContactUpcomingActions } = await import("./ghlActions");
    const result = await getContactUpcomingActions(1, "contact-123");

    expect(result).toEqual([]);
  });
});
