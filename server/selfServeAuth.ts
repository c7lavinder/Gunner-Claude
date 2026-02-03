import { getDb } from "./db";
import { users, tenants } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
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
    { expiresIn: '7d' }
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

  // Check if email already exists
  const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
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

  // Set plan limits
  const planLimits = {
    starter: { maxUsers: 3, maxCallsPerMonth: 500 },
    growth: { maxUsers: 10, maxCallsPerMonth: 2000 },
    scale: { maxUsers: 999, maxCallsPerMonth: 999999 },
  };

  const limits = planLimits[planId];

  // Calculate trial end date (14 days from now)
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

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
    }).$returningId();

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
    }).$returningId();

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

  // Find user by email
  const [user] = await db.select().from(users).where(
    and(
      eq(users.email, email),
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
