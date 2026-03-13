import { randomUUID } from "crypto";
import { z } from "zod";
import { eq, and, desc, gte, count, sql, like, or, isNull, lt } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { coachMessages, userInstructions, aiSuggestions, userEvents, callGrades, calls, teamMembers, dailyKpiEntries, dispoProperties, contactCache } from "../../drizzle/schema";
import { chatCompletion } from "../_core/llm";
import {
  getIndustryPlaybook,
  getTenantPlaybook,
  getUserPlaybook,
  resolveTerminology,
} from "../services/playbooks";

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
    const industryPb = await getIndustryPlaybook(tenantPb?.industryCode ?? "default");
    const userPb = await getUserPlaybook(userId, tenantId);
    const terms = resolveTerminology(industryPb, tenantPb);

    const playbookContext = [
      industryPb ? `Industry: ${industryPb.name}` : null,
      terms ? `Terminology: ${terms.contact}/${terms.contactPlural}, ${terms.asset}/${terms.assetPlural}, ${terms.deal}/${terms.dealPlural}` : null,
      userPb?.role ? `User role: ${userPb.role}` : null,
      userPb?.strengths?.length ? `User strengths: ${userPb.strengths.join(", ")}` : null,
      userPb?.growthAreas?.length ? `Growth areas: ${userPb.growthAreas.join(", ")}` : null,
      userPb?.gradeTrend ? `Grade trend: ${userPb.gradeTrend}` : null,
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

      // AM/PM call status for this user
      const [amCall] = await db.select({ id: calls.id }).from(calls).where(and(
        eq(calls.tenantId, tenantId),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, todayStartDt),
        sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) < ${amEnd}`,
        gte(calls.duration, 30),
      )).limit(1);
      const [pmCall] = await db.select({ id: calls.id }).from(calls).where(and(
        eq(calls.tenantId, tenantId),
        gte(sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt})`, amEnd),
        sql`COALESCE(${calls.callTimestamp}, ${calls.createdAt}) <= ${dayEnd}`,
        gte(calls.duration, 30),
      )).limit(1);

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
Stale properties (no contact 2+ days): ${staleResult?.count ?? 0}
Total contacts: ${convoResult?.count ?? 0}
--- END SNAPSHOT ---`;
    }

    const systemPrompt = `You are the Gunner AI Coach — a consistent, persistent AI assistant.
You help ${ctx.user.name ?? "User"} (${ctx.user.role}) improve their performance.
You have access to their call grades, KPIs, and team context.
${playbookContext}
Current page: ${input.page}
${dayHubContext}
${input.pageContext ? `Page context: ${JSON.stringify(input.pageContext)}` : ""}
${userInstructionsText}
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

    // Get user playbook context
    const userPb = await getUserPlaybook(userId, tenantId);
    const gradeTrend = userPb?.gradeTrend ?? "stable";
    const growthAreas = userPb?.growthAreas?.length ? (userPb.growthAreas as string[]).join(", ") : "not yet identified";

    const prompt = `You are a sales coaching AI. Generate 2-3 proactive suggestions for this sales rep.

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
        { role: "system", content: "You are a sales coaching AI. Return valid JSON array only." },
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
      console.error(`[ai-suggestions] JSON parse failed for user ${userId}. Raw output: ${raw.slice(0, 500)}`);
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
