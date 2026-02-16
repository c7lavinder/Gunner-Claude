/**
 * Tenant Management Functions
 * Handles multi-tenancy operations for the white-label SaaS platform
 */

import { eq, sql, and, desc, count, gte } from "drizzle-orm";
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
import { createCheckoutSession, createBillingPortalSession, getSubscription, cancelSubscription, reactivateSubscription, updateSubscription } from "./stripe/checkout";
import { notifyOwner } from "./_core/notification";
import { sendTeamInviteEmail, sendWelcomeEmail } from "./emailService";
import { onUserSignup, onUserConverted } from "./loops";

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
 * Get all tenants with CRM connected (for sync jobs)
 */
export async function getTenantsWithCrm() {
  const { withDbRetry } = await import("./db");
  return withDbRetry(async () => {
    const db = await getDb();
    if (!db) return [];

    const results = await db
      .select()
      .from(tenants)
      .where(eq(tenants.crmConnected, "true"));

    return results;
  });
}

/**
 * Parse a tenant's crmConfig JSON into a typed object
 */
export interface TenantCrmConfig {
  ghlApiKey?: string;
  ghlLocationId?: string;
  batchDialerEnabled?: boolean;
  batchDialerApiKey?: string;
  batchLeadsApiKey?: string;
  dispoPipelineName?: string;
  dispoPipelineId?: string;
  newDealStageName?: string;
  newDealStageId?: string;
  stageMapping?: Record<string, string>;
  // Per-pipeline stage mappings: { pipelineId: { stageId: callType } }
  pipelineMappings?: Record<string, { name: string; stageMapping: Record<string, string> }>;
}

export function parseCrmConfig(tenant: { crmConfig: string | null }): TenantCrmConfig {
  if (!tenant.crmConfig) return {};
  try {
    return JSON.parse(tenant.crmConfig) as TenantCrmConfig;
  } catch {
    return {};
  }
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
    starter: 199,
    growth: 499,
    scale: 999,
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
 * Get tenants with low usage (churn risk) for super admin alerts
 * Identifies tenants with no calls in the last 7+ days
 */
export async function getLowUsageTenants() {
  const db = await getDb();
  if (!db) return [];

  // Get all active/trial tenants
  const activeTenants = await db
    .select()
    .from(tenants)
    .where(
      sql`${tenants.subscriptionStatus} IN ('active') OR ${tenants.subscriptionTier} = 'trial'`
    );

  const lowUsageTenants = [];

  for (const tenant of activeTenants) {
    // Get the most recent call for this tenant
    const [latestCall] = await db
      .select({ createdAt: calls.createdAt })
      .from(calls)
      .where(eq(calls.tenantId, tenant.id))
      .orderBy(desc(calls.createdAt))
      .limit(1);

    // Calculate days since last activity
    let daysSinceLastCall: number | null = null;
    let lastActivityDate: Date | null = null;

    if (latestCall?.createdAt) {
      lastActivityDate = new Date(latestCall.createdAt);
      const now = new Date();
      daysSinceLastCall = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
    } else {
      // No calls ever - use tenant creation date
      lastActivityDate = new Date(tenant.createdAt);
      const now = new Date();
      daysSinceLastCall = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Flag as low usage if 7+ days since last call
    if (daysSinceLastCall !== null && daysSinceLastCall >= 7) {
      // Get user count for context
      const [userCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, tenant.id));

      // Get total call count
      const [callCount] = await db
        .select({ count: count() })
        .from(calls)
        .where(eq(calls.tenantId, tenant.id));

      lowUsageTenants.push({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subscriptionTier: tenant.subscriptionTier,
        subscriptionStatus: tenant.subscriptionStatus,
        daysSinceLastCall,
        lastActivityDate,
        userCount: userCount?.count || 0,
        totalCalls: callCount?.count || 0,
        createdAt: tenant.createdAt,
      });
    }
  }

  // Sort by days since last call (most inactive first)
  return lowUsageTenants.sort((a, b) => b.daysSinceLastCall - a.daysSinceLastCall);
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

  // Get graded call count for this tenant (only completed calls with conversation classification)
  // This is what counts against the plan limit
  const currentMonth = new Date();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  
  const [callResult] = await db
    .select({ count: count() })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        eq(calls.status, 'completed'),
        eq(calls.classification, 'conversation'),
        gte(calls.createdAt, firstDayOfMonth)
      )
    );
  const callCount = callResult?.count || 0;

  return {
    ...tenant,
    teamMembers: tenantUsers,
    callCount,
  };
}

/**
 * Complete onboarding - mark tenant as onboarded
 */
export async function completeOnboarding(tenantId: number, userId?: number) {
  const db = await getDb();
  if (!db) return null;

  await db
    .update(tenants)
    .set({ onboardingCompleted: 'true' })
    .where(eq(tenants.id, tenantId));

  // Get tenant and user info for Loops
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  
  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user && tenant && user.email) {
      // Add user to Loops for email automation
      try {
        await onUserSignup({
          email: user.email,
          firstName: user.name?.split(' ')[0],
          lastName: user.name?.split(' ').slice(1).join(' '),
          userId: user.id.toString(),
          tenantId: tenant.id.toString(),
          tenantName: tenant.name,
          trialEndsAt: tenant.trialEndsAt || undefined,
        });
        console.log(`[Loops] Added user ${user.email} to email automation`);
      } catch (error) {
        console.error('[Loops] Failed to add user to email automation:', error);
        // Don't fail onboarding if Loops fails
      }
    }
  }

  return { success: true };
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
    crmConnected?: 'true' | 'false';
    onboardingStep?: number;
    lastGhlSync?: Date;
    lastBatchDialerSync?: Date;
    lastBatchLeadsSync?: Date;
  }
) {
  const db = await getDb();
  if (!db) return null;

  const updateData: Record<string, unknown> = {};
  if (updates.name) updateData.name = updates.name;
  if (updates.domain) updateData.domain = updates.domain;
  if (updates.crmType) updateData.crmType = updates.crmType;
  if (updates.crmConfig) updateData.crmConfig = updates.crmConfig;
  if (updates.crmConnected) updateData.crmConnected = updates.crmConnected;
  if (updates.onboardingStep !== undefined) updateData.onboardingStep = updates.onboardingStep;
  if (updates.lastGhlSync) updateData.lastGhlSync = updates.lastGhlSync;
  if (updates.lastBatchDialerSync) updateData.lastBatchDialerSync = updates.lastBatchDialerSync;
  if (updates.lastBatchLeadsSync) updateData.lastBatchLeadsSync = updates.lastBatchLeadsSync;

  if (Object.keys(updateData).length === 0) return getTenantById(tenantId);

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
  planCode?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const subscriptionTierValue = (data.subscriptionTier || 'trial') as 'trial' | 'starter' | 'growth' | 'scale';
  
  // Get trial days from database plan or default to 14
  let trialDays = 14;
  if (data.planCode) {
    const [dbPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, data.planCode)).limit(1);
    if (dbPlan?.trialDays) {
      trialDays = dbPlan.trialDays;
    }
  }
  
  const [newTenant] = await db
    .insert(tenants)
    .values({
      name: data.name,
      slug: data.slug,
      subscriptionTier: subscriptionTierValue,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
    })
    .$returningId();

  return getTenantById(newTenant.id);
}

/**
 * Setup a new tenant with CRM config and team members in one operation.
 * This is the "15-minute onboarding" flow for the super admin.
 */
export async function setupTenant(data: {
  name: string;
  slug: string;
  subscriptionTier?: string;
  crmType?: 'ghl' | 'none';
  crmConfig?: TenantCrmConfig;
  teamMembers?: Array<{
    name: string;
    teamRole: 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator';
    phone?: string;
    email?: string;
    isTenantAdmin?: boolean;
  }>;
}) {
  const db = await getDb();
  if (!db) return null;

  const subscriptionTierValue = (data.subscriptionTier || 'trial') as 'trial' | 'starter' | 'growth' | 'scale';
  
  // Create the tenant
  const [newTenant] = await db
    .insert(tenants)
    .values({
      name: data.name,
      slug: data.slug,
      subscriptionTier: subscriptionTierValue,
      crmType: data.crmType || 'none',
      crmConnected: (data.crmConfig?.ghlApiKey && data.crmConfig?.ghlLocationId) ? 'true' : 'false',
      crmConfig: data.crmConfig ? JSON.stringify(data.crmConfig) : null,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      onboardingCompleted: 'true',
    })
    .$returningId();

  const tenantId = newTenant.id;

  // Fetch GHL users for auto-linking if CRM is connected
  let ghlUserMap = new Map<string, string>(); // name -> ghlUserId
  if (data.crmConfig?.ghlApiKey && data.crmConfig?.ghlLocationId) {
    try {
      const GHL_API_BASE = "https://services.leadconnectorhq.com";
      const url = new URL(`${GHL_API_BASE}/users/search`);
      url.searchParams.set("locationId", data.crmConfig.ghlLocationId);
      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${data.crmConfig.ghlApiKey}`,
          "Version": "2021-07-28",
        },
      });
      if (response.ok) {
        const ghlData = await response.json() as { users?: Array<{ id: string; name?: string; firstName?: string; lastName?: string }> };
        if (ghlData.users) {
          for (const u of ghlData.users) {
            const name = u.name || [u.firstName, u.lastName].filter(Boolean).join(" ");
            if (name && u.id) {
              ghlUserMap.set(name.toLowerCase(), u.id);
            }
          }
          console.log(`[Tenant] Fetched ${ghlUserMap.size} GHL users for auto-linking`);
        }
      }
    } catch (e) {
      console.warn(`[Tenant] Failed to fetch GHL users for auto-linking:`, e);
    }
  }

  // Create team members and send invites if provided
  const invitesSent: string[] = [];
  if (data.teamMembers && data.teamMembers.length > 0) {
    for (const member of data.teamMembers) {
      // Auto-link GHL user by name matching
      let ghlUserId: string | undefined;
      const memberNameLower = member.name.toLowerCase();
      const ghlEntries = Array.from(ghlUserMap.entries());
      for (let i = 0; i < ghlEntries.length; i++) {
        const [ghlName, ghlId] = ghlEntries[i];
        if (ghlName.includes(memberNameLower) || memberNameLower.includes(ghlName)) {
          ghlUserId = ghlId;
          console.log(`[Tenant] Auto-linked "${member.name}" to GHL userId ${ghlId}`);
          break;
        }
      }

      // Create team member record
      await db.insert(teamMembers).values({
        name: member.name,
        teamRole: member.teamRole,
        tenantId,
        isActive: 'true',
        ...(ghlUserId ? { ghlUserId } : {}),
      });

      // If email provided, send an invite
      if (member.email) {
        try {
          // Determine the role for the invitation
          const inviteRole = member.isTenantAdmin ? 'admin' as const : 'user' as const;
          
          await inviteUserToTenant(
            tenantId,
            member.email,
            inviteRole,
            member.teamRole,
            undefined // invitedBy - platform owner, no specific user ID needed
          );
          invitesSent.push(member.email);
          console.log(`[Tenant] Invite sent to ${member.email} for tenant ${data.name} (role: ${member.teamRole}, admin: ${member.isTenantAdmin})`);
        } catch (e) {
          console.warn(`[Tenant] Failed to send invite to ${member.email}:`, e);
        }
      }
    }
  }

  // Notify platform owner
  try {
    const inviteInfo = invitesSent.length > 0 
      ? ` Invites sent to: ${invitesSent.join(', ')}.`
      : '';
    await notifyOwner({
      title: `New Tenant Setup: ${data.name}`,
      content: `Tenant "${data.name}" has been set up with ${data.teamMembers?.length || 0} team members. CRM: ${data.crmType || 'none'}.${inviteInfo}`,
    });
  } catch (e) {
    console.error('[Tenant] Failed to notify owner:', e);
  }

  return getTenantById(tenantId);
}

/**
 * Bulk add team members to an existing tenant
 */
export async function bulkAddTeamMembers(
  tenantId: number,
  members: Array<{
    name: string;
    teamRole: 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator';
    phone?: string;
  }>
) {
  const db = await getDb();
  if (!db) return [];

  const created: Array<{ id: number; name: string; teamRole: string }> = [];

  for (const member of members) {
    const [result] = await db.insert(teamMembers).values({
      name: member.name,
      teamRole: member.teamRole,
      tenantId,
      isActive: 'true',
    }).$returningId();

    created.push({ id: result.id, name: member.name, teamRole: member.teamRole });
  }

  return created;
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
  // Check against the OWNER_OPEN_ID env var (Manus OAuth)
  // Also check against Corey's Google OAuth openId
  const ownerOpenId = process.env.OWNER_OPEN_ID || "U3JEthPNs4UbYRrgRBbShj";
  return openId === ownerOpenId || openId === "google_112815946311339322655";
}

// ============ USER MANAGEMENT ============

/**
 * Invite a user to a tenant (creates pending invitation)
 */
export async function inviteUserToTenant(
  tenantId: number,
  email: string,
  role: 'admin' | 'user' = 'user',
  teamRole: 'admin' | 'acquisition_manager' | 'lead_manager' | 'lead_generator' = 'lead_manager',
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

  // Get tenant name and inviter name for notification
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const tenantName = tenant?.name || 'your organization';
  
  let inviterName = 'Team Admin';
  if (invitedBy) {
    const [inviter] = await db.select().from(users).where(eq(users.id, invitedBy));
    inviterName = inviter?.name || 'Team Admin';
  }

  // Send team invite email notification
  try {
    // Use the deployed domain for invite links so users sign in at getgunner.ai
    const baseUrl = 'https://getgunner.ai';
    await sendTeamInviteEmail(
      email,
      inviterName,
      tenantName,
      teamRole.replace('_', ' '),
      baseUrl
    );
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
  teamRole: 'admin' | 'acquisition_manager' | 'lead_manager' | 'lead_generator'
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
/**
 * Auto-match a new user to an existing team_member by name.
 * If the user's name matches a team_member in any tenant, auto-assign them to that tenant.
 * This prevents team members from being funneled into onboarding when they sign in for the first time.
 */
export async function autoMatchTeamMember(
  userId: number,
  userName: string | null,
  userEmail: string | null
) {
  const db = await getDb();
  if (!db) return null;

  // Check if user already has a tenant
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user?.tenantId) return null; // Already assigned

  if (!userName && !userEmail) return null;

  // Try to match by name (case-insensitive, fuzzy)
  // First try exact name match against team_members
  const allTeamMembers = await db.select().from(teamMembers).where(eq(teamMembers.isActive, 'true'));
  
  let matchedMember = null;
  
  if (userName) {
    const normalizedName = userName.toLowerCase().trim();
    
    // Exact match
    matchedMember = allTeamMembers.find(tm => 
      tm.name.toLowerCase().trim() === normalizedName
    );
    
    // Partial match: first name + last name in either order
    if (!matchedMember) {
      const nameParts = normalizedName.split(/\s+/);
      if (nameParts.length >= 2) {
        matchedMember = allTeamMembers.find(tm => {
          const tmParts = tm.name.toLowerCase().trim().split(/\s+/);
          // Check if first names match
          return tmParts[0] === nameParts[0] || 
            // Or last names match and first name starts similarly
            (tmParts.length >= 2 && nameParts.length >= 2 && 
             tmParts[tmParts.length - 1] === nameParts[nameParts.length - 1]);
        });
      }
    }
  }
  
  if (!matchedMember || !matchedMember.tenantId) return null;

  const tenantId = matchedMember.tenantId;
  // Map team_member teamRole to user teamRole
  const teamRole = matchedMember.teamRole as 'admin' | 'lead_manager' | 'acquisition_manager' | 'lead_generator';

  // Assign user to the team member's tenant
  await db
    .update(users)
    .set({
      tenantId,
      role: 'user',
      teamRole: teamRole,
    })
    .where(eq(users.id, userId));

  const tenant = await getTenantById(tenantId);
  
  console.log(`[OAuth] Auto-matched user "${userName}" (id: ${userId}) to team member "${matchedMember.name}" in tenant ${tenant?.name || matchedMember.tenantId}`);

  return {
    tenantId: matchedMember.tenantId,
    tenantName: tenant?.name || 'Unknown',
    teamMemberName: matchedMember.name,
    teamRole: teamRole,
  };
}

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

  // Send welcome email notification
  try {
    await sendWelcomeEmail(
      userName,
      email,
      tenant?.name || 'the organization',
      invitation.teamRole?.replace('_', ' ') || 'team member'
    );
  } catch (e) {
    console.warn('[Tenant] Failed to send welcome notification:', e);
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
  const successUrl = `${params.origin}/dashboard?checkout=success`;
  const cancelUrl = `${params.origin}/paywall?checkout=canceled`;

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


/**
 * Change tenant subscription plan (upgrade/downgrade)
 */
export async function changeTenantSubscription(
  tenantId: number,
  newPlanCode: 'starter' | 'growth' | 'scale',
  billingPeriod: 'monthly' | 'yearly'
) {
  const db = await getDb();
  if (!db) return { success: false, error: 'Database not available' };

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) {
    return { success: false, error: 'Tenant not found' };
  }

  if (!tenant.stripeSubscriptionId) {
    return { success: false, error: 'No active subscription found. Please subscribe first.' };
  }

  // Don't allow changing to the same plan
  if (tenant.subscriptionTier === newPlanCode) {
    return { success: false, error: 'You are already on this plan' };
  }

  try {
    // Update subscription in Stripe
    const updatedSubscription = await updateSubscription(
      tenant.stripeSubscriptionId,
      newPlanCode,
      billingPeriod
    );

    // Determine max users based on new tier
    const maxUsers = newPlanCode === 'starter' ? 3 : newPlanCode === 'growth' ? 10 : 999;

    // Update tenant in database
    await db
      .update(tenants)
      .set({
        subscriptionTier: newPlanCode,
        maxUsers,
      })
      .where(eq(tenants.id, tenantId));

    // Determine if this was an upgrade or downgrade
    const tierOrder = { starter: 1, growth: 2, scale: 3 };
    const oldTierOrder = tierOrder[tenant.subscriptionTier as keyof typeof tierOrder] || 0;
    const newTierOrder = tierOrder[newPlanCode];
    const isUpgrade = newTierOrder > oldTierOrder;

    return { 
      success: true, 
      message: isUpgrade 
        ? `Successfully upgraded to ${newPlanCode} plan! Your new features are now available.`
        : `Successfully changed to ${newPlanCode} plan. Changes take effect immediately.`,
      subscription: {
        tier: newPlanCode,
        status: updatedSubscription.status,
      }
    };
  } catch (error: any) {
    console.error('[Tenant] Error changing subscription:', error);
    return { success: false, error: error.message || 'Failed to change subscription' };
  }
}
