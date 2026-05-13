# Session 87 Starter — Read This First

> Created 2026-05-13 at end of Session 86.
> Purpose: hand off the LLM Rewiring Plan execution to the next session
> without drift. Read this entire doc before touching anything.

---

## TL;DR

We're 6 phases into a 10-phase LLM Rewiring Plan. **Phases 0 + 1 + 2 +
3a + partial 3b + 4 + 5 are shipped, committed, and deployed.** The
work has measurably improved the Role Assistant (verified via real
prompts in `docs/baseline-prompts/2026-05-12.md`). Phase 6 (per-surface
tuning of the other 8 LLM surfaces) is next.

**Do not start Phase 6 without reading this entire doc first.** The
phases were corrected/reframed multiple times during Session 86 and
the canonical truth lives in `docs/LLM_REWIRING_PLAN.md` + the
baseline doc, not in this file.

---

## Required reading order (15 minutes)

1. **`CLAUDE.md`** — non-negotiable project rules (you know this one).
2. **`docs/LLM_REWIRING_PLAN.md`** — the locked 10-phase plan with 5
   patch notes integrated. Read the revision history at the top first.
3. **`docs/LLM_AUDIT_BASELINE.md` Sections 1-15** — what was captured
   in Phase 0 + what shipped in Phases 1-5. Section 9 has open issues.
4. **`docs/TOOL_AUDIT.md`** — Phase 3b playbook. 70 tools remaining,
   27 still tagged DROP/MERGE.
5. **`docs/DECISIONS.md` D-051** — the 5 corrections that shape every
   phase. Especially fix #1 (cost cap is tiered) and fix #2 (tool count
   is 83, not 38 as Phase 0 initially reported).
6. **`PROGRESS.md` Session 86 entry** — running session log.

Skip these unless they're directly relevant:
- `docs/AI_AUDIT.md` — Session 85 agents audit (parallel track, not LLM Rewiring)
- `docs/agents/` — 16-agent roadmap (parallel track)
- `AGENTS_FOR_CHAT.md`, `AI_AUDIT_FOR_CHAT.md`, `SYNTHESIS_FOR_CHAT.md`
  — bundled exports for claude.ai chat sessions, no longer in use

---

## State of the codebase (what shipped in Sessions 85 + 86)

### Phase 0 — Baseline (Session 86)

- **`lib/kpis/lm-deac.ts`** ships the north-star metric.
  `calculateLmDeac(tenantId, userId, dateYmd?)` returns
  `{dials, tasksCompleted, apptsSet, scriptAdherenceScore, composite, notes}`.
  Counts GHL TaskComplete webhooks (NAH doesn't use Gunner tasks; 0 rows
  ever written to the local `tasks` table — see baseline doc Section 7d).
- **`LmDeacBaseline` Prisma table** persisted; **78 baseline rows** for
  6 NAH users × 13 days (2026-04-29 → 2026-05-11). **+25% target locked**
  for each role:
  - LEAD_MANAGER: avg 84.83 → target 106.04
  - ACQUISITION_MANAGER: avg 42.34 → target 52.93
  - DISPOSITION_MANAGER: avg 12.15 → target 15.19
  - ADMIN: avg 8.38 → target 10.48
- **Real spend baseline:** $166.66 over 30 days system-wide. NAH p95
  daily spend = $22.07. Tiered split = 99.9% critical-path / 0.1%
  discretionary. **The original $25/day blanket cap would have blocked
  99.9% of legitimate spend.** Phase 8 will use this for tier exemption.
- **10 baseline prompt transcripts** at `docs/baseline-prompts/2026-05-12.md`.

### Phase 1 — Settings wiring (Session 86)

- **`lib/ai/settings-context.ts`** — `buildSettingsContext(tenantId, userId)`
  with 5-min cache. Returns tenant name, KPI goals by role, markets,
  appointment types, full team roster with user profiles.
- **`lib/ai/context-builder.ts`** — `KnowledgeContext` now includes
  `settings`. `formatKnowledgeForPrompt` emits the settings block FIRST.
  Every consumer of `buildKnowledgeContext` (9 LLM call sites) auto-inherits.
- **Verified improvement on Q7 "Who is Chris?":** assistant now produces
  team synthesis ("Where you're a Driver type, Chris leans more
  relational — good complement for emotional handoffs") instead of
  generic role description.

### Phase 2 — Role Assistant prompt overhaul (Session 86)

- **`lib/ai/prompts/role-overrides.ts`** — 6 role identity blocks
  (OWNER, ADMIN, TEAM_LEAD, LEAD_MANAGER, ACQUISITION_MANAGER,
  DISPOSITION_MANAGER) with responsibilities, success/failure modes, tone.
- **`lib/ai/prompts/assistant.ts`** — `VERSION = "1.0.0"`. 5-section
  prompt structure (IDENTITY / VOICE / USER CONTEXT / OPERATING RULES;
  BUSINESS CONTEXT lives in variableTail for cache reasons). 7 operating
  rules including:
  - Rule 1: Always provide text (fixes tool-only responses)
  - Rule 2: Traffic-light action gating
  - Rule 3: Tools are finite (no hallucinated names)
- **`app/api/ai/assistant/route.ts`** — uses the new builder. 25 fewer
  lines. Caching behavior preserved.
- **Verified fixes on real prompts:**
  - Tool-only responses (#1, 5, 9, 10): all now have narrative wraps
  - "Move 123 Oak St to Contract" (#4): now produces YELLOW-tier
    confirmation BEFORE firing the tool
- **Cost impact:** +1,470 tokens per assistant turn (longer system
  prompt). +$0.004/turn. Negligible.

### Phase 3a — Tool audit (Session 86)

- **`docs/TOOL_AUDIT.md`** — every one of 83 tools categorized into 6
  domains (Read, Communication, Pipeline/Property, Tasks/Notes/Appts,
  CRM creation, Next-step pushers). Each tagged KEEP / MERGE / DROP +
  risk tier.
- **Correction shipped:** real tool count is 83, not 38 (Phase 0's grep
  was flawed). `call_analysis`, `pipeline_health`, `team_overview`,
  `what_next` are all REAL tools, not hallucinations. Baseline doc
  Section 2 + DECISIONS.md D-051 corrected.

### Phase 3b — Partial (Session 86)

- **13 dispatcher tools deleted** from `lib/ai/assistant-tools.ts` AND
  `lib/ai/role-gates.ts`: call_analysis, deal_blast_info, deal_health,
  compare_deals, what_next, rep_performance, team_overview,
  pipeline_health, explain_field, contact_objections, seller_profile,
  title_risk, market_analysis.
- **Tool count: 83 → 70.**
- **Verified:** assistant now picks `search_calls` instead of
  `call_analysis`, `get_team_performance` instead of `team_overview`,
  `get_ghl_pipeline_state` instead of `pipeline_health`. Same or better
  quality on all 5 test prompts.

### Phase 4 — Traffic-light at API level (Session 86)

- **`lib/ai/approval-tiers.ts`** — single source of truth for RED /
  YELLOW / GREEN classification per tool. 60 tools classified
  (RED: 11, YELLOW: 27, GREEN: 22). Unknown tools default to YELLOW.
- **`lib/ai/role-gates.ts`** — `isHighStakes` now derives from tier
  module. Returns true for any RED or YELLOW tool (was: 5 hard-coded).
  `HIGH_STAKES_TOOLS` is now `RED_TIER_TOOLS` aliased for backwards compat.
- **`components/ui/coach-sidebar.tsx`** — regular approve button now
  sends `approved: true` (was: omitted). UI's `HIGH_STAKES_TYPES` is now
  `RED_TIER_TOOLS` imported from server.
- **Threat closed:** a forged client POST that omits `approved` for
  any RED/YELLOW tool now returns 409. Previously only 5 tools were
  gated; now 38 are.

### Phase 5 — Cross-session memory (Session 86)

- **Prisma additive migration** `20260513000000_session_summary_forget`
  (applied). Adds `excluded_from_history` + `excluded_at` to
  `assistant_session_summaries`.
- **`lib/ai/session-summarizer.ts`** updated:
  - `getRecentSessionMemory` filters `excludedFromHistory: false`
  - Writes `assistant.memory.loaded` audit log on every injection
  - New `forgetSession()` function (idempotent, user-scoped)
- **`app/api/ai/assistant/forget/route.ts`** (new endpoint) — `POST`
  with `{sessionDate: 'YYYY-MM-DD'}` excludes that day's summary.
- **Carry-forward:** UI "Forget yesterday's conversation" button is
  trivial follow-up (~10 min) — POSTs to the new endpoint.

### Session 85 work also in this commit (parallel track)

- **`docs/AI_AUDIT.md`** — Session 85 audit of the existing AI surfaces
  (informed Phase 0 of the Rewiring Plan).
- **`docs/agents/README.md` + 16 spec docs** — separate worker-agent
  build roadmap (NOT part of LLM Rewiring; deferred until Rewiring is
  further along per the synthesis discussion). Don't conflate this with
  Phase 6 of the Rewiring Plan.

---

## Production schema changes applied

Both migrations are additive only (no destructive ops). Already applied
to production Supabase via `prisma migrate deploy`:

1. `20260512000000_add_lm_deac_baseline` — `lm_deac_baselines` table
2. `20260513000000_session_summary_forget` — adds 2 columns to
   `assistant_session_summaries`

On next Railway deploy, both will appear as "already applied" — no action needed.

---

## What's NEXT — Phase 6 entry instructions

**Phase 6 — Per-surface tuning.** Propagates the Phase 1+2 patterns
(settings context + versioned prompts) to the other 8 LLM surfaces:

1. `lib/ai/coach.ts` — AI Coach (sonnet, user-triggered)
2. `lib/ai/grading.ts` — Call grading (opus, 561 calls/30d at $0.10/call — **biggest cost lever**)
3. `lib/ai/extract-deal-intel.ts` — Deal intel (opus streaming, 731 calls/30d)
4. `lib/ai/generate-property-story.ts` — Property story (sonnet, 367 calls/30d)
5. `lib/ai/dispo-generators.ts` — Dispo description/listing/social (sonnet)
6. `lib/ai/photo-classifier.ts` — Photo vision (haiku — barely used)
7. `lib/ai/session-summarizer.ts` — Session memory (haiku)
8. `lib/ai/generate-user-profiles.ts` — Weekly user profiles (sonnet)

### Phase 6 first task (exact prompt to start with)

```
Read docs/SESSION_87_STARTER.md, docs/LLM_REWIRING_PLAN.md, and
docs/LLM_AUDIT_BASELINE.md Sections 1-15.

Then start Phase 6 of the LLM Rewiring Plan. Begin with lib/ai/grading.ts
because it's the highest-cost surface (561 calls/30d at $0.10/call).

Steps:
1. Read lib/ai/grading.ts in full to understand current prompt structure.
2. Extract the system prompt into lib/ai/prompts/grading.ts with
   VERSION = "1.0.0".
3. Apply the 5-section structure where it makes sense (grading is
   automated, not user-facing, so IDENTITY/USER CONTEXT blocks adapt).
4. Surface-specific OPERATING RULES per the audit baseline doc Section 6:
   - Inject playbook + scripts + rep profile (already happens via
     buildGradingContext — verify still works after refactor)
   - Add `script_adherence` as a dedicated rubric category so
     lib/kpis/lm-deac.ts can read it instead of averaging all categories
   - Output structure must stay JSON-compatible with existing parsing
5. Refactor lib/ai/grading.ts to use the new prompt module.
6. Re-run baseline: grade 5 sample calls, compare scores against
   pre-refactor versions. No regression > 10 points on any call.
7. Verify `script_adherence` appears in `calls.rubricScores` going
   forward.
8. Update PROGRESS.md + baseline doc Section 16.

Risk: grading is the most expensive surface. A regression costs real
money per call. Take extra care with prompt verification.
```

### Phase 6 acceptance criteria

- [ ] `lib/ai/prompts/grading.ts` exists with VERSION
- [ ] `lib/ai/grading.ts` refactored to use it
- [ ] Same JSON output structure (no breaking changes to consumers)
- [ ] `script_adherence` rubric category present in new gradings
- [ ] 5 sample calls re-graded: no >10-point regression
- [ ] `npx tsc --noEmit` exit 0
- [ ] PROGRESS.md updated

After grading, work through the other 7 surfaces in this order:
coach → deal-intel → story → dispo → profile → photo → summarizer.
Coach + deal-intel are second-highest impact; the rest are smaller
surfaces.

---

## Open issues carried forward (DO NOT lose track of these)

From `docs/LLM_AUDIT_BASELINE.md` Section 9:

| ID | Issue | Phase |
|---|---|---|
| A | Stage-transition audit logging missing → LM-DEAC `apptsSet` is a proxy via `property.updatedAt` | Phase 6 or future small ticket |
| C | 0% error rate in `ai_logs` is suspicious — likely under-captured | Phase 8 |
| D | Haiku usage ≈ 0 despite 2 wired surfaces (photo-classifier + session-summarizer) | Phase 6 verification |
| F | No `script_adherence` rubric key → LM-DEAC uses avg-of-all proxy | **Phase 6 fix during grading.ts work** |
| G | No `Task.completedBy` field → can't distinguish agent-completed vs human-completed | When agent auto-complete ships |

Carry-forwards from Phase 4:
- Audit-log every refusal (Phase 8 observability)
- Replay protection for tool calls (nonce per toolCallId) — future

Carry-forward from Phase 5:
- UI "Forget yesterday's conversation" button (~10 min trivial UI work)

Carry-forward from Phase 3b:
- 27 more tool drops/merges (mechanical, low-risk). The full list is in
  `docs/TOOL_AUDIT.md`. Each merge = separate commit for surgical rollback.

---

## What NOT to do in Phase 6

- **Don't refactor grading.ts to change the JSON output structure.**
  Downstream consumers (`extract-deal-intel.ts`, the call detail page,
  the call review UI) all parse the current shape. Breaking it cascades.
- **Don't drop `industry-knowledge.ts`** without verifying knowledge
  documents cover the content. Phase 1 said "augment, don't replace."
- **Don't start any other phase until Phase 6 grading is verified.**
  Grading is the foundation; if it regresses, every downstream surface
  is on shaky ground.
- **Don't merge tool consolidations during Phase 6.** That's Phase 3b
  remaining — different work, different risk profile. Keep them separate.

---

## Verification protocol before Phase 6 ships

1. `npx tsc --noEmit` exit 0
2. Five test prompts via the assistant — must work without errors:
   - "How did my calls grade yesterday?"
   - "Coach me on my last call"
   - "What's our buy box?"
   - "Move 123 Oak St to Contract" (must produce confirmation, not fire)
   - "Who is Chris?"
3. Cost check: pull `ai_logs` for the day after Phase 6 lands.
   Critical-path spend should be within ±20% of the 30-day baseline.
   If spend doubles, ROLL BACK.
4. Sample 5 graded calls (random) and compare scores side-by-side with
   the pre-Phase-6 grading. No call should drop more than 10 points
   unless there's a clear reason.

---

## File map — where things live

```
Code shipped in this commit:
  lib/kpis/lm-deac.ts                    Phase 0
  lib/ai/settings-context.ts             Phase 1
  lib/ai/context-builder.ts              Phase 1 (modified)
  lib/ai/prompts/role-overrides.ts       Phase 2
  lib/ai/prompts/assistant.ts            Phase 2
  lib/ai/approval-tiers.ts               Phase 4
  lib/ai/role-gates.ts                   Phase 3b + 4 (modified)
  lib/ai/assistant-tools.ts              Phase 3b (modified)
  lib/ai/session-summarizer.ts           Phase 5 (modified)
  app/api/ai/assistant/route.ts          Phase 2 (modified)
  app/api/ai/assistant/forget/route.ts   Phase 5 (new)
  components/ui/coach-sidebar.tsx        Phase 4 (modified)

Schema:
  prisma/schema.prisma                                            (modified)
  prisma/migrations/20260512000000_add_lm_deac_baseline/          (applied)
  prisma/migrations/20260513000000_session_summary_forget/        (applied)

Docs:
  docs/LLM_REWIRING_PLAN.md         Source of truth (locked)
  docs/LLM_AUDIT_BASELINE.md        Sections 1-15
  docs/TOOL_AUDIT.md                Phase 3b playbook
  docs/baseline-prompts/2026-05-12.md  10-prompt before-snapshot
  docs/SESSION_87_STARTER.md        This file
  docs/DECISIONS.md                 D-051 (5 corrections locked)
  docs/SYSTEM_MAP.md                KPIs section (Rule 8)
  PROGRESS.md                       Session 86 entry

Parallel track (Session 85 — not Phase 6 work):
  docs/AI_AUDIT.md
  docs/agents/                      16-agent roadmap (deferred)
```

---

## Smoke-test commands (run after pull, before starting Phase 6)

```bash
# Verify schema is in sync
npx prisma migrate status
# Expected: "Database schema is up to date!"

# Verify types
npx tsc --noEmit
# Expected: exit 0

# Verify LM-DEAC code works against production
cat > /tmp/lm-deac-smoke.ts <<'EOF'
import { calculateLmDeac } from './lib/kpis/lm-deac';
import { db } from './lib/db/client';
async function main() {
  const t = await db.tenant.findFirst({ where: { name: { contains: 'New Again' } } });
  const u = await db.user.findFirst({ where: { tenantId: t!.id, name: 'Daniel Lozano' } });
  const r = await calculateLmDeac(t!.id, u!.id, '2026-05-12');
  console.log(r);
  await db.$disconnect();
}
main();
EOF
npx tsx /tmp/lm-deac-smoke.ts
# Expected: dials > 0 for Daniel
```

---

## If you hit something unexpected

STOP and surface to Corey. Do not improvise around production AI code.
This stack is now load-bearing — call grading at $0.10/call × 561
calls/30d means a regression burns real money fast.

Open `docs/LLM_AUDIT_BASELINE.md` and `docs/LLM_REWIRING_PLAN.md` to
re-orient. Almost every decision has a paper trail there.

Good luck. The foundation is solid.
