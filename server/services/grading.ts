import { db } from "../_core/db";
import { chatCompletion } from "../_core/llm";
import { calls, callGrades, tenantRubrics, teamMembers, userPlaybooks, aiFeedback } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { sendGradeAlert } from "./notifications";
import { processCallGamification } from "./gamification";
import { extractVoiceSample } from "./voiceSamples";
import { getTenantPlaybook, getIndustryPlaybook, resolveTerminology } from "./playbooks";
import { generateNextStepsForCall } from "./nextSteps";
import { logger } from "../_core/logger";
import type { RubricDef } from "../../shared/types";

// Generic software-level rubric — industry-agnostic fallback
const FALLBACK_CRITERIA: Array<{ name: string; maxPoints: number; description: string }> = [
  { name: "Introduction & Rapport", maxPoints: 15, description: "Clear introduction, builds connection with the prospect" },
  { name: "Active Listening", maxPoints: 20, description: "Asks open-ended questions, listens without interrupting" },
  { name: "Needs Discovery", maxPoints: 20, description: "Uncovers the prospect's situation, timeline, and motivation" },
  { name: "Objection Handling", maxPoints: 15, description: "Addresses concerns directly, reframes when appropriate" },
  { name: "Value Communication", maxPoints: 15, description: "Clearly explains how they can help the prospect" },
  { name: "Next Steps & Close", maxPoints: 15, description: "Sets clear expectations and secures commitment for next action" },
];

async function resolveRubricCriteria(
  tenantId: number,
  callType: string
): Promise<{
  criteria: Array<{ name: string; maxPoints: number; description: string }>;
  rubricType: string;
  tenantRubricId: number | null;
  criticalFailures: string[];
}> {
  const [tenantRow] = await db
    .select()
    .from(tenantRubrics)
    .where(and(eq(tenantRubrics.tenantId, tenantId), eq(tenantRubrics.callType, callType), eq(tenantRubrics.isActive, "true")));

  if (tenantRow?.criteria) {
    try {
      const parsed = JSON.parse(tenantRow.criteria) as Array<{ name: string; maxPoints: number; description: string }>;
      const flags = tenantRow.redFlags ? (JSON.parse(tenantRow.redFlags) as string[]) : [];
      return { criteria: parsed, rubricType: callType, tenantRubricId: tenantRow.id, criticalFailures: flags };
    } catch { /* fall through */ }
  }

  const tenantPb = await getTenantPlaybook(tenantId);
  if (tenantPb?.industryCode) {
    const industryPb = await getIndustryPlaybook(tenantPb.industryCode);
    if (industryPb?.rubrics?.length) {
      const match = industryPb.rubrics.find((r: RubricDef) => r.callType === callType)
        ?? industryPb.rubrics[0];
      if (match) {
        return {
          criteria: match.criteria,
          rubricType: match.id ?? callType,
          tenantRubricId: null,
          criticalFailures: match.criticalFailures ?? [],
        };
      }
    }
  }

  return { criteria: FALLBACK_CRITERIA, rubricType: callType, tenantRubricId: null, criticalFailures: [] };
}

export async function gradeCall(callId: number, tenantId: number) {
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
  if (!call?.transcript) throw new Error("Call not found or missing transcript");

  const callType = call.callType ?? null;
  if (callType === null) {
    logger.warn("[grading] call has no callType — using fallback", { callId: call.id, tenantId });
  }
  const { criteria, rubricType, tenantRubricId, criticalFailures } = callType
    ? await resolveRubricCriteria(tenantId, callType)
    : { criteria: FALLBACK_CRITERIA, rubricType: "fallback", tenantRubricId: null as number | null, criticalFailures: [] as string[] };

  const rubricText = criteria.map((c) => `- ${c.name} (${c.maxPoints} pts): ${c.description}`).join("\n");
  const failText = criticalFailures.length > 0
    ? `\n\nCritical failures (auto-cap at 50% if detected):\n${criticalFailures.map((f) => `- ${f}`).join("\n")}`
    : "";

  // Load grading philosophy from industry playbook
  const tenantPb = await getTenantPlaybook(tenantId);
  const industryPb = tenantPb?.industryCode ? await getIndustryPlaybook(tenantPb.industryCode) : null;
  const philosophy = industryPb?.gradingPhilosophy;

  // 1b: Look up role-specific philosophy by the rep's role, not callType
  let roleSpecificText = "";
  if (philosophy) {
    let repRole: string | null = null;
    if (call.teamMemberId) {
      const [member] = await db.select({ teamRole: teamMembers.teamRole }).from(teamMembers)
        .where(and(eq(teamMembers.id, call.teamMemberId), eq(teamMembers.tenantId, tenantId)))
        .limit(1);
      repRole = member?.teamRole ?? null;
    }
    if (repRole && philosophy.roleSpecific[repRole]) {
      roleSpecificText = `\nRole-specific guidance: ${philosophy.roleSpecific[repRole]}`;
    }
  }

  const philosophyText = philosophy
    ? `\n\nGrading philosophy:\n${philosophy.overview}\n\nCritical failure policy: ${philosophy.criticalFailurePolicy}\nTalk ratio guidance: ${philosophy.talkRatioGuidance}${roleSpecificText}`
    : "";

  // 1c: Inject tenant terminology into grading prompt
  const t = resolveTerminology(industryPb, tenantPb);
  const terminologyText = `\n\nIndustry terminology: use '${t.contact}' instead of 'prospect', '${t.asset}' instead of 'property', '${t.deal}' instead of 'deal', '${t.walkthrough}' instead of 'walkthrough'.`;

  // 1d: Inject user context (strengths, growth areas, grade trend) from user_playbooks
  let userContextText = "";
  if (call.teamMemberId) {
    const [member] = await db.select({ userId: teamMembers.userId }).from(teamMembers)
      .where(and(eq(teamMembers.id, call.teamMemberId), eq(teamMembers.tenantId, tenantId)))
      .limit(1);
    if (member?.userId) {
      const [userPb] = await db.select({ strengths: userPlaybooks.strengths, growthAreas: userPlaybooks.growthAreas, gradeTrend: userPlaybooks.gradeTrend })
        .from(userPlaybooks).where(eq(userPlaybooks.userId, member.userId)).limit(1);
      if (userPb) {
        const strengths = Array.isArray(userPb.strengths) ? (userPb.strengths as string[]).join(", ") : "not yet identified";
        const growthAreas = Array.isArray(userPb.growthAreas) ? (userPb.growthAreas as string[]).join(", ") : "not yet identified";
        const gradeTrend = userPb.gradeTrend ?? "stable";
        userContextText = `\n\nThis rep's recent strengths: ${strengths}. Growth areas to watch for: ${growthAreas}. Grade trend: ${gradeTrend}.`;
      }

      // 1e: Connect aiFeedback to grading — query last 5 calibration notes
      const feedbackRows = await db.select({ explanation: aiFeedback.explanation })
        .from(aiFeedback)
        .where(eq(aiFeedback.userId, member.userId))
        .orderBy(desc(aiFeedback.createdAt))
        .limit(5);
      if (feedbackRows.length > 0) {
        const notes = feedbackRows.map((f) => `- ${f.explanation}`).join("\n");
        userContextText += `\n\nPrevious grade calibration notes from supervisor:\n${notes}`;
      }
    }
  }

  const systemPrompt = `You are an expert sales call grading AI. Grade this call transcript against the provided rubric. Return valid JSON only, no markdown.${philosophyText}${terminologyText}`;
  const userPrompt = `Rubric criteria:\n${rubricText}${failText}${userContextText}\n\nTranscript:\n${call.transcript}\n\nReturn JSON: { "overallScore": number 0-100, "overallGrade": "A"|"B"|"C"|"D"|"F", "criteriaScores": [{ "name": string, "earned": number, "max": number, "explanation": string }], "strengths": [string], "improvements": [string], "coachingTips": [string], "redFlags": [string], "summary": string, "objectionHandling": [{ "objection": string, "context": string, "suggestedResponses": [string] }] }`;

  const raw = await chatCompletion({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    temperature: 0.2,
    maxTokens: 3000,
  });

  let parsed: {
    overallScore: number;
    overallGrade: string;
    criteriaScores: Array<{ name: string; earned: number; max: number; explanation: string }>;
    strengths: string[];
    improvements: string[];
    coachingTips: string[];
    redFlags: string[];
    summary: string;
    objectionHandling: Array<{ objection: string; context: string; suggestedResponses: string[] }>;
  };
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    logger.error("[grading] JSON parse failed", { callId, tenantId, raw: raw.slice(0, 200) });
    await db.update(calls).set({ status: "grade_failed", updatedAt: new Date() }).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
    return null;
  }

  // 1f: Populate rubricSnapshot with the criteria array sent to GPT
  const [grade] = await db
    .insert(callGrades)
    .values({
      tenantId,
      callId,
      overallScore: String(parsed.overallScore),
      overallGrade: parsed.overallGrade ?? null,
      criteriaScores: parsed.criteriaScores,
      strengths: parsed.strengths ?? [],
      improvements: parsed.improvements ?? [],
      coachingTips: parsed.coachingTips ?? [],
      redFlags: parsed.redFlags ?? [],
      objectionHandling: parsed.objectionHandling ?? [],
      summary: parsed.summary ?? "",
      rubricType,
      tenantRubricId,
      rubricSnapshot: criteria,
    })
    .onConflictDoUpdate({
      target: callGrades.callId,
      set: {
        overallScore: String(parsed.overallScore),
        overallGrade: parsed.overallGrade ?? null,
        criteriaScores: parsed.criteriaScores,
        strengths: parsed.strengths ?? [],
        improvements: parsed.improvements ?? [],
        coachingTips: parsed.coachingTips ?? [],
        redFlags: parsed.redFlags ?? [],
        objectionHandling: parsed.objectionHandling ?? [],
        summary: parsed.summary ?? "",
        rubricType,
        tenantRubricId,
        rubricSnapshot: criteria,
      },
    })
    .returning();

  await db.update(calls).set({ status: "graded", updatedAt: new Date() }).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));

  // 4a: Immediately update user_playbooks with aggregated strengths/growth areas
  try {
    if (call.teamMemberId) {
      await updateUserPlaybookAfterGrade(call.teamMemberId, tenantId, parsed.criteriaScores);
    }
  } catch {
    // User playbook update failure shouldn't block grading
  }

  try {
    await processCallGamification(callId, tenantId);
  } catch {
    // Gamification failure shouldn't block grading
  }

  try {
    await sendGradeAlert(callId, tenantId);
  } catch {
    // Email failure shouldn't block grading
  }

  try {
    if (call.teamMemberId) {
      await extractVoiceSample(callId, call.teamMemberId, tenantId);
    }
  } catch {
    // Voice sample extraction failure shouldn't block grading
  }

  try {
    await generateNextStepsForCall(callId, tenantId);
  } catch {
    // Next steps generation failure shouldn't block grading
  }

  return grade;
}

// GROUP 4a + 4b: Update user_playbooks immediately after grading
async function updateUserPlaybookAfterGrade(
  teamMemberId: number,
  tenantId: number,
  criteriaScores: Array<{ name: string; earned: number; max: number; explanation: string }>
) {
  const [member] = await db.select({ userId: teamMembers.userId }).from(teamMembers)
    .where(and(eq(teamMembers.id, teamMemberId), eq(teamMembers.tenantId, tenantId)))
    .limit(1);
  if (!member?.userId) return;

  // Get last 5 grades for this rep
  const recentGrades = await db
    .select({ strengths: callGrades.strengths, improvements: callGrades.improvements, overallScore: callGrades.overallScore })
    .from(callGrades)
    .innerJoin(calls, and(eq(calls.id, callGrades.callId), eq(calls.tenantId, tenantId)))
    .where(eq(calls.teamMemberId, teamMemberId))
    .orderBy(desc(callGrades.createdAt))
    .limit(5);

  // Aggregate strengths and growth areas across last 5 grades
  const strengthCounts: Record<string, number> = {};
  const improvementCounts: Record<string, number> = {};
  for (const g of recentGrades) {
    if (Array.isArray(g.strengths)) {
      for (const s of g.strengths as string[]) {
        strengthCounts[s] = (strengthCounts[s] ?? 0) + 1;
      }
    }
    if (Array.isArray(g.improvements)) {
      for (const i of g.improvements as string[]) {
        improvementCounts[i] = (improvementCounts[i] ?? 0) + 1;
      }
    }
  }

  const topStrengths = Object.entries(strengthCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
  const topGrowthAreas = Object.entries(improvementCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

  // Compute grade trend from last 5 scores
  const scores = recentGrades.map((g) => Number(g.overallScore ?? 0));
  const gradeTrend = scores.length < 2 ? "plateau"
    : scores[0] - scores[scores.length - 1] > 5 ? "improving"
    : scores[scores.length - 1] - scores[0] > 5 ? "declining"
    : "plateau";

  // 4b: Track weakCriteria — criteria that scored below 60% of max
  const [existingPb] = await db.select({ id: userPlaybooks.id, weakCriteria: userPlaybooks.weakCriteria })
    .from(userPlaybooks).where(eq(userPlaybooks.userId, member.userId)).limit(1);

  const existingWeak: Record<string, { count: number; lastSeen: string }> =
    existingPb?.weakCriteria && typeof existingPb.weakCriteria === "object" && !Array.isArray(existingPb.weakCriteria)
      ? existingPb.weakCriteria as Record<string, { count: number; lastSeen: string }>
      : {};

  const todayStr = new Date().toISOString().slice(0, 10);
  for (const cs of criteriaScores) {
    if (cs.max > 0 && cs.earned / cs.max < 0.6) {
      const existing = existingWeak[cs.name];
      existingWeak[cs.name] = { count: (existing?.count ?? 0) + 1, lastSeen: todayStr };
    }
  }

  const data = {
    strengths: topStrengths,
    growthAreas: topGrowthAreas,
    gradeTrend,
    weakCriteria: existingWeak,
    updatedAt: new Date(),
  };

  if (existingPb) {
    await db.update(userPlaybooks).set(data).where(eq(userPlaybooks.id, existingPb.id));
  } else {
    await db.insert(userPlaybooks).values({ tenantId, userId: member.userId, ...data });
  }
}
