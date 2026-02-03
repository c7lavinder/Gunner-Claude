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
  trainingMaterials,
  pendingInvitations
} from "../drizzle/schema";
import { createCheckoutSession, createBillingPortalSession, getSubscription, cancelSubscription, reactivateSubscription } from "./stripe/checkout";
import { notifyOwner } from "./_core/notification";

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
 * Get recent platform activity (for super admin dashboard)
 */
export async function getRecentActivity() {
  const db = await getDb();
  if (!db) return [];

  // Get recent tenant signups (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentTenants = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      subscriptionTier: tenants.subscriptionTier,
      subscriptionStatus: tenants.subscriptionStatus,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt))
    .limit(20);

  // Format as activity items
  const activities = recentTenants.map(tenant => {
    let type: 'signup' | 'upgrade' | 'cancel' | 'trial_start' = 'signup';
    let message = '';
    
    if (tenant.subscriptionTier === 'trial') {
      type = 'trial_start';
      message = `${tenant.name} started a free trial`;
    } else if (tenant.subscriptionStatus === 'active') {
      type = 'upgrade';
      message = `${tenant.name} subscribed to ${tenant.subscriptionTier} plan`;
    } else if (tenant.subscriptionStatus === 'canceled') {
      type = 'cancel';
      message = `${tenant.name} canceled their subscription`;
    } else {
      message = `${tenant.name} joined the platform`;
    }

    return {
      id: tenant.id,
      type,
      message,
      tenantName: tenant.name,
      plan: tenant.subscriptionTier,
      timestamp: tenant.createdAt,
    };
  });

  return activities;
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
  teamRole: 'admin' | 'acquisition_manager' | 'lead_manager' = 'lead_manager',
  invitedBy?: number
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

  // Check if there's already a pending invitation for this email
  const [existingInvite] = await db
    .select()
    .from(pendingInvitations)
    .where(and(
      eq(pendingInvitations.tenantId, tenantId),
      eq(pendingInvitations.email, email.toLowerCase()),
      eq(pendingInvitations.status, 'pending')
    ));

  if (existingInvite) {
    return { success: false, error: 'An invitation is already pending for this email' };
  }

  // Create pending invitation
  const inviteToken = crypto.randomUUID().replace(/-/g, '');
  await db.insert(pendingInvitations).values({
    tenantId,
    email: email.toLowerCase(),
    role,
    teamRole,
    invitedBy,
    inviteToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    status: 'pending',
  });

  // Get tenant name for notification
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const tenantName = tenant?.name || 'your organization';

  // Send notification to platform owner about new invite
  try {
    await notifyOwner({
      title: `New Team Invite: ${email}`,
      content: `A new team member (${email}) has been invited to ${tenantName} as ${teamRole.replace('_', ' ')}. They will be added when they sign in with their Manus account.`,
    });
  } catch (e) {
    // Don't fail the invite if notification fails
    console.warn('[Tenant] Failed to send invite notification:', e);
  }

  return { 
    success: true, 
    message: `Invitation sent to ${email}. They will be added when they sign in.`,
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


// ============ PENDING INVITATION HANDLING ============

/**
 * Check for pending invitation when user logs in
 * If found, automatically add them to the tenant
 */
export async function checkAndAcceptPendingInvitation(
  userId: number,
  email: string
) {
  const db = await getDb();
  if (!db) return null;

  // Find pending invitation for this email
  const [invitation] = await db
    .select()
    .from(pendingInvitations)
    .where(and(
      eq(pendingInvitations.email, email.toLowerCase()),
      eq(pendingInvitations.status, 'pending')
    ))
    .orderBy(desc(pendingInvitations.createdAt))
    .limit(1);

  if (!invitation) return null;

  // Check if invitation has expired
  if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
    await db
      .update(pendingInvitations)
      .set({ status: 'expired' })
      .where(eq(pendingInvitations.id, invitation.id));
    return null;
  }

  // Accept the invitation - update user with tenant info
  await db
    .update(users)
    .set({
      tenantId: invitation.tenantId,
      role: invitation.role,
      teamRole: invitation.teamRole,
    })
    .where(eq(users.id, userId));

  // Mark invitation as accepted
  await db
    .update(pendingInvitations)
    .set({
      status: 'accepted',
      acceptedAt: new Date(),
      acceptedByUserId: userId,
    })
    .where(eq(pendingInvitations.id, invitation.id));

  // Get tenant info for the response
  const tenant = await getTenantById(invitation.tenantId);

  // Get user name for notification
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const userName = user?.name || email;

  // Send notification about accepted invite
  try {
    await notifyOwner({
      title: `Team Member Joined: ${userName}`,
      content: `${userName} (${email}) has accepted their invitation and joined ${tenant?.name || 'the organization'} as ${invitation.teamRole?.replace('_', ' ') || 'team member'}.`,
    });
  } catch (e) {
    console.warn('[Tenant] Failed to send join notification:', e);
  }

  return {
    tenantId: invitation.tenantId,
    tenantName: tenant?.name || 'Unknown',
    role: invitation.role,
    teamRole: invitation.teamRole,
  };
}

/**
 * Get pending invitations for a tenant
 */
export async function getPendingInvitations(tenantId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(pendingInvitations)
    .where(and(
      eq(pendingInvitations.tenantId, tenantId),
      eq(pendingInvitations.status, 'pending')
    ))
    .orderBy(desc(pendingInvitations.createdAt));
}

/**
 * Revoke a pending invitation
 */
export async function revokePendingInvitation(tenantId: number, invitationId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  // Verify invitation belongs to this tenant
  const [invitation] = await db
    .select()
    .from(pendingInvitations)
    .where(and(
      eq(pendingInvitations.id, invitationId),
      eq(pendingInvitations.tenantId, tenantId)
    ));

  if (!invitation) {
    return { success: false, error: 'Invitation not found' };
  }

  await db
    .update(pendingInvitations)
    .set({ status: 'revoked' })
    .where(eq(pendingInvitations.id, invitationId));

  return { success: true, message: 'Invitation revoked' };
}

// ============ BILLING & SUBSCRIPTION MANAGEMENT ============

/**
 * Create a checkout session for subscription
 */
export async function createTenantCheckoutSession(params: {
  planCode: string;
  billingPeriod: 'monthly' | 'yearly';
  userId: number;
  userEmail: string;
  userName: string;
  tenantId?: number;
  origin: string;
}) {
  const successUrl = `${params.origin}/onboarding?step=6&success=true`;
  const cancelUrl = `${params.origin}/onboarding?step=2&canceled=true`;

  return createCheckoutSession({
    planCode: params.planCode,
    billingPeriod: params.billingPeriod,
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    tenantId: params.tenantId,
    successUrl,
    cancelUrl,
  });
}

/**
 * Create a billing portal session for managing subscription
 */
export async function createTenantBillingPortal(tenantId: number, returnUrl: string) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant?.stripeCustomerId) {
    return { success: false, error: 'No billing information found. Please contact support.' };
  }

  const url = await createBillingPortalSession(tenant.stripeCustomerId, returnUrl);
  return { success: true, url };
}

/**
 * Get subscription status for a tenant
 */
export async function getTenantSubscriptionStatus(tenantId: number) {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) return null;

  // If no Stripe subscription, return basic info
  if (!tenant.stripeSubscriptionId) {
    return {
      tier: tenant.subscriptionTier,
      status: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt,
      isTrialing: tenant.subscriptionTier === 'trial',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    };
  }

  // Get live subscription data from Stripe
  const subscription = await getSubscription(tenant.stripeSubscriptionId);
  if (!subscription) {
    return {
      tier: tenant.subscriptionTier,
      status: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt,
      isTrialing: tenant.subscriptionTier === 'trial',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    };
  }

  // Cast to any to access Stripe subscription properties
  const sub = subscription as any;
  return {
    tier: tenant.subscriptionTier,
    status: sub.status,
    trialEndsAt: tenant.trialEndsAt,
    isTrialing: sub.status === 'trialing',
    cancelAtPeriodEnd: sub.cancel_at_period_end || false,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
  };
}

/**
 * Cancel tenant subscription (at period end)
 */
export async function cancelTenantSubscription(tenantId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant?.stripeSubscriptionId) {
    return { success: false, error: 'No active subscription found' };
  }

  try {
    await cancelSubscription(tenant.stripeSubscriptionId);
    return { success: true, message: 'Subscription will be canceled at the end of the billing period' };
  } catch (error) {
    console.error('[Tenant] Error canceling subscription:', error);
    return { success: false, error: 'Failed to cancel subscription' };
  }
}

/**
 * Reactivate a canceled subscription
 */
export async function reactivateTenantSubscription(tenantId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant?.stripeSubscriptionId) {
    return { success: false, error: 'No subscription found' };
  }

  try {
    await reactivateSubscription(tenant.stripeSubscriptionId);
    return { success: true, message: 'Subscription reactivated' };
  } catch (error) {
    console.error('[Tenant] Error reactivating subscription:', error);
    return { success: false, error: 'Failed to reactivate subscription' };
  }
}

/**
 * Update tenant with Stripe IDs after checkout
 */
export async function updateTenantStripeIds(
  tenantId: number,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  subscriptionTier: 'starter' | 'growth' | 'scale'
) {
  const db = await getDb();
  if (!db) return null;

  // Set max users based on tier
  const maxUsers = subscriptionTier === 'starter' ? 3 : subscriptionTier === 'growth' ? 10 : 999;

  await db
    .update(tenants)
    .set({
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionTier,
      subscriptionStatus: 'active',
      maxUsers,
    })
    .where(eq(tenants.id, tenantId));

  return getTenantById(tenantId);
}
