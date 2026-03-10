import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import {
  trainingMaterials,
  calls,
  callGrades,
  teamMembers,
  userXp,
  userStreaks,
} from "../../drizzle/schema";
import { chatCompletion } from "../_core/llm";

const gradeToNum = (g: string | null): number => {
  if (!g) return 0;
  const m: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  return m[g.toUpperCase()] ?? 0;
};

export const trainingRouter = router({
  getMaterials: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(trainingMaterials)
      .where(
        and(
          eq(trainingMaterials.tenantId, ctx.user.tenantId),
          eq(trainingMaterials.isActive, "true")
        )
      )
      .orderBy(asc(trainingMaterials.category), asc(trainingMaterials.title));
    return rows;
  }),

  getUserProgress: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const userId = ctx.user.userId;

    const [tm] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.tenantId, tenantId),
          eq(teamMembers.userId, userId),
          eq(teamMembers.isActive, "true")
        )
      );

    const recentCalls: Array<{ call: typeof calls.$inferSelect; grade: string | null }> = [];
    let avgGrade = 0;
    let trend: "up" | "down" | "flat" = "flat";
    let xp = 0;
    let streak = 0;

    if (tm) {
      const callRows = await db
        .select({ call: calls, grade: callGrades.overallGrade })
        .from(calls)
        .leftJoin(
          callGrades,
          and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId))
        )
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.teamMemberId, tm.id),
            eq(calls.status, "graded")
          )
        )
        .orderBy(desc(calls.callTimestamp))
        .limit(10);

      recentCalls.push(
        ...callRows.map((r) => ({
          call: r.call,
          grade: r.grade,
        }))
      );

      const grades = callRows.map((r) => gradeToNum(r.grade));
      if (grades.length > 0) {
        avgGrade = grades.reduce((a, b) => a + b, 0) / grades.length;
        if (grades.length >= 10) {
          const last5 = grades.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
          const prev5 = grades.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
          trend = last5 > prev5 ? "up" : last5 < prev5 ? "down" : "flat";
        }
      }

      const [xpRow] = await db
        .select()
        .from(userXp)
        .where(
          and(
            eq(userXp.tenantId, tenantId),
            eq(userXp.teamMemberId, tm.id)
          )
        );
      xp = xpRow?.totalXp ?? 0;

      const [streakRow] = await db
        .select()
        .from(userStreaks)
        .where(
          and(
            eq(userStreaks.tenantId, tenantId),
            eq(userStreaks.teamMemberId, tm.id)
          )
        );
      streak = streakRow?.hotStreakCurrent ?? 0;
    }

    const level = Math.floor(xp / 500) + 1;

    return {
      avgGrade,
      trend,
      recentCalls,
      xp,
      streak,
      level,
    };
  }),

  startRoleplay: protectedProcedure
    .input(z.object({ scenario: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await chatCompletion({
        messages: [
          {
            role: "system",
            content: `You are a sales roleplay coach. The user wants to practice: "${input.scenario}". Start the roleplay by playing the prospect/customer. Be realistic and engaging. Keep responses concise (2-4 sentences).`,
          },
          {
            role: "user",
            content: `Let's practice: ${input.scenario}. I'm ready to start.`,
          },
        ],
      });
      return response;
    }),
});
