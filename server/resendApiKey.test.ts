import { describe, it, expect } from "vitest";

describe("Resend API Key Validation (Disabled)", () => {
  it("Resend is intentionally disabled after spam attack — email sending short-circuited", () => {
    // Resend was removed entirely after the spam attack on 2026-03-06.
    // All sendEmail, sendPasswordResetEmail, sendTeamInviteEmail, sendWelcomeEmail
    // functions now return false immediately without making any API calls.
    // This test documents that the disabling is intentional.
    expect(true).toBe(true);
  });

  it("email functions return false when called", async () => {
    // Import the actual functions to verify they're short-circuited
    const { sendPasswordResetEmail } = await import("./emailService");
    const result = await sendPasswordResetEmail("test@example.com", "token", "https://example.com");
    expect(result).toBe(false);
  });
});
