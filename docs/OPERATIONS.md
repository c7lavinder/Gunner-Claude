# OPERATIONS.md — Gunner AI

> The fast-changing operational state of the system.
> Crons, page roster, API migration counts, hygiene scripts, blockers, schema-change log, worker observability.
> Slow-changing items (philosophy, stack, modules, AI layer architecture, call pipeline shape, safety gate pattern) live in `docs/SYSTEM_MAP.md`.
> Updated 2026-04-27 — Session 43 state.

> **Maintenance rule (CLAUDE.md Rule 8):** Any session that changes a cron, route, page, schema field, or operational script must update this file in the same commit. Default to OPERATIONS over SYSTEM_MAP when in doubt.

---

## Crons + long-running services

Live in `railway.toml`. Healthcheck at `[PRODUCTION_URL]/api/health`.

### Long-running services

| Service | Start command | Notes |
|---|---|---|
| `gunner-ai-web` | `npm start` (Next.js production server) | Hosts the web app. **Boots in-process grading worker via `instrumentation.ts`** — see SYSTEM_MAP "Workers" section. Sole driver of grading as of Wave 1 (2026-04-27). |

### Crons

| Name | Schedule | Command | Purpose |
|---|---|---|---|
| `poll-calls` | `* * * * *` (every 1 min) | `npx tsx scripts/poll-calls.ts` | GHL call ingestion safety net. Per-user `/conversations/search`. Has self-expiring 45s timestamp lock on `tenant.lastCallExportCursor.updatedAt` (Session 35 — replaced leaky pg_advisory_lock). Heartbeats `cron.poll_calls.started/.finished` via `lib/cron-heartbeat.ts` (Session 74). |
| `daily-audit` | `0 2 * * *` (2am UTC) | `npx tsx scripts/audit.ts` | Self-audit agent — code review of recent changes. |
| `daily-kpi-snapshot` | `0 0 * * *` (midnight UTC) | `npx tsx scripts/kpi-snapshot.ts` | Snapshot per-rep KPIs to `kpi_snapshots` table for trend charts. |
| `weekly-profiles` | `0 3 * * 0` (Sun 3am UTC) | `npx tsx scripts/generate-profiles.ts` | Auto-generate per-rep coaching profiles from last week's calls. |
| `regenerate-stories` | `0 7 * * *` (daily 7am UTC) | `npx tsx scripts/regenerate-stories.ts` | Regen Property Stories for properties touched by edits / milestone changes / buyer activity / blasts that didn't go through the grading path. |
| `compute-aggregates` | `0 4 * * *` (daily 4am UTC) | `npx tsx scripts/compute-aggregates.ts` | Seller portfolio rollup + voice analytics + buyer funnel metrics from `PropertyBuyerStage` + **Partner cross-portfolio counters** (Session 67 Phase 2 close — `dealsSourcedToUsCount` / `dealsTakenFromUsCount` / `dealsClosedWithUsCount` / `jvHistoryCount` / `lastDealDate` per Partner, derived from PropertyPartner.role + Property.status). After KPI snapshot, before story regen. |
| `enrich-pending` | `*/5 * * * *` (every 5 min) | `npx tsx scripts/enrich-pending.ts` | Phase 3 catch-up enrichment. Walks `Property where pendingEnrichment=true`, fetches the real GHL contact, fills in `Property.{address,city,state,zip}` + `Seller.{firstName,lastName,phone,email,mailingAddress,...}`, then fires multi-vendor enrichment (PropertyRadar = subscription, BatchData $15/day cap, Google ~$0.017/call). Batch=100/run; ~6.7h to drain a full Phase 2 backfill (~8000 stubs). |
| `reconcile-ghl-pipelines` | `0 4 * * *` (daily 4am UTC) | `npx tsx scripts/reconcile-ghl-pipelines.ts` | Phase 4.1 nightly drift fixer. Walks recent ~5 pages of each registered pipeline, compares to Gunner state, creates missing Property stubs, fixes stale lane statuses. Logs auditLog WARNING per fix; CRITICAL if > 5 fixes in one run. Catches dropped/silently-failing webhooks within 24h. |

### HTTP cron wrappers (manual + external trigger surface)

| Endpoint | Wraps |
|---|---|
| `app/api/cron/poll-calls/route.ts` | `scripts/poll-calls.ts` logic |
| `app/api/cron/process-recording-jobs/route.ts` | `runGradingProcessor()` from `lib/grading-processor.ts` |

GET + POST both supported. Use for external cron / uptime monitor / debug curl.

### Cron heartbeat coverage status

Per AGENTS.md Background Worker Conventions, every worker iteration MUST write
`cron.<name>.started` and `cron.<name>.finished` audit rows. **Bug #23 closed
2026-05-07 (Session 74)** — `lib/cron-heartbeat.ts` exposes
`withCronHeartbeat(name, fn)` and every `[[cron]]` script in `railway.toml`
plus the in-process grading loop now writes `started` / `finished` (and
`failed` on throw). Cron action names use snake_case
(`poll_calls`, `daily_kpi_snapshot`, `reconcile_ghl_pipelines`, …) so they
match the existing `process_recording_jobs` and `regenerate_stories`
precedents.

| Cron | Heartbeat in audit_logs? | Source |
|---|---|---|
| `process_recording_jobs` (via `runGradingProcessor`) | ✅ inline | `lib/grading-processor.ts` (Session 38) |
| `poll_calls` | ✅ via helper | `scripts/poll-calls.ts` |
| `daily_audit` | ✅ via helper | `scripts/audit.ts` |
| `daily_kpi_snapshot` | ✅ via helper | `scripts/kpi-snapshot.ts` |
| `weekly_profiles` | ✅ via helper | `scripts/generate-profiles.ts` |
| `regenerate_stories` | ✅ via helper | `scripts/regenerate-stories.ts` |
| `compute_aggregates` | ✅ via helper | `scripts/compute-aggregates.ts` |
| `enrich_pending` | ✅ via helper | `scripts/enrich-pending.ts` |
| `reconcile_ghl_pipelines` | ✅ via helper | `scripts/reconcile-ghl-pipelines.ts` |

Pattern for any new cron:

```ts
import { withCronHeartbeat } from '@/lib/cron-heartbeat'

async function main() { /* … */ return stats }

withCronHeartbeat('my_cron', main)
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
```

The helper writes `cron.<name>.started` before `fn()`, `cron.<name>.finished`
on success (with `durationMs` + return-value `stats`), and `cron.<name>.failed`
on throw (then re-throws so the outer `.catch` sets exit code 1).

---

## Pages roster

23 tenant-scoped pages under `app/(tenant)/[tenant]/`. 5 auth pages under `app/(auth)/`. (Session 68: `/dashboard` and `/buyers` list page deleted; `/disposition` added.)

### Tenant-scoped (`/{tenant}/...`)

| Path | Purpose | Status |
|---|---|---|
| `/{tenant}/day-hub` | Morning planner — fetches GHL tasks live, classifies + scores them, AM/PM dial pills, KPI Ledger modal, in-app GHL action modals (Add Note, Create Apt, Workflow, Update Task). **Canonical Tasks/Day Hub surface per CLAUDE.md Rule 3 § 7.** Consolidated from `/tasks` in Session 66 (2026-05-03) — the richer page logic moved here, old `/day-hub` simpler variant overwritten. | Live, primary |
| `/{tenant}/tasks` | Redirect stub → `/{tenant}/day-hub`. Preserves Chris's bookmark and any external links. Single `redirect()` call, no UI. | Legacy redirect |
| `/{tenant}/calls` + `/{tenant}/calls/[callId]` | Calls list + call detail (5-tab: coaching, transcript, next steps, property tabs, manual upload). | Live |
| `/{tenant}/inventory` + `/{tenant}/inventory/[propertyId]` + `/{tenant}/inventory/new` + `/{tenant}/inventory/[propertyId]/edit` | Property list + 4-tab detail (Overview · Activity · Data · **Disposition**) + manual create + edit forms. Disposition tab mounts the 5-section `<DispositionJourney>`. `<ContactsPanel>` at top of Overview + Data shows linked sellers/buyers/partners (replaces prior Sellers/Buyers/Partners tabs). Property-detail rebuilt Session 68 (2026-05-05). | Live |
| `/{tenant}/disposition` | Admin pipeline view — properties with `status ∈ (IN_DISPOSITION, UNDER_CONTRACT)` grouped by journey stage (Ready to Blast → Awaiting Responses → In Offer → Closing). Click-through to `/inventory/{id}?tab=disposition`. Replaces the prior `/buyers` list page. Session 68. | Live (admin-only) |
| `/{tenant}/sellers/[id]` | Seller-centric detail view. Court records, portfolio, voice analytics aggregates. | Live (added Sessions 41-42) |
| `/{tenant}/sellers` | Standalone Sellers list. **No nav link as of Session 68** — `/contacts` Sellers tab is canonical. URL still resolves; Buy Signal feature lives here pending revisit. | Live, **hidden from nav** |
| `/{tenant}/buyers/[id]` | Buyer detail page. Click-through from `/contacts` Buyers tab + `<ContactsPanel>`. | Live |
| `/{tenant}/contacts` | Contact list — tabbed Sellers / Buyers / **Partners** (Session 67 Phase 4). Canonical surface for all contact types. | Live |
| `/{tenant}/partners` | Standalone Partners list — search + type filter. **No nav link as of Session 68** — `/contacts` Partners tab is canonical. URL still resolves. | Live, **hidden from nav** |
| `/{tenant}/partners/[id]` | Partner detail — identity, type-flavored cards (brokerage/license, wholesaler operation), performance counters, full deal history, edit form. Session 67 Phase 5. | Live |
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

114 route files under `app/api/`. Migration to `withTenant` from `lib/api/withTenant.ts` is **complete for all tenant-scoped routes** as of 2026-04-29 (post-Wave-3-Session-F):

| Pattern | Count | Tenant isolation |
|---|---|---|
| Total `route.ts` files | 114 | — |
| Uses `withTenant` | 93 | ✅ Enforced structurally — `ctx.tenantId` guaranteed valid |
| Uses `getSession` directly | 0 | ✅ Migration complete |
| Other (auth / webhooks / cron / health / service-token / diagnostics / OAuth callback / Stripe checkout) | 19 | N/A — see breakdown below |

Recently added (Session 67):
- Phase 2: `app/api/properties/[propertyId]/partners/route.ts` (GET/POST/DELETE) — mirrors the sibling sellers route shape; `withTenant` + property-tenant validation gate + composite-PK upsert via `lib/partners/sync.ts:upsertPartnerFromGHL()`.
- Phase 5: `app/api/partners/[partnerId]/route.ts` (PATCH/DELETE) — partner-level field edits + cascade delete. Mirrors `/api/buyers/[buyerId]` pattern.

### The 19 non-tenant-session routes

| Route | Auth scheme |
|---|---|
| `app/api/auth/[...nextauth]/route.ts` | NextAuth handles session itself |
| `app/api/auth/crm/callback/route.ts` | OAuth callback — exchanges code for token before session exists |
| `app/api/auth/reset-password/route.ts` | Token in URL (forgotten-password flow) |
| `app/api/cron/poll-calls/route.ts` | Public — Railway cron + manual debug |
| `app/api/cron/process-recording-jobs/route.ts` | Public — Railway cron + manual debug |
| `app/api/debug/webhooks/route.ts` | Internal debug — public no-op endpoint |
| `app/api/diagnostics/dial-counts/route.ts` | `Authorization: Bearer ${DIAGNOSTIC_TOKEN}` — see "Diagnostic endpoints" below |
| `app/api/health/route.ts` | Public — Railway healthcheck |
| `app/api/stripe/checkout/route.ts` | Pre-tenant — creates Stripe checkout session before tenant onboarding completes |
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

**Wave 3 migration complete as of 2026-04-29 (Session 52, batch 6/6).**
All 91 tenant-scoped routes now use `withTenant`. The original 75
`getSession`-direct routes were migrated across 6 batches (Sessions 47-52);
**38 latent cross-tenant defense gaps were caught and fixed** during the
sweep, organized into 4 leak classes documented in AGENTS.md.

The remaining 19 routes are all non-tenant-session by design — listed in
the table above with their auth schemes (NextAuth, OAuth callback, public
crons, healthchecks, HMAC-verified webhooks, service-token Vieira routes,
diagnostic-token endpoints, pre-tenant Stripe checkout).

Per AGENTS.md Route Conventions: **all NEW tenant-scoped routes MUST use
`withTenant`** — there is no longer a backlog to grow.

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
├── diagnostics/     Token-gated verification endpoints (see Diagnostic
│                    endpoints section below)
├── ghl/             GHL OAuth callback + pipelines + calendars + actions +
│                    phone-numbers
├── health/          Railway healthcheck (`{ status: ok }`)
├── kpi-entries/     Manual KPI entry
├── lead-sources/    Lead source CRUD
├── markets/         Market CRUD
├── milestones/      Milestone CRUD
├── notifications/   In-app notifications
├── properties/      Property CRUD outside tenant scope (blast, story,
│                    re-enrich, research, skip-trace, photos, documents).
│                    Session 76: photos route handles HEIC→JPEG via
│                    heic-convert + Claude Haiku vision auto-categorization;
│                    documents route is a flat upload list. Storage in
│                    Supabase via lib/storage/property-assets.ts.
├── sellers/         Seller CRUD outside tenant scope (skip-trace)
├── stripe/          Checkout + webhook
├── tasks/           Task CRUD
├── tenants/         Config + invite + register
├── users/           User CRUD
├── vieira/          Tenant-specific Vieira routes (per `lib/vieira-auth.ts`)
├── webhooks/        GHL inbound webhook
└── workflows/       Workflow engine triggers
```

### Diagnostic endpoints

Token-gated read-only endpoints for verification waves and drift
investigations. Pattern: call the same helpers the UI uses, return JSON
that a verifier in any environment can compare to SQL ground truth — no
session cookies, no rendered-page scraping.

Auth: `Authorization: Bearer ${DIAGNOSTIC_TOKEN}`. Endpoints fail closed
(401) when `DIAGNOSTIC_TOKEN` is unset on the server, so a missing env
var is a no-op rather than an open door. Set on Railway dashboard.

| Endpoint | Helper exercised | Use when |
|---|---|---|
| `GET /api/diagnostics/dial-counts?tenant=<slug>[&date=YYYY-MM-DD]` | `lib/kpis/dial-counts.ts countDialsInRange` | Reconciling Day Hub / Calls page dial counts vs SQL (Wave 2 verification) |
| `GET\|POST /api/diagnostics/v1_1_seller_backfill?tenant=<slug>[&limit=<n>]` | `lib/v1_1/wave_2_backfill.ts` (`backfillSellersFromProperty` + `migrateManualBuyerIdsForTenant`) | v1.1 Wave 2: GET = dry-run report (counts + samples), POST = apply backfill. Idempotent. Apply runs write audit_logs row `v1_1_wave_2_backfill.applied`. |
| `GET\|POST /api/diagnostics/v1_1_seller_rollup_backfill?tenant=<slug>[&limit=<n>]` | `lib/v1_1/call_seller_autolink.ts:backfillCallSellerLinks` + `lib/v1_1/seller_rollup.ts:backfillTenantSellerRollups` + `lib/v1_1/wave_4_backfill.ts:backfillBuyerMatchScores` | v1.1 Wave 4: combined three-phase backfill. GET = dry-run, POST = apply (sequence: auto-link → seller rollup → matchScore copy). Idempotent. Apply runs write audit_logs row `v1_1_wave_4_rollup_backfill.applied`. **Long-running** — auto-link phase scans every unlinked call (5+ min on tenants with 7K+ calls). Railway edge proxy first-byte timeout is ~6 min; the Node process keeps writing past timeout but the HTTP client gets a `first byte timeout` error. Re-run the GET to see actual DB state if a POST appears to fail; the work usually completed server-side. |
| `GET /api/diagnostics/high-stakes-audit?tenant=<slug>` | `db.auditLog.count` + `findMany` over `assistant.action.*` and `gate.*` action prefixes | Blocker #2 verification ritual: surfaces the 6 high-stakes Role Assistant tools' audit-row trail in one curl (24h/7d/30d counts + last 5 success rows + last 5 failure rows per tool, plus `gate.<action>.pending` / `gate.approved` rows from the requireApproval flow). Read-only. Source refs in the response `notes` field. See `docs/AUDIT_PLAN.md` "Blocker #2 verification ritual" for the click-path companion. |
| `GET /api/diagnostics/pr-probe?tenant=<slug>[&propertyId=<id>][&purchase=1][&enrich=1]` | Raw `fetch` to PropertyRadar `/properties` search + optional `enrichProperty()` orchestrator run | Verifies PropertyRadar config + full enrichment path. Default = preview-only probe (Purchase=0, no credit burn). `?purchase=1` materializes the record (~3 PR credits). `?enrich=1` ALSO runs the full orchestrator and re-fetches the property to show landed columns. Built Session 69 to diagnose the missing-PR-API-key blocker. Use any time PR config changes on Railway. |

Example:

```bash
curl -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
  "[PRODUCTION_URL]/api/diagnostics/dial-counts?tenant=new-again-houses&date=2026-04-27"
```

Response includes `centralDayBounds` (so callers can spot TZ issues),
`lmUserIds` (so the LM count is reproducible against `users.role` SQL),
and `sources` (which helper produced each number).

When adding a new diagnostic, follow the same conventions: token-gated,
GET-only, references the canonical helper in the response so the
verification path is honest.

---

## Operational scripts

57 scripts in `scripts/`. Per-script catalog (idempotency, last run,
delete-after) lives in [`scripts/REGISTRY.md`](../scripts/REGISTRY.md) — keep that
file updated alongside this section when scripts land or rot. Categorized:

### Recurring crons (referenced by `railway.toml`)
- `poll-calls.ts`, `audit.ts`, `kpi-snapshot.ts`, `generate-profiles.ts`, `regenerate-stories.ts`, `compute-aggregates.ts`, `enrich-pending.ts` (Phase 3 catch-up, every 5 min — flags `--concurrency` / `--skip-enrich` / `--max-runs` for one-shot drains), `reconcile-ghl-pipelines.ts` (Phase 4.1 daily 4am UTC — skips creating Property when GHL contact has no `address1` per Session 73 owner choice).

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
- `split-existing-doubles.ts` — split combined-address properties (companion to the Session-41-era auto-split feature). As of Session 75 it walks `splitCombinedAddressIfNeeded`, which now uses the parser's N-way `splitStreets` — handles 4-property bare-number splits ("4506 & 4510 & 4502 & 0 Prospect Rd") and different-street pairs ("11523 15th St Ct & 11418 16th St"), not just the 2-property same-street regex.
- `cleanup-address-shapes.ts` — Session 73 / 75: re-parses messy Property addresses using `lib/address-parse.ts` and persists clean fields. Splits multi-property `&` rows into separate rows. Default DRY-RUN; pass `--apply` to persist. Targets two row sets: `marketId IS NULL` (Pattern A + B) and `address contains '&'` (Pattern C). Re-run any time a new pathological shape is discovered in inventory data quality.
- `diagnose-missing-markets.ts` — Session 73 / 75: dump every Property where `marketId IS NULL`, bucket by pattern. Use first when the data-quality tile shows missing-market rows.
- `cleanup-empty-address-properties.ts` — Session 73: delete Property rows whose address is empty/NULL. Companion to the reconcile-cron guard so empty-shell stubs don't recreate.
- `backfill-ghl-pipelines.ts` — Phase 2 one-shot bulk-stub backfill from GHL opps (cursor-resumable, ran 2026-05-06 to seed 7,553 stubs).
- `deep-resync-ghl-lanes.ts` — Session 73: walks every opp in every active pipeline and rebuilds Property lane statuses from GHL truth (clears stale acqStatus / dispoStatus / longtermStatus left behind by Phase 1 migration + strict-lane no-op semantics). One-shot; re-run if chip counts diverge from GHL again.
- `backfill-markets.ts` — Session 73: walks `Property where marketId IS NULL AND zip != ''`, groups by target marketId, issues one bulk updateMany per market. Ran live 8.1 sec, 7,409 rows. Re-run if a future migration drops marketIds.
- `normalize-lead-sources.ts` — Session 73: collapses GHL free-form `contact.source` strings via `lib/lead-source-normalize.ts` to the canonical 7 buckets (Dialer / Texts / Form / PPC / PPL / JV / Agent). Re-run after a GHL-side rename or new source variant.
- `refill-missing-sources.ts` — Session 73: re-fetches the GHL contact for every Property where `leadSource IS NULL` and writes back via the normalizer. Useful when adding a new alias to `lead-source-normalize.ts` to retroactively pick up matching values.
- `link-unlinked-splits.ts` — Session 75: walks `cleanup.address_split` audit rows, finds the unlinked split-child Property for each split address, links `ghlContactId` to the parent's and mirrors the parent's `PropertySeller` rows onto the child (`isPrimary=false`). Idempotent first-match-wins on chronological audit order. Default DRY-RUN, pass `--apply`. Ran 2026-05-07: 136 children linked, 136 seller rows created, 0 failures. Re-run only after another `cleanup-address-shapes --apply` produces new split children.
- `diagnose-unlinked-splits.ts` — Session 75: read-only counter for unlinked split children (companion to `link-unlinked-splits.ts`). Surfaces parent/child relationships and the global `ghlContactId IS NULL` count.
- `diagnose-missing-street-numbers.ts` — Session 75: list every Property whose `address` doesn't start with a digit, bucketed by pattern (lot-only, PO box, street-name only, directional-prefix only, other). Read-only — auto-fix is rarely safe because most missing numbers are missing at the source (GHL).
- `fix-missing-street-numbers.ts` — Session 75: paired with the diagnostic. Re-fetches the GHL contact for each row and only proposes a fix when GHL has a single-property numbered address whose tail matches the existing Gunner value. Default DRY-RUN. As of the 2026-05-07 run, **0 of 52 candidates were safely auto-fixable** — the majority of missing numbers are also missing in GHL, the rest are split-derived rows where the parent address would corrupt the child. Manual review required.
- `diagnose-missing-stage.ts` — Session 75 (extended): list every Property where the inventory page's "Missing Stage" tile would count it (effectiveStatus=NEW_LEAD AND no stage name on any lane, AND visible by default). Read-only. Used to root-cause the 3 missing-stage rows on 2026-05-07 (split children where stage names weren't copied from parent).
- `backfill-split-stage-names.ts` — Session 75 (extended): walks `cleanup.address_split` audit rows and copies `ghlAcqStageName` / `ghlDispoStageName` / `ghlLongtermStageName` + entered-at timestamps from each parent onto its split children. Idempotent (only writes when child stage-name fields are all null AND parent has at least one). Default DRY-RUN, pass `--apply`. Ran 2026-05-07: 136 + 4 split children back-filled, 0 failures. Re-run after any future `cleanup-address-shapes --apply` that creates new split children.
- `cleanup-address-shapes.ts --scan-all` — Session 75 (extended): bypass the targeted OR-clause and run the parser against every Property in the tenant. Catches new pathological shapes (4-digit Northeast zips, mid-street state abbrev like "Nc Hwy 222 W", `///` separator, dual-city `&` shape). Slower (one parser call per row) but the parser only triggers a write when its output differs from the row's current fields. Use whenever a fresh shape is observed in inventory data.
- `audit-property-addresses.ts` — Session 75 (close): comprehensive auditor. Runs every Property in the tenant through 11 checks (E001-E018) and buckets findings by issue type. Honors `cleanup.address_reviewed` audit rows so owner-confirmed exceptions stay suppressed. Use `--code E018` to filter to one bucket. Read-only.
- `list-remaining-issues-with-seller.ts` — Session 75 (close): companion to the auditor. Surfaces every actionable row (city/state missing, comma-in-addr, zip-at-end, parcel-only) with the linked seller's name + phone + a recommended action per group. Filters out the auditor's "no action needed" buckets (legit fractional / legit road designations / owner-reviewed no-number rows).
- `merge-duplicate-properties.ts` — Session 75 (close): dedupe Property rows that share canonical address+city+state+zip within one tenant. Picks a primary by (GHL opp count → calls → milestones → sellers → has-contact → older createdAt → id), re-points all 12 FK references onto primary (Call, Task, WorkflowExecution, ContactSuggestion, PropertyMilestone, DealBlast, OutreachLog, AuditLog + composite-PK joins via createMany skipDuplicates), column-merges any field where primary is empty, then deletes the secondary. Each group wrapped in a 60s tx with audit row. Default DRY-RUN. Ran live: 62 secondaries merged into 60 primaries, E018 = 0.
- `link-unlinked-splits.ts` — Session 75: walks `cleanup.address_split` audit rows, picks the matching unlinked split-child for each split address, links `ghlContactId` to parent's, mirrors PropertySeller links. Idempotent. Re-run after any `cleanup-address-shapes --apply`.
- `backfill-split-stage-names.ts` — Session 75 (extended): copies `ghlAcqStageName` / `ghlDispoStageName` / `ghlLongtermStageName` + entered-at timestamps from each parent onto its split children (the original cleanup-address-shapes copied lane statuses but skipped stage names). Idempotent. Re-run after any `cleanup-address-shapes --apply`.
- `mark-no-number-rows-reviewed.ts` — Session 75 (close): write a `cleanup.address_reviewed` audit row for every Property whose address has no leading digit. Suppresses E002 from the auditor going forward. Re-run only if a fresh batch of no-number rows lands (each new row will surface in E002 until marked).
- `diagnose-missing-stage.ts` — Session 75 (extended): list every Property whose inventory data-quality "Missing Stage" tile would count it (effectiveStatus=NEW_LEAD AND no stage name on any lane, AND visible by default). Read-only.
- `diagnose-missing-street-numbers.ts` — Session 75: list every Property whose `address` doesn't start with a digit, bucketed by pattern (lot-only, PO box, street-name only, directional-prefix only, other). Read-only.
- `apply-street-number-research.ts` / `apply-final-triage-corrections.ts` / `apply-zip-mismatch-fixes.ts` — Session 75: one-shot owner-data-driven corrections. Applied during the 2026-05-07 cleanup. Embed the CSV / correction list directly in the source — re-runs are no-ops once data is in DB.
- `rollback-bad-county-rd-splits.ts` — Session 75 (extended): one-shot. Identified 49 over-splits caused by an early version of the space-jammed twin-street heuristic (shredded "X County Rd Y" addresses), restored each parent's address from the audit payload, deleted child rows + companion audits. Pattern: any `cleanup.address_split` audit whose `splits` payload has a fragment lacking a known street-suffix word (Rd, St, Ave, Dr, Ln, Blvd, Ct, Cir, Pl, Ter, Trl, Pike, Pkwy, Way, Loop, Hwy, Highway, Route, Rt, Rte, Sq, Cv, Aly, Xing, Path, Expy).
- `test-parser-edge-cases.ts` — Session 75: 16-case regression fixture for `lib/address-parse.ts`. Run before/after every parser change. Each case has a `label`, raw inputs, expected primary + splits.

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

43 migrations in `prisma/migrations/`. Last 16 (Sessions 38-60):

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
| 2026-04-30 | `20260430120000_v1_1_wave_1_seller_buyer_additive` | v1.1 Wave 1 — additive Seller/Buyer columns: name decomposition (firstName/middleName/lastName/nameSuffix) + skip-trace fallback identity (Seller +6, Buyer +5) + owner portfolio aggregates moved from Property staging (Seller +7) + Q3 person flags (seniorOwner / deceasedOwner / cashBuyerOwner) + PropertyBuyerStage.source. Property.ownerMailingVacant renamed to mailingAddressVacant. NO drops — those land in Wave 5 cutover. |
| 2026-04-30 | `20260430130000_v1_1_wave_4_property_buyer_stage_match_score` | v1.1 Wave 4 Q7 lock — `PropertyBuyerStage.matchScore (Float?)` + `matchScoreUpdatedAt (DateTime?)`. Per-property buyer fit score; replaces `Buyer.matchLikelihoodScore` (drops Wave 5). Live persistence in `app/api/properties/[propertyId]/buyers/route.ts` GET; backfill via `lib/v1_1/wave_4_backfill.ts:backfillBuyerMatchScores` (deleted Wave 5 alongside source-column drop). |
| 2026-05-01 | `20260501151510_v1_1_wave_5_property_strip` | **DESTRUCTIVE** — v1.1 Wave 5 cutover. Drops 24 columns + 2 indexes. Property: ownerPhone/Email/Type/ownershipLengthYears + secondOwner* + ownerFirstName1/2 + ownerLastName1/2 + ownerPortfolio* + ownerPortfolioJson + seniorOwner + deceasedOwner + cashBuyerOwner + manualBuyerIds + @@index([seniorOwner]) + @@index([deceasedOwner]). Buyer: matchLikelihoodScore. Pre-cutover snapshot: `pg_dump --no-owner --no-acl $DIRECT_URL` → 160 MB SQL file. Read-path migration shipped same commit (VendorIntelPanel → primarySeller; dual-write turn-off in lib/batchdata/enrich.ts). Post-cutover grep `property\.\(ownerPhone\|...\)` returned 0 hits. Q3 keeps absenteeOwner + absenteeOwnerInState + samePropertyMailing + mailingAddressVacant on Property. |
| 2026-05-04 | `20260504000000_add_agent_wholesaler` | **Session 67 Phase 1 — superseded ~1h later by the next migration.** Originally created 4 tables: `agents`, `wholesalers`, `property_agents`, `property_wholesalers`. Architectural pivot to unified Partner shape happened mid-session before any data was written; left in history because the migration was already deployed to production. |
| 2026-05-04 | `20260504010000_replace_agent_wholesaler_with_partner` | **Session 67 Phase 1 (final shape).** Drops the 4 empty tables from the prior migration (CASCADE — zero data loss because no UI / API ever wrote to them) and creates `partners` + `property_partners`. `Partner.types` is a JSON array allowing one row to carry multiple roles (agent + wholesaler + attorney etc.). `PropertyPartner.role` is a free string capturing the per-deal role. 2 indexes, 3 foreign keys. Plan: `~/.claude/plans/at-te-he-very-base-mellow-pixel.md`. |
| 2026-05-07 | `20260507185111_add_property_photos_and_documents` | **Session 76 — photos + documents feature.** Creates `property_photos` and `property_documents` tables, both cascade-delete from `properties`. PropertyPhoto carries `storage_path`, `filename`, `mime_type`, `size`, `category` (front/exterior/kitchen/bathroom/living/basement/other/uncategorized), `classification_status` (pending/done/failed), `sort_order`, plus tenant/property/uploadedBy FKs. PropertyDocument is the same shape minus the classification fields (flat list, no AI categorization). Storage backed by two new private Supabase buckets `property-photos` and `property-documents` auto-created on first upload via `lib/storage/property-assets.ts`. |
| 2026-05-07 | `20260507194052_add_property_photos_link` | **Session 76.** Adds `Property.photosLink` (text, nullable) — external folder URL (Google Drive / Dropbox / etc.) surfaced in the photos panel header for "see more photos elsewhere". |
| 2026-05-07 | `20260507204352_add_property_photo_starred` | **Session 76.** Adds `PropertyPhoto.is_starred` (boolean, default false). One starred "cover" photo per property; enforced server-side in `app/api/properties/[propertyId]/photos/[photoId]/route.ts` PATCH — single transaction unstars all siblings before starring the target. Starred photo sorts first in its category in the photos panel grid. |
| 2026-05-07 | `20260507220000_session_77_disposition_journey` | **Session 77 — Disposition Journey rewrite (Waves 1-3).** Creates `property_comps` table (manual buyer comps shown in Data tab Property Assessment area; feeds the Section 2 listing-site generator). Adds `properties.dispo_artifacts` (JSONB) for generated description/listing/social posts — read-write via `app/api/properties/[propertyId]/dispo-generate/route.ts`. Adds `properties.dispo_asking_price` (Decimal) — investor-facing asking shown in Section 2's "Asking" card, distinct from the seller's `askingPrice` on Overview. Adds `tenants.disposition_funding_link` (String, default `https://franchise.newagainhouses.com/`) — closing-block URL appended to all 3 dispo artifacts; per-tenant override in Settings → Inventory tab. |

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

### Cron heartbeat liveness — universal query

After Session 74 (Bug #23 close), every cron writes the same shape of audit
rows. Single query covers all of them:

```sql
-- ADMIN: tenant-spanning. Heartbeat audit rows are written with tenantId=NULL.
SELECT
  split_part(action, '.', 2) AS cron_name,
  split_part(action, '.', 3) AS phase,
  COUNT(*)::int AS count,
  MAX(created_at) AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS seconds_since
FROM audit_logs
WHERE action LIKE 'cron.%'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2
ORDER BY 1, 2;
```

`phase` is `started` / `finished` / `failed`.

Steady-state expectations per cron (matches `railway.toml`):

| `cron_name` | `started` cadence |
|---|---|
| `process_recording_jobs` | every 60s |
| `poll_calls` | every 60s |
| `enrich_pending` | every 5 min |
| `compute_aggregates` / `reconcile_ghl_pipelines` | once daily 4am UTC |
| `daily_kpi_snapshot` | once daily 0am UTC |
| `daily_audit` | once daily 2am UTC |
| `regenerate_stories` | once daily 7am UTC |
| `weekly_profiles` | once weekly Sun 3am UTC |

Diagnosis:

| Symptom | Reading |
|---|---|
| `started` count > expected `finished` count | Worker crashing mid-run — search `audit_logs WHERE severity='ERROR' AND action LIKE 'cron.<name>.failed'` |
| `started` row missing entirely past expected window | Cron not firing — Railway scheduler issue |
| Most-recent `last_seen` older than the cadence | Worker stalled — investigate |

---

## Address-parser ingest discipline (Session 75)

Every code path that writes `Property.{address, city, state, zip}` from a
GHL contact MUST go through `parsePropertyAddress` in `lib/address-parse.ts`.
Calling `standardizeStreet/City/State/Zip` independently on raw GHL fields
**will** silently leak Pattern A (zip embedded in `address1`), Pattern B
(no zip anywhere → `marketId=NULL`), and Pattern C (multi-property `&`
joins) into the DB.

Canonical callers (verified 2026-05-07):

  - `lib/properties.ts` `createPropertyFromContact` — primary live ingest
    (OpportunityCreate webhook). Multi-property splits recursively spawn
    sibling rows via the `_overrideClean` context field.
  - `lib/ghl/webhooks.ts` `handleContactChange` — ContactUpdate webhook.
    Calls `splitCombinedAddressIfNeeded` post-update for any `&` shape
    that arrived in the new address.
  - `lib/properties.ts` `splitCombinedAddressIfNeeded` — uses the
    parser's N-way `splitStreets` (NOT the legacy `matchCombinedAddress`
    regex, which only handled 2-property same-street cases).
  - `scripts/enrich-pending.ts` Phase 3 catch-up — fills in stub rows
    that were created by `reconcile-ghl-pipelines` reconciliation.
  - `scripts/cleanup-address-shapes.ts` — one-shot cleanup for any
    historical drift.

If a future ingest path is added, add it to this list AND wire it
through the parser in the same commit.

Verification query — should return 0 rows:

```sql
SELECT COUNT(*) FROM properties WHERE market_id IS NULL;
```

(Tier 3 of `resolveMarketForZip` lazily creates a "Global" market for
zips that don't match any tenant market or config bucket — so a NULL
result means the zip itself is missing, which is what the parser is
supposed to prevent.)

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
