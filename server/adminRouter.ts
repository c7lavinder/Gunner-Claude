/**
 * Admin Router - Platform administration endpoints
 * Only accessible by super_admin users
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { tenants, users, calls, callGrades, subscriptionPlans, platformSettings } from "../drizzle/schema";
import { eq, like, sql, count, desc, and, isNotNull } from "drizzle-orm";
import { getAllTenantsUsage, getTenantUsage } from "./rateLimit";

// Super admin check middleware
// Platform owner's openId for fallback access
const PLATFORM_OWNER_OPEN_ID = "U3JEthPNs4UbYRrgRBbShj";

const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const isSuperAdmin = ctx.user?.role === "super_admin";
  const isPlatformOwner = ctx.user?.openId === PLATFORM_OWNER_OPEN_ID;
  
  if (!isSuperAdmin && !isPlatformOwner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super admin privileges required.",
    });
  }
  return next({ ctx });
});

export const adminRouter = router({
  // Get platform-wide statistics
  getStats: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
    
    // Get tenant counts
    const [tenantStats] = await db
      .select({
        total: count(),
        active: sql<number>`SUM(CASE WHEN ${tenants.subscriptionStatus} = 'active' THEN 1 ELSE 0 END)`,
      })
      .from(tenants);

    // Get user count
    const [userStats] = await db
      .select({ total: count() })
      .from(users);

    // Get call counts
    const [callStats] = await db
      .select({
        total: count(),
        graded: sql<number>`SUM(CASE WHEN status = 'graded' THEN 1 ELSE 0 END)`,
      })
      .from(calls);

    // Calculate MRR (simplified - based on tier pricing)
    const tierPricing: Record<string, number> = {
      trial: 0,
      starter: 9900, // $99
      growth: 19900, // $199
      scale: 49900, // $499
    };

    const tenantTiers = await db
      .select({
        tier: tenants.subscriptionTier,
        count: count(),
      })
      .from(tenants)
      .where(eq(tenants.subscriptionStatus, "active"))
      .groupBy(tenants.subscriptionTier);

    const monthlyRevenue = tenantTiers.reduce((sum: number, t: { tier: string | null; count: number }) => {
      return sum + (tierPricing[t.tier || "trial"] || 0) * t.count;
    }, 0);

    return {
      totalTenants: tenantStats?.total || 0,
      activeTenants: tenantStats?.active || 0,
      totalUsers: userStats?.total || 0,
      totalCalls: callStats?.total || 0,
      gradedCalls: callStats?.graded || 0,
      monthlyRevenue,
    };
  }),

  // Get all tenants with search
  getTenants: superAdminProcedure
    .input(z.object({
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const search = input?.search;

      // Get tenants with user and call counts
      const tenantsData = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          subscriptionTier: tenants.subscriptionTier,
          subscriptionStatus: tenants.subscriptionStatus,
          crmType: tenants.crmType,
          crmConnected: tenants.crmConnected,
          onboardingCompleted: tenants.onboardingCompleted,
          createdAt: tenants.createdAt,
          trialEndsAt: tenants.trialEndsAt,
        })
        .from(tenants)
        .where(search ? like(tenants.name, `%${search}%`) : undefined)
        .orderBy(desc(tenants.createdAt))
        .limit(input?.limit || 50)
        .offset(input?.offset || 0);

      // Get counts for each tenant
      const tenantsWithCounts = await Promise.all(
        tenantsData.map(async (tenant: typeof tenantsData[0]) => {
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

      return tenantsWithCounts;
    }),

  // Get detailed tenant info
  getTenantDetails: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Get tenant
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId));

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }

      // Get users
      const tenantUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          teamRole: users.teamRole,
          isTenantAdmin: users.isTenantAdmin,
          lastSignedIn: users.lastSignedIn,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.tenantId, input.tenantId));

      // Get stats
      const [callCount] = await db
        .select({ count: count() })
        .from(calls)
        .where(eq(calls.tenantId, input.tenantId));

      const [gradedCallCount] = await db
        .select({ count: count() })
        .from(calls)
        .where(and(
          eq(calls.tenantId, input.tenantId),
          sql`${calls.status} = 'graded'`
        ));

      return {
        ...tenant,
        users: tenantUsers,
        stats: {
          userCount: tenantUsers.length,
          callCount: callCount?.count || 0,
          gradedCallCount: gradedCallCount?.count || 0,
        },
      };
    }),

  // Update tenant settings
  updateTenant: superAdminProcedure
    .input(z.object({
      tenantId: z.number(),
      subscriptionTier: z.enum(["trial", "starter", "growth", "scale"]).optional(),
      subscriptionStatus: z.enum(["active", "past_due", "canceled", "paused"]).optional(),
      maxUsers: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { tenantId, ...updates } = input;

      // Filter out undefined values
      const filteredUpdates: Record<string, any> = {};
      if (updates.subscriptionTier) filteredUpdates.subscriptionTier = updates.subscriptionTier;
      if (updates.subscriptionStatus) filteredUpdates.subscriptionStatus = updates.subscriptionStatus;
      if (updates.maxUsers !== undefined) filteredUpdates.maxUsers = updates.maxUsers;

      if (Object.keys(filteredUpdates).length === 0) {
        return { success: true };
      }

      await db
        .update(tenants)
        .set(filteredUpdates)
        .where(eq(tenants.id, tenantId));

      return { success: true };
    }),

  // Delete tenant and all associated data
  deleteTenant: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // First verify tenant exists
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId));

      if (!tenant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
      }

      // Delete all associated users first (foreign key constraint)
      await db.delete(users).where(eq(users.tenantId, input.tenantId));

      // Delete the tenant
      await db.delete(tenants).where(eq(tenants.id, input.tenantId));

      return { success: true, deletedTenant: tenant.name };
    }),

  // Get API usage analytics for all tenants
  getUsageAnalytics: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

    // Get usage data from in-memory store
    const usageData = getAllTenantsUsage();

    // Get tenant names for the usage data
    const tenantIds = usageData.map(u => u.tenantId);
    if (tenantIds.length === 0) return [];

    const tenantNames = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants);

    const tenantNameMap = new Map(tenantNames.map(t => [t.id, t.name]));

    return usageData.map(u => ({
      tenantId: u.tenantId,
      tenantName: tenantNameMap.get(u.tenantId) || 'Unknown',
      usage: u.usage,
      totalRequests: Object.values(u.usage).reduce((sum, count) => sum + count, 0),
    })).sort((a, b) => b.totalRequests - a.totalRequests);
  }),

  // Get usage for a specific tenant
  getTenantUsage: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      return getTenantUsage(input.tenantId);
    }),

  // Start impersonating a tenant
  startImpersonation: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Get the tenant to impersonate
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId));

      if (!tenant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
      }

      // Get the first admin user of the tenant (or any user)
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.tenantId, input.tenantId))
        .orderBy(desc(users.isTenantAdmin))
        .limit(1);

      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No users found in this tenant' });
      }

      // Return the impersonation data - the client will store this
      return {
        success: true,
        impersonation: {
          originalUserId: ctx.user!.id,
          originalTenantId: ctx.user!.tenantId,
          targetUserId: targetUser.id,
          targetTenantId: tenant.id,
          targetTenantName: tenant.name,
          targetUserName: targetUser.name,
          targetUserEmail: targetUser.email,
        },
      };
    }),

  // Get impersonation status (check if currently impersonating)
  getImpersonationStatus: protectedProcedure.query(async ({ ctx }) => {
    // This will be handled client-side via localStorage
    // Just return the current user info
    return {
      userId: ctx.user?.id,
      tenantId: ctx.user?.tenantId,
      role: ctx.user?.role,
    };
  }),

  // ============ SUBSCRIPTION PLANS MANAGEMENT ============

  // Get all subscription plans
  getPlans: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

    const plans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(subscriptionPlans.sortOrder);

    return plans.map(plan => ({
      ...plan,
      features: plan.features ? JSON.parse(plan.features) : [],
    }));
  }),

  // Create a new subscription plan
  createPlan: superAdminProcedure
    .input(z.object({
      name: z.string().min(1),
      code: z.string().min(1),
      description: z.string().optional(),
      priceMonthly: z.number().min(0),
      priceYearly: z.number().min(0).optional(),
      trialDays: z.number().min(0).default(14),
      maxUsers: z.number().min(1),
      maxCallsPerMonth: z.number(), // -1 for unlimited
      maxCrmIntegrations: z.number().min(0).default(1),
      features: z.array(z.string()).default([]),
      isPopular: z.boolean().default(false),
      isActive: z.boolean().default(true),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Check if code already exists
      const [existing] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, input.code));

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'A plan with this code already exists' });
      }

      const [result] = await db.insert(subscriptionPlans).values({
        name: input.name,
        code: input.code,
        description: input.description,
        priceMonthly: input.priceMonthly,
        priceYearly: input.priceYearly || Math.round(input.priceMonthly * 10), // Default: 2 months free
        trialDays: input.trialDays,
        maxUsers: input.maxUsers,
        maxCallsPerMonth: input.maxCallsPerMonth,
        maxCrmIntegrations: input.maxCrmIntegrations,
        features: JSON.stringify(input.features),
        isPopular: input.isPopular ? "true" : "false",
        isActive: input.isActive ? "true" : "false",
        sortOrder: input.sortOrder,
      });

      return { success: true, planId: result.insertId };
    }),

  // Update an existing subscription plan
  updatePlan: superAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      priceMonthly: z.number().min(0).optional(),
      priceYearly: z.number().min(0).optional(),
      trialDays: z.number().min(0).optional(),
      maxUsers: z.number().min(1).optional(),
      maxCallsPerMonth: z.number().optional(),
      maxCrmIntegrations: z.number().min(0).optional(),
      features: z.array(z.string()).optional(),
      isPopular: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
      stripePriceIdMonthly: z.string().optional(),
      stripePriceIdYearly: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { id, features, isPopular, isActive, ...rest } = input;

      const updateData: Record<string, unknown> = { ...rest };
      if (features !== undefined) updateData.features = JSON.stringify(features);
      if (isPopular !== undefined) updateData.isPopular = isPopular ? "true" : "false";
      if (isActive !== undefined) updateData.isActive = isActive ? "true" : "false";

      await db
        .update(subscriptionPlans)
        .set(updateData)
        .where(eq(subscriptionPlans.id, id));

      return { success: true };
    }),

  // Delete a subscription plan
  deletePlan: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Check if any tenants are using this plan
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.id));

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const [tenantCount] = await db
        .select({ count: count() })
        .from(tenants)
        .where(eq(tenants.subscriptionTier, plan.code as "trial" | "starter" | "growth" | "scale"));

      if (tenantCount && tenantCount.count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete plan. ${tenantCount.count} tenant(s) are currently using this plan.`,
        });
      }

      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, input.id));

      return { success: true };
    }),

  // Seed default plans (for initial setup)
  seedDefaultPlans: superAdminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

    const defaultPlans = [
      {
        name: "Starter",
        code: "starter",
        description: "Perfect for small teams getting started with AI call coaching",
        priceMonthly: 9900,
        priceYearly: 99000,
        trialDays: 14,
        maxUsers: 3,
        maxCallsPerMonth: 500,
        maxCrmIntegrations: 1,
        stripePriceIdMonthly: "", // Add your Stripe price ID here
        stripePriceIdYearly: "", // Add your Stripe price ID here
        features: JSON.stringify([
          "AI call grading",
          "Basic analytics dashboard",
          "Team leaderboard",
          "Up to 3 team members",
          "1 CRM integration",
          "Email support",
        ]),
        isPopular: "false" as const,
        isActive: "true" as const,
        sortOrder: 1,
      },
      {
        name: "Growth",
        code: "growth",
        description: "For growing teams that need more users and advanced features",
        priceMonthly: 24900,
        priceYearly: 249000,
        trialDays: 14,
        maxUsers: 10,
        maxCallsPerMonth: 2000,
        maxCrmIntegrations: 2,
        stripePriceIdMonthly: "", // Add your Stripe price ID here
        stripePriceIdYearly: "", // Add your Stripe price ID here
        features: JSON.stringify([
          "Everything in Starter",
          "Advanced analytics & trends",
          "Custom grading rubrics",
          "Training materials upload",
          "Up to 10 team members",
          "2 CRM integrations",
          "Priority email support",
        ]),
        isPopular: "true" as const,
        isActive: "true" as const,
        sortOrder: 2,
      },
      {
        name: "Scale",
        code: "scale",
        description: "Enterprise-grade features for large organizations",
        priceMonthly: 49900,
        priceYearly: 499000,
        trialDays: 14,
        maxUsers: 999,
        maxCallsPerMonth: -1,
        maxCrmIntegrations: 5,
        stripePriceIdMonthly: "", // Add your Stripe price ID here
        stripePriceIdYearly: "", // Add your Stripe price ID here
        features: JSON.stringify([
          "Everything in Growth",
          "Unlimited team members",
          "5 CRM integrations",
          "API access",
          "Custom branding",
          "Dedicated account manager",
          "Phone support",
          "SLA guarantee",
        ]),
        isPopular: "false" as const,
        isActive: "true" as const,
        sortOrder: 3,
      },
    ];

    for (const plan of defaultPlans) {
      // Check if plan already exists
      const [existing] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, plan.code));

      if (!existing) {
        await db.insert(subscriptionPlans).values(plan);
      }
    }

    return { success: true, message: "Default plans seeded successfully" };
  }),

  // ============ PLATFORM SETTINGS ============

  // Get platform settings
  getPlatformSettings: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

    const settings = await db.select().from(platformSettings);
    
    // Convert to key-value object
    const settingsMap: Record<string, string> = {};
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    return settingsMap;
  }),

  // Update platform setting
  updatePlatformSetting: superAdminProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Upsert the setting
      const [existing] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, input.key));

      if (existing) {
        await db
          .update(platformSettings)
          .set({ value: input.value, description: input.description })
          .where(eq(platformSettings.key, input.key));
      } else {
        await db.insert(platformSettings).values({
          key: input.key,
          value: input.value,
          description: input.description,
        });
      }

      return { success: true };
    }),
});
