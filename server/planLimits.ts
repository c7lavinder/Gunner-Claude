/**
 * Plan Limits Enforcement
 * Tracks and enforces subscription plan limits for tenants
 */

import { eq, and, gte, count } from "drizzle-orm";
import { getDb } from "./db";
import { tenants, users, calls, teamMembers } from "../drizzle/schema";
import { SUBSCRIPTION_PLANS, getPlanByCode } from "./stripe/products";

export interface PlanLimits {
  maxUsers: number;
  maxCallsPerMonth: number;
  maxCrmIntegrations: number;
}

export interface UsageStats {
  currentUsers: number;
  currentCallsThisMonth: number;
  currentCrmIntegrations: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  percentUsed: number;
}

/**
 * Get plan limits for a subscription tier
 */
export function getPlanLimits(tier: string): PlanLimits {
  const plan = getPlanByCode(tier);
  if (!plan) {
    // Default to starter limits for unknown tiers
    return {
      maxUsers: 3,
      maxCallsPerMonth: 500,
      maxCrmIntegrations: 1,
    };
  }
  return {
    maxUsers: plan.maxUsers,
    maxCallsPerMonth: plan.maxCallsPerMonth,
    maxCrmIntegrations: plan.maxCrmIntegrations,
  };
}

/**
 * Get current usage stats for a tenant
 */
export async function getTenantUsage(tenantId: number): Promise<UsageStats> {
  const db = await getDb();
  if (!db) {
    return { currentUsers: 0, currentCallsThisMonth: 0, currentCrmIntegrations: 0 };
  }

  // Count users in tenant
  const [userCount] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.tenantId, tenantId));

  // Count team members in tenant
  const [teamMemberCount] = await db
    .select({ count: count() })
    .from(teamMembers)
    .where(eq(teamMembers.tenantId, tenantId));

  // Count calls this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [callCount] = await db
    .select({ count: count() })
    .from(calls)
    .where(
      and(
        eq(calls.tenantId, tenantId),
        gte(calls.createdAt, startOfMonth)
      )
    );

  // Get tenant CRM config count
  const [tenant] = await db
    .select({ crmType: tenants.crmType })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  const crmCount = tenant?.crmType && tenant.crmType !== 'none' ? 1 : 0;

  // Use the higher of users or team members
  const totalUsers = Math.max(userCount?.count || 0, teamMemberCount?.count || 0);

  return {
    currentUsers: totalUsers,
    currentCallsThisMonth: callCount?.count || 0,
    currentCrmIntegrations: crmCount,
  };
}

/**
 * Check if tenant can add more users
 */
export async function canAddUser(tenantId: number): Promise<LimitCheckResult> {
  const db = await getDb();
  if (!db) {
    return { allowed: false, reason: "Database unavailable", currentUsage: 0, limit: 0, percentUsed: 0 };
  }

  // Get tenant subscription tier
  const [tenant] = await db
    .select({ subscriptionTier: tenants.subscriptionTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) {
    return { allowed: false, reason: "Tenant not found", currentUsage: 0, limit: 0, percentUsed: 0 };
  }

  const limits = getPlanLimits(tenant.subscriptionTier || 'starter');
  const usage = await getTenantUsage(tenantId);

  // Unlimited check
  if (limits.maxUsers >= 999) {
    return { allowed: true, currentUsage: usage.currentUsers, limit: -1, percentUsed: 0 };
  }

  const allowed = usage.currentUsers < limits.maxUsers;
  const percentUsed = (usage.currentUsers / limits.maxUsers) * 100;

  return {
    allowed,
    reason: allowed ? undefined : `You've reached your plan limit of ${limits.maxUsers} team members. Please upgrade to add more.`,
    currentUsage: usage.currentUsers,
    limit: limits.maxUsers,
    percentUsed,
  };
}

/**
 * Check if tenant can process more calls this month
 */
export async function canProcessCall(tenantId: number): Promise<LimitCheckResult> {
  const db = await getDb();
  if (!db) {
    return { allowed: false, reason: "Database unavailable", currentUsage: 0, limit: 0, percentUsed: 0 };
  }

  // Get tenant subscription tier
  const [tenant] = await db
    .select({ subscriptionTier: tenants.subscriptionTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) {
    return { allowed: false, reason: "Tenant not found", currentUsage: 0, limit: 0, percentUsed: 0 };
  }

  const limits = getPlanLimits(tenant.subscriptionTier || 'starter');
  const usage = await getTenantUsage(tenantId);

  // Unlimited check
  if (limits.maxCallsPerMonth < 0) {
    return { allowed: true, currentUsage: usage.currentCallsThisMonth, limit: -1, percentUsed: 0 };
  }

  const allowed = usage.currentCallsThisMonth < limits.maxCallsPerMonth;
  const percentUsed = (usage.currentCallsThisMonth / limits.maxCallsPerMonth) * 100;

  return {
    allowed,
    reason: allowed ? undefined : `You've reached your plan limit of ${limits.maxCallsPerMonth} calls this month. Please upgrade to process more calls.`,
    currentUsage: usage.currentCallsThisMonth,
    limit: limits.maxCallsPerMonth,
    percentUsed,
  };
}

/**
 * Get full usage summary for a tenant (for display in UI)
 */
export async function getTenantUsageSummary(tenantId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get tenant subscription tier
  const [tenant] = await db
    .select({ subscriptionTier: tenants.subscriptionTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) return null;

  const limits = getPlanLimits(tenant.subscriptionTier || 'starter');
  const usage = await getTenantUsage(tenantId);

  return {
    tier: tenant.subscriptionTier,
    users: {
      current: usage.currentUsers,
      limit: limits.maxUsers >= 999 ? -1 : limits.maxUsers,
      percentUsed: limits.maxUsers >= 999 ? 0 : (usage.currentUsers / limits.maxUsers) * 100,
      isUnlimited: limits.maxUsers >= 999,
    },
    calls: {
      current: usage.currentCallsThisMonth,
      limit: limits.maxCallsPerMonth,
      percentUsed: limits.maxCallsPerMonth < 0 ? 0 : (usage.currentCallsThisMonth / limits.maxCallsPerMonth) * 100,
      isUnlimited: limits.maxCallsPerMonth < 0,
    },
    crmIntegrations: {
      current: usage.currentCrmIntegrations,
      limit: limits.maxCrmIntegrations,
    },
  };
}
