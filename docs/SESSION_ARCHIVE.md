# SESSION_ARCHIVE.md — Gunner AI Historical Session Log

> Archived sessions from PROGRESS.md. Current sessions are in PROGRESS.md.
> This file is for reference only — Claude Code reads PROGRESS.md, not this file.

---

## Sessions 1–6 — Full MVP built

## Session 7 — Migration + property CRUD + rubric editor

## Session 8 — Phase 1 hardening
- Integrated non-negotiable rules, DEV_BYPASS_AUTH implemented

## Session 9 — Railway + GHL Marketplace App
- Railway deployed, health check passing
- GHL Marketplace App created, credentials added to Railway
- OAuth callback renamed from /ghl to /crm

## Session 10 — Step 3 complete (3a + 3b + 3c)
- Verified OAuth callback paths (3a)
- Built GHLDropdown, updateTenantSettings(), Pipeline tab (3b)
- Built poll-calls.ts polling fallback (3c)

## Session 11 — Full deployment night (2026-03-19)
- Deployed to Railway, fixed Next.js CVE, ESLint, Suspense, health check
- Created GHL Marketplace App, OAuth callback /ghl → /crm
- First real tenant "New Again Houses" onboarded on production
- Phase 1 exit criteria: 7 of 10 checked

## Session 12 — Phase 1 completion (2026-03-20)
- Fixed inbox, poll-calls, grading. All 17 calls graded.
- Fixed 3 cross-tenant vulnerabilities. Multi-tenancy audit: all safe.
- Gregory Palm property created via live webhook — end-to-end verified.
- PHASE 1 COMPLETE — all 10 exit criteria verified on production.

## Session 13 — Level 2 grading pipeline + Deepgram (2026-03-20)
- GHL context enrichment. All 17 calls regraded (scores 8-72).
- Built Deepgram transcription, webhook recording URL handler.
- Duration routing: <30s skip, 30-60s summary, 60s+ full grading.

## Session 14 — Phase 2 schema, TCP scoring, call detail 4-tab (2026-03-20)
- Phase 2 schema expansion: 7 call fields, 3 property fields, 7 new tables.
- TCP Scoring v1 (8-factor ensemble). Call detail rebuilt with 4-tab layout.

## Session 15 — Phase 2B + 2C: historical import, dashboard KPIs (2026-03-20)
- Historical import script. Dashboard wired to real data: score trends, priority leads.

## Session 16 — Phase 2E: team invites + role-based views (2026-03-20)
- GHL user mapping for team members. Calls matched to correct users.

## Session 17 — Phase 2F/2G: Stripe paywall + pricing page (2026-03-20)
- Stripe integration: 3-tier plans, checkout, webhooks. Pricing page built.

## Session 18 — Pre-Phase 3 audit + cleanup (2026-03-20)
- Fixed Prisma migration for Stripe fields. Pre-Phase 3 audit.

## Session 19 — Phase 3A: Gamification — XP, badges, leaderboard (2026-03-20)
- XP system (7 event types, 30 levels, 10 badges). Leaderboard widget.

## Session 20 — Phase 3B: Coaching v2 — proactive insights (2026-03-20)
- generateInsights(), proactive cards, session history, richer context.

## Session 21 — Phase 3C + 3D: Training Hub + Day Hub (2026-03-20)
- Training Hub: Call of Week, Top Calls, Review Queue.
- Day Hub: morning planner, overdue tasks, one-click completion.

## Session 22 — Phase 3E: Advanced TCP + score distribution (2026-03-20)
- Score distribution chart. TCP lead ranking. Batch recalculation.

## Session 23 — Phase 4A: Disposition Hub — buyers + deal blasting (2026-03-20)
- Buyers table, deal blasts, approval gates. Disposition Hub page.

## Session 24 — Phase 4B: Workflow Engine (2026-03-20)
- 4 triggers, 5 step types, delayed execution, condition evaluator.

## Session 25 — Phase 4C + 4F: Lead Source ROI + password reset (2026-03-20)
- ROI page with spend tracking. Password reset flow.

## Session 26 — Fix 3 critical bugs: calls tabs, page flash, silent errors (2026-03-20)
- Replaced broken tabs, eliminated page flash, added toast system.

## Session 27 — Fix Inbox, Appointments, Tasks — 10 targeted fixes (2026-03-20)
- 3 inbox fixes, 3 appointment fixes, 4 task fixes.

## Session 28 — PropertyMilestone system end to end (2026-03-20)
- 5 milestone types, auto-logging, manual entry, deal progress bar, KPI integration.

## Session 29 — Fix no-answer calls graded as F + 45s threshold (2026-03-20)
- Zero/short duration → FAILED/no_answer. Thresholds: 45s skip, 90s full grade.

## Session 30-31 — Bug fixes + AI Intelligence Layer + Role Assistant (2026-04-01 to 2026-04-02)
- 8 bug fixes (calendars, calls, buyers, SMS, property tabs, appointments)
- Call ingestion rewrite (3-layer: webhook + export + per-user search)
- AI Intelligence Layer: 5 new models, playbook loader, context builder, AI log page
- Role Assistant: 17 tools, daily persistence, page context, action cards

## Session 32 — Playbook integration + pgvector + all 74 tools + deep audit (2026-04-02 to 2026-04-03)

**Build:**
- Fixed Railway ESLint build error blocking deployment
- AI logging wired into all 11 touchpoints (was 3)
- Playbook knowledge wired into all 5 AI touchpoints (was 1)
- Weekly user profile auto-generation from call data
- Calibration call UI (star button on call detail)
- pgvector semantic search with OpenAI embeddings
- Assistant expanded to all 74 tools from architecture plan
- Lead Quality section on research tab (for ad agency feedback)
- Deal intel expanded: cost of inaction, walkthrough notes, financial distress, engagement metrics, objection effectiveness, deal red/green flags
- Knowledge tab redesigned: Playbook + User Profiles sub-tabs, editable profiles
- Action rejection learning loop (assistant learns from rejected suggestions)

**Nav + UI:**
- AI Logs moved to Bot icon (next to Settings gear)
- Training, ROI, Disposition hidden from nav
- Disposition, ROI, Training pages still accessible via direct URL

**Deep Audit — 30 issues found and fixed:**
- BROKEN: Calls tab grid, flag scoring button, KPI spend card
- BUG: Appointment toast, GHL 200-on-error, blast overrides not used
- SAFETY: SMS/blast confirmation dialogs added
- DATA: Offer status validation, offer update duplicate fix
- UX: Inventory pagination, outreach toast feedback

**Repo Cleanup:**
- 21 unused npm packages removed (-2,391 lines)
- All 5 TODO comments resolved
- .env.example synced with all 23 env vars
- Root cleaned: START_HERE.md, TECH_STACK.md moved to docs/
- .vscode/, .claude/ added to .gitignore
- Hardcoded secret removed from functions/poll-calls.js
- README.md rewritten, AGENTS.md + DECISIONS.md updated
- Stop hook: auto TypeScript check + push on session end

## Session 33 — Bulletproofing run + going-forward habits (2026-04-06 to 2026-04-07)

All 7 critical reliability fixes shipped in one session. Original GHL ingestion pipeline
audit found that 65% of real calls were being misclassified at webhook time. Fixed root
cause + 6 related reliability gaps + baked operational habits into the repo.

Fixes shipped:
- #1 (7255ed9): Calls misclassification — handleCallCompleted now uses isFailed (proof-based)
                 instead of isGradeable=duration>=45. Adds DB-level upgrade in poll-calls.
                 Adds FAILED→PENDING flip in fetchAndStoreRecording. Backfill SQL applied.
- #2 (7ef3eba): Recording-fetch jobs queue. Replaces in-process setTimeout(90_000) with
                 durable RecordingFetchJob table + 1-min cron. Survives Railway restarts.
- #3 (8b36af3 + 7fee0ca): 28 silent catches replaced with logFailure() across 5 files.
                            25-action vocabulary defined in audit_logs.
- #4 (7658a4a): HMAC signature verification + removed "first tenant" fallback (multi-tenant
                 leak risk).
- P4 (5d9911c): Caught Fix #3 miss in app/api/webhooks/ghl/route.ts during Fix #4 review.
- #5 (814ca50): Postgres advisory lock on poll-calls.ts (prevents concurrent run races) +
                 getGHLClient() in fetchAndStoreRecording (prevents stale token 401s).
- #6 (c63cb03 + f484820): withTenant<TParams>() helper + refactor of 3 representative routes
                           (properties[propertyId] PATCH, tasks[taskId]/complete POST,
                           call-rubrics[id] DELETE/PATCH). Refactor caught a real cross-tenant
                           leak in db.propertyMilestone.findFirst that the Session 12 audit missed.

Verification:
- Live site: All Calls today went from 8 → 23 immediately after Fix #1 + manual grading.
- Lisa Finley 10:17 conversation moved from Skipped → graded (score 63, 617s).
- Fix #2/#3 verified next morning via scripts/verify-bulletproofing.ts.

Going-forward habits committed:
- scripts/check-silent-catches.sh — bash scanner for .catch(() => {}) patterns (found 79 in broader codebase)
- scripts/daily-health-check.ts — morning ritual SQL check on queue + errors + misclassifications
- AGENTS.md route conventions — withTenant is now the default for all new routes

## Session 34 — Autonomous audit + known bug fixes (2026-04-08)

Tasks completed:
- Task 1: Health check — HEALTHY (0 queue items, 0 errors, 0 misclassifications)
- Task 2: P7 grading parse failure fixed (lib/ai/grading.ts + lib/ai/extract-deal-intel.ts)
  - Added robust `stripJsonFences()` using anchored regexes (^ and $) instead of weak /g flag
  - Applied to parseGradingResponse, next steps parser, and parseExtractionResponse
  - Existing fence stripping had weak regex that could match mid-content; now anchored to start/end
- Task 3: Silent catches swept from lib/ai/ and app/api/ai/ — 27 catches replaced
  - lib/ai/: grading.ts (3), extract-deal-intel.ts (1), coach.ts (4), context-builder.ts (1),
    enrich-property.ts (3), generate-user-profiles.ts (2) = 14
  - app/api/ai/: assistant/execute/route.ts (10), assistant/route.ts (1), outreach-action/route.ts (1) = 12
  - Plus 1 missed catch in execute/route.ts (getGHLClient) = 27 total
  - Audit log .catch() cases use console.error to avoid recursion
- Task 4: withTenant migration — 8 routes migrated (72 → 64 remaining)
  - review-count, audit, export, feedback, skip, reclassify, calibration, actions
- Task 5: TypeScript sweep — zero errors across entire project

Also in this session (before autonomous block):
- Call pipeline fix: WebhookLog table added, no-answer bug fixed, poll-calls stripped of
  inline transcription/grading, existingIds scoped to 48h. Deployed to Railway (a93d5b9).
- Restored embedding column on KnowledgeDocument (prevented 40-row data loss during db push)
- Created .env file for local Prisma operations

## Session 34b — WebhookLog outcome tracking (2026-04-08)

Extended WebhookLog with outcome tracking:
- Added 3 fields: status (received|processing|success|failed), processedAt, errorReason
- Added 3 indexes: [tenantId,eventType], [tenantId,status], [tenantId,receivedAt]
- route.ts: WebhookLog now writes status='processing' on arrival, then updates to
  'success' or 'failed' with processedAt + errorReason after handleGHLWebhook resolves
- Response to GHL still returns immediately — outcome update is fully async
- Files changed: prisma/schema.prisma, app/api/webhooks/ghl/route.ts, PROGRESS.md

## Session 34c — Audit page (2026-04-08)

Built /{tenant}/audit — 6-tab system event monitor (owner/admin only):
- Tabs: Dials (calls table), Leads (properties table), Appointments, Messages,
  Tasks, Stage Changes (all from webhook_logs with rawPayload parsing)
- API: app/api/[tenant]/audit/route.ts — withTenant, date picker, per-tab queries
- Status bar: webhook health dot (green/yellow/red), events today count, failed count
- Failed rows: red background + hover tooltip with errorReason
- Nav: Shield icon added to top-nav between AI Logs and Settings (admin+ only)
- Files: route.ts (new), page.tsx (new), audit-client.tsx (new), top-nav.tsx (modified)

## Session 35 — Live debugging day: call pipeline + audit page (2026-04-09)

First full day with team dialing on new system. 4 team members, ~336 calls (GHL CSVs).

Root causes found and fixed:
- GHL_WEBHOOK_SECRET HMAC rejection was silently dropping ALL webhooks since Apr 6 (Session 33)
- TYPE_CALL vs CALL mismatch — GHL built-in dialer sends TYPE_CALL, code only matched CALL
- pg_advisory_lock leaks on pgbouncer — poll cron blocked all day, replaced with timestamp lock
- Completed calls classified as no_answer — GHL sends callDuration=null at webhook time
- handleCallCompleted 5-min contactId dedup was killing real double-dials
- Automation webhooks (wf_ IDs) creating duplicates — bidirectional 30s dedup added
- process-recording-jobs wasting API calls on wf_ IDs — now skips them immediately
- Appointments not showing on audit — filter had AppointmentCreated, GHL sends AppointmentCreate
- Tasks/stages event types also mismatched — TaskComplete not TaskCompleted, OpportunityStageUpdate

End of day audit results (verified against GHL CSVs):
- Leads: 7/7 captured (Susan Hammer was existing property — correct behavior)
- Appointments: all correct
- Calls (afternoon after fixes): webhooks caught every call, zero missed
- Calls (morning before fixes): ~20 of Kyle's early calls missing, backfillable
- Duplicates: automation webhook still creates some extras, 30s dedup window should help
- Grading: 4 completed, 70 pending (recording-jobs fix deployed for overnight processing)

Key finding: GHL OAuth webhooks ARE the primary call delivery path (67% on Apr 6 when working).
The automation workflow webhook is a secondary source with synthetic wf_ IDs.
Poll cron is safety net but wasn't running most of today (advisory lock issue, now fixed).

Files changed: webhooks.ts, route.ts, poll-calls.ts, process-recording-jobs.ts, audit page files

## Session 36 — Backlog recovery for stuck calls (2026-04-19)

Corey flagged calls stuck in PENDING/FAILED. Live DB showed last-7-day split:
COMPLETED 48, FAILED 131, PENDING 1141, SKIPPED 394. Four root causes:

1. **Anthropic credits exhausted on 2026-04-13** — every `call.grading.failed`
   audit log from that day reads "Your credit balance is too low." Corey confirmed
   billing now healthy. Left 131 calls in FAILED with no auto-retry path.
2. **Stale-pending lookback too narrow** — `poll-calls.ts` only looks back 24h;
   1,000+ PENDING rows were older than that and no automatic retry touched them.
3. **`wf_*` workflow-event IDs** — cross-source dedup now handles this at webhook
   time (Session-35 refactor), but older rows still had `ghl_call_id` like
   `wf_1775758575091` and never got their recording.
4. **Prisma enum drift on local dev clients** — prod DB had `SKIPPED` (migration
   `20260413180000_add_skipped_grading_status` deployed Apr 13) but any local
   Prisma client generated before that migration crashed on those rows.

What shipped this session (scripts only — no code changes to app):
- `scripts/recover-stuck-calls.ts` — one-shot backfill. Scans last N days of
  PENDING/FAILED, resolves `wf_*` ids to real message ids via GHL conversation
  lookup (closest-in-time TYPE_CALL message), fetches missing recordings,
  transcribes via Deepgram, re-runs `gradeCall()`. Idempotent, fault-tolerant
  per-row, configurable `--concurrency` / `--sleep` / `--days` / `--limit`.
  Handles the unique-constraint collision when a `wf_` stub and a real call row
  both exist for the same call.
- `scripts/check-stuck-calls.ts` — diagnostic read of PENDING/FAILED state with
  raw SQL (bypasses Prisma enum on drifted clients) + RecordingFetchJob counts +
  last 10 `call.grading.failed` audit entries.
- `scripts/check-progress.ts` — live status-count snapshot.
- `scripts/reset-processing.ts` — flips any PROCESSING rows back to PENDING
  (for interrupted recovery runs).

An earlier attempt this session put the same fixes in app code (grading.ts,
webhooks.ts, fetch-recording.ts, process-recording-jobs) — those were abandoned
when Session-35's unified pipeline refactor landed from remote with a superior
architecture. Hard-reset to origin/main and kept only the scripts.

Verification:
- `npx tsc --noEmit` — 0 errors.
- Small live batch (20 rows): 8 graded cleanly before hitting a unique-constraint
  bug on a wf_ id collision; bug fixed, re-run.
- DB snapshot during full sweep: COMPLETED 48 → 319 (last 30d).

## Session 37 — Pipeline verifier built end-to-end + Blocker #1 cleared (2026-04-20)

Built `scripts/verify-calls-pipeline.ts` iteratively as a recurring health check
on the call ingestion pipeline. Four commits, each gated by tsc + a live run before
the next one landed. Final verifier is rollout-ready as a daily cron candidate.

Commits (all on main):
- `4921397` — first cut. Bucket spec aligned to current code (911bcb4 routing:
  `<45s → SKIPPED + short_call`, not the older Session-29 `FAILED + no_answer`
  shape). `countFailureLogs` OR-clause tightened to cover the three real shapes
  in `audit_logs` (`resourceId`, `resource='call:'+id`, bare `resource=callId`)
  plus a forward-compat `payload.callId` predicate.
- `5dc057d` — bidirectional rewrite after first run found 26/30 "missing" rows
  that were actually SMS messages. GHL's `/conversations/messages/export?type=TYPE_CALL`
  silently ignores the type filter. New design: Pass A (DB → GHL per-id integrity),
  Pass B (GHL → DB coverage via `/conversations/search` + per-conv messages +
  client-side `isCall` filter — verbatim copy of `lib/ghl/webhooks.ts:120-123`),
  plus a sanity gate up front.
- `90b5b01` — sanity loosened. First run halted on a single legacy row
  (`source=null`, `ghlContactId=null`, `durationSeconds=null` — likely from
  `recover-stuck-calls.ts`). Sanity now filters to `source IS NOT NULL` and
  halts only on 0/N verified (real endpoint break), not single-row drift.
  Added end-of-run canary: count of `calls WHERE source IS NULL`.
- `c013ffe` — Pass B sampling tightening. `/messages?limit=10` (was 50) +
  `dateAdded > now-30d` filter dropped 9 false-positive "missing" rows that
  were actually historical archive messages from chatty conversations
  (oldest from 2025-09-22). Skip transcript assertion when `dur < 10`
  (Deepgram can't transcribe dead air). Dedupe Pass B output by `dbCall.id`
  with `+N merged` indicator for cross-source-merge collapse.

Final verifier state on this tenant:
- Sanity: 5/5 verified, 3 wf_ synthetic skipped — endpoint healthy
- Pass A: 29/30 — single legacy row `cmo4o88zn0ra…` (source=null) is the only ❌
- Pass B: 20/25 — 4 short-call bucket mismatches + 1 genuine missing row
- Canary: 2487 source-null calls, **0 in last 24h** (taper, not active leak)
- Rollout diagnostic (separate query): 10/10 PASS on the last 10 calls ≥45s
  in the past 7 days. Both 45-89s summary path and 90s+ full-grade path
  confirmed live. **This is the proof that closes Blocker #1.**

Findings to triage (added to Known Bugs):
- Bucket-spec mismatch (bug #17): webhook handler sets `callResult='no_answer'`
  at ingestion when GHL ships an explicit fail status, but the cron only writes
  `short_call` after a successful Deepgram pass. Calls with explicit fail-status
  + duration <45s stay `no_answer` forever, never get rewritten when SKIPPED.
- 2487 `calls.source IS NULL` rows (bug #18), oldest 2026-03-21, newest 2026-04-18.
  Profile fits a bounded backfill operation (Session 36's `recover-stuck-calls.ts`
  most likely). Last 24h is zero — leak appears stopped.

Also shipped earlier today: `79e916e` (grading: coerce sentiment to float +
bump max_tokens to 8000) — fixes the `Argument 'sentiment': Invalid value`
errors visible in audit_logs from 2026-04-19 evening.

**Stop hook modified:** removed auto-commit + auto-push step. Stop hook now
only runs tsc. Pre-push git hook added as belt-and-suspenders tsc gate at push time.

## Session 38 — Blocker #2 cleared + grading pipeline rebuilt as a service (2026-04-20)

**The heavy day.** Two major threads back-to-back: AI Assistant propose→edit→confirm
wiring (Prompt 4 / Blocker #2) and a live-fire grading-pipeline rescue when the
Railway cron silently stopped firing mid-session.

**Prompt 4 — Blocker #2 cleared.** Closed ACTION_EXECUTION_AUDIT.md rows 1-7 (the
dead Edit button in coach-sidebar.tsx) by mirroring call-detail's propose → edit →
confirm pattern across the AI Assistant surface. Three commits:
- `15fe184` — extracted `resolveAssignee` helper to `lib/ghl/resolveAssignee.ts`.
- `2cf2509` — widened execute/route.ts schema with optional `editedInput`,
  merged over `toolCall.input` server-side. Fuzzy matching REMOVED from
  change_pipeline_stage + create_opportunity (Rule 2: stageId/pipelineId must
  be explicit GHL ids, 400 on miss).
- `5203539` — wired the Edit button (was `<button>` with no onClick). Per-action
  edit panel (12 types). High-stakes confirmation modal gating for send_sms,
  send_email, change_pipeline_stage, create_contact, update_contact,
  create_opportunity.

Phase D (production verification) deferred to user — needs real contacts or a
GHL test contact for the 6 high-stakes types. Three validation paths documented:
Cancel-path, GUNNER TEST contact, real-contact for medium-stakes types.

**Grading pipeline went silent mid-session.** At 04:43 UTC the
`process-recording-jobs` cron stopped firing, zero audit trail. Investigation:
1. Query-driven diagnostic confirmed 0 PROCESSING rows (rules out stuck claim),
   13 stale PENDING `recording_fetch_jobs` all wf_* artifacts, 0 successful
   `call.graded` audit rows since 04:43 UTC.
2. H1 (stuck tenant-timestamp lock) **RULED OUT** — process-recording-jobs is
   lockless; per-row atomic claim only.
3. H2 (data-shape errors cascading) — 7 grading errors at 04:14-04:28 UTC are
   real but not the root cause; 164 successful grades before 04:43 prove
   pipeline functional right up to outage.
4. H3 (Railway-side) — confirmed by elimination. Heartbeat audit row added
   (`1c8befe`) so next outage visible in <60s.
5. Whitespace re-registration attempt (`2cde3e9`) failed.
6. Converted to long-running `[[services]]` worker (`429c4a5`):
   - NEW `scripts/grading-worker.ts` — imports `processJobs()` and loops 60s.
   - `process-recording-jobs.ts` refactored: function exported, no `process.exit()`
     in body, `import.meta.url` entry-point guard.
   - `railway.toml`: removed `[[cron]] process-recording-jobs`, added
     `[[services]] grading-worker`.

**Three surgical post-service fixes (`a77911c`):**
- Fix 1 — null duration bypass. `duration === null` was slipping through skip
  guards into grading. Changed zero-check to `duration === null || duration === 0`.
  Root cause of bug #22 (24 empty-shell FAILED rows).
- Fix 2 — PROCESSING rescue. Reset rows stuck PROCESSING > 5 min back to PENDING.
- Fix 3 — FAILED auto-retry. Reset FAILED rows that have a recording and haven't
  been touched in > 1 hour.
- Schema: added `Call.updatedAt` + migration `20260420230000_add_updated_at_to_call`
  (3-step nullable → backfill → NOT NULL).

**Manual drains while debugging:** ran `process-recording-jobs.ts` 5× during
outage. Combined: 218 PENDING claimed, 67 actual Claude grades, 151 skips,
0 errors, ~55 min runtime. PENDING dropped 199 → 54.

**Commits (all on main):**
- `15fe184`, `2cf2509`, `5203539` (Prompt 4 / Blocker #2)
- `1c8befe` (heartbeat), `2cde3e9` (failed re-reg), `429c4a5` (services), `a77911c` (3 fixes)

**Side-findings logged:** assign_contact_to_user fuzzy matching (left alone),
deal-intel markdown-fence regression (bug #20), sentiment string coercion (bug #21),
body-size gap on assistant/execute (bug #24, P2).

## Session 39-40 — API field inventory + schema wave 1 + inventory redesign (2026-04-22 to 2026-04-23)

**Summary:** Two-session push on data enrichment and UI polish. Created comprehensive
API field inventory document (PropertyRadar, RealEstateAPI, RentCast, BatchData comparison).
Shipped Wave 1 schema expansion (80+ new columns across sellers, buyers, property details,
call metadata), redesigned inventory UI with property-story generator, and deployed nightly
aggregate computation cron for seller portfolio and buyer funnel tracking.

**Session 39 deliverables:**
1. **API_FIELD_INVENTORY.md** (created) — 2,400+ word field-by-field comparison across
   4 real estate data vendors. Four parts:
   - Part 1: Field universe by vendor (PropertyRadar 65+ fields, RealEstateAPI 100+,
     RentCast 20+ per endpoint, BatchData 150+ all-attributes)
   - Part 2: Unified field catalog master matrix (150+ rows, vendor availability)
   - Part 3: Tier-prioritized recommendations for Gunner Property schema expansion
     (Tier 1: 24 critical fields; Tier 2: 24 soon; Tier 3: 24 to skip)
   - Part 4: Vendor overlap and redundancy analysis + cost-benefit. Recommendation:
     BatchData ($0.30/property for all attributes) as primary + PropertyRadar
     subscription as secondary source.

**Session 40 deliverables:**
1. **Schema Wave 1** (commit `eebf78d` — `dba75b6`) — 80+ new columns added to Property,
   PropertySeller, PropertyBuyer, and Call tables. Covers condition grades, location
   scores, market grades, intangible factors (character, prestige), and per-call
   promoted-field extraction. **Status: deployed to production.**

2. **Inventory UI redesign** (commits `8a244fc` — `07c55ea`):
   - Property-story generator (`425c0cf`) — auto-generates narrative summary of property,
     reusable across deal contexts. Triggers on property create/enrich.
   - Cash-hero matrix card + 3-col Numbers panel with tabbed view
   - Est. Spread matrix visualization + risk-factor computation
   - Persistent cross-tab side panel for property details
   - Activity tab layout refactor matching overview UI patterns

3. **Nightly aggregates cron** (commit `e6f2b3a` — `ff24ea4`):
   - `scripts/compute-aggregates.ts` runs at 4am UTC
   - Seller aggregates: portfolio rollup, voice analytics
   - Buyer aggregates: funnel metrics from PropertyBuyerStage
   - Idempotent per-row error isolation + audit logging

**Build fixes alongside (commits `af5d836` — `6c68e12`):**
- Moved @types/* + eslint to dependencies (Next.js build-time need)
- Set NPM_CONFIG_PRODUCTION=false for esbuild during Railway build
- Excluded scripts/visual-audit.ts from tsc (kept in devDeps for local testing)

**Implicit (not in original PROGRESS entry but part of this window per git log):**
- Self-driving grading worker via `instrumentation.ts` (commit `6cb5c0a`) +
  `lib/grading-worker.ts` + `lib/grading-processor.ts`. Replaces (in primary role)
  the Session-38 `[[services]] grading-worker`. The `[[services]]` block was NOT
  removed — see Blocker #3.
- AI model migration churn: `c58b695` upgraded grading + deal intel + next-steps
  to Opus 4.7 with extended thinking + 32k tokens + 50 prior calls of context;
  `598f852` reverted model strings only to Opus 4.6 (kept the prompt expansion).
- Cron HTTP wrappers: `app/api/cron/poll-calls/route.ts` and
  `app/api/cron/process-recording-jobs/route.ts` for external-trigger / debug surface.
