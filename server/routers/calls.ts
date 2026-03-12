import { z } from "zod";
import { eq, and, desc, sql, ne, count, asc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { chatCompletion } from "../_core/llm";
import { calls, callGrades, callNextSteps, aiFeedback, callFeedback } from "../../drizzle/schema";
import {
  getTenantPlaybook,
  getIndustryPlaybook,
  resolveStages,
  resolveCallTypes,
  resolveOutcomeTypes,
} from "../services/playbooks";

/**
 * Standalone function — called from grading pipeline after a call is graded.
 * Also exposed as a tRPC mutation for manual re-generation.
 */
export async function generateNextStepsForCall(callId: number, tenantId: number) {
  // Load call + grade
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
  if (!call?.transcript) return [];

  const [grade] = await db.select().from(callGrades).where(and(eq(callGrades.callId, callId), eq(callGrades.tenantId, tenantId)));
  if (!grade) return [];

  // Idempotent — if pending steps already exist, return them
  const existing = await db.select().from(callNextSteps)
    .where(and(eq(callNextSteps.callId, callId), eq(callNextSteps.status, "pending")))
    .orderBy(callNextSteps.createdAt);
  if (existing.length > 0) return existing;

  // Load playbook context for stage names and outcome labels
  const tenantPb = await getTenantPlaybook(tenantId);
  const industryPb = await getIndustryPlaybook(tenantPb?.industryCode ?? "default");
  const stages = resolveStages(industryPb, tenantPb);
  const callTypes = resolveCallTypes(industryPb);
  const outcomeTypes = resolveOutcomeTypes(industryPb);

  // Load custom next-step rules from tenant config if any
  let customRules = "";
  if (tenantPb) {
    const raw = tenantPb as unknown as Record<string, unknown>;
    const customConfig = raw.customConfig as Record<string, unknown> | undefined;
    if (customConfig?.customNextStepsRules && typeof customConfig.customNextStepsRules === "string") {
      customRules = `\n\nCustom rules from tenant:\n${customConfig.customNextStepsRules}`;
    }
  }

  const stageNames = stages.map((s) => `${s.code}: ${s.name}`).join(", ");
  const callTypeNames = callTypes.map((ct) => `${ct.code}: ${ct.name}`).join(", ");
  const outcomeList = outcomeTypes.join(", ");

  const systemPrompt = `You are a sales operations AI. Given a graded call, suggest next steps the rep should take. Return valid JSON only, no markdown.

Available stages: ${stageNames}
Available call types: ${callTypeNames}
Available outcomes: ${outcomeList}

Always suggest an "Add Note" action summarizing key call takeaways.
Conditionally suggest other actions based on call content and outcome:
- "task" for follow-up reminders
- "stage_change" if the call outcome warrants advancing the pipeline stage
- "sms" for follow-up text messages
- "appointment" if the seller agreed to a walkthrough or meeting
Only suggest actions that are warranted by the actual call content.${customRules}`;

  const summary = grade.summary ?? "";
  const redFlags = Array.isArray(grade.redFlags) ? (grade.redFlags as string[]).join("; ") : "";
  const improvements = Array.isArray(grade.improvements) ? (grade.improvements as string[]).join("; ") : "";

  const userPrompt = `Call details:
- Contact: ${call.contactName ?? "Unknown"}
- Property: ${call.propertyAddress ?? "N/A"}
- Call type: ${call.callType ?? "unknown"}
- Classification: ${call.classification ?? "pending"}
- Duration: ${call.duration ?? 0}s

Grading summary: ${summary}
Red flags: ${redFlags || "None"}
Areas for improvement: ${improvements || "None"}

Transcript excerpt (first 2000 chars):
${(call.transcript ?? "").slice(0, 2000)}

Return a JSON array of suggested next steps:
[{ "actionType": "note"|"task"|"stage_change"|"sms"|"appointment", "label": string, "reason": string, "editableContent": string, "payload": object }]

For "note": editableContent is the note text, payload = {}
For "task": editableContent is the task description, payload = { "dueDate": "YYYY-MM-DD" }
For "stage_change": editableContent is empty, payload = { "fromStage": string, "toStage": string }
For "sms": editableContent is the SMS body, payload = { "phone": string }
For "appointment": editableContent is the appointment description, payload = { "dateTime": string }`;

  const raw = await chatCompletion({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    temperature: 0.3,
    maxTokens: 2048,
  });

  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as Array<{
    actionType: string;
    label: string;
    reason: string;
    editableContent: string;
    payload: Record<string, unknown>;
  }>;

  const inserted = [];
  for (const step of parsed) {
    const [row] = await db.insert(callNextSteps).values({
      callId,
      tenantId,
      actionType: step.actionType,
      reason: step.reason,
      suggested: "true",
      payload: {
        ...step.payload,
        label: step.label,
        editableContent: step.editableContent,
      },
      status: "pending",
    }).returning();
    if (row) inserted.push(row);
  }

  return inserted;
}

export const callsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().optional().default(1),
        limit: z.number().optional().default(25),
        status: z.string().optional(),
        starred: z.boolean().optional(),
        dateFrom: z.string().optional(),
        callType: z.string().optional(),
        teamMemberId: z.number().optional(),
        classification: z.string().optional(),
        gradeMin: z.number().optional(),
        gradeMax: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      const offset = (input.page - 1) * input.limit;

      const conditions: ReturnType<typeof eq>[] = [
        eq(calls.tenantId, tenantId),
        ne(calls.isArchived, "true"),
      ];
      if (input.status) conditions.push(eq(calls.status, input.status));
      if (input.starred === true) conditions.push(eq(calls.isStarred, "true"));
      if (input.dateFrom) conditions.push(gte(calls.callTimestamp, new Date(input.dateFrom)));
      if (input.callType) conditions.push(eq(calls.callType, input.callType));
      if (input.teamMemberId) conditions.push(eq(calls.teamMemberId, input.teamMemberId));
      if (input.classification) conditions.push(eq(calls.classification, input.classification));

      // Grade range filters require a join condition
      const gradeConditions: ReturnType<typeof eq>[] = [];
      if (input.gradeMin != null) gradeConditions.push(gte(callGrades.overallScore, String(input.gradeMin)));
      if (input.gradeMax != null) gradeConditions.push(lte(callGrades.overallScore, String(input.gradeMax)));

      const allConditions = [...conditions, ...gradeConditions];

      const joinCondition = and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId));

      const [totalResult] = await db
        .select({ count: count() })
        .from(calls)
        .leftJoin(callGrades, joinCondition)
        .where(and(...allConditions));

      const rows = await db
        .select({
          call: calls,
          overallScore: callGrades.overallScore,
          summary: callGrades.summary,
        })
        .from(calls)
        .leftJoin(callGrades, joinCondition)
        .where(and(...allConditions))
        .orderBy(desc(calls.callTimestamp))
        .limit(input.limit)
        .offset(offset);

      const items = rows.map((r) => ({
        ...r.call,
        overallScore: r.overallScore ? Number(r.overallScore) : null,
        summary: r.summary ?? null,
      }));

      return {
        items,
        total: totalResult?.count ?? 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;

      const rows = await db
        .select({
          call: calls,
          grade: callGrades,
        })
        .from(calls)
        .leftJoin(callGrades, and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId)))
        .where(and(eq(calls.id, input.id), eq(calls.tenantId, tenantId)))
        .limit(1);

      const row = rows[0];
      if (!row || !row.call) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
      }

      const grade = row.grade
        ? {
            ...row.grade,
            overallScore: row.grade.overallScore ? Number(row.grade.overallScore) : null,
          }
        : null;

      return { ...row.call, grade };
    }),

  export: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user!.tenantId;

    const rows = await db
      .select({
        call: calls,
        overallScore: callGrades.overallScore,
      })
      .from(calls)
      .leftJoin(callGrades, and(eq(calls.id, callGrades.callId), eq(callGrades.tenantId, tenantId)))
      .where(and(eq(calls.tenantId, tenantId), ne(calls.isArchived, "true")))
      .orderBy(asc(calls.callTimestamp))
      .limit(5000);

    const header = "id,date,rep_name,call_type,score,duration_seconds,summary";
    const csvRows = rows.map((r) => {
      const date = r.call.callTimestamp ? new Date(r.call.callTimestamp).toISOString().split("T")[0] : "";
      const rep = (r.call.teamMemberName ?? "").replace(/"/g, '""');
      const callType = (r.call.callType ?? "").replace(/"/g, '""');
      const score = r.overallScore ? Number(r.overallScore) : "";
      const duration = r.call.duration ?? "";
      const summary = "";
      return `${r.call.id},"${date}","${rep}","${callType}",${score},${duration},"${summary}"`;
    });

    return { csv: [header, ...csvRows].join("\n") };
  }),

  toggleStar: protectedProcedure
    .input(z.object({ id: z.number(), starred: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      await db
        .update(calls)
        .set({ isStarred: input.starred ? "true" : "false", updatedAt: new Date() })
        .where(and(eq(calls.id, input.id), eq(calls.tenantId, tenantId)));
      return { success: true };
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user!.tenantId;

    const [totalResult] = await db
      .select({ count: count() })
      .from(calls)
      .where(and(eq(calls.tenantId, tenantId), ne(calls.isArchived, "true")));

    const [gradedResult] = await db
      .select({ count: count() })
      .from(callGrades)
      .where(eq(callGrades.tenantId, tenantId));

    const [avgResult] = await db
      .select({ avg: sql<string>`COALESCE(AVG(${callGrades.overallScore})::numeric, 0)` })
      .from(callGrades)
      .where(eq(callGrades.tenantId, tenantId));

    return {
      total: totalResult?.count ?? 0,
      graded: gradedResult?.count ?? 0,
      avgScore: avgResult?.avg ? Number(avgResult.avg) : 0,
    };
  }),

  regrade: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      if (ctx.user!.role !== "admin" && ctx.user!.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can re-grade calls" });
      }
      // Delete existing grade so the grading pipeline picks it up
      await db
        .delete(callGrades)
        .where(and(eq(callGrades.callId, input.id), eq(callGrades.tenantId, tenantId)));
      // Reset call status to pending
      await db
        .update(calls)
        .set({ status: "pending", updatedAt: new Date() })
        .where(and(eq(calls.id, input.id), eq(calls.tenantId, tenantId)));
      return { success: true };
    }),

  generateNextSteps: protectedProcedure
    .input(z.object({ callId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return generateNextStepsForCall(input.callId, ctx.user!.tenantId);
    }),

  getNextSteps: protectedProcedure
    .input(z.object({ callId: z.number() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      // Verify call belongs to tenant
      const [call] = await db.select({ id: calls.id }).from(calls)
        .where(and(eq(calls.id, input.callId), eq(calls.tenantId, tenantId))).limit(1);
      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      return db.select().from(callNextSteps)
        .where(and(eq(callNextSteps.callId, input.callId), eq(callNextSteps.tenantId, tenantId)))
        .orderBy(callNextSteps.createdAt);
    }),

  updateNextStep: protectedProcedure
    .input(z.object({
      id: z.number(),
      editableContent: z.string().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      const [existing] = await db.select().from(callNextSteps)
        .where(and(eq(callNextSteps.id, input.id), eq(callNextSteps.tenantId, tenantId)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Next step not found" });

      const currentPayload = (existing.payload ?? {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (input.editableContent !== undefined) {
        updates.payload = { ...currentPayload, editableContent: input.editableContent, ...(input.payload ?? {}) };
      } else if (input.payload !== undefined) {
        updates.payload = { ...currentPayload, ...input.payload };
      }
      if (input.status !== undefined) updates.status = input.status;

      const [updated] = await db.update(callNextSteps)
        .set(updates as typeof callNextSteps.$inferInsert)
        .where(eq(callNextSteps.id, input.id))
        .returning();
      return updated ?? null;
    }),

  addManualNextStep: protectedProcedure
    .input(z.object({
      callId: z.number(),
      actionType: z.string(),
      editableContent: z.string(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      // Verify call belongs to tenant
      const [call] = await db.select({ id: calls.id }).from(calls)
        .where(and(eq(calls.id, input.callId), eq(calls.tenantId, tenantId))).limit(1);
      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      const [row] = await db.insert(callNextSteps).values({
        callId: input.callId,
        tenantId,
        actionType: input.actionType,
        reason: "Manually added by user",
        suggested: "false",
        payload: {
          ...(input.payload ?? {}),
          editableContent: input.editableContent,
        },
        status: "pending",
      }).returning();
      return row ?? null;
    }),

  submitFeedback: protectedProcedure
    .input(z.object({
      callId: z.number(),
      feedbackType: z.string(),
      criteriaName: z.string().optional(),
      originalScore: z.number().optional(),
      suggestedScore: z.number().optional(),
      suggestedGrade: z.string().optional(),
      explanation: z.string(),
      correctBehavior: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;
      const userId = ctx.user!.userId;

      // Verify call belongs to tenant
      const [call] = await db.select({ id: calls.id }).from(calls)
        .where(and(eq(calls.id, input.callId), eq(calls.tenantId, tenantId))).limit(1);
      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      // Get existing grade for callGradeId
      const [grade] = await db.select({ id: callGrades.id, overallScore: callGrades.overallScore, overallGrade: callGrades.overallGrade })
        .from(callGrades)
        .where(and(eq(callGrades.callId, input.callId), eq(callGrades.tenantId, tenantId)))
        .limit(1);

      const [row] = await db.insert(aiFeedback).values({
        tenantId,
        callId: input.callId,
        callGradeId: grade?.id ?? null,
        userId,
        feedbackType: input.feedbackType,
        criteriaName: input.criteriaName ?? null,
        originalScore: input.originalScore != null ? String(input.originalScore) : (grade?.overallScore ?? null),
        originalGrade: grade?.overallGrade ?? null,
        suggestedScore: input.suggestedScore != null ? String(input.suggestedScore) : null,
        suggestedGrade: input.suggestedGrade ?? null,
        explanation: input.explanation,
        correctBehavior: input.correctBehavior ?? null,
        status: "pending",
      }).returning();

      return row ?? null;
    }),

  updateClassification: protectedProcedure
    .input(z.object({
      callId: z.number(),
      classification: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.tenantId;

      const [call] = await db.select({ id: calls.id }).from(calls)
        .where(and(eq(calls.id, input.callId), eq(calls.tenantId, tenantId))).limit(1);
      if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });

      await db.update(calls).set({
        classification: input.classification,
        classificationReason: input.reason ?? null,
        updatedAt: new Date(),
      }).where(eq(calls.id, input.callId));

      return { success: true };
    }),
});
