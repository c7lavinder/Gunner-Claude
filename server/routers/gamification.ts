import { z } from "zod";
import { eq, and, desc, gte, lte, or, inArray, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import {
  teamMembers,
  performanceMetrics,
  userStreaks,
  userXp,
  userBadges,
  badges,
  badgeProgress,
} from "../../drizzle/schema";

function periodRange(period?: string): { start: Date; end: Date } | null {
  if (period === "all") return null;
  const now = new Date();
  const start = new Date(now);
  if (period === "week") start.setDate(start.getDate() - 7);
  else if (period === "month") start.setDate(start.getDate() - 30);
  else start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

export const gamificationRouter = router({
  getLeaderboard: protectedProcedure
    .input(z.object({ period: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = periodRange(input?.period);
      const tid = ctx.user.tenantId;
      const members = await db.select().from(teamMembers).where(and(eq(teamMembers.tenantId, tid), eq(teamMembers.isActive, "true")));
      const memberIds = members.map((m) => m.id);
      if (!memberIds.length) return [];
      const rangeCond = range ? [gte(performanceMetrics.periodEnd, range.start), lte(performanceMetrics.periodStart, range.end)] : [];
      const metrics = await db.select().from(performanceMetrics).where(and(eq(performanceMetrics.tenantId, tid), ...rangeCond));
      const [streaks, xpRows] = await Promise.all([
        db.select().from(userStreaks).where(and(eq(userStreaks.tenantId, tid), inArray(userStreaks.teamMemberId, memberIds))),
        db.select().from(userXp).where(and(eq(userXp.tenantId, tid), inArray(userXp.teamMemberId, memberIds))),
      ]);
      const streakMap = new Map(streaks.map((s) => [s.teamMemberId, s]));
      const xpMap = new Map(xpRows.map((x) => [x.teamMemberId, x]));
      const metricByMember = new Map<number, typeof metrics[0][]>();
      for (const m of metrics) {
        if (!metricByMember.has(m.teamMemberId)) metricByMember.set(m.teamMemberId, []);
        metricByMember.get(m.teamMemberId)!.push(m);
      }
      const withScores = members.map((m) => {
        const ms = metricByMember.get(m.id) ?? [];
        const avg = ms.length > 0 ? ms.reduce((a, b) => a + (b.averageScore ? Number(b.averageScore) : 0), 0) / ms.length : 0;
        return { ...m, averageScore: avg, totalCalls: ms.reduce((a, b) => a + (b.totalCalls ?? 0), 0), streak: streakMap.get(m.id) ?? null, xp: xpMap.get(m.id) ?? null };
      });
      return withScores.sort((a, b) => b.averageScore - a.averageScore);
    }),

  getBadges: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user.tenantId;
    const [member] = await db.select().from(teamMembers).where(and(eq(teamMembers.userId, ctx.user.userId), eq(teamMembers.tenantId, tid), eq(teamMembers.isActive, "true"))).limit(1);
    const defs = await db.select().from(badges).where(or(eq(badges.tenantId, tid), isNull(badges.tenantId)));
    if (!member) return { definitions: defs, earned: [], progress: [] };
    const [earned, progress] = await Promise.all([
      db.select().from(userBadges).where(and(eq(userBadges.tenantId, tid), eq(userBadges.teamMemberId, member.id))),
      db.select().from(badgeProgress).where(and(eq(badgeProgress.tenantId, tid), eq(badgeProgress.teamMemberId, member.id))),
    ]);
    return { definitions: defs, earned, progress };
  }),

  getStreaks: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user.tenantId;
    const rows = await db.select({ streak: userStreaks, member: teamMembers }).from(userStreaks).innerJoin(teamMembers, and(eq(teamMembers.id, userStreaks.teamMemberId), eq(teamMembers.tenantId, tid), eq(teamMembers.isActive, "true"))).where(eq(userStreaks.tenantId, tid)).orderBy(desc(userStreaks.hotStreakCurrent));
    return rows.map((r) => ({ ...r.streak, memberName: r.member.name }));
  }),
});
