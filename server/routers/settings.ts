import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/context";
import { requireRole } from "../_core/sdk";
import { logAction } from "../services/auditLog";
import { db } from "../_core/db";
import {
  tenants,
  teamMembers,
  pendingInvitations,
  tenantPlaybooks,
  syncActivityLog,
  calls,
  dispoProperties,
} from "../../drizzle/schema";
import { desc, sql } from "drizzle-orm";
import { createCrmAdapter } from "../crm";
import { createCheckoutSession, createPortalSession, getPlans } from "../services/stripe";
import { getGhlOAuthUrl, exchangeGhlCode, saveGhlTokens, registerGhlWebhooks, getGhlSyncHealth, refreshTokenIfNeeded } from "../services/ghlOAuth";

const updateWorkspaceInput = z.object({
  name: z.string().optional(),
  crmType: z.string().optional(),
  crmConfig: z.string().optional(),
  crmConnected: z.string().optional(),
  settings: z.string().optional(),
  industryCode: z.string().optional(),
  onboardingStep: z.number().optional(),
  onboardingCompleted: z.string().optional(),
});

function normalizeCrmConfig(
  raw: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean")
      out[String(k)] = String(v);
  }
  if (out.ghlApiKey && !out.apiKey) out.apiKey = out.ghlApiKey;
  if (out.ghlLocationId && !out.locationId) out.locationId = out.ghlLocationId;
  return out;
}

export const settingsRouter = router({
  getWorkspace: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
    }
    const members = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.tenantId, tenantId),
          eq(teamMembers.isActive, "true")
        )
      );
    return { tenant, teamMembers: members };
  }),

  updateWorkspace: protectedProcedure
    .input(updateWorkspaceInput)
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tenantId = ctx.user.tenantId;
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.crmType !== undefined) updates.crmType = input.crmType;
      if (input.crmConfig !== undefined) updates.crmConfig = input.crmConfig;
      if (input.crmConnected !== undefined) updates.crmConnected = input.crmConnected;
      if (input.settings !== undefined) updates.settings = input.settings;
      if (input.onboardingStep !== undefined) updates.onboardingStep = input.onboardingStep;
      if (input.onboardingCompleted !== undefined) updates.onboardingCompleted = input.onboardingCompleted;
      if (input.industryCode) {
        const [existing] = await db
          .select({ id: tenantPlaybooks.id })
          .from(tenantPlaybooks)
          .where(eq(tenantPlaybooks.tenantId, tenantId))
          .limit(1);
        if (existing) {
          await db
            .update(tenantPlaybooks)
            .set({ industryCode: input.industryCode, updatedAt: new Date() })
            .where(eq(tenantPlaybooks.id, existing.id));
        } else {
          await db.insert(tenantPlaybooks).values({
            tenantId,
            industryCode: input.industryCode,
          });
        }
      }

      if (Object.keys(updates).length === 0) {
        const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        return t!;
      }
      const [updated] = await db
        .update(tenants)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }
      logAction({ tenantId, userId: ctx.user.userId, action: "tenant_settings_change", entityType: "tenant", entityId: tenantId, after: updates });
      return updated;
    }),

  testCrmConnection: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    // Refresh OAuth token if needed before testing
    if (tenantId) await refreshTokenIfNeeded(tenantId);
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant?.crmConfig || tenant.crmType === "none") {
      return { connected: false, error: "No CRM configured" };
    }
    const config = normalizeCrmConfig(
      JSON.parse(tenant.crmConfig) as Record<string, unknown>
    );
    const adapter = createCrmAdapter(tenant.crmType ?? "ghl", config);
    return adapter.testConnection();
  }),

  inviteTeamMember: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
        teamRole: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tenantId = ctx.user.tenantId;
      const [member] = await db
        .insert(teamMembers)
        .values({
          tenantId,
          name: input.name,
          teamRole: input.teamRole,
          userId: null,
          isActive: "true",
        })
        .returning();
      if (!member) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(pendingInvitations).values({
        tenantId,
        email: input.email,
        teamRole: input.teamRole,
        invitedBy: ctx.user.userId,
        status: "pending",
      });
      logAction({ tenantId, userId: ctx.user.userId, action: "user_invite", entityType: "team_member", entityId: member.id, after: { email: input.email, teamRole: input.teamRole } });
      return member;
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({ id: z.number(), teamRole: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tenantId = ctx.user.tenantId;
      const [updated] = await db
        .update(teamMembers)
        .set({ teamRole: input.teamRole, updatedAt: new Date() })
        .where(
          and(
            eq(teamMembers.id, input.id),
            eq(teamMembers.tenantId, tenantId)
          )
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
      }
      return updated;
    }),

  removeTeamMember: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tenantId = ctx.user.tenantId;
      const [updated] = await db
        .update(teamMembers)
        .set({ isActive: "false", updatedAt: new Date() })
        .where(
          and(
            eq(teamMembers.id, input.id),
            eq(teamMembers.tenantId, tenantId)
          )
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found" });
      }
      logAction({ tenantId, userId: ctx.user.userId, action: "user_removal", entityType: "team_member", entityId: input.id });
      return updated;
    }),

  getPlans: protectedProcedure.query(async () => {
    return getPlans();
  }),

  createCheckout: protectedProcedure
    .input(z.object({ planCode: z.string(), successUrl: z.string(), cancelUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace" });
      return createCheckoutSession(tenantId, input.planCode, input.successUrl, input.cancelUrl);
    }),

  manageBilling: protectedProcedure
    .input(z.object({ returnUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace" });
      return createPortalSession(tenantId, input.returnUrl);
    }),

  getGhlOAuthUrl: protectedProcedure
    .input(z.object({ redirectUri: z.string() }))
    .query(({ ctx, input }) => {
      const url = getGhlOAuthUrl(ctx.user.tenantId, input.redirectUri);
      return { url };
    }),

  completeGhlOAuth: protectedProcedure
    .input(z.object({ code: z.string(), redirectUri: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tokens = await exchangeGhlCode(input.code, input.redirectUri);
      await saveGhlTokens(
        ctx.user.tenantId,
        tokens.locationId,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in
      );
      // Register webhooks after OAuth
      const appUrl = process.env.RAILWAY_STATIC_URL || "https://gunner-app-production.up.railway.app";
      const webhookUrl = `${appUrl}/api/webhooks/ghl`;
      await registerGhlWebhooks(tokens.locationId, tokens.access_token, webhookUrl);
      return { success: true, locationId: tokens.locationId };
    }),

  getSyncHealth: protectedProcedure.query(async ({ ctx }) => {
    return getGhlSyncHealth(ctx.user.tenantId);
  }),

  getSyncLayerStatus: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

    const config = tenant.crmConfig ? JSON.parse(tenant.crmConfig) as Record<string, unknown> : {};
    const oauthConnected = !!config.oauthConnected;
    const tokenExpiresAt = config.tokenExpiresAt ? String(config.tokenExpiresAt) : null;
    const isExpired = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() < Date.now() : false;

    // Get last activity timestamp per layer
    const lastActivity = await db
      .select({ layer: syncActivityLog.layer, lastAt: sql<string>`MAX(${syncActivityLog.createdAt})` })
      .from(syncActivityLog)
      .where(eq(syncActivityLog.tenantId, tenantId))
      .groupBy(syncActivityLog.layer);

    const layerLastAt: Record<string, string | null> = {};
    for (const row of lastActivity) {
      layerLastAt[row.layer] = row.lastAt;
    }

    return {
      crmType: tenant.crmType ?? "none",
      oauth: {
        status: oauthConnected ? (isExpired ? "expired" : "connected") : "disconnected",
        locationId: config.locationId ? String(config.locationId) : null,
        tokenExpiresAt,
        webhooksRegistered: oauthConnected,
        lastActivity: layerLastAt.oauth ?? tenant.lastWebhookAt?.toISOString() ?? null,
      },
      api: {
        status: config.apiKey ? "connected" : "not_set",
        hasApiKey: !!config.apiKey,
        hasLocationId: !!config.locationId,
        lastActivity: layerLastAt.api ?? null,
      },
      polling: {
        status: tenant.crmConnected === "true" ? "active" : "paused",
        lastSync: tenant.lastGhlSync?.toISOString() ?? null,
        lastActivity: layerLastAt.polling ?? null,
      },
    };
  }),

  getSyncActivityLog: protectedProcedure
    .input(z.object({
      layer: z.string().optional(),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const conditions = [eq(syncActivityLog.tenantId, tenantId)];
      if (input.layer) conditions.push(eq(syncActivityLog.layer, input.layer));

      return db
        .select()
        .from(syncActivityLog)
        .where(and(...conditions))
        .orderBy(desc(syncActivityLog.createdAt))
        .limit(input.limit);
    }),

  disconnectOAuth: protectedProcedure.mutation(async ({ ctx }) => {
    requireRole(ctx, "admin");
    const tenantId = ctx.user.tenantId;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

    // Preserve apiKey/locationId if they were set manually, remove OAuth tokens
    const existingConfig = tenant.crmConfig ? JSON.parse(tenant.crmConfig) as Record<string, unknown> : {};
    const cleanConfig: Record<string, unknown> = {};
    if (existingConfig.apiKey) cleanConfig.apiKey = existingConfig.apiKey;
    if (existingConfig.locationId) cleanConfig.locationId = existingConfig.locationId;

    await db.update(tenants).set({
      crmConfig: JSON.stringify(cleanConfig),
      crmConnected: Object.keys(cleanConfig).length > 0 ? "true" : "false",
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    logAction({ tenantId, userId: ctx.user.userId, action: "oauth_disconnected", entityType: "tenant", entityId: tenantId });
    return { success: true };
  }),

  getSyncSummary: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const [callCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(eq(calls.tenantId, tenantId));
    const [oppCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dispoProperties)
      .where(eq(dispoProperties.tenantId, tenantId));
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    return {
      totalCalls: Number(callCount?.count ?? 0),
      totalOpportunities: Number(oppCount?.count ?? 0),
      lastSync: tenant?.lastGhlSync?.toISOString() ?? null,
    };
  }),
});
