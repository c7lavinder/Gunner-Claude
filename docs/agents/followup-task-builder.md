# followup-task-builder

> Wave: 2
> Status: spec
> Risk: medium
> Replaces: reps manually deciding "what's the next step?" after a graded call; partially replaces the user-triggered `generate-next-steps` endpoint

## 1. Purpose

After a call is graded, autonomously decide the next step (book appointment, send packet, follow up in N days, mark dead) and create the right task for the assigned rep. No customer-facing messaging — the task is for the rep.

## 2. Trigger

Event-driven. `gradeCall()` in `lib/ai/grading.ts` enqueues an `agent_jobs(agent: "followup-task-builder", payload: {callId})` row when grading completes. Worker drains the queue.

Plus catch-up cron every hour for any unprocessed jobs.

## 3. Inputs

- `calls.{score, rubricScores, aiSummary, callResult, callOutcome, dealIntelHistory}` — the just-graded call.
- Linked property + seller.
- `properties.tcp_score`, deal intel, prior touch history.
- Existing open tasks for the property (avoid duplicates).
- Tenant's task-categories config (Day Hub).

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getCallContext(callId)` | id | call + property + seller + recent task history |
| `proposeNextStep(callContext)` | context | one of `{book_appointment, send_packet, follow_up_N_days, mark_dead, escalate_to_manager}` + reasoning |
| `createTask(propertyId, userId, category, title, urgency, dueAt)` | inputs | creates Gunner Task |
| `scheduleFollowUpTouch(propertyId, dueAt, notes)` | inputs | creates a "Touch" task scheduled for a future date |
| `proposeAppointment(propertyId, sellerId, suggestedTimeWindow)` | inputs | creates an internal "Book appointment" task; does NOT actually send anything to the seller |
| `markPropertyDead(propertyId, reason)` | inputs | gated — requires both proposal + 24h cooldown before actual execution. For Wave 2 this only flags; doesn't actually mark dead. |
| `logFollowupDecision(callId, decision, reasoning)` | inputs | audit log |

## 5. Outputs

- `tasks` row (one per call, in the right category for the rep's Day Hub).
- `properties.scheduledFollowUpAt` for the touch case.
- `audit_logs`: `followup.task.created`.
- For Wave 3+: this agent feeds the SMS-send agents (appointment-reminder, drip-cadence-migrator) by setting `properties.outboundIntent` field that send agents read.

## 6. Approval gates

- Task creation: autonomous.
- "Mark dead": Wave 2 ships with this **disabled** — agent can propose but `markPropertyDead` writes to `agent_proposals` table only, requiring human review in Settings → Inventory.
- "Send appointment SMS": NOT this agent's job — that's appointment-reminder (Wave 3).

## 7. Completion signal

`stop_reason: "end_turn"`. One call → one decision → one task → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Call has no transcript / no grading data | Skip; log WARNING. |
| Property already has an open task in the same category | Don't dupe; log INFO. |
| Decision is "escalate" but no manager configured | Default to tenant admin. |
| Agent picks `mark_dead` for a property with TCP > 0.5 | Override to `escalate_to_manager` (sanity check at code level). |

## 9. Test plan

- **Unit:** Decision tree heuristics per call outcome.
- **Integration:** Fixture set of 30 graded calls covering each call outcome. Run agent. Assert decisions match expert review for > 85%.
- **Production rollout:**
  1. Observe-only 1 week.
  2. Manual review on 100 decisions.
  3. Enable for low-stakes outcomes first (touch follow-up); enable "book appointment" after another week.
  4. "Mark dead" stays human-only for the first month.

## 10. Implementation notes

- **Files:**
  - `lib/agents/followup-task-builder/{index,tools,heuristics}.ts`
  - `lib/ai/grading.ts` — enqueue job at end of `gradeCall()`.
  - `prisma/schema.prisma` — add `AgentProposal` model for the soft-gated "mark dead" case.
- **Model:** `claude-sonnet-4-6` (needs reasoning over call context).
- **Token budget:** ~6k input / ~800 output per call. At 200 calls/day per tenant = ~$8/day per tenant. Higher cost is justified — replaces meaningful rep time.
- **Heuristics layer:** Before the LLM call, run rule-based pre-filter (no transcript → skip; TCP > 0.85 + appointment in DealIntel → book; etc.) to keep cost down.
