import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { notifications } from "../../drizzle/schema";

export const notificationsRouter = router({
  getRecent: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.tenantId, ctx.user.tenantId),
            eq(notifications.userId, ctx.user.userId)
          )
        )
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
      return rows;
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, ctx.user.tenantId),
          eq(notifications.userId, ctx.user.userId),
          eq(notifications.isRead, "false")
        )
      );
    return { count: result?.count ?? 0 };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ isRead: "true" })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.user.userId),
            eq(notifications.tenantId, ctx.user.tenantId)
          )
        );
      return { ok: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notifications)
      .set({ isRead: "true" })
      .where(
        and(
          eq(notifications.tenantId, ctx.user.tenantId),
          eq(notifications.userId, ctx.user.userId),
          eq(notifications.isRead, "false")
        )
      );
    return { ok: true };
  }),
});

export async function createNotification(params: {
  tenantId: number;
  userId: number;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}) {
  await db.insert(notifications).values({
    ...params,
    isRead: "false",
  });
}
