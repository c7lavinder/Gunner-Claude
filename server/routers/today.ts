import { z } from "zod";
import { eq, and, desc, gte, count, or, ilike, lt, isNull, like, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { calls, contactCache, dispoProperties, dailyKpiEntries } from "../../drizzle/schema";

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const todayStr = () => new Date().toISOString().slice(0, 10);

export const todayRouter = router({
  getConversations: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const conditions = [eq(contactCache.tenantId, tid)];
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(or(ilike(contactCache.name, term), ilike(contactCache.phone, term))!);
      }
      const rows = await db.select({
        id: contactCache.id, name: contactCache.name, phone: contactCache.phone,
        ghlContactId: contactCache.ghlContactId, lastContactDate: contactCache.lastContactDate,
      }).from(contactCache).where(and(...conditions))
        .orderBy(desc(contactCache.lastContactDate)).limit(input.limit);
      return rows.map((r) => ({
        id: String(r.id), name: r.name ?? "Unknown", phone: r.phone ?? "",
        ghlContactId: r.ghlContactId, lastContactDate: r.lastContactDate,
      }));
    }),

  getMissedCalls: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user!.tenantId;
    const rows = await db.select({
      id: calls.id, contactName: calls.contactName, contactPhone: calls.contactPhone,
      callTimestamp: calls.callTimestamp, ghlContactId: calls.ghlContactId,
    }).from(calls).where(and(
      eq(calls.tenantId, tid), eq(calls.callDirection, "inbound"),
      gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, todayStart()),
      or(lt(calls.duration, 30), isNull(calls.duration))!
    )).orderBy(desc(calls.callTimestamp));
    return rows.map((r) => ({
      id: `mc-${r.id}`, contactName: r.contactName ?? "Unknown", contactPhone: r.contactPhone ?? "",
      callTimestamp: r.callTimestamp, ghlContactId: r.ghlContactId,
    }));
  }),

  getAppointments: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user!.tenantId;
    const rows = await db.select().from(dailyKpiEntries).where(and(
      eq(dailyKpiEntries.tenantId, tid), eq(dailyKpiEntries.date, todayStr()),
      eq(dailyKpiEntries.kpiType, "appointment")
    )).orderBy(dailyKpiEntries.createdAt);
    return rows.map((r) => ({
      id: String(r.id), time: r.notes ?? "", name: r.contactName ?? "Unknown",
      type: "Appointment", status: "upcoming" as const,
    }));
  }),

  getTasks: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user!.tenantId;
    const uid = ctx.user!.userId;
    const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const taskRows = await db.select().from(dailyKpiEntries).where(and(
      eq(dailyKpiEntries.tenantId, tid), eq(dailyKpiEntries.userId, uid),
      eq(dailyKpiEntries.date, todayStr()), like(dailyKpiEntries.kpiType, "task%")
    )).orderBy(dailyKpiEntries.createdAt);
    const [alertResult] = await db.select({ count: count() }).from(dispoProperties).where(and(
      eq(dispoProperties.tenantId, tid),
      or(isNull(dispoProperties.lastContactedAt), lt(dispoProperties.lastContactedAt, twoDaysAgo))!
    ));
    return {
      tasks: taskRows.map((r) => ({
        id: String(r.id), title: r.notes ?? r.kpiType, contact: r.contactName ?? "", due: "",
      })),
      propertyAlerts: alertResult?.count ?? 0,
    };
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const tid = ctx.user!.tenantId;
    const uid = ctx.user!.userId;
    const start = todayStart();
    const date = todayStr();
    const [callsResult] = await db.select({ count: count() }).from(calls)
      .where(and(eq(calls.tenantId, tid), gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, start)));
    const [propertyResult] = await db.select({ count: count() }).from(dispoProperties)
      .where(eq(dispoProperties.tenantId, tid));
    const [tasksResult] = await db.select({ count: count() }).from(dailyKpiEntries).where(and(
      eq(dailyKpiEntries.tenantId, tid), eq(dailyKpiEntries.userId, uid),
      eq(dailyKpiEntries.date, date), like(dailyKpiEntries.kpiType, "task%")
    ));
    return {
      callsToday: callsResult?.count ?? 0,
      propertyCount: propertyResult?.count ?? 0,
      tasksToday: tasksResult?.count ?? 0,
    };
  }),
});
