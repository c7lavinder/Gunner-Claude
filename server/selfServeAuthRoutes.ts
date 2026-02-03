import { Router, Request, Response } from "express";
import { signUpWithEmail, signInWithEmail, getUserWithTenant, createSessionToken, requestPasswordReset, verifyResetToken, resetPassword } from "./selfServeAuth";
import { createTenantCheckoutSession } from "./tenant";
import { exchangeCodeForTokens, decodeIdToken, signInWithGoogle, completeGoogleSignup, getGoogleAuthUrl } from "./googleAuth";

const router = Router();

// Sign up with email/password
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, name, companyName, planId } = req.body;

    // Validate required fields
    if (!email || !password || !name || !companyName || !planId) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }

    // Validate plan
    if (!['starter', 'growth', 'scale'].includes(planId)) {
      res.status(400).json({ success: false, error: "Invalid plan selected" });
      return;
    }

    // Create account
    const result = await signUpWithEmail({
      email,
      password,
      name,
      companyName,
      planId,
    });

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    // Create session token
    const token = createSessionToken(result.userId!, result.tenantId!);

    // Set cookie for session
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Create checkout session for the selected plan
    try {
      const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
      const checkoutResult = await createTenantCheckoutSession({
        planCode: planId,
        billingPeriod: 'monthly',
        userId: result.userId!,
        userEmail: email,
        userName: name,
        tenantId: result.tenantId!,
        origin,
      });

      res.json({
        success: true,
        token,
        userId: result.userId,
        tenantId: result.tenantId,
        onboardingComplete: false,
        checkoutUrl: checkoutResult.url,
      });
    } catch (checkoutError) {
      // If checkout fails, still return success but without checkout URL
      // User can complete checkout later from billing settings
      console.error('[Auth] Checkout session error:', checkoutError);
      res.json({
        success: true,
        token,
        userId: result.userId,
        tenantId: result.tenantId,
        onboardingComplete: false,
      });
    }
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

    // Set cookie for session
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
    const result = await signInWithGoogle({
      googleId: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    });
    
    if (!result.success) {
      res.redirect(`/login?error=${encodeURIComponent(result.error || 'unknown_error')}`);
      return;
    }
    
    if (result.isNewUser) {
      // New user - redirect to signup with Google info
      const googleData = encodeURIComponent(JSON.stringify({
        googleId: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      }));
      res.redirect(`/signup?google=${googleData}`);
      return;
    }
    
    // Existing user - set cookie and redirect
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
router.post("/google/complete-signup", async (req: Request, res: Response) => {
  try {
    const { googleId, email, name, picture, companyName, planId } = req.body;
    
    if (!googleId || !email || !name || !companyName || !planId) {
      res.status(400).json({ success: false, error: "All fields are required" });
      return;
    }
    
    if (!['starter', 'growth', 'scale'].includes(planId)) {
      res.status(400).json({ success: false, error: "Invalid plan selected" });
      return;
    }
    
    const result = await completeGoogleSignup({
      googleId,
      email,
      name,
      picture,
      companyName,
      planId,
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
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    // Create checkout session for the selected plan
    try {
      const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
      const checkoutResult = await createTenantCheckoutSession({
        planCode: planId,
        billingPeriod: 'monthly',
        userId: result.userId!,
        userEmail: email,
        userName: name,
        tenantId: result.tenantId!,
        origin,
      });
      
      res.json({
        success: true,
        token: result.token,
        userId: result.userId,
        tenantId: result.tenantId,
        onboardingComplete: false,
        checkoutUrl: checkoutResult.url,
      });
    } catch (checkoutError) {
      console.error('[Auth] Google signup checkout error:', checkoutError);
      res.json({
        success: true,
        token: result.token,
        userId: result.userId,
        tenantId: result.tenantId,
        onboardingComplete: false,
      });
    }
  } catch (error) {
    console.error('[Auth] Google complete signup error:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
