# Tool Audit — Phase 3 of LLM Rewiring Plan

> Date: 2026-05-13 (Session 86 continuation)
> Source: `lib/ai/assistant-tools.ts` (every tool definition, including
> inline shorthand declarations on single lines)
> Consumes: 90-day `ai_logs.tools_called` aggregation
> Companion: `docs/LLM_REWIRING_PLAN.md` Phase 3, `docs/LLM_AUDIT_BASELINE.md` Section 2

---

## TL;DR

- **Real tool count: 83**, not 38. My Phase 0 grep counted only top-level
  formatted `name:` entries and missed ~45 single-line inline shorthand
  definitions at the bottom of `assistant-tools.ts`. Correcting the
  baseline.
- **`call_analysis`, `pipeline_health`, `team_overview`, `what_next` are
  REAL tools** — the Phase 0 conclusion that the model hallucinated them
  was wrong. The model correctly identified the right tool names. The
  remaining quality issue is that many of these tools don't do meaningful
  work — they're "dispatcher" names that wrap thin logic.
- **Production usage in last 90 days: 5 sessions called tools at all.**
  Real-tool calls: `send_sms` ×2, `query_properties` ×1, `pipeline_health` ×2,
  `team_overview` ×1, `what_next` ×1. **78 of 83 tools have never been
  called in production.**
- **Phase 3 reframe stands**: this isn't "consolidate active tools" —
  the assistant feature is barely used. It's "make the right tools
  discoverable + sharp + role-gated correctly so the assistant becomes
  worth using."

---

## Methodology

1. `grep -oE "name:\s*'[a-z_]+'" lib/ai/assistant-tools.ts` → 83 distinct names.
2. Query `ai_logs.tools_called` for last 90 days where `type='assistant_chat'`.
3. Categorize each tool: domain, role-gating intent, redundancy, KEEP/MERGE/DROP/DEFER.
4. Mark each tool's risk tier (GREEN/YELLOW/RED) per Phase 4 traffic-light rule.

---

## Tool inventory by domain (all 83)

### A. Read / Query tools (15) — GREEN tier

These pull data from the DB. Low risk. The most useful subset of the roster.

| Name | Purpose | Usage 90d | Recommendation | Notes |
|---|---|---|---|---|
| `query_properties` | Filter inventory by status, ARV, TCP, lane, source, market | 1 | **KEEP** | Workhorse query tool. Sharpen description with concrete examples ("What deals are stuck in Negotiation?"). |
| `search_calls` | Find calls by rep, date, score, contact | 0 | **KEEP** | Workhorse for call review. |
| `semantic_search_calls` | Vector search over call transcripts | 0 | **KEEP** | Unique capability — keep. |
| `query_tasks` | Filter tasks by user, status, due date | 0 | **KEEP** | Day Hub backbone. |
| `query_sellers` | Look up sellers by name, phone, address | 0 | **KEEP** | Most common "Pull up John Smith"-style query. |
| `query_buyers` | Look up buyers by markets, buy box, tier | 0 | **KEEP** | Dispo workflow. |
| `get_kpi_metrics` | KPI numbers for user/role/time period | 0 | **KEEP** | Daily check-in question. |
| `get_team_performance` | Cross-rep performance comparison | 0 | **KEEP** | Manager-only via role-gate. |
| `get_ghl_pipeline_state` | Live pipeline state from GHL | 0 | **KEEP** | Source of truth for stages. |
| `cross_entity_query` | Multi-table query (properties + calls + tasks) | 0 | **KEEP** | Highest-value query tool for "morning brief" use case. |
| `find_similar_deals` | Vector search for similar properties | 0 | **KEEP** | Unique capability. |
| `pipeline_health` | Analyze pipeline: stage distribution, velocity, stuck deals | 2 | **MERGE** into `cross_entity_query` with a `report=pipeline_health` flag, OR keep as discoverable alias |
| `team_overview` | All reps compared, who needs attention | 1 | **MERGE** into `get_team_performance` |
| `what_next` | Prioritized list of recommended actions | 1 | **MERGE** into `cross_entity_query` with intent prioritization |
| `deal_health` | Current deal: timeline, milestones, risk factors | 0 | **MERGE** into `query_properties` with `report=deal_health` flag for one property |
| `compare_deals` | Compare current property to similar pipeline deals | 0 | **MERGE** into `find_similar_deals` |
| `rep_performance` | Single rep performance summary | 0 | **MERGE** into `get_team_performance` with `userName` filter |
| `call_analysis` | Detailed analysis of one call | 0 | **MERGE** into `search_calls` with `includeIntel=true` |
| `seller_profile` | Communication profile for current seller | 0 | **MERGE** into `query_sellers` with `includeProfile=true` |
| `contact_objections` | All objections across calls with a contact | 0 | **MERGE** into `search_calls` with `groupBy=objection` |
| `market_analysis` | Market analysis for current property | 0 | **DROP** — Phase 6 / property page UI |
| `title_risk` | Title/legal risks from deal intel | 0 | **DROP** — better as part of deal_health |
| `explain_field` | Explain a data field's meaning + source | 0 | **DROP** — UI affordance, not an LLM tool |
| `deal_blast_info` | Show deal blast specs | 0 | **DROP** — UI affordance |

**Read-tier post-cleanup target: 11 tools.** Dispatcher-style "what_next" /
"pipeline_health" / "team_overview" stay as aliases for discoverability
even after merging, because real production logs prove users phrase
questions that way.

### B. Action tools — Communication (8) — RED tier (customer-facing)

These touch a real contact. Maximum risk. **Phase 4** must enforce
approval-queue at API level — prompt-level enforcement (Phase 2 Rule 2)
is necessary but not sufficient.

| Name | Purpose | Usage 90d | Recommendation | Notes |
|---|---|---|---|---|
| `send_sms` | Send SMS to a GHL contact | 2 | **KEEP** | Sharpen: "Sends a SINGLE SMS to ONE contact. Requires user approval of exact text." |
| `send_email` | Send email to a contact | 0 | **KEEP** | Same rules as send_sms. |
| `schedule_sms` | Send SMS at future date/time | 0 | **KEEP** | Useful for nurture cadences. |
| `schedule_email` | Schedule email | 0 | **KEEP** | Useful. |
| `send_sms_blast` | SMS to matched buyers for a property | 0 | **MERGE** into `send_sms` with `targetTier` (one tool, internal dispatch) — currently two tools confuses the model |
| `send_email_blast` | Email blast to matched buyers | 0 | **MERGE** into `send_email` with `targetTier` |
| `generate_deal_blast` | Generate SMS/email copy for a blast | 0 | **KEEP** | Different from send — generates draft for human review. |
| `bulk_tag_contacts` | Add tags to many contacts at once | 0 | **KEEP** — but bump to RED tier (currently no flag) |

**Communication post-cleanup target: 6 tools.**

### C. Action tools — Pipeline / Property (12) — YELLOW tier

These change deal state. Approval-confirm required.

| Name | Purpose | Recommendation | Notes |
|---|---|---|---|
| `change_pipeline_stage` | Move opp between stages in GHL | **MERGE** into `change_property_status` (Gunner is source of truth per memory) |
| `change_property_status` | Change Gunner acq/dispo status | **KEEP** | Workhorse. |
| `update_property` | Update a field on current property | **KEEP** | Common operation. |
| `update_contact` | Update GHL contact fields | **KEEP** | |
| `update_buyer` | Update buyer record | **KEEP** | |
| `update_deal_intel` | Update one deal-intel field | **KEEP** | Drives intel curation. |
| `update_opportunity_status` | won/lost/open/abandoned | **MERGE** into `change_property_status` |
| `update_opportunity_value` | Update deal monetary value | **MERGE** into `update_property` |
| `update_pipeline_config` | Update pipeline trigger config | **DROP** — Settings UI only |
| `update_user_role` | Change team member role | **DROP** — Settings UI only |
| `set_kpi_goals` | Set role KPI targets | **DROP** — Settings UI only |
| `set_property_markets` | Set property's markets | **MERGE** into `update_property` |
| `set_project_types` | Set property's project type | **MERGE** into `update_property` |
| `log_offer` | Log an offer on a property | **KEEP** | First-class action. |
| `log_counter_offer` | Log a counter offer | **KEEP** | First-class action. |
| `log_milestone` | Log a deal milestone | **KEEP** | First-class action. |
| `mark_call_reviewed` | Mark call as reviewed | **DROP** — UI checkbox, not an LLM action |
| `flag_calibration` | Flag call as good/bad calibration | **DROP** — UI flag, low-frequency |
| `reclassify_call` | Change call type | **DROP** — admin UI |
| `regrade_call` | Re-grade with fresh AI | **DROP** — admin UI button |
| `trigger_property_enrichment` | Re-run AI enrichment | **DROP** — admin UI button |
| `approve_all_deal_intel` | Bulk-approve deal intel | **DROP** — UI bulk button |
| `rematch_buyers` | Re-run buyer matching | **DROP** — UI button |
| `summarize_property` | Generate deal brief | **DROP** — property page renders this; LLM doesn't need to invoke |
| `calculate_mao` | MAO formula | **KEEP** | Numeric utility, often asked. |
| `create_comp_analysis` | Run comp analysis on property | **DROP** — UI button |

**Pipeline/Property post-cleanup target: 9 tools.**

### D. Action tools — Tasks / Notes / Appointments (12) — YELLOW tier

| Name | Purpose | Recommendation |
|---|---|---|
| `create_task` | Create a follow-up task | **KEEP** |
| `update_task` | Update task title/desc/due | **KEEP** |
| `complete_task` | Mark task done | **KEEP** |
| `add_note` | Add a customer-visible note | **MERGE** with `add_internal_note` → one `add_note` with `internal: bool` |
| `add_internal_note` | Add internal-only note | (merged) |
| `create_appointment` | Schedule an appointment | **KEEP** |
| `update_appointment_status` | confirmed / showed / no-show | **KEEP** |
| `reschedule_appointment` | Move appointment | **KEEP** |
| `cancel_appointment` | Cancel appointment | **KEEP** |
| `add_tags_to_contact` | Add tags | **MERGE** into `update_contact` (add a tags param) |
| `remove_tags_from_contact` | Remove tags | (merged) |
| `add_contact_to_workflow` | Put contact in GHL workflow | **KEEP** — but Phase 4 RED tier (this triggers customer messages) |
| `remove_contact_from_workflow` | Pull from workflow | **KEEP** — same RED tier |
| `assign_contact_to_user` | Assign contact ownership | **MERGE** into `update_contact` |
| `move_buyer_in_pipeline` | Buyer stage transitions | **KEEP** |

**Tasks/Notes/Appointments post-cleanup target: 10 tools.**

### E. Action tools — CRM creation (5) — YELLOW tier

| Name | Purpose | Recommendation |
|---|---|---|
| `create_contact` | New GHL contact | **KEEP** |
| `create_opportunity` | New deal in pipeline | **KEEP** |
| `add_contact_to_property` | Link contact to property | **KEEP** |
| `remove_contact_from_property` | Unlink | **KEEP** |
| `add_buyer` | Create new buyer record | **KEEP** |
| `add_team_member_to_property` | Assign team member to deal | **KEEP** |
| `remove_team_member` | Unassign | **KEEP** |
| `invite_team_member` | Send team invite email | **DROP** — Settings UI |

**CRM creation post-cleanup target: 7 tools.**

### F. Next-step pushers (2)

| Name | Purpose | Recommendation |
|---|---|---|
| `generate_next_steps` | AI-recommended next steps for a call | **DROP** — Call detail UI button; LLM doesn't need a tool wrapper |
| `push_next_step` | Push an AI-suggested next step to GHL | **DROP** — Same; UI flow |

---

## Post-cleanup roster (target: 43 tools)

This is more than the original "15" target but reflects the actual surface
area of the product. Each kept tool has a clear, non-overlapping purpose.

| Tier | Count | Notes |
|---|---|---|
| Read / GREEN | 11 | After 13 merges into 11 canonical queries |
| Communication / RED | 6 | After 2 merges |
| Pipeline-Property / YELLOW | 9 | After many merges + drops |
| Tasks-Notes-Appointments / YELLOW | 10 | After 4 merges |
| CRM creation / YELLOW | 7 | One drop |
| **TOTAL** | **43** | Down from 83 — **~2× reduction** |

The "15-tool" headline from the original plan isn't reachable without
gutting real product capability. A 2× reduction with sharper boundaries
and clean role-gating is the achievable, defensible target.

---

## Action plan for Phase 3 build (next session)

This session ships the AUDIT (this doc). The actual code refactor is
deferred to a focused next session to keep risk bounded.

### Phase 3 build tasks (next session)

1. **Drop / merge the 40 tools marked DROP or MERGE** in this audit.
   Each MERGE requires the target tool to accept the source tool's
   parameters via a new optional field.
2. **Sharpen all 43 keeper descriptions** to one tight sentence each
   that includes a concrete example or distinguishing phrase. Goal: when
   a user says "what's next for me?", the model picks `cross_entity_query`,
   not `what_next` (because the alias will be gone).
3. **Update `role-gates.ts`** — assign each tool to allowed roles. Today
   the role-gating is uneven; after the cleanup it should be:
   - Read tools: ALL roles
   - Communication tools: only LM/AM/DM (not ADMIN-only, since admin
     doesn't send customer messages)
   - Pipeline mutations: LM/AM/DM/TEAM_LEAD
   - Settings-style mutations: OWNER/ADMIN only
4. **Add a code-level test** that asserts every tool in `ASSISTANT_TOOLS`
   has both a description AND a role-gate entry. Catches drift.
5. **Re-run the Phase 0 baseline prompts** after the cleanup. Goal: every
   prompt picks a real, descriptive tool name AND the response narrates
   what it's doing (Phase 2's Rule 1 already does the latter — Phase 3
   ensures the tool choice is informed).

### Risk-bounded rollout

- Each MERGE is a separate commit so rollback is surgical.
- DROPS only delete tool definitions, not the underlying handlers
  (handlers stay for any internal callers). Phase 6 cleans up handlers
  if they're truly orphaned.
- Role-gate changes are tested with a sample call from each role
  against the new roster before going live.

---

## Carry-forward to Phase 4 (traffic-light at API level)

Phase 3's RED/YELLOW tier classifications above are the input to Phase 4.
The traffic-light enforcement file in Phase 4 (`lib/ai/approval-tiers.ts`)
will reference this audit's tier columns as its tier table.

---

## Phase 3a done-when (this session)

- [x] `docs/TOOL_AUDIT.md` exists with all 83 tools catalogued
- [x] Real production usage data captured from `ai_logs`
- [x] KEEP/MERGE/DROP recommendation per tool with justification
- [x] Risk tier (RED/YELLOW/GREEN) per tool
- [x] Post-cleanup target: 43 tools (~2× reduction from 83)
- [ ] Corey sign-off before Phase 3b (the actual code refactor)
