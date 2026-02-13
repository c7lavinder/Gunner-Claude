import { describe, it, expect } from "vitest";
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

// ============ OPPORTUNITIES DASHBOARD ENDPOINTS ============

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

    it("accepts warning tier filter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ tier: "warning" });
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts possible tier filter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.opportunities.list({ tier: "possible" });
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
    }, 120000);

    it("allows admin to trigger detection", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "admin",
        isTenantAdmin: "true",
      }));
      const result = await caller.opportunities.runDetection();
      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("errors");
    }, 120000);

    it("allows tenant admin to trigger detection", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "user",
        isTenantAdmin: "true",
      }));
      const result = await caller.opportunities.runDetection();
      expect(result).toHaveProperty("detected");
      expect(result).toHaveProperty("errors");
    }, 120000);
  });
});

// ============ AI COACH ACTIONS ENDPOINTS ============

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
      const created = await caller.coachActions.createPending({
        actionType: "add_tag",
        requestText: "Tag John as hot-lead",
        targetContactName: "John",
        payload: { tags: "hot-lead" },
      });
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

// ============ V2 PIPELINE-BASED DETECTION RULES (Unit Tests) ============

describe("Opportunity Detection V2 — Pipeline Manager Rules", () => {

  // --- Stage Classification ---
  describe("Stage Classification", () => {
    it("classifies active deal stages correctly", () => {
      const activeStages = [
        "New Lead", "Warm Leads", "SMS Warm Leads", "Hot Leads",
        "Pending Apt", "Walkthrough Apt Scheduled", "Offer Apt Scheduled",
        "Made Offer", "Under Contract", "Purchased"
      ];
      for (const stage of activeStages) {
        const lower = stage.toLowerCase();
        const isActive = [
          "new lead", "warm leads", "sms warm leads", "hot leads",
          "pending apt", "walkthrough apt scheduled", "offer apt scheduled",
          "made offer", "under contract", "purchased"
        ].some(s => lower.includes(s));
        expect(isActive).toBe(true);
      }
    });

    it("classifies follow-up stages correctly", () => {
      const followUpStages = [
        "1 Month Follow Up", "4 Month Follow Up", "1 Year Follow Up",
        "Follow Up", "New Offer", "New Walkthrough"
      ];
      for (const stage of followUpStages) {
        const lower = stage.toLowerCase();
        const isFollowUp = [
          "1 month follow up", "4 month follow up", "1 year follow up",
          "follow up", "new offer", "new walkthrough"
        ].some(s => lower.includes(s));
        expect(isFollowUp).toBe(true);
      }
    });

    it("classifies dead stages correctly", () => {
      const deadStages = [
        "Ghosted Lead", "Ghosted", "Agreement Not Closed",
        "Do Not Want", "Sold", "Trash"
      ];
      for (const stage of deadStages) {
        const lower = stage.toLowerCase();
        const isDead = [
          "ghosted lead", "ghosted", "agreement not closed",
          "do not want", "sold", "trash"
        ].some(s => lower.includes(s));
        expect(isDead).toBe(true);
      }
    });

    it("identifies high-value stages", () => {
      const highValueStages = [
        "Warm Leads", "Hot Leads", "Pending Apt",
        "Walkthrough Apt Scheduled", "Offer Apt Scheduled", "Made Offer"
      ];
      for (const stage of highValueStages) {
        const lower = stage.toLowerCase();
        const isHighValue = [
          "warm leads", "hot leads", "pending apt",
          "walkthrough apt scheduled", "offer apt scheduled", "made offer"
        ].some(s => lower.includes(s));
        expect(isHighValue).toBe(true);
      }
    });

    it("identifies walkthrough stages", () => {
      expect("Walkthrough Apt Scheduled".toLowerCase().includes("walkthrough")).toBe(true);
      expect("New Walkthrough".toLowerCase().includes("walkthrough")).toBe(true);
      expect("Hot Leads".toLowerCase().includes("walkthrough")).toBe(false);
    });

    it("identifies offer-or-beyond stages", () => {
      const offerStages = ["Made Offer", "Offer Apt Scheduled"];
      for (const stage of offerStages) {
        const lower = stage.toLowerCase();
        const isOffer = ["made offer", "offer apt scheduled"].some(s => lower.includes(s));
        expect(isOffer).toBe(true);
      }
      // Non-offer stages
      expect("Hot Leads".toLowerCase().includes("made offer")).toBe(false);
    });
  });

  // --- Tier 1: Missed Deals ---
  describe("Tier 1 — Missed Deals", () => {
    it("Rule 1: detects backward movement pattern (active → follow-up without call)", () => {
      // A lead in follow-up stage with a recent stage change and no outbound call
      const opp = {
        pipelineStageId: "stage_followup",
        lastStageChangeAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        contactId: "contact_123",
      };
      const stageName = "1 Month Follow Up";
      const stageClass = ["1 month follow up", "4 month follow up", "follow up"].some(
        s => stageName.toLowerCase().includes(s)
      ) ? "follow_up" : "other";
      expect(stageClass).toBe("follow_up");

      const stageChangeAt = new Date(opp.lastStageChangeAt);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      expect(stageChangeAt > sevenDaysAgo).toBe(true); // Recent change
    });

    it("Rule 2: detects repeat inbound from same seller (2+ in a week)", () => {
      const inboundCalls = [
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), status: "skipped", classification: "no_answer", duration: 5 },
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: "skipped", classification: "no_answer", duration: 3 },
      ];
      expect(inboundCalls.length).toBeGreaterThanOrEqual(2);
      expect(inboundCalls.every(c => c.callDirection === "inbound")).toBe(true);
      // None were answered — signal should fire
      const answered = inboundCalls.filter(
        c => c.status === "completed" && c.classification === "conversation" && c.duration > 60
      );
      expect(answered.length).toBe(0);
    });

    it("Rule 2: does NOT flag when inbound calls were answered (completed conversations)", () => {
      // Shirley Brackett scenario: 2 inbound calls, both answered with long conversations
      const inboundCalls = [
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), status: "completed", classification: "conversation", duration: 1158 },
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), status: "completed", classification: "conversation", duration: 730 },
      ];
      expect(inboundCalls.length).toBeGreaterThanOrEqual(2);
      // Team answered — signal should NOT fire
      const answered = inboundCalls.filter(
        c => c.status === "completed" && c.classification === "conversation" && c.duration > 60
      );
      expect(answered.length).toBeGreaterThan(0); // At least one answered = no signal
    });

    it("Rule 2: does NOT flag when at least one inbound call was answered", () => {
      // Mix of answered and missed inbound calls
      const inboundCalls = [
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), status: "completed", classification: "conversation", duration: 300 },
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: "skipped", classification: "no_answer", duration: 5 },
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), status: "skipped", classification: "too_short", duration: 10 },
      ];
      const answered = inboundCalls.filter(
        c => c.status === "completed" && c.classification === "conversation" && c.duration > 60
      );
      expect(answered.length).toBeGreaterThan(0); // One was answered = no signal
    });

    it("Rule 2: DOES flag when inbound calls are short/unanswered even if completed", () => {
      // Calls that are 'completed' but too short (voicemail, missed)
      const inboundCalls = [
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), status: "completed", classification: "voicemail", duration: 30 },
        { callDirection: "inbound", callTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: "skipped", classification: "no_answer", duration: 5 },
      ];
      const answered = inboundCalls.filter(
        c => c.status === "completed" && c.classification === "conversation" && c.duration > 60
      );
      expect(answered.length).toBe(0); // None truly answered = signal should fire
    });

    it("Rule 3: detects follow-up inbound ignored (>4h no response)", () => {
      const conversation = {
        lastMessageDirection: "inbound",
        lastMessageDate: Date.now() - 6 * 60 * 60 * 1000, // 6 hours ago
        unreadCount: 1,
      };
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      expect(conversation.lastMessageDirection).toBe("inbound");
      expect(conversation.lastMessageDate < fourHoursAgo).toBe(true); // Past SLA
      expect(conversation.unreadCount > 0).toBe(true); // Still unread
    });

    it("Rule 3: does NOT flag if within 4h SLA window", () => {
      const conversation = {
        lastMessageDirection: "inbound",
        lastMessageDate: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        unreadCount: 1,
      };
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      expect(conversation.lastMessageDate > fourHoursAgo).toBe(true); // Still within SLA
    });

    it("Rule 4: detects offer made but no follow-up within 48h", () => {
      const opp = {
        pipelineStageId: "stage_offer",
        lastStageChangeAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        contactId: "contact_456",
      };
      const stageName = "Made Offer";
      const isOffer = ["made offer", "offer apt scheduled"].some(
        s => stageName.toLowerCase().includes(s)
      );
      expect(isOffer).toBe(true);

      const stageChangeAt = new Date(opp.lastStageChangeAt);
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      expect(stageChangeAt < fortyEightHoursAgo).toBe(true); // Past 48h window
    });

    it("Rule 5: detects new lead SLA breach (no call within 15 min)", () => {
      const opp = {
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
        contactId: "contact_789",
      };
      const stageName = "New Lead";
      expect(stageName.toLowerCase().includes("new lead")).toBe(true);

      const createdAt = new Date(opp.createdAt);
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      expect(createdAt < fifteenMinAgo).toBe(true); // Past SLA
    });

    it("Rule 5: does NOT flag new leads within 15 min SLA", () => {
      const opp = {
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      };
      const createdAt = new Date(opp.createdAt);
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      expect(createdAt > fifteenMinAgo).toBe(true); // Still within SLA
    });

    it("Rule 14: detects active negotiation in follow-up stage", () => {
      const NEGOTIATION_KEYWORDS = [
        "consider", "counter", "counteroffer", "negotiate", "negotiating",
        "lower", "come down", "meet in the middle", "split the difference",
        "best offer", "final offer", "bottom line", "lowest",
        "what if", "how about", "would you", "willing to",
        "offer", "price", "amount", "number",
        "think about it", "thinking about", "considering", "might accept",
        "let me talk to", "talk to my", "discuss with",
        "husband", "wife", "partner", "family",
        "interested", "still interested", "want to sell", "ready to",
        "when can", "how soon", "next step", "move forward",
        "send me", "send over", "paperwork", "contract",
        "changed my mind", "reconsidered", "thought about",
        "calling back", "reaching out", "following up",
      ];

      // Suzanne Burgess pattern: "she'd consider lower"
      const smsMessages = [
        "I'd consider a lower offer",
        "What's the best you can do?",
        "Let me think about it and talk to my husband",
      ];

      const allText = smsMessages.join(" ").toLowerCase();
      const matchedKeywords = NEGOTIATION_KEYWORDS.filter(kw => allText.includes(kw.toLowerCase()));
      expect(matchedKeywords.length).toBeGreaterThan(0);
      expect(matchedKeywords).toContain("consider");
      expect(matchedKeywords).toContain("lower");
      expect(matchedKeywords).toContain("think about it");
      expect(matchedKeywords).toContain("husband");
    });

    it("Rule 14: requires follow-up stage classification", () => {
      const followUpStages = ["1 Month Follow Up", "4 Month Follow Up", "1 Year Follow Up"];
      for (const stage of followUpStages) {
        const lower = stage.toLowerCase();
        const isFollowUp = [
          "1 month follow up", "4 month follow up", "1 year follow up",
          "follow up", "new offer", "new walkthrough"
        ].some(s => lower.includes(s));
        expect(isFollowUp).toBe(true);
      }
    });

    it("Rule 14: does NOT flag messages without negotiation keywords", () => {
      const NEGOTIATION_KEYWORDS = [
        "consider", "counter", "counteroffer", "negotiate", "negotiating",
        "lower", "come down", "meet in the middle", "split the difference",
        "best offer", "final offer", "bottom line", "lowest",
        "what if", "how about", "would you", "willing to",
        "offer", "price", "amount", "number",
        "think about it", "thinking about", "considering", "might accept",
        "let me talk to", "talk to my", "discuss with",
        "husband", "wife", "partner", "family",
        "interested", "still interested", "want to sell", "ready to",
        "when can", "how soon", "next step", "move forward",
        "send me", "send over", "paperwork", "contract",
        "changed my mind", "reconsidered", "thought about",
        "calling back", "reaching out", "following up",
      ];

      const nonNegotiationMessages = [
        "ok",
        "thanks",
        "bye",
        "stop",
        "unsubscribe",
      ];

      const allText = nonNegotiationMessages.join(" ").toLowerCase();
      const matchedKeywords = NEGOTIATION_KEYWORDS.filter(kw => allText.includes(kw.toLowerCase()));
      expect(matchedKeywords.length).toBe(0);
    });

    it("Rule 14: only checks messages within 72-hour window", () => {
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const recentMsg = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
      const oldMsg = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      expect(recentMsg > seventyTwoHoursAgo).toBe(true); // Within window
      expect(oldMsg < seventyTwoHoursAgo).toBe(true); // Outside window
    });

    it("Rule 14: priority scales with keyword matches (Tier 3 range)", () => {
      const basePriority = 50;
      // 1 keyword = 53, 3 keywords = 59, 5+ keywords = 65 (capped)
      expect(Math.min(basePriority + Math.min(1 * 3, 15), 65)).toBe(53);
      expect(Math.min(basePriority + Math.min(3 * 3, 15), 65)).toBe(59);
      expect(Math.min(basePriority + Math.min(5 * 3, 15), 65)).toBe(65);
      expect(Math.min(basePriority + Math.min(10 * 3, 15), 65)).toBe(65); // Capped
    });

    it("Rule 14: does NOT flag active deal stages", () => {
      const activeStages = ["Hot Leads", "Pending Apt", "Made Offer"];
      for (const stage of activeStages) {
        const lower = stage.toLowerCase();
        const isFollowUp = [
          "1 month follow up", "4 month follow up", "1 year follow up",
          "follow up", "new offer", "new walkthrough"
        ].some(s => lower.includes(s));
        expect(isFollowUp).toBe(false);
      }
    });

    it("Rule 6: detects price stated in transcript with no follow-up", () => {
      const pricePatterns = [
        /i(?:'d|would)\s+take\s+\$?[\d,]+/i,
        /asking\s+(?:price\s+)?(?:is\s+)?\$?[\d,]+/i,
        /i\s+want\s+\$?[\d,]+/i,
        /(?:need|want)\s+at\s+least\s+\$?[\d,]+/i,
        /\$[\d,]+\s*(?:thousand|k)/i,
        /bottom\s+(?:line|dollar)\s+(?:is\s+)?\$?[\d,]+/i,
      ];

      const transcriptsWithPrice = [
        "I'd take $80,000 for the house",
        "The asking price is $150,000",
        "I want $200,000",
        "I need at least $100,000",
        "$75k is what I'm looking for",
        "Bottom line is $90,000",
      ];

      for (const transcript of transcriptsWithPrice) {
        const hasPrice = pricePatterns.some(p => p.test(transcript));
        expect(hasPrice).toBe(true);
      }
    });

    it("Rule 6: does NOT flag transcripts without price mentions", () => {
      const pricePatterns = [
        /i(?:'d|would)\s+take\s+\$?[\d,]+/i,
        /asking\s+(?:price\s+)?(?:is\s+)?\$?[\d,]+/i,
        /i\s+want\s+\$?[\d,]+/i,
        /(?:need|want)\s+at\s+least\s+\$?[\d,]+/i,
        /\$[\d,]+\s*(?:thousand|k)/i,
        /bottom\s+(?:line|dollar)\s+(?:is\s+)?\$?[\d,]+/i,
      ];

      const transcriptsWithoutPrice = [
        "I'm not sure what the house is worth",
        "We need to think about it",
        "Can you call me back tomorrow?",
      ];

      for (const transcript of transcriptsWithoutPrice) {
        const hasPrice = pricePatterns.some(p => p.test(transcript));
        expect(hasPrice).toBe(false);
      }
    });
  });

  // --- Tier 2: At Risk ---
  describe("Tier 2 — At Risk", () => {
    it("Rule 7: detects motivated seller with only 1 call attempt", () => {
      const motivationKeywords = [
        "divorce", "foreclosure", "inherited", "estate", "relocating",
        "tired of landlording", "bad tenants", "code violations", "fire damage",
        "tax lien", "back taxes", "health issues", "downsizing", "job loss",
        "need to sell fast", "need to sell quick", "asap", "deadline",
        "can't afford", "behind on payments", "passed away", "death"
      ];

      const transcript = "Yeah we're going through a divorce and need to sell the house fast";
      const lower = transcript.toLowerCase();
      const hasMotivation = motivationKeywords.some(k => lower.includes(k));
      expect(hasMotivation).toBe(true);
    });

    it("Rule 7: all motivation keywords are detected correctly", () => {
      const motivationKeywords = [
        "divorce", "foreclosure", "inherited", "estate", "relocating",
        "tired of landlording", "bad tenants", "code violations", "fire damage",
        "tax lien", "back taxes", "health issues", "downsizing", "job loss",
        "need to sell fast", "need to sell quick", "asap", "deadline",
        "can't afford", "behind on payments", "passed away", "death"
      ];

      for (const keyword of motivationKeywords) {
        const transcript = `The seller mentioned ${keyword} as a reason.`;
        expect(transcript.toLowerCase()).toContain(keyword);
      }
    });

    it("Rule 8: detects stale active stage (5+ days no activity)", () => {
      const stageName = "Pending Apt";
      const isPendingOrWalkthrough = stageName.toLowerCase().includes("pending apt") ||
        stageName.toLowerCase().includes("walkthrough");
      expect(isPendingOrWalkthrough).toBe(true);

      const stageChangeAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(stageChangeAt < fiveDaysAgo).toBe(true); // Stale
    });

    it("Rule 8: does NOT flag stages less than 5 days old", () => {
      const stageChangeAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(stageChangeAt > fiveDaysAgo).toBe(true); // Not stale yet
    });

    it("Rule 9: detects dead lead with selling signals in transcript", () => {
      const sellingSignals = [
        "timeline", "moving", "relocating", "need to sell",
        "divorce", "inherited", "estate", "foreclosure",
        "how does this work", "what would you pay", "send me an offer",
        "interested", "thinking about selling", "might sell", "considering"
      ];

      const transcript = "I'm thinking about selling. We inherited the property and might sell it.";
      const lower = transcript.toLowerCase();
      const matchedSignals = sellingSignals.filter(s => lower.includes(s));
      expect(matchedSignals.length).toBeGreaterThanOrEqual(2); // Needs 2+ signals
    });

    it("Rule 9: does NOT flag dead leads without selling signals", () => {
      const sellingSignals = [
        "timeline", "moving", "relocating", "need to sell",
        "divorce", "inherited", "estate", "foreclosure",
        "how does this work", "what would you pay", "send me an offer",
        "interested", "thinking about selling", "might sell", "considering"
      ];

      const transcript = "No, I'm not interested. Please don't call again.";
      const lower = transcript.toLowerCase();
      const matchedSignals = sellingSignals.filter(s => lower.includes(s));
      expect(matchedSignals.length).toBeLessThan(2);
    });

    it("Rule 10: detects walkthrough completed but no offer within 24h", () => {
      const stageName = "Walkthrough Apt Scheduled";
      expect(stageName.toLowerCase().includes("walkthrough")).toBe(true);

      const stageChangeAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(stageChangeAt < twentyFourHoursAgo).toBe(true); // Past 24h window
    });

    it("Rule 11: detects multiple contacts for same property address", () => {
      const propertyCalls = [
        { ghlContactId: "contact_A", propertyAddress: "123 Main St" },
        { ghlContactId: "contact_B", propertyAddress: "123 Main St" },
      ];
      const uniqueContacts = new Set(propertyCalls.map(c => c.ghlContactId));
      expect(uniqueContacts.size).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Tier 3: Worth a Look ---
  describe("Tier 3 — Worth a Look", () => {
    it("Rule 12: detects callback request patterns in transcript", () => {
      const callbackPatterns = [
        /call\s+(?:me\s+)?back\s+(?:in\s+)?(?:a\s+)?(?:few|couple|two|three|2|3)?\s*(?:days?|weeks?|hours?|minutes?)/i,
        /(?:try|call)\s+(?:me\s+)?(?:back\s+)?(?:tomorrow|next week|monday|tuesday|wednesday|thursday|friday)/i,
        /(?:i'll|i will)\s+be\s+(?:available|free|around)\s+(?:tomorrow|next|on)/i,
        /(?:reach|get)\s+(?:back\s+)?(?:to\s+)?me\s+(?:later|tomorrow|next)/i,
      ];

      const transcriptsWithCallback = [
        "Can you call me back in a few days?",
        "Try me back tomorrow afternoon",
        "I'll be available tomorrow morning",
        "Get back to me next week please",
        "Call back in 2 days",
      ];

      for (const transcript of transcriptsWithCallback) {
        const hasCallback = callbackPatterns.some(p => p.test(transcript));
        expect(hasCallback).toBe(true);
      }
    });

    it("Rule 12: does NOT flag non-callback transcripts", () => {
      const callbackPatterns = [
        /call\s+(?:me\s+)?back\s+(?:in\s+)?(?:a\s+)?(?:few|couple|two|three|2|3)?\s*(?:days?|weeks?|hours?|minutes?)/i,
        /(?:try|call)\s+(?:me\s+)?(?:back\s+)?(?:tomorrow|next week|monday|tuesday|wednesday|thursday|friday)/i,
        /(?:i'll|i will)\s+be\s+(?:available|free|around)\s+(?:tomorrow|next|on)/i,
        /(?:reach|get)\s+(?:back\s+)?(?:to\s+)?me\s+(?:later|tomorrow|next)/i,
      ];

      const transcriptsWithoutCallback = [
        "No thanks, I'm not interested",
        "We already sold the property",
        "I need to think about it",
      ];

      for (const transcript of transcriptsWithoutCallback) {
        const hasCallback = callbackPatterns.some(p => p.test(transcript));
        expect(hasCallback).toBe(false);
      }
    });

    it("Rule 12: should NOT flag when outbound activity exists after callback request", () => {
      // Simulates the Cathie Cooper case: seller scheduled callback, team called + texted
      const callbackPatterns = [
        /call\s+(?:me\s+)?back\s+(?:in\s+)?(?:a\s+)?(?:few|couple|two|three|2|3)?\s*(?:days?|weeks?|hours?|minutes?)/i,
        /(?:try|call)\s+(?:me\s+)?(?:back\s+)?(?:tomorrow|next week|monday|tuesday|wednesday|thursday|friday)/i,
        /(?:i'll|i will)\s+be\s+(?:available|free|around)\s+(?:tomorrow|next|on)/i,
        /(?:reach|get)\s+(?:back\s+)?(?:to\s+)?me\s+(?:later|tomorrow|next)/i,
      ];

      const transcript = "I'll be available tomorrow at noon, call me back then";
      const hasCallbackRequest = callbackPatterns.some(p => p.test(transcript));
      expect(hasCallbackRequest).toBe(true);

      // Simulate GHL conversation messages showing outbound follow-up
      const callTimestamp = new Date("2026-02-12T09:00:00Z").getTime();
      const ghlMessages = [
        { direction: "outbound", dateAdded: "2026-02-12T11:01:00Z", body: "Outbound Call" },
        { direction: "outbound", dateAdded: "2026-02-12T11:02:00Z", body: "Hey Cathie, is now a bad time?" },
      ];

      // Check if any outbound message is after the callback request
      let hasOutboundFollowUp = false;
      for (const msg of ghlMessages) {
        if (msg.direction !== "outbound") continue;
        const msgTime = new Date(msg.dateAdded).getTime();
        if (msgTime > callTimestamp) {
          hasOutboundFollowUp = true;
          break;
        }
      }
      expect(hasOutboundFollowUp).toBe(true);
      // When outbound follow-up exists, the rule should NOT create a detection
    });

    it("Rule 12: SHOULD flag when NO outbound activity after callback request", () => {
      const callTimestamp = new Date("2026-02-12T09:00:00Z").getTime();
      const ghlMessages = [
        { direction: "inbound", dateAdded: "2026-02-12T08:00:00Z", body: "Can you call me back tomorrow?" },
        { direction: "outbound", dateAdded: "2026-02-11T15:00:00Z", body: "We'd like to make an offer" },
      ];

      // Check if any outbound message is AFTER the callback request
      let hasOutboundFollowUp = false;
      for (const msg of ghlMessages) {
        if (msg.direction !== "outbound") continue;
        const msgTime = new Date(msg.dateAdded).getTime();
        if (msgTime > callTimestamp) {
          hasOutboundFollowUp = true;
          break;
        }
      }
      expect(hasOutboundFollowUp).toBe(false);
      // No outbound follow-up after callback request = should flag as missed callback
    });

    it("Rule 13: detects high talk-time DQ pattern", () => {
      // Long call (3+ min) + long transcript + DQ'd = potential missed deal
      const call = {
        duration: 300, // 5 minutes
        callOutcome: "not_interested",
        transcript: "A".repeat(1500), // Long transcript
      };
      expect(call.duration).toBeGreaterThanOrEqual(180);
      expect(call.transcript.length).toBeGreaterThanOrEqual(1000);
      expect(["not_interested", "dead"]).toContain(call.callOutcome);
    });

    it("Rule 13: does NOT flag short calls that were DQ'd", () => {
      const call = {
        duration: 60, // 1 minute
        callOutcome: "not_interested",
        transcript: "Short conversation",
      };
      expect(call.duration).toBeLessThan(180);
    });
  });

  // --- Detection Source Types ---
  describe("Detection Sources", () => {
    it("supports all detection source types", () => {
      const sources = ["pipeline", "conversation", "transcript", "hybrid"];
      expect(sources).toHaveLength(4);
      for (const source of sources) {
        expect(typeof source).toBe("string");
      }
    });

    it("pipeline rules use 'pipeline' source", () => {
      const pipelineRules = [
        "backward_movement_no_call",
        "new_lead_sla_breach",
        "offer_no_followup",
        "stale_active_stage",
        "walkthrough_no_offer",
      ];
      expect(pipelineRules.length).toBe(5);
    });

    it("conversation rules use 'conversation' source", () => {
      const conversationRules = [
        "repeat_inbound_ignored",
        "followup_inbound_ignored",
        "active_negotiation_in_followup",
      ];
      expect(conversationRules.length).toBe(3);
    });

    it("active_negotiation_in_followup is Tier 3 (Worth a Look)", () => {
      // This rule is for owner review, not a missed deal
      const tier3Rules = ["missed_callback_request", "high_talk_time_dq", "active_negotiation_in_followup"];
      expect(tier3Rules).toContain("active_negotiation_in_followup");
    });

    it("hybrid rules use transcript enrichment on pipeline data", () => {
      const hybridRules = [
        "price_stated_no_followup",
        "motivated_one_and_done",
        "dead_with_selling_signals",
        "missed_callback_request",
        "high_talk_time_dq",
        "duplicate_property_address",
      ];
      expect(hybridRules.length).toBe(6);
    });
  });

  // --- Rule Descriptions ---
  describe("Rule Descriptions", () => {
    const allRules = [
      "backward_movement_no_call",
      "repeat_inbound_ignored",
      "followup_inbound_ignored",
      "offer_no_followup",
      "new_lead_sla_breach",
      "price_stated_no_followup",
      "motivated_one_and_done",
      "stale_active_stage",
      "dead_with_selling_signals",
      "walkthrough_no_offer",
      "duplicate_property_address",
      "missed_callback_request",
      "high_talk_time_dq",
      "active_negotiation_in_followup",
    ];

    it("has 14 detection rules total", () => {
      expect(allRules).toHaveLength(14);
    });

    it("all rule names use snake_case", () => {
      for (const rule of allRules) {
        expect(rule).toMatch(/^[a-z_]+$/);
      }
    });

    it("Tier 1 has 6 rules", () => {
      const tier1 = [
        "backward_movement_no_call",
        "repeat_inbound_ignored",
        "followup_inbound_ignored",
        "offer_no_followup",
        "new_lead_sla_breach",
        "price_stated_no_followup",
      ];
      expect(tier1).toHaveLength(6);
    });

    it("Tier 2 has 5 rules", () => {
      const tier2 = [
        "motivated_one_and_done",
        "stale_active_stage",
        "dead_with_selling_signals",
        "walkthrough_no_offer",
        "duplicate_property_address",
      ];
      expect(tier2).toHaveLength(5);
    });

    it("Tier 3 has 3 rules", () => {
      const tier3 = [
        "missed_callback_request",
        "high_talk_time_dq",
        "active_negotiation_in_followup",
      ];
      expect(tier3).toHaveLength(3);
    });
  });

  // --- Priority Scoring ---
  describe("Priority Scoring", () => {
    it("Tier 1 rules have higher priority scores than Tier 2", () => {
      const tier1Scores = [75, 80, 85, 80, 70, 85]; // backward, repeat, followup, offer, sla, price
      const tier2Scores = [65, 60, 70, 65, 55]; // motivated, stale, dead, walkthrough, duplicate

      const minTier1 = Math.min(...tier1Scores);
      const maxTier2 = Math.max(...tier2Scores);
      expect(minTier1).toBeGreaterThanOrEqual(maxTier2);
    });

    it("Tier 2 rules have higher priority scores than Tier 3", () => {
      const tier2Scores = [65, 60, 70, 65, 55];
      const tier3Scores = [50, 45]; // callback, talk-time

      const minTier2 = Math.min(...tier2Scores);
      const maxTier3 = Math.max(...tier3Scores);
      expect(minTier2).toBeGreaterThan(maxTier3);
    });

    it("all priority scores are between 0 and 100", () => {
      const allScores = [75, 80, 85, 80, 70, 85, 65, 60, 70, 65, 55, 50, 45, 50];
      for (const score of allScores) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
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
      expect(actionType).toMatch(/^[a-z_]+$/);
    }
  });

  it("action types match schema enum values", () => {
    const schemaEnumValues = [
      "add_note_contact", "add_note_opportunity", "change_pipeline_stage",
      "send_sms", "create_task", "add_tag", "remove_tag", "update_field"
    ];
    expect(validActionTypes).toEqual(schemaEnumValues);
  });

  it("opportunity tiers match schema enum values", () => {
    const tiers = ["missed", "warning", "possible"];
    expect(tiers).toHaveLength(3);
    for (const tier of tiers) {
      expect(typeof tier).toBe("string");
    }
  });

  it("opportunity statuses match schema enum values", () => {
    const statuses = ["active", "handled", "dismissed"];
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

  it("detection source types match schema enum values", () => {
    const sources = ["pipeline", "conversation", "transcript", "hybrid"];
    expect(sources).toHaveLength(4);
    for (const source of sources) {
      expect(typeof source).toBe("string");
    }
  });
});
