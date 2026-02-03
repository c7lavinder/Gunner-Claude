import { Router, Request, Response } from "express";
import { signUpWithEmail, signInWithEmail, getUserWithTenant, createSessionToken } from "./selfServeAuth";
import { createTenantCheckoutSession } from "./tenant";

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

export default router;
