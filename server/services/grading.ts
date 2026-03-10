import { db } from "../_core/db";
import { chatCompletion } from "../_core/llm";
import { calls, callGrades, tenantRubrics } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const DEFAULT_RUBRICS: Record<string, Array<{ name: string; maxPoints: number; description: string }>> = {
  qualification: [
    { name: "Introduction & Rapport", maxPoints: 15, description: "Professional greeting, built rapport" },
    { name: "Needs Discovery", maxPoints: 25, description: "Asked probing questions, identified needs" },
    { name: "Active Listening", maxPoints: 20, description: "Paraphrased, acknowledged concerns" },
    { name: "Value Presentation", maxPoints: 20, description: "Clearly communicated value proposition" },
    { name: "Next Steps", maxPoints: 10, description: "Set clear next steps, got commitment" },
    { name: "Professionalism", maxPoints: 10, description: "Professional tone throughout" },
  ],
};

export function getDefaultRubric(callType: string) {
  return DEFAULT_RUBRICS[callType] ?? DEFAULT_RUBRICS.qualification;
}

export async function gradeCall(callId: number, tenantId: number) {
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, tenantId)));
  if (!call?.transcript) throw new Error("Call not found or missing transcript");

  const callType = call.callType ?? "qualification";
  const [rubricRow] = await db
    .select()
    .from(tenantRubrics)
    .where(and(eq(tenantRubrics.tenantId, tenantId), eq(tenantRubrics.callType, callType), eq(tenantRubrics.isActive, "true")));

  let criteria: Array<{ name: string; maxPoints: number; description: string }>;
  let rubricType = callType;
  let tenantRubricId: number | null = null;

  if (rubricRow?.criteria) {
    try {
      criteria = JSON.parse(rubricRow.criteria) as Array<{ name: string; maxPoints: number; description: string }>;
      tenantRubricId = rubricRow.id;
    } catch {
      criteria = getDefaultRubric(callType);
    }
  } else {
    criteria = getDefaultRubric(callType);
  }

  const rubricText = criteria.map((c) => `- ${c.name} (${c.maxPoints} pts): ${c.description}`).join("\n");
  const systemPrompt = `You are an expert sales call grading AI. Grade this call transcript against the provided rubric. Return valid JSON only, no markdown.`;
  const userPrompt = `Rubric criteria:\n${rubricText}\n\nTranscript:\n${call.transcript}\n\nReturn JSON: { "overallScore": number 0-100, "criteriaScores": [{ "name": string, "earned": number, "max": number }], "strengths": [string, string, string], "improvements": [string, string, string], "coachingTips": [string, string, string], "redFlags": [string], "summary": string }`;

  const raw = await chatCompletion({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    temperature: 0.2,
    maxTokens: 2048,
  });

  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as {
    overallScore: number;
    criteriaScores: Array<{ name: string; earned: number; max: number }>;
    strengths: string[];
    improvements: string[];
    coachingTips: string[];
    redFlags: string[];
    summary: string;
  };

  const [grade] = await db
    .insert(callGrades)
    .values({
      tenantId,
      callId,
      overallScore: String(parsed.overallScore),
      criteriaScores: parsed.criteriaScores,
      strengths: parsed.strengths ?? [],
      improvements: parsed.improvements ?? [],
      coachingTips: parsed.coachingTips ?? [],
      redFlags: parsed.redFlags ?? [],
      summary: parsed.summary ?? "",
      rubricType,
      tenantRubricId,
    })
    .returning();

  await db.update(calls).set({ status: "graded", updatedAt: new Date() }).where(eq(calls.id, callId));

  return grade;
}
