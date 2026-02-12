import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_DIR = join(__dirname, "..", "client", "src");

/**
 * Tests for admin call auto-grading.
 * Verifies that:
 * 1. processCall auto-grades admin_call classified calls instead of skipping
 * 2. The admin_callback rubric is used for grading
 * 3. Frontend shows "Auto-Grade as Admin" for existing skipped admin calls
 * 4. Future admin calls are marked as "completed" not "skipped"
 */

describe("Admin Call Auto-Grading - processCall", () => {
  const gradingSource = readFileSync(join(SERVER_DIR, "grading.ts"), "utf-8");

  it("should detect admin_call classification and auto-grade instead of skipping", () => {
    // Verify the admin_call branch exists in the shouldGrade=false block
    expect(gradingSource).toContain('classificationResult.classification === "admin_call"');
    expect(gradingSource).toContain("auto-grading with admin rubric");
  });

  it("should call gradeCall with admin_callback rubric for admin calls", () => {
    // Verify gradeCall is called with "admin_callback" type
    expect(gradingSource).toContain('gradeCall(transcript, "admin_callback", teamMemberName');
  });

  it("should save the grade with rubricType admin_callback", () => {
    // Verify the grade is saved with the correct rubric type
    expect(gradingSource).toContain('rubricType: "admin_callback"');
  });

  it("should mark admin calls as completed, not skipped", () => {
    // Verify the call status is set to "completed" for admin calls
    // Find the admin_call block and verify it sets status to completed
    const adminBlock = gradingSource.substring(
      gradingSource.indexOf('classification === "admin_call"'),
      gradingSource.indexOf("// All other non-gradable")
    );
    expect(adminBlock).toContain('status: "completed"');
    expect(adminBlock).not.toContain('status: "skipped"');
  });

  it("should set callType to admin_callback for auto-graded admin calls", () => {
    const adminBlock = gradingSource.substring(
      gradingSource.indexOf('classification === "admin_call"'),
      gradingSource.indexOf("// All other non-gradable")
    );
    expect(adminBlock).toContain('callType: "admin_callback"');
  });

  it("should preserve classification as admin_call after grading", () => {
    const adminBlock = gradingSource.substring(
      gradingSource.indexOf('classification === "admin_call"'),
      gradingSource.indexOf("// All other non-gradable")
    );
    expect(adminBlock).toContain('classification: "admin_call"');
  });

  it("should save admin call summary to classificationReason", () => {
    const adminBlock = gradingSource.substring(
      gradingSource.indexOf('classification === "admin_call"'),
      gradingSource.indexOf("// All other non-gradable")
    );
    expect(adminBlock).toContain("classificationResult.summary");
    expect(adminBlock).toContain("classificationReason");
  });

  it("should still skip non-admin non-gradable calls (voicemail, no_answer, etc.)", () => {
    // Verify the fallback for other classifications still skips
    expect(gradingSource).toContain("// All other non-gradable classifications");
    expect(gradingSource).toContain('await updateCall(callId, { status: "skipped" })');
  });

  it("should resolve team member name for admin call grading", () => {
    const adminBlock = gradingSource.substring(
      gradingSource.indexOf('classification === "admin_call"'),
      gradingSource.indexOf("// All other non-gradable")
    );
    expect(adminBlock).toContain("getTeamMemberById");
    expect(adminBlock).toContain("teamMemberName");
  });

  it("should get tenant company name for admin call grading context", () => {
    const adminBlock = gradingSource.substring(
      gradingSource.indexOf('classification === "admin_call"'),
      gradingSource.indexOf("// All other non-gradable")
    );
    expect(adminBlock).toContain("getTenantById");
    expect(adminBlock).toContain("companyName");
  });
});

describe("Admin Call Auto-Grading - Frontend", () => {
  const callInboxSource = readFileSync(join(CLIENT_DIR, "pages", "CallInbox.tsx"), "utf-8");

  it("should show 'Auto-Grade as Admin' button for admin_call classified calls", () => {
    expect(callInboxSource).toContain("Auto-Grade as Admin");
  });

  it("should check classification === admin_call to determine button type", () => {
    expect(callInboxSource).toContain('item.classification === "admin_call"');
  });

  it("should still show 'Grade This Call' for non-admin skipped calls", () => {
    expect(callInboxSource).toContain("Grade This Call");
  });

  it("should filter admin_call from skippedCalls list", () => {
    // Verify admin_call is excluded from the skipped calls filter
    expect(callInboxSource).toContain('classification !== "admin_call"');
  });
});

describe("Admin Callback Rubric", () => {
  const gradingSource = readFileSync(join(SERVER_DIR, "grading.ts"), "utf-8");

  it("should have ADMIN_CALLBACK_RUBRIC defined", () => {
    expect(gradingSource).toContain("ADMIN_CALLBACK_RUBRIC");
  });

  it("should be excluded from leaderboard", () => {
    expect(gradingSource).toContain("excludeFromLeaderboard: true");
  });

  it("should have no critical failures for admin calls", () => {
    // Admin callbacks are low-stakes
    expect(gradingSource).toContain("criticalFailures: [] as string[]");
  });
});
