// lib/ai/prompts/next-steps.ts
//
// Next-steps generation prompt — Phase 6 completionist (Session 89 — keep-
// going pass). Extracted from lib/ai/grading.ts `generateNextSteps` as part
// of the Phase 8 prompt-version-everywhere sweep.
//
// Generates 3-5 specific follow-up actions (add_note / create_task /
// send_sms / create_appointment / change_stage / check_off_task) after a
// call is graded. Uses live GHL pipelines + tenant-configured appointment
// types so the AI emits real IDs (Rule 2: IDs, never fuzzy names).
//
// Output contract (unchanged from pre-extraction): JSON array of action
// objects with the discriminated `type` field per the prompt schema below.
//
// VERSION bumps on any change. Logged with every next-steps call so Phase 9
// drift detection can correlate prompt versions to score deltas.
//
// READ BY: lib/ai/grading.ts (generateNextSteps)

export const VERSION = '1.0.0'

export interface NextStepsInput {
  todayIso: string                  // YYYY-MM-DD anchor for date resolution
  todayDow: string                  // e.g. "Wednesday"
  repFirst: string
  repName: string
  repRole: string
  appointmentTypesBlock: string     // pre-rendered list block
  pipelinesBlock: string            // pre-rendered list block
  contactName: string
  propertyAddress: string
  propertyCondition: string
  currentStageName: string
  callSummary: string
  callOutcome: string
  callType: string
  overallScore: number
  feedback: string
  fullTranscript: string
}

/**
 * Build the user prompt for next-steps generation. The original
 * implementation used a single user message with everything inlined —
 * preserve that shape verbatim so behavior is identical.
 */
export function buildNextStepsUserPrompt(p: NextStepsInput): string {
  return `You are a real estate wholesaling CRM assistant. Based on this graded call, generate 3-5 specific next step actions the rep should take.

TODAY'S DATE: ${p.todayIso} (${p.todayDow}, America/Chicago). Any appointmentTime or sendAt you produce MUST be at or after today — past dates are a bug.

THE REP ON THIS CALL: ${p.repFirst} (${p.repName}, role ${p.repRole}). Any SMS you write is FROM ${p.repFirst} — sign it with their first name, not a placeholder or a hallucinated name.

CRITICAL RULES:
- Each action type can only appear ONCE. Do NOT generate two actions of the same type.
- Every label must be specific with real names, addresses, and details from the call.
- Only suggest actions the call actually supports.
- For add_note: "label" is a short action-card title like "Follow-up call with {contactName} — walkthrough scheduled". "noteBody" is the FULL paragraph in first person as ${p.repFirst} that gets pushed to GHL as the CRM note — include exact numbers (prices, dates, percentages), seller name, property address, key outcomes, and what was discussed. noteBody must be the full narrative; label is just the Gunner card title. Never duplicate the short label into noteBody.
- For create_task: Write a specific title like "Contact Name: Follow up on Address after outcome". The reasoning should serve as the task description.

- For send_sms: The "label" field is a short summary shown on the action card. The "smsBody" field MUST contain the actual message text the contact will receive — written as ${p.repFirst} in first person, casual/friendly but professional. Sign off as ${p.repFirst}, not anyone else. Do not put the SMS copy in the label field.
- For create_appointment: ONLY emit this type if a matching appointment type exists below. Set "appointmentTypeId" to the matching id, "calendarId" to that type's calendarId, and "appointmentTime" to an ISO datetime AT OR AFTER ${p.todayIso}. If the transcript mentions a day like "Friday", resolve it to the NEXT ${p.todayIso}-or-later Friday — never a past date. Weekdays only, 10am or 2pm local default. Set "label" using the type's titleTemplate if given, otherwise "{typeLabel} at {address} w/ {contactName}".
- For change_stage: ALWAYS emit explicit "pipelineId" AND "stageId" picked from the pipelines list below. If no appropriate stage exists, do NOT emit change_stage. Never return stage names instead of IDs.

AVAILABLE APPOINTMENT TYPES (use these exact ids and calendarIds):
${p.appointmentTypesBlock}

AVAILABLE PIPELINES AND STAGES (use these exact ids for change_stage):
${p.pipelinesBlock}

Contact name: ${p.contactName}
Property: ${p.propertyAddress}
Property Condition: ${p.propertyCondition}
Current pipeline stage: ${p.currentStageName}
Current pipeline id: Unknown
Call summary: ${p.callSummary}
Call outcome: ${p.callOutcome}
Call type: ${p.callType}
Score: ${p.overallScore}/100
Feedback: ${p.feedback}

Full transcript:
${p.fullTranscript}

Return JSON array only:
[{
  "type": "add_note"|"create_task"|"send_sms"|"create_appointment"|"change_stage"|"check_off_task",
  "label": "specific action description",
  "reasoning": "why this action matters",
  "noteBody": "only for add_note — the full paragraph pushed to GHL as the CRM note",
  "smsBody": "only for send_sms — the actual SMS text",
  "appointmentTypeId": "only for create_appointment",
  "calendarId": "only for create_appointment",
  "appointmentTime": "only for create_appointment — ISO datetime",
  "durationMin": 30,
  "pipelineId": "only for change_stage",
  "stageId": "only for change_stage"
}]`
}
