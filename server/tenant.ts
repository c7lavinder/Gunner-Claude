/**
 * Tenant Management Functions
 * Handles multi-tenancy operations for the white-label SaaS platform
 */

import { eq, sql, and, desc, count } from "drizzle-orm";
import { getDb } from "./db";
import { 
  tenants, 
  subscriptionPlans, 
  users, 
  calls, 
  teamMembers,
  trainingMaterials 
} from "../drizzle/schema";

// ============ TENANT QUERIES ============

/**
 * Get all tenants with their stats (for super admin)
 */
export async function getAllTenants() {
  const db = await getDb();
  if (!db) return [];

  const tenantsData = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  
  // Get user counts and call counts for each tenant
  const tenantsWithStats = await Promise.all(
    tenantsData.map(async (tenant) => {
      const [userCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, tenant.id));
      
      const [callCount] = await db
        .select({ count: count() })
        .from(calls)
        .where(eq(calls.tenantId, tenant.id));

      return {
        ...tenant,
        userCount: userCount?.count || 0,
        callCount: callCount?.count || 0,
      };
    })
  );

  return tenantsWithStats;
}

/**
 * Get tenant by ID
 */
export async function getTenantById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
  return tenant || null;
}

/**
 * Get tenant by slug
 */
export async function getTenantBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return tenant || null;
}

/**
 * Get platform metrics (for super admin dashboard)
 */
export async function getPlatformMetrics() {
  const db = await getDb();
  if (!db) {
    return {
      totalMrr: 0,
      totalArr: 0,
      totalTenants: 0,
      activeTenants: 0,
      trialTenants: 0,
      churnedTenants: 0,
      totalUsers: 0,
      totalCalls: 0,
      avgCallsPerTenant: 0,
    };
  }

  // Get all tenants
  const allTenants = await db.select().from(tenants);
  
  // Calculate MRR based on subscription tiers
  const planPrices: Record<string, number> = {
    starter: 99,
    growth: 249,
    scale: 499,
  };

  let totalMrr = 0;
  let activeTenants = 0;
  let trialTenants = 0;
  let churnedTenants = 0;

  for (const tenant of allTenants) {
    if (tenant.subscriptionStatus === 'active') {
      activeTenants++;
      totalMrr += planPrices[tenant.subscriptionTier || 'starter'] || 0;
    } else if (tenant.subscriptionTier === 'trial') {
      trialTenants++;
    } else if (tenant.subscriptionStatus === 'canceled') {
      churnedTenants++;
    }
  }

  // Get total users
  const [userResult] = await db.select({ count: count() }).from(users);
  const totalUsers = userResult?.count || 0;

  // Get total calls
  const [callResult] = await db.select({ count: count() }).from(calls);
  const totalCalls = callResult?.count || 0;

  const avgCallsPerTenant = allTenants.length > 0 ? Math.round(totalCalls / allTenants.length) : 0;

  return {
    totalMrr,
    totalArr: totalMrr * 12,
    totalTenants: allTenants.length,
    activeTenants,
    trialTenants,
    churnedTenants,
    totalUsers,
    totalCalls,
    avgCallsPerTenant,
  };
}

/**
 * Get tenant settings (for tenant admin)
 */
export async function getTenantSettings(tenantId: number) {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return null;

  // Get team members for this tenant
  const tenantUsers = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenantId));

  // Get call count for this tenant
  const [callResult] = await db
    .select({ count: count() })
    .from(calls)
    .where(eq(calls.tenantId, tenantId));
  const callCount = callResult?.count || 0;

  return {
    ...tenant,
    teamMembers: tenantUsers,
    callCount,
  };
}

/**
 * Update tenant settings
 */
export async function updateTenantSettings(
  tenantId: number,
  updates: {
    name?: string;
    domain?: string;
    crmType?: 'ghl' | 'hubspot' | 'salesforce' | 'close' | 'pipedrive' | 'none';
    crmConfig?: string;
  }
) {
  const db = await getDb();
  if (!db) return null;

  const updateData: Record<string, unknown> = {};
  if (updates.name) updateData.name = updates.name;
  if (updates.domain) updateData.domain = updates.domain;
  if (updates.crmType) updateData.crmType = updates.crmType;
  if (updates.crmConfig) updateData.crmConfig = updates.crmConfig;

  await db
    .update(tenants)
    .set(updateData)
    .where(eq(tenants.id, tenantId));

  return getTenantById(tenantId);
}

/**
 * Create a new tenant
 */
export async function createTenant(data: {
  name: string;
  slug: string;
  subscriptionTier?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const subscriptionTierValue = (data.subscriptionTier || 'trial') as 'trial' | 'starter' | 'growth' | 'scale';
  
  const [newTenant] = await db
    .insert(tenants)
    .values({
      name: data.name,
      slug: data.slug,
      subscriptionTier: subscriptionTierValue,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    })
    .$returningId();

  return getTenantById(newTenant.id);
}

/**
 * Get users for a tenant
 */
export async function getTenantUsers(tenantId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      teamRole: users.teamRole,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(desc(users.createdAt));
}

/**
 * Get subscription plans
 */
export async function getSubscriptionPlans() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.priceMonthly);
}

// ============ TENANT CONTEXT HELPERS ============

/**
 * Get tenant ID from user
 */
export function getTenantIdFromUser(user: { tenantId?: number | null }): number | null {
  return user.tenantId || null;
}

/**
 * Check if user is platform owner (super admin)
 */
export function isPlatformOwner(openId: string): boolean {
  // Corey's openId - the platform owner
  return openId === "U3JEthPNs4UbYRrgRBbShj";
}

// ============ USER MANAGEMENT ============

/**
 * Invite a user to a tenant (creates pending invitation)
 */
export async function inviteUserToTenant(
  tenantId: number,
  email: string,
  role: 'admin' | 'user' = 'user',
  teamRole: 'admin' | 'acquisition_manager' | 'lead_manager' = 'lead_manager'
) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  // Check if user already exists with this email
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (existingUser) {
    // If user exists but in different tenant, return error
    if (existingUser.tenantId && existingUser.tenantId !== tenantId) {
      return { success: false, error: 'User already belongs to another organization' };
    }
    // If user already in this tenant, return error
    if (existingUser.tenantId === tenantId) {
      return { success: false, error: 'User is already a member of this organization' };
    }
    // User exists but not assigned to a tenant - assign them
    await db
      .update(users)
      .set({ tenantId, role, teamRole })
      .where(eq(users.id, existingUser.id));
    return { success: true, userId: existingUser.id, message: 'Existing user added to organization' };
  }

  // For new users, we'll create a placeholder that gets completed on first login
  // In a real system, you'd send an invite email here
  return { 
    success: true, 
    message: `Invitation ready for ${email}. They will be added when they sign in.`,
    pendingEmail: email,
    role,
    teamRole
  };
}

/**
 * Remove a user from a tenant
 */
export async function removeUserFromTenant(tenantId: number, userId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  // Verify user belongs to this tenant
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

  if (!user) {
    return { success: false, error: 'User not found in this organization' };
  }

  // Remove user from tenant (set tenantId to null)
  await db
    .update(users)
    .set({ tenantId: null })
    .where(eq(users.id, userId));

  return { success: true, message: 'User removed from organization' };
}

/**
 * Update user role within tenant
 */
export async function updateUserRole(
  tenantId: number,
  userId: number,
  role: 'admin' | 'user',
  teamRole: 'admin' | 'acquisition_manager' | 'lead_manager'
) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  // Verify user belongs to this tenant
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

  if (!user) {
    return { success: false, error: 'User not found in this organization' };
  }

  await db
    .update(users)
    .set({ role, teamRole })
    .where(eq(users.id, userId));

  return { success: true, message: 'User role updated' };
}
