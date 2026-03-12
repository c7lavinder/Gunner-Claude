import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/context";
import { requireRole } from "../_core/sdk";
import { logAction } from "../services/auditLog";
import { db } from "../_core/db";
import {
  tenantRoles,
  tenantCallTypes,
  tenantRubrics,
  tenantPlaybooks,
  industryPlaybooks as industryPlaybooksTable,
  userPlaybooks,
} from "../../drizzle/schema";
import {
  SOFTWARE_PLAYBOOK,
  getIndustryPlaybook,
  getTenantPlaybook,
  getUserPlaybook,
  resolveTerminology,
  resolveRoles,
  resolveStages,
  resolveCallTypes,
  resolveAlgorithmConfig,
  resolveKpiFunnelStages,
  resolveKpiMetrics,
  resolveRoleplayPersonas,
  resolveTrainingCategories,
  resolveOutcomeTypes,
  resolveClassificationLabels,
} from "../services/playbooks";

export const playbookRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const tenant = await getTenantPlaybook(ctx.user.tenantId);
    const industry = await getIndustryPlaybook(tenant?.industryCode ?? "default");
    return {
      terminology: resolveTerminology(industry, tenant),
      roles: resolveRoles(industry, tenant),
      stages: resolveStages(industry, tenant),
      callTypes: resolveCallTypes(industry),
      algorithm: resolveAlgorithmConfig(industry, tenant),
      kpiFunnelStages: resolveKpiFunnelStages(industry, tenant),
      kpiMetrics: resolveKpiMetrics(industry, tenant),
      roleplayPersonas: resolveRoleplayPersonas(industry),
      trainingCategories: resolveTrainingCategories(industry),
      outcomeTypes: resolveOutcomeTypes(industry),
      classificationLabels: resolveClassificationLabels(industry),
      markets: tenant?.markets ?? [],
      leadSources: tenant?.leadSources ?? [],
    };
  }),

  getIndustry: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => getIndustryPlaybook(input.code)),

  getTenant: protectedProcedure.query(async ({ ctx }) =>
    getTenantPlaybook(ctx.user.tenantId)
  ),

  getUser: protectedProcedure.query(async ({ ctx }) => {
    const existing = await getUserPlaybook(ctx.user.userId, ctx.user.tenantId);
    if (existing) return existing;
    const [created] = await db
      .insert(userPlaybooks)
      .values({
        userId: ctx.user.userId,
        tenantId: ctx.user.tenantId,
        role: "member",
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      return getUserPlaybook(ctx.user.userId, ctx.user.tenantId);
    }
    return getUserPlaybook(ctx.user.userId, ctx.user.tenantId);
  }),

  listIndustries: publicProcedure.query(async () => {
    const rows = await db
      .select({ code: industryPlaybooksTable.code, name: industryPlaybooksTable.name })
      .from(industryPlaybooksTable)
      .where(eq(industryPlaybooksTable.isActive, "true"));
    return rows;
  }),

  getSoftware: publicProcedure.query(() => SOFTWARE_PLAYBOOK),

  updateTenantConfig: protectedProcedure
    .input(
      z.object({
        terminology: z.string().optional(),
        algorithmOverrides: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tenantId = ctx.user.tenantId;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.terminology !== undefined) {
        try {
          updates.terminology = z.record(z.string(), z.string()).parse(JSON.parse(input.terminology));
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid terminology JSON" });
        }
      }
      if (input.algorithmOverrides !== undefined) {
        try {
          updates.algorithmOverrides = z.record(z.string(), z.unknown()).parse(JSON.parse(input.algorithmOverrides));
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid algorithm overrides JSON" });
        }
      }

      const [existing] = await db
        .select({ id: tenantPlaybooks.id })
        .from(tenantPlaybooks)
        .where(eq(tenantPlaybooks.tenantId, tenantId))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(tenantPlaybooks)
          .set(updates as typeof tenantPlaybooks.$inferInsert)
          .where(eq(tenantPlaybooks.id, existing.id))
          .returning();
        logAction({ tenantId, userId: ctx.user.userId, action: "playbook_edit", entityType: "tenant_playbook", entityId: existing.id, after: updates });
        return updated ?? null;
      }
      const insertValues = { ...updates, tenantId } as typeof tenantPlaybooks.$inferInsert;
      const [inserted] = await db
        .insert(tenantPlaybooks)
        .values(insertValues)
        .returning();
      logAction({ tenantId, userId: ctx.user.userId, action: "playbook_edit", entityType: "tenant_playbook", after: updates });
      return inserted ?? null;
    }),

  upsertRole: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string(),
        code: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tid = ctx.user.tenantId;
      if (input.id) {
        const [updated] = await db
          .update(tenantRoles)
          .set({ name: input.name, code: input.code, description: input.description ?? null, updatedAt: new Date() })
          .where(and(eq(tenantRoles.id, input.id), eq(tenantRoles.tenantId, tid)))
          .returning();
        return updated ?? null;
      }
      const [inserted] = await db
        .insert(tenantRoles)
        .values({ tenantId: tid, name: input.name, code: input.code, description: input.description ?? null })
        .returning();
      return inserted ?? null;
    }),

  deleteRole: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      await db
        .delete(tenantRoles)
        .where(and(eq(tenantRoles.id, input.id), eq(tenantRoles.tenantId, ctx.user.tenantId)));
      return { success: true };
    }),

  upsertCallType: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string(),
        code: z.string(),
        description: z.string().optional(),
        rubricId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tid = ctx.user.tenantId;
      if (input.id) {
        const [updated] = await db
          .update(tenantCallTypes)
          .set({
            name: input.name,
            code: input.code,
            description: input.description ?? null,
            rubricId: input.rubricId ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(tenantCallTypes.id, input.id), eq(tenantCallTypes.tenantId, tid)))
          .returning();
        return updated ?? null;
      }
      const [inserted] = await db
        .insert(tenantCallTypes)
        .values({
          tenantId: tid,
          name: input.name,
          code: input.code,
          description: input.description ?? null,
          rubricId: input.rubricId ?? null,
        })
        .returning();
      return inserted ?? null;
    }),

  upsertRubric: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string(),
        callType: z.string(),
        criteria: z.string(),
        redFlags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "admin");
      const tid = ctx.user.tenantId;
      if (input.id) {
        const [updated] = await db
          .update(tenantRubrics)
          .set({
            name: input.name,
            callType: input.callType,
            criteria: input.criteria,
            redFlags: input.redFlags ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(tenantRubrics.id, input.id), eq(tenantRubrics.tenantId, tid)))
          .returning();
        return updated ?? null;
      }
      const [inserted] = await db
        .insert(tenantRubrics)
        .values({
          tenantId: tid,
          name: input.name,
          callType: input.callType,
          criteria: input.criteria,
          redFlags: input.redFlags ?? null,
        })
        .returning();
      return inserted ?? null;
    }),

  updateUserPlaybook: protectedProcedure
    .input(
      z.object({
        voiceConsentGiven: z.string().optional(),
        role: z.string().optional(),
        strengths: z.string().optional(),
        growthAreas: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.userId;
      const tenantId = ctx.user.tenantId;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.voiceConsentGiven !== undefined) updates.voiceConsentGiven = input.voiceConsentGiven;
      if (input.role !== undefined) updates.role = input.role;
      if (input.strengths !== undefined) {
        try {
          updates.strengths = z.array(z.string()).parse(JSON.parse(input.strengths));
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid strengths JSON" });
        }
      }
      if (input.growthAreas !== undefined) {
        try {
          updates.growthAreas = z.array(z.string()).parse(JSON.parse(input.growthAreas));
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid growth areas JSON" });
        }
      }
      const [updated] = await db
        .update(userPlaybooks)
        .set(updates as typeof userPlaybooks.$inferInsert)
        .where(and(eq(userPlaybooks.userId, userId), eq(userPlaybooks.tenantId, tenantId)))
        .returning();
      return updated ?? null;
    }),

  getRoles: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(tenantRoles).where(eq(tenantRoles.tenantId, ctx.user.tenantId));
  }),

  getCallTypes: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(tenantCallTypes).where(eq(tenantCallTypes.tenantId, ctx.user.tenantId));
  }),

  getRubrics: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(tenantRubrics).where(eq(tenantRubrics.tenantId, ctx.user.tenantId));
  }),
});
