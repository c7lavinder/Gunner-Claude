# PROGRESS.md — Gunner AI Build Tracker

> First file Claude Code reads every session.
> "Next Session" tells Claude exactly where to start.
> Older sessions archived in docs/SESSION_ARCHIVE.md.

---

## Current Status

**Current session**: 38 — Blocker #2 cleared + grading pipeline rebuilt as a service
**Phase**: Both P0 blockers clear. Chris/Daniel onboarding unblocked. Grading pipeline migrated off broken Railway cron onto a long-running service.
**App state**: Live on Railway
**GitHub**: https://github.com/c7lavinder/Gunner-Claude
**Railway**: https://gunner-claude-production.up.railway.app
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: hmD7eWGQJE7EVFpJxj4q)
**AI Tools**: 74 assistant tools, 11 AI logging touchpoints, pgvector semantic search
**Knowledge**: 42 playbook docs loaded + embedded, 3 user profiles
**Grading worker**: `scripts/grading-worker.ts` runs `processJobs()` every 60s as a Railway [[services]] entry — the old [[cron]] for process-recording-jobs stopped firing on 2026-04-20 and was removed
**Pipeline verifier**: scripts/verify-calls-pipeline.ts — bidirectional A/B with sanity gate + canary

---

## What's Built

| Feature | Status |
|---|---|
| Call grading (7-layer playbook context) | Live |
| Role Assistant (74 tools) | Live |
| AI Coach (playbook-aware) | Live |
| Day Hub (tasks, appointments, inbox, KPIs) | Live |
| Inventory (200+ fields, deal intel, research tab) | Live |
| Call detail (coaching, transcript, next steps, property tabs) | Live |
| KPI dashboard (score trends, milestones, TCP ranking) | Live |
| Knowledge system (upload, playbook loader, pgvector search) | Live |
| User profiles (auto-generated weekly, editable) | Live |
| Calibration calls (flag good/bad examples) | Live |
| AI logging (all 11 touchpoints, admin page) | Live |
| Lead Quality section (A-F grade, ad campaign attribution) | Live |
| Deal intel extraction (100+ fields, 9 categories) | Live |
| Gamification (XP, badges, leaderboard) | Live |
| Workflow engine (triggers, conditions, delayed steps) | Live |
| Disposition hub (buyers, deal blasts, approval gates) | Built, hidden from nav |
| Lead Source ROI | Built, hidden from nav |
| Training hub | Built, hidden from nav |
| Stripe billing | Built, needs env vars to activate |
| Onboarding flow | Built |
| Password reset | Built |

---

## Session Log (recent — older sessions in docs/SESSION_ARCHIVE.md)

### Session 38 — Blocker #2 cleared + grading pipeline rebuilt as a service (2026-04-20)

**The heavy day.** Two major threads back-to-back: AI Assistant propose→edit→confirm
wiring (Prompt 4 / Blocker #2) and a live-fire grading-pipeline rescue when the
Railway cron silently stopped firing mid-session.

**Prompt 4 — Blocker #2 cleared.** Closed ACTION_EXECUTION_AUDIT.md rows 1-7 (the
dead Edit button in coach-sidebar.tsx) by mirroring call-detail's propose → edit →
confirm pattern across the AI Assistant surface. Three commits, each paste-then-wait:
- `15fe184` (Phase A) — refactor(ghl): extracted resolveAssignee helper to
  `lib/ghl/resolveAssignee.ts`. Single source of truth for internal userId → ghlUserId
  resolution across actions/route.ts and the incoming execute/route.ts.
- `2cf2509` (Phase B) — feat(assistant): widened execute/route.ts schema with optional
  `editedInput`, merged over `toolCall.input` server-side. Dual-row failure audit
  (`assistant.action.failed` ERROR + logFailure SYSTEM) matching Batch 2 pattern from
  the call-detail route. Fuzzy matching REMOVED from change_pipeline_stage +
  create_opportunity (Rule 2: stageId/pipelineId must be explicit GHL ids, 400 on miss).
  originalInput + editedInput both persisted in audit payload for AI-learning loop.
- `5203539` (Phase C) — fix(assistant): wired the Edit button (was `<button>` with no
  onClick). Full rewrite of coach-sidebar.tsx: state additions for editingToolCallId /
  editedInputs / confirmModalToolCallId / isPushing; per-action-type edit panel
  (12 types); high-stakes confirmation modal gating for send_sms, send_email,
  change_pipeline_stage, create_contact, update_contact, create_opportunity.
  pipelines + team-members fetched once on sidebar open.

Pushed Prompt 4 (`b7f7b37..5203539`) at 07:58 UTC. Phase D (production verification
matrix) deferred to user since the 6 high-stakes types cannot be verified without real
contacts or a GHL test contact. Option 1 (Cancel-path), Option 2 (GUNNER TEST contact),
and Option 3 (real-contact for low-stakes) documented in-session.

**Grading pipeline went silent mid-session.** At 04:43 UTC today the `process-recording-jobs`
cron stopped firing, zero audit trail. Webhook path still working (PENDING queue grew
to 199 by afternoon), recording fetch still working (116 of 199 had recording_url), but
nothing was draining the queue. Commits after 04:43 were coincidental — Prompt 4 pushes
landed HOURS after the outage started and didn't touch any pipeline file. Confirmed by
diff+timestamp archaeology.

Investigation sequence (read-only at every step until root cause was confirmed):
1. Query-driven diagnostic (all 5 parts the user requested) via one-shot tsx script
   at `/tmp/diagnose-pipeline.ts`. Confirmed: 0 PROCESSING rows (rules out stuck atomic
   claim), 13 stale PENDING `recording_fetch_jobs` all `wf_*` automation artifacts from
   April 9-13 (rules out lock issue on the pgbouncer timestamp-lock in poll-calls.ts),
   0 successful `call.graded` audit rows since 04:43 UTC (worker not running).
2. Hypothesis H1 (stuck tenant-timestamp lock) — **RULED OUT** by reading scripts/
   process-recording-jobs.ts in full. No lock exists — per-row atomic claim via
   `updateMany({ gradingStatus: PENDING, … } → PROCESSING)`. poll-calls.ts:448 has the
   self-expiring 45s timestamp lock mentioned in Session 35 notes, but it's scoped to
   poll-calls only — process-recording-jobs is lockless and was therefore never "stuck."
3. Hypothesis H2 (data-shape errors cascading) — 7 grading errors at 04:14-04:28 UTC
   (sentiment coerced as string; deal-intel markdown fence regression) are real but
   not the root cause — the 164 successful grades before 04:43 proved the pipeline
   was functional right up to the outage.
4. Hypothesis H3 (Railway-side) — confirmed by process of elimination. Added a
   heartbeat audit row (`1c8befe`, `feat(cron): add heartbeat audit rows to
   process-recording-jobs`) so next outage is visible in audit_logs within 60 seconds.
5. Whitespace-forced re-registration attempt (`2cde3e9`) — did not fix. Railway had
   lost the cron from its internal registry and a no-op deploy could not revive it.
6. Converted process-recording-jobs from Railway `[[cron]]` to a long-running
   Railway `[[services]]` worker (`429c4a5`):
     - NEW `scripts/grading-worker.ts` — imports processJobs() and calls it in an
       infinite `while(true)` loop with 60s sleep between iterations. Per-iteration
       errors are caught + logged + loop continues (self-heal). Does not call
       process.exit().
     - `scripts/process-recording-jobs.ts` refactor:
         - `async function processJobs()` → `export async function processJobs()`
         - `process.exit(1)` in outer catch → `throw err` (caller decides)
         - Removed `process.exit(0)` at end of function
         - Top-level `processJobs()` wrapped in `import.meta.url === fileURLToPath(...)`
           entry-point guard so CLI invocation still works exactly as before AND the
           file is side-effect-free when imported by grading-worker.
     - `railway.toml` — removed `[[cron]] process-recording-jobs`, added `[[services]]
       grading-worker`. poll-calls cron + daily-audit + daily-kpi-snapshot + weekly-profiles
       unchanged.

**Three surgical post-service fixes (`a77911c`)** after the service was live:
- **Fix 1 — null duration bypass.** The skip-check tree had two guards
  (`duration !== null && > 0 && < 45` → SKIPPED; `duration === 0` → SKIPPED) but NULL
  slipped through both and went into grading. Transcription failed on no-answer calls
  and they ended up FAILED. Changed zero check to `duration === null || duration === 0`.
  This is the root cause of the 24 empty-shell FAILED rows seen earlier today (and
  the source of PROGRESS.md bug entries #24).
- **Fix 2 — PROCESSING rescue.** At the top of processJobs(), before the heartbeat,
  reset any row stuck PROCESSING > 5 min back to PENDING. Self-heals after a Railway
  redeploy or a mid-grade OOM. 0 stuck rows currently, but the guardrail is in place.
- **Fix 3 — FAILED auto-retry.** After PROCESSING rescue, reset any FAILED row that
  HAS a recording and hasn't been touched in > 1 hour. Targets transient failures
  (Anthropic credit outage, Deepgram blip). Calls without recordings stay FAILED.
- **Schema requirement for Fix 2 + 3.** The Call model had no `updatedAt` column.
  Added `updatedAt DateTime @updatedAt @map("updated_at")` + migration
  `20260420230000_add_updated_at_to_call/migration.sql` that backfills existing rows
  to their `created_at`. Three-step safe pattern (add nullable → backfill → set NOT NULL)
  that runs in <1s on the current ~5k row calls table via Railway's
  `db:migrate:prod && npm run build` buildCommand chain.

**Manual drains while debugging.** Ran `process-recording-jobs.ts` from local env via
`npx tsx` five times during the outage to keep the backlog from growing. Combined
results: 218 PENDING claimed, 67 actual Claude grades, 151 post-transcription-skips
(short calls, silent recordings), 0 errors, ~55 min total runtime, ~67 Claude grades +
~218 Deepgram transcriptions of token/API cost. After drain #5, PENDING dropped from
199 → 54 (the 54 being fresh arrivals during the drain itself).

**Commits (all on main):**
- `15fe184` refactor(ghl): extract resolveAssignee helper for reuse
- `2cf2509` feat(assistant): accept edited input + audit success/failure for all 7 action types
- `5203539` fix(assistant): wire Edit button + confirm modal for all 7 action types
- `1c8befe` feat(cron): add heartbeat audit rows to process-recording-jobs
- `2cde3e9` fix(railway): force cron re-registration — process-recording-jobs missing from Railway dashboard
- `429c4a5` feat(grading-worker): convert process-recording-jobs cron to long-running service
- `a77911c` fix(grading-worker): handle null duration + rescue stuck PROCESSING and FAILED rows

**Parallel side-findings logged for future cleanup:**
- `assign_contact_to_user` branch in execute/route.ts still uses name-contains fuzzy
  matching. Left alone this session per explicit user instruction — separate call
  pattern, different prompt.
- Deal intel parser has a markdown-fence regression (`` ```json `` not stripped). The
  Session 34 `stripJsonFences()` fix covers grading but not deal intel. Calls still
  grade cleanly; deal intel just returns 0 proposed changes.
- Sentiment/sellerMotivation type coercion incomplete — Claude sometimes returns
  strings ("positive") where Floats are expected. Session 37's `79e916e` was supposed
  to fix this but errors recurred this morning (4 instances at 04:14-04:28 UTC).
- Body-size gap on `/api/ai/assistant/execute` (editedInput is `z.record(z.unknown())`,
  no per-action zod, no `content-length` check, no Railway-layer cap). Logged as P2
  in AUDIT_PLAN.md. Follow-up work, not Prompt 4 scope.

### Session 37 — Pipeline verifier built end-to-end + Blocker #1 cleared (2026-04-20)

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
- Bucket-spec mismatch: webhook handler sets `callResult='no_answer'` at
  ingestion when GHL ships an explicit fail status, but the cron only writes
  `short_call` after a successful Deepgram pass. Calls with explicit fail-status
  + duration <45s stay `no_answer` forever, never get rewritten when SKIPPED.
  Either accept both in the spec or have the cron flip on SKIPPED routing.
- 2487 `calls.source IS NULL` rows, oldest 2026-03-21, newest 2026-04-18.
  Profile fits a bounded backfill operation (Session 36's `recover-stuck-calls.ts`
  most likely). Last 24h is zero — leak appears stopped. One-time backfill
  recommended, plus grep `db.call.create` callsites to ensure `source` is set.

Also shipped earlier today: `79e916e` (grading: coerce sentiment to float +
bump max_tokens to 8000) — fixes the `Argument 'sentiment': Invalid value`
errors visible in audit_logs from 2026-04-19 evening. Surfaced incidentally
during the verifier's audit_log shape probe.

**Stop hook modified (Session 37, 2026-04-20):** removed auto-commit + auto-push
step. Previously auto-pushed to main after every turn that typechecked — violated
CLAUDE.md Rule 7 (surgical one-prompt-at-a-time with diff review before push).
Stop hook now only runs tsc. Pre-push git hook added as belt-and-suspenders tsc
gate at push time.

### Session 36 — Backlog recovery for stuck calls (2026-04-19)

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

### Session 35 — Live debugging day: call pipeline + audit page (2026-04-09)

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

### Session 34c — Audit page (2026-04-08)

Built /{tenant}/audit — 6-tab system event monitor (owner/admin only):
- Tabs: Dials (calls table), Leads (properties table), Appointments, Messages,
  Tasks, Stage Changes (all from webhook_logs with rawPayload parsing)
- API: app/api/[tenant]/audit/route.ts — withTenant, date picker, per-tab queries
- Status bar: webhook health dot (green/yellow/red), events today count, failed count
- Failed rows: red background + hover tooltip with errorReason
- Nav: Shield icon added to top-nav between AI Logs and Settings (admin+ only)
- Files: route.ts (new), page.tsx (new), audit-client.tsx (new), top-nav.tsx (modified)

### Session 34b — WebhookLog outcome tracking (2026-04-08)

Extended WebhookLog with outcome tracking:
- Added 3 fields: status (received|processing|success|failed), processedAt, errorReason
- Added 3 indexes: [tenantId,eventType], [tenantId,status], [tenantId,receivedAt]
- route.ts: WebhookLog now writes status='processing' on arrival, then updates to
  'success' or 'failed' with processedAt + errorReason after handleGHLWebhook resolves
- Response to GHL still returns immediately — outcome update is fully async
- Files changed: prisma/schema.prisma, app/api/webhooks/ghl/route.ts, PROGRESS.md

### Session 34 — Autonomous audit + known bug fixes (2026-04-08)

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

### Session 33 — Bulletproofing run + going-forward habits (2026-04-06 to 2026-04-07)

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

Parked for next session (none blocking team onboarding):
- Refactor recording-jobs script + route to share lib/jobs/process-recording-jobs.ts
- LM tab "227" dial count not aggregating across LM role
- Day Hub vs Calls page count source-of-truth alignment
- Migrate the other ~22 API routes to withTenant (incremental, team work)
- Sweep remaining 79 silent catches in broader codebase (AI pipeline, assistant, client-side)
- Claude grading response parse failures (3 in last 12h — truncated JSON from long transcripts)
- P7 (HIGH): Claude grading response parser doesn't strip ```json``` markdown fences before
  JSON.parse. Caught by Fix #3 audit_logs surfacing — 3 instances in the last 12 hours,
  likely many more historically. Each instance = a call that didn't get graded.
  File: lib/ai/grading.ts. Fix: strip ```json prefix and ``` suffix before parsing.

### Session 30-31 — Bug fixes + AI Intelligence Layer + Role Assistant (2026-04-01 to 2026-04-02)
- 8 bug fixes (calendars, calls, buyers, SMS, property tabs, appointments)
- Call ingestion rewrite (3-layer: webhook + export + per-user search)
- AI Intelligence Layer: 5 new models, playbook loader, context builder, AI log page
- Role Assistant: 17 tools, daily persistence, page context, action cards

### Session 32 — Playbook integration + pgvector + all 74 tools + deep audit (2026-04-02 to 2026-04-03)

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

---

## Known Bugs

| # | Description | Priority | Status |
|---|---|---|---|
| 7 | withTenantContext() RLS not called per-request | MEDIUM | Before multi-tenant production |
| 10 | GHL webhook registration returns 404 | HIGH | Relying on polling fallback |
| 11 | Appointments 401 — scope may need update | HIGH | Investigate GHL scope |
| 12 | GHL API version header may be outdated | MEDIUM | Test newer version |
| 16 | DEV_BYPASS_AUTH references hardcoded slugs | LOW | Clean up before tenant #2 |
| 17 | callResult `no_answer` never rewritten to `short_call` when cron routes <45s call to SKIPPED. Surfaced 4× in Session 37 verifier Pass B. | MEDIUM | Either fix in cron processor or update spec to accept both for short calls |
| 18 | 2487 `calls` rows have `source IS NULL` (oldest 2026-03-21, newest 2026-04-18, **0 in last 24h**). Likely from `scripts/recover-stuck-calls.ts` not setting source. | LOW | One-time `UPDATE` to backfill `source='recovery'`; grep `db.call.create` to add `source` to all script callsites |
| 19 | One legacy row `cmo4o88zn0raqn5nzaboykobe` (ghlCallId `VyCnm5DBNBVFfipIo0FR`) — non-wf_ id GHL doesn't recognize, source/contactId/duration all null. | LOW | Single instance, no production impact. Origin worth understanding (covered by #18 backfill) |
| 20 | Deal intel parser has a markdown-fence regression — `` ```json `` not stripped. Session 34 `stripJsonFences()` fix covers grading only. Calls still grade cleanly; deal intel returns 0 proposed changes. Observed 6× across Session 38 manual drains. | MEDIUM | Extract stripJsonFences into a shared util and use in lib/ai/extract-deal-intel.ts |
| 21 | Sentiment/sellerMotivation type coercion incomplete — Claude occasionally returns strings ("positive", full prose paragraphs) where Prisma expects Float. Prior fix `79e916e` missed some shapes. Surfaced 4× in the 04:14-04:28 UTC window today. | MEDIUM | Normalize in `parseGradingResponse()` before the `db.call.update` — string→null mapping for these fields |
| 22 | 24 empty-shell FAILED rows from 2026-04-20 have `ghlContactId=NULL`, `recording_url=NULL`, `duration=NULL`. Pre-existing structural issue — GHL fires call-like webhooks with no payload content. Fix 1 (Session 38 `a77911c`) prevents NEW ones but does not remediate these 24. | LOW | One-time `UPDATE calls SET gradingStatus='SKIPPED' WHERE gradingStatus='FAILED' AND recording_url IS NULL AND tenantId=(…)` to clean up |
| 23 | Railway `[[cron]] process-recording-jobs` would not self-register even after no-op redeploy. Workaround: converted to `[[services]] grading-worker` long-running worker (Session 38). Unknown if poll-calls, daily-audit, daily-kpi-snapshot, weekly-profiles crons are at risk of the same failure. | MEDIUM | Add per-cron heartbeat audit rows (same pattern as `1c8befe`) so a similar silent outage is immediately visible |
| 24 | Body-size gap on `/api/ai/assistant/execute` — `editedInput` is `z.record(z.unknown()).optional()`, no content-length check. Malicious/malformed client could POST multi-MB payloads that bloat audit_logs. | LOW (P2) | Logged in AUDIT_PLAN.md. Follow-up: tighter per-action zod schemas across all endpoints, not piecemeal |

All other bugs from sessions 1-32 are resolved.

> Note: bug #13, #14, #15 (cross-tenant data leaks) were resolved in Session 33
> via the `withTenant<TParams>()` helper (commit `c63cb03`) and the 3-route refactor
> template (commit `f484820`) — already removed from this table per AGENTS.md.

---

## Next Session — Start Exactly Here

**Task 1 (critical — verify the grading pipeline is actually working post-deploy):**
```sql
SELECT action, COUNT(*)::int AS count, MAX(created_at) AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS seconds_since
FROM audit_logs
WHERE action LIKE 'cron.process_recording_jobs.%'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action;
```

Expected steady state: one `cron.process_recording_jobs.started` + one
`cron.process_recording_jobs.finished` row per minute. If `last_seen` is > 120
seconds old, the grading-worker service didn't start on Railway and you're back to
manual drains. Escalation path in order of least→most invasive:
1. Check Railway dashboard for `grading-worker` service. If missing, the
   `[[services]]` block didn't take — likely requires Railway CLI intervention.
2. If worker is up but only `.started` rows appear (no `.finished`), processJobs()
   is crashing mid-run — read `audit_logs WHERE severity='ERROR'` for root cause.
3. Last-resort fallback: run `npx tsx scripts/process-recording-jobs.ts` from local
   env every ~30 min to keep backlog drained. Session 38 did this 5× successfully.

**Task 2 (verify Fix 2 + Fix 3 from `a77911c` are working):** after any completed
worker iterations, check for rescued rows:
```sql
-- Should be 0 after the first full cycle (PROCESSING rescue)
SELECT COUNT(*) FROM calls
WHERE grading_status='PROCESSING' AND updated_at < NOW() - INTERVAL '5 minutes';

-- Evidence Fix 3 worked: FAILED calls from April 13 Anthropic-credit outage that
-- have recordings should start appearing in COMPLETED over the next hour as the
-- worker retries them one batch at a time.
SELECT grading_status, COUNT(*) FROM calls
WHERE created_at < '2026-04-20'
  AND recording_url IS NOT NULL
GROUP BY grading_status;
```

**Task 3 (Blocker #2 production verification — deferred from Session 38):** the user
still needs to validate the AI Assistant propose→edit→confirm flow end-to-end on the
live Railway URL. Three paths documented at end of Session 38:
- **Cancel-path only** for the 6 high-stakes types (send_sms, send_email,
  change_pipeline_stage, create_contact, update_contact, create_opportunity) —
  proves UI + preview + merge + modal without GHL writes
- **GUNNER TEST contact** in GHL for a single end-to-end SMS proof
- **Real contact** for the 6 medium/low-stakes types (add_note, create_task,
  update_task, complete_task, opp status/value) — no outbound seller visibility

Parked items (lower priority):
1. Bug #17 — fix `no_answer → short_call` rewrite in cron processor
2. Bug #18 — one-time backfill: `UPDATE calls SET source='recovery' WHERE source IS NULL`
3. Bug #20 — extract stripJsonFences into shared util (lib/ai/stripJsonFences.ts),
   use in extract-deal-intel.ts (Session 38 saw this parser failing 6×)
4. Bug #21 — normalize sentiment/sellerMotivation in parseGradingResponse
5. Bug #22 — one-time clean up of the 24 empty-shell FAILED rows
6. Bug #23 — add heartbeat audit rows to the other 4 crons (poll-calls,
   daily-audit, daily-kpi-snapshot, weekly-profiles) so a similar silent outage
   is immediately visible
7. LM tab "227" dial count not aggregating across LM role
8. Day Hub vs Calls page count source-of-truth alignment
9. Migrate ~64 remaining API routes to withTenant
10. Sweep remaining silent catches in broader codebase

**Railway access:** Still need a fresh Railway API token from Corey to see server
logs. Current token is invalid. Largest diagnostic gap remaining — specifically
critical now since the grading-worker service status can only be definitively
verified via the dashboard or logs.
