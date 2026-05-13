# stuck-calls-recovery

> Wave: 1
> Status: spec
> Risk: low
> Replaces: manual invocation of `scripts/recover-stuck-calls.ts` and `scripts/flip-failed-to-pending.ts`

## 1. Purpose

Find calls stuck in PROCESSING or FAILED state for too long, decide whether to retry or fail-permanently, and act. The manual scripts already exist — this agent makes their invocation automatic and tenant-aware.

## 2. Trigger

Cron, every 15 minutes (`*/15 * * * *`).

```toml
[[cron]]
name = "stuck-calls-recovery"
schedule = "*/15 * * * *"
command = "npx tsx scripts/agents/stuck-calls-recovery.ts"
```

## 3. Inputs

- `calls` table: rows where `gradingStatus IN (PROCESSING, FAILED)` and `(updatedAt < now - 60min OR gradingAttempts > 3)`.
- `ai_logs` table: prior grading failures for the same call.
- GHL conversation/recording: to verify whether the recording still exists at the GHL URL.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `listStuckCalls(tenantId, ageMinutes)` | tenant, age | list of stuck call rows + last error |
| `checkRecordingExists(callId)` | callId | `{ exists, sizeBytes, contentType }` via GHL HEAD request |
| `retryGrading(callId)` | callId | flips status PENDING, queues to grading worker. **Tenant-scoped**, max 3 retries enforced at code level. |
| `markPermanentlyFailed(callId, reason)` | callId, reason | sets `gradingStatus=FAILED_PERMANENT`, writes audit log |
| `reportRecovery(summary)` | text | writes audit log + posts to `agent_escalations` if any CRITICAL findings |

## 5. Outputs

- `calls.gradingStatus` updates (PENDING for retry, FAILED_PERMANENT for give-up).
- `calls.gradingAttempts` increments.
- `audit_logs` entries: `call.recovery.{retried|given_up}`.
- Optional summary surfaced in `/(tenant)/admin/system-health`.

## 6. Approval gates

Fully autonomous. Code-level cap: `retryGrading` enforces `gradingAttempts < 3`. After 3 failures the agent must call `markPermanentlyFailed`.

## 7. Completion signal

`stop_reason: "end_turn"`. Per-tenant loop: list stuck calls → for each, classify (`retry | give_up`) → call the right tool → log → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| GHL HEAD returns 404 | Recording vanished. `markPermanentlyFailed("recording_404")`. |
| GHL HEAD times out | Skip this call this run. Try next run. |
| Retry causes another failure | Increment `gradingAttempts`. After 3, give up. |
| > 20 stuck calls in one tenant | Escalate (something systemic). |

## 9. Test plan

- **Unit:** Tool tests against fixture rows in each state.
- **Integration:** Seed a tenant with: 1 stuck < 1h (skip), 1 stuck 2h with recording OK (retry), 1 stuck 24h with recording gone (give up), 1 with `gradingAttempts=3` (give up). Run agent, assert correct actions.
- **Production rollout:** Observe-only for 48h (log findings only, no tool calls). Then enable.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/stuck-calls-recovery.ts`
  - `lib/agents/stuck-calls-recovery/{index,tools}.ts`
- **Model:** `claude-haiku-4-5-20251001` (classification only).
- **Token budget:** ~3k input / ~300 output per tenant per run × 96 runs/day. ~$0.50/day per tenant.
- **Reuse:** Pulls logic from existing `scripts/recover-stuck-calls.ts` — port to tool functions.
