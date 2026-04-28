# PROGRESS.md — Gunner AI Build Tracker

> First file Claude Code reads every session.
> "Next Session" tells Claude exactly where to start.
> Older sessions archived in docs/SESSION_ARCHIVE.md.

---

## Current Status

**Current session**: 44 — Docs reorganization sprint (2026-04-27)
**Phase**: Docs reorg sprint COMPLETE. Multi-vendor enrichment live, in-process grading worker live, bug-report system live.
**App state**: Live on Railway
**GitHub**: https://github.com/c7lavinder/Gunner-Claude
**Railway**: https://gunner-claude-production.up.railway.app
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: hmD7eWGQJE7EVFpJxj4q)
**Grading worker**: in-process via `instrumentation.ts` → `lib/grading-worker.ts` → `lib/grading-processor.ts` (60s tick). Legacy `[[services]] grading-worker` still in `railway.toml` pending Blocker #3 cleanup.
**Pipeline verifier**: `scripts/verify-calls-pipeline.ts` — bidirectional A/B with sanity gate + canary
**Active blockers**: #2 (Action execution discipline — production verification pending), #3 (dual grading worker — see `docs/AUDIT_PLAN.md`)
**Orientation docs**: `docs/SYSTEM_MAP.md` (slow-changing) + `docs/OPERATIONS.md` (fast-changing) replaced ARCHITECTURE / MODULES / TECH_STACK / AI-ARCHITECTURE-PLAN / GUNNER_DAYHUB_CALLS_PROMPT / START_HERE — those now in `docs/archive/`. CLAUDE.md Rule 8 (Living Map Discipline) requires updating SYSTEM_MAP or OPERATIONS in the same commit as any module / page / cron / AI tool / API surface / readable schema field change.

---

## What's Built

| Feature | Status |
|---|---|
| Call grading (7-layer playbook context, Opus 4.6 + extended thinking) | Live |
| Role Assistant (74 tools, propose→edit→confirm flow) | Live |
| AI Coach (playbook-aware) | Live |
| Day Hub (tasks, appointments, inbox, KPIs, in-app GHL action modals) | Live |
| Inventory (200+ fields, deal intel, research tab, vendor intel surfacing) | Live |
| Multi-vendor property enrichment (PropertyRadar primary + BatchData fills + CourtListener + RentCast + RealEstateAPI + Google + Supabase storage) | Live (Sessions 41-42) |
| Property Story generator (auto narrative summary, regen on grading + cron) | Live (Session 39-40) |
| Call detail (coaching, transcript, next steps, property tabs, manual upload) | Live |
| KPI dashboard (score trends, milestones, TCP ranking) | Live |
| Knowledge system (upload, playbook loader, pgvector search) | Live |
| User profiles (auto-generated weekly, editable) | Live |
| Calibration calls (flag good/bad examples, in-context corrections feed) | Live |
| AI logging — tabbed UI (Team Chats / AI Work / Problems) | Live (Session 42) |
| Lead Quality section (A-F grade, ad campaign attribution) | Live |
| Deal intel extraction (100+ fields, 9 categories) | Live |
| Gamification (XP, badges, leaderboard) | Live |
| Workflow engine (triggers, conditions, delayed steps) | Live |
| Bug-report system (persistent floating button + screenshot + admin review page) | Live (Sessions 42-43) |
| Sellers detail page (`/{tenant}/sellers/[id]`) | Live (Sessions 41-42) |
| Nightly aggregates cron (seller portfolio + voice analytics + buyer funnel) | Live (Session 39-40) |
| Disposition hub (buyers, deal blasts, approval gates) | Built, hidden from nav |
| Lead Source ROI | Built, hidden from nav |
| Training hub | Built, hidden from nav |
| Stripe billing | Built, needs env vars to activate |
| Onboarding flow | Built |
| Password reset | Built |
| Tasks page (`/{tenant}/tasks/`) | Legacy — Day Hub is canonical (P4 deletion candidate) |

---

## Session Log (recent — older sessions in docs/SESSION_ARCHIVE.md)

### Session 44 — Docs reorganization sprint (2026-04-27)

The sprint that was the session. 8 commits, `ea02beb..f1284f3`, replacing
the rotted ARCHITECTURE / MODULES / TECH_STACK / AI-ARCHITECTURE-PLAN /
GUNNER_DAYHUB_CALLS_PROMPT / START_HERE orientation surface with two
living docs (`docs/SYSTEM_MAP.md` slow-changing + `docs/OPERATIONS.md`
fast-changing) plus the Rule 8 discipline that keeps them honest.

**Reconnaissance findings caught during the sprint** (the part that
exceeded the cleanup value):

- 70-commit drift between local PROGRESS (Session 38) and remote (Session 43)
  — sprint started with a rebase to absorb Sessions 39-43.
- **Dual grading worker contradiction** — `instrumentation.ts` in-process
  AND legacy `[[services]] grading-worker` both running. Atomic claim
  prevents double-grading. Logged as **Blocker #3** in AUDIT_PLAN.
- AGENTS.md "Background Worker Conventions" stale post-Session-42 in-process
  move. Rewritten in Commit #1.
- AI model state hybrid — Opus 4.7-era prompt config (32k tokens, extended
  thinking, 50 prior calls) intentionally retained even though model strings
  reverted to Opus 4.6 in `598f852`. Logged as **PENDING D-0XX** in AUDIT_PLAN.
- `assign_contact_to_user` bypasses propose-edit-confirm UI flow that gates
  the other 12 action types. Logged as **P5** in AUDIT_PLAN.
- `claude-sonnet-4-20250514` date-pinned snapshot in `lib/ai/enrich-property.ts`
  drifted from the `claude-sonnet-4-6` baseline. Logged as **P3** in AUDIT_PLAN.
- `/{tenant}/tasks/` legacy page kept around because Chris bookmarked it.
  Logged as **P4** in AUDIT_PLAN.
- 6 of 7 crons missing `cron.<name>.started/finished` heartbeat audit row
  pattern (only `process_recording_jobs` has it). Captured in OPERATIONS
  heartbeat coverage table; tracked as Bug #23.
- `poll-calls` "heartbeat" claim was a per-tenant timestamp lock (Session 35
  pgbouncer fix), not an audit-row heartbeat — doc-review catch in OPERATIONS §1.
- 3 stale doc references (CLAUDE.md Rule 8 body, AGENTS.md x2, lib/ai/scoring.ts:30)
  preemptively repointed in Commit #4 so Commit #5 archive could be a clean
  `git mv` with a zero-hit gate grep.
- Local env was stale post-rebase — false tsc errors until `npx prisma generate
  && npm install`. Codified as a hygiene ritual in OPERATIONS.

**Commits (chronological):**

- `077ef41` **#0** — CLAUDE.md Rule 8 (Living Map Discipline) + 6th end-of-session checklist item.
- `6f37ce8` **#1** — AGENTS Background Worker Conventions rewrite (instrumentation.ts as primary) + PROGRESS catch-up to Session 43 + AUDIT_PLAN Blocker #3 + grading.ts:204 stale Opus 4.7 comment fix. 5 files.
- `94f526b` **#2** — `docs/SYSTEM_MAP.md` (506 lines, slow-changing canonical) + AUDIT_PLAN P5.
- `dc53112` **#3** — `docs/OPERATIONS.md` (421 lines, fast-changing operational state — crons, pages, API surface 109/19/75/15, scripts, blockers, schema log, worker observability with admin tenant-spanning queries, hygiene rituals, incident notes).
- `39c528e` **#4** — README rewrite (164 → 29 lines, agent-focused) + CLAUDE/AGENTS pointer updates + lib/ai/scoring.ts comment update.
- `089ed61` **#5** — `git mv` 6 superseded docs into `docs/archive/`. Pre-archive gate grep returned zero hits.
- `a46bd46` **#6** — delete orphan `functions/poll-calls.js`.
- `f1284f3` **#7** — `git mv API_FIELD_INVENTORY.md docs/` + strip stale "(after sprint Commit #7)" pointers.
- (this commit) **#8** — sprint wrap-up: PROGRESS header → COMPLETE, Session 44 entry, Next Session rewrite, OPERATIONS baseline anchor bump.

**Conventions added by the sprint** (worth highlighting because future sessions
should follow them):

- Pre-flight `git log --oneline <baseline>..HEAD` before each push — surfaced
  the 70-commit drift on Commit #0 push attempt; would have caught silent
  drift any time after.
- Pre-archive gate grep — strict zero-hit requirement for active surfaces
  before `git mv`-ing a doc.
- Doc-only commits paste back diff before pushing; code-touching commits
  must pass `npx tsc --noEmit` (enforced by pre-push hook).
- Trailer dropped: `Co-Authored-By: Claude Opus 4.7 (1M context)` → no trailer,
  starting Commit #2.

### Session 43 — Bug-report v2 + grading empty-shell fix (2026-04-26)

Bullet-level reconstruction from git log. No detailed session notes existed — this is the catch-up.

- `4840c52` fix(grading): stop creating empty-shell FAILED + PENDING calls — addresses
  the structural bug behind PROGRESS bug #22 at the create site, not just the cleanup
  pass. New shells should not enter the database.
- `8e13fb3` feat(bugs): attach screenshot to bug-report button — adds base64 image data
  URL field to BugReport (migration `20260427000000_add_bug_screenshot`). Cap is
  ~7.5MB at the API boundary (`MAX_SCREENSHOT_BYTES` in `app/api/bugs/route.ts`).

### Session 42 — Enrichment refinement + AI logs UI + bug-report v1 (2026-04-24)

Bullet-level reconstruction from git log.

- `0f6bd2b` refactor(enrichment): PropertyRadar is primary data source, BatchData
  fills gaps on every lead. Replaces the Session-41 single-vendor-first approach with
  a dual-source merge.
- `8fbdd5f` fix(enrichment): per-vendor isolation + reliable orchestrator invocation.
  Vendor failures no longer take down the whole orchestrator.
- `f452e7f` feat(ai-logs): tabbed UI (Team Chats / AI Work / Problems) with plain-English
  labels at `/{tenant}/ai-logs`. Admin-facing.
- `5c90e24` feat(bugs): persistent bug-report button (`components/ui/floating-bug-button.tsx`)
  + admin review page (`app/(tenant)/[tenant]/bugs/`). Schema migration
  `20260424000000_add_bug_reports`.

### Session 41 — Multi-vendor enrichment pipeline (2026-04-23)

Bullet-level reconstruction from git log. The big build day for the enrichment overhaul.
Net result: ~doubled property field coverage; -92% projected BatchData spend.

- `f2b7628` feat(enrichment): multi-vendor property + seller pipeline (initial
  orchestrator across PropertyRadar, BatchData, RentCast, RealEstateAPI, CourtListener,
  Google, Supabase storage in `lib/enrichment/`).
- `32771fd` fix(courtlistener): scope by state + exact-name filter.
- `f3855c0` feat(ui): surface distress/MLS/court data across inventory + seller UIs.
- `dde3176` fix(enrichment): `buildDenormUpdate` now writes beds/baths/sqft + tax basics
  (was missing from initial build).
- `933d28b` feat(enrichment): PropertyRadar detail + `/persons` fetch (~10 fields/property).
- `2c88541` feat(enrichment): capture all vendor fields — nearly doubles property coverage.
- `53b83c4` feat(inventory): comprehensive vendor intel in property detail UI.
- `3b9ba70` fix(enrichment): manual create + re-enrich routes now fire vendor orchestrator
  (previously skipped the orchestrator path).
- `29b2d15` fix(courtlistener): upgrade V3 → V4 + leads-today audit scripts
  (`scripts/check-todays-leads.ts`, `check-today-leads.ts`).
- `fada00b` feat(enrichment): gate BatchData behind PropertyRadar motivation signals
  (projected -92% BatchData spend).

### Session 39-40 — API field inventory + schema wave 1 + inventory redesign (2026-04-22 to 2026-04-23)

> Detailed entry archived in `docs/SESSION_ARCHIVE.md`. Summary kept here for cross-reference:

- `API_FIELD_INVENTORY.md` authored — vendor-by-vendor field comparison
  (PropertyRadar, RealEstateAPI, RentCast, BatchData) informing Wave 1 schema design.
- Schema Wave 1 — 80+ columns across Property, PropertySeller, PropertyBuyer, Call.
- Inventory UI redesign — Property Story generator, cash-hero matrix, persistent
  cross-tab side panel.
- Nightly aggregates cron (`compute-aggregates`) — seller portfolio + voice analytics
  + buyer funnel.
- Self-driving grading worker via `instrumentation.ts` (commit `6cb5c0a`) +
  `lib/grading-worker.ts` + `lib/grading-processor.ts` — primary grading loop
  moved in-process. Legacy `[[services]] grading-worker` not removed (Blocker #3).
- AI model churn (Opus 4.7 → Opus 4.6 with 4.7-era prompt config) — see PENDING
  D-0XX in `docs/AUDIT_PLAN.md`.

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

**Status as of 2026-04-27 (post-sprint):** Docs reorg complete (Session 44 above,
8 commits `ea02beb..f1284f3`). Production code state unchanged from Session 43
(`8e13fb3`) — the sprint was doc-only except for the 3-line stale comment fix
in `lib/ai/grading.ts:204` and the comment fix in `lib/ai/scoring.ts:30`.
Pre-push tsc gate stayed clean throughout.

**P1 — Blocker #2 production verification (deferred 5 sessions):**
The AI Assistant propose→edit→confirm flow was coded in Session 38 (commits
`15fe184` — `5203539`) but never validated end-to-end on live Railway with
real GHL data. Three validation paths in order of safety:
1. **Cancel-path only** for high-stakes types (send_sms, send_email,
   change_pipeline_stage, create_contact, update_contact, create_opportunity) —
   proves UI + preview + merge + modal without GHL writes.
2. **GUNNER TEST contact** in GHL for a single end-to-end SMS proof.
3. **Real contact** for medium/low-stakes types (add_note, create_task,
   update_task, complete_task, opp status/value) — no outbound seller visibility.

Start with path 1 on the live URL. If that works, escalate to path 2.

**P2 — Blocker #3: dual grading worker.** See `docs/AUDIT_PLAN.md`. Plan:
remove `[[services]] grading-worker` block from `railway.toml`, delete
`scripts/grading-worker.ts`, watch heartbeat audit rows for 24h to confirm
in-process loop alone handles full load. Code change with production risk —
do this as its own session, not bundled.

**P3 — Worker health verification (still owed from Session 38):**
```sql
SELECT action, COUNT(*)::int AS count, MAX(created_at) AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS seconds_since
FROM audit_logs
WHERE action LIKE 'cron.process_recording_jobs.%'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action;
```
Expected: one `started` + one `finished` per minute. If `last_seen` > 120s,
the in-process worker is down — escalate per Session 38 + Blocker #3 notes.

**P4 — Known bugs (in severity order):**
1. Bug #20 — deal-intel parser doesn't strip markdown fences. Extract
   `stripJsonFences()` into `lib/ai/stripJsonFences.ts`, use in
   `lib/ai/extract-deal-intel.ts`.
2. Bug #21 — sentiment/sellerMotivation type coercion incomplete. Normalize
   in `parseGradingResponse()` before `db.call.update`.
3. Bug #17 — `no_answer` never rewritten to `short_call` in cron processor.
4. Bug #23 — add heartbeat audit rows to the other crons (poll-calls,
   daily-audit, daily-kpi-snapshot, weekly-profiles, regenerate-stories,
   compute-aggregates).
5. Bug #18 — one-time backfill: `UPDATE calls SET source='recovery' WHERE source IS NULL`.
6. Bug #22 — one-time cleanup: 24 empty-shell FAILED rows. Note: Session 43
   commit `4840c52` closes the create-site root cause; the 24 existing rows
   still need the `UPDATE … SET gradingStatus='SKIPPED'` cleanup.

**P5 — Technical debt:**
1. Migrate ~64 remaining API routes to `withTenant` helper.
2. Sweep remaining silent catches in broader codebase (79 total).
3. Align Day Hub vs Calls page call count source-of-truth.
4. Fix LM tab "227" dial count aggregation across LM role.
5. P3 from AUDIT_PLAN — standardize `lib/ai/enrich-property.ts` model string.
6. P4 from AUDIT_PLAN — delete legacy `/{tenant}/tasks/` page (coordinate with Chris).

**Railway + Logging:** Railway API token noted invalid in Session 38 — request
a fresh one if Blocker #3 verification (P2) needs Railway dashboard access.
