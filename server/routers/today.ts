import { z } from "zod";
import { eq, and, desc, gte, count, or, ilike, lt, isNull, like, sql, ne, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { calls, callGrades, contactCache, dispoProperties, dailyKpiEntries, teamMembers } from "../../drizzle/schema";

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const todayStr = () => new Date().toISOString().slice(0, 10);

// KPI types and their default daily targets
const DEFAULT_KPI_TARGETS: Record<string, number> = {
  calls: 50,
  convos: 20,
  apts: 3,
  offers: 2,
  contracts: 1,
};

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

  completeTask: protectedProcedure
    .input(z.object({ id: z.number(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const uid = ctx.user!.userId;
      const [existing] = await db.select().from(dailyKpiEntries)
        .where(and(eq(dailyKpiEntries.id, input.id), eq(dailyKpiEntries.tenantId, tid), eq(dailyKpiEntries.userId, uid)))
        .limit(1);
      if (!existing) return null;
      const notes = existing.notes ?? "";
      const newNotes = input.completed
        ? (notes.startsWith("[DONE] ") ? notes : `[DONE] ${notes}`)
        : notes.replace(/^\[DONE\] /, "");
      const [row] = await db
        .update(dailyKpiEntries)
        .set({ notes: newNotes })
        .where(eq(dailyKpiEntries.id, input.id))
        .returning();
      return row ?? null;
    }),

  getContactContext: protectedProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const rows = await db.select({
        id: calls.id,
        contactName: calls.contactName,
        grade: callGrades.overallGrade,
        duration: calls.duration,
        createdAt: calls.createdAt,
      }).from(calls)
        .leftJoin(callGrades, eq(callGrades.callId, calls.id))
        .where(and(eq(calls.tenantId, tid), eq(calls.contactPhone, input.phone)))
        .orderBy(desc(calls.createdAt))
        .limit(3);
      return rows.map((r) => ({
        id: r.id,
        contactName: r.contactName ?? "Unknown",
        grade: r.grade ?? null,
        duration: r.duration ?? null,
        createdAt: r.createdAt,
      }));
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

  getDayHubStats: protectedProcedure
    .input(z.object({ role: z.string().optional(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const date = input.date ?? todayStr();
      const start = new Date(date + "T00:00:00.000Z");

      // Get team member IDs scoped to the selected role tab
      let scopedUserIds: number[] | null = null;
      if (input.role && input.role !== "admin") {
        const members = await db.select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(and(eq(teamMembers.tenantId, tid), eq(teamMembers.teamRole, input.role), eq(teamMembers.isActive, "true")));
        scopedUserIds = members.map((m) => m.userId).filter((id): id is number => id !== null);
      }

      // calls: any call today for this tenant (scoped by role if set)
      const callsWhere = [eq(calls.tenantId, tid), gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, start)];
      const [callsResult] = await db.select({ count: count() }).from(calls).where(and(...callsWhere));

      // convos: calls with duration >= 60s
      const convosWhere = [...callsWhere, gte(calls.duration, 60)];
      const [convosResult] = await db.select({ count: count() }).from(calls).where(and(...convosWhere));

      // apts, offers, contracts: from daily_kpi_entries
      const kpiTypes = ["apts", "offers", "contracts"];
      const kpiCounts: Record<string, number> = {};
      for (const kpiType of kpiTypes) {
        const conditions = [eq(dailyKpiEntries.tenantId, tid), eq(dailyKpiEntries.date, date), eq(dailyKpiEntries.kpiType, kpiType)];
        if (scopedUserIds && scopedUserIds.length > 0) {
          conditions.push(inArray(dailyKpiEntries.userId, scopedUserIds));
        }
        const [res] = await db.select({ count: count() }).from(dailyKpiEntries).where(and(...conditions));
        kpiCounts[kpiType] = res?.count ?? 0;
      }

      return {
        calls: { actual: callsResult?.count ?? 0, target: DEFAULT_KPI_TARGETS.calls },
        convos: { actual: convosResult?.count ?? 0, target: DEFAULT_KPI_TARGETS.convos },
        apts: { actual: kpiCounts.apts ?? 0, target: DEFAULT_KPI_TARGETS.apts },
        offers: { actual: kpiCounts.offers ?? 0, target: DEFAULT_KPI_TARGETS.offers },
        contracts: { actual: kpiCounts.contracts ?? 0, target: DEFAULT_KPI_TARGETS.contracts },
      };
    }),

  getKpiLedger: protectedProcedure
    .input(z.object({ kpiType: z.string(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const date = input.date ?? todayStr();
      const start = new Date(date + "T00:00:00.000Z");
      const end = new Date(date + "T23:59:59.999Z");

      let autoEntries: { id: string; time: string; contactName: string; assignedTo: string | null; duration: number | null; grade: string | null; source: string }[] = [];

      if (input.kpiType === "calls" || input.kpiType === "convos") {
        const minDuration = input.kpiType === "convos" ? 60 : 0;
        const rows = await db.select({
          id: calls.id,
          contactName: calls.contactName,
          duration: calls.duration,
          callTimestamp: calls.callTimestamp,
          createdAt: calls.createdAt,
          grade: callGrades.overallGrade,
          teamMemberName: calls.teamMemberName,
        }).from(calls)
          .leftJoin(callGrades, eq(callGrades.callId, calls.id))
          .where(and(
            eq(calls.tenantId, tid),
            gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, start),
            sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) <= ${end}`,
            gte(calls.duration, minDuration),
          ))
          .orderBy(desc(calls.callTimestamp));
        autoEntries = rows.map((r) => ({
          id: `call-${r.id}`,
          time: (r.callTimestamp ?? r.createdAt).toISOString(),
          contactName: r.contactName ?? "Unknown",
          assignedTo: r.teamMemberName ?? null,
          duration: r.duration ?? null,
          grade: r.grade ?? null,
          source: "auto",
        }));
      } else {
        const rows = await db.select().from(dailyKpiEntries).where(and(
          eq(dailyKpiEntries.tenantId, tid),
          eq(dailyKpiEntries.date, date),
          eq(dailyKpiEntries.kpiType, input.kpiType),
          ne(dailyKpiEntries.source, "manual"),
        )).orderBy(desc(dailyKpiEntries.createdAt));
        autoEntries = rows.map((r) => ({
          id: `kpi-${r.id}`,
          time: r.createdAt.toISOString(),
          contactName: r.contactName ?? "Unknown",
          assignedTo: null,
          duration: null,
          grade: null,
          source: r.source,
        }));
      }

      const manualRows = await db.select().from(dailyKpiEntries).where(and(
        eq(dailyKpiEntries.tenantId, tid),
        eq(dailyKpiEntries.date, date),
        eq(dailyKpiEntries.kpiType, input.kpiType),
        eq(dailyKpiEntries.source, "manual"),
      )).orderBy(desc(dailyKpiEntries.createdAt));

      const manualEntries = manualRows.map((r) => ({
        id: `manual-${r.id}`,
        time: r.createdAt.toISOString(),
        contactName: r.contactName ?? "Unknown",
        assignedTo: null,
        duration: null,
        grade: null,
        notes: r.notes ?? null,
        source: "manual",
      }));

      return { autoEntries, manualEntries };
    }),

  addManualKpiEntry: protectedProcedure
    .input(z.object({
      kpiType: z.string(),
      date: z.string().optional(),
      contactName: z.string().optional(),
      contactId: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const uid = ctx.user!.userId;
      const [row] = await db.insert(dailyKpiEntries).values({
        tenantId: tid,
        userId: uid,
        date: input.date ?? todayStr(),
        kpiType: input.kpiType,
        contactName: input.contactName ?? null,
        contactId: input.contactId ?? null,
        notes: input.notes ?? null,
        source: "manual",
        detectionType: "manual",
      }).returning();
      return row ?? null;
    }),

  getAmPmCallStatus: protectedProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const uid = ctx.user!.userId;
      const date = input.date ?? todayStr();
      const amEnd = new Date(date + "T12:00:00.000Z");
      const dayStart = new Date(date + "T00:00:00.000Z");
      const dayEnd = new Date(date + "T23:59:59.999Z");

      const [amCall] = await db.select({ id: calls.id }).from(calls).where(and(
        eq(calls.tenantId, tid),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, dayStart),
        sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) < ${amEnd}`,
        gte(calls.duration, 30),
      )).limit(1);

      const [pmCall] = await db.select({ id: calls.id }).from(calls).where(and(
        eq(calls.tenantId, tid),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, amEnd),
        sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) <= ${dayEnd}`,
        gte(calls.duration, 30),
      )).limit(1);

      const [manualAm] = await db.select({ id: dailyKpiEntries.id }).from(dailyKpiEntries).where(and(
        eq(dailyKpiEntries.tenantId, tid),
        eq(dailyKpiEntries.userId, uid),
        eq(dailyKpiEntries.date, date),
        eq(dailyKpiEntries.kpiType, "am_call"),
      )).limit(1);

      const [manualPm] = await db.select({ id: dailyKpiEntries.id }).from(dailyKpiEntries).where(and(
        eq(dailyKpiEntries.tenantId, tid),
        eq(dailyKpiEntries.userId, uid),
        eq(dailyKpiEntries.date, date),
        eq(dailyKpiEntries.kpiType, "pm_call"),
      )).limit(1);

      return {
        amDone: !!(amCall ?? manualAm),
        pmDone: !!(pmCall ?? manualPm),
      };
    }),
});
