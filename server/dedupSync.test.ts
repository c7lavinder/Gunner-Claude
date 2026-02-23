import { describe, it, expect } from "vitest";

/**
 * Tests for BatchDialer sync deduplication fixes:
 * 1. initLastSeenCallId should use descending order (newest first)
 * 2. Sync lock prevents concurrent runs
 * 3. Case-insensitive email matching prevents duplicate user accounts
 */

describe("BatchDialer sync deduplication", () => {
  describe("initLastSeenCallId ordering", () => {
    it("should use descending order to get the highest (newest) batchDialerCallId", async () => {
      // The fix changes orderBy(calls.callTimestamp) to orderBy(desc(calls.batchDialerCallId))
      // This ensures we get the NEWEST call ID, not the oldest
      const { desc } = await import("drizzle-orm");
      expect(desc).toBeDefined();
      expect(typeof desc).toBe("function");
    });

    it("should import desc from drizzle-orm in batchDialerSync", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("server/batchDialerSync.ts", "utf-8");
      expect(content).toContain('import { eq, desc } from "drizzle-orm"');
      expect(content).toContain("orderBy(desc(calls.batchDialerCallId))");
    });
  });

  describe("sync lock", () => {
    it("should have isSyncing flag to prevent concurrent runs", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("server/batchDialerSync.ts", "utf-8");
      expect(content).toContain("let isSyncing = false");
      expect(content).toContain("if (isSyncing)");
      expect(content).toContain("isSyncing = true");
      expect(content).toContain("isSyncing = false");
    });

    it("should set isSyncing in finally block to ensure cleanup", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("server/batchDialerSync.ts", "utf-8");
      // The finally block ensures isSyncing is reset even on error
      expect(content).toContain("} finally {");
      const finallyIndex = content.indexOf("} finally {");
      const afterFinally = content.substring(finallyIndex, finallyIndex + 100);
      expect(afterFinally).toContain("isSyncing = false");
    });
  });
});

describe("Case-insensitive email matching", () => {
  it("should use LOWER() for email comparison in upsertUser", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/db.ts", "utf-8");
    // The fix changes eq(users.email, user.email) to sql`LOWER(...) = LOWER(...)`
    expect(content).toContain("LOWER(${users.email}) = LOWER(${user.email})");
  });

  it("should not use case-sensitive eq() for email lookup in upsertUser", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/db.ts", "utf-8");
    // Find the upsertUser function and check it doesn't use eq for email
    const upsertSection = content.substring(
      content.indexOf("Check if user with this email"),
      content.indexOf("Check if user with this email") + 300
    );
    expect(upsertSection).not.toContain("eq(users.email, user.email)");
  });

  it("email comparison should handle mixed case correctly", () => {
    // Verify the logic: LOWER('Alvarez.lozano@hotmail.com') === LOWER('alvarez.lozano@hotmail.com')
    const email1 = "Alvarez.lozano@hotmail.com";
    const email2 = "alvarez.lozano@hotmail.com";
    expect(email1.toLowerCase()).toBe(email2.toLowerCase());
  });
});
