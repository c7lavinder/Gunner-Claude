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
} from "../../drizzle/schema";
import { createCrmAdapter } from "../crm";
import { createCheckoutSession, createPortalSession, getPlans } from "../services/stripe";
import { getGhlOAuthUrl, exchangeGhlCode, saveGhlTokens, registerGhlWebhooks, getGhlSyncHealth } from "../services/ghlOAuth";

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
      const webhookUrl = `${appUrl}/api/webhooks/crm`;
      await registerGhlWebhooks(tokens.locationId, tokens.access_token, webhookUrl);
      return { success: true, locationId: tokens.locationId };
    }),

  getSyncHealth: protectedProcedure.query(async ({ ctx }) => {
    return getGhlSyncHealth(ctx.user.tenantId);
  }),
});
