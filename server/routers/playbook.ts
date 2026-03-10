import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import {
  tenants,
  tenantRoles,
  tenantCallTypes,
  tenantRubrics,
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
} from "../services/playbooks";

export const playbookRouter = router({
  getConfig: protectedProcedure.query(({ ctx }) => {
    const tenant = getTenantPlaybook(ctx.user.tenantId);
    const industry = getIndustryPlaybook(tenant?.industryCode ?? "default");
    return {
      terminology: resolveTerminology(industry, tenant),
      roles: resolveRoles(industry, tenant),
      stages: resolveStages(industry, tenant),
      callTypes: resolveCallTypes(industry),
      algorithm: resolveAlgorithmConfig(industry, tenant),
    };
  }),

  getIndustry: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => getIndustryPlaybook(input.code)),

  getTenant: protectedProcedure.query(({ ctx }) =>
    getTenantPlaybook(ctx.user.tenantId)
  ),

  getUser: protectedProcedure.query(({ ctx }) =>
    getUserPlaybook(ctx.user.userId, ctx.user.tenantId)
  ),

  getSoftware: publicProcedure.query(() => SOFTWARE_PLAYBOOK),

  updateTenantConfig: protectedProcedure
    .input(
      z.object({
        terminology: z.string().optional(),
        algorithmOverrides: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, ctx.user.tenantId));
      if (!tenant) return null;
      const settings = (tenant.settings ? JSON.parse(tenant.settings) : {}) as Record<string, unknown>;
      if (input.terminology !== undefined) settings.terminology = input.terminology;
      if (input.algorithmOverrides !== undefined) settings.algorithmOverrides = input.algorithmOverrides;
      const [updated] = await db
        .update(tenants)
        .set({ settings: JSON.stringify(settings), updatedAt: new Date() })
        .where(eq(tenants.id, ctx.user.tenantId))
        .returning();
      return updated ?? null;
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
