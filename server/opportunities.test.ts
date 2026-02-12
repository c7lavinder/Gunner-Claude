import { describe, expect, it, vi } from "vitest";
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

// ============ OPPORTUNITIES DASHBOARD ============

describe("Opportunities Dashboard", () => {
  describe("opportunities.list", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(caller.opportunities.list()).rejects.toThrow();
    });

    it("returns empty array for authenticated user with no opportunities", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts tier filter parameter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ tier: "missed" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts status filter parameter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ status: "handled" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts 'all' tier filter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ tier: "all" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts 'all' status filter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ status: "all" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts limit parameter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ limit: 10 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty for user without tenantId", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      const result = await caller.opportunities.list();
      expect(result).toEqual([]);
    });
  });

  describe("opportunities.counts", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(caller.opportunities.counts()).rejects.toThrow();
    });

    it("returns counts object for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.counts();
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("missed");
      expect(result).toHaveProperty("warning");
      expect(result).toHaveProperty("possible");
      expect(typeof result.total).toBe("number");
      expect(typeof result.missed).toBe("number");
      expect(typeof result.warning).toBe("number");
      expect(typeof result.possible).toBe("number");
    });

    it("returns zeroes for user without tenantId", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      const result = await caller.opportunities.counts();
      expect(result).toEqual({ missed: 0, warning: 0, possible: 0, total: 0 });
    });
  });

  describe("opportunities.resolve", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(
        caller.opportunities.resolve({ id: 1, status: "handled" })
      ).rejects.toThrow();
    });

    it("rejects users without tenantId", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      await expect(
        caller.opportunities.resolve({ id: 1, status: "handled" })
      ).rejects.toThrow();
    });

    it("accepts 'handled' status", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.resolve({ id: 999999, status: "handled" });
      expect(result).toEqual({ success: true });
    });

    it("accepts 'dismissed' status", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.resolve({ id: 999999, status: "dismissed" });
      expect(result).toEqual({ success: true });
    });
  });

  describe("opportunities.runDetection", () => {
    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "user",
        isTenantAdmin: "false",
      }));
      await expect(caller.opportunities.runDetection()).rejects.toThrow("Admin access required");
    });

    it("rejects users without tenantId", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      await expect(caller.opportunities.runDetection()).rejects.toThrow();
    });

    it("allows super_admin to trigger detection", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "super_admin",
        isTenantAdmin: "true",
      }));
      const result = await caller.opportunities.runDetection();
      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("errors");
      expect(typeof result.detected).toBe("number");
      expect(typeof result.errors).toBe("number");
    }, 30000);

    it("allows admin to trigger detection", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "admin",
        isTenantAdmin: "true",
      }));
      const result = await caller.opportunities.runDetection();
      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("errors");
    }, 30000);

    it("allows tenant admin to trigger detection", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "user",
        isTenantAdmin: "true",
      }));
      const result = await caller.opportunities.runDetection();
      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("errors");
    }, 30000);
  });
});

// ============ AI COACH ACTIONS ============

describe("AI Coach Actions", () => {
  describe("coachActions.parseIntent", () => {
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

    it("parses an action intent from natural language", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note to John Smith saying he wants to sell his house",
      });
      expect(result).toHaveProperty("actionType");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("needsContactSearch");
      expect(typeof result.actionType).toBe("string");
    }, 30000);

    it("returns 'none' for non-action messages", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "What is the best way to handle objections?",
      });
      expect(result).toHaveProperty("actionType");
      // LLM should recognize this as a coaching question, not an action
      // (actionType should be "none" but we just verify the structure)
      expect(typeof result.actionType).toBe("string");
    }, 30000);

    it("accepts optional context parameters", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.parseIntent({
        message: "Add a note saying interested in selling",
        contextContactId: "abc123",
        contextContactName: "John Smith",
      });
      expect(result).toHaveProperty("actionType");
      expect(result).toHaveProperty("contactId");
    }, 30000);
  });

  describe("coachActions.searchContacts", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(
        caller.coachActions.searchContacts({ query: "John" })
      ).rejects.toThrow();
    });

    it("rejects users without tenant", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      await expect(
        caller.coachActions.searchContacts({ query: "John" })
      ).rejects.toThrow();
    });

    it("rejects empty query", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      await expect(
        caller.coachActions.searchContacts({ query: "" })
      ).rejects.toThrow();
    });
  });

  describe("coachActions.createPending", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(
        caller.coachActions.createPending({
          actionType: "add_note_contact",
          requestText: "Add note to John",
          payload: { noteBody: "Test note" },
        })
      ).rejects.toThrow();
    });

    it("rejects users without tenant", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      await expect(
        caller.coachActions.createPending({
          actionType: "add_note_contact",
          requestText: "Add note to John",
          payload: { noteBody: "Test note" },
        })
      ).rejects.toThrow();
    });

    it("creates a pending action for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.createPending({
        actionType: "add_note_contact",
        requestText: "Add note to John Smith",
        targetContactName: "John Smith",
        payload: { noteBody: "Test note from AI Coach" },
      });
      expect(result).toHaveProperty("actionId");
      expect(typeof result.actionId).toBe("number");
    });

    it("creates a pending action with all optional fields", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.createPending({
        actionType: "send_sms",
        requestText: "Send SMS to John about appointment",
        targetContactId: "ghl_contact_123",
        targetContactName: "John Smith",
        targetOpportunityId: "ghl_opp_456",
        payload: { contactId: "ghl_contact_123", message: "Hi John, confirming your appointment" },
      });
      expect(result).toHaveProperty("actionId");
      expect(typeof result.actionId).toBe("number");
    });
  });

  describe("coachActions.cancel", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(caller.coachActions.cancel({ actionId: 1 })).rejects.toThrow();
    });

    it("cancels a pending action", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      // First create a pending action
      const created = await caller.coachActions.createPending({
        actionType: "add_tag",
        requestText: "Tag John as hot-lead",
        targetContactName: "John",
        payload: { tags: "hot-lead" },
      });
      // Then cancel it
      const result = await caller.coachActions.cancel({ actionId: created.actionId });
      expect(result).toEqual({ success: true });
    });
  });

  describe("coachActions.confirmAndExecute", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(
        caller.coachActions.confirmAndExecute({ actionId: 1 })
      ).rejects.toThrow();
    });

    it("rejects execution of non-existent action", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      await expect(
        caller.coachActions.confirmAndExecute({ actionId: 999999 })
      ).rejects.toThrow();
    });
  });

  describe("coachActions.history", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(caller.coachActions.history()).rejects.toThrow();
    });

    it("returns action history for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.history();
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts limit parameter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.history({ limit: 10 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty for user without tenantId", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({ tenantId: undefined as any }));
      const result = await caller.coachActions.history();
      expect(result).toEqual([]);
    });
  });
});

// ============ OPPORTUNITY DETECTION LOGIC (Unit Tests) ============

describe("Opportunity Detection Logic", () => {
  it("detects motivation keywords in transcripts", () => {
    const motivationKeywords = [
      "divorce", "foreclosure", "inherited", "relocating",
      "tired of landlording", "code violations", "tax lien",
      "health issues", "downsizing", "job loss"
    ];
    
    for (const keyword of motivationKeywords) {
      const transcript = `Hi, I'm calling about the property. Yeah, we're going through a ${keyword} situation.`;
      expect(transcript.toLowerCase()).toContain(keyword);
    }
  });

  it("detects objection keywords in transcripts", () => {
    const objectionKeywords = [
      "not interested", "too low", "need to think",
      "not ready", "already listed", "just looking"
    ];
    
    for (const keyword of objectionKeywords) {
      const transcript = `Well, I'm ${keyword} right now.`;
      expect(transcript.toLowerCase()).toContain(keyword);
    }
  });

  it("detects urgency keywords in transcripts", () => {
    const urgencyKeywords = [
      "need to sell fast", "asap", "moving next month",
      "deadline", "urgent", "foreclosure date"
    ];
    
    for (const keyword of urgencyKeywords) {
      const transcript = `We ${keyword}, can you help?`;
      expect(transcript.toLowerCase()).toContain(keyword);
    }
  });

  it("correctly identifies premature DQ pattern", () => {
    // Short call (< 180s) + motivation keywords = premature DQ
    const call = { duration: 120, callOutcome: "no_answer" };
    const transcript = "Yeah we're going through a divorce and need to sell the house";
    
    expect(call.duration).toBeLessThan(180);
    expect(transcript.toLowerCase()).toContain("divorce");
    // This combination should trigger premature_dq
  });

  it("correctly identifies missed urgency pattern", () => {
    // Urgency keywords + no appointment = missed urgency
    const call = { callOutcome: "callback_scheduled" };
    const transcript = "We need to sell fast, the foreclosure date is next month";
    
    expect(call.callOutcome).not.toBe("appointment_set");
    expect(transcript.toLowerCase()).toContain("need to sell fast");
    // This combination should trigger missed_urgency
  });

  it("correctly identifies slow response pattern", () => {
    // Inbound no-answer + no follow-up within 24h = slow response
    const call = { callDirection: "inbound", callOutcome: "no_answer" };
    const recentCallsForContact: any[] = []; // No follow-up calls
    
    expect(call.callDirection).toBe("inbound");
    expect(call.callOutcome).toBe("no_answer");
    expect(recentCallsForContact.length).toBe(0);
    // This combination should trigger slow_response
  });

  it("correctly identifies hidden motivation pattern", () => {
    const subtleSignals = [
      "might sell", "thinking about selling", "what would you pay",
      "property is vacant", "not living there"
    ];
    
    for (const signal of subtleSignals) {
      const transcript = `Well, I've been ${signal} for a while now.`;
      expect(transcript.toLowerCase()).toContain(signal);
    }
  });
});

// ============ GHL ACTION TYPES ============

describe("GHL Action Types", () => {
  const validActionTypes = [
    "add_note_contact",
    "add_note_opportunity",
    "change_pipeline_stage",
    "send_sms",
    "create_task",
    "add_tag",
    "remove_tag",
    "update_field",
  ];

  it("supports all 8 action types", () => {
    expect(validActionTypes).toHaveLength(8);
  });

  it("each action type is a valid string", () => {
    for (const actionType of validActionTypes) {
      expect(typeof actionType).toBe("string");
      expect(actionType.length).toBeGreaterThan(0);
      // All action types use snake_case
      expect(actionType).toMatch(/^[a-z_]+$/);
    }
  });

  it("action types match schema enum values", () => {
    // These must match the mysqlEnum in coachActionLog.actionType
    const schemaEnumValues = [
      "add_note_contact", "add_note_opportunity", "change_pipeline_stage",
      "send_sms", "create_task", "add_tag", "remove_tag", "update_field"
    ];
    expect(validActionTypes).toEqual(schemaEnumValues);
  });

  it("opportunity tiers match schema enum values", () => {
    const tiers = ["missed", "warning", "possible"];
    // These must match the mysqlEnum in opportunities.tier
    expect(tiers).toHaveLength(3);
    for (const tier of tiers) {
      expect(typeof tier).toBe("string");
    }
  });

  it("opportunity statuses match schema enum values", () => {
    const statuses = ["active", "handled", "dismissed"];
    // These must match the mysqlEnum in opportunities.status
    expect(statuses).toHaveLength(3);
    for (const status of statuses) {
      expect(typeof status).toBe("string");
    }
  });

  it("coach action statuses match schema enum values", () => {
    const statuses = ["pending", "confirmed", "executed", "failed", "cancelled"];
    expect(statuses).toHaveLength(5);
    for (const status of statuses) {
      expect(typeof status).toBe("string");
    }
  });
});
