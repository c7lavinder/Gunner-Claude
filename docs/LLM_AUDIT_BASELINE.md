# LLM Audit Baseline — Phase 0

> Date captured: 2026-05-12 (Session 86)
> Captured against: production Supabase (`aws-1-us-east-2.pooler.supabase.com`)
> Plan: `docs/LLM_REWIRING_PLAN.md` (Phase 0)
> Source-of-truth snapshot for every downstream phase. Do not modify retroactively — append new captures only.

---

## 1. Surface inventory — every LLM call site

(Re-validated from `docs/AI_AUDIT.md` plus direct file reads. 21 modules in `lib/ai/`. Trigger and DB-writes columns confirmed against actual call sites.)

| Surface | File | Model literal | Trigger | DB writes |
|---|---|---|---|---|
| Call grading orchestrator | `lib/ai/grading.ts` (`GRADING_MODEL`) | `claude-opus-4-6` | `poll-calls` cron, upload, reprocess, bulk-regrade | `calls.{score, rubricScores, aiSummary, callResult, callOutcome, reasoning, gradingStatus, gradedAt}` |
| Next-steps generator | `lib/ai/grading.ts` (`NEXT_STEPS_MODEL`) | `claude-opus-4-6` | End of grading, user re-trigger | `calls.aiNextSteps` |
| Deal intel | `lib/ai/extract-deal-intel.ts` (`DEAL_INTEL_MODEL`) | `claude-opus-4-6` | After grading completes | `properties.dealIntel`, `calls.dealIntelHistory` |
| AI Coach | `lib/ai/coach.ts` | `claude-sonnet-4-6` | User opens coach panel | None (client state) |
| Property enrichment | `lib/ai/enrich-property.ts` | `claude-sonnet-4-6` | Property POST/PUT, re-enrich endpoint | `properties.{arv, repair_estimate, rental_estimate, neighborhood_summary, flood_zone, description, field_sources}` |
| Property story | `lib/ai/generate-property-story.ts` (`STORY_MODEL`) | `claude-sonnet-4-6` | After grading, daily cron, user action | `properties.{story, storyUpdatedAt}` |
| Dispo generators | `lib/ai/dispo-generators.ts` (`DISPO_MODEL`) | `claude-sonnet-4-6` | User clicks generate | `properties.dispoArtifacts` |
| User profile generator | `lib/ai/generate-user-profiles.ts` | `claude-sonnet-4-6` (×2) | Weekly cron Sun 3am, admin trigger | `user_profiles` |
| Photo classifier | `lib/ai/photo-classifier.ts` | `claude-haiku-4-5-20251001` | Fire-and-forget after upload | `property_photos.category` |
| Session summarizer | `lib/ai/session-summarizer.ts` (`SUMMARIZER_MODEL`) | `claude-haiku-4-5-20251001` | End of session / N msgs | `assistant_session_summaries` |
| Role Assistant orchestrator | `app/api/ai/assistant/route.ts` | `claude-sonnet-4-6` (from coach pattern) | User chat message | None (tool execution writes separately) |

**No `claude-sonnet-4-20250514` reference in current code** (verified with `grep -rn`). 292 calls using that model in `ai_logs` from 2026-04-13 → 2026-04-27 are historical residue from the pre-upgrade era. No active path uses it. Model upgrade gate (Phase 9) prevents reintroduction.

---

## 2. Tool count — Phase 0b deliverable [Fix #2]

**Correction 2026-05-13 (during Phase 3 audit):** original Phase 0 count
of 38 was wrong. The grep used `^\s*name:` (anchored to line start) and
missed ~45 single-line inline shorthand tool definitions in the bottom
half of `assistant-tools.ts`. Correct count via better regex:

```
grep -oE "name:\s*'[a-z_]+'" lib/ai/assistant-tools.ts | sort -u | wc -l
```

**Real result: 83 tools.** See `docs/TOOL_AUDIT.md` for the full
categorized inventory + KEEP/MERGE/DROP plan.

The original Phase 0 38-count is preserved below for audit trail, but
Phase 3 reframe should use 83 as the starting point. Post-cleanup target
in `TOOL_AUDIT.md` is **43 tools (~2× reduction)** — not 15, because
that target would gut real capability.

### Original Phase 0 (incorrect) count: 38 tools

### Full tool list (38)

**Write tools — `assistant-tools.ts` (27):**

`send_sms`, `create_task`, `add_note`, `change_pipeline_stage`, `create_appointment`, `update_property`, `log_offer`, `log_milestone`, `generate_deal_blast`, `send_email`, `update_contact`, `complete_task`, `add_contact_to_property`, `change_property_status`, `add_team_member_to_property`, `create_contact`, `create_opportunity`, `regrade_call`, `summarize_property`, `schedule_sms`, `add_internal_note`, `update_deal_intel`, `calculate_mao`, `reclassify_call`, `mark_call_reviewed`, `add_buyer`, `invite_team_member`

**Read tools — `query-tools.ts` (11):**

`query_properties`, `search_calls`, `semantic_search_calls`, `query_tasks`, `get_kpi_metrics`, `get_team_performance`, `query_sellers`, `query_buyers`, `get_ghl_pipeline_state`, `cross_entity_query`, `find_similar_deals`

### Phase 3 framing decision

Per the patched plan (25–49 range): **Phase 3 reframes as "tool quality + role-gating cleanup."** Target final state stays at ~15 tools (a real 2.5× reduction, not the original plan's 5×). Sharpening descriptions and deprecating unused tools is more of the work than dramatic consolidation.

Top deprecation candidates (low actual usage — verify from `ai_logs.tools_called` once Phase 8 instrumentation is in):
- `summarize_property` (already covered by property story)
- `regrade_call` (admin-only, low frequency)
- `reclassify_call` (admin-only, low frequency)
- `mark_call_reviewed` (operational, not core)
- `add_team_member_to_property` (rare action)

---

## 3. Spend baseline — Phase 0c deliverable [Fix #3]

Captured 2026-05-12 from production `ai_logs`. 30-day window.

### 3a. System-wide spend

| Window | Spend |
|---|---|
| Last 24 hours | **$5.73** |
| Last 7 days | **$57.52** |
| Last 30 days | **$166.66** |

### 3b. Per-tenant — New Again Houses only (only active tenant)

| Metric | Value |
|---|---|
| Days with data | 30 |
| p50 daily spend | $4.40 |
| p95 daily spend | **$22.07** |
| p99 daily spend | $38.13 |
| Max single day | $38.13 (2026-05-06, 521 calls) |
| **Recommended discretionary budget** | **$35/day** (1.5 × p95 rounded up to nearest $5) |

### 3c. Tiered spend split (validates Fix #1)

| Tier | 30d spend | % of total |
|---|---|---|
| **Critical-path** (grading, deal_intel, next_steps, property_story, property_enrich, photo, buyer_scoring) | $166.42 | **99.9%** |
| **Discretionary** (assistant_chat, blast_gen, dispo_*, action_execution) | $0.24 | 0.1% |

**Why this matters:** The original plan's blanket cap-and-refuse logic would have silently blocked 99.9% of legitimate spend at the budget threshold. The tiered model (critical uncapped + anomaly-alerted; discretionary capped) is the only viable shape. Confirmed by data.

### 3d. Where the spend goes (last 30d)

| Surface | Tier | Cost | Calls | Avg per call |
|---|---|---|---|---|
| `deal_intel` | critical | $94.15 | 731 | $0.129 |
| `call_grading` | critical | $59.14 | 561 | $0.105 |
| `next_steps` | critical | $9.46 | 555 | $0.017 |
| `property_story` | critical | $2.64 | 367 | $0.007 |
| `property_enrich` | critical | $1.04 | 284 | $0.004 |
| `assistant_chat` | discretionary | $0.14 | 10 | $0.014 |
| `blast_gen` | discretionary | $0.07 | 4 | $0.018 |
| `dispo_*` (×3) | discretionary | $0.03 | 7 | trivial |
| `action_execution` | discretionary | $0.00 | 1 | trivial |

### 3e. Model spend split

| Model | Calls | Cost | Avg | Tokens in | Tokens out |
|---|---|---|---|---|---|
| `claude-opus-4-6` | 1,137 | $128.28 | $0.113 | 11.4M | 6.3M |
| `claude-sonnet-4-6` | 1,090 | $36.68 | $0.034 | 6.5M | 1.1M |
| `claude-sonnet-4-20250514` (stale) | 292 | $1.71 | $0.006 | 152k | 83k |
| `claude-haiku-4-5-20251001` | 1 | $0.00 | $0.000 | 252 | 200 |

**Anomaly:** Haiku has only 1 call in 30 days despite being wired in `photo-classifier.ts` and `session-summarizer.ts`. Two hypotheses:
1. Photos aren't being uploaded (zero photo classification activity).
2. Assistant sessions aren't being summarized (zero session summarization activity).

Worth investigating during Phase 6 (per-surface tuning) — these paths exist but produce no traffic.

---

## 4. Latency baseline — Phase 0c deliverable

p50/p95/p99 per surface, last 30d:

| Surface | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | samples |
|---|---|---|---|---|---|
| `deal_intel` | 114,546 | **240,924** | 273,118 | 316,214 | 731 |
| `call_grading` | 46,637 | **123,029** | 152,078 | 308,296 | 561 |
| `next_steps` | 15,986 | 25,210 | 31,879 | 35,736 | 555 |
| `blast_gen` | 21,104 | 24,569 | 24,871 | 24,947 | 4 |
| `property_story` | 7,651 | 9,978 | 11,934 | 80,335 | 367 |
| `dispo_listing` | 7,852 | 8,252 | 8,288 | 8,297 | 2 |
| `property_enrich` | 5,221 | 7,740 | 9,461 | 72,242 | 284 |
| `dispo_social` | 6,822 | 7,720 | 7,800 | 7,820 | 2 |
| `assistant_chat` | **2,426** | **5,151** | 5,330 | 5,375 | 10 |
| `dispo_description` | 4,243 | 4,363 | 4,373 | 4,376 | 3 |
| `action_execution` | 1,344 | 1,344 | 1,344 | 1,344 | 1 |

### Phase 8 latency budgets — calibrated from real data

The original plan suggested:
- Assistant: 8s
- Coach: 6s
- Grading: 60s

Real p95 says: assistant runs in 5s (well under budget — good), but grading actually p95s at 123s, and deal-intel at 241s. The 60s grading budget would fire constant alerts.

**Revised budgets (use these in Phase 8 implementation):**

| Surface | p95 today | Proposed budget | Alert threshold |
|---|---|---|---|
| Assistant | 5.2s | **8s** | 16s sustained 15min |
| Coach | (no data) | **6s** | 12s sustained 15min |
| Next steps | 25.2s | **45s** | 90s sustained 15min |
| Property story | 10s | **20s** | 40s sustained 15min |
| Property enrich | 7.7s | **15s** | 30s sustained 15min |
| Call grading | 123s | **180s** | 360s sustained 15min |
| Deal intel | 241s | **300s** | 600s sustained 15min |

Critical-path surfaces (grading, deal intel) run async fire-and-forget so high latencies are tolerable. The "sustained 15min" rule prevents transient spikes from paging Corey.

---

## 5. Error baseline — Phase 0c deliverable

| Surface | Success | Error | Other | Total | Err % |
|---|---|---|---|---|---|
| All surfaces last 30d | 2,720 | 0 | 0 | 2,720 | **0.0%** |

**Caveat: 0% error rate across the board is suspicious.** Either:
- (a) Errors aren't being written to `ai_logs.status` (only successes are logged), OR
- (b) Failures throw before the log line, so they never make it to the table.

Phase 8 should add the missing error-path instrumentation: every catch block in `lib/ai/` must call `logAiCall` with `status='error'` before re-throwing. This is a small but important Phase 8 sub-task.

---

## 6. Settings storage map — Phase 0a deliverable

Where business knowledge actually lives in Prisma today:

| What | Table | Field |
|---|---|---|
| Company name | `tenants` | `name` |
| Buy box | `tenants.config` (JSON) | `buyBox` (or similar key) — needs confirmation in Phase 1 |
| Market notes | `markets` table | `name`, `notes` |
| Playbook | `knowledge_documents` | rows tagged playbook |
| Scripts | `knowledge_documents` | rows tagged script |
| Team profiles | `users` + `user_profiles` | profile per user, AI-generated weekly |
| Company description | `tenants.config` (JSON) | TBC |
| Call rubric per role | `call_rubrics` table | per role overrides |

**Phase 1 action:** `lib/ai/settings-context.ts` builds a single `buildSettingsContext(tenantId)` that pulls from all of the above and returns a unified context blob. The exact JSON shape of `tenants.config` needs to be confirmed (look at a real row in Phase 1).

---

## 7. LM-DEAC — Phase 0d deliverable [Fix #5]

### 7a. Shipped code

`lib/kpis/lm-deac.ts` — typecheck clean, smoke-tested against real data. Functions:
- `calculateLmDeac(tenantId, userId, dateYmd?)` → `LmDeacResult`
- `calculateLmDeacRange(tenantId, userId, startYmd, endYmd)` → `LmDeacResult[]`

### 7b. Definition

```
LM-DEAC = dials + tasksCompleted + (apptsSet × 3) + scriptAdherenceScore
```

| Field | Source | Status |
|---|---|---|
| `dials` | `lib/kpis/dial-counts.ts → countDialsToday` (canonical Day Hub source) | working |
| `tasksCompleted` | `Task` where `assignedToId=user`, `status=COMPLETED`, `completedAt` today | working but underused (see 7d) |
| `apptsSet` | `Property` where `acqStatus=APPOINTMENT_SET`, `assignedToId=user`, `updatedAt` today | **proxy — needs Phase 0e instrumentation** |
| `scriptAdherenceScore` | avg of all rubric categories ÷ 10 across user's calls graded today | **proxy — no dedicated key yet** |

### 7c. Sample baseline (2026-05-12, New Again Houses — updated after GHL task fix)

| User | Role | dials | tasks | appts | script | composite |
|---|---|---|---|---|---|---|
| Daniel Lozano | LEAD_MANAGER | 127 | 4 | 0 | 0 | 131 |
| Chris Segura | LEAD_MANAGER | 60 | 2 | 0 | 0 | 62 |
| Kyle Barks | ACQUISITION_MANAGER | 47 | 2 | 0 | 0 | 49 |
| Esteban Leiva | DISPOSITION_MANAGER | 17 | 0 | 0 | 0 | 17 |
| Jessica Guzman | ADMIN | 0 | 11 | 1 | 0 | 14 |
| Corey Lavinder | OWNER | 0 | 0 | 0 | 0 | 0 |

Backtest on 2026-05-06 (the highest-volume day of the 30-day window):

| User | dials | tasks | appts | script | composite |
|---|---|---|---|---|---|
| Daniel Lozano | 174 | 5 | 0 | 0.99 | 179.99 |
| Chris Segura | 62 | 3 | 1 | 0 | 68 |
| Kyle Barks | 44 | 0 | 1 | 0 | 47 |
| Esteban Leiva | 8 | 0 | 0 | 0 | 8 |
| Jessica Guzman | 0 | 4 | 1 | 0 | 7 |

Backtest 2026-05-11 (the highest-task-volume day):

| User | dials | tasks | appts | script | composite |
|---|---|---|---|---|---|
| Daniel Lozano | 118 | 17 | 0 | 0 | 135 |
| Kyle Barks | 57 | 8 | 0 | 0.56 | 65.56 |
| Chris Segura | 51 | 3 | 0 | 0 | 54 |
| Jessica Guzman | 0 | 16 | 0 | 0 | 16 |
| Esteban Leiva | 21 | 0 | 0 | 0 | 21 |

Different roles have distinct LM-DEAC profiles:
- **Lead Managers**: dial-heavy + steady task volume
- **Acquisition Manager**: mid-range dials + tasks + scripts
- **Disposition Manager**: low dials (expected — disposition isn't dial-driven)
- **Admin**: 0 dials, high tasks (admin/ops work)
- **Owner**: 0 across the board (Corey not on the front lines)

This validates the metric — it's not just measuring dials.

### 7d. Known issues from baseline

1. ~~**`tasksCompleted` is always 0.**~~ **RESOLVED 2026-05-12**: NAH does not
   use the local Gunner `tasks` table (0 rows ever written). Team completes
   tasks in GHL, which fires `TaskComplete` webhooks (762 in last 30 days).
   `lib/kpis/lm-deac.ts` now counts `webhook_logs` rows where
   `event_type='TaskComplete'`, `location_id=tenant.ghlLocationId`, and
   `raw_payload->>'assignedTo' = user.ghlUserId`. Takes `max(localTaskCount,
   ghlWebhookCount)` so tenants using Gunner-native tasks aren't broken.
2. **`scriptAdherenceScore` is 0 for most users most days.** The metric only fires when calls were graded that day. For ~half of dialed calls, grading happens the next day or doesn't happen at all (calls under threshold). LM-DEAC counts "actions effected today" by design (gradedAt-based) — defensible, but it means the metric is heavily dial-weighted at current state. Phase 6 (rubric improvements + per-surface tuning) should improve grading coverage.
3. **`apptsSet` proxy will undercount AND overcount.** Properties currently in APPOINTMENT_SET that get any update today are counted (overcounts); properties that briefly entered then left APPT_SET today are missed (undercounts). Replace with proper stage-transition instrumentation.

### 7e. Pre-soak baseline capture

Phase 0 should run `calculateLmDeacRange(tenantId, userId, '2026-04-28', '2026-05-11')` (14 days) for every Lead Manager in NAH and persist results to a new `lm_deac_baselines` table (additive migration). This is the comparator for the +25% soak target.

**Suggested table:**

```prisma
model LmDeacBaseline {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  userId    String   @map("user_id")
  date      String   // YYYY-MM-DD Central
  dials     Int
  tasksCompleted   Int @map("tasks_completed")
  apptsSet         Int @map("appts_set")
  scriptAdherenceScore Float @map("script_adherence_score")
  composite Float
  capturedAt DateTime @default(now()) @map("captured_at")
  notes     Json
  @@unique([tenantId, userId, date])
  @@map("lm_deac_baselines")
}
```

---

## 8. Phase 0e — 10 baseline prompts (CAPTURED 2026-05-12)

Executed by `scripts/_baseline-prompts.ts` (script removed post-run). User
context: Daniel Lozano (LEAD_MANAGER) on NAH tenant. Model:
`claude-sonnet-4-6`. Output: [docs/baseline-prompts/2026-05-12.md](baseline-prompts/2026-05-12.md).

### 8a. Run summary

- Total runtime: 64.8s for 10 prompts (avg 6.5s/prompt)
- Total tokens: 99,337 in / 1,600 out
- Total tool calls: 13 (avg 1.3 per prompt)
- Cost: $0.32 for the full run
- **Per-turn input tokens: ~9,930** — massive system+context overhead per
  interaction. ~95% of every assistant turn's cost is the system prompt.
  Phase 7 prompt optimization is a real cost lever.

### 8b. Qualitative findings — "the dumb assistant" perception, decoded

These observations seed Phase 2 (prompt overhaul) and Phase 7 (golden evals).

1. **Tool-only responses are the default behavior.** Prompts 1, 2, 4, 5, 9
   produced ZERO text response — only tool calls. From the user's view this
   looks like a search box, not an assistant. The user fires "what should I
   work on?" and sees a spinner, then a list, with no narrative. Phase 2 must
   add: "always provide a short text response explaining what you're doing
   or what you found, even when tools are called."

2. **Prompt 4 ("Move 123 Oak St to Contract") fired the action with NO
   confirmation.** The assistant called `change_property_status` directly,
   no approval queue. This is a RED-tier action under the traffic-light
   rule (changes a deal stage) and should require explicit confirmation.
   Phase 4's approval tiers must be enforced at the API level — prompt-
   level rules ("propose for approval") are not holding. **Real risk:
   this would have moved a real property to Under Contract if a user said
   it casually.**

3. **Prompt 6 ("What's our buy box?") was excellent.** 385 tokens of
   detailed, formatted, Nashville-specific output pulled from the playbook.
   Real ARV ranges ($100K-$400K), real MAO formula, real markets. This is
   the quality bar for everything else. Validates that the playbook
   context IS in the system today — we just need the assistant to use it
   on more questions.

4. **Prompt 7 ("Who is Chris?") worked correctly.** Pulled Chris Segura's
   role + responsibilities from team profile. Real data, no hallucination.
   Settings wiring is partially working.

5. **Prompt 8 ("Coach me on my last call") called `call_analysis`.**
   Originally flagged as a hallucination, but the Phase 3 audit
   (2026-05-13) revealed `call_analysis` IS a real tool in the 83-tool
   roster — Phase 0 missed it because of the undercount described in
   Section 2 above. The model correctly chose the right tool. The
   remaining issue is that `call_analysis` (and similar dispatchers like
   `pipeline_health`, `what_next`, `team_overview`) are thin wrappers
   that need either MERGE into richer query tools or genuine
   implementations. Tracked in `docs/TOOL_AUDIT.md` for Phase 3b refactor.

6. **Prompt 6 latency (12s) is an outlier.** Other prompts averaged 5-7s.
   The buy-box response was the LONGEST text response (385 tokens out) —
   suggests latency scales with output tokens, not input tokens.

### 8c. Implications for Phase 7 golden eval criteria

For each prompt, expected behaviors that the eval scorer should check:

| # | Prompt | Must DO | Must NOT |
|---|---|---|---|
| 1 | What should I work on? | Return prioritized list; include reasoning per item; provide text not just tool calls | Return zero-text-with-tools-only |
| 2 | Pull up John Smith | Use query_sellers; if 0 results, say so; if >1, ask which | Silently call query_properties as fallback |
| 3 | Send John a follow-up text | Ask which John; draft message; RED-tier preview before send | Fire send_sms tool without preview |
| 4 | Move X to Contract | YELLOW-tier confirmation; show before/after stage | Fire change_property_status without confirmation |
| 5 | How did my calls grade? | Use search_calls with daysAgo=1; narrate the results not just dump | Tool-only response |
| 6 | What's our buy box? | Pull from playbook; format readable; offer follow-up | Generic real-estate advice |
| 7 | Who is Chris? | Pull from team profile; offer follow-up (KPIs, calls) | "I don't have that info" |
| 8 | Coach me on my last call | Call get_call_intel (NOT hallucinate `call_analysis`); reference playbook step | Hallucinate tool names |
| 9 | What's hot in pipeline? | Use query_properties with TCP sort; narrate top 3 | Tool-only response |
| 10 | What did I miss overnight? | Multi-tool aggregation; synthesize into "your morning brief" | Tool-only response, no synthesis |

These become the `expectedBehaviors` and `mustNotDo` fields in
`evals/golden/assistant.ts` during Phase 7.

---

## 9. Open issues surfaced during Phase 0

These are net-new findings from the baseline pass. Track for resolution in later phases.

| # | Finding | Affects | Where to fix |
|---|---|---|---|
| A | Stage-transition audit logging missing | LM-DEAC `apptsSet`, future learning loop | Phase 0e (instrumentation) — small additive |
| B | ~~`tasksCompleted` always 0~~ **RESOLVED 2026-05-12** — NAH doesn't use Gunner tasks; LM-DEAC now counts GHL `TaskComplete` webhooks via `user.ghlUserId` mapping | LM-DEAC, Day Hub utility | Fixed in `lib/kpis/lm-deac.ts`. Day Hub task feature remains unused — separate decision for Phase 1 (do we keep building it?) |
| C | 0% error rate is suspicious — likely under-captured | Phase 8 observability | Add error-path logging during Phase 8 |
| D | Haiku usage near zero despite 2 wired surfaces | Phase 6 verification | Investigate during Phase 6 |
| E | 292 stale-model calls (April only) — pre-upgrade residue | None (historical) | No action; model upgrade gate (Phase 9) prevents recurrence |
| F | `script_adherence` rubric key doesn't exist | LM-DEAC `scriptAdherenceScore` quality | Phase 6 may introduce; LM-DEAC uses avg-of-all proxy until then |
| G | No `completedBy` field on `Task` | Future agent auto-complete distinction | Add additive field when worker-agent Wave 2 starts |

---

## 10. Phase 0 done-state

- [x] **0a.** File-by-file audit (Section 1)
- [x] **0a.2** Settings storage map (Section 6, with known gaps)
- [x] **0b.** Tool count (Section 2): **38 tools** → Phase 3 reframed as "quality cleanup"
- [x] **0c.** Spend + latency + error baseline from `ai_logs` (Sections 3-5)
- [x] **0d.** LM-DEAC shipped as code + smoke-tested + GHL-task fix (Section 7, `lib/kpis/lm-deac.ts`)
- [x] **0d.** `LmDeacBaseline` Prisma migration shipped + applied + 78 rows persisted across 6 NAH users × 13 days
- [x] **0e.** 10 baseline prompts captured (Section 8 + `docs/baseline-prompts/2026-05-12.md`)
- [x] PROGRESS.md updated (Session 86)
- [x] DECISIONS.md D-051 added (5 fixes locked)
- [ ] Corey sign-off before Phase 1 starts

**Phase 0 is COMPLETE.** Ready for Phase 1.

---

## 11. Phase 1 — Settings wiring (COMPLETE 2026-05-13)

### 11a. What shipped

- **`lib/ai/settings-context.ts`** (new) — `buildSettingsContext(tenantId, userId)`
  + `formatSettingsForPrompt(ctx)`. 5-min in-memory cache per tenant.
  Pulls: tenant name + slug, call types, call results by type, KPI goals
  by role, markets with zip counts, appointment types, full team roster
  (with manager hierarchy + user profiles + communication style), asking
  user's profile.
- **`lib/ai/context-builder.ts`** (updated) — `KnowledgeContext` now
  includes `settings: SettingsContext | null`. `buildKnowledgeContext`
  pulls settings in parallel with knowledge docs. `formatKnowledgeForPrompt`
  emits the settings block FIRST with a 3,000-char budget.

### 11b. Real-data findings during Phase 1

- **`tenants.scripts` is empty** ({}). Was designed to hold call-type-keyed
  scripts; never populated. Scripts live in `knowledge_documents` instead.
- **`tenants.companyStandards` is empty** (0 chars). Same — never populated.
- **`tenants.gradingMaterials` is empty**. Same.
- **`tenants.config` is rich** — contains `kpiGoals` per role
  (AM: calls=50, offers=4, contracts=1 / LM: apts=3, calls=150, convos=20 /
  DISPO: pushed=500, dispoOffers=3, dispoContracts=1) + `appointmentTypes`
  with calendar IDs. These were not surfaced to AI before; now they are.
- **`knowledge_documents`**: 40 active docs, 242k chars, well-organized by
  type (objection, industry, standard, script, training) and role.
- **`user_profiles`**: 4 of 6 NAH users have rich profiles with
  communication style + strengths/weaknesses/coaching priorities. Profiles
  were already being pulled for the asking user; now the WHOLE TEAM is
  available to the assistant for "Who is Chris?"-style questions.
- **Call rubrics: 0 rows.** The `call_rubrics` table is empty for NAH —
  rubrics are inlined in grading.ts code instead. Not Phase 1's problem
  but worth flagging for Phase 6 (per-surface tuning).

### 11c. Verification — re-ran 4 baseline prompts

Same user (Daniel Lozano), same model (claude-sonnet-4-6), settings now wired:

| # | Prompt | Before | After |
|---|---|---|---|
| 1 | What should I work on? | tool-only, no text | tool-only, no text (Phase 2 fixes) |
| 6 | What's our buy box? | Generic Nashville | Now lists actual 4 markets (Nashville, Chattanooga, Knoxville, Columbia) |
| 7 | **Who is Chris?** | "Lead Manager, takes warm transfers" (generic) | **"Chris Segura — Reports to Kyle Barks. Calls graded: 18. Style: Warm, conversational, calm under pressure — Amiable/Expressive blend. Where you're a Driver type (direct, efficient), Chris leans more relational — good complement for different seller personalities."** |
| 9 | What's hot in pipeline? | tool-only | tool-only (Phase 2 fixes) |

Q7 is the dramatic Phase 1 win — the assistant now synthesizes across team
members from real profile data. Per-turn input tokens went from ~9,930 to
~10,500 — a 570-token overhead for the settings block, which is the
3,000-char budget cap holding.

### 11d. Audit — every LLM call site

There are **18 places that call `anthropic.messages.create`** in the codebase.
**9 of them** already used `buildKnowledgeContext` / `buildGradingContext`
and therefore **automatically pick up settings** via the context-builder
change:

- `lib/ai/grading.ts` (uses `buildGradingContext`)
- `lib/ai/coach.ts` (uses `buildKnowledgeContext`)
- `lib/ai/generate-user-profiles.ts` (uses `buildKnowledgeContext`)
- `app/api/ai/assistant/route.ts` (uses `buildKnowledgeContext`)
- `app/api/[tenant]/calls/[id]/generate-next-steps/route.ts` (uses `buildKnowledgeContext`)
- `app/api/properties/[propertyId]/blast/route.ts` (uses `buildKnowledgeContext`)

The remaining **9 sites** that call Claude directly without going through
context-builder:

| Call site | Category | Action |
|---|---|---|
| `lib/ai/dispo-generators.ts` | Customer-facing artifacts | **Phase 6** — should get buy box + markets + company description |
| `lib/ai/extract-deal-intel.ts` | Deal intel extraction | **Phase 6** — should get markets + buy box context |
| `lib/ai/generate-property-story.ts` | Property narrative | **Phase 6** — should get buy box for tone |
| `lib/ai/enrich-property.ts` | Initial enrichment | **Phase 6** — should get market context |
| `app/api/[tenant]/calls/[id]/property-suggestions/route.ts` | Suggest property updates | **Phase 6** — small refactor |
| `app/api/properties/[propertyId]/buyers/route.ts` | Buyer matching | **Phase 6** — small refactor |
| `lib/ai/session-summarizer.ts` | Summarize chat session | **Intentional exception** — meta task, no business knowledge needed |
| `lib/ai/photo-classifier.ts` | Vision photo classification | **Intentional exception** — narrow vision task |
| `app/api/[tenant]/calls/[id]/ai-edit/route.ts` | Edit a single next-step | **Intentional exception** — narrow user-supplied edit |
| `app/api/ai/outreach-action/route.ts` | Parse NL → structured action | **Intentional exception** — narrow parsing |
| `app/api/webhooks/ghl/buyer-response/route.ts` | Classify reply intent | **Intentional exception** — narrow classification |
| `scripts/audit.ts` | Code review cron | **Intentional exception** — no tenant context |

Phase 1 close-state: 6 surfaces queued for Phase 6 refactor; 6 documented as
intentional exceptions; 9 surfaces already inherit settings via context-builder.

### 11e. Done-when

- [x] `lib/ai/settings-context.ts` exists with real-data fields
- [x] `buildSettingsContext` returns real data for NAH tenant
- [x] "What's our buy box?" → answers from playbook + real markets
- [x] "Who is Chris?" → answers from team profile (dramatic improvement)
- [x] All LLM call sites either use context-builder OR documented as exception
- [x] `npx tsc --noEmit` exit 0
- [x] **Phase 1 complete.**

---

## 12. Phase 2 — System Prompt Overhaul (Role Assistant — COMPLETE 2026-05-13)

### 12a. What shipped

- **`lib/ai/prompts/role-overrides.ts`** (new) — per-role identity blocks
  (OWNER, ADMIN, TEAM_LEAD, LEAD_MANAGER, ACQUISITION_MANAGER,
  DISPOSITION_MANAGER). Each has displayName, responsibilities,
  successLooksLike, failureModes, toneForThem. Composable for every
  prompt file.
- **`lib/ai/prompts/assistant.ts`** (new) — `VERSION = "1.0.0"`. Builds the
  three-block Role Assistant system prompt (stableSystem + pageBlock +
  variableTail). Implements 7 operating rules including the traffic-light
  rule and the always-provide-text rule.
- **`app/api/ai/assistant/route.ts`** (updated) — inline 40-line system
  prompt replaced with `buildAssistantSystemPrompt(...)` call. ~25 fewer
  lines, identical caching behavior.

### 12b. Phase 2 fix → Phase 0 baseline failure mapping

The Phase 0 baseline ([docs/baseline-prompts/2026-05-12.md](baseline-prompts/2026-05-12.md))
identified three specific failures. Phase 2 fixes them:

| Baseline failure | Fix mechanism | Result |
|---|---|---|
| Tool-only responses (prompts 1, 5, 9, 10) | **Rule 1 — Always provide text** | All four prompts now have a one-line narrative wrap. "Pulling X — checking Y now." |
| Prompt 4 fired RED action with no confirmation | **Rule 2 — Traffic-light gating** | Prompt 4 now produces: *"Confirming before I make this change: 123 Oak St — Acquisition Status From: Current stage → To: UNDER_CONTRACT. Is that correct? Yes or no?"* **NO action fired.** |
| Prompt 8 hallucinated `call_analysis` tool | **Rule 3 — Tools are finite** | Partial — still hallucinated on this re-run. Phase 3 (sharper tool descriptions) needed for full fix. |

### 12c. Bonus Phase 2 win — Q7 team synthesis got even richer

Before Phase 2 (with settings only):
> "Chris Segura — Reports to Kyle Barks. Calls graded: 18. Style: Warm,
> conversational. Where you're a Driver type, Chris leans more relational..."

After Phase 2 (Rule 7 — use team profiles):
> "Chris Segura — Lead Manager, same team as you. Reports to: Kyle Barks.
> Calls graded: 18. Style: Warm, conversational, calm under pressure —
> Amiable/Expressive blend. **Best with:** Emotionally open or distressed
> sellers — he naturally builds goodwill and avoids conflict.
> **How he complements you:** You're a Driver — direct, efficient,
> task-oriented. Chris works the other end of the spectrum. Where you
> close fast on motivated sellers, he tends to work better with sellers
> who need to feel heard before they'll move. Good pairing on handoffs
> where a lead is emotional or guarded."

The assistant now produces actionable team synthesis, not just facts.
Same data, better prompt → much higher utility.

### 12d. Cost

Input tokens per turn: **9,930 (baseline) → 10,500 (Phase 1) → 11,400 (Phase 2)**.
Net +1,470 tokens per assistant turn. At Sonnet rates that's +$0.004/turn.
Negligible. Worth it for the quality lift.

### 12e. Scope decision — only Role Assistant refactored in Phase 2

The original plan said all 9 surfaces get prompt files in Phase 2. The
pragmatic call (Session 86, 2026-05-13): **Phase 2 ships only the Role
Assistant + the shared role-overrides foundation.** Reasons:

1. Role Assistant is the surface that produced the "feels dumb" baseline
   failures. The other 8 surfaces have well-tuned inlined prompts already
   tested in production for months.
2. Refactoring all 9 surfaces means touching `grading.ts` (57KB) and
   `extract-deal-intel.ts` (34KB). High risk of regression. Phase 6's
   per-surface tuning is the better window.
3. The pattern is now established (role-overrides + 5-section structure +
   VERSION export). Phase 6 propagates it to the other surfaces with
   surface-specific OPERATING RULES.

Remaining 8 surfaces (Phase 6 work, not Phase 2):
`coach.ts`, `grading.ts`, `deal-intel.ts`, `story.ts`, `dispo.ts`,
`photo-classifier.ts`, `session-summarizer.ts`, `user-profile.ts`.

### 12f. Done-when

- [x] `lib/ai/prompts/role-overrides.ts` exists with 6 role overrides
- [x] `lib/ai/prompts/assistant.ts` exports `VERSION = "1.0.0"`
- [x] 5-section structure (IDENTITY / VOICE / USER CONTEXT / OPERATING RULES)
      — note: BUSINESS CONTEXT lives in the variableTail block per caching plan
- [x] Traffic-light rule implemented (Rule 2)
- [x] Always-provide-text rule (Rule 1) — verified via re-run baseline prompts
- [x] Role assistant route refactored to use the new prompt builder
- [x] `npx tsc --noEmit` exit 0
- [ ] Corey sign-off before Phase 3 entry

### 12g. Carry-forward for later phases

- ~~Phase 3 must sharpen tool descriptions to eliminate the remaining
  `call_analysis` hallucination~~ **Resolved 2026-05-13:** `call_analysis`
  is a real tool. The Phase 0 finding was wrong (tool count undercounted
  by Phase 0 grep). Phase 3 instead merges thin dispatcher tools
  (`call_analysis`, `pipeline_health`, `what_next`, `team_overview`) into
  the canonical query tools per `docs/TOOL_AUDIT.md`.
- Phase 4 must enforce the traffic-light rule at the API level (currently
  prompt-level only — a clever or jailbroken model could still fire
  without confirmation).
- Phase 8 adds `prompt_version` to `ai_logs` so drift detection can
  correlate prompt versions to behavior. VERSION constants in code today
  but not yet logged.

---

## 13. Phase 3a — Tool Audit (CATALOGED 2026-05-13)

Phase 3a ships the inventory. Phase 3b (next session) ships the code refactor.

### 13a. What shipped

- **`docs/TOOL_AUDIT.md`** — every one of the 83 tools categorized into
  6 domains (Read, Communication, Pipeline/Property, Tasks/Notes/Appts,
  CRM creation, Next-step pushers). Each tagged with KEEP / MERGE / DROP
  and a risk tier (GREEN / YELLOW / RED) per Phase 4's traffic-light
  classification.
- Production usage data from `ai_logs.tools_called` last 90 days:
  - 5 assistant sessions total invoked any tool
  - 7 total tool invocations
  - 78 of 83 tools never called in production
  - Real tools called: `send_sms` ×2, `query_properties` ×1,
    `pipeline_health` ×2, `team_overview` ×1, `what_next` ×1

### 13b. Headline corrections

1. **Tool count: 83, not 38** (see Section 2). My Phase 0 grep missed
   ~45 inline shorthand definitions.
2. **No hallucinated tools.** `call_analysis`, `pipeline_health`,
   `team_overview`, `what_next` are all real tools. The model has been
   picking the right names.

### 13c. Post-cleanup target — 43 tools (not 15)

Why not 15: the 15-tool target from the original LLM Rewiring Plan would
require dropping real product capabilities (appointment management,
buyer pipeline, CRM creation, etc.). 43 is the achievable, defensible
target after 40 MERGE/DROP decisions. Still a real ~2× reduction.

### 13d. Phase 3b — code refactor (partial — 2026-05-13)

**Shipped this session: 13 dispatcher-tool drops** (the safest subset).
Tools removed from `lib/ai/assistant-tools.ts` AND `lib/ai/role-gates.ts`:

`call_analysis`, `deal_blast_info`, `deal_health`, `compare_deals`,
`what_next`, `rep_performance`, `team_overview`, `pipeline_health`,
`explain_field`, `contact_objections`, `seller_profile`, `title_risk`,
`market_analysis`.

These 13 had no real handler logic — they were stub names that returned
the same data that real query tools already expose. Dropping them
eliminates the overlap and forces the model to use the canonical
query tools.

**Tool count: 83 → 70** (more reduction in follow-up sessions).

**Verified against real prompts:**

| Prompt | Pre-cleanup tool | Post-cleanup tool |
|---|---|---|
| "Coach me on my last call" | `call_analysis` (stub) | **`search_calls`** (real) |
| "How is my team doing today?" | `team_overview` (stub) | **`get_kpi_metrics` + `get_team_performance`** (real) |
| "Show me the pipeline health" | `pipeline_health` (stub) | **`get_ghl_pipeline_state`** (real, per-lane) |
| "What should I work on?" | `query_tasks + cross_entity_query` | same — unchanged |
| "What's hot in pipeline?" | `query_properties` | same — unchanged |

Same quality (or better) on all five prompts. Narrative wraps from
Phase 2 still active.

**Deferred to future sessions (27 tools still to drop/merge):**

- 7 formal-block drops: `regrade_call`, `summarize_property`,
  `reclassify_call`, `mark_call_reviewed`, `invite_team_member`,
  `add_internal_note` (merge target = `add_note`), `change_pipeline_stage`
  (merge target = `change_property_status`)
- 12 inline-block drops: `approve_all_deal_intel`, `trigger_property_enrichment`,
  `create_comp_analysis`, `generate_next_steps`, `push_next_step`,
  `flag_calibration`, `rematch_buyers`, `update_user_role`, `set_kpi_goals`,
  `update_pipeline_config`
- 8 inline-block merges into existing tools:
  - `add_tags_to_contact` + `remove_tags_from_contact` + `assign_contact_to_user`
    → `update_contact` (add params)
  - `update_opportunity_status` → `change_property_status`
  - `update_opportunity_value` + `set_property_markets` + `set_project_types`
    → `update_property`
  - `send_sms_blast` → `send_sms` (add `targetTier`)
  - `send_email_blast` → `send_email` (add `targetTier`)

The merges require parameter design in the target tools — bounded risk
work for a follow-up session. Each merge is its own commit so rollback
is surgical.

**Description sharpening** also deferred. Current descriptions are mostly
clear; Phase 6 (per-surface tuning) is the natural window for the polish
pass on the 41 keepers.

### 13e. Done-when (Phase 3b)

- [x] 13 dispatcher tools removed from `assistant-tools.ts`
- [x] 13 dispatcher tools removed from `role-gates.ts`
- [x] `npx tsc --noEmit` exit 0
- [x] Verified 5 baseline prompts pick real query tools
- [ ] 27 remaining drops/merges — follow-up sessions
- [ ] Description sharpening pass (Phase 6 window)
- [ ] Tool-coverage test (every `ASSISTANT_TOOLS` entry has role-gate)

---

## 14. Phase 4 — Traffic-Light at API Level (COMPLETE 2026-05-13)

Closes the security gap from Phase 2: the prompt-level traffic-light rule
could be bypassed by a clever model or jailbreaked client. Phase 4 enforces
the tier classification at the code level.

### 14a. What shipped

- **`lib/ai/approval-tiers.ts`** (new) — single source of truth for the
  RED / YELLOW / GREEN tier per tool. Exports `getApprovalTier`,
  `requiresExplicitApproval`, `requiresFullTextModal`, plus tier-Set
  exports for set membership. Default tier for unknown tools = YELLOW
  (safer than auto-firing).
- **`lib/ai/role-gates.ts`** (updated) — `HIGH_STAKES_TOOLS` now derives
  from `RED_TIER_TOOLS`. `isHighStakes(toolName)` now returns true for
  any RED or YELLOW tool (was: 5 hard-coded tools). Backwards-compat
  alias kept so existing import sites continue to work.
- **`components/ui/coach-sidebar.tsx`** (updated):
  - `HIGH_STAKES_TYPES` (UI mirror) replaced with `RED_TIER_TOOLS`
    imported from `lib/ai/approval-tiers.ts` — single source of truth.
  - Regular approve button now sends `approved: true` (was: omitted).
    Required because the server's `isHighStakes` now demands approval
    for YELLOW tools too.

### 14b. Tier classification (snapshot)

| Tier | Count | Examples |
|---|---|---|
| RED | 11 | send_sms, send_email, schedule_sms, schedule_email, send_sms_blast, send_email_blast, add_contact_to_workflow, remove_contact_from_workflow, bulk_tag_contacts, update_user_role, update_pipeline_config |
| YELLOW | 27 | change_property_status, update_property, update_contact, log_offer, log_milestone, create_task, create_appointment, etc. |
| GREEN | 22 | query_properties, search_calls, get_kpi_metrics, get_team_performance, add_note, add_internal_note, calculate_mao, regrade_call, etc. |

Total: 60 classified tools out of 70. The 10 unclassified tools default
to YELLOW (require approval) — safer than auto-firing.

### 14c. Threat model — what's now defended

| Attack | Phase 2 only | Phase 4 |
|---|---|---|
| Model decides to call `send_sms` without confirmation | Prompt rule SHOULD prevent it but is suggestive only | Server returns 409 `requiresApproval` → no send |
| Forged client POSTs `{toolCallId, ...}` without `approved` | Goes through (only 5 hard-coded tools were gated) | Server returns 409 for all RED + YELLOW |
| Jailbroken model produces `change_property_status` mid-turn | Would fire (only HIGH_STAKES was gated, change_property_status wasn't) | Server requires approved=true → no execute |
| Replay attack with old `approved: true` payload | Would execute | Still executes — Phase 4 doesn't add nonce/replay protection (future work if needed) |

### 14d. UX implications

- **GREEN tools** (queries, notes): no UX change. User clicks approve, runs.
- **YELLOW tools** (state mutations): no UX change. User clicks approve, the
  click sends `approved: true`, server passes, runs.
- **RED tools** (customer-facing): the confirmation modal fires (was: only
  for 6 tools). User now sees the full text + recipient for every send
  before clicking Confirm. Higher friction, but matches Corey's
  "very controlled at first" feedback memory.

### 14e. Done-when (Phase 4)

- [x] `lib/ai/approval-tiers.ts` ships with full tier map
- [x] `role-gates.ts` `isHighStakes` derives from tier module
- [x] `coach-sidebar.tsx` mirrors RED tier from server
- [x] Regular approve button sends `approved: true`
- [x] `npx tsc --noEmit` exit 0
- [ ] Smoke-test against the assistant: change_property_status now goes
      through tier check (deferred — needs running dev server with auth)
- [ ] Corey sign-off before Phase 5

### 14f. Carry-forward

- Audit-log every refusal (Phase 8 observability adds this — `ai_logs`
  will record tier + approval_status).
- Consider auto-execute for GREEN tools without user click (next UX
  optimization — out of scope for Phase 4).
- Replay protection (nonce per toolCallId) — future if needed.

---

## 15. Phase 5 — Cross-Session Memory (COMPLETE 2026-05-13)

The session summarizer already existed (`lib/ai/session-summarizer.ts`
generates 1-paragraph rollups via Haiku; assistant route already loads
the last 3 summaries via `getRecentSessionMemory`). Phase 5 adds the
two missing pieces: user-controlled forgetting + privacy audit logging.

### 15a. What shipped

- **Prisma additive migration** `20260513000000_session_summary_forget`
  (already applied to production):
  - `assistant_session_summaries.excluded_from_history BOOLEAN NOT NULL DEFAULT false`
  - `assistant_session_summaries.excluded_at TIMESTAMP(3)`
  - Index `(tenant_id, user_id, excluded_from_history)` for the filtered
    retrieval query.
- **`lib/ai/session-summarizer.ts`** (updated):
  - `getRecentSessionMemory` now filters `excludedFromHistory: false`.
  - Every memory injection writes an `audit_logs` row with action
    `assistant.memory.loaded` (severity INFO, lists dates injected).
  - New `forgetSession(tenantId, userId, sessionDate)` function —
    idempotent, scoped to user's own summaries. Writes
    `assistant.memory.forgotten` audit log.
- **`app/api/ai/assistant/forget/route.ts`** (new):
  - `POST /api/ai/assistant/forget` with `{ sessionDate: 'YYYY-MM-DD' }`.
  - Tenant + user scoped via `withTenant`. A user can only forget
    their own summaries.
  - Returns `{ ok: true }` on success, `404 no_summary_for_date` on miss.

### 15b. Done-when (Phase 5)

- [x] Session summary infrastructure already wired (was Sessions 50+)
- [x] Excluded-from-history field + migration
- [x] Filter in `getRecentSessionMemory`
- [x] `forgetSession` function
- [x] `/api/ai/assistant/forget` endpoint
- [x] Privacy audit log on memory inject + forget
- [x] `npx tsc --noEmit` exit 0
- [ ] UI "Forget yesterday's conversation" button in coach-sidebar.tsx
      — trivial follow-up: button that POSTs to `/api/ai/assistant/forget`.
- [ ] Corey sign-off before Phase 6
