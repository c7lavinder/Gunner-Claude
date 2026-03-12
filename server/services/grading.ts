import { db } from "../_core/db";
import { chatCompletion } from "../_core/llm";
import { calls, callGrades, tenantRubrics, teamMembers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sendGradeAlert } from "./notifications";
import { processCallGamification } from "./gamification";
import { extractVoiceSample } from "./voiceSamples";
import { getTenantPlaybook, getIndustryPlaybook } from "./playbooks";
import { generateNextStepsForCall } from "../routers/calls";
import type { RubricDef } from "../../shared/types";

// RE Wholesaling fallback — used only when playbook rubric lookup fails
const FALLBACK_CRITERIA: Array<{ name: string; maxPoints: number; description: string }> = [
  { name: "Introduction & Rapport", maxPoints: 15, description: "Introduces self and company clearly, builds initial rapport" },
  { name: "Seller Motivation", maxPoints: 20, description: "Uncovers why the seller wants/needs to sell (timeline, situation)" },
  { name: "Property Condition", maxPoints: 15, description: "Asks about condition, repairs needed, occupancy" },
  { name: "Financial Discovery", maxPoints: 15, description: "Discovers mortgage balance, liens, asking price expectations" },
  { name: "Timeline & Urgency", maxPoints: 10, description: "Establishes seller's timeline and urgency level" },
  { name: "Active Listening", maxPoints: 15, description: "Paraphrases seller concerns, acknowledges situation" },
  { name: "Next Steps & Close", maxPoints: 10, description: "Sets a clear next step — appointment, follow-up, or offer" },
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
    console.warn(`[grading] call ${call.id} has no callType — using FALLBACK_CRITERIA`);
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
  const philosophyText = philosophy
    ? `\n\nGrading philosophy:\n${philosophy.overview}\n\nCritical failure policy: ${philosophy.criticalFailurePolicy}\nTalk ratio guidance: ${philosophy.talkRatioGuidance}${callType && philosophy.roleSpecific[callType] ? `\nRole-specific: ${philosophy.roleSpecific[callType]}` : ""}`
    : "";

  const systemPrompt = `You are an expert sales call grading AI. Grade this call transcript against the provided rubric. Return valid JSON only, no markdown.${philosophyText}`;
  const userPrompt = `Rubric criteria:\n${rubricText}${failText}\n\nTranscript:\n${call.transcript}\n\nReturn JSON: { "overallScore": number 0-100, "overallGrade": "A"|"B"|"C"|"D"|"F", "criteriaScores": [{ "name": string, "earned": number, "max": number, "explanation": string }], "strengths": [string], "improvements": [string], "coachingTips": [string], "redFlags": [string], "summary": string, "objectionHandling": [{ "objection": string, "context": string, "suggestedResponses": [string] }] }`;

  const raw = await chatCompletion({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    temperature: 0.2,
    maxTokens: 3000,
  });

  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as {
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
    })
    .returning();

  await db.update(calls).set({ status: "graded", updatedAt: new Date() }).where(eq(calls.id, callId));

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
