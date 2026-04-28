# OPERATIONS.md — Gunner AI

> The fast-changing operational state of the system.
> Crons, page roster, API migration counts, hygiene scripts, blockers, schema-change log, worker observability.
> Slow-changing items (philosophy, stack, modules, AI layer architecture, call pipeline shape, safety gate pattern) live in `docs/SYSTEM_MAP.md`.
> Updated 2026-04-27 — Session 43 state.

> **Maintenance rule (CLAUDE.md Rule 8):** Any session that changes a cron, route, page, schema field, or operational script must update this file in the same commit. Default to OPERATIONS over SYSTEM_MAP when in doubt.

---

## Crons + long-running services

Live in `railway.toml`. Healthcheck at `https://gunner-claude-production.up.railway.app/api/health`.

### Long-running services

| Service | Start command | Notes |
|---|---|---|
| `gunner-ai-web` | `npm start` (Next.js production server) | Hosts the web app. **Boots in-process grading worker via `instrumentation.ts`** — see SYSTEM_MAP "Workers" section. Sole driver of grading as of Wave 1 (2026-04-27). |

### Crons

| Name | Schedule | Command | Purpose |
|---|---|---|---|
| `poll-calls` | `* * * * *` (every 1 min) | `npx tsx scripts/poll-calls.ts` | GHL call ingestion safety net. Per-user `/conversations/search`. Has self-expiring 45s timestamp lock on `tenant.lastCallExportCursor.updatedAt` (Session 35 — replaced leaky pg_advisory_lock); no `cron.<name>.started/finished` audit row heartbeat — Bug #23. |
| `daily-audit` | `0 2 * * *` (2am UTC) | `npx tsx scripts/audit.ts` | Self-audit agent — code review of recent changes. |
| `daily-kpi-snapshot` | `0 0 * * *` (midnight UTC) | `npx tsx scripts/kpi-snapshot.ts` | Snapshot per-rep KPIs to `kpi_snapshots` table for trend charts. |
| `weekly-profiles` | `0 3 * * 0` (Sun 3am UTC) | `npx tsx scripts/generate-profiles.ts` | Auto-generate per-rep coaching profiles from last week's calls. |
| `regenerate-stories` | `0 7 * * *` (daily 7am UTC) | `npx tsx scripts/regenerate-stories.ts` | Regen Property Stories for properties touched by edits / milestone changes / buyer activity / blasts that didn't go through the grading path. |
| `compute-aggregates` | `0 4 * * *` (daily 4am UTC) | `npx tsx scripts/compute-aggregates.ts` | Seller portfolio rollup + voice analytics + buyer funnel metrics from `PropertyBuyerStage`. After KPI snapshot, before story regen. |

### HTTP cron wrappers (manual + external trigger surface)

| Endpoint | Wraps |
|---|---|
| `app/api/cron/poll-calls/route.ts` | `scripts/poll-calls.ts` logic |
| `app/api/cron/process-recording-jobs/route.ts` | `runGradingProcessor()` from `lib/grading-processor.ts` |

GET + POST both supported. Use for external cron / uptime monitor / debug curl.

### Cron heartbeat coverage status

Per AGENTS.md Background Worker Conventions, every worker iteration MUST write
`cron.<name>.started` and `cron.<name>.finished` audit rows. **Bug #23 in
PROGRESS** tracks the gap: only `process_recording_jobs` (in-process worker
loop) has heartbeats today.

| Cron | Heartbeat in audit_logs? |
|---|---|
| `process_recording_jobs` (via `runGradingProcessor`) | ✅ `cron.process_recording_jobs.started` / `.finished` |
| `poll-calls` | ❌ — Bug #23 |
| `daily-audit` | ❌ — Bug #23 |
| `daily-kpi-snapshot` | ❌ — Bug #23 |
| `weekly-profiles` | ❌ — Bug #23 |
| `regenerate-stories` | ❌ — Bug #23 |
| `compute-aggregates` | ❌ — Bug #23 |

---

## Pages roster

23 tenant-scoped pages under `app/(tenant)/[tenant]/`. 5 auth pages under `app/(auth)/`.

### Tenant-scoped (`/{tenant}/...`)

| Path | Purpose | Status |
|---|---|---|
| `/{tenant}/day-hub` | Morning planner — tasks, appointments, inbox, KPIs. **Canonical Tasks/Day Hub surface per CLAUDE.md Rule 3 § 7.** In-app GHL action modals (Add Note, Create Apt, Workflow, Update Task — Session 42 commit `f9d4590`) write directly to GHL. | Live, primary |
| `/{tenant}/tasks` | Older Tasks page kept around because Chris has it bookmarked. **P4 deletion candidate in AUDIT_PLAN.** | Legacy |
| `/{tenant}/dashboard` | Overview dashboard. | Live |
| `/{tenant}/calls` + `/{tenant}/calls/[callId]` | Calls list + call detail (5-tab: coaching, transcript, next steps, property tabs, manual upload). | Live |
| `/{tenant}/inventory` + `/{tenant}/inventory/[propertyId]` + `/{tenant}/inventory/new` + `/{tenant}/inventory/[propertyId]/edit` | Property list + detail (200+ fields, vendor intel surfacing, deal intel research tab) + manual create + edit forms. Cash-hero matrix + 3-col Numbers panel + persistent cross-tab side panel (Session 39-40 redesign). | Live |
| `/{tenant}/sellers/[id]` | Seller-centric detail view. Court records, portfolio, voice analytics aggregates. | Live (added Sessions 41-42) |
| `/{tenant}/buyers` + `/{tenant}/buyers/[id]` | Disposition Hub — buyer list + detail. | Built, **hidden from nav** |
| `/{tenant}/contacts` | Contact list. | Live |
| `/{tenant}/kpis` | KPI dashboard — score trends, milestones, TCP ranking. | Live |
| `/{tenant}/ai-coach` | Full-page AI coaching surface. | Live |
| `/{tenant}/ai-logs` | Admin AI interaction logs. **Tabbed UI as of Session 42**: Team Chats / AI Work / Problems. | Live (admin-only) |
| `/{tenant}/audit` | 6-tab system event monitor (Dials / Leads / Appointments / Messages / Tasks / Stage Changes) reading from `webhook_logs`. Status bar with health dot + events today + failed count. | Live (owner/admin only) |
| `/{tenant}/bugs` | Bug-report admin review page. | Live (added Session 42) |
| `/{tenant}/health` | Per-tenant health page. | Live |
| `/{tenant}/accountability` | Accountability page (no PROGRESS entry — investigate origin). | Live |
| `/{tenant}/training` | Training Hub — Call of Week, Top Calls, Review Queue. | Built, **hidden from nav** |
| `/{tenant}/roi` | Lead Source ROI with spend tracking. | Built, **hidden from nav** |
| `/{tenant}/settings` | Single Settings Hub — 7 sections per CLAUDE.md Rule 3. | Live |

### Auth (`/...`)

| Path | Purpose |
|---|---|
| `/login` | Standard NextAuth login. |
| `/register` | Sign-up flow. |
| `/onboarding` | Connect GHL (OAuth) → select pipeline trigger → make/replay first call → paywall → invite team. CLAUDE.md Rule 6 (Onboarding is 70% of the app). |
| `/pricing` | Stripe paywall page. |
| `/reset-password` | Password reset flow. |

### Floating UI elements

- `components/ui/floating-bug-button.tsx` — persistent on every tenant page (Session 42).
- `components/ui/coach-sidebar.tsx` — right-sidebar AI Assistant chat on every tenant page.

---

## API surface

109 route files under `app/api/`. Migration to `withTenant` from `lib/api/withTenant.ts` is **partial**. Status as of 2026-04-27:

| Pattern | Count | Tenant isolation |
|---|---|---|
| Total `route.ts` files | 109 | — |
| Uses `withTenant` | 19 | ✅ Enforced structurally — `ctx.tenantId` guaranteed valid |
| Uses `getSession` directly | 75 | ⚠️ Manual `tenantId` tracking — **migration backlog** |
| Other (auth / webhooks / cron / health / service-token) | 15 | N/A — see breakdown below |

### The 15 non-tenant-session routes

| Route | Auth scheme |
|---|---|
| `app/api/auth/[...nextauth]/route.ts` | NextAuth handles session itself |
| `app/api/auth/reset-password/route.ts` | Token in URL (forgotten-password flow) |
| `app/api/cron/poll-calls/route.ts` | Public — Railway cron + manual debug |
| `app/api/cron/process-recording-jobs/route.ts` | Public — Railway cron + manual debug |
| `app/api/health/route.ts` | Public — Railway healthcheck |
| `app/api/tenants/register/route.ts` | Public — creates tenant + owner before session exists |
| `app/api/vieira/calls/recent/route.ts` | `lib/vieira-auth.ts` — `X-Vieira-Token` header against `VIEIRA_SERVICE_TOKEN` env |
| `app/api/vieira/health/route.ts` | Same |
| `app/api/vieira/properties/pipeline/route.ts` | Same |
| `app/api/vieira/summary/route.ts` | Same |
| `app/api/webhooks/ghl/route.ts` | HMAC signature against `GHL_WEBHOOK_SECRET` |
| `app/api/webhooks/ghl/buyer-response/route.ts` | Same |
| `app/api/webhooks/ghl/calls-check/route.ts` | Same |
| `app/api/webhooks/ghl/status/route.ts` | Same |
| `app/api/webhooks/stripe/route.ts` | Stripe signature against `STRIPE_WEBHOOK_SECRET` |

### Migration framing

The 75 `getSession`-direct routes are not bugs in themselves — they predate the
`withTenant` helper (introduced 2026-04-07, Session 33). Each one tracks
`tenantId` manually. The risk is structural: every route is one missing
`tenantId: ctx.tenantId` `where`-clause away from a cross-tenant data leak
(see Bug #13/#14/#15 history in DECISIONS / SESSION_ARCHIVE — three real
leaks caught and fixed via this migration).

`withTenant` makes the leak structurally impossible to ship. Migration is
**ongoing tech-debt**, parked as P5 in PROGRESS Next Session. No fixed
deadline; sweep opportunistically when touching a route for other reasons.

Per AGENTS.md Route Conventions: **all NEW routes MUST use `withTenant`** —
new code should never add to the 75.

### Top-level API directory layout

```
app/api/
├── [tenant]/        Tenant-scoped (audit, buyers, calls, contacts, dayhub,
│                    ghl/{notes,appointments,tasks,workflows}, properties,
│                    sellers, tasks)
├── admin/           Admin-only (ai-logs, embed-knowledge, generate-profiles,
│                    knowledge, load-playbook, user-profiles)
├── ai/              Assistant + coach + outreach-action
├── auth/            NextAuth handlers + register
├── blasts/          Deal blast routes
├── bugs/            Bug-report POST + admin GET
├── buyers/          Buyer CRUD
├── call-rubrics/    Rubric editor
├── calls/           Call CRUD outside tenant scope (sync, manual etc.)
├── cron/            HTTP wrappers — poll-calls, process-recording-jobs
├── debug/           Debug endpoints (gated)
├── ghl/             GHL OAuth callback + pipelines + calendars + actions +
│                    phone-numbers
├── health/          Railway healthcheck (`{ status: ok }`)
├── kpi-entries/     Manual KPI entry
├── lead-sources/    Lead source CRUD
├── markets/         Market CRUD
├── milestones/      Milestone CRUD
├── notifications/   In-app notifications
├── properties/      Property CRUD outside tenant scope (blast, story,
│                    re-enrich, research, skip-trace)
├── sellers/         Seller CRUD outside tenant scope (skip-trace)
├── stripe/          Checkout + webhook
├── tasks/           Task CRUD
├── tenants/         Config + invite + register
├── users/           User CRUD
├── vieira/          Tenant-specific Vieira routes (per `lib/vieira-auth.ts`)
├── webhooks/        GHL inbound webhook
└── workflows/       Workflow engine triggers
```

---

## Operational scripts

57 scripts in `scripts/`. Categorized:

### Recurring crons (referenced by `railway.toml`)
- `poll-calls.ts`, `audit.ts`, `kpi-snapshot.ts`, `generate-profiles.ts`, `regenerate-stories.ts`, `compute-aggregates.ts`

### Background worker entry point (manual debug only)
- `process-recording-jobs.ts` — older standalone driver, importable for manual `npx tsx` invocation. Same logic as `lib/grading-processor.ts` (the in-process driver). HTTP wrapper at `app/api/cron/process-recording-jobs/route.ts` is the preferred manual trigger surface.

(`scripts/grading-worker.ts` was deleted Wave 1, 2026-04-27 — Blocker #3 closed. In-process worker via `instrumentation.ts` is sole driver.)

### Health checks + verifiers
- `verify-calls-pipeline.ts` — bidirectional A/B + sanity gate + canary. Closed Blocker #1. Daily-cron candidate.
- `verify-e2e.ts` — end-to-end smoke check.
- `daily-health-check.ts` — morning ritual SQL on queue + errors + misclassifications.
- `check-silent-catches.sh` — bash scanner for `.catch(() => {})` patterns. 79 matches across broader codebase per Session 33.
- `coverage-probe.ts`, `enrichment-stats.ts`, `enrichment-gaps.ts` — vendor-coverage diagnostics.

### Diagnostic reads (one-shot, idempotent)
- `check-progress.ts` — live status-count snapshot.
- `check-stuck-calls.ts` — PENDING/FAILED state with raw SQL (bypasses Prisma enum drift).
- `check-durations.ts`, `check-missing-leads.ts`, `check-remaining.ts`, `check-today-leads.ts`, `check-todays-leads.ts` — focused diagnostic queries.
- `inspect-failed.ts`, `inspect-lead.ts`, `inspect-enterprise.ts` — per-row deep inspection.
- `audit-short-graded.ts`, `diagnose-calls.ts`, `diagnose-inventory-issues.ts` — anomaly investigators.
- `raw-field-audit.ts`, `full-leaf-dump.ts` — raw vendor-field exploration.
- `vendor-comparison.ts` — cross-vendor field-coverage comparison.

### Backfills (one-shot, mutating)
- `recover-stuck-calls.ts` — backfill PENDING/FAILED. wf_* ID resolution + recording fetch + transcribe + grade. Idempotent per-row.
- `import-historical-calls.ts` — historical call import.
- `backfill-batchdata-blobs.ts`, `backfill-inventory-cleanup.ts`, `backfill-today.ts` — targeted backfills.
- `cleanup-empty-shell-calls.ts` — addresses Bug #22 (24 empty-shell FAILED rows).
- `cleanup-duplicate-milestones.ts`, `cleanup-orphans.ts` — data hygiene.
- `fix-dispo-milestones.ts` — milestone repair.
- `flip-failed-to-pending.ts`, `reset-april13-calls.ts`, `reset-processing.ts`, `retry-stuck-calls.ts` — status flippers.
- `reenrich-today.ts` — re-run enrichment for today's leads.
- `regenerate-stories.ts` — Property Story regen (also a cron).
- `split-existing-doubles.ts` — split combined-address properties (companion to the Session-41-era auto-split feature).

### Seed + setup (one-shot, idempotent at install time)
- `seed.ts`, `seed-markets.ts`, `seed-appointment-types.ts` — DB seeding.
- `setup-team.ts` — initial team roster.
- `load-playbook.ts`, `load-user-profiles.ts` — playbook + profile content load into pgvector.
- `sync-buyers.ts` — buyer list sync.

### Visual / UI
- `visual-audit.ts` — Playwright-driven UI audit. **Excluded from `tsc`** (per `tsconfig.json`) so playwright stays in `devDependencies`.

---

## Active blockers

Detail in `docs/AUDIT_PLAN.md`. Cross-ref summary:

| Blocker | Status | Owner |
|---|---|---|
| **#1** — Call pipeline integrity | ✅ CLEARED 2026-04-20 (Session 37) | — |
| **#2** — Action execution discipline | Code shipped Session 38; **production verification owed** (P1 in PROGRESS Next Session) | User |
| **#3** — Dual grading worker (in-process + legacy `[[services]]`) | Code change deferred; documentation done (Commit #1 + SYSTEM_MAP) | Engineering |

Plus 5 priority items in AUDIT_PLAN: P3 (model fragmentation), P4 (`/tasks/` deletion), P5 (`assign_contact_to_user` UI bypass), and pending decision D-0XX (AI model churn writeup).

---

## Schema migration log

42 migrations in `prisma/migrations/`. Last 15 (Sessions 38-43):

| Date | Migration | Change |
|---|---|---|
| 2026-04-13 | `20260413180000_add_skipped_grading_status` | Added `SKIPPED` to `GradingStatus` enum |
| 2026-04-20 | `20260420230000_add_updated_at_to_call` | Added `Call.updatedAt @updatedAt` (enables rescue sweeps) |
| 2026-04-21 | `20260421080000_add_call_reclassifications` | Manager reclassifications feed back into next grading run |
| 2026-04-21 | `20260421100000_add_outcome_manual_override` | Preserve human-set outcome through re-grade |
| 2026-04-21 | `20260421120000_add_manual_upload_to_call` | Manual call upload bypass field |
| 2026-04-22 | `20260422130000_add_stage_entered_at_to_property` | Pipeline stage velocity tracking |
| 2026-04-22 | `20260422140000_add_ghl_sync_locked_to_property` | GHL sync lock for split-doubles operations |
| 2026-04-22 | `20260422150000_add_property_story_and_alt_offers` | Property Story + alt offer types |
| 2026-04-22 | `20260422160000_add_risk_factor_to_property` | Computed risk factor column |
| 2026-04-23 | `20260423000000_add_property_condition_intangibles_location` | Condition + intangibles + location grades |
| 2026-04-23 | `20260423010000_wave1_new_data_points` | Schema Wave 1 — 80+ columns |
| 2026-04-23 | `20260423020000_add_tier1_tier2_property_fields` | Tier 1+2 property fields per API_FIELD_INVENTORY |
| 2026-04-23 | `20260423030000_add_tier3_distress_mls_demographics` | Tier 3 fields |
| 2026-04-23 | `20260423040000_add_pr_google_courtlistener_fields` | PropertyRadar + Google + CourtListener fields |
| 2026-04-23 | `20260423050000_add_pr_detail_fields` | PR detail expansion |
| 2026-04-23 | `20260423060000_capture_all_vendor_fields` | All-vendor capture |
| 2026-04-24 | `20260424000000_add_bug_reports` | `BugReport` model |
| 2026-04-27 | `20260427000000_add_bug_screenshot` | Screenshot field on `BugReport` (base64 data URL) |

---

## Worker observability

Per AGENTS.md Background Worker Conventions, the heartbeat pattern lives in `runGradingProcessor()` (lib/grading-processor.ts). One `started` row at function top, one `finished` row at function end (skipped on throw).

> **Tenant-id discipline note:** All queries below are **admin / tenant-spanning operational queries** intended to be run by an operator via psql or a DB client to assess system health. They intentionally span all tenants. Application code that touches `calls`, `properties`, `tasks`, `audit_logs`, or `webhook_logs` MUST always include `WHERE tenant_id = '...'` per CLAUDE.md Hard Technical Rules — these queries are the documented exception (operator runs from a privileged context, not server code).

### Health query — heartbeat liveness

```sql
-- ADMIN: tenant-spanning. Heartbeat audit rows are written with tenantId=NULL
-- by lib/grading-processor.ts (the worker is system-level, not tenant-scoped).
SELECT action, COUNT(*)::int AS count, MAX(created_at) AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS seconds_since
FROM audit_logs
WHERE action LIKE 'cron.process_recording_jobs.%'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action;
```

**Steady-state expectation:** one `started` + one `finished` per minute.

| `last_seen` age | Diagnosis |
|---|---|
| < 60s | Healthy |
| 60-120s | Tick may be running long (deal-intel catch-up), check next iteration |
| > 120s | **Worker is not running.** Escalation in PROGRESS Next Session P3. |
| `started` rows present, no matching `finished` | **Worker is crashing mid-run.** Read `audit_logs WHERE severity='ERROR'` for root cause. |

### Stuck-state queries

```sql
-- ADMIN: tenant-spanning. Counts rows whose rescue sweep should have caught
-- them. Threshold mirrors SYSTEM_MAP §7 rescue sweeps (PROCESSING > 5 min).
-- Healthy result: 0 (rescue sweep at top of every tick should keep this empty).
SELECT COUNT(*) FROM calls
WHERE grading_status='PROCESSING' AND updated_at < NOW() - INTERVAL '5 minutes';

-- ADMIN: tenant-spanning. FAILED rows with no recording cannot auto-retry
-- (Session 38 Fix 3 only retries FAILED + recordingUrl NOT NULL, threshold 1h).
-- These rows stay FAILED until manually cleaned (Bug #22 — 24 known rows).
SELECT grading_status, COUNT(*) FROM calls
WHERE recording_url IS NULL
GROUP BY grading_status;

-- ADMIN: tenant-spanning. FAILED rows that ARE eligible for auto-retry
-- (have recording_url, last touched > 1h ago). Should drain over time.
SELECT COUNT(*) FROM calls
WHERE grading_status = 'FAILED'
  AND recording_url IS NOT NULL
  AND updated_at < NOW() - INTERVAL '1 hour';
```

> Per-tenant variant of any of the above: add `AND tenant_id = '<tenant-cuid>'`
> (e.g. New Again Houses tenant cuid via `SELECT id FROM tenants WHERE slug = 'new-again-houses'`).

### Webhook health (for `/audit` page status bar)

```sql
-- ADMIN: tenant-spanning. The /audit page issues a tenant-scoped variant
-- (WHERE tenant_id = ctx.tenantId) — see app/api/[tenant]/audit/route.ts.
-- This unscoped form is for cross-tenant operator triage.
SELECT status, COUNT(*) FROM webhook_logs
WHERE received_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

Healthy: mostly `success`, low `failed`, no stuck `received` or `processing`.

A non-zero `failed` count or any stuck `processing` rows older than ~5 min
warrant inspection of `error_reason` on the affected rows.

### Output-table verification for heartbeat-less crons

Until Bug #23 lands heartbeat audit rows on the other 6 crons, the only way
to verify they ran is to inspect their output tables. One example for
`daily-kpi-snapshot`:

```sql
-- ADMIN: tenant-spanning. Confirm daily KPI snapshot ran.
-- Healthy: a row per active tenant per day, 0-2 day lag.
SELECT MAX(snapshot_date), COUNT(DISTINCT tenant_id)
FROM kpi_snapshots
WHERE snapshot_date > NOW() - INTERVAL '7 days';
```

Same pattern applies to the other heartbeat-less crons: pick a table they
write to and check `MAX(updated_at) / MAX(created_at)` plus a row-count
sanity check. Replace these with proper heartbeat queries once Bug #23 closes.

---

## Hygiene rituals

### Per-commit (enforced by hooks)

- **Pre-push hook** (`.git/hooks/pre-push`) runs `npx tsc --noEmit`. Push rejected on tsc failure.
- **Stop hook** (Session 37, `.claude/hooks/`) runs `npx tsc --noEmit` at end of every Claude session. Auto-commit + auto-push removed in Session 37 — surgical one-prompt-at-a-time with diff review before push.

### Daily (manual)

- Run `scripts/daily-health-check.ts` first thing — reads queue + errors + misclassifications.
- Eyeball `/audit` page status bar.

### Sprint kickoff / weekly

- Run `scripts/verify-calls-pipeline.ts` Pass A + Pass B + sanity + canary.
- `npm install` + `npx prisma generate` if rebasing across multiple sessions of remote work (this Claude session learned the hard way — local env was stale, tsc reported false errors).

### Standing pre-commit ritual (Session 44 sprint convention)

- `git log --oneline f1284f3..HEAD` before each push to confirm no surprise drift.
- (`f1284f3` = post-sprint baseline, set 2026-04-27 at end of Session 44 docs reorg. Bump this anchor whenever a new sprint starts from a fresh known-clean reference. Pre-sprint baseline was `ea02beb`.)

---

## Incident notes

Recent (last ~6 weeks). Older incidents in `docs/SESSION_ARCHIVE.md`.

| Date | Incident | Root cause | Fix |
|---|---|---|---|
| 2026-04-13 | Anthropic credit exhaustion → 131 calls FAILED | Billing | Credits restored. Session 38 Fix 3 added FAILED auto-retry sweep. |
| 2026-04-20 04:43 UTC | Grading pipeline silent outage | Railway dropped `[[cron]] process-recording-jobs` from registry, no-op redeploy didn't revive it | Session 38: heartbeat audit row added; converted to `[[services]]` long-running worker; later Sessions 41-42 moved to in-process via `instrumentation.ts`. Legacy `[[services]]` block still pending Blocker #3 removal. |
| 2026-04-09 | Webhook drop on team go-live day | HMAC rejection silently dropping all GHL webhooks since Apr 6 (Session 33 secret mismatch) + TYPE_CALL/CALL/AppointmentCreate event-name mismatches | Session 35: HMAC verification fixed, event vocabulary aligned. Audit page built same day. |
| 2026-04-09 | Poll cron blocked all day | `pg_advisory_lock` leak on pgbouncer | Session 35: replaced with self-expiring 45s timestamp lock. |

---

## Pointers

- **Architecture + philosophy + modules + AI layer + call pipeline** — `docs/SYSTEM_MAP.md`
- **Active blockers + audit queue + priority items + pending decisions** — `docs/AUDIT_PLAN.md`
- **Why a decision was made** — `docs/DECISIONS.md`
- **Audit deliverables** — `docs/audits/`
- **Historical session log** — `docs/SESSION_ARCHIVE.md`
- **UI design system** — `docs/DESIGN.md`
- **Vendor field comparison** — `docs/API_FIELD_INVENTORY.md`
- **Embedded playbook** (loaded into pgvector via `scripts/load-playbook.ts`) — `docs/NAH-Wholesale-Playbook/`
