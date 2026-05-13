# Gunner AI — Agent Roadmap + 17 Specs

> Bundled 2026-05-11 for review in claude.ai chat.
> Each agent's spec follows the README. Each starts with a clear heading.
> Companion bundle: AI_AUDIT_FOR_CHAT.md (the inventory this roadmap builds on).

## Table of Contents

1. [Roadmap (README)](#roadmap-readme)
2. [Shared infrastructure: \_send-framework](#shared-infrastructure-_send-framework)
3. [Wave 1 — Site-keeping](#wave-1--site-keeping)
    1. cron-sentinel
    2. stuck-calls-recovery
    3. tcp-anomaly-surfacer
    4. webhook-drift-watchdog
4. [Wave 2 — Internal team work](#wave-2--internal-team-work)
    1. lead-triage
    2. pipeline-janitor
    3. followup-task-builder
    4. property-enrichment-iterator
    5. buyer-match-outreach-queue
    6. daily-operations-briefing
    7. internal-alert-hub
5. [Wave 3 — Customer-facing sends](#wave-3--customer-facing-sends)
    1. appointment-reminder
    2. drip-cadence-migrator
    3. missed-call-autoresponder
    4. no-show-recovery
    5. walkthrough-coordinator

---

## Roadmap (README)

# Gunner Worker Agents — Roadmap

> Date: 2026-05-11
> Companion: `docs/AI_AUDIT.md` (inventory of what exists today)
> Standard: Rule 4 (Worker Agent Architecture) + `feedback_agent_autonomy_bar.md` (very controlled customer-facing)

---

## Purpose

This doc lists every agent candidate that emerged from the AI audit. Each agent either:

- **A.** keeps Gunner running (operations / health),
- **B.** replaces work currently done by humans,
- **C.** replaces a GHL workflow with a Gunner-controlled, auditable equivalent.

Each candidate has its own spec doc in `docs/agents/<agent-name>.md`. The spec follows a fixed template (see Section 4 below).

---

## Build order — recommended

The order is **risk-ascending**. Internal-only / no-send agents ship first; customer-facing send agents only ship once the gated-send framework is hardened. This matches Corey's "very controlled at first" autonomy bar.

### Wave 1 — Site-keeping (internal only, autonomous from day 1)

| # | Agent | Replaces | Risk | ROI |
|---|---|---|---|---|
| 1 | [cron-sentinel](cron-sentinel.md) | Manual cron monitoring | low | high — protects 8 crons |
| 2 | [stuck-calls-recovery](stuck-calls-recovery.md) | Manual `recover-stuck-calls.ts` runs | low | medium |
| 3 | [tcp-anomaly-surfacer](tcp-anomaly-surfacer.md) | Humans noticing buy signals from dashboards | low | high — directly drives revenue |
| 4 | [webhook-drift-watchdog](webhook-drift-watchdog.md) | Once-a-day `reconcile-ghl-pipelines` blindspot | low | medium |

### Wave 2 — Internal team work (autonomous, no customer contact)

| # | Agent | Replaces | Risk | ROI |
|---|---|---|---|---|
| 5 | [lead-triage](lead-triage.md) | Dispatcher/admin reviewing new GHL leads | low-medium | very high |
| 6 | [pipeline-janitor](pipeline-janitor.md) | Humans noticing stuck deals | low | high |
| 7 | [followup-task-builder](followup-task-builder.md) | Reps deciding next step after a call | medium | very high |
| 8 | [property-enrichment-iterator](property-enrichment-iterator.md) | One-shot `enrich-property.ts` | low | medium |
| 9 | [buyer-match-outreach-queue](buyer-match-outreach-queue.md) | Manual buyer list assembly | low | high (no auto-send) |
| 10 | [daily-operations-briefing](daily-operations-briefing.md) | Reps figuring out where to start each morning | low | medium |
| 11 | [internal-alert-hub](internal-alert-hub.md) | GHL Slack/email/SMS alert workflows (team-facing, not customer) | low | high |

### Wave 3 — Customer-facing sends (vetted-template only, controlled rollout)

Send agents only ship once the **vetted-template runtime + approval queue + send-rate guardrails** are in place. See `docs/agents/_send-framework.md` for the shared infrastructure.

Order within Wave 3 reflects Corey's GHL kill-list priority (2026-05-11): appointment reminders + drip campaigns first.

| # | Agent | Replaces (GHL workflow) | Risk | ROI |
|---|---|---|---|---|
| 12 | [appointment-reminder](appointment-reminder.md) | GHL appointment-reminder workflow (confirm + day-of) | medium | high |
| 13 | [drip-cadence-migrator](drip-cadence-migrator.md) | GHL drip campaigns | high | very high |
| 14 | [missed-call-autoresponder](missed-call-autoresponder.md) | GHL "missed call" workflow | medium | high |
| 15 | [no-show-recovery](no-show-recovery.md) | GHL no-show workflow | medium | high |
| 16 | [walkthrough-coordinator](walkthrough-coordinator.md) | Manual walkthrough scheduling | medium-high | very high |

---

## Shared infrastructure

Before Wave 3 starts, build these once. Every send agent uses them.

| Component | Purpose | Lives in |
|---|---|---|
| `lib/agents/send-templates.ts` | Vetted SMS/email template registry. Versioned. Each template references an approval record. | new |
| `lib/agents/send-gate.ts` | Code-level interceptor for every outbound send. Reads allow-list, enforces tenant cap, logs to `agent_send_log`. | new |
| `lib/agents/approval-queue.ts` | Queue of agent-proposed sends awaiting human approval. UI lives at `/(tenant)/agents/queue`. | new |
| `prisma` migration | New models: `AgentTemplate`, `AgentSend`, `AgentApprovalQueueItem`, `AgentRunLog`. | `prisma/schema.prisma` |

Spec for shared infra: `docs/agents/_send-framework.md` (to be written).

---

## Spec template — every agent doc follows this

```markdown
# Agent Name

> Wave: 1 | 2 | 3 | 4
> Status: spec | building | shipped
> Risk: low | medium | high
> Replaces: <manual task or GHL workflow>

## 1. Purpose
One-sentence statement of what this agent does.

## 2. Trigger
What invokes it (cron / webhook / event / user action) and how often.

## 3. Inputs
What data the agent reads (DB tables, GHL fields, vendor data, recent context).

## 4. Tools
List of tools the agent can call. Each tool returns structured JSON:
{ status: 'success' | 'error' | 'no_results', data?, error?, suggestion? }

## 5. Outputs
What the agent writes (DB fields, audit logs, surfaced UI).

## 6. Approval gates
- Internal-only actions: autonomous
- Customer-facing sends: queue → human approve → send
- Any destructive action: hard-gated, human approve

## 7. Completion signal
stop_reason: "end_turn" only. Never parse natural language.

## 8. Failure modes & retries
What can go wrong, what gets retried, what escalates to a human.

## 9. Test plan
- Unit: tool functions return correct JSON
- Integration: agent runs against fixture data, produces expected outputs
- Production rollout: shadow mode → flag-gated single-tenant → multi-tenant

## 10. Implementation notes
- File paths: `lib/agents/<name>/index.ts`, `lib/agents/<name>/tools.ts`, etc.
- Model: claude-opus-4-6 (orchestration) / claude-sonnet-4-6 (per-step) / claude-haiku (cheap classify)
- Prompt strategy
- Token budget / cost ceiling
```

---

## Open questions for Corey

These need answers before the build order is final. None block writing the specs — but they shape priorities and exact triggers.

1. **Which GHL workflows are currently active?** Need a list of names + triggers (we can't read the GHL workflow library from code). Export from the GHL UI or screenshots.
2. **Which workflow do you most want gone first?** Best guess: missed-call autoresponder (high volume, simple template).
3. **Vetted SMS template list to start.** Suggest: missed-call autoresponder (1 message), appointment confirm (1 message), appointment day-of reminder (1 message), no-show recovery (1 message). 4 templates total for Wave 3.
4. **Approval queue UX preference:** notification → in-app review → approve, vs. Slack/SMS link → approve from phone? (For when you're not at the desk.)
5. **Cost ceiling per agent per day?** TCP recalc + property story already cost ~$2-3/day. Send agents will add minimal cost; site-keeping agents are tiny; lead-triage at scale could be the biggest.

---

## What's NOT being proposed as an agent (and why)

- **Call grading.** It already runs. It's a one-shot, not an agent. Don't replace what works.
- **Property enrichment (initial).** Same — one-shot is correct for the first-touch enrichment. The *iterator* (re-run when vendor data refreshes) is the new agent.
- **TCP scoring.** Pure math, not an LLM problem.
- **Daily audit.** Already a Claude-powered code review cron. Keep it.
- **KPI snapshot, compute-aggregates.** Pure SQL, no benefit from LLM.

---

## Rollout cadence (suggested)

| Wave | Estimated build time | Cumulative |
|---|---|---|
| Wave 1 (4 agents) | 1 week | 1 week |
| Wave 2 (7 agents incl. alert-hub) | 2 weeks | 3 weeks |
| Send framework + Wave 3 (5 send agents, one at a time) | 4 weeks | 7 weeks |

Each wave ends with a production verification step (Rule: "no phase is complete until every feature is verified end-to-end on production").

---

## Shared infrastructure: _send-framework

# _send-framework — shared infrastructure for all customer-facing send agents

> Wave: 3 (must ship BEFORE any Wave 3 agent)
> Status: spec
> Risk: high — this is the gate that protects every customer touch
> Replaces: no current centralized send path; sends happen ad-hoc via GHL workflows or one-off Gunner endpoints

## 1. Purpose

A single, code-enforced send path that every customer-facing agent must use. Implements:

- **Vetted template registry** — only pre-approved templates can be sent. No free-form LLM-generated SMS/email content.
- **Approval queue** — agents propose sends; humans approve before delivery (until template is graduated to autonomous).
- **Code-level gate** — interceptor that runs on every send call, rejects unknown templates, enforces tenant caps, logs everything.
- **Send guardrails** — rate limits per recipient, per tenant, per template; quiet hours; suppression lists.
- **Audit trail** — every send is logged with template version, agent, approver (if any), timestamp, delivery status.

This is the **defense layer** that makes Corey's "very controlled at first" feasible. Without this, no Wave 3 agent ships.

## 2. Trigger

Not a cron. This is a library + a few HTTP endpoints called by send agents.

## 3. Components

### 3a. Template Registry (`AgentTemplate` Prisma model)

```prisma
model AgentTemplate {
  id              String   @id @default(cuid())
  tenantId        String
  key             String   // e.g. "appointment_confirm_v1"
  channel         Channel  // SMS | EMAIL
  body            String   @db.Text
  variables       Json     // ["sellerFirstName", "appointmentTime"] - placeholder list
  approvedBy      String?  // userId who marked it approved
  approvedAt      DateTime?
  autonomousAfter DateTime? // null = requires approval forever; set = autonomous after this date
  status          TemplateStatus // DRAFT | APPROVED | ARCHIVED
  version         Int      // bump on any edit; old versions kept for audit
  createdAt       DateTime @default(now())
  @@unique([tenantId, key, version])
}
```

- A template lives in DRAFT until a tenant admin (Corey) approves it.
- APPROVED templates can be sent — initially with human approval per send. Setting `autonomousAfter` graduates the template to autonomous (still subject to all guardrails).
- ARCHIVED templates can't be selected for new sends but remain readable for audit on past sends.

### 3b. Approval Queue (`AgentApprovalQueueItem` Prisma model)

```prisma
model AgentApprovalQueueItem {
  id            String   @id @default(cuid())
  tenantId      String
  agentName     String   // "appointment-reminder"
  recipientType String   // "seller" | "buyer"
  recipientId   String
  channel       Channel
  templateKey   String
  renderedBody  String   @db.Text // already-substituted preview
  scheduledFor  DateTime
  status        QueueStatus // PENDING | APPROVED | REJECTED | SENT | EXPIRED
  approvedBy    String?
  approvedAt    DateTime?
  rejectedReason String?
  createdAt     DateTime @default(now())
  expiresAt     DateTime // 24h default - if not approved by then, marks EXPIRED
}
```

- UI: `/(tenant)/[tenant]/agents/queue` lists pending items grouped by agent.
- Each item shows the rendered body (not the template — the actual message that will go out).
- One-click approve/reject. Mobile-friendly (Corey reviews from phone).
- Bulk approve for grouped items (e.g., 10 appointment reminders going out at 9am).

### 3c. Send Gate (`lib/agents/send-gate.ts`)

```typescript
// All send agents MUST call sendViaGate. Direct calls to GHL/Twilio/email
// providers are blocked at the linter level (custom eslint rule that errors
// on imports of @twilio, sendgrid, etc outside the gate module).

export async function sendViaGate(args: {
  tenantId: string;
  agentName: string;
  recipientType: 'seller' | 'buyer';
  recipientId: string;
  templateKey: string;
  variables: Record<string, string>;
  channel: 'SMS' | 'EMAIL';
}): Promise<{ status: 'sent' | 'queued' | 'rejected'; error?: string; suggestion?: string }>
```

Internal flow:
1. Look up template by key; assert APPROVED status. Reject if DRAFT.
2. Substitute variables; assert no LLM-generated text leaks in.
3. Check suppression list (recipient opted out, hard-bounced, blocklisted).
4. Check tenant send caps (per-tenant daily SMS, per-recipient cooldowns, quiet-hours 9pm-9am local).
5. Check whether template is autonomous-eligible. If yes → send. If no → enqueue for approval.
6. Send (Twilio for SMS, existing email provider for email).
7. Write `AgentSend` row with full audit data.
8. Return structured JSON.

### 3d. Audit Log (`AgentSend` Prisma model)

```prisma
model AgentSend {
  id              String   @id @default(cuid())
  tenantId        String
  agentName       String
  recipientType   String
  recipientId     String
  channel         Channel
  templateKey     String
  templateVersion Int
  renderedBody    String   @db.Text
  status          SendStatus // SENT | FAILED | BOUNCED | QUEUED
  approverId      String?  // null = autonomous send
  scheduledFor    DateTime
  sentAt          DateTime?
  errorReason     String?
  providerId      String?  // Twilio SID or email message ID
  createdAt       DateTime @default(now())
}
```

Every send appears here. Permanent record. Powers the audit trail and the "what did Gunner send my leads?" lookback.

### 3e. Suppression List (`SendSuppression` Prisma model)

```prisma
model SendSuppression {
  id           String   @id @default(cuid())
  tenantId     String
  recipientType String
  recipientId  String
  channel      Channel
  reason       String   // STOP_REQUESTED | HARD_BOUNCE | MANUAL_BLOCK | INVALID_NUMBER
  createdAt    DateTime @default(now())
  @@unique([tenantId, recipientType, recipientId, channel])
}
```

- Auto-populated on STOP reply (SMS), hard bounce (email), invalid number.
- Manual entries from team for special cases.
- `sendViaGate` checks this on every call; any match returns `rejected`.

### 3f. Settings UI

Settings Hub Section 4 (Calls) gets a new sub-section: **Outbound Templates**.
- Lists all `AgentTemplate` rows for this tenant.
- Tabs: DRAFT | APPROVED | ARCHIVED.
- "New template" wizard with channel, variable picker, preview.
- Per template: approval toggle, autonomy graduation date.

## 4. Code-level enforcement (linter rule)

A custom eslint rule under `eslint-plugin-gunner/no-direct-send`:
- Errors on `import` from `@twilio/voice-sdk`, `twilio`, `@sendgrid/mail`, etc., when not inside `lib/agents/send-gate.ts`.
- Errors on `fetch(ghlBaseUrl + '/conversations/messages')` outside the gate (GHL SMS path).

This means an agent or refactor cannot accidentally bypass the gate. The lint rule blocks it before code review.

## 5. Quiet hours + send caps (defaults)

| Rule | Default value | Configurable per tenant |
|---|---|---|
| Quiet hours | 9pm-9am recipient-local | yes |
| Per-tenant daily SMS cap | 200/day | yes |
| Per-recipient cooldown | 24h between any 2 sends to same recipient | yes |
| Burst limit | 10 sends/min per tenant | no (hard cap) |

`sendViaGate` enforces all of these at the code level.

## 6. Test plan

- **Unit:**
  - Template substitution correctness; missing-variable rejection.
  - Suppression list match prevents send.
  - Quiet hours rejection.
  - Daily cap rejection.
- **Integration:**
  - Approved template + clean recipient → send.
  - Draft template + clean recipient → reject.
  - Approved template + suppressed recipient → reject + audit log.
  - Bulk-approve flow in queue UI.
- **Lint rule:**
  - Confirm CI blocks any PR that imports Twilio outside the gate.

## 7. Rollout

1. Ship database models + send gate library + lint rule (no UI, no agents).
2. Ship Settings UI for template management.
3. Ship Approval Queue UI.
4. Wire one tenant (Corey's) to use the gate for ALL existing send paths (migrate from current GHL-direct sends).
5. Run for 1 week. Verify zero gate bypasses.
6. Only then enable Wave 3 agents.

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Gate is down (DB unreachable) | All sends fail closed. Better silent than out-of-control. |
| Approver doesn't review queue within 24h | Item EXPIRES. Audit log shows "expired unapproved" — not a silent send. |
| Lint rule disabled by a developer | CI catches it (rule enforced in `npm run lint`); main branch protected. |
| Template variables contain malicious content (XSS in email) | Always escape; render via sanitized HTML helper. |

## 9. Implementation order (within Wave 3 build phase)

1. Prisma models + migration.
2. `lib/agents/send-gate.ts` (write + audit; no UI yet).
3. Suppression handling + STOP keyword handler for SMS (inbound).
4. Lint rule.
5. Settings UI (template management).
6. Approval Queue UI.
7. Migrate one existing send path (e.g., the current dispo SMS) through the gate as a proof of concept.
8. THEN start Wave 3 agents in priority order.

## 10. Why this matters

Every other Wave 3 spec depends on this. Without the gate:
- An agent can hallucinate a phone number and text a stranger.
- A prompt injection in a transcript can rewrite the agent's outbound message.
- A regression in any agent can blast hundreds of customers.

With the gate:
- Template content is human-vetted, version-controlled, immutable per send.
- Recipient is resolved from the DB, not from LLM output.
- Every send is auditable.
- Worst case bug: a wrong template gets sent to a real recipient (still bad, but bounded and observable).

---

## Wave 1 — Site-keeping

### 1.1 cron-sentinel

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

---

### 1.2 stuck-calls-recovery

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

---

### 1.3 tcp-anomaly-surfacer

# tcp-anomaly-surfacer

> Wave: 1
> Status: spec
> Risk: low
> Replaces: humans noticing buy signals from dashboards (currently invisible until someone reviews)

## 1. Purpose

Watch every property's TCP score. When a property's TCP jumps significantly (high probability + low team engagement), surface it as a **Buy Signal** on the right user's dashboard. The Buy Signal is in Rule 5 of CLAUDE.md but no agent currently produces it.

## 2. Trigger

Cron, every 30 minutes (`*/30 * * * *`). Plus event-driven hook from `scoring.ts → calculateTCP()` when delta > threshold (so big jumps surface immediately).

```toml
[[cron]]
name = "tcp-anomaly-surfacer"
schedule = "*/30 * * * *"
command = "npx tsx scripts/agents/tcp-anomaly-surfacer.ts"
```

## 3. Inputs

- `properties.{tcp_score, tcp_factors, tcp_updated_at, assignedUserId, acqStatus}`.
- `property_tcp_history` (new table) — rolling history of TCP values per property for delta calculation.
- `tasks` and `calls` for engagement signal (when was last touch?).
- `buyer_matches` to enrich the signal context.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getTcpDeltas(tenantId, sinceMinutes)` | tenant, age | list of `{ propertyId, tcpFrom, tcpTo, lastTouchAt, assignedUserId }` |
| `getPropertyContext(propertyId)` | id | property + seller + last call + open tasks + buyer count |
| `createBuySignal(propertyId, userId, reason, urgency)` | inputs | inserts `buy_signals` row, fires `internal-alert-hub` (Wave 2) when available |
| `suppressSignal(propertyId, reason)` | id, reason | so the agent doesn't re-create a signal a user already dismissed |

## 5. Outputs

- New table `buy_signals(id, tenantId, propertyId, userId, reason, urgency, createdAt, dismissedAt)`.
- Surfaced on `/(tenant)/dashboard` as a "Buy Signals" panel.
- Audit log: `tcp.signal.created`.

## 6. Approval gates

Fully autonomous. No customer contact. Worst case: false positive surfaces a property to a rep that isn't actually hot — easily dismissed.

## 7. Completion signal

`stop_reason: "end_turn"`. Per-tenant: gather TCP deltas → for each delta above threshold, call `getPropertyContext` → call `createBuySignal` if not suppressed → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| TCP factors malformed (JSON corrupt) | Skip property, log WARNING. |
| Property assignedUserId is null | Create signal scoped to tenant admin instead of user. |
| Duplicate signal (already exists, not dismissed) | No-op. |

## 9. Test plan

- **Unit:** Threshold logic — TCP jump 0.2 → 0.85 = signal; 0.6 → 0.65 = no signal; 0.85 → 0.9 = no signal (already high, no jump).
- **Integration:** Seed property history showing a 0.3 → 0.8 jump in 24h with no recent touch. Run agent. Assert signal created for the assigned user.
- **Production rollout:** Observe-only 1 week (write to `buy_signals` but don't surface to UI). Manually review 50 signals for true-positive rate. If > 70% TP, ship UI.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/tcp-anomaly-surfacer.ts`
  - `lib/agents/tcp-anomaly-surfacer/{index,tools}.ts`
  - `prisma/schema.prisma` — add `BuySignal`, `PropertyTcpHistory`.
  - `lib/ai/scoring.ts` — extend `calculateTCP` to append history row + fire event when delta > 0.2.
  - `app/(tenant)/[tenant]/dashboard/page.tsx` — add Buy Signals panel.
- **Model:** `claude-haiku-4-5-20251001` (lightweight reasoning over numeric deltas + a few entity facts).
- **Threshold tuning:** Start with absolute-delta > 0.2 AND target TCP > 0.65 AND no touch in last 48h. Adjust based on TP rate.
- **Reason field:** Agent generates a 1-sentence reason string ("TCP jumped from 0.31 to 0.78 after Tuesday's call with strong motivation signals; no follow-up scheduled.") — this is the dashboard hook for the user.
- **Cost:** ~$2/day per tenant at expected scale.

---

### 1.4 webhook-drift-watchdog

# webhook-drift-watchdog

> Wave: 1
> Status: spec
> Risk: low
> Replaces: once-a-day `reconcile-ghl-pipelines` blindspot — currently drift between GHL and Gunner is invisible for up to 24h

## 1. Purpose

Detect when GHL webhooks have stopped firing or are firing at an abnormal rate. The current `reconcile-ghl-pipelines` cron runs once a day at 4am — this agent runs hourly and catches drift much earlier, then triggers an early reconciliation if needed.

## 2. Trigger

Cron, every hour (`0 * * * *`).

```toml
[[cron]]
name = "webhook-drift-watchdog"
schedule = "0 * * * *"
command = "npx tsx scripts/agents/webhook-drift-watchdog.ts"
```

## 3. Inputs

- `webhook_receipts` (new table) — every received GHL webhook writes a row: `{ eventType, ghlObjectId, receivedAt, processedAt, processingError }`.
- `audit_logs` for `ghl.webhook.received` entries.
- Baseline expected rates per tenant — derived from rolling 7-day median per event type.
- `properties.updatedAt` and `calls.createdAt` to cross-check against webhook receipts.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getWebhookRates(tenantId, sinceMinutes)` | tenant, age | per-event-type count + average for that timewindow over last 7 days |
| `crossCheckGhlPolling(tenantId, eventType)` | tenant, eventType | hits GHL API to count actual events in window. If GHL says 12 happened and Gunner saw 4 webhooks → drift. |
| `triggerEarlyReconciliation(tenantId, reason)` | tenant, reason | invokes `scripts/reconcile-ghl-pipelines.ts` for this tenant outside the 4am window |
| `logWatchdogFinding(severity, message, payload)` | severity, msg | writes audit log |
| `escalateToOwner(reason, details)` | reason, details | writes `agent_escalations` row, calls `internal-alert-hub` when available |

## 5. Outputs

- `webhook_receipts` rows (continuously, from the webhook handler — instrumentation lives in `app/api/webhooks/ghl/route.ts`).
- `audit_logs` entries: `webhook.drift.{healthy|degraded|critical}`.
- `agent_escalations` for CRITICAL findings.
- Early reconciliation runs when drift detected.

## 6. Approval gates

Fully autonomous. `triggerEarlyReconciliation` is idempotent (the reconcile script handles being run multiple times safely).

## 7. Completion signal

`stop_reason: "end_turn"`. Per tenant: gather rates → compare to baseline → classify → take one action → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Webhook receipt count for an event type is 0 over 6 hours when median is > 5 | CRITICAL. Trigger reconciliation + escalate. |
| Webhook rate is 50%+ below median | WARNING. Trigger reconciliation but don't escalate yet. |
| GHL polling cross-check fails (rate limit) | Skip cross-check this run; rely on baseline-only signal. |
| Tenant has no baseline yet (new tenant, < 7 days of data) | Skip drift check; log INFO. |

## 9. Test plan

- **Unit:** Baseline calculation correctness; classification thresholds.
- **Integration:** Seed `webhook_receipts` with normal traffic for 7 days, then a 24h dropout. Run agent. Assert reconciliation + escalation fire.
- **Production rollout:**
  1. Add `webhook_receipts` instrumentation (no agent).
  2. After 14 days of baseline data, enable agent in observe-only.
  3. After 1 week of clean shadow runs, enable `triggerEarlyReconciliation`.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/webhook-drift-watchdog.ts`
  - `lib/agents/webhook-drift-watchdog/{index,tools}.ts`
  - `prisma/schema.prisma` — add `WebhookReceipt` model.
  - `app/api/webhooks/ghl/route.ts` — write a `WebhookReceipt` row on every receipt.
- **Model:** `claude-haiku-4-5-20251001`.
- **Cost:** trivial (~$0.50/day per tenant).
- **Cross-link:** When `internal-alert-hub` (Wave 2) ships, replace direct escalations with hub calls.

---

## Wave 2 — Internal team work

### 2.1 lead-triage

# lead-triage

> Wave: 2
> Status: spec
> Risk: low-medium
> Replaces: dispatcher / admin manually reviewing new GHL leads, scoring motivation, assigning owners, tagging urgency

## 1. Purpose

When a new lead enters GHL (`ContactCreated` webhook or `OpportunityCreate`), classify it, score motivation, assign the right team member, and create the first task. No outbound messaging — purely internal scoring and routing.

## 2. Trigger

Event-driven, via the existing GHL webhook handler `handleContactChange()` and `handleOpportunityCreate()`. Webhook writes a job to `agent_jobs(agent: "lead-triage", payload: {contactId|opportunityId})`. A worker drains this queue.

Plus catch-up cron every 30 min for any job that didn't get processed:

```toml
[[cron]]
name = "lead-triage-catchup"
schedule = "*/30 * * * *"
command = "npx tsx scripts/agents/lead-triage-catchup.ts"
```

## 3. Inputs

- GHL contact fields: name, phone, email, source, tags, custom fields.
- Linked opportunity (if any): pipeline, stage, monetary value.
- Property data (if `OpportunityCreate` triggered Property stub creation): address, vendor enrichment.
- Tenant's team config: which users handle which lead sources/markets/lanes.
- Historical: prior contacts at the same phone/email/address.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `fetchGhlContact(ghlContactId)` | id | full contact + linked opportunities |
| `findDuplicateLeads(phone, email, address)` | identifiers | list of existing contacts that may be duplicates |
| `getTeamRouting(tenantId, leadSource, market)` | inputs | which user(s) should own this lead per tenant routing config |
| `scoreMotivation(contactData, propertyData)` | data | `{ score 0-1, factors: string[] }` — heuristic + LLM blended |
| `assignOwner(contactId, userId, reason)` | inputs | sets `properties.assignedUserId` or `sellers.assignedUserId`; writes audit log |
| `addTags(contactId, tags)` | inputs | applies Gunner-side tags (NOT GHL tags — keep GHL tags as source of truth, write to `sellers.tags`) |
| `createTriageTask(contactId, userId, title, urgency, dueAt)` | inputs | creates a Gunner Task; urgency drives Day Hub ranking |
| `flagDuplicate(contactId, duplicateOfId)` | inputs | links to existing record, suppresses follow-up triage |
| `logTriageDecision(contactId, decision, reasoning)` | inputs | audit log entry |

## 5. Outputs

- `properties.assignedUserId` or `sellers.assignedUserId` set.
- `sellers.tags` updated.
- `tasks` row created (first-touch task for owner).
- `sellers.likelihoodToSellScore` populated from motivation scoring.
- `audit_logs` entry: `lead.triaged`.
- Duplicate links recorded.

## 6. Approval gates

Fully autonomous for internal actions (assign, tag, task creation). **No customer contact.** No SMS, no email — the first-touch is left for the human owner.

## 7. Completion signal

`stop_reason: "end_turn"`. One pass per lead: fetch context → score → route → task → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| GHL fetch fails (rate limit) | Re-queue job, retry in 5 min. Max 3 retries → mark `agent_jobs.status=FAILED` + escalate. |
| No team routing config for this lead source | Default to tenant admin; log WARNING. |
| Duplicate found, very high confidence | Link + suppress, don't double-task. |
| Motivation score returns garbage from LLM | Fall back to a heuristic-only score (no LLM blend). |
| All assigned users are over their daily lead cap | Queue lead, escalate to manager. |

## 9. Test plan

- **Unit:** Routing rules per source/market; duplicate detection by phone+address; motivation heuristic.
- **Integration:** Seed 20 fixture leads (mix of sources, markets, with/without property data, with/without duplicates). Run agent. Assert correct owner + tags + task per lead.
- **Production rollout:**
  1. Observe-only 1 week: agent runs, writes audit log of *intended* decisions, but does NOT actually assign or create tasks.
  2. Manual review: dispatcher/admin compares agent's intended decisions to what they would have done. Aim for > 85% match.
  3. Enable assignment + tagging.
  4. Enable task creation 1 week later.

## 10. Implementation notes

- **Files:**
  - `lib/agents/lead-triage/{index,tools,scoring}.ts`
  - `scripts/agents/lead-triage-catchup.ts`
  - `lib/ghl/webhooks.ts` — enqueue `agent_jobs` row on lead events.
  - `prisma/schema.prisma` — add `AgentJob` model (shared infra).
- **Model:** `claude-sonnet-4-6` for scoring/reasoning; `claude-haiku-4-5-20251001` for routing-only path.
- **Token budget:** ~5k input / ~1k output per lead. At 50 leads/day per tenant = ~$3/day per tenant.
- **Prompt strategy:** System prompt enumerates the tenant's lead sources + team routing matrix + motivation rubric. User message contains the contact + property snapshot. Agent calls tools in order: fetch → dupe-check → score → route → task. End turn.
- **Important:** This agent does NOT modify GHL — only writes to Gunner DB. Stays consistent with `project_stage_sync_direction.md` memory (GHL is source of truth for CRM core; Gunner overlays intelligence).

---

### 2.2 pipeline-janitor

# pipeline-janitor

> Wave: 2
> Status: spec
> Risk: low
> Replaces: humans noticing stuck deals; no current process for "properties idle in this stage too long"

## 1. Purpose

Find properties stuck in a stage longer than the configured threshold. Surface them to the right owner. Optionally auto-progress (if rules allow) or auto-create a "ping" task.

## 2. Trigger

Cron, daily at 6am UTC (`0 6 * * *`).

```toml
[[cron]]
name = "pipeline-janitor"
schedule = "0 6 * * *"
command = "npx tsx scripts/agents/pipeline-janitor.ts"
```

## 3. Inputs

- `properties.{acqStatus, dispoStatus, longtermStatus, *_updated_at, assignedUserId}`.
- `tasks` linked to property (open tasks count, last completed task).
- `calls` linked to property (last call age + score).
- Tenant config: per-stage age thresholds (e.g., "Negotiation > 7 days = stuck"). Define defaults; override per tenant via Settings.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getStaleProperties(tenantId, lane, ageThresholds)` | inputs | list of stale property rows |
| `getPropertyEngagement(propertyId)` | id | open tasks, last call age, last touch age |
| `createPingTask(propertyId, userId, urgency)` | inputs | task assigned to property owner |
| `markAtRisk(propertyId, reason)` | inputs | sets `properties.atRiskAt`, writes audit log |
| `escalateToManager(propertyId, reason)` | inputs | when property has been stale + at risk for 2+ janitor passes, escalate |

## 5. Outputs

- `tasks` row (ping task per stale property).
- `properties.atRiskAt` set when applicable.
- `audit_logs`: `pipeline.stale.flagged|escalated`.
- Surfaced in Day Hub for the assigned user.

## 6. Approval gates

Fully autonomous for internal tasks/flags. No customer contact.

## 7. Completion signal

`stop_reason: "end_turn"`. Per tenant: gather stale list → for each, choose action (task vs flag vs escalate) → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Property has no assignedUserId | Task goes to tenant admin. |
| Property already has an open ping task | No-op (don't dupe). |
| Stage age threshold not configured | Use default (Negotiation=7d, Contracts=10d, Dispo=14d). |

## 9. Test plan

- **Unit:** Stale detection per lane + per stage age threshold.
- **Integration:** Seed 30 properties across stages with mixed ages. Run agent. Verify only properly-stale ones get ping tasks.
- **Production rollout:** Observe-only 1 week. Then enable.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/pipeline-janitor.ts`
  - `lib/agents/pipeline-janitor/{index,tools}.ts`
  - Settings hub: add per-stage age threshold UI to Section 2 (Pipeline) per Rule 3.
- **Model:** `claude-haiku-4-5-20251001`.
- **Cost:** ~$1/day per tenant.

---

### 2.3 followup-task-builder

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

---

### 2.4 property-enrichment-iterator

# property-enrichment-iterator

> Wave: 2
> Status: spec
> Risk: low
> Replaces: one-shot `enrich-property.ts` — currently enrichment runs once on create; if PR/BD/Google data later updates, the property doesn't get re-enriched

## 1. Purpose

Watch properties whose vendor enrichment data has updated since the last AI enrichment. Re-run the enrichment intelligently — preserve user-edited fields, only refresh AI-sourced fields, flag conflicts where vendor data disagrees.

## 2. Trigger

Cron, daily at 5am UTC (`0 5 * * *`).

```toml
[[cron]]
name = "property-enrichment-iterator"
schedule = "0 5 * * *"
command = "npx tsx scripts/agents/property-enrichment-iterator.ts"
```

Plus event-driven hook: when vendor data refresh completes (PropertyRadar / BatchData / Google), enqueue.

## 3. Inputs

- `properties.{field_sources, ai_enrichment_status, enrichmentLastRunAt, vendorDataUpdatedAt}`.
- Vendor blobs: PropertyRadar, BatchData, Google, CourtListener.
- `properties.fieldEdits` history (which fields the user has manually edited — those are sacred).
- Existing `enrichPropertyWithAI()` logic in `lib/ai/enrich-property.ts`.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `listStaleEnrichments(tenantId, sinceMinutes)` | tenant, age | properties where vendor data > AI enrichment timestamp |
| `getVendorDataDiff(propertyId)` | id | diff between current property fields and vendor data; highlights conflicts |
| `runIterativeEnrichment(propertyId, fieldsToRefresh)` | inputs | invokes `enrichPropertyWithAI()` for *only the specified fields*, preserving user-edited values |
| `flagConflict(propertyId, field, vendorValue, currentValue)` | inputs | writes `property_conflicts` row for human review |

## 5. Outputs

- `properties` field updates for the AI-managed fields (only those where `field_sources[field] !== 'user'`).
- `properties.enrichmentLastRunAt` updated.
- `property_conflicts` rows for human review when vendor and user disagree.

## 6. Approval gates

- Refreshing AI-sourced fields: autonomous (`field_sources[field] === 'ai'`).
- Overwriting user-edited fields: blocked at code level.
- ARV is the explicit exception (per `feedback_auto_fill_from_vendors.md`) — agent never overwrites a user-set ARV.

## 7. Completion signal

`stop_reason: "end_turn"`. Per property: diff → decide refresh-vs-flag → action → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Vendor data malformed | Skip property; log WARNING. |
| AI enrichment fails | Don't overwrite existing fields; mark `ai_enrichment_status=FAILED_RETRY`. |
| Conflict (vendor data wildly different from current AI value) | Flag for human, don't overwrite. |

## 9. Test plan

- **Unit:** Field-edit preservation; ARV protection; conflict thresholds.
- **Integration:** Seed property with mixed user-edited + AI-set fields. Run iterator with new vendor data. Assert user fields preserved, AI fields refreshed.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/property-enrichment-iterator.ts`
  - `lib/agents/property-enrichment-iterator/{index,tools}.ts`
  - `lib/ai/enrich-property.ts` — extend with `fieldsToRefresh` parameter (current API enriches all fields).
- **Model:** Reuse `claude-sonnet-4-6` from `enrich-property.ts`. No new agent reasoning needed beyond the diff classifier (Haiku).
- **Cost:** ~$0.50/property iterated. Capped at 100 properties/run = $50/day worst case.

---

### 2.5 buyer-match-outreach-queue

# buyer-match-outreach-queue

> Wave: 2
> Status: spec
> Risk: low (queue only — no auto-send in Wave 2)
> Replaces: manual buyer list assembly when a new property is ready for disposition

## 1. Purpose

When a property hits the disposition lane, find matching buyers, rank by likelihood-to-buy, and queue an outreach list with vetted message templates. **Wave 2 ships queue-only — sending is handled by Wave 3 when the send framework lands.**

## 2. Trigger

Event-driven. `handleOpportunityUpdate()` in `lib/ghl/webhooks.ts` watches for `dispoStatus` transition into a disposition-ready stage. Enqueues an `agent_jobs(agent: "buyer-match-outreach-queue", payload: {propertyId})` row.

Plus catch-up cron daily at 8am UTC.

## 3. Inputs

- `properties.{address, market, type, beds, baths, price, dispoArtifacts}`.
- `buyers.{markets, propertyTypes, minBeds, maxBeds, minPrice, maxPrice, lastActiveAt, conversionScore}` — existing buyer-match logic in `lib/buyers/`.
- Buyer prior responses (open rates, reply rates from past `agent_send_log`).
- Tenant template registry (Wave 3): which templates exist + which are approved for use.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getMatchingBuyers(propertyId)` | id | ranked list of buyers (uses existing match logic) |
| `getBuyerEngagement(buyerId, lookbackDays)` | id, days | open/reply rate, last contact, suppression status |
| `getApprovedTemplates(tenantId, channel)` | tenant, channel | template registry entries marked approved |
| `composeOutreachList(propertyId, buyerIds, templateId)` | inputs | builds a draft outreach batch — buyer list + template + message preview per buyer |
| `enqueueForApproval(batchId)` | id | adds to `agent_approval_queue` for human review |

## 5. Outputs

- `agent_approval_queue` row: `{ propertyId, buyerIds, templateId, status: PENDING_APPROVAL }`.
- Surfaced in `/(tenant)/inventory/[propertyId]/dispo` with a "Approve & Send" button.
- Wave 2: human clicks approve → sends are still manual (uses existing dispo send endpoint).
- Wave 3: approval triggers send framework execution.

## 6. Approval gates

**Hard gate**: nothing sends in Wave 2. The agent only proposes a batch. A human owner must click approve. Even after Wave 3 ships, this agent stays in approval-required mode until Corey explicitly relaxes it.

## 7. Completion signal

`stop_reason: "end_turn"`. Per property: match buyers → score engagement → pick template → enqueue → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| No matching buyers | Log INFO; close job. |
| Buyer count > 100 | Cap at top 100 by score (don't blast a giant list). |
| No approved templates available | Escalate to admin: "you need to approve a template before dispo outreach can run." |
| Buyer in suppression list | Exclude from batch; log reason. |

## 9. Test plan

- **Unit:** Match ranking; engagement scoring; template selection logic.
- **Integration:** Seed property entering dispo. Fixture buyer set (mix of matched, suppressed, low-engagement). Run agent. Assert correct subset queued, correct template selected, suppressions respected.
- **Production rollout:** Ship queue-only mode immediately. Real send happens only when Wave 3 framework is live AND Corey approves a specific template family.

## 10. Implementation notes

- **Files:**
  - `lib/agents/buyer-match-outreach-queue/{index,tools}.ts`
  - `scripts/agents/buyer-match-outreach-queue-catchup.ts`
  - `prisma/schema.prisma` — add `AgentApprovalQueueItem`.
  - Reuse `lib/buyers/match-engine.ts` (existing) as the matching tool.
- **Model:** `claude-haiku-4-5-20251001` (mostly retrieval + ranking, very little LLM reasoning needed).
- **Cost:** ~$0.20 per property hitting dispo.

---

### 2.6 daily-operations-briefing

# daily-operations-briefing

> Wave: 2
> Status: spec
> Risk: low
> Replaces: reps figuring out where to start each morning (currently looking at Day Hub but no synthesis)

## 1. Purpose

Each morning, per user, generate a 5-bullet "here's your day" briefing: hottest leads, follow-ups due, buy signals, properties at risk, and one priority action. Internal-only — read in Day Hub.

## 2. Trigger

Cron, daily at 5:30am tenant-local time (`30 11 * * *` if tenants are US Eastern; will need per-tenant timezone handling).

```toml
[[cron]]
name = "daily-operations-briefing"
schedule = "30 11 * * *"
command = "npx tsx scripts/agents/daily-operations-briefing.ts"
```

(Schedule timezone TBD when multi-tenant rolls out.)

## 3. Inputs

- For each user:
  - Open tasks in their Day Hub (today + overdue).
  - Buy signals assigned to them (from `tcp-anomaly-surfacer`).
  - Properties at risk assigned to them (from `pipeline-janitor`).
  - Yesterday's call grades (top + bottom + total).
  - Appointments scheduled today.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getUserDayContext(userId, date)` | inputs | bundle of tasks, signals, risks, calls, appointments |
| `getYesterdayPerformance(userId)` | id | call count, avg score, deals advanced |
| `composeBriefing(context)` | context | LLM-generated 5-bullet summary |
| `saveBriefing(userId, date, content)` | inputs | writes `daily_briefings(userId, date, body, generatedAt)` |

## 5. Outputs

- `daily_briefings` row per user per day.
- Surfaced as a card on `/(tenant)/[tenant]/dashboard` and at the top of Day Hub.
- Optional: posted to `internal-alert-hub` (Wave 2) for in-app notification.

## 6. Approval gates

Fully autonomous. Internal-only. Worst case: low-value briefing — user ignores.

## 7. Completion signal

`stop_reason: "end_turn"`. Per user: gather → compose → save → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| User has zero activity (new user, vacation) | Generate a "welcome" or "no activity today" briefing. |
| LLM returns malformed JSON | Fall back to a template-only briefing (no LLM polish). |
| User logged in zero days this month | Skip; don't waste tokens. |

## 9. Test plan

- **Unit:** Briefing composition for: high-activity user, low-activity user, no-activity user.
- **Integration:** Fixture 10 users with varied activity. Run agent. Verify each gets an appropriate briefing.
- **Production rollout:** Generate but don't surface for 1 week. Manual review of briefings for quality. Then surface.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/daily-operations-briefing.ts`
  - `lib/agents/daily-operations-briefing/{index,tools}.ts`
  - `prisma/schema.prisma` — add `DailyBriefing` model.
- **Model:** `claude-haiku-4-5-20251001` (short generative task; quality bar is low — "this is fine" beats "this is silent").
- **Cost:** ~$0.10 per user per day. At 5 users/tenant = $15/month per tenant.

---

### 2.7 internal-alert-hub

# internal-alert-hub

> Wave: 2 (promoted from Wave 4 per Corey's priority 2026-05-11 — team-facing, not customer-facing)
> Status: spec
> Risk: low
> Replaces: GHL Slack/email/SMS alert workflows that ping the team when something happens

## 1. Purpose

Central routing for every team-facing alert: hot lead detected, missed call, appointment booked, agent escalation, cron failure, buy signal, etc. Replaces the patchwork of GHL workflows + ad-hoc emails. One place to configure who gets what.

## 2. Trigger

Called by other agents and webhooks via the `alertHub.send(alertType, payload)` API. Not its own cron — pure inbound router.

## 3. Inputs

- `alert_rules` (new table): `{ tenantId, alertType, userIds, channels: ["in_app","email","sms"], throttleSeconds, enabled }`.
- `alert_subscriptions` (new table): per-user opt-in/out.
- Incoming payloads from other agents.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `resolveRecipients(tenantId, alertType, payload)` | inputs | list of `{userId, channels}` who should receive this alert |
| `composeAlert(alertType, payload, channel)` | inputs | rendered subject + body per channel |
| `checkThrottle(userId, alertType)` | inputs | whether this user has hit the rate limit for this alert type today |
| `sendInApp(userId, subject, body, link)` | inputs | writes `in_app_notifications` row; pushes via Pusher / SSE if available |
| `sendEmail(userId, subject, body, link)` | inputs | sends via existing email provider (already exists in `lib/email/`) |
| `sendInternalSms(userId, body)` | inputs | sends to TEAM phone numbers only (allow-list of internal users). **Not customer SMS.** |
| `logAlert(alertType, userId, channel, status)` | inputs | audit log |

## 5. Outputs

- `in_app_notifications` rows (surfaced in app header bell).
- Emails sent.
- Internal SMS sent (to team only — gated via `internal_users.phoneVerified` flag).
- `audit_logs`: `alert.{sent|throttled|failed}`.

## 6. Approval gates

- **Internal-only:** team users only. Hard-coded recipient allow-list — agent CANNOT send to a phone number not in the tenant's `internal_users` table.
- All recipient resolution happens via tenant-scoped queries; no cross-tenant leakage possible.

## 7. Completion signal

`stop_reason: "end_turn"`. Per alert: resolve recipients → compose → throttle-check → send → end. Often this isn't even an LLM call — it's a router. Use LLM only for composing custom-tailored alert bodies; use templates for routine alerts.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Recipient not configured for this alert type | Default to tenant admin. |
| All channels disabled | Drop alert; log INFO (user has opted out, respect it). |
| Email send fails | Retry once; if still fails, fall back to in-app. |
| SMS to recipient hits provider rate limit | Queue; retry in 60s. |
| Same alert fires 10× in a minute | Coalesce into a single "you have 10 hot leads" alert. |

## 9. Test plan

- **Unit:** Recipient resolution per alert type; throttle logic; channel fallback.
- **Integration:** Fire 5 alert types, assert correct recipients and channels per tenant config.
- **Production rollout:**
  1. Build infra.
  2. Migrate alerts from existing GHL workflows one type at a time. Each migrated workflow: disable in GHL → enable in hub → verify equivalent behavior for 1 week → call it migrated.
  3. Track migration in `docs/OPERATIONS.md` "Active GHL Workflows" section.

## 10. Implementation notes

- **Files:**
  - `lib/agents/alert-hub/{index,router,composers}.ts`
  - `lib/agents/alert-hub/api.ts` — exported `alertHub.send(...)` API for other agents.
  - `prisma/schema.prisma` — add `AlertRule`, `AlertSubscription`, `InAppNotification`.
  - `app/(tenant)/[tenant]/settings/notifications/page.tsx` — new Settings page for alert prefs (extends Settings Hub).
  - `components/app-shell/notification-bell.tsx` — header bell for in-app alerts.
- **Model:** Mostly no LLM — routing + templating. LLM (`claude-haiku-4-5-20251001`) only when an alert type is configured for "smart compose" (rare).
- **Cost:** Near zero.
- **Cross-link:** Replaces direct escalation calls in `cron-sentinel`, `webhook-drift-watchdog`, `tcp-anomaly-surfacer`, `lead-triage`. Once shipped, refactor those agents to call `alertHub.send()` instead of writing `agent_escalations` rows directly.

---

## Wave 3 — Customer-facing sends

### 3.1 appointment-reminder

# appointment-reminder

> Wave: 3 (priority #1 — Corey's GHL kill list 2026-05-11)
> Status: spec
> Risk: medium
> Replaces: GHL appointment-reminder workflow (confirm + day-of)
> Depends on: `_send-framework.md` must be shipped first

## 1. Purpose

Send appointment confirmation and day-of reminder SMS to sellers (and optionally buyers) via vetted templates. Fixed templates, fixed timing, zero LLM-generated content.

## 2. Trigger

Three cron jobs (all via `_send-framework`):

```toml
[[cron]]
name = "appointment-reminder-confirm"
schedule = "*/15 * * * *"  # check every 15 min for new appointments
command = "npx tsx scripts/agents/appointment-reminder.ts confirm"

[[cron]]
name = "appointment-reminder-day-before"
schedule = "0 17 * * *"    # 5pm tenant-local, send day-before for next-day appts
command = "npx tsx scripts/agents/appointment-reminder.ts day-before"

[[cron]]
name = "appointment-reminder-day-of"
schedule = "0 8 * * *"     # 8am tenant-local, send day-of for today's appts
command = "npx tsx scripts/agents/appointment-reminder.ts day-of"
```

## 3. Inputs

- `appointments` (fetched live from GHL or stored locally — see `lib/ghl/appointments.ts`).
- `sellers` table for recipient phone/email.
- Tenant template registry (must include approved templates: `appointment_confirm_v1`, `appointment_day_before_v1`, `appointment_day_of_v1`).
- Suppression list.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getAppointmentsByWindow(tenantId, windowStart, windowEnd, status)` | inputs | list of appointments in window |
| `getSellerForAppointment(appointmentId)` | id | seller + property + recent activity |
| `chooseTemplate(stage, channel)` | inputs | template key from registry (confirm vs day-before vs day-of) |
| `sendViaGate(...)` | gate args | delegates to `_send-framework` send gate |
| `recordSentReminder(appointmentId, templateKey, sendId)` | inputs | upserts `appointment_reminders_sent` to prevent duplicates |

## 5. Outputs

- SMS sent via send gate (subject to approval queue per template autonomy status).
- `appointment_reminders_sent(appointmentId, templateKey, sendId, sentAt)` row.
- `audit_logs`: `appointment.reminder.sent`.

## 6. Approval gates

- **First 30 days:** every send goes through approval queue (template `autonomousAfter` is null).
- **After:** Corey graduates templates one at a time. Confirm template likely first (lowest risk: customer just booked, expects a confirmation).
- **Suppression:** if recipient opted out of marketing/appointment SMS, send gate rejects.

## 7. Completion signal

`stop_reason: "end_turn"`. Per cron mode (confirm / day-before / day-of): list applicable appointments → for each, dedupe → send → end.

## 8. Templates (initial draft — Corey to approve)

```
appointment_confirm_v1 (sent immediately after appointment booked)
"Hi {{sellerFirstName}}, this is {{repName}} from {{tenantName}}. Confirming our appointment {{appointmentTime}} at {{propertyAddress}}. Reply YES to confirm or call {{repPhone}} to reschedule."

appointment_day_before_v1 (sent 5pm day before)
"Hi {{sellerFirstName}}, just a reminder we have our walkthrough tomorrow at {{appointmentTime}}. Anything come up? Call {{repPhone}} if so."

appointment_day_of_v1 (sent 8am day of)
"Hi {{sellerFirstName}}, looking forward to seeing you at {{appointmentTime}} today. {{repName}}"
```

All three are short, factual, no hype, no LLM content. Match Corey's "professional, no hype" tone (per `feedback_ai_strict_facts.md`).

## 9. Failure modes & retries

| Failure | Behavior |
|---|---|
| Template not approved yet | Skip sends entirely; log WARNING. |
| Duplicate (already sent this template for this appointment) | No-op. |
| Recipient suppressed | Gate rejects; log INFO. |
| Send gate down | Skip this run; next cron picks up. |
| Appointment cancelled in GHL between job enqueue and send | Re-check status at send time; skip if cancelled. |

## 10. Test plan

- **Unit:** Template selection per stage; dedupe logic.
- **Integration:** Seed 5 appointments at varying times. Run all 3 cron modes across a fixture day. Assert correct sends queued (not actually sent in test env — send gate is in dry-run mode).
- **Production rollout:**
  1. Build agent with `sendViaGate` in dry-run mode (logs intent, doesn't actually send).
  2. Run for 1 week parallel to existing GHL appointment workflow. Compare sends GHL would have made vs sends agent intends to make. Investigate every difference.
  3. Disable GHL appointment workflow.
  4. Enable real sends — first day under approval queue.
  5. After 30 days clean, graduate confirm template to autonomous.

## 11. Implementation notes

- **Files:**
  - `scripts/agents/appointment-reminder.ts`
  - `lib/agents/appointment-reminder/{index,tools}.ts`
  - `prisma/schema.prisma` — add `AppointmentReminderSent`.
  - Reuse: `lib/ghl/appointments.ts`, `lib/agents/send-gate.ts`.
- **Model:** No LLM. This is a deterministic scheduler. Templates are pre-vetted; substitution is rule-based. Resist the temptation to "personalize" — that's free-form, which Corey said no to.
- **Cost:** SMS provider cost only (~$0.01/send). No Anthropic cost.

---

### 3.2 drip-cadence-migrator

# drip-cadence-migrator

> Wave: 3 (priority #2 — Corey's GHL kill list 2026-05-11)
> Status: spec
> Risk: high — multi-message, multi-day cadences hitting many customers
> Replaces: GHL drip campaigns (long nurture sequences)
> Depends on: `_send-framework.md` must be shipped first

## 1. Purpose

Replace GHL's multi-week drip campaigns with Gunner-controlled cadences. Each cadence is a sequence of pre-vetted templates with deterministic timing. Cadences are migrated one at a time from GHL — never multiple in parallel during the initial migration phase.

## 2. Trigger

Two paths:

1. **Enrollment:** Other agents (lead-triage, followup-task-builder) or webhooks enroll recipients into a cadence: `cadenceManager.enroll(recipientId, cadenceKey)`.
2. **Step processor cron:** every 15 minutes, find enrollments whose next step is due, send via gate.

```toml
[[cron]]
name = "drip-cadence-step-processor"
schedule = "*/15 * * * *"
command = "npx tsx scripts/agents/drip-cadence-step-processor.ts"
```

## 3. Inputs

- `cadence_definitions` (new table): cadence config (key, name, steps[], pacing).
- `cadence_enrollments` (new table): which recipients are in which cadence + their current step.
- Template registry from `_send-framework`.
- Suppression list, quiet hours, caps from `_send-framework`.

## 4. Schema

```prisma
model CadenceDefinition {
  id        String   @id @default(cuid())
  tenantId  String
  key       String   // "cold-seller-30day-v1"
  name      String
  steps     Json     // [{ delayHours: 0, templateKey: "cold_intro_v1", channel: "SMS" }, ...]
  exitOn    Json     // ["reply", "appointment_booked", "marked_dead"]
  status    CadenceStatus // DRAFT | ACTIVE | ARCHIVED
  createdAt DateTime @default(now())
  @@unique([tenantId, key])
}

model CadenceEnrollment {
  id            String   @id @default(cuid())
  tenantId      String
  cadenceKey    String
  recipientType String
  recipientId   String
  enrolledAt    DateTime @default(now())
  currentStep   Int      @default(0)
  status        EnrollmentStatus // ACTIVE | PAUSED | COMPLETED | EXITED
  exitReason    String?
  nextStepAt    DateTime?
  @@unique([tenantId, cadenceKey, recipientType, recipientId])
}
```

## 5. Tools

| Tool | Input | Returns |
|---|---|---|
| `getDueSteps(tenantId, limit)` | inputs | enrollments where `nextStepAt <= now` AND `status = ACTIVE` |
| `loadCadence(tenantId, cadenceKey)` | inputs | full cadence definition |
| `checkExitConditions(enrollmentId)` | id | whether recipient triggered an exit condition (replied, booked, etc.) since last step |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `advanceStep(enrollmentId)` | id | increments currentStep, sets `nextStepAt` per cadence pacing |
| `exitEnrollment(enrollmentId, reason)` | inputs | marks EXITED |

## 6. Outputs

- SMS/email sends via gate.
- `cadence_enrollments.currentStep`, `nextStepAt`, `status` updates.
- `cadence_send_log` joins with `AgentSend` table.
- `audit_logs`: `cadence.step.sent|exited|paused`.

## 7. Approval gates

- **Cadence-level:** an entire cadence definition requires Corey's approval before activation. DRAFT cadences cannot enroll.
- **Template-level:** every template within a cadence must already be APPROVED in the template registry.
- **Send-level:** initial rollout has every send going through the approval queue. Graduation is **per cadence**, not per template — meaning Corey signs off on the whole cadence going autonomous after observing 30+ days.
- **Exit-on-reply is non-negotiable:** if a recipient replies to ANY cadence message, the enrollment is paused immediately (handled by inbound SMS handler — see Section 9).

## 8. Completion signal

`stop_reason: "end_turn"`. Per processor run: list due steps → for each, check exits → send → advance → end.

## 9. Inbound SMS handling

Critical for cadences: when a recipient replies, we must catch it instantly and pause their cadence (and any other cadences they're in).

- `lib/ghl/webhooks.ts → handleMessage()` already logs inbound. Extend to:
  - Check active `cadence_enrollments` for this recipient.
  - Pause all of them (`status=PAUSED`, `exitReason="recipient_replied"`).
  - Route the reply to the assigned rep (via `internal-alert-hub`).
- Inbound "STOP" keyword → add to suppression list + exit all cadences.

## 10. Failure modes & retries

| Failure | Behavior |
|---|---|
| Cadence step references unapproved template | Pause enrollment; escalate (cadence configuration broken). |
| Recipient phone changed | Re-resolve from DB at send time. If still invalid, mark BOUNCED + exit cadence. |
| Send gate rejects (cap hit) | Push `nextStepAt` forward by 1 hour; retry next cycle. |
| Recipient replied (event missed) | Step processor double-checks `cadence_enrollments.status` and inbound message history before sending. |
| Cadence definition edited mid-flight | New enrollments use new definition; in-flight enrollments stay on old version (immutable per enrollment via `cadenceVersion` field — add to schema). |

## 11. Test plan

- **Unit:** Step scheduling math; exit-on-reply detection; pacing intervals respect quiet hours.
- **Integration:** Define a 5-step cadence. Enroll 10 test contacts. Simulate replies on 3 of them mid-cadence. Run processor for full 30-day window (time-mocked). Assert: 7 complete the cadence, 3 exit on reply, no sends during quiet hours, no duplicate sends.
- **Production rollout:**
  1. Build infra + first cadence definition (DRAFT).
  2. Corey approves the cadence definition + every template in it.
  3. **Migrate one GHL drip at a time.** For each:
     - Disable GHL workflow.
     - Run Gunner cadence in dry-run mode for 48h.
     - Cross-check Gunner intended sends against what GHL would have sent.
     - Enable real sends with full approval queue.
     - After 30 days clean, graduate to autonomous.

## 12. Implementation notes

- **Files:**
  - `scripts/agents/drip-cadence-step-processor.ts`
  - `lib/agents/drip-cadence/{index,tools,enrollment}.ts`
  - `prisma/schema.prisma` — add `CadenceDefinition`, `CadenceEnrollment`.
  - `app/(tenant)/[tenant]/settings/cadences/page.tsx` — Settings Hub sub-page under Section 4 (Calls — repurpose to "Communications") for cadence management.
  - `lib/ghl/webhooks.ts` — extend `handleMessage` to pause enrollments on reply.
- **Model:** No LLM. Pure deterministic scheduler. This is the most-controlled agent precisely because it sends the most messages.
- **Cost:** SMS/email provider cost only.

## 13. Critical principle: no LLM in the message body

Drip cadences are exactly where LLMs are tempting and exactly where they're dangerous. Variations of "personalize this message to the recipient's situation" produce non-determinstic output, which means:
- We can't audit what the customer will receive before it goes out.
- A prompt injection in source data can corrupt the message.
- Compliance review can't sign off on a class of messages.

The cadence-migrator sends ONLY substituted templates. Personalization happens via variable substitution (`{{firstName}}`, `{{propertyAddress}}`) — never via generation.

---

### 3.3 missed-call-autoresponder

# missed-call-autoresponder

> Wave: 3
> Status: spec
> Risk: medium
> Replaces: GHL "missed call" workflow that fires a single SMS when reps don't pick up
> Depends on: `_send-framework.md` must be shipped first

## 1. Purpose

When an inbound call to a Gunner-tracked number is missed (no answer, voicemail), send a single vetted SMS within seconds. Single trigger, single message — the simplest possible customer-facing agent.

## 2. Trigger

Event-driven. The existing `handleCallCompleted` webhook in `lib/ghl/webhooks.ts` already creates a call row. Extend it: if `direction=INBOUND` AND `duration < threshold` (e.g., < 15 seconds, indicates voicemail/missed) AND no answer flag, enqueue `agent_jobs(agent: "missed-call-autoresponder", payload: {callId})`.

Worker drains the queue immediately (within ~30 seconds).

## 3. Inputs

- The missed `Call` row (recording URL, contact phone, direction, duration).
- Linked `Seller` (recipient phone, name, market).
- Suppression list.
- Template registry (`missed_call_v1`).
- Recent send history (don't fire if same recipient already got this template in last 24h).

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getMissedCallContext(callId)` | id | call + linked seller + last contact age |
| `wasRecentlyTexted(recipientId, templateKey, withinHours)` | inputs | bool — dedupe |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `recordAutoresponse(callId, sendId)` | inputs | `missed_call_autoresponses` row |

## 5. Outputs

- One SMS sent via gate.
- `missed_call_autoresponses(callId, sendId, sentAt)` row.
- `audit_logs`: `missed_call.autoresponder.{sent|skipped}`.

## 6. Approval gates

- First 30 days: every send goes through approval queue.
- Highest-priority candidate for autonomous graduation because: single message, deterministic trigger, customer expects something after a missed call.
- Suppression list respected. Quiet hours respected (if missed call happens at 11pm, response goes out at 9am).

## 7. Template (draft — Corey to approve)

```
missed_call_v1
"Hi {{sellerFirstName}}, this is {{repName}} at {{tenantName}} — sorry I missed your call. I'll try you back shortly, or text me here if that's easier. Thanks."
```

Variants for tenant tone — Corey may want to customize per market. Each variant gets its own template key.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Duration just over threshold (rep picked up but call ended fast) | Don't send (call was answered, possibly transferred). Threshold tuning matters. |
| Recipient is internal (caller is another team member testing) | Skip if recipient phone is in `internal_users.phoneNumber`. |
| Multiple missed calls in 10 minutes from same number | Send only once; subsequent calls suppress for 24h. |
| Quiet hours | Hold; send at 9am local. |

## 9. Test plan

- **Unit:** Missed-call detection heuristic; dedupe window; internal-user exclusion.
- **Integration:** Seed 10 calls (mix of: answered, missed in business hours, missed at night, missed by internal user, duplicate missed). Run agent. Assert correct sends queued.
- **Production rollout:**
  1. Build agent with `sendViaGate` in dry-run.
  2. Run for 1 week parallel to existing GHL workflow.
  3. Disable GHL.
  4. Enable real sends through approval queue.
  5. After 14 days clean (this is a high-volume, low-risk template), Corey can graduate to autonomous.

## 10. Implementation notes

- **Files:**
  - `lib/agents/missed-call-autoresponder/{index,tools}.ts`
  - `lib/ghl/webhooks.ts` — extend `handleCallCompleted` to enqueue job.
  - `prisma/schema.prisma` — `MissedCallAutoresponse` model.
- **Model:** No LLM. Deterministic.
- **Cost:** SMS provider only.
- **Latency target:** message goes out within 60 seconds of call ending (when within business hours). Queue processor runs every 30 seconds for this agent specifically (faster than the 15-min default).

---

### 3.4 no-show-recovery

# no-show-recovery

> Wave: 3
> Status: spec
> Risk: medium
> Replaces: GHL no-show workflow — when an appointment is missed, fire a recovery sequence
> Depends on: `_send-framework.md`, `appointment-reminder.md` (shared appointment schema)

## 1. Purpose

Detect appointments marked as no-show, send a single recovery SMS, then route to the assigned rep for human follow-up. One message, one route — does NOT try to autonomously re-engage.

## 2. Trigger

Cron, hourly (`0 * * * *`), looking back at appointments that were scheduled in the last 24h with no completion record.

```toml
[[cron]]
name = "no-show-recovery"
schedule = "0 * * * *"
command = "npx tsx scripts/agents/no-show-recovery.ts"
```

Plus event-driven: if `appointments.status` flips to NO_SHOW (via GHL webhook or manual update), enqueue immediately.

## 3. Inputs

- Appointments past their scheduled time with no `completedAt` or with `status=NO_SHOW`.
- Recent call/SMS history for the seller (to inform whether to send recovery vs flag as ghosted).
- Template registry (`no_show_recovery_v1`).
- Suppression list.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `findNoShows(tenantId, sinceHours)` | inputs | list of appointments past time, no completion |
| `getSellerContactHistory(sellerId, sinceDays)` | inputs | recent inbound/outbound contact attempts |
| `classifyMiss(context)` | context | one of `{send_recovery, route_to_rep_only, mark_ghosted}` based on prior contact history |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `createRepFollowupTask(sellerId, userId, reason)` | inputs | task in rep's Day Hub |
| `markGhosted(sellerId)` | id | adds `sellers.ghostedAt`; pauses other agents from auto-contacting |

## 5. Outputs

- One SMS via gate (for `send_recovery` decisions).
- Task created for assigned rep (always).
- `sellers.ghostedAt` set (for `mark_ghosted` decisions, after multiple no-shows).
- `audit_logs`: `no_show.recovery.{sent|routed|ghosted}`.

## 6. Approval gates

- First 30 days: approval queue.
- Recovery SMS template ships with cadence-style protections (one send per appointment, never re-sent on the same no-show).
- "Mark ghosted" requires 3+ unanswered touches in 14 days — code-enforced threshold.

## 7. Template (draft)

```
no_show_recovery_v1
"Hi {{sellerFirstName}}, looks like we missed each other at {{appointmentTime}}. No worries — when's a better time for me to swing by? — {{repName}}"
```

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Appointment was actually completed but not marked | Reconcile with calendar data before sending. Wait 30 min past appointment to allow for late completion. |
| Seller is already in another active cadence | Pause that cadence; send recovery SMS; route to rep. |
| Quiet hours | Hold; send at 9am local. |

## 9. Test plan

- **Unit:** No-show detection logic; classification of recovery vs route-only vs ghosted; threshold for ghosting.
- **Integration:** Seed 8 appointment scenarios (clean no-show, late completion, multiple no-shows, already ghosted). Run agent. Verify correct action per scenario.
- **Production rollout:** Same pattern as missed-call-autoresponder — dry-run alongside existing GHL workflow, then migrate.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/no-show-recovery.ts`
  - `lib/agents/no-show-recovery/{index,tools}.ts`
- **Model:** No LLM for sending. `classifyMiss` can be heuristic-only initially (Haiku optional if heuristic is wrong > 20% of the time).
- **Cost:** SMS provider only.

---

### 3.5 walkthrough-coordinator

# walkthrough-coordinator

> Wave: 3 (last in Wave 3 — most complex customer-facing agent)
> Status: spec
> Risk: medium-high
> Replaces: manual walkthrough scheduling (reps coordinating times with sellers manually)
> Depends on: `_send-framework.md`, `appointment-reminder.md` (creates the appointments this manages)

## 1. Purpose

When a property is ready for a walkthrough (stage transition or rep-initiated), coordinate the time via a constrained back-and-forth using vetted templates. Pick a time the seller agrees to, write it as an appointment, hand off to `appointment-reminder` for confirmations.

**This is the most ambitious Wave 3 agent.** It involves a multi-message exchange with a real seller. The constraints below keep it safe.

## 2. Trigger

- Event: rep marks property as "needs walkthrough" → enqueues `walkthrough_request`.
- Event: stage transition into a walkthrough-required stage → enqueues automatically.

## 3. Inputs

- Property + seller.
- Rep's calendar availability (read-only from Google Calendar via `mcp__claude_ai_Google_Calendar__*` integration if connected, OR a local availability config).
- Template registry: walkthrough proposal/confirmation/decline-handling templates.
- Conversation history for this seller.

## 4. Constrained dialog model (key safety mechanism)

This agent does NOT run as a free-form chat. It runs as a finite state machine with limited template choices per state:

```
STATE INITIAL_PROPOSAL
  Send: walkthrough_propose_v1 (offers 3 specific time slots from rep's calendar)
  Wait for reply.

STATE AWAITING_REPLY
  Inbound reply classified by Haiku-tier LLM into:
    A. picked_slot (seller agreed to one of the offered times) → STATE CONFIRMING
    B. asked_alternative (seller proposed different time) → STATE OFFERING_ALTERNATIVE
    C. declined (not interested) → STATE EXITED (route to rep)
    D. ambiguous (couldn't classify) → STATE EXITED (route to rep)

STATE CONFIRMING
  Create appointment in calendar.
  Send: walkthrough_confirm_v1.
  Hand off to appointment-reminder.

STATE OFFERING_ALTERNATIVE
  Re-check rep calendar for proposed alternative.
  If available → send walkthrough_confirm_v1.
  If not → send walkthrough_offer_alts_v1 with 3 different slots.
  Max 2 rounds, then route to rep.

STATE EXITED
  Create task for rep with the seller's last message.
```

Critical: every state can only send one of a small set of templates. The LLM only does **classification** (which state am I in based on the seller's reply?). It does NOT compose messages.

## 5. Tools

| Tool | Input | Returns |
|---|---|---|
| `getRepAvailability(userId, dateRangeStart, dateRangeEnd)` | inputs | free slots from calendar |
| `proposeSlots(propertyId, sellerId)` | inputs | builds 3 slot options, returns rendered preview |
| `classifyReply(replyText)` | text | one of `picked_slot | asked_alternative | declined | ambiguous` + extracted slot details |
| `createAppointment(propertyId, sellerId, time, repId)` | inputs | writes to calendar + GHL |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `createRepHandoffTask(propertyId, sellerId, lastMessage)` | inputs | task for human takeover |

## 6. Outputs

- SMS via gate (constrained to ~3-5 messages per coordination max).
- `appointments` row created (Gunner side) + GHL appointment.
- Rep handoff task on failures.
- `audit_logs` per state transition.

## 7. Approval gates

- **First 90 days:** every outbound message goes through approval queue. This is the strictest Wave 3 agent for trial.
- Hard cap: max 3 outbound messages per coordination. After that, mandatory human takeover.
- Hard cap: max 1 coordination active per seller at a time (no parallel walkthrough proposals).
- Recipient suppression: as always, respected.

## 8. Completion signal

`stop_reason: "end_turn"` after each action. This is the only Wave 3 agent that's truly multi-turn — but each turn is one state transition, not a free-form conversation. Agent ends turn after each step.

## 9. Templates (drafts)

```
walkthrough_propose_v1
"Hi {{sellerFirstName}}, this is {{repName}} from {{tenantName}}. I'd love to walk the property at {{propertyAddress}}. I have these times open: {{slot1}}, {{slot2}}, {{slot3}}. Which works?"

walkthrough_offer_alts_v1
"Got it — those didn't work. How about {{slot1}}, {{slot2}}, or {{slot3}}?"

walkthrough_confirm_v1
"Great, confirmed for {{appointmentTime}} at {{propertyAddress}}. See you then. — {{repName}}"

walkthrough_handoff_v1 (sent automatically when agent exits to human)
[None — handoff is internal only, no message to seller. The rep picks up from where the agent left off.]
```

## 10. Failure modes & retries

| Failure | Behavior |
|---|---|
| Seller never replies | Wait 24h; agent does not re-send (human rep takes over). |
| Seller replies "STOP" | Add to suppression; exit coordination. |
| Calendar integration not configured | Fall back to a static availability window from tenant config. |
| Reply classifier confidence below 0.7 | Treat as `ambiguous` → handoff. Better to over-handoff than over-message. |
| Rep cancels in calendar mid-coordination | Pause coordination; alert rep. |

## 11. Test plan

- **Unit:** State machine transitions; reply classifier per fixture set of seller replies.
- **Integration:**
  - Happy path: seller picks slot 1 → confirm sent → appointment created → handed to reminder agent.
  - Alternative path: seller proposes new time → agent finds availability → confirms.
  - Decline path: seller says "not interested" → exit, rep notified.
  - Ambiguous: seller says "huh?" → exit, rep notified.
  - Suppression: seller replies STOP mid-coordination → exits immediately.
- **Production rollout:**
  1. Dry-run for 4 weeks (longer than other agents).
  2. Manual review of every coordination's intended sends.
  3. Enable on 1 property at a time for the first week.
  4. Approval queue remains active for 90 days minimum.

## 12. Implementation notes

- **Files:**
  - `lib/agents/walkthrough-coordinator/{index,states,tools,classifier}.ts`
  - `scripts/agents/walkthrough-coordinator-step.ts`
  - `prisma/schema.prisma` — `WalkthroughCoordination` model (state, history, currentTurn).
- **Model:** `claude-haiku-4-5-20251001` for reply classification only. No LLM in message composition.
- **Cost:** ~$0.05 per coordination (classification).
- **Honest limitation:** This agent will fail more often than the others. It's the highest-value but highest-risk. If after 6 months it doesn't reach > 60% successful auto-coordination, kill it and keep walkthrough scheduling manual — but the rest of Wave 3 still wins.
