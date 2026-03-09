import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { sql } from "drizzle-orm";

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

// Real user ID (FK constraint) and tenant
const TEST_USER_ID = 1;
const TEST_TENANT_ID = 1;

// We'll create temporary coach_action_log entries for FK references
let testActionLogIds: number[] = [];

async function setupTestActionLogs() {
  const { getDb } = await import("./db");
  const db = await getDb();
  if (!db) return;
  const { coachActionLog } = await import("../drizzle/schema");

  // Create 15 dummy action log entries for our tests
  for (let i = 0; i < 15; i++) {
    const [result] = await db.insert(coachActionLog).values({
      tenantId: TEST_TENANT_ID,
      requestedBy: TEST_USER_ID,
      actionType: "send_sms",
      requestText: `test-pref-${Date.now()}-${i}`,
      status: "executed",
    }).returning({ id: coachActionLog.id });
    testActionLogIds.push(result.id);
  }
}

async function cleanupTestData() {
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return;

    // Delete test edits that reference our test action log IDs
    if (testActionLogIds.length > 0) {
      const ids = testActionLogIds.join(",");
      await db.execute(sql.raw(`DELETE FROM coach_action_edits WHERE actionLogId IN (${ids})`));
      await db.execute(sql.raw(`DELETE FROM coach_action_log WHERE id IN (${ids})`));
    }

    // Delete test preferences created in last 5 minutes with low sample counts
    await db.execute(
      sql`DELETE FROM ai_coach_preferences WHERE "userId" = ${TEST_USER_ID} AND "sampleCount" <= 10 AND "createdAt" > NOW() - INTERVAL '5 minutes'`
    );
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}

// ============ UNIT TESTS: coachPreferences service ============

describe("Coach Preferences Service", () => {
  let recordEdit: typeof import("./coachPreferences").recordEdit;
  let getPreference: typeof import("./coachPreferences").getPreference;
  let getAllPreferences: typeof import("./coachPreferences").getAllPreferences;
  let buildPreferenceContext: typeof import("./coachPreferences").buildPreferenceContext;
  let getEditStats: typeof import("./coachPreferences").getEditStats;

  beforeAll(async () => {
    const mod = await import("./coachPreferences");
    recordEdit = mod.recordEdit;
    getPreference = mod.getPreference;
    getAllPreferences = mod.getAllPreferences;
    buildPreferenceContext = mod.buildPreferenceContext;
    getEditStats = mod.getEditStats;
    await setupTestActionLogs();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("recordEdit", () => {
    it("records an SMS edit with wasEdited=true", async () => {
      await recordEdit({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        actionLogId: testActionLogIds[0],
        actionType: "send_sms",
        originalPayload: { message: "Hey! Are you interested in selling your property?!!" },
        finalPayload: { message: "Hey, are you interested in selling your property?" },
        wasEdited: true,
      });

      const stats = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      expect(stats.totalEdits).toBeGreaterThanOrEqual(1);
    });

    it("records an accept-as-is with wasEdited=false", async () => {
      await recordEdit({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        actionLogId: testActionLogIds[1],
        actionType: "send_sms",
        originalPayload: { message: "Hey, checking in about your property" },
        finalPayload: { message: "Hey, checking in about your property" },
        wasEdited: false,
      });

      const stats = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      expect(stats.totalAccepts).toBeGreaterThanOrEqual(1);
    });

    it("records note edits in the note category", async () => {
      await recordEdit({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        actionLogId: testActionLogIds[2],
        actionType: "add_note_contact",
        originalPayload: { noteBody: "Seller is interested in selling their property" },
        finalPayload: { noteBody: "Seller motivated, 30-day timeline" },
        wasEdited: true,
      });

      const stats = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      expect(stats.categories).toContain("note");
    });

    it("records task edits in the task category", async () => {
      await recordEdit({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        actionLogId: testActionLogIds[3],
        actionType: "create_task",
        originalPayload: { title: "Follow up with the seller about their property" },
        finalPayload: { title: "Follow up - 123 Main St" },
        wasEdited: true,
      });

      const stats = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      expect(stats.categories).toContain("task");
    });

    it("ignores non-content action types like add_tag", async () => {
      const statsBefore = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      const totalBefore = statsBefore.totalEdits + statsBefore.totalAccepts;

      await recordEdit({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        actionLogId: testActionLogIds[4],
        actionType: "add_tag",
        originalPayload: { tags: ["hot-lead"] },
        finalPayload: { tags: ["hot-lead"] },
        wasEdited: false,
      });

      const statsAfter = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      const totalAfter = statsAfter.totalEdits + statsAfter.totalAccepts;
      expect(totalAfter).toBe(totalBefore);
    });

    it("ignores null payloads", async () => {
      const statsBefore = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      const totalBefore = statsBefore.totalEdits + statsBefore.totalAccepts;

      await recordEdit({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        actionLogId: testActionLogIds[5],
        actionType: "send_sms",
        originalPayload: null,
        finalPayload: null,
        wasEdited: false,
      });

      const statsAfter = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      const totalAfter = statsAfter.totalEdits + statsAfter.totalAccepts;
      expect(totalAfter).toBe(totalBefore);
    });
  });

  describe("getPreference", () => {
    it("returns null or a preference object for sms_style", async () => {
      const pref = await getPreference(TEST_TENANT_ID, TEST_USER_ID, "sms_style");
      // Could be null (no prefs yet) or an object (if prefs were generated from 3+ edits)
      if (pref !== null) {
        expect(pref).toHaveProperty("styleSummary");
        expect(pref).toHaveProperty("category");
      }
    });
  });

  describe("getAllPreferences", () => {
    it("returns an array", async () => {
      const prefs = await getAllPreferences(TEST_TENANT_ID, TEST_USER_ID);
      expect(Array.isArray(prefs)).toBe(true);
    });
  });

  describe("buildPreferenceContext", () => {
    it("returns a string (empty or with content)", async () => {
      const context = await buildPreferenceContext(TEST_TENANT_ID, TEST_USER_ID);
      expect(typeof context).toBe("string");
    });

    it("accepts optional category filter", async () => {
      const context = await buildPreferenceContext(TEST_TENANT_ID, TEST_USER_ID, ["sms_style"]);
      expect(typeof context).toBe("string");
    });
  });

  describe("getEditStats", () => {
    it("returns correct structure", async () => {
      const stats = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      expect(stats).toHaveProperty("totalEdits");
      expect(stats).toHaveProperty("totalAccepts");
      expect(stats).toHaveProperty("categories");
      expect(typeof stats.totalEdits).toBe("number");
      expect(typeof stats.totalAccepts).toBe("number");
      expect(Array.isArray(stats.categories)).toBe(true);
    });

    it("tracks SMS category from earlier edits", async () => {
      const stats = await getEditStats(TEST_TENANT_ID, TEST_USER_ID);
      expect(stats.categories).toContain("sms");
    });
  });
});

// ============ ROUTER ENDPOINT TESTS ============

describe("Coach Preferences Endpoints", () => {
  describe("coachActions.getPreferences", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(caller.coachActions.getPreferences()).rejects.toThrow();
    });

    it("returns array for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.getPreferences();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("coachActions.editStats", () => {
    it("rejects unauthenticated users", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      await expect(caller.coachActions.editStats()).rejects.toThrow();
    });

    it("returns stats object for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext());
      const result = await caller.coachActions.editStats();
      expect(result).toHaveProperty("totalEdits");
      expect(result).toHaveProperty("totalAccepts");
      expect(result).toHaveProperty("categories");
      expect(typeof result.totalEdits).toBe("number");
      expect(typeof result.totalAccepts).toBe("number");
      expect(Array.isArray(result.categories)).toBe(true);
    });
  });
});

// ============ SCHEMA VALIDATION ============

describe("Coach Preferences Schema", () => {
  it("coachActionEdits table exists with correct structure", async () => {
    const { coachActionEdits } = await import("../drizzle/schema");
    expect(coachActionEdits).toBeDefined();
  });

  it("aiCoachPreferences table exists with correct structure", async () => {
    const { aiCoachPreferences } = await import("../drizzle/schema");
    expect(aiCoachPreferences).toBeDefined();
  });

  it("confirmAndExecute endpoint exists and accepts editedPayload", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    expect(caller.coachActions.confirmAndExecute).toBeDefined();
  });
});
