import { randomUUID } from "crypto";
import { z } from "zod";
import { eq, and, desc, gte, count, sql, like, or, isNull, lt } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { coachMessages, userInstructions, aiSuggestions, userEvents, callGrades, calls, teamMembers, dailyKpiEntries, dispoProperties, contactCache, userPlaybooks } from "../../drizzle/schema";
import { chatCompletion } from "../_core/llm";
import {
  getIndustryPlaybook,
  getTenantPlaybook,
  getUserPlaybook,
  resolveTerminology,
  SOFTWARE_PLAYBOOK,
  DEFAULT_TERMINOLOGY,
} from "../services/playbooks";
import { logger } from "../_core/logger";

const chatInput = z.object({
  message: z.string(),
  page: z.string(),
  pageContext: z.record(z.string(), z.unknown()).optional(),
});

export const aiRouter = router({
  chat: protectedProcedure.input(chatInput).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.user.tenantId;
    const userId = ctx.user.userId;
    const exchangeId = randomUUID();

    const history = await db
      .select()
      .from(coachMessages)
      .where(
        and(
          eq(coachMessages.tenantId, tenantId),
          eq(coachMessages.userId, userId)
        )
      )
      .orderBy(desc(coachMessages.createdAt))
      .limit(10);

    const instructions = await db
      .select()
      .from(userInstructions)
      .where(
        and(
          eq(userInstructions.userId, userId),
          eq(userInstructions.tenantId, tenantId),
          eq(userInstructions.isActive, "true")
        )
      );

    const userInstructionsText =
      instructions.length > 0
        ? `User preferences:\n${instructions.map((i) => `- ${i.instruction}`).join("\n")}`
        : "";

    const tenantPb = await getTenantPlaybook(tenantId);
    const industryPb = await getIndustryPlaybook(tenantPb?.industryCode ?? "");
    const userPb = await getUserPlaybook(userId, tenantId);
    // 2c: Use DEFAULT_TERMINOLOGY when industry playbook is null
    const terms = industryPb ? resolveTerminology(industryPb, tenantPb) : DEFAULT_TERMINOLOGY;

    // 2a: Add recent call grades to context
    const [userMemberForGrades] = await db.select({ id: teamMembers.id }).from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.tenantId, tenantId)))
      .limit(1);
    let recentGradesText = "";
    if (userMemberForGrades) {
      const recentGrades = await db
        .select({ callType: calls.callType, contactName: calls.contactName, overallGrade: callGrades.overallGrade, summary: callGrades.summary })
        .from(callGrades)
        .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
        .where(eq(calls.teamMemberId, userMemberForGrades.id))
        .orderBy(desc(callGrades.createdAt))
        .limit(5);
      if (recentGrades.length > 0) {
        recentGradesText = `Recent call grades: ${recentGrades.map((g) => `[${g.callType ?? "unknown"}] ${g.overallGrade ?? "?"} — ${(g.summary ?? "").slice(0, 80)}`).join("; ")}`;
      }
    }

    // 2e: Add weakCriteria to prompt
    let weakCriteriaText = "";
    if (userMemberForGrades) {
      const [pbRow] = await db.select({ weakCriteria: userPlaybooks.weakCriteria }).from(userPlaybooks)
        .where(and(eq(userPlaybooks.userId, userId), eq(userPlaybooks.tenantId, tenantId)))
        .limit(1);
      if (pbRow?.weakCriteria && typeof pbRow.weakCriteria === "object" && !Array.isArray(pbRow.weakCriteria)) {
        const weak = Object.keys(pbRow.weakCriteria as Record<string, unknown>);
        if (weak.length > 0) {
          weakCriteriaText = `This rep consistently scores low on: ${weak.join(", ")}. Focus coaching on these areas.`;
        }
      }
    }

    const playbookContext = [
      industryPb ? `Industry: ${industryPb.name}` : `Industry: General (using default terminology)`,
      `Terminology: ${terms.contact}/${terms.contactPlural}, ${terms.asset}/${terms.assetPlural}, ${terms.deal}/${terms.dealPlural}`,
      userPb?.role ? `User role: ${userPb.role}` : null,
      userPb?.strengths?.length ? `User strengths: ${userPb.strengths.join(", ")}` : null,
      userPb?.growthAreas?.length ? `Growth areas: ${userPb.growthAreas.join(", ")}` : null,
      userPb?.gradeTrend ? `Grade trend: ${userPb.gradeTrend}` : null,
      recentGradesText || null,
      weakCriteriaText || null,
    ].filter(Boolean).join("\n");

    // Build Day Hub context when on the Today page
    let dayHubContext = "";
    if (input.page === "today") {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayStartDt = new Date(); todayStartDt.setHours(0, 0, 0, 0);
      const amEnd = new Date(todayStr + "T12:00:00.000Z");
      const dayEnd = new Date(todayStr + "T23:59:59.999Z");

      // KPI stats
      const [callsResult] = await db.select({ count: count() }).from(calls)
        .where(and(eq(calls.tenantId, tenantId), gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, todayStartDt)));
      const [convosResult] = await db.select({ count: count() }).from(calls)
        .where(and(eq(calls.tenantId, tenantId), gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, todayStartDt), gte(calls.duration, 60)));

      // AM/PM call status for this user (per-user, not tenant-wide)
      const [userMember] = await db.select({ id: teamMembers.id }).from(teamMembers)
        .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.userId, userId)))
        .limit(1);
      const userTmId = userMember?.id ?? null;

      const amConds = [
        eq(calls.tenantId, tenantId),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, todayStartDt),
        sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) < ${amEnd}`,
        gte(calls.duration, 30),
      ];
      if (userTmId != null) amConds.push(eq(calls.teamMemberId, userTmId));
      const [amCall] = await db.select({ id: calls.id }).from(calls).where(and(...amConds)).limit(1);

      const pmConds = [
        eq(calls.tenantId, tenantId),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, amEnd),
        sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) <= ${dayEnd}`,
        gte(calls.duration, 30),
      ];
      if (userTmId != null) pmConds.push(eq(calls.teamMemberId, userTmId));
      const [pmCall] = await db.select({ id: calls.id }).from(calls).where(and(...pmConds)).limit(1);

      // Task count
      const [taskResult] = await db.select({ count: count() }).from(dailyKpiEntries).where(and(
        eq(dailyKpiEntries.tenantId, tenantId), eq(dailyKpiEntries.userId, userId),
        eq(dailyKpiEntries.date, todayStr), like(dailyKpiEntries.kpiType, "task%"),
      ));
      const [doneTaskResult] = await db.select({ count: count() }).from(dailyKpiEntries).where(and(
        eq(dailyKpiEntries.tenantId, tenantId), eq(dailyKpiEntries.userId, userId),
        eq(dailyKpiEntries.date, todayStr), like(dailyKpiEntries.kpiType, "task%"),
        like(dailyKpiEntries.notes, "[DONE]%"),
      ));

      // Missed calls
      const [missedResult] = await db.select({ count: count() }).from(calls).where(and(
        eq(calls.tenantId, tenantId), eq(calls.callDirection, "inbound"),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, todayStartDt),
        or(lt(calls.duration, 30), isNull(calls.duration))!,
      ));

      // Stale properties (no contact in 2 days)
      const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const [staleResult] = await db.select({ count: count() }).from(dispoProperties).where(and(
        eq(dispoProperties.tenantId, tenantId),
        or(isNull(dispoProperties.lastContactedAt), lt(dispoProperties.lastContactedAt, twoDaysAgo))!,
      ));

      // Unread conversations
      const [convoResult] = await db.select({ count: count() }).from(contactCache)
        .where(eq(contactCache.tenantId, tenantId));

      dayHubContext = `
--- DAY HUB SNAPSHOT ---
Date: ${todayStr}
Calls today: ${callsResult?.count ?? 0}
Conversations (60s+): ${convosResult?.count ?? 0}
AM call done: ${amCall ? "yes" : "no"}
PM call done: ${pmCall ? "yes" : "no"}
Tasks: ${doneTaskResult?.count ?? 0}/${taskResult?.count ?? 0} completed
Missed calls: ${missedResult?.count ?? 0}
Stale ${terms.assetPlural.toLowerCase()} (no contact 2+ days): ${staleResult?.count ?? 0}
Total contacts: ${convoResult?.count ?? 0}
--- END SNAPSHOT ---`;
    }

    // 2b: Add coachingTone from tenant playbook
    const coachingToneText = tenantPb?.coachingTone ? `\nYour coaching style should be ${tenantPb.coachingTone}.` : "";

    const systemPrompt = `You are the Gunner AI Coach — a consistent, persistent AI assistant.
You help ${ctx.user.name ?? "User"} (${ctx.user.role}) improve their performance.
You have access to their call grades, KPIs, and team context.
${playbookContext}
Current page: ${input.page}
${dayHubContext}
${input.pageContext ? `Page context: ${JSON.stringify(input.pageContext)}` : ""}
${userInstructionsText}${coachingToneText}
Use the correct terminology for this team's industry. Be direct, actionable, and encouraging. Never be generic.`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const m of [...history].reverse()) {
      const role = m.role === "user" ? "user" : "assistant";
      messages.push({ role, content: m.content });
    }
    messages.push({ role: "user", content: input.message });

    await db.insert(coachMessages).values({
      tenantId,
      userId,
      role: "user",
      content: input.message,
      exchangeId,
    });

    const response = await chatCompletion({ messages });

    await db.insert(coachMessages).values({
      tenantId,
      userId,
      role: "assistant",
      content: response,
      exchangeId,
    });

    return { response, exchangeId };
  }),

  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(coachMessages)
        .where(
          and(
            eq(coachMessages.tenantId, ctx.user.tenantId),
            eq(coachMessages.userId, ctx.user.userId)
          )
        )
        .orderBy(desc(coachMessages.createdAt))
        .limit(input.limit);
      return rows;
    }),

  saveInstruction: protectedProcedure
    .input(
      z.object({
        instruction: z.string(),
        category: z.string().optional().default("general"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const userId = ctx.user.userId;

      // Deactivate stale instructions in the same category
      await db
        .update(userInstructions)
        .set({ isActive: "false", updatedAt: new Date() })
        .where(
          and(
            eq(userInstructions.userId, userId),
            eq(userInstructions.tenantId, tenantId),
            eq(userInstructions.category, input.category),
            eq(userInstructions.isActive, "true")
          )
        );

      const [row] = await db
        .insert(userInstructions)
        .values({
          tenantId,
          userId,
          instruction: input.instruction,
          category: input.category,
          isActive: "true",
        })
        .returning();
      if (!row) throw new Error("Failed to save instruction");
      return row;
    }),

  getSuggestions: protectedProcedure.query(async ({ ctx }) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(aiSuggestions)
      .where(
        and(
          eq(aiSuggestions.userId, ctx.user.userId),
          eq(aiSuggestions.tenantId, ctx.user.tenantId),
          eq(aiSuggestions.status, "shown"),
          gte(aiSuggestions.createdAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(aiSuggestions.createdAt))
      .limit(5);
    return rows;
  }),

  generateSuggestions: protectedProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId;
    const userId = ctx.user.userId;
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Get the user's team member record
    const [member] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.tenantId, tenantId)))
      .limit(1);

    // Get recent performance
    const recentGrades = member
      ? await db
          .select({ overallScore: callGrades.overallScore })
          .from(callGrades)
          .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
          .where(and(eq(calls.teamMemberId, member.id), gte(callGrades.createdAt, fourteenDaysAgo)))
      : [];

    const count = recentGrades.length;
    const avgScore =
      count > 0
        ? recentGrades.reduce((s, r) => s + parseFloat(String(r.overallScore ?? 0)), 0) / count
        : 0;

    // Get user playbook context + industry context
    const userPbSugg = await getUserPlaybook(userId, tenantId);
    const gradeTrend = userPbSugg?.gradeTrend ?? "stable";
    const growthAreas = userPbSugg?.growthAreas?.length ? (userPbSugg.growthAreas as string[]).join(", ") : "not yet identified";

    // 3a: Add industry name and terminology
    const tenantPbSugg = await getTenantPlaybook(tenantId);
    const industryPbSugg = await getIndustryPlaybook(tenantPbSugg?.industryCode ?? "");
    const termsSugg = industryPbSugg ? resolveTerminology(industryPbSugg, tenantPbSugg) : DEFAULT_TERMINOLOGY;
    const industryName = industryPbSugg?.name ?? "sales";

    const prompt = `You are a ${industryName} coaching AI. Generate 2-3 proactive suggestions for this sales rep.
Use these terms: ${termsSugg.contact} for customers, ${termsSugg.asset} for assets, ${termsSugg.deal} for deals.

User context:
- Recent calls graded: ${count} calls in last 14 days
- Avg score: ${avgScore.toFixed(1)}%
- Grade trend: ${gradeTrend}
- Key growth areas: ${growthAreas}

Return JSON array only:
[
  {
    "suggestionType": "coaching_tip" | "action_reminder" | "practice_drill",
    "content": "The actionable suggestion (1-2 sentences, direct)",
    "reasoning": "Why this matters for them (1 sentence)"
  }
]
Generate 2-3 items. Be specific, not generic.`;

    const raw = await chatCompletion({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `You are a ${industryName} coaching AI. Return valid JSON array only.` },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      maxTokens: 512,
    });

    let parsed: Array<{
      suggestionType: string;
      content: string;
      reasoning: string;
    }>;
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      logger.error("[ai] suggestions parse failed", { userId, raw: raw.slice(0, 200) });
      return [];
    }

    const inserted = [];
    for (const s of parsed) {
      const [row] = await db
        .insert(aiSuggestions)
        .values({
          tenantId,
          userId,
          suggestionType: s.suggestionType,
          content: s.content,
          reasoning: s.reasoning,
          confidence: "high",
          status: "shown",
        })
        .returning();
      if (row) inserted.push(row);
    }
    return inserted;
  }),

  reactToSuggestion: protectedProcedure
    .input(z.object({ id: z.number(), reaction: z.enum(["dismissed", "accepted", "acted_on"]) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(aiSuggestions)
        .set({ status: input.reaction, reactedAt: new Date() })
        .where(
          and(
            eq(aiSuggestions.id, input.id),
            eq(aiSuggestions.userId, ctx.user.userId),
            eq(aiSuggestions.tenantId, ctx.user.tenantId)
          )
        )
        .returning();
      return row ?? null;
    }),

  trackEvent: protectedProcedure
    .input(
      z.object({
        eventType: z.string(),
        page: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.insert(userEvents).values({
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId,
        eventType: input.eventType,
        page: input.page ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
        source: "user",
      });
      return { ok: true };
    }),
});
