import { z } from "zod";
import { eq, and, desc, or, ilike, count } from "drizzle-orm"; // count used in getStageCounts
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import {
  dispoProperties,
  propertyActivityLog,
  propertyStageHistory,
} from "../../drizzle/schema";
import { inventorySort } from "../algorithms";

export const inventoryRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        stage: z.string().optional(),
        search: z.string().optional(),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      const offset = (input.page - 1) * input.limit;

      const conditions = [eq(dispoProperties.tenantId, tenantId)];
      if (input.stage) conditions.push(eq(dispoProperties.status, input.stage));
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(or(ilike(dispoProperties.address, term), ilike(dispoProperties.sellerName, term))!);
      }

      const allItems = await db
        .select()
        .from(dispoProperties)
        .where(and(...conditions))
        .orderBy(desc(dispoProperties.createdAt));

      const sortedAll = inventorySort(allItems);
      const total = sortedAll.length;
      const items = sortedAll.slice(offset, offset + input.limit);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;

      const [property] = await db
        .select()
        .from(dispoProperties)
        .where(
          and(eq(dispoProperties.id, input.id), eq(dispoProperties.tenantId, tenantId))
        )
        .limit(1);

      if (!property) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      }

      const activity = await db
        .select()
        .from(propertyActivityLog)
        .where(
          and(
            eq(propertyActivityLog.propertyId, input.id),
            eq(propertyActivityLog.tenantId, tenantId)
          )
        )
        .orderBy(desc(propertyActivityLog.createdAt))
        .limit(10);

      return { ...property, activity };
    }),

  getStageCounts: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user!.tenantId;

    const rows = await db
      .select({
        stage: dispoProperties.status,
        count: count(),
      })
      .from(dispoProperties)
      .where(eq(dispoProperties.tenantId, tenantId))
      .groupBy(dispoProperties.status);

    return rows.map((r) => ({ stage: r.stage ?? "", count: r.count }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        address: z.string().min(1),
        city: z.string().optional().default(""),
        state: z.string().optional().default(""),
        zip: z.string().optional().default(""),
        sellerName: z.string().optional(),
        sellerPhone: z.string().optional(),
        status: z.string().optional().default("new_lead"),
        leadSource: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      const [property] = await db
        .insert(dispoProperties)
        .values({
          tenantId,
          address: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
          sellerName: input.sellerName ?? null,
          sellerPhone: input.sellerPhone ?? null,
          status: input.status,
          leadSource: input.leadSource ?? null,
          stageChangedAt: new Date(),
        })
        .returning();
      return property!;
    }),

  updateStage: protectedProcedure
    .input(z.object({ propertyId: z.number(), newStage: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;

      const [property] = await db
        .select()
        .from(dispoProperties)
        .where(
          and(
            eq(dispoProperties.id, input.propertyId),
            eq(dispoProperties.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!property) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
      }

      const [updated] = await db
        .update(dispoProperties)
        .set({
          status: input.newStage,
          stageChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dispoProperties.id, input.propertyId),
            eq(dispoProperties.tenantId, tenantId)
          )
        )
        .returning();

      await db.insert(propertyStageHistory).values({
        tenantId,
        propertyId: input.propertyId,
        fromStatus: property.status,
        toStatus: input.newStage,
        changedByUserId: ctx.user!.userId,
        source: "manual",
      });

      return updated!;
    }),
});
