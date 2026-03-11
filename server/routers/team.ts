import { z } from "zod";
import { eq, and, inArray, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/context";
import { requireRole } from "../_core/sdk";
import { db } from "../_core/db";
import {
  teamMembers,
  userStreaks,
  userXp,
  performanceMetrics,
  pendingInvitations,
} from "../../drizzle/schema";

export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const members = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.tenantId, ctx.user.tenantId),
          eq(teamMembers.isActive, "true")
        )
      );
    const memberIds = members.map((m) => m.id);
    const [streaks, xpRows] = await Promise.all([
      memberIds.length
        ? db
            .select()
            .from(userStreaks)
            .where(
              and(
                eq(userStreaks.tenantId, ctx.user.tenantId),
                inArray(userStreaks.teamMemberId, memberIds)
              )
            )
        : [],
      memberIds.length
        ? db
            .select()
            .from(userXp)
            .where(
              and(
                eq(userXp.tenantId, ctx.user.tenantId),
                inArray(userXp.teamMemberId, memberIds)
              )
            )
        : [],
    ]);
    const streakMap = new Map(streaks.map((s) => [s.teamMemberId, s]));
    const xpMap = new Map(xpRows.map((x) => [x.teamMemberId, x]));
    return members.map((m) => ({
      ...m,
      streak: streakMap.get(m.id) ?? null,
      xp: xpMap.get(m.id) ?? null,
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user.tenantId;
      const [member] = await db.select().from(teamMembers).where(and(eq(teamMembers.id, input.id), eq(teamMembers.tenantId, tid)));
      if (!member) throw new TRPCError({ code: "NOT_FOUND" });
      const [streak, xp, metrics] = await Promise.all([
        db.select().from(userStreaks).where(and(eq(userStreaks.teamMemberId, input.id), eq(userStreaks.tenantId, tid))).limit(1),
        db.select().from(userXp).where(and(eq(userXp.teamMemberId, input.id), eq(userXp.tenantId, tid))).limit(1),
        db.select().from(performanceMetrics).where(and(eq(performanceMetrics.teamMemberId, input.id), eq(performanceMetrics.tenantId, tid))).orderBy(desc(performanceMetrics.periodEnd)).limit(10),
      ]);
      return { ...member, streak: streak[0] ?? null, xp: xp[0] ?? null, performanceMetrics: metrics };
    }),

  invite: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string(),
        teamRole: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "manager");
      const [member] = await db
        .insert(teamMembers)
        .values({
          tenantId: ctx.user.tenantId,
          name: input.name,
          teamRole: input.teamRole,
        })
        .returning();
      if (!member) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(pendingInvitations).values({
        tenantId: ctx.user.tenantId,
        email: input.email,
        teamRole: input.teamRole,
        invitedBy: ctx.user.userId,
      });
      return member;
    }),

  export: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user.tenantId;

    const members = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.tenantId, tid), eq(teamMembers.isActive, "true")));

    const memberIds = members.map((m) => m.id);

    const [xpRows, badgeRows] = await Promise.all([
      memberIds.length
        ? db.select().from(userXp).where(and(eq(userXp.tenantId, tid), inArray(userXp.teamMemberId, memberIds)))
        : [],
      [] as { teamMemberId: number; badgeId: string }[],
    ]);

    const xpMap = new Map(xpRows.map((x) => [x.teamMemberId, x]));

    const header = "rep_name,role,total_xp,avg_score,badges_earned";
    const csvRows = members.map((m) => {
      const name = (m.name ?? "").replace(/"/g, '""');
      const role = (m.teamRole ?? "").replace(/"/g, '""');
      const xpData = xpMap.get(m.id);
      const totalXp = xpData?.totalXp ?? 0;
      return `"${name}","${role}",${totalXp},,`;
    });

    return { csv: [header, ...csvRows].join("\n") };
  }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireRole(ctx, "manager");
      const [updated] = await db
        .update(teamMembers)
        .set({ isActive: "false", updatedAt: new Date() })
        .where(
          and(
            eq(teamMembers.id, input.id),
            eq(teamMembers.tenantId, ctx.user.tenantId)
          )
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),
});
