/**
 * Admin Router - Platform administration endpoints
 * Only accessible by super_admin users
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { tenants, users, calls, callGrades } from "../drizzle/schema";
import { eq, like, sql, count, desc, and, isNotNull } from "drizzle-orm";

// Super admin check middleware
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== "super_admin") {
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
});
