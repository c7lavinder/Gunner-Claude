# cron-sentinel

> Wave: 1
> Status: spec
> Risk: low
> Replaces: manual monitoring of the 8 Railway crons; humans noticing late call grades or stale enrichment

## 1. Purpose

Watch every Gunner cron job. Detect missed firings, slow runs, and silent failures. Auto-retry where safe; escalate when not. Internal-only — never touches a customer.

## 2. Trigger

Self-scheduled cron, every 10 minutes (`*/10 * * * *`). New entry in `railway.toml`:

```toml
[[cron]]
name = "cron-sentinel"
schedule = "*/10 * * * *"
command = "npx tsx scripts/agents/cron-sentinel.ts"
```

## 3. Inputs

- `cron_runs` table (new) — every cron writes a heartbeat row on entry + exit with status. `lib/cron-heartbeat.ts` already exists; extend it to record start/end timestamps + status to `cron_runs`.
- `railway.toml` parsed at deploy time → seed table `cron_expectations(name, schedule, max_runtime_seconds)`.
- `audit_logs` table for severity-tagged events.

## 4. Tools

All tools return `{ status, data?, error?, suggestion? }`.

| Tool | Input | Returns |
|---|---|---|
| `getExpectedSchedule(cronName)` | name | `{ schedule, max_runtime_seconds, last_expected_fire }` |
| `getRecentRuns(cronName, limit)` | name, n | list of `{ started_at, ended_at, status, duration_ms }` |
| `retryCron(cronName)` | name | re-runs the cron via Railway API or via local `npx tsx` shell-out. **Code-gated**: only allowed for `poll-calls`, `enrich-pending`, `regenerate-stories` (idempotent crons). Not allowed for `daily-kpi-snapshot`, `compute-aggregates` (have side effects). |
| `logSentinelFinding(severity, message, payload)` | INFO/WARNING/ERROR/CRITICAL + body | writes to `audit_logs` |
| `escalateToOwner(reason, details)` | reason, details | calls `internal-alert-hub` (Wave 2) once available; until then writes a CRITICAL audit log + posts to `agent_escalations` table |

## 5. Outputs

- `audit_logs` rows tagged `cron.sentinel.{healthy|delayed|stuck|recovered}`.
- `cron_runs` rows for self-heartbeat.
- `agent_escalations` rows for human attention (read by ops dashboard).
- Optional: surface in `/(tenant)/admin/system-health` page (existing or new).

## 6. Approval gates

Fully autonomous. `retryCron()` is the only state-changing tool and it's allow-listed at the code level to idempotent crons only.

## 7. Completion signal

`stop_reason: "end_turn"`. The agent classifies each cron as `healthy | delayed | stuck | failed | recovered`, takes one of the safe actions, logs, and ends turn. No multi-step reasoning beyond one classification per cron.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| `poll-calls` hasn't fired in > 3 min | Log WARNING; if > 10 min, escalate CRITICAL. |
| Cron started but didn't finish within `max_runtime_seconds × 2` | Log ERROR `cron.stuck`. Idempotent crons: invoke `retryCron`. Non-idempotent: escalate. |
| Sentinel itself can't read `cron_runs` (DB down) | Skip this run. Don't retry. Next run will catch it. |
| Sentinel finds itself missing (no `cron_runs` row for `cron-sentinel`) | Bootstrap: write own heartbeat. If 2 consecutive sentinel runs go missing, the only escalation path is the in-process Railway healthcheck — log to stderr so Railway logs show it. |

## 9. Test plan

- **Unit:** Fixture `cron_runs` rows for each of: healthy, delayed, stuck, failed. Assert correct classification per tool output.
- **Integration:** Run `scripts/agents/cron-sentinel.ts` against a seeded DB with a deliberately-stale `poll-calls` row. Verify the agent escalates.
- **Production rollout:**
  1. Add table + heartbeat instrumentation to existing crons (no agent yet).
  2. After 48h of clean heartbeat data, enable the agent in observe-only mode (log findings, no `retryCron`).
  3. After 1 week of clean shadow runs, enable `retryCron` for idempotent crons.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/cron-sentinel.ts` — entry point (cron command).
  - `lib/agents/cron-sentinel/index.ts` — orchestrator.
  - `lib/agents/cron-sentinel/tools.ts` — tool implementations.
  - `lib/cron-heartbeat.ts` — extend existing module to write to `cron_runs`.
  - `prisma/schema.prisma` — add `CronRun`, `CronExpectation`, `AgentEscalation` models.
- **Model:** `claude-haiku-4-5-20251001` — cheap, classification-only.
- **Token budget:** ~2k input / ~500 output per run × 144 runs/day = ~360k tokens/day. Trivial cost.
- **Prompt strategy:** System prompt enumerates the 8 known crons + their expected schedules. User message contains current `cron_runs` snapshot. Agent calls `logSentinelFinding` per cron, then `retryCron`/`escalateToOwner` if needed.
- **Cost ceiling:** $1/day per tenant.
