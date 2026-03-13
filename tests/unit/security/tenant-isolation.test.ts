/**
 * Verify that critical UPDATE mutations include tenantId in their WHERE clauses.
 * Source-code assertion tests — reads the router files and checks for tenantId filters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const callsSource = readFileSync(
  path.resolve(__dirname, "../../../server/routers/calls.ts"),
  "utf-8"
);
const todaySource = readFileSync(
  path.resolve(__dirname, "../../../server/routers/today.ts"),
  "utf-8"
);

describe("Tenant isolation — UPDATE WHERE clauses", () => {
  describe("updateNextStep (calls.ts)", () => {
    it("includes tenantId in the UPDATE WHERE clause", () => {
      // Verify the .where() after db.update(callNextSteps) includes tenantId
      // The actual code: .where(and(eq(callNextSteps.id, ...), eq(callNextSteps.tenantId, tenantId)))
      expect(callsSource).toMatch(
        /db\.update\(callNextSteps\)[\s\S]*?\.where\([\s\S]*?tenantId[\s\S]*?\)/
      );
    });
  });

  describe("updateClassification (calls.ts)", () => {
    it("includes tenantId in the UPDATE WHERE clause", () => {
      const mutationStart = callsSource.indexOf("updateClassification");
      expect(mutationStart).toBeGreaterThan(-1);

      const section = callsSource.slice(mutationStart, mutationStart + 800);

      // Find the update(calls) — look for the SET that includes classification
      const updateIdx = section.indexOf("db.update(calls)");
      expect(updateIdx).toBeGreaterThan(-1);

      // Get a generous block to capture the full .where() chain
      const updateBlock = section.slice(updateIdx, updateIdx + 400);
      expect(updateBlock).toContain("tenantId");
    });
  });

  describe("completeTask (today.ts)", () => {
    it("includes tenantId in the UPDATE WHERE clause", () => {
      const mutationStart = todaySource.indexOf("completeTask");
      expect(mutationStart).toBeGreaterThan(-1);

      // Get the full mutation body (large window)
      const section = todaySource.slice(mutationStart, mutationStart + 1500);

      // Find the .update().where() line — it should contain tenantId
      expect(section).toContain(".update(dailyKpiEntries)");
      // Extract everything from the update to the .returning() call
      const updateStart = section.indexOf(".update(dailyKpiEntries)");
      const returningEnd = section.indexOf(".returning()", updateStart);
      const updateBlock = section.slice(updateStart, returningEnd);
      expect(updateBlock).toContain("tenantId");
    });

    it("includes userId filter in the UPDATE WHERE clause", () => {
      const mutationStart = todaySource.indexOf("completeTask");
      const section = todaySource.slice(mutationStart, mutationStart + 1500);

      const updateStart = section.indexOf(".update(dailyKpiEntries)");
      const returningEnd = section.indexOf(".returning()", updateStart);
      const updateBlock = section.slice(updateStart, returningEnd);
      // The code uses dailyKpiEntries.userId in the where clause
      expect(updateBlock).toContain("userId");
    });
  });
});
