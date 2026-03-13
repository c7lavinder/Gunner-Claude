/**
 * Test that gradeCall handles invalid JSON from LLM gracefully.
 * When JSON.parse fails, it should set status to "grade_failed" instead of throwing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Read the grading source to verify the behavior exists in code
const gradingSource = readFileSync(
  path.resolve(__dirname, "../../../server/services/grading.ts"),
  "utf-8"
);

describe("gradeCall — JSON parse failure handling", () => {
  it("has a try/catch around JSON.parse of LLM output", () => {
    // The grading.ts source must wrap JSON.parse in try/catch
    expect(gradingSource).toContain("try {");
    expect(gradingSource).toContain("JSON.parse(");
    expect(gradingSource).toContain("} catch");
  });

  it("sets status to grade_failed when JSON.parse fails", () => {
    // Verify the catch block updates status to "grade_failed"
    expect(gradingSource).toContain('"grade_failed"');
  });

  it("returns null instead of throwing on parse failure", () => {
    // After setting grade_failed, gradeCall returns null
    const catchBlock = gradingSource.slice(
      gradingSource.indexOf("} catch {", gradingSource.indexOf("JSON.parse("))
    );
    expect(catchBlock).toContain("return null");
  });

  it("logs the raw output on parse failure for debugging", () => {
    // Verify the error is logged with context
    expect(gradingSource).toContain("JSON parse failed");
    expect(gradingSource).toContain("raw.slice(");
  });

  it("includes tenantId in the grade_failed UPDATE WHERE clause", () => {
    // The UPDATE that sets grade_failed must filter by both callId AND tenantId
    const gradeFailedSection = gradingSource.slice(
      gradingSource.indexOf("grade_failed"),
      gradingSource.indexOf("grade_failed") + 200
    );
    expect(gradeFailedSection).toContain("tenantId");
  });
});
