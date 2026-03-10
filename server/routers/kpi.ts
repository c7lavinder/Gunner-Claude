import { z } from "zod";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import {
  dailyKpiEntries,
  dispoProperties,
  calls,
  callGrades,
} from "../../drizzle/schema";

function periodRange(period?: string) {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start, end: now };
  }
  if (period === "month") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end: now };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

export const kpiRouter = router({
  getDashboard: protectedProcedure
    .input(z.object({ period: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = periodRange(input?.period);
      const funnelRows = await db
        .select({
          status: dispoProperties.status,
          count: count(),
        })
        .from(dispoProperties)
        .where(eq(dispoProperties.tenantId, ctx.user.tenantId))
        .groupBy(dispoProperties.status);
      const funnel = funnelRows.map((r) => ({
        status: r.status ?? "unknown",
        count: r.count,
      }));
      const callRows = await db
        .select({
          total: count(),
        })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, ctx.user.tenantId),
            gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, range.start),
            lte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, range.end)
          )
        );
      const gradedRows = await db
        .select({
          count: count(),
          avgScore: sql<string>`COALESCE(AVG(CAST(${callGrades.overallScore} AS numeric)), 0)`,
        })
        .from(callGrades)
        .innerJoin(calls, eq(calls.id, callGrades.callId))
        .where(
          and(
            eq(callGrades.tenantId, ctx.user.tenantId),
            gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, range.start),
            lte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, range.end)
          )
        );
      const total = callRows[0]?.total ?? 0;
      const graded = gradedRows[0]?.count ?? 0;
      const avgScore = gradedRows[0]?.avgScore
        ? Number(gradedRows[0].avgScore)
        : 0;
      return {
        funnel,
        callStats: { total, graded, avgScore },
        period: input?.period ?? "today",
      };
    }),

  getEntries: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(dailyKpiEntries)
        .where(
          and(
            eq(dailyKpiEntries.tenantId, ctx.user.tenantId),
            eq(dailyKpiEntries.userId, ctx.user.userId),
            eq(dailyKpiEntries.date, input.date)
          )
        );
    }),

  saveEntry: protectedProcedure
    .input(
      z.object({
        kpiType: z.string(),
        date: z.string(),
        value: z.number().optional(),
        contactId: z.string().optional(),
        contactName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [entry] = await db
        .insert(dailyKpiEntries)
        .values({
          tenantId: ctx.user.tenantId,
          userId: ctx.user.userId,
          date: input.date,
          kpiType: input.kpiType,
          contactId: input.contactId,
          contactName: input.contactName,
          notes: input.notes,
        })
        .returning();
      return entry;
    }),
});
