import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthenticatedContext(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "U3JEthPNs4UbYRrgRBbShj",
    email: "corey@newagainhouses.com",
    name: "Corey",
    loginMethod: "manus",
    role: "super_admin",
    teamRole: "admin",
    isTenantAdmin: "true",
    tenantId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
    emailVerified: "true",
    profilePicture: null,
    ...overrides,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ============ MULTI-ACTION PARSING TESTS ============

describe("Multi-Action Parsing", () => {
  // Mock createActionLog to prevent writing test data to production database
  let mockCreateActionLog: ReturnType<typeof vi.fn>;
  let nextMockId = 800000;

  beforeEach(async () => {
    const ghlActions = await import("./ghlActions");
    mockCreateActionLog = vi.spyOn(ghlActions, "createActionLog").mockImplementation(async () => {
      return nextMockId++;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseIntent returns actions array", () => {
    it("returns an actions array for a single action request", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note to John Smith saying he wants to sell his house",
      });
      expect(result).toHaveProperty("actions");
      expect(Array.isArray(result.actions)).toBe(true);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      if (result.actions.length > 0) {
        expect(result.actions[0]).toHaveProperty("actionType");
        expect(result.actions[0]).toHaveProperty("summary");
        expect(result.actions[0]).toHaveProperty("needsContactSearch");
        expect(["add_note", "add_note_contact", "add_note_opportunity"]).toContain(result.actions[0].actionType);
      }
    }, 30000);

    it("returns empty actions array for non-action messages", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "What is the best way to handle objections?",
      });
      expect(result).toHaveProperty("actions");
      expect(Array.isArray(result.actions)).toBe(true);
      expect(result.actions.length).toBe(0);
    }, 30000);

    it("parses multiple actions from a single message", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note to Jose Ruiz saying he's interested, then create a follow-up task for next week, and move him to the qualified stage",
      });
      expect(result).toHaveProperty("actions");
      expect(Array.isArray(result.actions)).toBe(true);
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
      
      // Verify each action has required fields
      for (const action of result.actions) {
        expect(action).toHaveProperty("actionType");
        expect(action).toHaveProperty("summary");
        expect(action).toHaveProperty("needsContactSearch");
        expect(action).toHaveProperty("contactName");
        expect(action).toHaveProperty("params");
      }
      
      // Verify we got different action types
      const actionTypes = result.actions.map((a: any) => a.actionType);
      const hasNote = actionTypes.some((t: string) => ["add_note", "add_note_contact", "add_note_opportunity"].includes(t));
      expect(hasNote).toBe(true);
      // Should have at least one of create_task or change_pipeline_stage
      const hasTask = actionTypes.includes("create_task");
      const hasPipeline = actionTypes.includes("change_pipeline_stage");
      expect(hasTask || hasPipeline).toBe(true);
    }, 30000);

    it("parses two actions: note + SMS", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note to Maria Garcia about her property at 456 Oak St, and send her an SMS saying we'd like to schedule a walkthrough",
      });
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
      
      const actionTypes = result.actions.map((a: any) => a.actionType);
      const hasNote = actionTypes.some((t: string) => ["add_note", "add_note_contact", "add_note_opportunity"].includes(t));
      expect(hasNote).toBe(true);
      expect(actionTypes).toContain("send_sms");
      
      // Both actions should reference the same contact
      const contactNames = result.actions.map((a: any) => a.contactName.toLowerCase());
      const uniqueNames = [...new Set(contactNames)];
      expect(uniqueNames.length).toBe(1);
    }, 30000);

    it("each action in the array has complete params", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note to Bob Johnson saying he's motivated to sell, and create a task to follow up in 2 days",
      });
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
      
      for (const action of result.actions) {
        expect(action.params).toBeDefined();
        expect(typeof action.params).toBe("object");
        
        if (["add_note", "add_note_contact", "add_note_opportunity"].includes(action.actionType)) {
          expect(action.params.noteBody).toBeTruthy();
          expect(action.params.noteBody.length).toBeGreaterThan(5);
        }
        if (action.actionType === "create_task") {
          expect(action.params.title).toBeTruthy();
        }
      }
    }, 30000);

    it("preserves context contact ID across multiple actions", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note saying interested, then add a hot-lead tag",
        contextContactId: "ghl-contact-123",
        contextContactName: "Test Contact",
      });
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
      
      // All actions should reference the context contact
      for (const action of result.actions) {
        expect(action.contactId).toBe("ghl-contact-123");
      }
    }, 30000);

    it("handles greeting messages with empty actions array", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Hey coach, how are you?",
      });
      expect(result.actions).toEqual([]);
    }, 30000);

    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(
        caller.coachActions.parseIntent({ message: "Add a note to John Smith" })
      ).rejects.toThrow();
    });

    it("rejects users without tenant", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      await expect(
        caller.coachActions.parseIntent({ message: "Add a note to John Smith" })
      ).rejects.toThrow();
    });

    it("filters out actions with invalid actionType from LLM response", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      // This message should produce valid actions, not "none" or empty types
      const result = await caller.coachActions.parseIntent({
        message: "For Kashundra Brown, can you move her to offer scheduled in the sales process pipeline and add notes of summary conversation",
      });
      expect(result).toHaveProperty("actions");
      expect(Array.isArray(result.actions)).toBe(true);
      // Every returned action must have a valid actionType
      for (const action of result.actions) {
        expect(action.actionType).toBeDefined();
        expect(typeof action.actionType).toBe("string");
        expect(action.actionType.trim()).not.toBe("");
        expect(action.actionType).not.toBe("none");
        expect(["add_note", "add_note_contact", "add_note_opportunity", "change_pipeline_stage", "send_sms", "create_task", "add_tag", "remove_tag", "update_field"]).toContain(action.actionType);
      }
    }, 30000);

    it("handles pipeline stage + note combo (Daniel's exact request)", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "For Kashundra Brown, can you move her to offer scheduled in the sales process pipeline and add notes of summary conversation",
      });
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
      const actionTypes = result.actions.map((a: any) => a.actionType);
      expect(actionTypes).toContain("change_pipeline_stage");
      const hasNote = actionTypes.some((t: string) => ["add_note", "add_note_contact", "add_note_opportunity"].includes(t));
      expect(hasNote).toBe(true);
    }, 30000);
  });

  describe("createPending still works with individual actions (mocked DB)", () => {
    it("creates a pending action card from a parsed action", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.createPending({
        actionType: "add_note_contact",
        requestText: "Add note to John Smith",
        payload: { noteBody: "Interested in selling" },
      });
      expect(result).toHaveProperty("actionId");
      expect(typeof result.actionId).toBe("number");
      // Verify mock was called instead of real DB
      expect(mockCreateActionLog).toHaveBeenCalledTimes(1);
    });

    it("creates multiple pending actions sequentially (mocked DB)", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      
      const action1 = await caller.coachActions.createPending({
        actionType: "add_note_contact",
        requestText: "Multi-action: note + task + stage",
        targetContactName: "Jose Ruiz",
        payload: { noteBody: "He's interested in selling" },
      });
      
      const action2 = await caller.coachActions.createPending({
        actionType: "create_task",
        requestText: "Multi-action: note + task + stage",
        targetContactName: "Jose Ruiz",
        payload: { title: "Follow up with Jose Ruiz", description: "Call back next week", dueDate: "2026-02-23" },
      });
      
      const action3 = await caller.coachActions.createPending({
        actionType: "change_pipeline_stage",
        requestText: "Multi-action: note + task + stage",
        targetContactName: "Jose Ruiz",
        payload: { stageName: "Qualified" },
      });
      
      expect(action1.actionId).toBeDefined();
      expect(action2.actionId).toBeDefined();
      expect(action3.actionId).toBeDefined();
      
      // Each should have a unique ID
      expect(action1.actionId).not.toBe(action2.actionId);
      expect(action2.actionId).not.toBe(action3.actionId);
      
      // Verify mock was called 3 times (no real DB writes)
      expect(mockCreateActionLog).toHaveBeenCalledTimes(3);
    });

    it("validates action types server-side", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      
      // Invalid action type should be rejected before reaching DB
      await expect(
        caller.coachActions.createPending({
          actionType: "invalid_action",
          requestText: "Invalid test",
          payload: {},
        })
      ).rejects.toThrow();
      
      // Mock should NOT have been called for invalid action
      expect(mockCreateActionLog).not.toHaveBeenCalled();
    });
  });
});
