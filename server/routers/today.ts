import { z } from "zod";
import { eq, and, desc, gte, count, or, ilike, lt, isNull, like, sql, ne, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { calls, callGrades, contactCache, dispoProperties, dailyKpiEntries, teamMembers, tenants, demoConversations, demoTasks } from "../../drizzle/schema";
import { GhlAdapter } from "../crm/ghl/ghlAdapter";
import { refreshGhlToken, saveGhlTokens } from "../services/ghlOAuth";
import { getTenantPlaybook, getIndustryPlaybook, resolveAlgorithmConfig } from "../services/playbooks";

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const todayStr = () => new Date().toISOString().slice(0, 10);

// Fallback KPI targets (used when tenant playbook has no overrides)
const DEFAULT_KPI_TARGETS: Record<string, number> = {
  calls: 50,
  convos: 20,
  apts: 3,
  offers: 2,
  contracts: 1,
};

/**
 * Returns a GhlAdapter with a fresh access token for the given tenant,
 * or null if no CRM is connected.
 */
async function getCrmAdapterForTenant(tenantId: number): Promise<GhlAdapter | null> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.crmConfig || tenant.crmType !== "ghl") return null;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(tenant.crmConfig) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!config.oauthConnected || !config.accessToken || !config.locationId) return null;

  let accessToken = String(config.accessToken);
  const locationId = String(config.locationId);

  // Refresh token if it expires within 5 minutes
  const expiresAt = config.tokenExpiresAt ? new Date(String(config.tokenExpiresAt)).getTime() : 0;
  const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
  if (expiresAt <= fiveMinFromNow && config.refreshToken) {
    try {
      const refreshed = await refreshGhlToken(String(config.refreshToken));
      await saveGhlTokens(tenantId, locationId, refreshed.access_token, refreshed.refresh_token, refreshed.expires_in);
      accessToken = refreshed.access_token;
    } catch (e) {
      console.error(`[today] Token refresh failed for tenant ${tenantId}:`, e);
      // Still try with current token — it might not be expired yet
    }
  }

  return new GhlAdapter({ apiKey: "", locationId, accessToken });
}

/**
 * Resolve KPI targets from tenant/industry playbook, falling back to defaults.
 */
async function resolveKpiTargets(tenantId: number): Promise<Record<string, number>> {
  const tenantPb = await getTenantPlaybook(tenantId);
  const industryPb = await getIndustryPlaybook(tenantPb?.industryCode ?? "default");
  const algorithmConfig = resolveAlgorithmConfig(industryPb, tenantPb);
  if (algorithmConfig.kpiTargets) {
    return { ...DEFAULT_KPI_TARGETS, ...algorithmConfig.kpiTargets };
  }
  return DEFAULT_KPI_TARGETS;
}

export const todayRouter = router({
  getConversations: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;

      // Check if tenant has live CRM — if not, use demo conversations
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tid));
      if (tenant?.crmConnected === "false") {
        const demoConds = [eq(demoConversations.tenantId, tid)];
        if (input.search?.trim()) {
          const term = `%${input.search.trim()}%`;
          demoConds.push(or(ilike(demoConversations.contactName, term), ilike(demoConversations.contactPhone, term))!);
        }
        const demoRows = await db.select().from(demoConversations)
          .where(and(...demoConds))
          .orderBy(desc(demoConversations.lastMessageDate))
          .limit(input.limit);
        return demoRows.map((r) => ({
          id: String(r.id),
          name: r.contactName ?? "Unknown",
          phone: r.contactPhone ?? "",
          ghlContactId: null as string | null,
          lastContactDate: r.lastMessageDate,
          lastMessageBody: r.lastMessageBody ?? null,
          unreadCount: r.unreadCount ?? 0,
          propertyAddress: null as string | null,
          teamMemberName: null as string | null,
        }));
      }

      const conditions = [eq(contactCache.tenantId, tid)];
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(or(ilike(contactCache.name, term), ilike(contactCache.phone, term))!);
      }

      // Phone-scope: non-admin users only see contacts matching their LC phone numbers
      const userRole = ctx.user!.role;
      if (userRole !== "admin" && userRole !== "owner") {
        const [member] = await db.select({ lcPhone: teamMembers.lcPhone, lcPhones: teamMembers.lcPhones })
          .from(teamMembers)
          .where(and(eq(teamMembers.tenantId, tid), eq(teamMembers.userId, ctx.user!.userId)))
          .limit(1);
        if (member) {
          const phones: string[] = [];
          if (member.lcPhone) phones.push(member.lcPhone);
          if (member.lcPhones) {
            try {
              const parsed = JSON.parse(member.lcPhones);
              if (Array.isArray(parsed)) phones.push(...parsed.filter((p: unknown) => typeof p === "string" && p));
            } catch { /* ignore parse errors */ }
          }
          const uniquePhones = Array.from(new Set(phones));
          if (uniquePhones.length > 0) {
            conditions.push(inArray(contactCache.phone, uniquePhones));
          }
        }
      }

      const rows = await db.select({
        id: contactCache.id, name: contactCache.name, phone: contactCache.phone,
        ghlContactId: contactCache.ghlContactId, lastContactDate: contactCache.lastContactDate,
        propertyAddress: dispoProperties.address,
        teamMemberName: calls.teamMemberName,
      }).from(contactCache)
        .leftJoin(dispoProperties, and(eq(dispoProperties.tenantId, tid), eq(dispoProperties.ghlContactId, contactCache.ghlContactId)))
        .leftJoin(calls, and(eq(calls.tenantId, tid), eq(calls.ghlContactId, contactCache.ghlContactId)))
        .where(and(...conditions))
        .orderBy(desc(contactCache.lastContactDate)).limit(input.limit);

      // Deduplicate by contactCache.id (joins may produce multiple rows)
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        const key = String(r.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return unique.map((r) => ({
        id: String(r.id), name: r.name ?? "Unknown", phone: r.phone ?? "",
        ghlContactId: r.ghlContactId, lastContactDate: r.lastContactDate,
        lastMessageBody: null as string | null,
        unreadCount: 0,
        propertyAddress: r.propertyAddress ?? null,
        teamMemberName: r.teamMemberName ?? null,
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

    // Check if tenant has live CRM — if not, use demo tasks
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tid));
    if (tenant?.crmConnected === "false") {
      const demoRows = await db.select().from(demoTasks)
        .where(eq(demoTasks.tenantId, tid));
      const [alertResult] = await db.select({ count: count() }).from(dispoProperties).where(and(
        eq(dispoProperties.tenantId, tid),
        or(isNull(dispoProperties.lastContactedAt), lt(dispoProperties.lastContactedAt, twoDaysAgo))!
      ));
      return {
        tasks: demoRows.map((r) => ({
          id: String(r.id),
          title: r.title ?? "",
          contact: r.contactName ?? "",
          due: r.dueDate ?? "",
          propertyAddress: r.propertyAddress ?? "",
          currentStage: r.currentStage ?? "",
          assignedTo: r.assignedTo ?? "",
          overdue: r.overdue ?? false,
          instructions: r.instructions ?? "",
        })),
        propertyAlerts: alertResult?.count ?? 0,
      };
    }

    const taskRows = await db.select().from(dailyKpiEntries).where(and(
      eq(dailyKpiEntries.tenantId, tid), eq(dailyKpiEntries.userId, uid),
      eq(dailyKpiEntries.date, todayStr()), like(dailyKpiEntries.kpiType, "task%")
    )).orderBy(dailyKpiEntries.createdAt);
    const [alertResult] = await db.select({ count: count() }).from(dispoProperties).where(and(
      eq(dispoProperties.tenantId, tid),
      or(isNull(dispoProperties.lastContactedAt), lt(dispoProperties.lastContactedAt, twoDaysAgo))!
    ));

    // Gather contact IDs from tasks to look up AM/PM call flags
    const contactIds = taskRows.map((r) => r.contactId).filter((c): c is string => !!c);
    const amPmMap = new Map<string, { amDone: boolean; pmDone: boolean }>();
    if (contactIds.length > 0) {
      const amEnd = new Date(todayStr() + "T12:00:00.000Z");
      const dayStart = todayStart();
      const dayEnd = new Date(todayStr() + "T23:59:59.999Z");
      for (const cid of Array.from(new Set(contactIds))) {
        const [am] = await db.select({ id: calls.id }).from(calls).where(and(
          eq(calls.tenantId, tid), eq(calls.ghlContactId, cid),
          gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, dayStart),
          sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) < ${amEnd}`,
          gte(calls.duration, 30),
        )).limit(1);
        const [pm] = await db.select({ id: calls.id }).from(calls).where(and(
          eq(calls.tenantId, tid), eq(calls.ghlContactId, cid),
          gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, amEnd),
          sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) <= ${dayEnd}`,
          gte(calls.duration, 30),
        )).limit(1);
        amPmMap.set(cid, { amDone: !!am, pmDone: !!pm });
      }
    }

    return {
      tasks: taskRows.map((r) => ({
        id: String(r.id),
        title: r.notes ?? r.kpiType,
        contact: r.contactName ?? "",
        due: "",
        crmTaskId: r.ghlReferenceId ?? null,
        amCallDone: r.contactId ? (amPmMap.get(r.contactId)?.amDone ?? false) : false,
        pmCallDone: r.contactId ? (amPmMap.get(r.contactId)?.pmDone ?? false) : false,
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

      // Also complete the task in the CRM if we have a reference ID
      if (input.completed && existing.ghlReferenceId) {
        const adapter = await getCrmAdapterForTenant(tid);
        if (adapter) {
          try {
            await adapter.completeTask(existing.ghlReferenceId);
          } catch (e) {
            console.error(`[completeTask] CRM update failed for task ${existing.ghlReferenceId}:`, e);
          }
        }
      }

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

  getContactActivity: protectedProcedure
    .input(z.object({ ghlContactId: z.string().optional(), contactPhone: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;

      // Check if tenant has live CRM
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tid));
      const isDemo = tenant?.crmConnected === "false";

      // Local call history for this contact
      const callConditions = [eq(calls.tenantId, tid)];
      if (input.ghlContactId) {
        callConditions.push(eq(calls.ghlContactId, input.ghlContactId));
      } else if (input.contactPhone) {
        callConditions.push(eq(calls.contactPhone, input.contactPhone));
      }

      const localCalls = await db.select({
        id: calls.id,
        contactName: calls.contactName,
        contactPhone: calls.contactPhone,
        callTimestamp: calls.callTimestamp,
        duration: calls.duration,
        grade: callGrades.overallGrade,
      }).from(calls)
        .leftJoin(callGrades, and(eq(callGrades.callId, calls.id), eq(callGrades.tenantId, tid)))
        .where(and(...callConditions))
        .orderBy(desc(calls.callTimestamp))
        .limit(10);

      // Messages: demo path reads from demoConversations, live path uses CRM adapter
      let crmMessages: Array<{ id: string; direction: string; body: string; timestamp: string; type: string }> = [];

      if (isDemo && input.contactPhone) {
        const [demoConv] = await db.select().from(demoConversations)
          .where(and(eq(demoConversations.tenantId, tid), eq(demoConversations.contactPhone, input.contactPhone)))
          .limit(1);
        if (demoConv?.messages && Array.isArray(demoConv.messages)) {
          crmMessages = (demoConv.messages as Array<{ direction: string; body: string; timestamp: string; senderName: string }>).map((m, i) => ({
            id: `demo-msg-${i}`,
            direction: m.direction,
            body: m.body,
            timestamp: m.timestamp,
            type: "sms",
          }));
        }
      } else if (!isDemo && input.ghlContactId) {
        const adapter = await getCrmAdapterForTenant(tid);
        if (adapter) {
          try {
            const conversation = await adapter.getConversation(input.ghlContactId);
            if (conversation) {
              crmMessages = conversation.messages.slice(0, 20);
            }
          } catch {
            // CRM unavailable — return local data only
          }
        }
      }

      return {
        calls: localCalls.map((r) => ({
          id: r.id,
          contactName: r.contactName ?? "Unknown",
          contactPhone: r.contactPhone ?? "",
          callTimestamp: r.callTimestamp,
          duration: r.duration ?? null,
          grade: r.grade ?? null,
        })),
        messages: crmMessages,
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

  getDayHubStats: protectedProcedure
    .input(z.object({ role: z.string().optional(), date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const tid = ctx.user!.tenantId;
      const date = input.date ?? todayStr();
      const start = new Date(date + "T00:00:00.000Z");

      // Get team member IDs scoped to the selected role tab
      let scopedUserIds: number[] | null = null;
      let scopedTeamMemberIds: number[] | null = null;
      if (input.role && input.role !== "admin") {
        const members = await db.select({ id: teamMembers.id, userId: teamMembers.userId })
          .from(teamMembers)
          .where(and(eq(teamMembers.tenantId, tid), eq(teamMembers.teamRole, input.role), eq(teamMembers.isActive, "true")));
        scopedUserIds = members.map((m) => m.userId).filter((id): id is number => id !== null);
        scopedTeamMemberIds = members.map((m) => m.id);
      }

      // If role is set but no team members found, return zeroes for calls/convos
      const roleHasNoMembers = scopedTeamMemberIds !== null && scopedTeamMemberIds.length === 0;

      // calls: any call today for this tenant (scoped by role if set)
      const callsWhere = [eq(calls.tenantId, tid), gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, start)];
      if (scopedTeamMemberIds && scopedTeamMemberIds.length > 0) {
        callsWhere.push(inArray(calls.teamMemberId, scopedTeamMemberIds));
      }
      const [callsResult] = roleHasNoMembers
        ? [{ count: 0 }]
        : await db.select({ count: count() }).from(calls).where(and(...callsWhere));

      // convos: calls with duration >= 60s
      const convosWhere = [...callsWhere, gte(calls.duration, 60)];
      const [convosResult] = roleHasNoMembers
        ? [{ count: 0 }]
        : await db.select({ count: count() }).from(calls).where(and(...convosWhere));

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

      const targets = await resolveKpiTargets(tid);

      return {
        calls: { actual: callsResult?.count ?? 0, target: targets.calls ?? DEFAULT_KPI_TARGETS.calls },
        convos: { actual: convosResult?.count ?? 0, target: targets.convos ?? DEFAULT_KPI_TARGETS.convos },
        apts: { actual: kpiCounts.apts ?? 0, target: targets.apts ?? DEFAULT_KPI_TARGETS.apts },
        offers: { actual: kpiCounts.offers ?? 0, target: targets.offers ?? DEFAULT_KPI_TARGETS.offers },
        contracts: { actual: kpiCounts.contracts ?? 0, target: targets.contracts ?? DEFAULT_KPI_TARGETS.contracts },
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
