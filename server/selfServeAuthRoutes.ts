import { Router, Request, Response } from "express";
import { signUpWithEmail, signInWithEmail, getUserWithTenant, createSessionToken, requestPasswordReset, verifyResetToken, resetPassword, createEmailVerification, verifyEmailToken, resendVerificationEmail } from "./selfServeAuth";
import { createTenantCheckoutSession, checkAndAcceptPendingInvitation, autoMatchTeamMember } from "./tenant";
import { exchangeCodeForTokens, decodeIdToken, signInWithGoogle, completeGoogleSignup, getGoogleAuthUrl } from "./googleAuth";

const router = Router();

// ⛔ ANTI-SPAM: Rate limit signup to 3 per IP per 10 minutes
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

// ⛔ SIGNUPS COMPLETELY DISABLED — under spam attack
router.post("/signup", async (req: Request, res: Response) => {
  console.warn(`[Auth] ⛔ SIGNUP DISABLED — blocked attempt from ${req.headers['x-forwarded-for'] || req.ip}`);
  res.status(403).json({ success: false, error: "Signups are temporarily disabled. Please try again later." });
  return;
  // --- ORIGINAL CODE BELOW (disabled) ---
  try {
    const { email, password, name, companyName } = req.body;

    // Validate required fields (planId no longer required - user selects plan at paywall after onboarding)
    if (!email || !password || !name || !companyName) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }

    // Create account with default 'growth' plan (will be updated when user selects plan at paywall)
    const result = await signUpWithEmail({
      email,
      password,
      name,
      companyName,
      planId: 'growth', // Default plan, user will select actual plan at paywall
    });

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    // Check for pending invitation — if this email was invited to a team,
    // move the user into that tenant instead of the one just created
    let finalTenantId = result.tenantId!;
    let joinedExistingTenant = false;
    try {
      const inviteResult = await checkAndAcceptPendingInvitation(result.userId!, email);
      if (inviteResult) {
        finalTenantId = inviteResult.tenantId;
        joinedExistingTenant = true;
        console.log(`[Auth] Email/password signup: User ${email} joined tenant "${inviteResult.tenantName}" via pending invitation`);
      }
    } catch (inviteError) {
      console.warn('[Auth] Error checking pending invitation during signup:', inviteError);
      // Non-fatal — user continues with their new tenant
    }

    // If no invitation, try auto-matching by name to an existing team member record
    if (!joinedExistingTenant) {
      try {
        const matchResult = await autoMatchTeamMember(result.userId!, name, email);
        if (matchResult) {
          finalTenantId = matchResult.tenantId;
          joinedExistingTenant = true;
          console.log(`[Auth] Email/password signup: User ${email} auto-matched to team member "${matchResult.teamMemberName}" in tenant "${matchResult.tenantName}"`);
        }
      } catch (matchError) {
        console.warn('[Auth] Error auto-matching team member during signup:', matchError);
      }
    }

    // Send verification email
    await createEmailVerification(result.userId!, email, name, companyName);

    // Create session token with the correct tenant (may have changed from invitation/auto-match)
    const token = createSessionToken(result.userId!, finalTenantId);

    // Set cookie for session
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // If user joined an existing tenant, they skip onboarding
    const onboardingComplete = joinedExistingTenant;

    res.json({
      success: true,
      token,
      userId: result.userId,
      tenantId: finalTenantId,
      onboardingComplete,
    });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Sign in with email/password
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

    // Check for pending invitations on each login (user may have been invited after initial signup)
    try {
      const inviteResult = await checkAndAcceptPendingInvitation(result.user.id, email);
      if (inviteResult) {
        console.log(`[Auth] Email/password login: User ${email} accepted pending invitation to tenant "${inviteResult.tenantName}"`);
        // Update the user object with the new tenant info
        result.user.tenantId = inviteResult.tenantId;
        result.user.role = inviteResult.role;
        result.user.teamRole = inviteResult.teamRole;
        // Re-create token with new tenant
        result.token = createSessionToken(result.user.id, inviteResult.tenantId);
      }
    } catch (inviteError) {
      console.warn('[Auth] Error checking pending invitation during login:', inviteError);
    }

    // Auto-match team member if user doesn't have a tenant yet
    if (!result.user.tenantId) {
      try {
        const matchResult = await autoMatchTeamMember(result.user.id, result.user.name, email);
        if (matchResult) {
          console.log(`[Auth] Email/password login: User ${email} auto-matched to team member "${matchResult.teamMemberName}" in tenant "${matchResult.tenantName}"`);
          result.user.tenantId = matchResult.tenantId;
          result.user.teamRole = matchResult.teamRole;
          result.token = createSessionToken(result.user.id, matchResult.tenantId);
        }
      } catch (matchError) {
        console.warn('[Auth] Error auto-matching team member during login:', matchError);
      }
    }

    // Set cookie for session
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Get tenant info to check onboarding status
    const userWithTenant = await getUserWithTenant(result.user.id);
    const onboardingComplete = userWithTenant?.tenant?.onboardingCompleted === 'true';

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      onboardingComplete,
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Sign out
router.post("/logout", async (req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// Get current user (for session validation)
router.get("/me", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    // Verify token and get user
    const { verifySessionToken } = await import("./selfServeAuth");
    const decoded = verifySessionToken(token);
    
    if (!decoded) {
      res.status(401).json({ success: false, error: "Invalid token" });
      return;
    }

    const userWithTenant = await getUserWithTenant(decoded.userId);
    
    if (!userWithTenant) {
      res.status(401).json({ success: false, error: "User not found" });
      return;
    }

    res.json({
      success: true,
      user: {
        id: userWithTenant.user.id,
        name: userWithTenant.user.name,
        email: userWithTenant.user.email,
        tenantId: userWithTenant.user.tenantId,
        role: userWithTenant.user.role,
        teamRole: userWithTenant.user.teamRole,
        isTenantAdmin: userWithTenant.user.isTenantAdmin,
      },
      tenant: userWithTenant.tenant,
    });
  } catch (error) {
    console.error('[Auth] Get me error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Request password reset
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, error: "Email is required" });
      return;
    }

    const result = await requestPasswordReset(email);
    
    // Always return success to prevent email enumeration
    res.json({ success: true, message: "If an account exists with this email, you will receive a password reset link." });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Verify reset token
router.get("/verify-reset-token", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({ valid: false, error: "Token is required" });
      return;
    }

    const result = await verifyResetToken(token);
    res.json(result);
  } catch (error) {
    console.error('[Auth] Verify token error:', error);
    res.status(500).json({ valid: false, error: "Internal server error" });
  }
});

// Reset password
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ success: false, error: "Token and password are required" });
      return;
    }

    const result = await resetPassword(token, password);
    
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json({ success: true, message: "Password has been reset successfully. You can now log in with your new password." });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ============ EMAIL VERIFICATION ROUTES ============

// Verify email with token
router.get("/verify-email", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({ success: false, error: "Token is required" });
      return;
    }

    const result = await verifyEmailToken(token);
    
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json({ success: true, message: "Email verified successfully!" });
  } catch (error) {
    console.error('[Auth] Verify email error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Resend verification email
router.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    // ⛔ ANTI-SPAM: Rate limit resend-verification
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
    if (isSignupRateLimited(clientIp)) {
      console.warn(`[Auth] ⛔ RATE LIMITED resend-verification from IP ${clientIp}`);
      res.status(429).json({ success: false, error: "Too many attempts. Please try again later." });
      return;
    }

    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const { verifySessionToken } = await import("./selfServeAuth");
    const decoded = verifySessionToken(token);
    
    if (!decoded) {
      res.status(401).json({ success: false, error: "Invalid token" });
      return;
    }

    const result = await resendVerificationEmail(decoded.userId);
    
    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json({ success: true, message: "Verification email sent!" });
  } catch (error) {
    console.error('[Auth] Resend verification error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ============ GOOGLE OAUTH ROUTES ============

// Helper to get the correct origin for redirects
function getPublicOrigin(req: Request): string {
  // Check for forwarded headers (used by proxies/load balancers)
  const forwardedHost = req.headers['x-forwarded-host'] as string;
  const forwardedProto = req.headers['x-forwarded-proto'] as string || 'https';
  
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  // Check origin header
  if (req.headers.origin) {
    return req.headers.origin as string;
  }
  
  // Check referer header
  if (req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer as string);
      return `${refererUrl.protocol}//${refererUrl.host}`;
    } catch (e) {
      // Invalid referer, continue
    }
  }
  
  // Fallback to host header with https
  const host = req.get('host');
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : req.protocol;
  return `${protocol}://${host}`;
}

// Get Google OAuth URL
router.get("/google/url", (req: Request, res: Response) => {
  try {
    const origin = getPublicOrigin(req);
    const redirectUri = `${origin}/api/auth/google/callback`;
    
    // Encode the redirect_uri in state so we use the exact same one on callback
    const stateData = JSON.stringify({ redirectUri, originalState: req.query.state || '' });
    const state = Buffer.from(stateData).toString('base64url');
    
    console.log('[Auth] Google OAuth URL requested, redirect_uri:', redirectUri);
    
    const url = getGoogleAuthUrl(redirectUri, state);
    res.json({ url });
  } catch (error) {
    console.error('[Auth] Google URL error:', error);
    res.status(500).json({ success: false, error: "Failed to generate Google auth URL" });
  }
});

// Google OAuth callback
router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, error: oauthError, state } = req.query;
    
    // Decode state to get the original redirect_uri
    let redirectUri: string;
    try {
      const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      redirectUri = stateData.redirectUri;
      console.log('[Auth] Google callback - using redirect_uri from state:', redirectUri);
    } catch (e) {
      // Fallback to detecting origin if state is invalid
      const origin = getPublicOrigin(req);
      redirectUri = `${origin}/api/auth/google/callback`;
      console.log('[Auth] Google callback - fallback redirect_uri:', redirectUri);
    }
    
    if (oauthError) {
      console.error('[Auth] Google OAuth error:', oauthError);
      res.redirect(`/login?error=google_auth_failed`);
      return;
    }
    
    if (!code || typeof code !== 'string') {
      res.redirect(`/login?error=missing_code`);
      return;
    }
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens) {
      res.redirect(`/login?error=token_exchange_failed`);
      return;
    }
    
    // Decode ID token to get user info
    const userInfo = decodeIdToken(tokens.id_token);
    if (!userInfo) {
      res.redirect(`/login?error=invalid_token`);
      return;
    }
    
    // Sign in or check if new user
    console.log('[Auth] Calling signInWithGoogle for:', userInfo.email);
    const result = await signInWithGoogle({
      googleId: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    });
    
    console.log('[Auth] signInWithGoogle result:', { success: result.success, isNewUser: result.isNewUser, needsOnboarding: result.needsOnboarding, hasToken: !!result.token });
    
    if (!result.success) {
      console.log('[Auth] Sign in failed, redirecting to login with error:', result.error);
      res.redirect(`/login?error=${encodeURIComponent(result.error || 'unknown_error')}`);
      return;
    }
    
    if (result.isNewUser) {
      // New user - redirect to signup with Google info
      console.log('[Auth] NEW USER detected - redirecting to /signup');
      const googleData = encodeURIComponent(JSON.stringify({
        googleId: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      }));
      res.redirect(`/signup?google=${googleData}`);
      return;
    }
    
    console.log('[Auth] EXISTING USER - setting cookie and redirecting to dashboard');
    
    // Existing user - set cookie and redirect
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    
    // Redirect based on onboarding status
    if (result.needsOnboarding) {
      res.redirect('/onboarding');
    } else {
      res.redirect('/dashboard');
    }
  } catch (error) {
    console.error('[Auth] Google callback error:', error);
    res.redirect(`/login?error=callback_failed`);
  }
});

// Complete Google signup with company info
// ⛔ GOOGLE SIGNUPS COMPLETELY DISABLED — under spam attack
router.post("/google/complete-signup", async (req: Request, res: Response) => {
  console.warn(`[Auth] ⛔ GOOGLE SIGNUP DISABLED — blocked attempt from ${req.headers['x-forwarded-for'] || req.ip}`);
  res.status(403).json({ success: false, error: "Signups are temporarily disabled. Please try again later." });
  return;
  // --- ORIGINAL CODE BELOW (disabled) ---
  try {
    const { googleId, email, name, picture, companyName } = req.body;
    
    // planId no longer required - user selects plan at paywall after onboarding
    if (!googleId || !email || !name || !companyName) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }
    
    const result = await completeGoogleSignup({
      googleId,
      email,
      name,
      picture,
      companyName,
      planId: 'growth', // Default plan, user will select actual plan at paywall
    });
    
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    
    // Set cookie for session
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    
    // No checkout session - user will go to onboarding first, then paywall
    res.json({
      success: true,
      token: result.token,
      userId: result.userId,
      tenantId: result.tenantId,
      onboardingComplete: false,
    });
  } catch (error) {
    console.error('[Auth] Google complete signup error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
