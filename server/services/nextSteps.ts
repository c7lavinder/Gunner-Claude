import { eq, and } from "drizzle-orm";
import { db } from "../_core/db";
import { chatCompletion } from "../_core/llm";
import { calls, callGrades, callNextSteps } from "../../drizzle/schema";
import {
  getTenantPlaybook,
  getIndustryPlaybook,
  resolveStages,
  resolveCallTypes,
  resolveOutcomeTypes,
} from "./playbooks";

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

  let parsed: Array<{
    actionType: string;
    label: string;
    reason: string;
    editableContent: string;
    payload: Record<string, unknown>;
  }>;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    console.error(`[next-steps] JSON parse failed for call ${callId}. Raw output: ${raw.slice(0, 500)}`);
    return [];
  }

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
