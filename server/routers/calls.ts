import { z } from "zod";
import { eq, and, desc, sql, ne, count, asc, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { calls, callGrades } from "../../drizzle/schema";

export const callsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().optional().default(1),
        limit: z.number().optional().default(25),
        status: z.string().optional(),
        starred: z.boolean().optional(),
        dateFrom: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      const offset = (input.page - 1) * input.limit;

      const conditions = [
        eq(calls.tenantId, tenantId),
        ne(calls.isArchived, "true"),
      ];
      if (input.status) conditions.push(eq(calls.status, input.status));
      if (input.starred === true) conditions.push(eq(calls.isStarred, "true"));
      if (input.dateFrom) conditions.push(gte(calls.callTimestamp, new Date(input.dateFrom)));

      const [totalResult] = await db
        .select({ count: count() })
        .from(calls)
        .where(and(...conditions));

      const rows = await db
        .select({
          call: calls,
          overallScore: callGrades.overallScore,
        })
        .from(calls)
        .leftJoin(callGrades, and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId)))
        .where(and(...conditions))
        .orderBy(desc(calls.callTimestamp))
        .limit(input.limit)
        .offset(offset);

      const items = rows.map((r) => ({
        ...r.call,
        overallScore: r.overallScore ? Number(r.overallScore) : null,
      }));

      return {
        items,
        total: totalResult?.count ?? 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;

      const rows = await db
        .select({
          call: calls,
          grade: callGrades,
        })
        .from(calls)
        .leftJoin(callGrades, and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId)))
        .where(and(eq(calls.id, input.id), eq(calls.tenantId, tenantId)))
        .limit(1);

      const row = rows[0];
      if (!row || !row.call) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
      }

      const grade = row.grade
        ? {
            ...row.grade,
            overallScore: row.grade.overallScore ? Number(row.grade.overallScore) : null,
          }
        : null;

      return { ...row.call, grade };
    }),

  export: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user!.tenantId;

    const rows = await db
      .select({
        call: calls,
        overallScore: callGrades.overallScore,
      })
      .from(calls)
      .leftJoin(callGrades, and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId)))
      .where(and(eq(calls.tenantId, tenantId), ne(calls.isArchived, "true")))
      .orderBy(asc(calls.callTimestamp))
      .limit(5000);

    const header = "id,date,rep_name,call_type,score,duration_seconds,summary";
    const csvRows = rows.map((r) => {
      const date = r.call.callTimestamp ? new Date(r.call.callTimestamp).toISOString().split("T")[0] : "";
      const rep = (r.call.teamMemberName ?? "").replace(/"/g, '""');
      const callType = (r.call.callType ?? "").replace(/"/g, '""');
      const score = r.overallScore ? Number(r.overallScore) : "";
      const duration = r.call.duration ?? "";
      const summary = "";
      return `${r.call.id},"${date}","${rep}","${callType}",${score},${duration},"${summary}"`;
    });

    return { csv: [header, ...csvRows].join("\n") };
  }),

  toggleStar: protectedProcedure
    .input(z.object({ id: z.number(), starred: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      await db
        .update(calls)
        .set({ isStarred: input.starred ? "true" : "false", updatedAt: new Date() })
        .where(and(eq(calls.id, input.id), eq(calls.tenantId, tenantId)));
      return { success: true };
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user!.tenantId;

    const [totalResult] = await db
      .select({ count: count() })
      .from(calls)
      .where(and(eq(calls.tenantId, tenantId), ne(calls.isArchived, "true")));

    const [gradedResult] = await db
      .select({ count: count() })
      .from(callGrades)
      .where(eq(callGrades.tenantId, tenantId));

    const [avgResult] = await db
      .select({ avg: sql<string>`COALESCE(AVG(${callGrades.overallScore})::numeric, 0)` })
      .from(callGrades)
      .where(eq(callGrades.tenantId, tenantId));

    return {
      total: totalResult?.count ?? 0,
      graded: gradedResult?.count ?? 0,
      avgScore: avgResult?.avg ? Number(avgResult.avg) : 0,
    };
  }),
});
