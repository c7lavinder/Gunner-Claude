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

describe("Coach Activity Log (Admin)", () => {
  describe("adminActivityLog endpoint", () => {
    it("returns activity data for admin users", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.adminActivityLog({ limit: 50 });

      expect(result).toHaveProperty("actions");
      expect(result).toHaveProperty("questions");
      expect(result).toHaveProperty("totalActions");
      expect(result).toHaveProperty("totalQuestions");
      expect(Array.isArray(result.actions)).toBe(true);
      expect(Array.isArray(result.questions)).toBe(true);
      expect(typeof result.totalActions).toBe("number");
      expect(typeof result.totalQuestions).toBe("number");
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "user",
        teamRole: "lead_manager",
        isTenantAdmin: "false",
      }));
      await expect(
        caller.coachActions.adminActivityLog({ limit: 50 })
      ).rejects.toThrow("Admin access required");
    });

    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(
        caller.coachActions.adminActivityLog({ limit: 50 })
      ).rejects.toThrow();
    });

    it("allows tenant admin users", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext({
        role: "user",
        teamRole: "lead_manager",
        isTenantAdmin: "true",
      }));
      const result = await caller.coachActions.adminActivityLog({ limit: 10 });
      expect(result).toHaveProperty("actions");
      expect(result).toHaveProperty("questions");
    });

    it("respects limit parameter", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.adminActivityLog({ limit: 5 });
      expect(result.actions.length).toBeLessThanOrEqual(5);
      expect(result.questions.length).toBeLessThanOrEqual(5);
    });

    it("returns enriched questions with userName", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.adminActivityLog({ limit: 50 });
      for (const q of result.questions) {
        expect(q).toHaveProperty("userName");
        expect(typeof q.userName).toBe("string");
      }
    });

    it("returns actions with all required fields", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.adminActivityLog({ limit: 50 });
      for (const action of result.actions) {
        expect(action).toHaveProperty("id");
        expect(action).toHaveProperty("requestedBy");
        expect(action).toHaveProperty("actionType");
        expect(action).toHaveProperty("requestText");
        expect(action).toHaveProperty("status");
        expect(action).toHaveProperty("createdAt");
      }
    });

    it("supports optional filtering parameters", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      // Should not throw with filter params
      const result = await caller.coachActions.adminActivityLog({
        limit: 10,
        actionType: "add_note_contact",
      });
      expect(result).toHaveProperty("actions");
      // All returned actions should match the filter
      for (const action of result.actions) {
        expect(action.actionType).toBe("add_note_contact");
      }
    });

    it("supports date range filtering", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.adminActivityLog({
        limit: 10,
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      });
      expect(result).toHaveProperty("actions");
      expect(result).toHaveProperty("questions");
    });

    it("works with default parameters (no input)", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.adminActivityLog();
      expect(result).toHaveProperty("actions");
      expect(result).toHaveProperty("questions");
      expect(result.actions.length).toBeLessThanOrEqual(100);
    });
  });
});
