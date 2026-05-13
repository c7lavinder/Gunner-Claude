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
