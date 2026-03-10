import { randomUUID } from "crypto";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { coachMessages, userInstructions } from "../../drizzle/schema";
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

    const systemPrompt = `You are the Gunner AI Coach — a consistent, persistent AI assistant.
You help ${ctx.user.name ?? "User"} (${ctx.user.role}) improve their performance.
You have access to their call grades, KPIs, and team context.
${playbookContext}
Current page: ${input.page}
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
      const [row] = await db
        .insert(userInstructions)
        .values({
          userId: ctx.user.userId,
          instruction: input.instruction,
          category: input.category,
          isActive: "true",
        })
        .returning();
      if (!row) throw new Error("Failed to save instruction");
      return row;
    }),
});
