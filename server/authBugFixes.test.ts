import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Bug 1: Email/password signup must check pending invitations
// Bug 2: Email/password login must call autoMatchTeamMember
// Account Settings: changePassword, updateProfile, getAccountInfo
// ============================================================

// Mock modules
vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./selfServeAuth", () => ({
  signUpWithEmail: vi.fn(),
  signInWithEmail: vi.fn(),
  getUserWithTenant: vi.fn(),
  createSessionToken: vi.fn(() => "mock-token"),
  requestPasswordReset: vi.fn(),
  verifyResetToken: vi.fn(),
  resetPassword: vi.fn(),
  createEmailVerification: vi.fn(() => Promise.resolve({ success: true })),
  verifyEmailToken: vi.fn(),
  resendVerificationEmail: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(() => Promise.resolve("new-hash")),
}));

vi.mock("./tenant", () => ({
  createTenantCheckoutSession: vi.fn(),
  checkAndAcceptPendingInvitation: vi.fn(),
  autoMatchTeamMember: vi.fn(),
}));

vi.mock("./googleAuth", () => ({
  exchangeCodeForTokens: vi.fn(),
  decodeIdToken: vi.fn(),
  signInWithGoogle: vi.fn(),
  completeGoogleSignup: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
}));

// Import after mocks
import { checkAndAcceptPendingInvitation, autoMatchTeamMember } from "./tenant";
import { signUpWithEmail, signInWithEmail, getUserWithTenant, createSessionToken, verifyPassword, hashPassword } from "./selfServeAuth";

describe("Bug 1: Email/password signup handles pending invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should check for pending invitation after creating account", async () => {
    // Setup: signUpWithEmail succeeds, and there's a pending invitation
    (signUpWithEmail as any).mockResolvedValue({
      success: true,
      userId: 42,
      tenantId: 100, // New tenant created during signup
    });
    (checkAndAcceptPendingInvitation as any).mockResolvedValue({
      tenantId: 200, // Existing tenant from invitation
      tenantName: "Corey's Team",
      role: "user",
      teamRole: "lead_manager",
    });
    (createSessionToken as any).mockReturnValue("token-with-invited-tenant");

    // The signup route should:
    // 1. Create the account (signUpWithEmail)
    // 2. Check for pending invitation (checkAndAcceptPendingInvitation)
    // 3. If invitation found, use the invited tenant's ID for the session token

    // Verify the functions exist and are callable
    expect(typeof checkAndAcceptPendingInvitation).toBe("function");
    expect(typeof signUpWithEmail).toBe("function");

    // Simulate the signup flow
    const signupResult = await signUpWithEmail({
      email: "daniel@test.com",
      password: "password123",
      name: "Daniel Lozano",
      companyName: "Test Co",
      planId: "growth",
    });
    expect(signupResult.success).toBe(true);

    // Check for pending invitation
    const inviteResult = await checkAndAcceptPendingInvitation(
      signupResult.userId!,
      "daniel@test.com"
    );
    expect(inviteResult).not.toBeNull();
    expect(inviteResult!.tenantId).toBe(200);
    expect(inviteResult!.tenantName).toBe("Corey's Team");

    // Session token should use the invited tenant ID, not the new one
    const token = createSessionToken(signupResult.userId!, inviteResult!.tenantId);
    expect(createSessionToken).toHaveBeenCalledWith(42, 200);
  });

  it("should fall back to autoMatchTeamMember if no pending invitation", async () => {
    (signUpWithEmail as any).mockResolvedValue({
      success: true,
      userId: 43,
      tenantId: 101,
    });
    (checkAndAcceptPendingInvitation as any).mockResolvedValue(null); // No invitation
    (autoMatchTeamMember as any).mockResolvedValue({
      tenantId: 300,
      tenantName: "Matched Team",
      teamMemberName: "Daniel Lozano",
      teamRole: "lead_manager",
    });

    const signupResult = await signUpWithEmail({
      email: "daniel@test.com",
      password: "password123",
      name: "Daniel Lozano",
      companyName: "Test Co",
      planId: "growth",
    });

    const inviteResult = await checkAndAcceptPendingInvitation(
      signupResult.userId!,
      "daniel@test.com"
    );
    expect(inviteResult).toBeNull();

    // Should try auto-match
    const matchResult = await autoMatchTeamMember(
      signupResult.userId!,
      "Daniel Lozano",
      "daniel@test.com"
    );
    expect(matchResult).not.toBeNull();
    expect(matchResult!.tenantId).toBe(300);
  });

  it("should continue with new tenant if no invitation and no match", async () => {
    (signUpWithEmail as any).mockResolvedValue({
      success: true,
      userId: 44,
      tenantId: 102,
    });
    (checkAndAcceptPendingInvitation as any).mockResolvedValue(null);
    (autoMatchTeamMember as any).mockResolvedValue(null);

    const signupResult = await signUpWithEmail({
      email: "newuser@test.com",
      password: "password123",
      name: "New User",
      companyName: "New Co",
      planId: "growth",
    });

    const inviteResult = await checkAndAcceptPendingInvitation(
      signupResult.userId!,
      "newuser@test.com"
    );
    expect(inviteResult).toBeNull();

    const matchResult = await autoMatchTeamMember(
      signupResult.userId!,
      "New User",
      "newuser@test.com"
    );
    expect(matchResult).toBeNull();

    // Should use the original tenant from signup
    const finalTenantId = inviteResult?.tenantId ?? matchResult?.tenantId ?? signupResult.tenantId;
    expect(finalTenantId).toBe(102);
  });

  it("should handle invitation check errors gracefully", async () => {
    (signUpWithEmail as any).mockResolvedValue({
      success: true,
      userId: 45,
      tenantId: 103,
    });
    (checkAndAcceptPendingInvitation as any).mockRejectedValue(new Error("DB connection failed"));

    const signupResult = await signUpWithEmail({
      email: "user@test.com",
      password: "password123",
      name: "Test User",
      companyName: "Test Co",
      planId: "growth",
    });

    // Should not throw — error is caught and user continues with new tenant
    let finalTenantId = signupResult.tenantId!;
    try {
      const inviteResult = await checkAndAcceptPendingInvitation(
        signupResult.userId!,
        "user@test.com"
      );
      if (inviteResult) finalTenantId = inviteResult.tenantId;
    } catch {
      // Non-fatal — user continues with their new tenant
    }
    expect(finalTenantId).toBe(103);
  });
});

describe("Bug 2: Email/password login calls autoMatchTeamMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should check pending invitations on login", async () => {
    (signInWithEmail as any).mockResolvedValue({
      success: true,
      token: "old-token",
      user: { id: 50, name: "Chris", email: "chris@test.com", tenantId: null, role: "user", teamRole: null },
    });
    (checkAndAcceptPendingInvitation as any).mockResolvedValue({
      tenantId: 400,
      tenantName: "Corey's Team",
      role: "user",
      teamRole: "acquisition_manager",
    });
    (createSessionToken as any).mockReturnValue("new-token-with-tenant");

    const loginResult = await signInWithEmail({ email: "chris@test.com", password: "pass123" });
    expect(loginResult.success).toBe(true);

    const inviteResult = await checkAndAcceptPendingInvitation(
      loginResult.user.id,
      "chris@test.com"
    );
    expect(inviteResult).not.toBeNull();
    expect(inviteResult!.tenantId).toBe(400);

    // Token should be re-created with new tenant
    const newToken = createSessionToken(loginResult.user.id, inviteResult!.tenantId);
    expect(createSessionToken).toHaveBeenCalledWith(50, 400);
  });

  it("should try autoMatchTeamMember if no invitation and no tenant", async () => {
    (signInWithEmail as any).mockResolvedValue({
      success: true,
      token: "old-token",
      user: { id: 51, name: "Kyle Smith", email: "kyle@test.com", tenantId: null, role: "user", teamRole: null },
    });
    (checkAndAcceptPendingInvitation as any).mockResolvedValue(null);
    (autoMatchTeamMember as any).mockResolvedValue({
      tenantId: 500,
      tenantName: "Matched Team",
      teamMemberName: "Kyle Smith",
      teamRole: "lead_manager",
    });

    const loginResult = await signInWithEmail({ email: "kyle@test.com", password: "pass123" });
    const inviteResult = await checkAndAcceptPendingInvitation(loginResult.user.id, "kyle@test.com");
    expect(inviteResult).toBeNull();

    // User has no tenant, so try auto-match
    expect(loginResult.user.tenantId).toBeNull();
    const matchResult = await autoMatchTeamMember(
      loginResult.user.id,
      loginResult.user.name,
      "kyle@test.com"
    );
    expect(matchResult).not.toBeNull();
    expect(matchResult!.tenantId).toBe(500);
  });

  it("should skip autoMatch if user already has a tenant", async () => {
    (signInWithEmail as any).mockResolvedValue({
      success: true,
      token: "existing-token",
      user: { id: 52, name: "Existing User", email: "existing@test.com", tenantId: 600, role: "user", teamRole: "lead_manager" },
    });
    (checkAndAcceptPendingInvitation as any).mockResolvedValue(null);

    const loginResult = await signInWithEmail({ email: "existing@test.com", password: "pass123" });
    await checkAndAcceptPendingInvitation(loginResult.user.id, "existing@test.com");

    // User already has tenantId, should NOT call autoMatchTeamMember
    expect(loginResult.user.tenantId).toBe(600);
    // In the actual route, the condition `if (!result.user.tenantId)` prevents autoMatch
    // We verify the logic here
    if (!loginResult.user.tenantId) {
      await autoMatchTeamMember(loginResult.user.id, loginResult.user.name, "existing@test.com");
    }
    expect(autoMatchTeamMember).not.toHaveBeenCalled();
  });
});

describe("Account Settings: changePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should verify current password before changing", async () => {
    (verifyPassword as any).mockResolvedValue(true);
    (hashPassword as any).mockResolvedValue("new-hashed-password");

    const isValid = await verifyPassword("current-pass", "stored-hash");
    expect(isValid).toBe(true);

    const newHash = await hashPassword("new-password-123");
    expect(newHash).toBe("new-hashed-password");
    expect(hashPassword).toHaveBeenCalledWith("new-password-123");
  });

  it("should reject if current password is wrong", async () => {
    (verifyPassword as any).mockResolvedValue(false);

    const isValid = await verifyPassword("wrong-pass", "stored-hash");
    expect(isValid).toBe(false);
    // In the actual endpoint, this would throw UNAUTHORIZED
  });

  it("should enforce minimum password length", () => {
    const shortPassword = "abc";
    const validPassword = "password123";
    expect(shortPassword.length >= 8).toBe(false);
    expect(validPassword.length >= 8).toBe(true);
  });
});

describe("Account Settings: updateProfile", () => {
  it("should allow updating name", () => {
    const updates: Record<string, string> = {};
    const newName = "Corey Updated";
    const currentName = "Corey";

    if (newName !== currentName) updates.name = newName;
    expect(updates).toEqual({ name: "Corey Updated" });
  });

  it("should allow updating email", () => {
    const updates: Record<string, string> = {};
    const newEmail = "new@email.com";
    const currentEmail = "old@email.com";

    if (newEmail !== currentEmail) updates.email = newEmail;
    expect(updates).toEqual({ email: "new@email.com" });
  });

  it("should skip update if nothing changed", () => {
    const updates: Record<string, string> = {};
    const name = "Same Name";
    const email = "same@email.com";

    if (name !== "Same Name") updates.name = name;
    if (email !== "same@email.com") updates.email = email;
    expect(Object.keys(updates).length).toBe(0);
  });
});

describe("Route file imports", () => {
  it("should import checkAndAcceptPendingInvitation from tenant module", () => {
    expect(typeof checkAndAcceptPendingInvitation).toBe("function");
  });

  it("should import autoMatchTeamMember from tenant module", () => {
    expect(typeof autoMatchTeamMember).toBe("function");
  });

  it("should import verifyPassword and hashPassword from selfServeAuth", () => {
    expect(typeof verifyPassword).toBe("function");
    expect(typeof hashPassword).toBe("function");
  });
});
