import { Router, Request, Response } from "express";
import { signUpWithEmail, signInWithEmail, getUserWithTenant, createSessionToken, requestPasswordReset, verifyResetToken, resetPassword, createEmailVerification, verifyEmailToken, resendVerificationEmail } from "./selfServeAuth";
import { createTenantCheckoutSession, checkAndAcceptPendingInvitation, autoMatchTeamMember } from "./tenant";
import { exchangeCodeForTokens, decodeIdToken, signInWithGoogle, completeGoogleSignup, getGoogleAuthUrl } from "./googleAuth";
import { verifyTurnstileToken } from "./turnstile";

const router = Router();

// Rate limit signup to 3 per IP per 10 minutes
const signupAttempts = new Map<string, { count: number; resetAt: number }>();
function isSignupRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = signupAttempts.get(ip);
  if (!record || now > record.resetAt) {
    signupAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  record.count++;
  return record.count > 3;
}

// Spam name detection
function isSpamName(name: string): boolean {
  const spamPatterns = [
    /https?:\/\//i, /bit\.ly/i, /tinyurl/i,
    /\.(com|net|org|io|xyz|tk|ml)\b/i,
    /lira.*hemen/i, /mucize/i, /kazan.*\d{3,}/i,
    /\d{2,}\.?\d{3,}.*lira/i, /free.*money/i,
    /earn.*\$\d+/i, /click.*here.*win/i,
  ];
  return spamPatterns.some(p => p.test(name));
}

function getClientIp(req: Request): string {
  return req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
}

// ⛔ SIGNUPS DISABLED — All new user creation blocked
router.post("/signup", async (_req: Request, res: Response) => {
  console.warn(`[Auth] ⛔ BLOCKED email signup attempt — signups disabled`);
  res.status(403).json({ success: false, error: "Signups are currently disabled. Contact admin for access." });
  return;
  // Original code below disabled:
  const req = _req;
  try {
    const { email, password, name, companyName, turnstileToken } = req.body;
    const clientIp = getClientIp(req);

    if (isSignupRateLimited(clientIp)) {
      console.warn(`[Auth] RATE LIMITED signup from IP ${clientIp}`);
      res.status(429).json({ success: false, error: "Too many signup attempts. Please try again later." });
      return;
    }

    if (!turnstileToken) {
      res.status(400).json({ success: false, error: "CAPTCHA verification is required" });
      return;
    }
    const turnstileValid = await verifyTurnstileToken(turnstileToken, clientIp);
    if (!turnstileValid) {
      console.warn(`[Auth] Turnstile FAILED for signup from IP ${clientIp}`);
      res.status(403).json({ success: false, error: "CAPTCHA verification failed. Please try again." });
      return;
    }

    if (isSpamName(name || "")) {
      console.warn(`[Auth] SPAM NAME blocked: "${name}" from IP ${clientIp}`);
      res.status(403).json({ success: false, error: "Signup blocked. Please contact support if this is an error." });
      return;
    }

    if (!email || !password || !name || !companyName) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }

    const result = await signUpWithEmail({ email, password, name, companyName, planId: 'growth' });
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    let finalTenantId = result.tenantId!;
    let joinedExistingTenant = false;
    try {
      const inviteResult: any = await checkAndAcceptPendingInvitation(result.userId!, email);
      if (inviteResult?.tenantId) {
        finalTenantId = inviteResult.tenantId;
        joinedExistingTenant = true;
      }
    } catch (e) { console.warn('[Auth] Invite check error:', e); }

    if (!joinedExistingTenant) {
      try {
        const matchResult: any = await autoMatchTeamMember(result.userId!, name, email);
        if (matchResult?.tenantId) {
          finalTenantId = matchResult.tenantId;
          joinedExistingTenant = true;
        }
      } catch (e) { console.warn('[Auth] Auto-match error:', e); }
    }

    await createEmailVerification(result.userId!, email, name, companyName);
    const token = createSessionToken(result.userId!, finalTenantId);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    console.log(`[Auth] Signup OK: ${email} (Turnstile verified, IP: ${clientIp})`);
    res.json({ success: true, token, userId: result.userId, tenantId: finalTenantId, onboardingComplete: joinedExistingTenant });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: "Email and password are required" });
      return;
    }
    const result = await signInWithEmail({ email, password });
    if (!result.success) {
      res.status(401).json({ success: false, error: result.error });
      return;
    }

    try {
      const inviteResult = await checkAndAcceptPendingInvitation(result.user.id, email);
      if (inviteResult) {
        result.user.tenantId = inviteResult.tenantId;
        result.user.role = inviteResult.role;
        result.user.teamRole = inviteResult.teamRole;
        result.token = createSessionToken(result.user.id, inviteResult.tenantId);
      }
    } catch (e) { console.warn('[Auth] Invite check error:', e); }

    if (!result.user.tenantId) {
      try {
        const matchResult = await autoMatchTeamMember(result.user.id, result.user.name, email);
        if (matchResult) {
          result.user.tenantId = matchResult.tenantId;
          result.user.teamRole = matchResult.teamRole;
          result.token = createSessionToken(result.user.id, matchResult.tenantId);
        }
      } catch (e) { console.warn('[Auth] Auto-match error:', e); }
    }

    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const userWithTenant = await getUserWithTenant(result.user.id);
    const onboardingComplete = userWithTenant?.tenant?.onboardingCompleted === 'true';
    res.json({ success: true, token: result.token, user: result.user, onboardingComplete });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/logout", async (_req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ success: false, error: "Not authenticated" }); return; }

    const { verifySessionToken } = await import("./selfServeAuth");
    const decoded = verifySessionToken(token);
    if (!decoded) { res.status(401).json({ success: false, error: "Invalid token" }); return; }

    const userWithTenant = await getUserWithTenant(decoded.userId);
    if (!userWithTenant) { res.status(401).json({ success: false, error: "User not found" }); return; }

    res.json({
      success: true,
      user: {
        id: userWithTenant.user.id, name: userWithTenant.user.name, email: userWithTenant.user.email,
        tenantId: userWithTenant.user.tenantId, role: userWithTenant.user.role,
        teamRole: userWithTenant.user.teamRole, isTenantAdmin: userWithTenant.user.isTenantAdmin,
      },
      tenant: userWithTenant.tenant,
    });
  } catch (error) {
    console.error('[Auth] Get me error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Password reset
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ success: false, error: "Email is required" }); return; }
    await requestPasswordReset(email);
    res.json({ success: true, message: "If an account exists with this email, you will receive a password reset link." });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/verify-reset-token", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) { res.status(400).json({ valid: false, error: "Token is required" }); return; }
    const result = await verifyResetToken(token);
    res.json(result);
  } catch (error) {
    console.error('[Auth] Verify token error:', error);
    res.status(500).json({ valid: false, error: "Internal server error" });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) { res.status(400).json({ success: false, error: "Token and password are required" }); return; }
    const result = await resetPassword(token, password);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true, message: "Password has been reset successfully." });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Email verification
router.get("/verify-email", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) { res.status(400).json({ success: false, error: "Token is required" }); return; }
    const result = await verifyEmailToken(token);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true, message: "Email verified successfully!" });
  } catch (error) {
    console.error('[Auth] Verify email error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    if (isSignupRateLimited(clientIp)) {
      res.status(429).json({ success: false, error: "Too many attempts. Please try again later." });
      return;
    }
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ success: false, error: "Not authenticated" }); return; }
    const { verifySessionToken } = await import("./selfServeAuth");
    const decoded = verifySessionToken(token);
    if (!decoded) { res.status(401).json({ success: false, error: "Invalid token" }); return; }
    const result = await resendVerificationEmail(decoded.userId);
    if (!result.success) { res.status(400).json(result); return; }
    res.json({ success: true, message: "Verification email sent!" });
  } catch (error) {
    console.error('[Auth] Resend verification error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Google OAuth
function getPublicOrigin(req: Request): string {
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  const forwardedProto = req.headers['x-forwarded-proto'] as string || 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  if (req.headers.origin) return req.headers.origin as string;
  if (req.headers.referer) {
    try { const u = new URL(req.headers.referer as string); return `${u.protocol}//${u.host}`; } catch (e) {}
  }
  const host = req.get('host');
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : req.protocol;
  return `${protocol}://${host}`;
}

router.get("/google/url", (req: Request, res: Response) => {
  try {
    const origin = getPublicOrigin(req);
    const redirectUri = `${origin}/api/auth/google/callback`;
    const stateData = JSON.stringify({ redirectUri, originalState: req.query.state || '' });
    const state = Buffer.from(stateData).toString('base64url');
    const url = getGoogleAuthUrl(redirectUri, state);
    res.json({ url });
  } catch (error) {
    console.error('[Auth] Google URL error:', error);
    res.status(500).json({ success: false, error: "Failed to generate Google auth URL" });
  }
});

router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, error: oauthError, state } = req.query;
    let redirectUri: string;
    try {
      const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      redirectUri = stateData.redirectUri;
    } catch (e) {
      redirectUri = `${getPublicOrigin(req)}/api/auth/google/callback`;
    }
    if (oauthError) { res.redirect(`/login?error=google_auth_failed`); return; }
    if (!code || typeof code !== 'string') { res.redirect(`/login?error=missing_code`); return; }

    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens) { res.redirect(`/login?error=token_exchange_failed`); return; }
    const userInfo = decodeIdToken(tokens.id_token);
    if (!userInfo) { res.redirect(`/login?error=invalid_token`); return; }

    const result = await signInWithGoogle({ googleId: userInfo.sub, email: userInfo.email, name: userInfo.name, picture: userInfo.picture });
    if (!result.success) { res.redirect(`/login?error=${encodeURIComponent(result.error || 'unknown_error')}`); return; }

    if (result.isNewUser) {
      // ⛔ SIGNUPS DISABLED — block new Google users
      console.warn(`[Auth] ⛔ BLOCKED new Google signup: ${userInfo.email}`);
      res.redirect(`/login?error=signups_disabled`);
      return;
    }

    res.cookie('auth_token', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect(result.needsOnboarding ? '/onboarding' : '/dashboard');
  } catch (error) {
    console.error('[Auth] Google callback error:', error);
    res.redirect(`/login?error=callback_failed`);
  }
});

// ⛔ SIGNUPS DISABLED — Google complete signup blocked
router.post("/google/complete-signup", async (_req: Request, res: Response) => {
  console.warn(`[Auth] ⛔ BLOCKED Google complete-signup attempt — signups disabled`);
  res.status(403).json({ success: false, error: "Signups are currently disabled. Contact admin for access." });
  return;
  // Original code below disabled:
  const req = _req;
  try {
    const { googleId, email, name, picture, companyName, turnstileToken } = req.body;
    const clientIp = getClientIp(req);

    if (isSignupRateLimited(clientIp)) {
      res.status(429).json({ success: false, error: "Too many signup attempts. Please try again later." });
      return;
    }
    if (!turnstileToken) {
      res.status(400).json({ success: false, error: "CAPTCHA verification is required" });
      return;
    }
    const turnstileValid = await verifyTurnstileToken(turnstileToken, clientIp);
    if (!turnstileValid) {
      console.warn(`[Auth] Turnstile FAILED for Google signup from IP ${clientIp}`);
      res.status(403).json({ success: false, error: "CAPTCHA verification failed. Please try again." });
      return;
    }
    if (isSpamName(name || "")) {
      console.warn(`[Auth] SPAM NAME blocked (Google): "${name}" from IP ${clientIp}`);
      res.status(403).json({ success: false, error: "Signup blocked." });
      return;
    }
    if (!googleId || !email || !name || !companyName) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }

    const result = await completeGoogleSignup({ googleId, email, name, picture, companyName, planId: 'growth' });
    if (!result.success) { res.status(400).json({ success: false, error: result.error }); return; }

    res.cookie('auth_token', result.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    console.log(`[Auth] Google signup OK: ${email} (Turnstile verified, IP: ${clientIp})`);
    res.json({ success: true, token: result.token, userId: result.userId, tenantId: result.tenantId, onboardingComplete: false });
  } catch (error) {
    console.error('[Auth] Google complete signup error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
