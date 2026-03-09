import { getDb } from "./db";
import { users, tenants, subscriptionPlans } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const SALT_ROUNDS = 12;

// Generate a unique openId for email/password users
function generateOpenId(): string {
  return `email_${crypto.randomBytes(24).toString('base64url')}`;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create JWT token for session
export function createSessionToken(userId: number, tenantId: number | null): string {
  return jwt.sign(
    { userId, tenantId, type: 'session' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Verify JWT token
export function verifySessionToken(token: string): { userId: number; tenantId: number | null } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; tenantId: number | null };
    return decoded;
  } catch {
    return null;
  }
}

// Sign up a new user with email/password
export async function signUpWithEmail(params: {
  email: string;
  password: string;
  name: string;
  companyName: string;
  planId: 'starter' | 'growth' | 'scale';
}): Promise<{ success: boolean; userId?: number; tenantId?: number; error?: string }> {
  const { email, password, name, companyName, planId } = params;
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Check if email already exists (case-insensitive)
  const existingUser = await db.select().from(users).where(sql`LOWER(${users.email}) = LOWER(${email})`).limit(1);
  if (existingUser.length > 0) {
    return { success: false, error: "Email already registered" };
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate unique openId
  const openId = generateOpenId();

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
      onboardingStep: 1,
      onboardingCompleted: 'false',
      settings: JSON.stringify({ maxCallsPerMonth: limits.maxCallsPerMonth, selectedPlan: planId }),
    }).returning({ id: tenants.id });

    // Create user
    const [user] = await db.insert(users).values({
      tenantId: tenant.id,
      openId,
      name,
      email,
      passwordHash,
      emailVerified: 'false',
      loginMethod: 'email_password',
      role: 'admin',
      teamRole: 'admin',
      isTenantAdmin: 'true',
    }).returning({ id: users.id });

    return { success: true, userId: user.id, tenantId: tenant.id };
  } catch (error) {
    console.error('[SignUp] Error:', error);
    return { success: false, error: "Failed to create account" };
  }
}

// Sign in with email/password
export async function signInWithEmail(params: {
  email: string;
  password: string;
}): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
  const { email, password } = params;
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Find user by email (case-insensitive)
  const [user] = await db.select().from(users).where(
    and(
      sql`LOWER(${users.email}) = LOWER(${email})`,
      eq(users.loginMethod, 'email_password')
    )
  ).limit(1);

  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  if (!user.passwordHash) {
    return { success: false, error: "Invalid email or password" };
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return { success: false, error: "Invalid email or password" };
  }

  // Update last signed in
  await db.update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  // Create session token
  const token = createSessionToken(user.id, user.tenantId);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      teamRole: user.teamRole,
      isTenantAdmin: user.isTenantAdmin,
    },
  };
}

// Get user by ID (for session validation)
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user || null;
}

// Get user with tenant info
export async function getUserWithTenant(userId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  let tenant = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    tenant = t || null;
  }

  return { user, tenant };
}


// ============ PASSWORD RESET FUNCTIONS ============

import { passwordResetTokens, emailVerificationTokens } from "../drizzle/schema";
import { sendPasswordResetEmail, sendEmailVerificationEmail } from "./emailService";

// Generate a secure reset token
function generateResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Request password reset - creates token and sends email
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Find user by email (case-insensitive)
  const [user] = await db.select().from(users).where(
    and(
      sql`LOWER(${users.email}) = LOWER(${email})`,
      eq(users.loginMethod, 'email_password')
    )
  ).limit(1);

  // Always return success to prevent email enumeration
  if (!user) {
    return { success: true };
  }

  // Generate token
  const token = generateResetToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

  try {
    // Delete any existing tokens for this user
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    // Create new token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    // Send password reset email
    const baseUrl = process.env.APP_URL || process.env.VITE_APP_URL || process.env.VITE_OAUTH_PORTAL_URL?.replace('/auth', '') || 'https://getgunner.ai';
    await sendPasswordResetEmail(email, token, baseUrl);

    console.log(`[PasswordReset] Token created for user ${user.id}, email: ${email}`);
    
    return { success: true };
  } catch (error) {
    console.error('[PasswordReset] Error creating token:', error);
    return { success: false, error: "Failed to create reset token" };
  }
}

// Verify reset token is valid
export async function verifyResetToken(token: string): Promise<{ valid: boolean; userId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { valid: false, error: "Database not available" };

  const [resetToken] = await db.select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  if (!resetToken) {
    return { valid: false, error: "Invalid or expired reset link" };
  }

  if (resetToken.usedAt) {
    return { valid: false, error: "This reset link has already been used" };
  }

  if (new Date() > resetToken.expiresAt) {
    return { valid: false, error: "This reset link has expired" };
  }

  return { valid: true, userId: resetToken.userId };
}

// ============ EMAIL VERIFICATION FUNCTIONS ============

// Generate a secure verification token
function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Create verification token and send email
export async function createEmailVerification(userId: number, email: string, name: string, companyName: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Generate token
  const token = generateVerificationToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

  try {
    // Delete any existing tokens for this user
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));

    // Create new token
    await db.insert(emailVerificationTokens).values({
      userId,
      token,
      expiresAt,
    });

    // Send verification email
    const baseUrl = process.env.APP_URL || process.env.VITE_APP_URL || process.env.VITE_OAUTH_PORTAL_URL?.replace('/auth', '') || 'https://getgunner.ai';
    await sendEmailVerificationEmail(email, name, companyName, token, baseUrl);

    console.log(`[EmailVerification] Token created for user ${userId}, email: ${email}`);
    
    return { success: true };
  } catch (error) {
    console.error('[EmailVerification] Error creating token:', error);
    return { success: false, error: "Failed to create verification token" };
  }
}

// Verify email token
export async function verifyEmailToken(token: string): Promise<{ success: boolean; userId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [verificationToken] = await db.select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token))
    .limit(1);

  if (!verificationToken) {
    return { success: false, error: "Invalid or expired verification link" };
  }

  if (verificationToken.usedAt) {
    return { success: false, error: "This verification link has already been used" };
  }

  if (new Date() > verificationToken.expiresAt) {
    return { success: false, error: "This verification link has expired" };
  }

  try {
    // Mark email as verified
    await db.update(users)
      .set({ emailVerified: 'true' })
      .where(eq(users.id, verificationToken.userId));

    // Mark token as used
    await db.update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.token, token));

    console.log(`[EmailVerification] Email verified for user ${verificationToken.userId}`);

    return { success: true, userId: verificationToken.userId };
  } catch (error) {
    console.error('[EmailVerification] Error verifying email:', error);
    return { success: false, error: "Failed to verify email" };
  }
}

// Resend verification email
export async function resendVerificationEmail(userId: number): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Get user info
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (user.emailVerified === 'true') {
    return { success: false, error: "Email already verified" };
  }

  // Get tenant info for company name
  let companyName = 'Your Company';
  if (user.tenantId) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    if (tenant) {
      companyName = tenant.name;
    }
  }

  return createEmailVerification(userId, user.email || '', user.name || '', companyName);
}

// Complete password reset
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Verify token first
  const verification = await verifyResetToken(token);
  if (!verification.valid) {
    return { success: false, error: verification.error };
  }

  // Validate password strength
  if (newPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  try {
    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user's password
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, verification.userId!));

    // Mark token as used
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));

    console.log(`[PasswordReset] Password updated for user ${verification.userId}`);

    return { success: true };
  } catch (error) {
    console.error('[PasswordReset] Error resetting password:', error);
    return { success: false, error: "Failed to reset password" };
  }
}
