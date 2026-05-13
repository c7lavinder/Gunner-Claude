# Gunner AI — Plan Synthesis

> Bundled 2026-05-12 for review in claude.ai chat alongside `AI_AUDIT_FOR_CHAT.md` and `AGENTS_FOR_CHAT.md`.
> Purpose: reconcile the LLM Rewiring Plan (Elite Edition) and the 16-Agent Roadmap into one execution order.

---

## TL;DR

Two plans are on the table. They are **complementary, not competing**:

- **LLM Rewiring Plan (Elite Edition).** Rebuilds the *quality + measurement* of the 21 LLM surfaces that already exist in `lib/ai/`. Wires Settings into every call, adds evals, observability, cost guards, adversarial testing, and a learning loop. Output: a measurable, learnable, defensible AI system.
- **16-Agent Roadmap (`docs/agents/`).** Adds *new* worker agents on top of those LLM surfaces — replaces manual team work (lead triage, followup, dispo) and migrates GHL workflows (drip cadences, appointment reminders, missed-call SMS) into Gunner-controlled, auditable equivalents.

You should ship **both**, but not in parallel. The quality work in the LLM plan creates the safety net (evals, observability, traffic-light approvals) that the agent plan depends on.

---

## How the two plans interact

| LLM Plan Phase | What it provides | Which agents depend on it |
|---|---|---|
| Phase 0 — Baseline | Current cost/latency/quality numbers from `ai_logs` | Sets the budget cap default for every agent |
| Phase 1 — Settings wiring | `buildSettingsContext()` for every LLM call | `lead-triage`, `followup-task-builder`, `daily-operations-briefing` all need playbook/scripts/profiles |
| Phase 2 — Prompt overhaul | Versioned, identity-injected prompts per surface | All Wave 2+ agents inherit the prompt template |
| Phase 3 — Tool consolidation (74→~15) | Sharp tool roster with one-sentence descriptions | Wave 2 agents (`lead-triage`, `followup-task-builder`, `internal-alert-hub`) use the same tool roster |
| Phase 4 — Traffic-light approval | Green/Yellow/Red tiers with code-level enforcement | **Foundation for `_send-framework.md`.** Send framework is the customer-facing-specific hardening on top |
| Phase 5 — Cross-session memory | `assistant_session_summaries` actually injected | `daily-operations-briefing` reads these |
| Phase 6 — Per-surface tuning | All 9 existing surfaces upgraded | `property-enrichment-iterator` benefits — calls quality enrichment |
| Phase 7 — Eval framework | 50+ golden prompts, scored, pre-commit gate | Wave 1 + 2 agents add their own eval prompts to the suite |
| Phase 8 — Observability + cost guards | `ai_logs` extended; AI Health tab; cost ceilings | `cron-sentinel` consumes this; `webhook-drift-watchdog` runs alongside |
| Phase 9 — Adversarial + drift | Red-team prompts; model upgrade gate | Protects every agent from regression when models update |
| Phase 10 — Learning loop | Thumbs UI; weekly review; eval candidate auto-gen | Wave 3 send agents log every send to the same feedback table |

---

## Recommended execution order

### Block 1 — Foundation (LLM Plan Phases 0–4)

Ship the quality rebuild first. Without these, the agents will inherit garbage:

1. **Phase 0** — Discovery & baseline (1 day). Pulls real cost/latency numbers from `ai_logs`. **This is the input to setting the per-tenant budget cap.**
2. **Phase 1** — Settings wiring (1–2 days). Every LLM call sees playbook + scripts + profiles.
3. **Phase 2** — System prompt overhaul (1 day). Versioned prompts, role-aware injection.
4. **Phase 3** — Tool consolidation (1–2 days). 5 days delivery, but verify the "74→15" claim first (audit shows ~20-30 actual tools).
5. **Phase 4** — Traffic-light approval (1 day). **This is the foundation for the agent send framework.**

### Block 2 — Safety net (LLM Plan Phases 7–8)

Before adding any new agent surface area, build the safety net:

6. **Phase 7** — Eval framework (1–2 days). Use Phase 0's 10 baseline prompts as the seed, expand to 50+.
7. **Phase 8** — Observability + cost guards (1 day). **CRITICAL FIX: cost ceiling must exempt mission-critical calls (grading, deal intel). Otherwise capping the budget will block revenue paths.**

### Block 3 — Site-keeping agents (Agent Plan Wave 1)

Now the new automation layer can start. Wave 1 agents use the observability infra from Block 2:

8. **Agent: cron-sentinel** — consumes Phase 8's `cron_runs` instrumentation.
9. **Agent: stuck-calls-recovery** — uses the same audit log surface.
10. **Agent: tcp-anomaly-surfacer** — adds `property_tcp_history` + surfaces buy signals.
11. **Agent: webhook-drift-watchdog** — instruments `webhook_receipts` table, monitors drop rates.

### Block 4 — Polish existing surfaces (LLM Plan Phases 5–6, parallel with Block 3)

These can run in parallel with Wave 1 agents — they don't conflict:

12. **Phase 5** — Cross-session memory.
13. **Phase 6** — Per-surface tuning (grading, coach, story, dispo, etc.).

### Block 5 — Hardening (LLM Plan Phases 9–10)

14. **Phase 9** — Adversarial + drift testing. Weekly cron. Model upgrade gate.
15. **Phase 10** — Learning loop. Thumbs UI. Weekly review. Eval candidate auto-generation.

### Block 6 — Internal team agents (Agent Plan Wave 2)

With evals + observability + feedback loop live, Wave 2 agents have a strong validation framework:

16. **Agent: lead-triage**
17. **Agent: pipeline-janitor**
18. **Agent: followup-task-builder**
19. **Agent: property-enrichment-iterator**
20. **Agent: buyer-match-outreach-queue** (queue-only, no auto-send)
21. **Agent: daily-operations-briefing**
22. **Agent: internal-alert-hub**

### Block 7 — Send framework (extends LLM Plan Phase 4)

23. **`_send-framework.md`** — extends Phase 4's traffic-light with customer-facing-specific hardening: template registry, approval queue, suppression list, quiet hours, per-tenant caps, ESLint rule blocking direct provider imports.

### Block 8 — Customer-facing sends (Agent Plan Wave 3)

One at a time. Each on its own observation period:

24. **Agent: appointment-reminder** (priority #1)
25. **Agent: drip-cadence-migrator** (priority #2)
26. **Agent: missed-call-autoresponder**
27. **Agent: no-show-recovery**
28. **Agent: walkthrough-coordinator** (highest-risk, ships last)

---

## Open issues to resolve before execution

These need answers from Corey or another design pass before Block 1 starts:

### From the LLM plan

1. **Verify actual tool count.** Plan claims 74. Audit suggests ~20-30. Run `grep -c 'name:' lib/ai/assistant-tools.ts lib/ai/query-tools.ts` to get the real number. If it's 25, the consolidation story changes from "5× reduction" to "1.7× reduction" — still valuable, but the framing matters.

2. **Per-tenant LLM budget default.** Phase 8 says $25/day. From the audit, just `regenerate-stories` is $2.25/day and grading scales with call volume. Without a real measurement, $25 is a guess. **Action: pull 30-day spend by tenant from `ai_logs` in Phase 0. Set budget = 1.5× p95 daily spend, not a round number.**

3. **Cost cap exemption list.** Phase 8 refuses LLM calls when budget hit. This will break grading mid-day. **Action: define a mission-critical tier (grading, deal intel, webhook-triggered enrichment) that is exempt from the cap. Only user-triggered + cron-triggered AI surfaces are subject to the cap.**

4. **Pre-commit eval cost.** Phase 7's pre-commit hook runs 50 real-model evals at ~$5/run per dev push. **Action: split into smoke (5 prompts per commit, ~$0.50) and full (50 prompts nightly cron, ~$5/day). Pre-commit smoke catches regressions; nightly full validates.**

5. **Industry knowledge replacement.** Phase 1 replaces `industry-knowledge.ts` (11KB of proven sales methodology) entirely with dynamic Settings injection. **Action: augment, don't replace. Wire Settings IN ADDITION to `industry-knowledge.ts` for one eval cycle. Only deprecate the static file if evals show Settings content covers it.**

6. **Voice as tenant config.** "Sharp Ops Lead" is hard-coded in Phase 2's IDENTITY block. **Action: store voice profile in `tenants.ai_voice_profile` (enum: sharp_ops / warm_pro / friendly_neighborhood). Default to sharp_ops for current tenants. Future tenants pick their own.**

7. **Anomaly detection cadence.** `compute-aggregates` runs daily at 4am UTC. Cost spikes or jailbreak attempts shouldn't wait 19+ hours. **Action: cost monitoring runs hourly; full anomaly suite runs daily.**

### From the agent plan

8. **GHL workflow inventory.** My audit notes the actual list of active GHL workflows can't be read from code. Corey needs to export from the GHL UI before Wave 3 starts.

9. **Vetted template list.** Before Wave 3 can ship any customer-facing agent, Corey needs to approve specific templates. Suggested starting set: 4 templates (missed-call autoresponder, appointment confirm, appointment day-of, no-show recovery).

10. **Approval queue UX.** Where does Corey review pending sends? In-app, Slack, or SMS? Decision needed before Wave 3 ships.

### From the integration

11. **Sequencing dependency check.** Phase 4 (LLM plan) and `_send-framework.md` (agent plan) both define approval logic. Phase 4 establishes the tier system (green/yellow/red). `_send-framework` is the customer-facing extension. **Action: confirm `_send-framework` references Phase 4 as its foundation, not as a duplicate.**

12. **Shared `agent_jobs` queue.** Wave 2+ agents need a job queue (audit table doesn't have one). Add to Phase 0 schema baseline so it ships alongside Phase 8's `ai_logs` extension — same migration window.

---

## North-star metric: keep it, sharpen it

The LLM plan's **Lead Manager Daily Effective Action Count (LM-DEAC)** is the right north star. But it needs operational sharpening:

- **"Dials made"** — pulled from `calls` where `direction=OUTBOUND` and `duration > 0`?
- **"Tasks completed"** — `tasks.status=COMPLETED` per day?
- **"Qualified leads moved to Appointment Set"** — which stage transition, in which pipeline? Need a specific Prisma query.
- **"Scripts followed (per grading)"** — which field in `calls.rubricScores` represents this?

Phase 0 should define LM-DEAC as a SQL view or a function in `lib/kpis/lm-deac.ts`. Otherwise it's a vibe, not a number.

---

## What to bring to the claude.ai chat

Three files:

1. **`AI_AUDIT_FOR_CHAT.md`** — what exists today.
2. **`AGENTS_FOR_CHAT.md`** — the 16-agent roadmap with specs.
3. **`SYNTHESIS_FOR_CHAT.md`** (this file) — how the two plans reconcile + the open issues.

Use this synthesis doc to anchor the conversation. The other two are reference material when chat needs to drill into specifics.

---

## One concrete recommendation

**Don't try to execute both plans in one sprint.** The combined scope is ~12-14 Claude Code sessions for the LLM plan + ~7.5 weeks of agent build. Total: 2-3 months of focused work.

**First commit**: Phase 0 of the LLM plan. Until we have current cost/latency baseline numbers, every other phase is operating on guesses. Phase 0 takes 1 session. Ship it, then decide block by block.

That's the actual next move.
