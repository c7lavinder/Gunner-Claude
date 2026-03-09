import { getDb } from "./db";
import { users, tenants, pendingInvitations, subscriptionPlans } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import * as crypto from "crypto";
import { createSessionToken, getUserWithTenant } from "./selfServeAuth";
import { trackUserLogin } from "./_core/analytics";
import { ENV } from "./_core/env";

// Google OAuth configuration - use getter functions to ensure ENV is loaded
const getGoogleClientId = () => ENV.googleClientId;
const getGoogleClientSecret = () => ENV.googleClientSecret;

// Generate a unique openId for Google users
function generateGoogleOpenId(googleId: string): string {
  return `google_${googleId}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<{
  access_token: string;
  id_token: string;
  refresh_token?: string;
} | null> {
  try {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    
    console.log('[GoogleAuth] Token exchange - redirectUri:', redirectUri);
    console.log('[GoogleAuth] Token exchange - clientId present:', !!clientId);
    console.log('[GoogleAuth] Token exchange - clientSecret present:', !!clientSecret);
    
    if (!clientId || !clientSecret) {
      console.error('[GoogleAuth] Missing Google OAuth credentials');
      return null;
    }
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[GoogleAuth] Token exchange failed:', error);
      console.error('[GoogleAuth] Token exchange - status:', response.status);
      return null;
    }

    const tokens = await response.json();
    console.log('[GoogleAuth] Token exchange successful');
    return tokens;
  } catch (error) {
    console.error('[GoogleAuth] Token exchange error:', error);
    return null;
  }
}

// Decode and verify Google ID token
export function decodeIdToken(idToken: string): {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
} | null {
  try {
    // Decode the JWT (we trust Google's signature since we just got it from them)
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    // Verify the token is for our client
    const clientId = getGoogleClientId();
    if (payload.aud !== clientId) {
      console.error('[GoogleAuth] Token audience mismatch. Expected:', clientId, 'Got:', payload.aud);
      return null;
    }
    
    // Verify token hasn't expired
    if (payload.exp * 1000 < Date.now()) {
      console.error('[GoogleAuth] Token expired');
      return null;
    }
    
    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
      given_name: payload.given_name,
      family_name: payload.family_name,
    };
  } catch (error) {
    console.error('[GoogleAuth] ID token decode error:', error);
    return null;
  }
}

// Sign in or sign up with Google
export async function signInWithGoogle(params: {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<{ 
  success: boolean; 
  token?: string; 
  user?: any; 
  isNewUser?: boolean;
  needsOnboarding?: boolean;
  error?: string 
}> {
  const { googleId, email, name, picture } = params;
  console.log('[GoogleAuth] signInWithGoogle called for email:', email);
  
  const db = await getDb();
  if (!db) {
    console.error('[GoogleAuth] Database not available');
    return { success: false, error: "Database not available" };
  }

  const openId = generateGoogleOpenId(googleId);
  console.log('[GoogleAuth] Generated openId:', openId);

  try {
    // First, check if user exists with this Google ID
    console.log('[GoogleAuth] Checking for existing user with openId...');
    let [existingUser] = await db.select().from(users).where(
      eq(users.openId, openId)
    ).limit(1);

    if (existingUser) {
      console.log('[GoogleAuth] Found existing user by openId:', existingUser.id);
      // User exists - update last sign in and return
      await db.update(users)
        .set({ 
          lastSignedIn: new Date(),
          profilePicture: picture || existingUser.profilePicture,
        })
        .where(eq(users.id, existingUser.id));

      const token = createSessionToken(existingUser.id, existingUser.tenantId);
      
      // Check onboarding status
      const userWithTenant = await getUserWithTenant(existingUser.id);
      const needsOnboarding = userWithTenant?.tenant?.onboardingCompleted !== 'true';

      trackUserLogin({ userId: existingUser.id, email, method: "google", tenantId: existingUser.tenantId ?? undefined });

      return {
        success: true,
        token,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          tenantId: existingUser.tenantId,
          role: existingUser.role,
          teamRole: existingUser.teamRole,
          isTenantAdmin: existingUser.isTenantAdmin,
        },
        isNewUser: false,
        needsOnboarding,
      };
    }

    // Check if there's an existing user with this email (from email/password signup)
    // Use case-insensitive comparison to handle email casing differences (e.g. Google returns 'Alvarez.lozano@hotmail.com' but DB has 'alvarez.lozano@hotmail.com')
    console.log('[GoogleAuth] Checking for existing user by email (case-insensitive):', email);
    const [emailUser] = await db.select().from(users).where(
      sql`LOWER(${users.email}) = LOWER(${email})`
    ).limit(1);

    if (emailUser) {
      console.log('[GoogleAuth] Found existing user by email:', emailUser.id);
      // Link Google to existing account
      await db.update(users)
        .set({ 
          openId, // Update to Google openId
          loginMethod: 'google',
          lastSignedIn: new Date(),
          profilePicture: picture || emailUser.profilePicture,
        })
        .where(eq(users.id, emailUser.id));

      const token = createSessionToken(emailUser.id, emailUser.tenantId);
      
      const userWithTenant = await getUserWithTenant(emailUser.id);
      const needsOnboarding = userWithTenant?.tenant?.onboardingCompleted !== 'true';

      trackUserLogin({ userId: emailUser.id, email, method: "google", tenantId: emailUser.tenantId ?? undefined });

      return {
        success: true,
        token,
        user: {
          id: emailUser.id,
          name: emailUser.name,
          email: emailUser.email,
          tenantId: emailUser.tenantId,
          role: emailUser.role,
          teamRole: emailUser.teamRole,
          isTenantAdmin: emailUser.isTenantAdmin,
        },
        isNewUser: false,
        needsOnboarding,
      };
    }

    // Check if there's a pending invitation for this email
    console.log('[GoogleAuth] Checking for pending invitation for email:', email.toLowerCase());
    const [invitation] = await db
      .select()
      .from(pendingInvitations)
      .where(and(
        eq(pendingInvitations.email, email.toLowerCase()),
        eq(pendingInvitations.status, 'pending')
      ))
      .orderBy(desc(pendingInvitations.createdAt))
      .limit(1);

    console.log('[GoogleAuth] Pending invitation found:', invitation ? `ID ${invitation.id}, tenantId ${invitation.tenantId}` : 'NONE');

    if (invitation) {
      // Check if invitation has expired
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        console.log('[GoogleAuth] Invitation expired, marking as expired');
        await db
          .update(pendingInvitations)
          .set({ status: 'expired' })
          .where(eq(pendingInvitations.id, invitation.id));
        // Continue to new user flow
      } else {
        console.log('[GoogleAuth] Valid invitation found! Creating user and accepting invitation...');
        // Accept the invitation - create user with tenant info
        const [newUser] = await db.insert(users).values({
          tenantId: invitation.tenantId,
          openId,
          name,
          email,
          loginMethod: 'google',
          emailVerified: 'true',
          role: invitation.role || 'user',
          teamRole: invitation.teamRole,
          isTenantAdmin: invitation.role === 'admin' ? 'true' : 'false',
          profilePicture: picture,
        }).returning({ id: users.id });

        console.log('[GoogleAuth] User created with ID:', newUser.id);

        // Mark invitation as accepted
        await db
          .update(pendingInvitations)
          .set({
            status: 'accepted',
            acceptedAt: new Date(),
            acceptedByUserId: newUser.id,
          })
          .where(eq(pendingInvitations.id, invitation.id));
        console.log('[GoogleAuth] Invitation marked as accepted');

        const token = createSessionToken(newUser.id, invitation.tenantId);
        console.log('[GoogleAuth] Session token created, returning success (isNewUser=false)');

        // Get tenant info for onboarding check
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, invitation.tenantId));
        const needsOnboarding = tenant?.onboardingCompleted !== 'true';

        trackUserLogin({ userId: newUser.id, email, method: "google", tenantId: invitation.tenantId });

        return {
          success: true,
          token,
          user: {
            id: newUser.id,
            name,
            email,
            tenantId: invitation.tenantId,
            role: invitation.role || 'user',
            teamRole: invitation.teamRole,
            isTenantAdmin: invitation.role === 'admin',
          },
          isNewUser: false, // Not a "new user" in the signup sense - they're joining existing tenant
          needsOnboarding: false, // Team members don't need onboarding
        };
      }
    }

    // New user - they need to complete signup with company info
    // For now, return that they need to complete registration
    console.log('[GoogleAuth] No existing user or invitation found - treating as NEW USER');
    return {
      success: true,
      isNewUser: true,
      user: {
        googleId,
        email,
        name,
        picture,
      },
    };

  } catch (error) {
    console.error('[GoogleAuth] Sign in error:', error);
    return { success: false, error: "Failed to sign in with Google" };
  }
}

// Complete Google signup with company info
export async function completeGoogleSignup(params: {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  companyName: string;
  planId: 'starter' | 'growth' | 'scale';
}): Promise<{ success: boolean; userId?: number; tenantId?: number; token?: string; error?: string }> {
  const { googleId, email, name, picture, companyName, planId } = params;
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const openId = generateGoogleOpenId(googleId);

  // Check if user already exists
  const [existingUser] = await db.select().from(users).where(
    eq(users.openId, openId)
  ).limit(1);

  if (existingUser) {
    return { success: false, error: "Account already exists" };
  }

  // Create slug from company name
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + crypto.randomBytes(4).toString('hex');

  // Get plan from database
  const [dbPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, planId)).limit(1);
  
  // Fallback to default limits if plan not found in database
  const defaultLimits = {
    starter: { maxUsers: 3, maxCallsPerMonth: 500, trialDays: 14 },
    growth: { maxUsers: 10, maxCallsPerMonth: 2000, trialDays: 14 },
    scale: { maxUsers: 999, maxCallsPerMonth: 999999, trialDays: 14 },
  };

  const limits = dbPlan ? {
    maxUsers: dbPlan.maxUsers,
    maxCallsPerMonth: dbPlan.maxCallsPerMonth || defaultLimits[planId].maxCallsPerMonth,
    trialDays: dbPlan.trialDays || 14
  } : defaultLimits[planId];

  // Calculate trial end date using database-driven trial days
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + limits.trialDays);

  try {
    // Create tenant first
    const [tenant] = await db.insert(tenants).values({
      name: companyName,
      slug,
      subscriptionTier: 'trial',
      subscriptionStatus: 'active',
      trialEndsAt,
      maxUsers: limits.maxUsers,
      onboardingStep: 2, // Start at step 2 since company name is already provided during signup
      onboardingCompleted: 'false',
      settings: JSON.stringify({ maxCallsPerMonth: limits.maxCallsPerMonth, selectedPlan: planId }),
    }).returning({ id: tenants.id });

    // Create user
    const [user] = await db.insert(users).values({
      tenantId: tenant.id,
      openId,
      name,
      email,
      loginMethod: 'google',
      emailVerified: 'true', // Google emails are verified
      role: 'admin',
      teamRole: 'admin',
      isTenantAdmin: 'true',
      profilePicture: picture,
    }).returning({ id: users.id });

    const token = createSessionToken(user.id, tenant.id);

    trackUserLogin({ userId: user.id, email, method: "google", tenantId: tenant.id });

    return { success: true, userId: user.id, tenantId: tenant.id, token };
  } catch (error) {
    console.error('[GoogleAuth] Signup error:', error);
    return { success: false, error: "Failed to create account" };
  }
}

// Generate Google OAuth URL
export function getGoogleAuthUrl(redirectUri: string, state?: string): string {
  const clientId = getGoogleClientId();
  
  if (!clientId) {
    console.error('[GoogleAuth] Missing GOOGLE_CLIENT_ID');
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  
  if (state) {
    params.append('state', state);
  }
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
