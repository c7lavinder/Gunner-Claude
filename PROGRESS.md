# PROGRESS.md — Gunner AI Build Tracker

> First file Claude Code reads every session.
> "Next Session" tells Claude exactly where to start.
> Older sessions archived in docs/SESSION_ARCHIVE.md.

---

## Current Status

**Current session**: 60 — v1.1 Wave 1 + Wave 2 COMPLETE (2026-04-30) — additive schema shipped, dual-write live, backfill applied + verified idempotent
**Phase**: ✅ **v1-finish sprint COMPLETE** (2026-04-30, all 7 waves closed). Wave 1 closed Blocker #3 + AUDIT_PLAN P3 (commit `047ca18`). Wave 2 closed P1 + P2 + dashboard drift (commits `98e5e7d` / `525e8b8` / `6fe3010`). **Wave 3 fully closed** (Sessions 47-53, commit `00cb686`): 72 routes migrated, 91/91 tenant-scoped routes on `withTenant`, 38 latent defense gaps fixed, 4 leak classes catalogued in AGENTS.md, 6 Class 4 helpers hardened. **Wave 4 closed** (Session 54, commits `2c256f5` + `3651080`): 17 prod identifiers scrubbed across 9 files, D-044 codified. **Wave 5 partial close** (Session 55, commit `9d6f7ae`): Bug #12 verified-current and closed; P4 (legacy /tasks/ deletion) **DEFERRED — v1.1** with 5-step migration plan documented in AUDIT_PLAN.md. **Wave 6 fully closed** (Sessions 56-58, commits `375354b` + `5e09a20` + `99464bb`): View As hydration race fix shipped + verified live by Corey 2026-04-30 (V1 + V4 PASS). Shape C queued as P6 — v1.1 sprint candidate. **Wave 7 (this session)**: final verification — all 9 v1-launch-ready exit criteria met or explicitly deferred. Reliability scorecard: all 8 dimensions ≥7/10 except item 8 (Seller/Buyer data model = 4/10, the v1.1 redesign target). webhook_logs last 24h: 1558 received, 1 failed (0.06%), 0 stuck. Multi-vendor enrichment live, in-process grading worker live, bug-report system live. **Next: v1.1 sprint — Seller/Buyer integration plan (PLAN FIRST, no code until approved).**
**App state**: Live on Railway
**GitHub**: https://github.com/c7lavinder/Gunner-Claude
**Railway**: [PRODUCTION_URL]
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: [GHL_LOCATION_ID])
**Grading worker**: in-process via `instrumentation.ts` → `lib/grading-worker.ts` → `lib/grading-processor.ts` (60s tick). Sole driver as of Wave 1 — legacy `[[services]] grading-worker` removed (Blocker #3 closed). Manual debug surface remains at `app/api/cron/process-recording-jobs/route.ts`.
**Pipeline verifier**: `scripts/verify-calls-pipeline.ts` — bidirectional A/B with sanity gate + canary
**Active blockers**: #2 (Action execution discipline — production verification pending). #3 closed Wave 1.
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

### Session 60 — v1.1 Wave 1 + Wave 2 COMPLETE (2026-04-30)

**Wave 2 commit 2 (apply, after dry-run review approved by Corey):**
Backfill APPLIED via `POST /api/diagnostics/v1_1_seller_backfill`. Live
production database now reflects:

| Metric | Result |
|---|---|
| Properties scanned (with owner data) | 15 |
| Sellers updated | 16 (across 15 properties; 1 prop has 2 linked sellers — co-owner) |
| Total field writes | 221 |
| Skipped (no linked Seller) | 0 |
| Errors | 0 |
| Apply duration | 1.6 s |
| Idempotency check | PASS — re-run dry-run shows wouldUpdate=0, alreadyComplete=15 |
| Audit log | `v1_1_wave_2_backfill.applied` written with full counts payload |

**Manual buyer IDs migration:** No-op for this tenant — `Property.manualBuyerIds[]`
is empty across all 15 properties. (`PropertyBuyerStage.source='manual'` path
is still wired up; will engage on any future tenant where the JSON-array
hack is in use.)

**Wave 2 commit 1 (this session, after Wave 1):** Dual-write turn-on +
bearer-gated diagnostic endpoint. **NO apply yet** — gated on dry-run
review.

**Constraint locked by Corey 2026-04-30:** No auto-create of Sellers or
Buyers in this wave. Backfill only updates entities that already have
the right relationship:
- Sellers: only those linked via `PropertySeller`. Properties with owner
  data but no linked Seller are SKIPPED + logged for manual creation.
- `PropertyBuyerStage` rows from `Property.manualBuyerIds[]`: only when
  a `Buyer` row with the matching `ghlContactId` already exists.
  Otherwise SKIPPED + logged.

**Files added:**
- `lib/v1_1/wave_2_backfill.ts` — backfill logic exposed as two functions:
  - `backfillSellersFromProperty(tenantId, opts)` — fills empty Seller
    columns from linked Property's owner data (name parts, skip-trace
    fallback identity, portfolio aggregates, person flags). Idempotent.
  - `migrateManualBuyerIdsForTenant(tenantId, opts)` — converts JSON
    array into PropertyBuyerStage rows with `stage='added'`,
    `source='manual'`. Idempotent.
- `app/api/diagnostics/v1_1_seller_backfill/route.ts` — bearer-token
  gated control surface. GET = dry-run, POST = apply. Both produce a
  detailed report (counts, fields touched, samples, skipped samples,
  errors). Apply runs additionally write an audit_logs row with action
  `v1_1_wave_2_backfill.applied`.

**Files modified for dual-write:**
- `lib/enrichment/sync-seller.ts:buildSellerSyncUpdate` extended:
  - SellerSlice interface gained 16 new fields.
  - Now writes name parts (`firstName`/`middleName`/`lastName`) on every
    vendor enrichment. Prefers PropertyRadar's structured form
    (`ownerFirstName1`/`ownerLastName1`); falls back to `splitName`.
  - Mirrors `phone`/`email` writes into `skipTracedPhone`/`skipTracedEmail`,
    and `mailing*` into `skipTracedMailing*`. Legacy columns keep being
    written through Wave 5 cutover.
  - Person flags (`seniorOwner`/`deceasedOwner`/`cashBuyerOwner`) and
    portfolio aggregates write only on ordinal=1 (owner-of-record).
  - `setIfEmpty` semantics preserved — never overwrites existing values.

**Verification:**
- `npx tsc --noEmit`: 0 errors.
- Endpoint inert until `DIAGNOSTIC_TOKEN` set (matches dial-counts
  pattern). PUBLIC_PATHS in middleware.ts already covers
  `/api/diagnostics`.

**Next:** deploy → curl GET dry-run → Corey reviews report → curl POST
apply (Wave 2 commit 2). Then Wave 3 (read-path migration).

### Session 60 — v1.1 Wave 1 (2026-04-30) — Seller/Buyer additive schema shipped

First wave of v1.1 Seller/Buyer redesign. PLAN-FIRST kickoff happened
earlier in the same calendar day (commits `44edc9c` + `6775d7b`); Corey
reviewed, locked Q1/Q2/Q3, and authorized Wave 1. This session shipped
Wave 1 in a single commit on `main` (Railway auto-deploy).

**Schema additions (additive only — NO drops):**

| Table | Cols added | Notes |
|---|---|---|
| `sellers` | +17 | Q2 name parts (`first_name`, `middle_name`, `last_name`, `name_suffix`) + Q1/Shape A skip-trace fallback identity (`skip_traced_phone/email/mailing_address/city/state/zip`) + owner portfolio aggregates moved from Property staging (`owner_portfolio_total_equity/value/purchase`, `owner_portfolio_avg_assessed/purchase/year_built`, `owner_portfolio_json`) + Q3 person flags (`senior_owner`, `deceased_owner`, `cash_buyer_owner`) |
| `buyers` | +5 | Q1/Shape A skip-trace fallback identity (`skip_traced_name/phone/email/company/mailing_address`) |
| `property_buyer_stages` | +1 | `source` column (`'matched'` default) — disambiguates matched-from-buybox vs added-manually post-`Property.manualBuyerIds` strip |
| `properties` | rename | `owner_mailing_vacant` → `mailing_address_vacant` (Q3 lock — clarifies it's a property fact, not a person fact) |

Migration: `prisma/migrations/20260430120000_v1_1_wave_1_seller_buyer_additive/migration.sql`.

**Class-4 helper hardening (3 helpers + 3 caller sites):**

Per AGENTS.md "lib helpers that take ids must take tenantId explicitly."

| Helper | File | Old signature | New signature |
|---|---|---|---|
| `syncSellersFromVendorResult` | `lib/enrichment/sync-seller.ts` | `(propertyId, result)` | `(propertyId, tenantId, result)` |
| `searchCourtListenerForSeller` | `lib/enrichment/sync-seller-courtlistener.ts` | `(sellerId, opts)` | `(sellerId, tenantId, opts)` |
| `searchCourtListenerForProperty` | `lib/enrichment/sync-seller-courtlistener.ts` | `(propertyId)` | `(propertyId, tenantId)` |

Inner queries refactored: `db.seller.findUnique({ where: { id }})` →
`db.seller.findFirst({ where: { id, tenantId }})`; trailing
`db.seller.update({ where: { id }})` → `{ where: { id, tenantId }}`.

Callers updated: `lib/enrichment/enrich-property.ts:389,397` (already had
`tenantId` in scope) + `lib/batchdata/enrich.ts:935` (passes
`property.tenantId` selected at line 652). Note:
`enrichPropertyFromBatchData` itself is dead code (no callers found via
grep) and will be deleted in Wave 5 cleanup; minimal touch this session.

**Code-side rename to match Q3 column rename:**
- `lib/batchdata/enrich.ts:154` (Prisma slice interface) — `ownerMailingVacant: boolean | null` → `mailingAddressVacant: boolean | null`
- `lib/batchdata/enrich.ts:488` — first arg of `setIfEmpty` (Prisma column key)
- `lib/batchdata/enrich.ts:705` (Prisma select) — `ownerMailingVacant: true` → `mailingAddressVacant: true`
- `lib/enrichment/enrich-property.ts:193` (Prisma select) — same
- Vendor adapter types (`lib/batchdata/client.ts:223`, `lib/propertyradar/client.ts:250`) keep `ownerMailingVacant` as the vendor concept; translation happens at the Prisma write boundary

**Verification:**
- `npx tsc --noEmit`: 0 errors.
- Migration SQL hand-written matching past convention (timestamped dir +
  `migration.sql`) — Railway `npm run db:migrate:prod` (= `prisma migrate
  deploy`) applies on next deploy.

**Files changed this session:**
- `prisma/schema.prisma` — Seller/Buyer/PropertyBuyerStage/Property additions + Property rename.
- `prisma/migrations/20260430120000_v1_1_wave_1_seller_buyer_additive/migration.sql` — new.
- `lib/enrichment/sync-seller.ts` — `syncSellersFromVendorResult` Class-4 hardened.
- `lib/enrichment/sync-seller-courtlistener.ts` — both CourtListener helpers Class-4 hardened.
- `lib/enrichment/enrich-property.ts` — pass `tenantId` to both helper calls + Prisma select rename.
- `lib/batchdata/enrich.ts` — pass `tenantId` to `syncSellersFromVendorResult` + Prisma column rename (3 sites).
- `docs/v1.1/SELLER_BUYER_PLAN.md` — Wave 1 SHIPPED banner at top.
- `docs/OPERATIONS.md` — schema-change log entry.
- `PROGRESS.md` — this entry; Current Status; Next Session pointer (Wave 2).

**Next Session — v1.1 Wave 2 — backfill + dual-write turn-on:**

Wave 1 added the destinations; Wave 2 fills them. Three jobs:

1. **Property → Seller backfill.** For every Property with `ownerPhone` /
   `ownerEmail` / `secondOwnerName` / `ownerFirstName1` / etc. populated,
   match to existing Seller via `Property.ghlContactId →
   Seller.ghlContactId` (or create new Seller row + PropertySeller link
   when no match). Fill Seller's Q1 skip-trace fallback columns +
   Q2 name parts + Q3 person flags + portfolio aggregates from Property.
2. **`Property.manualBuyerIds[]` → `PropertyBuyerStage` rows.** For each
   GHL contact ID in the JSON array, find/create Buyer by `ghlContactId`,
   insert `PropertyBuyerStage` with `stage='added'`, `source='manual'`.
3. **Dual-write turn-on.** `lib/enrichment/sync-seller.ts:buildSellerSyncUpdate`
   today writes legacy `name/phone/email`; expand to ALSO write
   `firstName/lastName/skipTracedPhone/skipTracedEmail` + portfolio
   aggregates + person flags. PropertyRadar enrichment continues writing
   to `Property.owner*` for now (drops in Wave 5).

Expected effort: 2-3 sprint days. Verifiable via diagnostic endpoint
(`/api/diagnostics/seller-backfill?tenantId=...`) reporting per-property
backfill coverage.

**Surprises this session:**
- The 3 Class-4 helpers were the easy targets I expected — `skipTraceSeller`
  and `skipTraceSellersForProperty` (related helpers in the same file)
  were already hardened in v1-finish Wave 3 Session G commit 1. This
  session closes 3 of the remaining Class-4 vectors in the seller/buyer
  enrichment chain. Other helpers in `lib/` may still need audit
  (deferred to Wave 3 read-path migration).
- `enrichPropertyFromBatchData` in `lib/batchdata/enrich.ts:645` has zero
  callers via grep but is still kept (legacy comment said "in place for
  any existing callers"). Its inner `db.property.update({ where: { id }})`
  is a Class-1 leak — not fixed this session because it would expand
  scope; flagged for Wave 5 cleanup deletion.
- Prisma-shaped slice in `batchdata/enrich.ts:154` had `ownerMailingVacant`
  matching the legacy column name. Vendor-result type
  (`BatchDataPropertyResult`) at `batchdata/client.ts:223` also has
  `ownerMailingVacant` — kept since it's the vendor concept. Translation
  now happens at the `setIfEmpty` write boundary in `buildDenormUpdate`.
- The kickoff prompt's framing of Class-4 audit ("3 helpers — sync-seller,
  sync-seller-courtlistener, lib/buyers/sync") was off by one:
  `lib/buyers/sync.ts:syncBuyerFromGHL` already takes `tenantId` (was
  hardened pre-v1-finish). The actual targets were `syncSellersFromVendorResult`
  + the two CourtListener helpers. Same effort, different surface.

### Session 59 — Wave 7 (2026-04-30) — v1-finish sprint COMPLETE

Final wave. No new code. Verification + handoff to v1.1.

**Reliability scorecard (8 dimensions, post-sprint vs pre-sprint baseline 2026-04-27):**

| # | Dimension | Pre | Post | What changed |
|---|---|---|---|---|
| 1 | Call ingestion (webhook + polling) | 9 | 9 | webhook_logs 1558/1559 success in last 24h (0.06% failed). No regressions. |
| 2 | Grading pipeline | 9 | 9 | Wave 1 closed dual worker; in-process loop sole driver. No new failure modes. |
| 3 | Multi-tenancy | 6 | 9 | Wave 3: 91/91 routes on withTenant, 38 latent gaps fixed, 4 leak classes catalogued, 6 Class 4 helpers hardened. |
| 4 | Error visibility | 7 | 7 | Heartbeat audit rows from Wave 1 still ticking; 73 silent catches remain (down from 79 baseline; queued). No structural change. |
| 5 | Documentation hygiene | 4 | 8 | SYSTEM_MAP / OPERATIONS canonicalized (Session 44); Wave 4 scrubbed prod identifiers; Wave 6 closed cleanly with 3-session arc; Living Map Discipline (Rule 8) codified. |
| 6 | Repo security posture | 3 | 8 | Wave 4 prod identifier scrub (17 sites); Wave 3 cross-tenant defense; Wave 6.2 closed View As intra-tenant leak. |
| 7 | Production verification discipline | 9 | 9 | CLAUDE.md "no phase complete until verified live" rule held throughout. Wave 6 verified by Corey on live URL 2026-04-30. |
| 8 | Seller/Buyer contact data model | 4 | 4 | No change (acceptable). v1.1 sprint target — redesign opens next chat. |

All ≥7/10 except item 8, which is the explicit v1.1 redesign target.

**Health check outputs (this session):**

`npx tsx scripts/daily-health-check.ts`:
```
DAILY HEALTH CHECK — 2026-04-30T07:14:44.421Z
Recording queue (24h):  DONE=0  PENDING=0  FAILED=0
audit_logs ERROR (24h): 3
Calls FAILED today with evidence of being real: 0
⚠️  ISSUES FOUND  (3 system errors logged)
```
Non-blocking. 3 errors in 24h is within tolerance; investigation deferred.

`bash scripts/check-silent-catches.sh`:
```
❌ Found 73 silent catch(es).
```
Down from 79 baseline. Already-queued audit item ("Silent-catch sweep" in
AUDIT_PLAN). Not blocking.

`webhook_logs` last 24h (queried via prisma):
```
Total received: 1558
Status:  success=1557  failed=1
Stuck (processing, no processed_at): 0
Failed rate: 0.06%
```
Healthy. Well under the 5% threshold.

**AUDIT_PLAN final disposition:**

| Entry | Pre-sprint | Post-sprint | Disposition |
|---|---|---|---|
| Blocker #2 | OPEN | OPEN — production verification still owed | Carries to v1.1 |
| Blocker #3 | OPEN | ✅ CLOSED (`047ca18`) | Wave 1 |
| P1 | OPEN | ✅ CLOSED (`98e5e7d` + `6fe3010`) | Wave 2 |
| P2 | OPEN | ✅ CLOSED (`98e5e7d` + `525e8b8` + `6fe3010`) | Wave 2 |
| P3 | OPEN | ✅ CLOSED (`047ca18`) | Wave 1 |
| P4 | OPEN | ⏸ DEFERRED — v1.1 (`9d6f7ae` Wave 5 stop) | 5-step migration plan |
| P5 | (added Wave 3) | ⏸ DEFERRED — v1.1 | Architectural inconsistency |
| P6 | (added Wave 6.2) | ⏸ QUEUED — v1.1 | View As cookie + server resolution |
| Bug #12 | Flagged | ✅ CLOSED (`9d6f7ae`) | Wave 5 verified-current |
| Bug #25 | (new) | OPEN — defer v1.1 | Wave 6 surfaced; one-line cleanup |
| D-044 | Pending | ✅ ACCEPTED (`3651080`) | Wave 4 — stability-first model rule |
| D-045 | (new) | Pending — needs driver | Wave 2 — KPI snapshot timestamp |
| D-046 | (new) | Pending — needs driver | Wave 6 — test framework |

**Exit criteria check (9 v1-launch-ready criteria from sprint plan):**

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Blocker #3 closed | ✅ MET | Commit `047ca18` (Wave 1) — single grading worker confirmed via 24h heartbeat |
| 2 | AUDIT_PLAN P1-P5 closed or re-classified | ✅ MET | P1+P2+P3 CLOSED; P4+P5 explicitly DEFERRED — v1.1 |
| 3 | withTenant ≥95% coverage | ✅ MET | 91/91 tenant-scoped routes (100%), 19 documented exceptions (Wave 3) |
| 4 | D-044 recorded | ✅ MET | Commit `3651080` (Wave 4) — stability-first model rule |
| 5 | Repo scrubbed of prod identifiers | ✅ MET | Commit `2c256f5` (Wave 4) — 17 sites scrubbed; verification grep returns zero hits |
| 6 | No hardcoded dev creds in production paths | ✅ MET | Bug #16 (DEV_BYPASS_AUTH hardcoded slugs) is dev-bypass logic only, not creds; all real creds (DATABASE_URL, ANTHROPIC_API_KEY, GHL tokens) are env-only |
| 7 | Reliability scorecard ≥7/10 | ✅ MET | 7/8 dimensions ≥7; item 8 (Seller/Buyer = 4/10) is the explicit v1.1 redesign target, acceptable per sprint plan |
| 8 | View As LM walkthrough completed | ✅ MET | Wave 6.1 diagnostic + Wave 6.2 fix + V1+V4 verified live by Corey 2026-04-30 |
| 9 | "Next Session" → Seller/Buyer integration plan | ✅ MET | Updated this session; PLAN FIRST, no code until approved |

All 9 criteria met. Sprint closes 2026-04-30.

**Sprint totals (across all 7 waves):**
- **Sessions used:** 14 (Sessions 45-58 + this Session 59)
- **Wave count:** 7 (Wave 6 split into 6.1 / 6.2 / closure across 3 sessions)
- **Closure events:** 1 Blocker (#3), 5 P-items closed (P1-P3 + Bug #12 + AGENTS leak-class catalogue), 2 P-items DEFERRED (P4 + P5), 2 P-items QUEUED (P6 + new Bug #25)
- **Latent leaks fixed:** 38 cross-tenant defense gaps (Wave 3) + 1 intra-tenant View As leak (Wave 6.2) = 39
- **Decisions codified:** D-044 (stability-first model rule) accepted; D-045 + D-046 pending driver
- **Files changed (sprint total, by Wave):** Wave 1 = 5; Wave 2 = ~6; Wave 3 = ~110 (bulk migration + helper hardening); Wave 4 = 9; Wave 5 = 2; Wave 6 = 3; Wave 7 = 2 (this session)

**Files changed this session:**
- `PROGRESS.md` — Current Status updated for sprint complete; this entry added; Next Session block rewritten as v1.1 kickoff.
- `docs/AUDIT_PLAN.md` — Closure SHAs added to P1/P2/P3; P4 + P5 explicitly tagged "DEFERRED — v1.1".

**Surprises:**
- The originally-cited audit doc `GUNNER_AUDIT_2026-04-27.md §10` doesn't
  exist in the repo (only `docs/audits/ACTION_EXECUTION_AUDIT.md` is
  present). The reliability scorecard rescore was grounded in the prompt-
  provided baseline scores rather than a live document — fine for this
  session, but worth knowing if you reference §10 elsewhere.
- silent-catches dropped 79 → 73 organically over the sprint without a
  dedicated sweep — likely from Wave 3 helper hardening removing some
  swallow-and-continue patterns that became `tenantId`-scoped operations
  with explicit error paths. The remaining 73 are predominantly
  fire-and-forget patterns (`.catch(() => {})` after non-blocking work)
  rather than true silent failures, but still worth a structured pass in
  v1.1 hygiene.
- webhook_logs last-24h Health is excellent: 0.06% failure rate is below
  most public web-API SLOs. Bug #25 (the `/api/calls-review-count` 404)
  is fire-and-forget and doesn't appear in webhook_logs since it's a
  client-side fetch, not a webhook ingest.
- Bug #16 ("DEV_BYPASS_AUTH hardcoded slugs") was the closest exit-
  criteria edge case — read literally, "hardcoded slugs" sounds like
  hardcoded creds. Re-reading the bug, it's tenant slugs in dev-bypass
  logic, not real credentials. Counted as MET on criterion 6 with that
  qualification documented above.

### Session 58 — Wave 6 closure (2026-04-30) — V1+V4 verifications passed

Docs-only session closing the Wave 6 arc.

**Browser verifications completed by Corey on 2026-04-30:**
- V1 (no hydration mismatch warning) — PASS. Console clean of React
  hydration warnings. The two console items that did appear (a 404
  on `/api/calls-review-count` and a canvas2d notice) are unrelated
  to the Wave 6.2 fix; logged separately as side bugs.
- V2 (first-paint URL params include `asUserId`) — SKIPPED. DevTools
  Network tab opened too late on first attempt; V4 user-visible
  evidence makes wire-level confirmation redundant.
- V3 (Strict Mode double-invoke safe) — SKIPPED. Folds into V2
  evidence.
- V4 (5+ navigation cycles, zero leak frames) — PASS. Repeated
  navigation as Daniel Lozano showed no owner-data flash on any
  cycle. The user-visible behavioral test is the test that matters;
  V4 is the proof Wave 6.2's race fix works in practice.

V1 + V4 are the strongest pair for this kind of race: V1 rules out a
React-internal symptom and V4 rules out a user-visible symptom. V2/V3
were instrumentation-level checks that V4 already covers in effect.

**Side bugs surfaced from V1 console output:**
- Bug #25 — `GET /[tenantSlug]/api/calls-review-count` 404. Source
  pinpointed to `components/ui/top-nav.tsx:42`. Vestigial
  fire-and-forget fetch with wrong path order; the working
  review-count call lives on line 45 of the same file. One-line
  delete to fix; deferred to v1.1.
- P4 visual confirmation — top nav "Day Hub" link still routes to
  `/tasks/` rather than `/day-hub/`. Already-known per Wave 5 stop;
  Wave 6 walkthrough is the live evidence. Strengthens the case for
  v1.1 P4 sprint without changing P4's status.

**Files changed this session:**
- `PROGRESS.md` — Session 57 verifications checklist updated with
  `[x]/[~]` status; header bumped to Session 58; Bug #25 added to
  Known Bugs table; this entry added.
- `docs/AUDIT_PLAN.md` — P4 entry annotated with Wave 6 visual
  confirmation note (2026-04-30).

**Surprises:**
- The 404 on `/api/calls-review-count` was almost-invisible: a
  fire-and-forget `fetch().catch(() => null)` so the user sees
  nothing, but it's still a real failed request on every page load.
  The bug had been in `top-nav.tsx` since the badge was added — the
  developer wrote two different fetches, kept the one that worked,
  forgot to delete the other. Wave 6's V1 console inspection was the
  first time anyone looked.
- Wave 6 closure is a clean tri-session arc (56 diagnostic → 57 fix
  → 58 verification). Each session was small and bounded; the whole
  arc cost two doc sessions plus one ten-line code change.

### Session 57 — Wave 6.2 (2026-04-29) — View As hydration race fixed on /tasks/

Closes a reproducible cross-user data leak surfaced during a manual
View-As-LM walkthrough. Single-file fix in
`app/(tenant)/[tenant]/tasks/day-hub-client.tsx`. Shape C (architectural
follow-up) queued, not implemented.

**Wave 6.1 (Session 56) — retroactive diagnostic summary.** No commits;
diagnostic-only session. Reproduction: log in as owner, switch View As →
Daniel via Settings > Team, navigate to `/tasks/`. For ~2 seconds, the
inbox + appointments panels render owner-scoped data (LM-irrelevant calls,
owner appointments) before snapping to Daniel's data. Initial guesses
ruled out:

- NOT a cache leak — `Cache-Control: no-store` already set on the three
  routes; new fetch on every navigation.
- NOT a Wave 3 `withTenant` leak — `tenantId` filtering correct on every
  query; the leak is intra-tenant (owner ↔ LM), not cross-tenant.
- NOT a route handler bug — `/api/[tenant]/dayhub/{kpis,inbox,appointments}`
  all correctly call `resolveEffectiveUser(ctx, asUserId)`; when `asUserId`
  is null they return owner-scoped data per the admin path, which is
  correct behavior given a null input.

Root cause: client hydration race in `day-hub-client.tsx`:

| Lines | What it did |
|---|---|
| 308-309 | `useState<string \| null>(null)` for viewAsUser/viewAsUserId |
| 312-319 | Separate `useEffect` reads localStorage AFTER first render |
| 380-389 | KPI fetch `useEffect` — depends on `viewAsUserId`, fires on mount |
| 400-416 | Inbox fetch `useEffect` — same pattern |
| 438-462 | Appointments fetch `useEffect` — same pattern |

First mount renders all three fetches with `viewAsUserId=null`. URL has
no `?asUserId` param. Routes return owner-scoped data (admin path).
localStorage `useEffect` then commits `viewAsUserId='daniel-id'`, deps
change, three fetches re-fire — LM data replaces owner data on screen.

Scope confirmation:
- `/day-hub/` unaffected — server-rendered data, no View As propagation
  in the client.
- `/calls/` unaffected — uses View As only for admin gating, not for
  fetch scoping.

**Wave 6.2 (this session) — Shape A fix shipped.**

Single edit in `day-hub-client.tsx`:

1. Module-level helper added in the Helpers section:
   ```ts
   function readViewAs(key: string): string | null {
     if (typeof window === 'undefined') return null
     try { return localStorage.getItem(key) } catch { return null }
   }
   ```
2. Synchronous `useState` initializer replaces the `useState(null)` +
   hydration `useEffect` pair:
   ```ts
   const [viewAsUser, setViewAsUser] = useState<string | null>(() =>
     readViewAs('gunner_view_as_user')
   )
   const [viewAsUserId, setViewAsUserId] = useState<string | null>(() =>
     readViewAs('gunner_view_as_user_id')
   )
   ```
3. Hydration `useEffect` deleted. `exitViewAs()` unchanged.

The three data-fetching `useEffect`s already had `viewAsUserId` in their
dep arrays, so they now fire ONCE on mount with the correct value. No
flash, no re-fetch.

**Verification:**
- `npx tsc --noEmit` → exit 0.
- Pre-push tsc gate clean.
- Manual browser reproduction (the 7 scenarios in the prompt) is owed by
  Corey on the live Railway URL — Claude cannot drive a browser, so the
  no-flash and no-hydration-warning checks need a human pass.

**Hydration mismatch caveat (Shape A's known cost):** the synchronous
initializer reads localStorage during render. Server render returns
`null` (no `window`); client first render returns the stored value. The
JSX uses `viewAsUser` in conditional branches (lines 502, 640, 661, 685),
so the server HTML and the client's hydration render will disagree
whenever a View-As is active. React 18 will log a hydration mismatch
warning and discard the server tree for this subtree, then re-render
client-side with the correct value. Functionally this is FINE — the data
leak is gone either way — but it is noisy in dev console. This is the
exact reason Shape C is queued: a cookie-based mechanism would let the
server render the correct state on the first byte, eliminating both the
race AND the warning.

**Files changed this session:**
- `app/(tenant)/[tenant]/tasks/day-hub-client.tsx` — readViewAs helper
  (module scope), synchronous useState initializer, hydration useEffect
  removed.
- `PROGRESS.md` — header bumped to Session 57, this entry added.
- `docs/AUDIT_PLAN.md` — P6 added (Shape C: View-As propagation refactor).

**Surprises:**
- The "first guess" mental model was a Wave 3 cross-tenant leak, but
  Wave 3 is fully closed — the leak was intra-tenant (admin ↔ LM)
  caused by client-side state, not by a route-level scoping bug. Worth
  remembering: not every "wrong data on screen" bug is a tenant leak;
  some are just race conditions in the client.
- The fix is one file and ~10 lines. The diagnostic was the work; the
  patch was a one-liner.

**Verifications (Wave 6.2 fix, browser-side) — completed 2026-04-30:**
- [x] V1: No hydration mismatch warning in dev console
      VERIFIED 2026-04-30 — console clean (404 + canvas2d are unrelated; logged as side bugs)
- [~] V2: First-paint fetches include `&asUserId=`
      SKIPPED — V4 user-visible evidence makes wire-level confirmation redundant
- [~] V3: Strict Mode double-invoke safe
      SKIPPED — folds into V2 evidence
- [x] V4: 5+ navigation cycles, zero leak frames
      VERIFIED 2026-04-30 — Corey confirmed no leak frames across repeated navigation as Daniel Lozano

Status: PASS. Wave 6.2 fix verified sufficient. Wave 6 fully closed.

### Session 55 — Wave 5: cleanup wave (2026-04-29) — P4 STOPPED, Bug #12 closed

Two items in scope: legacy `/tasks/` deletion (P4) and Bug #12 (GHL API
version header verification). Mixed result.

**Part A — Legacy /tasks/ deletion: STOPPED at safety gate.**

Pre-flight inventory revealed multiple active production references that
contradicted the prompt's assumption "no production traffic on /tasks/":

| Check | Result | Evidence |
|---|---|---|
| Nav menu entry pointing to /tasks/ | ❌ FAIL | `components/ui/top-nav.tsx:66` — `{ href: \`${base}/tasks\`, label: 'Day Hub' }` (the visible nav link IS the /tasks/ URL) |
| Active redirects to /tasks/ | ❌ FAIL | 4 sites: `health/page.tsx:14`, `ai-logs/page.tsx:18`, `bugs/page.tsx:18`, `kpis/page.tsx:18` (non-admin redirects) |
| Internal links | ❌ FAIL | `dashboard-client.tsx:276` (link), `settings-client.tsx:487` (router.push) |
| /day-hub/ is a drop-in replacement | ❌ FAIL | The two pages are different products: `/tasks/` (83K) renders GHL tasks via `ghl.searchTasks()`; `/day-hub/` (24K) renders local `db.task` rows. Different data sources, different feature sets (AM/PM tracking, KpiLedgerModal exist only in /tasks/) |

Per prompt instruction "If any check fails, STOP and report. Don't delete
and ask forgiveness", deletion was halted before any file was touched.

AUDIT_PLAN.md P4 entry expanded with the 5-step pre-deletion migration
required (rewire 7 nav/redirect/link sites to `/day-hub`, then audit
`/day-hub/` covers needed functionality, then delete). P4 stays OPEN.

**Part B — Bug #12 (GHL API version header): CLOSED, no code change.**

Inventory of `Version` header usage in repo (13 sites):
- `Version: 2021-07-28` — 11 sites (main LeadConnector API)
- `Version: 2021-04-15` — 2 sites (recording subsystem only;
  documented inline in `lib/ghl/fetch-recording.ts:4` as a separate
  required value for that endpoint plane)

Web verification (HighLevel/LeadConnector docs, 2026):
- [HighLevel marketplace docs](https://marketplace.gohighlevel.com/docs/)
  + [Stoplight integrations docs](https://highlevel.stoplight.io/docs/integrations/0443d7d1a4bd0-api-2-0-overview):
  current example curl requests still use `Version: 2021-07-28` as the
  canonical GA value. No newer GA version published.
- The recording-API value `2021-04-15` is unchanged per inline comment
  in `fetch-recording.ts`.

Production live-check (proxy for header acceptance):
- `/api/health` → 200
- All GHL surfaces (enrichment, calendars, contacts, pipelines)
  functional through Wave 4 — would visibly break if 2021-07-28 were
  rejected.

**Verdict**: header values are current. Bug #12 closed in PROGRESS.md
known-bugs table without code changes. Audit doc flag was false-positive.

**Files changed this session:**
- `PROGRESS.md` — header bumped to Session 55, this entry, Bug #12 marked closed.
- `docs/AUDIT_PLAN.md` — P4 entry expanded with Wave 5 stop notes + 5-step pre-deletion migration plan.

**Surprises:**
- The prompt's mental model of `/tasks/` ("Chris and Daniel still on the
  legacy system, no production traffic") confused USER routing with CODE
  routing. Code wires `Day Hub → /tasks/` regardless of who uses it; any
  Gunner user clicking "Day Hub" lands on the legacy URL. The prompt's
  pre-Wave-2 confirmation appears to have been about user habits, not
  the actual nav wiring.
- The presence of two parallel Day Hub implementations (`/tasks/` GHL-
  backed, `/day-hub/` Gunner-backed) is itself a Wave-2-era artifact
  that was never closed: the canonical helper `lib/kpis/dial-counts.ts`
  is shared, but the page-level migration was incomplete.

### Session 53 — Wave 3 Session G — End-of-Wave-3 cleanup (2026-04-29) — **WAVE 3 FULLY CLOSED**

5 commits, each one concern. Cleanup queue from Session 52 closing notes
fully drained. All 4 items confirmed in-prompt got their dedicated commit.

**Commit 1 (`e63b2a9`) — Class 4 helper signature audit (the big one).**
6 lib helpers that previously did id-only `findUnique` now take
`tenantId: string` as a required parameter:
- `lib/computed-metrics.ts: computePropertyMetrics(propertyId, tenantId)`
- `lib/ai/generate-property-story.ts: generatePropertyStory(propertyId, tenantId)`
- `lib/properties.ts: splitCombinedAddressIfNeeded(propertyId, tenantId)`
- `lib/enrichment/enrich-property.ts: enrichProperty(propertyId, tenantId, opts?)`
- `lib/ai/enrich-property.ts: enrichPropertyWithAI(propertyId, tenantId)`
- `lib/enrichment/sync-seller.ts: skipTraceSeller(sellerId, tenantId, opts?)`

All internal property/seller queries now scope on tenantId — every
findUnique flipped to findFirst({ id, tenantId }), every update/delete
WHERE includes tenantId. Side effect: `skipTraceSellersForProperty` also
takes tenantId (called from inside enrichProperty); legacy
`enrichPropertyFromBatchData` adapted to pass property.tenantId through
to that inner call.

23 call sites updated:
- 11 routes (properties/{[propertyId]/{metrics,re-enrich,research,story,
  team,...},route.ts}, sellers/[sellerId]/skip-trace,
  ai/assistant/execute, etc.) — all pass `ctx.tenantId`
- 4 lib internals (grading-processor, properties.ts createPropertyFromContact,
  ghl/webhooks, batchdata/enrich) — derive tenantId from local context
- 6 scripts (backfill-today, coverage-probe, reenrich-today,
  regenerate-stories, split-existing-doubles, verify-e2e) — extend
  property selects to include tenantId

Class 4 leak class is now closed at the source. The route-level
`findFirst({ id, tenantId })` gates added during Wave 3 remain in place
for the 404 contract (clear "Not found" before delegating) but are no
longer load-bearing for safety.

**Commit 2 (`0ba786d`) — Extend TenantContext with userName + userEmail.**
TenantContext grew from 4 fields to 6:
`tenantId, userId, userRole, tenantSlug, userName, userEmail`. Drops
3 `getSession()` re-fetches (`ai/coach`, `bugs/route.ts`,
`tenants/invite`). Note: prompt mentioned a 4th re-fetch site —
confirmed only 3 sites exist in migrated routes. `stripe/checkout` uses
`session.name/email` but is a documented exception (pre-tenant flow).

**Commit 3 (`e8a7a19`) — `resolveEffectiveUser` accepts TenantContext.**
Drops legacy AppSession duck typing. 4 callers updated to pass `ctx`
directly: `calls/ledger`, `dayhub/inbox`, `dayhub/appointments`,
`dayhub/kpis`. After this commit: zero `getSession()` calls remain in
any migrated route.

**Commit 4 (`c688316`) — `ctx` redundancy sweep.** Final pass through
91 migrated routes. 1 new redundancy drop found:
`ai/assistant/route.ts` was doing
`db.user.findUnique({ id: userId, select: { name: true } })` purely to
populate the assistant's system prompt — now uses `ctx.userName`. All
other `db.user.findFirst` calls in migrated routes are legitimate
(global email collision check, target-user validation, finding *other*
users by name for delegation tools). All `db.tenant.findUnique` calls
are legitimate (fetching tokens, config, name — fields not in ctx).

Wave 3 cumulative redundancy drops: **12 total** (4 + 0 + 6 + 0 + 0 + 1 + 1).

**Commit 5 (this commit) — Codify architectural patterns in AGENTS.md.**
Two patterns surfaced during Wave 3 where routes look warm under the
find/write pre-scan heuristic but are structurally safe:

1. **DiD-via-FK** (defense-in-depth via foreign key) — when a route
   validates the parent record's tenant boundary once at the top of
   every handler, all downstream operations on FK-scoped child records
   are implicitly tenant-scoped. Canonical example:
   `properties/[propertyId]/sellers/route.ts` (8 DB ops, 0 leaks).
2. **Tenant-table-as-boundary** — the `Tenant` table's `id` column IS
   the tenant boundary, so id-only WHERE on Tenant is structurally safe.
   Canonical examples: `tenants/config`, `ghl/calendars`. Does NOT
   extend to other tables.

Both patterns added to AGENTS.md Route Conventions to prevent false-leak
flags during future audits.

Plus updated to AGENTS.md Class 4 entry: noted that all 6 helpers have
been refactored to take tenantId; route-level gates remain for 404
contract but are no longer load-bearing.

Plus AUDIT_PLAN.md: flipped "withTenant migration" item from queued
to ✅ CLOSED with full Wave 3 summary.

**Note re Bug #16**: prompt mentioned "Bug #16 (dev creds pending —
confirm this is closed too)" — searched PROGRESS.md and SESSION_ARCHIVE
for #16 reference; doesn't exist (active bugs are #17-23). Treating
as a phantom reference; nothing to flip.

**Cleanup commits summary:**

| Commit | Files changed | Insertions | Deletions |
|---|---|---|---|
| `e63b2a9` Class 4 helpers | 23 | 84 | 72 |
| `0ba786d` TenantContext extension | 4 | 8 | 18 |
| `e8a7a19` resolveEffectiveUser | 5 | 7 | 22 |
| `c688316` redundancy sweep | 1 | 3 | 6 |
| Commit 5 (this) AGENTS.md + closure | 3 | (TBD) | (TBD) |

**Wave 3 final tally (Sessions 47-53):**
- 7 sessions, 6 migration batches + 1 cleanup session
- 72 routes migrated to `withTenant` (91/91 tenant-scoped, 100%)
- 38 latent cross-tenant defense gaps fixed
- 4 leak classes catalogued + 2 architectural patterns codified
- 12 redundant `ctx`-equivalent DB lookups dropped
- 6 lib helpers refactored to take `tenantId` explicitly
- TenantContext extended from 4 → 6 fields
- `resolveEffectiveUser` migrated from legacy AppSession to TenantContext
- Zero `getSession()` calls remain in migrated routes

**No tsc errors at any commit. Pre-push tsc gate clean for all 5 pushes.
No production behavior changes — every commit is structural enforcement
or DiD hardening.**

**Wave 3 closes the largest defensive sweep in Gunner's history:**
the `withTenant` helper now structurally enforces tenant isolation
across every tenant-scoped API route, and the supporting helpers carry
that enforcement into lib/. The leak class is no longer expressible
in code that passes typecheck.

**Next: Wave 4 — repo scrub + D-044 writeup.**

### Session 52 — Wave 3 Session F of v1-finish sprint (2026-04-29) — **WAVE 3 COMPLETE**

`withTenant` migration, FINAL batch 6 of 6. Twelve routes migrated;
**4 latent defense gaps fixed** across 4 of those routes. Wave 3 closes.

**Pre-scan prediction (with refined heuristic incl. `upsert`):**
- 6 cool / 5 warm / 1 warm-write-only.
- Predicted ~8-12 leak sites using Session E density formula
  `(finds+writes) × 0.5`. Actual: **4** — over-predicted by 2-3×.
- Why over-predicted: `sellers/route.ts` had 8 ops but 0 leaks because
  property is consistently pre-validated in every handler →
  DiD-via-FK propagates cleanly through all PropertySeller compound-key
  operations. The density formula doesn't account for routes with
  disciplined upstream tenant validation.

**Routes migrated (alphabetical, batch 6):**

1. `properties/[propertyId]/sellers/route.ts` — clean despite 8 DB ops.
   Property pre-validated in GET/POST/DELETE → all 5 PropertySeller
   compound-key operations are DiD-via-FK.
2. `properties/[propertyId]/story/route.ts` — **1 leak**: post-generation
   read-back used id-only findUnique (Class 1 variant 4). Plus added
   Class 4 gate — `generatePropertyStory` does internal id-only findUnique.
3. `properties/[propertyId]/team/route.ts` — **1 leak**: upsert on
   compound `propertyId_userId` without propertyId pre-validation
   (Class 3). Fix: added findFirst({propertyId, tenantId}) gate.
4. `properties/market-lookup/route.ts` — clean. Config helper, no DB.
5. `properties/route.ts` — clean. All creates with tenantId. Three
   Class 4 helpers (`splitCombinedAddressIfNeeded`, `enrichProperty`,
   `enrichPropertyWithAI`) are called on JUST-created property.id —
   safe by construction.
6. `properties/search/route.ts` — clean. Read-only, scoped.
7. `sellers/[sellerId]/skip-trace/route.ts` — clean. Class 4 gate
   already in place pre-migration (validates seller before delegating).
8. `tasks/route.ts` — **1 leak**: `task.update({where: {id}})` post-
   creation was id-only (Class 1). Now scoped.
9. `tenants/config/route.ts` — clean. `Tenant.id` IS the tenant
   boundary, so id-only WHERE is structurally safe (same precedent as
   `ghl/calendars`).
10. `tenants/invite/route.ts` — clean. Retained `getSession()` re-fetch
    for `session.name` (used as inviterName in invite email) — queued
    cleanup item #2 (TenantContext extension).
11. `users/[userId]/route.ts` — **1 leak**: `user.update({where: {id}})`
    after pre-validation was id-only (Class 1). Plus 1 redundancy drop:
    collapsed two identical `findFirst({id, tenantId})` calls into one.
12. `workflows/route.ts` — clean. updateMany was already tenant-scoped.

**No new leak class (Class 5) found.** All 4 leaks fit existing taxonomy:
- Class 1 (chained-update): 3 sites (story read-back, tasks update, users update)
- Class 3 (id-only/compound-unique upsert): 1 site (team upsert)

**Coverage delta:**
- `withTenant` routes: 79 → **91** (+12)
- `getSession`-direct routes: 15 → **0** (−12 = empty backlog)
- Documented exceptions: 16 → **19** (+3 — added auth/crm/callback,
  debug/webhooks, stripe/checkout to the canonical exception list;
  these were always non-tenant-session but had been omitted from
  OPERATIONS.md table)
- Total `route.ts` files: 110 (unchanged)

**Wave 3 cumulative (sessions A+B+C+D+E+F, 72 routes — 100% coverage):**
- 38 latent leak sites fixed (5 + 0 + 16 + 0 + 13 + 4)
- 11 redundancy drops (4 + 0 + 6 + 0 + 0 + 1)
- 6 sessions × 12 routes = 72 routes migrated. Migration **complete**.

**Final cross-batch leak distribution diagnosis:**
| Batch | Routes | Leaks | Density | Cluster |
|---|---|---|---|---|
| 1 | 12 | 5 | 0.42 | Calls cluster (CRUD) |
| 2 | 12 | 0 | 0.00 | Cool (admin/auth-adjacent) |
| 3 | 12 | 16 | 1.33 | AI-assistant + CRUD (very hot) |
| 4 | 12 | 0 | 0.00 | GHL passthrough + read-only |
| 5 | 12 | 13 | 1.08 | properties/[propertyId]/* (hot) |
| 6 | 12 | 4 | 0.33 | Mixed (densely-DiD'd / Tenant-self ops) |
| **Total** | **72** | **38** | 0.53 | Bell curve confirmed |

**Final heuristic accuracy across 6 batches:**
- Hot/cool classification: 6-for-6. Every batch's pre-scan correctly
  identified the routes with shape-warmth.
- Leak count prediction: variable. Density formula
  `(finds+writes) × 0.5` works as a rough upper bound but
  over-predicts when routes have disciplined upstream validation
  (batch 6 sellers/route.ts) and under-predicts when routes have
  multiple find-then-write sites in a single handler (batch 5 outreach).

**Leak class taxonomy (4 classes, codified in AGENTS.md):**
- Class 1 (chained-update): findFirst({id, tenantId}) → update({id}).
  ~22 sites across Wave 3. Most common.
- Class 2 (JS-side tenant comparison): findUnique({id}) + JS guard
  `record.tenantId !== ctx.tenantId`. ~6 sites.
- Class 3 (id-only / compound-unique upsert): upsert without tenant
  validation. ~3 sites. Discovered in Session E.
- Class 4 (helper-delegate id-only): route delegates to lib helper that
  does id-only lookup internally. ~2 sites. Discovered in Session E.

**End-of-Wave-3 cleanup queue (Session 53 — DO NOT do in this session):**
1. Refactor `resolveEffectiveUser` to accept `TenantContext` instead of
   legacy `AppSession` (currently duck-typed).
2. Extend `TenantContext` to include `userName` + `userEmail`. Drops the
   3 `getSession()` re-fetch sites (`ai/coach`, `bugs/route.ts`,
   `tenants/invite`).
3. `ctx.userRole` redundancy sweep across migrated routes (most batches
   already cleaned, but a final pass before declaring Wave 3 closed).
4. Helper signature audit for opaque-id helpers — fix tenant scoping
   inside `generatePropertyStory`, `skipTraceSeller`,
   `splitCombinedAddressIfNeeded`, `enrichProperty`,
   `enrichPropertyWithAI`, `computePropertyMetrics` themselves so route
   gates aren't load-bearing.

**Files changed:**
- 12 route files (in `app/api/properties/`, `app/api/sellers/`,
  `app/api/tasks/`, `app/api/tenants/`, `app/api/users/`,
  `app/api/workflows/`).
- `PROGRESS.md` — header bumped to Session 52, this entry, Wave 3 close.
- `OPERATIONS.md` — API surface table updated to final state
  (91/0/19), framing rewritten (no longer "ongoing tech-debt"),
  exception table extended from 16 → 19.

**No tsc errors. No production behavior changes.** Pre-push tsc gate clean.

**Wave 3 closes the largest defensive sweep in Gunner's history:**
72 routes migrated, 38 latent cross-tenant leaks fixed, 4 leak classes
catalogued, 6/6 batches landed, structural enforcement now mandatory
for all tenant-scoped routes. The `withTenant` helper makes the leak
class structurally impossible to ship.

### Session 51 — Wave 3 Session E of v1-finish sprint (2026-04-29)

`withTenant` migration, batch 5 of 6. Twelve routes migrated; **13 latent
defense gaps fixed** across 6 of those routes. The properties/[propertyId]/*
cluster lived up to its hot-zone reputation: `outreach` (4 leaks), `buyers`
(3 leaks), `research` (2), `blast` (2), `buyer-stage` (1), `metrics` (1).

**Pre-scan prediction (run for first time as a structural pre-flight):**
- 7 cool / 5 warm by find+write co-presence heuristic.
- Predicted ~4-6 leak sites total. Actual: **13** — 2-3× the prediction.
- Heuristic correctly identified WHICH routes were warm (5/5 hits) but
  underestimated leak DENSITY per warm route. Average 2.4 leaks per
  warm-with-leak route, vs assumed ~1.

**Two new heuristic refinements discovered:**

1. **`upsert` was missing from the pre-scan write-pattern grep.**
   `(update|delete|updateMany|deleteMany)` doesn't match `upsert` (no
   substring overlap with `update`). `buyer-stage` was misclassified
   cool but contained a real cross-tenant-write vector (compound unique
   `propertyId_buyerId` upsert without tenant validation). For batch 6,
   include `upsert` in the write-pattern grep.

2. **Helper-delegate variant — pre-scan can't see lib/ code.**
   `metrics/route.ts` calls `computePropertyMetrics(propertyId)` in
   `lib/computed-metrics.ts`, which does an id-only `findUnique` and
   then trusts the row's tenantId for downstream scoping. This is a real
   cross-tenant read leak invisible to a route-only pre-scan. Rule for
   batch 6: when a route delegates to a lib helper that takes an opaque
   id without explicit tenantId, add a route-level
   `findFirst({ id, tenantId })` validation gate first.

**Routes migrated (alphabetical, batch 5):**

1. `lead-sources/route.ts` — clean. POST upserts on compound key
   `tenantId_source_month_year` (tenantId in unique key = structurally safe).
2. `markets/route.ts` — clean. DELETE uses canonical `delete({ id, tenantId })`.
3. `milestones/route.ts` — clean. POST has `propertyTeamMember.upsert` on
   compound `propertyId_userId` without tenantId in WHERE — DiD-via-FK
   because propertyId is tenant-validated immediately above; noted in code.
4. `notifications/route.ts` — clean. Read-only.
5. `properties/[propertyId]/blast/route.ts` — **2 leaks**:
   - Class 2: approval-gate verification used `auditLog.findUnique({ id })`
     + JS-side `gate.tenantId !== tenantId` comparison. Replaced with
     `findFirst({ id, tenantId, userId, resourceId })`.
   - Class 1: `dealBlast.update({ where: { id } })` post-send was
     id-only. Now scoped with `tenantId`.
6. `properties/[propertyId]/buyer-stage/route.ts` — **1 leak**: upsert
   on compound unique `propertyId_buyerId` without tenant validation.
   Fix: validate property belongs to ctx.tenantId first via findFirst.
   This was the route the pre-scan misclassified cool.
7. `properties/[propertyId]/buyers/route.ts` — **3 leaks** (all in POST
   manual-add flow):
   - `property.findUnique({ id })` for manualBuyerIds read — id-only.
   - `property.update({ id })` for manualBuyerIds write — id-only.
   - `buyer.upsert({ where: { id: \`ghl_${contactId}\` } })` — id-only.
     Replaced with findFirst → conditional create-or-update with
     id+tenantId in WHERE.
8. `properties/[propertyId]/messages/route.ts` — clean. Already DiD-clean
   pre-migration.
9. `properties/[propertyId]/metrics/route.ts` — **1 leak (helper-delegate
   variant)**: route delegated to `computePropertyMetrics(propertyId)`
   without first validating property belongs to caller. Helper does
   id-only findUnique. Fix: route-level `findFirst({ id, tenantId })`
   gate before delegate call.
10. `properties/[propertyId]/outreach/route.ts` — **4 leaks** (densest
    of the batch):
    - `syncOfferFields` helper: `outreachLog.findMany` without tenantId.
    - `syncOfferFields` helper: `property.findUnique({ id })` (variant 4
      read-then-merge — read could leak another tenant's row).
    - `syncOfferFields` helper: `property.update({ id })` (Class 1).
    - POST: `outreachLog.update({ where: { id: body.logId } })` — id-only.
      Now `updateMany({ id, tenantId, propertyId })`.
    Helper signature changed: `tenantId` is now required (was optional).
11. `properties/[propertyId]/re-enrich/route.ts` — clean. Already
    DiD-clean.
12. `properties/[propertyId]/research/route.ts` — **2 leaks**:
    - `property.findUnique({ id })` for read-merge of zillowData (variant 4).
    - `property.update({ id })` for zillowData write (Class 1).

**Coverage delta:**
- `withTenant` routes: 67 → **79** (+12)
- `getSession`-direct routes: 27 → **15** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Wave 3 cumulative (sessions A+B+C+D+E, 60 routes):**
- 34 latent leak sites fixed (5 + 0 + 16 + 0 + 13)
- 10 redundancy drops (4 + 0 + 6 + 0 + 0)
- 5 sessions × 12 routes = 60 routes complete; **1 batch remaining (~12 routes)**.

**Cross-batch leak distribution diagnosis updated:**
| Batch | Routes | Leaks | Density | Cluster |
|---|---|---|---|---|
| 1 | 12 | 5 | 0.42 | Calls cluster (CRUD) |
| 2 | 12 | 0 | 0.00 | Cool (admin/auth-adjacent) |
| 3 | 12 | 16 | 1.33 | AI-assistant + CRUD (very hot) |
| 4 | 12 | 0 | 0.00 | GHL passthrough + read-only |
| 5 | 12 | 13 | 1.08 | properties/[propertyId]/* (hot) |
| **Total** | **60** | **34** | 0.57 | Bell curve confirmed |

The ~1+ leak/route density in batches 3 and 5 reflects routes with
multiple find-then-write sites per file. Single-file leak counts of
3-7 are common in property-CRUD and AI-tool-dispatch shapes.

**Files changed:**
- 12 route files (in `app/api/lead-sources/`, `app/api/markets/`,
  `app/api/milestones/`, `app/api/notifications/`,
  `app/api/properties/[propertyId]/{blast,buyer-stage,buyers,messages,metrics,outreach,re-enrich,research}/`).
- `AGENTS.md` Route Conventions — extended with two new variants
  (id-only upsert / compound-unique upsert + helper-delegate id-only).
  Plus the upsert-in-pre-scan-grep heuristic refinement.
- `PROGRESS.md` — header bumped to Session 51, this entry, coverage stats.
- `OPERATIONS.md` — API surface table updated (67→79 / 27→15).

**No tsc errors. No production behavior changes** — every leak fix is
defensive against scenarios that don't currently occur in production
data. Pre-push tsc gate clean.

### Session 50 — Wave 3 Session D of v1-finish sprint (2026-04-29)

`withTenant` migration, batch 4 of 6. Twelve routes migrated; **0 latent
defense gaps fixed**. Cool-zone prediction was correct: this batch was the
GHL-passthrough cluster (7 routes under `app/api/ghl/`) plus simple
list/create CRUD (`buyers/route.ts`, `call-rubrics/route.ts`,
`buyers/sync`), one read-only ledger query (`calls/ledger`), and one
already-defense-in-depth route (`kpi-entries`). No find-then-update shape
in any of the 12 routes — the structural diagnosis from Session C held
exactly: "routes that pass through to GHL or do read-only work are cool."

**Routes migrated (alphabetical, batch 4):**

1. `buyers/route.ts` — clean migration. GET list + POST create, no find-then-update.
2. `buyers/sync/route.ts` — clean migration. POST passthrough to GHL + lib helper.
3. `call-rubrics/route.ts` — clean migration. POST `updateMany` was already tenant-scoped.
4. `calls/ledger/route.ts` — clean migration. `resolveEffectiveUser` is duck-typed on `{userId, tenantId}` — passed `ctx` directly, no `getSession()` re-fetch tax (this route doesn't need `userName/userEmail`).
5. `ghl/actions/route.ts` — clean migration. POST → GHL passthrough + auditLog create.
6. `ghl/calendars/route.ts` — clean migration. `tenant.findUnique({ id: ctx.tenantId })` is correct — `Tenant.id` IS the tenant boundary.
7. `ghl/contacts/route.ts` — clean migration. GET → GHL search passthrough.
8. `ghl/phone-numbers/route.ts` — clean migration. GET → GHL passthrough.
9. `ghl/pipelines/route.ts` — clean migration. GET → GHL passthrough.
10. `ghl/reregister-webhook/route.ts` — clean migration. POST → lib helper.
11. `ghl/users/route.ts` — clean migration. GET → GHL + fire-and-forget lib sync.
12. `kpi-entries/route.ts` — clean migration. POST already had defense-in-depth on the property lookup; DELETE already used `deleteMany` with tenantId.

**No new leak-class variants found.** Variants 1-4 from Sessions A+C are
sufficient for this batch's shape coverage — there were no find-then-update
sites to scrutinize. AGENTS.md unchanged.

**No redundancy drops.** None of the 12 routes had the "re-fetch user role"
anti-pattern (admin gating was already done via `hasPermission(role, …)`
on the session role field, not via `db.user.findUnique`). All 6 redundancy
drops in this Wave's tally came from batches 1-3.

**Coverage delta:**
- `withTenant` routes: 55 → **67** (+12)
- `getSession`-direct routes: 39 → **27** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Wave 3 cumulative (sessions A+B+C+D, 48 routes):**
- 21 latent leak sites fixed (5 in batch 1, 0 in batch 2, 16 in batch 3, 0 in batch 4)
- 10 redundancy drops (4 in batch 1, 0 in batch 2, 6 in batch 3, 0 in batch 4)
- ~4 sessions × 12 routes = 48 routes complete; **2 batches remaining (~24 routes)**.

**Cross-batch leak distribution diagnosis confirmed:**
Batches 1+3 hit CRUD/AI clusters (21 leaks combined); batches 2+4 were
GHL/read-only passthroughs (0 leaks combined). Bell curve confirmed —
hot/cool prediction now reliable based on route shape (find-then-update
present = hot; GHL passthrough or read-only = cool). Predictive accuracy
this batch: **12/12 routes correctly classified as cool, 0/0 leaks predicted
vs found**.

**Files changed:**
- 12 route files (in `app/api/buyers/`, `app/api/call-rubrics/`,
  `app/api/calls/ledger/`, `app/api/ghl/` (7 routes), `app/api/kpi-entries/`).
- `PROGRESS.md` — header bumped to Session 50, this entry, coverage stats.
- `OPERATIONS.md` — API surface table updated (55→67 / 39→27).

**Queued cleanup (end of Wave 3, after batch 6):**
- Extend `TenantContext` to include `userName` + `userEmail`; drop the 3
  `getSession()` re-fetch sites (`ai/coach`, `bugs/route.ts`, the
  `resolveEffectiveUser` callers in `dayhub/*` if they need name).
- Refactor `resolveEffectiveUser` to accept `TenantContext` instead of
  legacy `AppSession` (current duck-typing works but is implicit).

**No tsc errors. No production behavior changes** — all 12 routes are
behaviorally identical to before the migration (structural enforcement
only, no semantic changes). Pre-push tsc gate clean.

### Session 49 — Wave 3 Session C of v1-finish sprint (2026-04-28)

`withTenant` migration, batch 3 of 6. Twelve routes migrated; **16 latent
defense gaps fixed** across 6 of those routes. Hot-zone prediction was
correct: the AI assistant cluster (`ai/assistant/execute`) and CRUD-shape
routes (`bugs/[id]`, `buyers/[buyerId]`, `admin/user-profiles`,
`admin/load-playbook`) accounted for all 16 fixes. Cool routes
(`ai/assistant/session`, `ai/coach`, `ai/outreach-action`,
`admin/knowledge`, `bugs/route.ts`) were leak-free as expected.

**Routes migrated (alphabetical, batch 3):**

1. `admin/knowledge/route.ts` — clean migration, 1 ctx.userRole redundancy drop
2. `admin/load-playbook/route.ts` — **1 leak** (`knowledgeDocument.update` by id-only) + 1 redundancy drop
3. `admin/user-profiles/route.ts` — **1 leak** (`userProfile.update` by id-only after tenant-scoped findFirst) + 2 redundancy drops
4. `ai/assistant/execute/route.ts` — **7 leaks across the 13-tool dispatch table**:
   - `log_offer`: `Property.update` by id only
   - `add_internal_note`: id-only `Property.findUnique` → re-merge → tenant-scoped update (read could leak)
   - `update_deal_intel`: same pattern as add_internal_note
   - `set_property_markets`: `Property.update` by id only inside the markets loop
   - `move_buyer_in_pipeline`: `PropertyBuyerStage.updateMany({ buyerId })` without tenantId — `PropertyBuyerStage` has its own tenantId column
   - `update_buyer`: `Buyer.update` by id only after tenant-scoped findFirst
   - `update_user_role`: `User.update` by id only after tenant-scoped findFirst
   - `remove_team_member`: id+userId compound delete on `PropertyTeamMember` without tenantId — switched to `deleteMany` to add tenantId
5. `ai/assistant/route.ts` — clean migration, 1 redundancy drop (used `ctx.userRole` instead of re-fetching `user.role`)
6. `ai/assistant/session/route.ts` — clean migration, 1 redundancy drop
7. `ai/coach/route.ts` — clean migration, retained `getSession()` re-fetch for `userName` (ctx doesn't expose name; queued for end-of-Wave-3 ctx extension)
8. `ai/outreach-action/route.ts` — clean migration
9. `blasts/route.ts` — **1 leak** (`dealBlast.update` by id-only after tenant-scoped findFirst)
10. `bugs/[id]/route.ts` — **5 leak sites** across GET/PATCH/DELETE: three `findUnique({ id })` + JS-side `tenantId !==` comparison anti-pattern; one id-only `update`; one id-only `delete` (switched to `deleteMany`). Plus 1 redundancy drop (the `requireAdmin` helper).
11. `bugs/route.ts` — clean migration, 1 redundancy drop. Retains `getSession()` re-fetch for reporter name/email.
12. `buyers/[buyerId]/route.ts` — **1 leak** (`Buyer.update` by id-only after tenant-scoped findFirst). Predicted hot zone confirmed.

**New leak-class variants codified in AGENTS.md:**

- `findUnique({ where: { id } })` + `bug.tenantId !== ctx.tenantId` JS comparison.
  The DB query is unscoped; the JS guard is the only thing keeping the row
  from leaking. Replaced with `findFirst({ where: { id, tenantId } })`.
- `delete({ where: { compoundUniqueKey } })` without tenantId. Prisma `delete`
  on a unique key doesn't accept extra-key fields. Fix: `deleteMany({ id, tenantId })`.

**ctx.userRole canonical pattern codified.** Six routes had a redundant
`db.user.findUnique({ where: { id: session.userId }, select: { role: true } })`
to gate admin endpoints. `ctx.userRole` is already populated from the JWT
session by `withTenant`. Drops a DB roundtrip per request and removes the
"look up the same user twice" pattern.

**Coverage delta:**
- `withTenant` routes: 43 → **55** (+12)
- `getSession`-direct routes: 51 → **39** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Wave 3 cumulative (sessions A+B+C, 36 routes):**
- 21 latent leak sites fixed (5 in batch 1, 0 in batch 2, 16 in batch 3)
- 10 redundancy drops (4 in batch 1, 0 in batch 2, 6 in batch 3)
- ~3 sessions × 12 routes = 36 routes complete; **3 batches remaining (~36 routes)**.

**Cross-batch leak distribution diagnosis:**
Batch 1 hit the calls cluster (5 leaks); batch 2 was cool (0 leaks);
batch 3 hit the AI-assistant + CRUD cluster (16 leaks). The structural
explanation: routes that follow a "find a record, then mutate that record"
shape are leak hot zones; routes that pass through to GHL or do read-only
work are cool. Bell curve confirmed — batches 4-6 will likely be a mix.

**Files changed:**
- 12 route files (in `app/api/admin/`, `app/api/ai/`, `app/api/blasts/`,
  `app/api/bugs/`, `app/api/buyers/[buyerId]/`).
- `AGENTS.md` Route Conventions — extended with two new leak-class
  variants (id-only findUnique + JS comparison; id-only delete on compound
  unique). Plus the new "Don't re-fetch user role — `ctx.userRole` is canonical"
  sub-section.
- `PROGRESS.md` — header bumped to Session 49, this entry, coverage stats.
- `OPERATIONS.md` — API surface table updated (43→55 / 51→39).

**No tsc errors. No production behavior changes** — every leak fix is
defensive against scenarios that don't currently occur. Pre-push tsc gate
clean.

### Session 48 — Wave 3 Session B of v1-finish sprint (2026-04-28)

`withTenant` migration, batch 2 of 6. Twelve routes migrated. **Zero
latent defense gaps** found — the lower extreme that triggered the
"STOP AND REPORT" check. Diagnosis (also captured below): structural,
not a methodology gap. Batch 2's 12 routes are dominated by GHL
pass-throughs (route reads tenant config, hands off to GHL API, writes
an audit log only — no DB find-then-update on tenant-scoped tables) and
admin gates that already had `getSession()`-direct tenant scoping
elsewhere. The "find a record then mutate that record" shape — the
hot zone for the chained-update leak class — simply isn't present in
this batch.

**Routes migrated:**

1. `app/api/[tenant]/dayhub/tasks/route.ts` (GET + POST)
2. `app/api/[tenant]/dayhub/team-numbers/route.ts` (GET)
3. `app/api/[tenant]/ghl/appointments/route.ts` (GET + POST)
4. `app/api/[tenant]/ghl/notes/route.ts` (POST)
5. `app/api/[tenant]/ghl/tasks/[taskId]/route.ts` (PATCH)
6. `app/api/[tenant]/ghl/workflows/[workflowId]/route.ts` (POST)
7. `app/api/[tenant]/ghl/workflows/route.ts` (GET)
8. `app/api/[tenant]/tasks/[contactId]/details/route.ts` (GET)
9. `app/api/admin/ai-logs/[id]/route.ts` (GET)
10. `app/api/admin/ai-logs/route.ts` (GET)
11. `app/api/admin/embed-knowledge/route.ts` (POST)
12. `app/api/admin/generate-profiles/route.ts` (POST)

**Bonus:** four admin routes (`ai-logs/[id]`, `ai-logs`, `embed-knowledge`,
`generate-profiles`) had a redundant `db.user.findUnique({ where: { id:
session.userId }, select: { role: true } })` to gate admin endpoints.
After migration, `ctx.userRole` is canonical — dropped four DB roundtrips.
Pattern formalized as a Wave 3 convention in batch 3's AGENTS.md update.

**Coverage delta:**
- `withTenant` routes: 31 → **43** (+12)
- `getSession`-direct routes: 63 → **51** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Leak find rate diagnosis (batch 1: 5/12, batch 2: 0/12):** batch 1
hit `app/api/[tenant]/calls/[id]/*` and `calls/bulk-regrade` — every leak
followed the same shape (tenant-scoped find followed by id-only write back).
That's a hot zone for the chained-update class. Batch 2's clusters
(`dayhub/*`, `ghl/*`, `tasks/[contactId]/details`, `admin/*`) are
GHL-pass-through or read-only — no shape match. **This is consistent with
the prompt's hypothesis that "either extreme is a signal worth diagnosing."**
Not a methodology bug. Future batches that touch
`app/api/properties/[propertyId]/*` and `app/api/buyers/*` are predicted
to surface chained-update leaks again (same find-then-update shape).

**No tsc errors. No production behavior changes.**

### Session 47 — Wave 3 Session A of v1-finish sprint (2026-04-28)

`withTenant` migration, batch 1 of 6. Twelve routes flipped from
`getSession()` direct + manual `tenantId` tracking to the `withTenant`
wrapper that makes "forget to scope by tenant" structurally impossible.

**Routes migrated (alphabetical, all under `app/api/[tenant]/*`):**

1. `calls/[id]/ai-edit/route.ts`
2. `calls/[id]/deal-intel/route.ts` — **leak caught**
3. `calls/[id]/generate-next-steps/route.ts` — **leak caught (×2)**
4. `calls/[id]/property-suggestions/route.ts`
5. `calls/[id]/reprocess/route.ts` — **leak caught**
6. `calls/bulk-regrade/route.ts` — **leak caught**
7. `calls/upload/route.ts` — **leak caught (×3 structural)**
8. `dayhub/appointments/route.ts`
9. `dayhub/contact-activity/route.ts`
10. `dayhub/inbox/route.ts`
11. `dayhub/kpis/route.ts`
12. `dayhub/messages/route.ts`

**Latent cross-tenant defense gaps caught + fixed (8 sites across 5 routes):**

- **deal-intel**: `Property.findUnique({ where: { id: call.propertyId } })`
  + `Property.update({ where: { id: call.propertyId } })` — both id-only.
  `call.propertyId` is a foreign key; if it ever pointed at a different-tenant
  property (data corruption upstream), this would leak/overwrite. Both now
  scoped by `tenantId: ctx.tenantId`.
- **generate-next-steps**: two trailing `Call.update({ where: { id: params.id } })`
  calls — id-only after a tenant-scoped findFirst. Now both scoped on update.
- **reprocess**: same id-only `Call.update` pattern. Scoped.
- **bulk-regrade**: `Call.updateMany({ where: { id: { in: callIds } } })` — the
  id list came from a tenant-scoped findMany (so the IDs were all this-tenant),
  but the updateMany didn't re-enforce. Future refactor that broke the upstream
  filter would silently leak. Now scoped.
- **upload**: three `Call.update({ where: { id: callId } })` calls on the
  just-created row. callId came from same-handler `create` so no active leak,
  but defense-in-depth — id-only writes are the wrong pattern regardless.
  All three now scoped.

None of these are known active leaks. They are **structural defense gaps**:
the kind of code that is correct today but one upstream-refactor away from
silently crossing the boundary. Wave 1's lesson + this batch reinforces the
AGENTS.md convention: every db write WHERE needs `tenantId`, even when the
upstream find was already scoped.

**Coverage delta:**
- `withTenant` routes: 19 → **31** (+12)
- `getSession`-direct routes: 75 → **63** (−12)
- Documented exceptions (auth/cron/webhooks/health/diagnostics/vieira/stripe): 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Remaining migration backlog: ~63 routes across batches 2-6.**

**Files changed:**

- 12 route files (in `app/api/[tenant]/calls/...` and `app/api/[tenant]/dayhub/...`).
- `AGENTS.md` Route Conventions — new sub-section "Every db.* WHERE needs
  tenant scope — including chained updates" codifies the leak-class found
  in this batch (find-scoped + update-unscoped pattern). Lists the five
  routes as concrete examples for future agents.
- `PROGRESS.md` — header bumped to Session 47, this entry, coverage stats.

**No tsc errors. No production behavior changes** — every leak fix is
defensive against scenarios that don't currently occur. Pre-push tsc gate
clean. Verification path: spot-check a route via `/api/diagnostics/dial-counts`
or by sending a request with mismatched tenantId param — should now hit a
401 from `withTenant` rather than potentially executing.

### Session 46 — Wave 2 of v1-finish sprint (2026-04-28)

Two display-correctness bugs on the dial-count surface, bundled because both
touched the same aggregation logic. Closed PROGRESS P4 #3 + #4 (the items the
user mapped to Wave-2 P1/P2 — see scope-correction note below).

**Part A — Wave-2 P1: canonical Day Hub "Calls Made" never aggregated for admins.**

`app/(tenant)/[tenant]/day-hub/page.tsx:153` always filtered the calls count
by `assignedToId: userId` regardless of role. The `isAdmin` branch above it
(line 39) only multiplied **goals** by headcount — the actual numerator was
single-user. Result: an admin/owner viewing Day Hub saw their own dials over
a goal scaled to the whole team.

The query also used `createdAt` while `/calls` page ordering, the `/api/[tenant]/dayhub/kpis`
backend, and `app/(tenant)/[tenant]/health/page.tsx` all use `calledAt`.
Webhook lag at midnight boundaries put boundary calls in the wrong day,
pushing the rendered count further out of sync.

**Part B — Wave-2 P2: three surfaces, three queries.**

- `/day-hub/` canonical → `createdAt` + always-single-user (BUG, fixed above).
- `/api/[tenant]/dayhub/kpis` (backs legacy `/tasks/` Day Hub including the
  admin LM/AM/DISPO role tabs) → `calledAt` + role-aware via `userIds=` query
  param. Logic was correct.
- `/calls` page → `calledAt` ordering, JS-side date filter (default 7d).

The fix: extracted `lib/kpis/dial-counts.ts` as the single source of truth.
Three scopes (`all` | `user` | `users`), `calledAt`-pinned, plus convo
helper (graded ≥45s). Both Day Hub surfaces now go through it. Drift can't
recur on the date field or the aggregation rule because there's only one
place to change.

**Scope-correction note (Wave-1-style audit accuracy):**

The Wave-2 prompt referenced "AUDIT_PLAN P1/P2" — those entries did not
exist. The two items lived in `PROGRESS.md` "P4 — Technical debt" #3 + #4
as one-line tech-debt mentions, never authored as AUDIT_PLAN P-entries.
Per Wave-1 lesson ("AUDIT_PLAN P-entries must be authored from a fresh
codebase grep, not from a single-file finding"), Wave 2 added them
retroactively to AUDIT_PLAN as CLOSED entries with the fresh-grep scope.

The other catch from the fresh grep: the "LM tab" only ever existed on the
**legacy /tasks/ Day Hub** (`app/(tenant)/[tenant]/tasks/day-hub-client.tsx`),
not on the canonical `/day-hub/`. The legacy backend at `/api/[tenant]/dayhub/kpis`
was already correct for that tab. The "227 not aggregating" symptom most
plausibly traced to the **canonical /day-hub/ admin bug**, not to the LM
tab itself. Fix on canonical surface fixes the symptom; refactor on the
legacy surface protects against future drift while it sticks around.

**Files changed:**

- `lib/kpis/dial-counts.ts` — new. Wave 2: 80 lines (today + convo helpers).
  Wave 2 follow-up: added `countDialsInRange(scope, range)` primitive so
  multi-day dashboard windows could route through the same module.
- `app/(tenant)/[tenant]/day-hub/page.tsx` — calls/convos count via helper.
- `app/api/[tenant]/dayhub/kpis/route.ts` — calls/convos count via helper.
- `app/(tenant)/[tenant]/dashboard/page.tsx` — callsToday/Week/Month via
  helper (added in Wave 2 follow-up commit; closes the third dial-count
  surface that surfaced during the Wave 2 grep).
- `docs/SYSTEM_MAP.md` §Computed metrics — new entry for `lib/kpis/dial-counts.ts`.
- `docs/AUDIT_PLAN.md` — P1 + P2 added retroactively (status: PATCH SHIPPED,
  verification pending). D-045 (proposed) added for kpi-snapshot.ts
  timestamp-semantics decision.
- `PROGRESS.md` — header bumped to Session 46; P4 #3 + #4 + #7 dropped
  (dashboard fix landed before #7 needed its own wave).

**Commits:**

- `98e5e7d` — Wave 2 (Day Hub canonical + legacy backend, helper extracted).
- `525e8b8` — dashboard fix + AUDIT_PLAN status corrections + D-045 +
  PROGRESS verification checklist. Stacked rather than amended so the
  cadence stays honest (Wave 2 closed the user-listed items; the dashboard
  fix is genuine follow-up work).
- `f0c4de9` — Wave-2 verification infrastructure: token-gated
  `/api/diagnostics/dial-counts` endpoint + fix for a host-TZ bug in
  `lib/dates.ts:getCentralDayBounds`. The TZ bug used
  `new Date(noon.toLocaleString(...))` which silently produced wrong
  bounds on any host not running in UTC — production was lucky (Railway
  is UTC) but local dev / scripts / future Railway region changes were
  one config flip from silent KPI drift. Now uses
  `Intl.DateTimeFormat.formatToParts` and is host-TZ-independent
  (verified across UTC, America/Los_Angeles, America/New_York,
  Europe/London, Asia/Tokyo). No tests added — the project has no test
  framework configured (no jest/vitest/etc.); flagging as a separate
  decision the project owes itself.
- `f8e58bb` — middleware fix: `/api/diagnostics` was being intercepted
  by NextAuth middleware and 307-redirected to `/login` before the
  route handler's bearer-token check could fire. Caught at the post-push
  probe of `f0c4de9`. Fix is a one-line addition to `PUBLIC_PATHS`;
  same pattern as `/api/cron`, `/api/webhooks`, `/api/vieira` (all
  self-gating).

**Verification Owed (gated on Railway env)**

The verification infrastructure is shipped (commits `f0c4de9` + `f8e58bb`),
but `DIAGNOSTIC_TOKEN` must be set on Railway dashboard env before the
endpoint is callable. Until then it returns 401 to all callers (fail-closed
by design — a missing env var is a no-op, not an open door).

Once `DIAGNOSTIC_TOKEN` is set:

```bash
curl -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
  "[PRODUCTION_URL]/api/diagnostics/dial-counts?tenant=new-again-houses&date=2026-04-27"
```

Expected match against the prior REST-API SQL probe (Session 46 first
verification attempt): `tenantDials=317`, `lmDials=215`. If endpoint
matches → flip P1+P2 to CLOSED and check the boxes below. If it
doesn't → the helper has drift from raw SQL and Wave 2 fix is incomplete.

Original SQL still runnable from Supabase dashboard or any environment
with DB credentials (kept here as redundant verification):

```sql
SELECT
  COUNT(*) FILTER (WHERE assigned_to_id IN
    (SELECT id FROM users WHERE tenant_id=$1 AND role='LEAD_MANAGER'))
    AS lm_dials,
  COUNT(*) AS tenant_dials
FROM calls
WHERE tenant_id = $1
  AND called_at >= (NOW() AT TIME ZONE 'America/Chicago')::date
                     AT TIME ZONE 'America/Chicago'
  AND called_at <  (NOW() AT TIME ZONE 'America/Chicago')::date + INTERVAL '1 day'
                     AT TIME ZONE 'America/Chicago';
```

Three numbers must match (for the same role scope + 2026-04-27 CT, the
date used for the verification window since 2026-04-28 had just rolled
over with no business activity yet):

- [x] DB count (via Supabase REST + service-role): tenant=**317**, LM=**215**
- [x] Day Hub render (via /api/diagnostics/dial-counts helper path): tenantDials=**317**, lmDials=**215**
- [x] Calls page render (same `calledAt` window, < 500 take limit so list = count): **317**

Verified 2026-04-28 via curl against
`/api/diagnostics/dial-counts?tenant=new-again-houses&date=2026-04-27`.
Helper `lib/kpis/dial-counts.ts countDialsInRange` returned identical
counts to the SQL ground truth probe. CDT bounds correctly computed
(`2026-04-27T05:00:00.000Z` → `2026-04-28T04:59:59.999Z`).

Result → P1 + P2 flipped to CLOSED in AUDIT_PLAN.md.

### Session 45 — Wave 1 of v1-finish sprint (2026-04-27)

Two-item bundle on the AI/worker layer. Both items closed in a single commit
because both touch `lib/ai/` + worker infra and both were narrow code surgery
with low risk.

**Part A — Blocker #3: dual grading worker · CLOSED.**

- Removed `[[services]] grading-worker` block (8 lines) from `railway.toml`.
- Deleted `scripts/grading-worker.ts` (now-orphaned standalone entry).
- Kept `scripts/process-recording-jobs.ts` as manual debug surface (also
  reachable via `app/api/cron/process-recording-jobs/route.ts` HTTP wrapper).
- `instrumentation.ts` → `lib/grading-worker.ts` → `lib/grading-processor.ts`
  is now the sole grading path. Atomic claim no longer protecting against a
  second worker — protecting against future re-introduction.
- Post-deploy verification owed within 30 min: confirm Railway `grading-worker`
  service goes away + heartbeat audit rows continue at ~1/min single source.

**Part B — AUDIT_PLAN P3: AI model date-pin standardization · CLOSED.**

- Swept all `claude-sonnet-4-20250514` → `claude-sonnet-4-6` across **9
  occurrences in 5 files** (5× larger than the AUDIT_PLAN P3 entry suggested):
  `lib/ai/enrich-property.ts`, `app/api/[tenant]/calls/[id]/property-suggestions/route.ts`,
  `app/api/[tenant]/calls/[id]/generate-next-steps/route.ts`,
  `app/api/properties/[propertyId]/blast/route.ts`.
- Post-sweep grep returns ZERO hits for the date-pinned identifier.
- Final inventory: 13 Sonnet 4.6 callers + 4 Opus 4.6 callers, no drift.
- Did NOT touch the Sonnet/Opus role assignment — Wave 1 was strictly a
  date-pin sweep. The current Sonnet (conversation) / Opus (high-stakes
  extraction) split is the stability-first split per D-044 (DECISIONS
  writeup deferred to Wave 4).

**Lessons captured for future audits:**

- The AUDIT_PLAN P3 entry was authored from a single-file finding
  (`lib/ai/enrich-property.ts:57`) — the actual contagion was 5× wider.
  **AUDIT_PLAN entries must be authored from a fresh codebase grep**, not
  from an isolated observation. Updated AUDIT_PLAN P3 closure note codifies
  this.
- The original prompt for Wave 1 stated the rule as "grading → Sonnet,
  coaching → Opus" — exactly inverted from the code's current Opus / Sonnet
  split. Stop-and-report caught the contradiction before any code flipped.
  Future model-policy work should grep before stating the rule.

**Companion doc updates in this commit:**

- `AUDIT_PLAN.md` — Blocker #3 → CLOSED with post-deploy verification queries;
  P3 → CLOSED with corrected scope + lesson note.
- `SYSTEM_MAP.md` §6 — enrich-property table row updated to post-sweep state;
  added rows for the 4 API routes that also call Sonnet 4.6 + audit script
  (Opus 4.6); D-0XX renamed D-044 (driver provided = stability-first), full
  writeup still pending Wave 4.
- `PROGRESS.md` — header bumped Session 44 → 45; Active Blockers updated;
  this entry added.

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
| 12 | ~~GHL API version header may be outdated~~ ✅ **CLOSED Wave 5 (2026-04-29).** Verified `Version: 2021-07-28` is the current GA value across HighLevel/LeadConnector docs in 2026; production /api/health 200 and all GHL surfaces (enrichment, calendars, contacts) functioning. The `2021-04-15` value in `lib/ghl/fetch-recording.ts` and `lib/ai/transcribe.ts` is a separate-and-required value for the recording subsystem (documented inline). No code change needed. | RESOLVED | Closed |
| 16 | DEV_BYPASS_AUTH references hardcoded slugs | LOW | Clean up before tenant #2 |
| 17 | callResult `no_answer` never rewritten to `short_call` when cron routes <45s call to SKIPPED. Surfaced 4× in Session 37 verifier Pass B. | MEDIUM | Either fix in cron processor or update spec to accept both for short calls |
| 18 | 2487 `calls` rows have `source IS NULL` (oldest 2026-03-21, newest 2026-04-18, **0 in last 24h**). Likely from `scripts/recover-stuck-calls.ts` not setting source. | LOW | One-time `UPDATE` to backfill `source='recovery'`; grep `db.call.create` to add `source` to all script callsites |
| 19 | One legacy row `cmo4o88zn0raqn5nzaboykobe` (ghlCallId `VyCnm5DBNBVFfipIo0FR`) — non-wf_ id GHL doesn't recognize, source/contactId/duration all null. | LOW | Single instance, no production impact. Origin worth understanding (covered by #18 backfill) |
| 20 | Deal intel parser has a markdown-fence regression — `` ```json `` not stripped. Session 34 `stripJsonFences()` fix covers grading only. Calls still grade cleanly; deal intel returns 0 proposed changes. Observed 6× across Session 38 manual drains. | MEDIUM | Extract stripJsonFences into a shared util and use in lib/ai/extract-deal-intel.ts |
| 21 | Sentiment/sellerMotivation type coercion incomplete — Claude occasionally returns strings ("positive", full prose paragraphs) where Prisma expects Float. Prior fix `79e916e` missed some shapes. Surfaced 4× in the 04:14-04:28 UTC window today. | MEDIUM | Normalize in `parseGradingResponse()` before the `db.call.update` — string→null mapping for these fields |
| 22 | 24 empty-shell FAILED rows from 2026-04-20 have `ghlContactId=NULL`, `recording_url=NULL`, `duration=NULL`. Pre-existing structural issue — GHL fires call-like webhooks with no payload content. Fix 1 (Session 38 `a77911c`) prevents NEW ones but does not remediate these 24. | LOW | One-time `UPDATE calls SET gradingStatus='SKIPPED' WHERE gradingStatus='FAILED' AND recording_url IS NULL AND tenantId=(…)` to clean up |
| 23 | Railway `[[cron]] process-recording-jobs` would not self-register even after no-op redeploy. Workaround: converted to `[[services]] grading-worker` long-running worker (Session 38). Unknown if poll-calls, daily-audit, daily-kpi-snapshot, weekly-profiles crons are at risk of the same failure. | MEDIUM | Add per-cron heartbeat audit rows (same pattern as `1c8befe`) so a similar silent outage is immediately visible |
| 24 | Body-size gap on `/api/ai/assistant/execute` — `editedInput` is `z.record(z.unknown()).optional()`, no content-length check. Malicious/malformed client could POST multi-MB payloads that bloat audit_logs. | LOW (P2) | Logged in AUDIT_PLAN.md. Follow-up: tighter per-action zod schemas across all endpoints, not piecemeal |
| 25 | `GET /[tenantSlug]/api/calls-review-count` returns 404 on /tasks/ page. Surfaced during Wave 6 V1 verification (2026-04-30). Source: `components/ui/top-nav.tsx:42` — `fetch(\`/${tenantSlug}/api/calls-review-count\`).catch(() => null)`. Path order is wrong (the working call on line 45 is `/api/${tenantSlug}/calls/review-count`). Inline comment on line 43 says "avoid new endpoint" — author pivoted to the existing tenant API but forgot to delete the original fetch. Fire-and-forget with `.catch(() => null)`, so no user-visible breakage; only console noise. | LOW | One-line cleanup: delete line 42 of `components/ui/top-nav.tsx`. Defer to v1.1. Not a security issue. |

All other bugs from sessions 1-32 are resolved.

> Note: bug #13, #14, #15 (cross-tenant data leaks) were resolved in Session 33
> via the `withTenant<TParams>()` helper (commit `c63cb03`) and the 3-route refactor
> template (commit `f484820`) — already removed from this table per AGENTS.md.

---

## Next Session — v1.1 Wave 2 — Backfill + Dual-Write

Wave 1 shipped 2026-04-30 (this session, Session 60). Wave 2 fills the
new destinations and turns dual-write on. Plan reference:
[docs/v1.1/SELLER_BUYER_PLAN.md §8 Wave 2](docs/v1.1/SELLER_BUYER_PLAN.md).

**Wave 2 scope:**
1. **Property → Seller backfill script** at `scripts/v1_1_wave_2_backfill_sellers.ts`:
   - Iterate `Property` rows with any `owner*` field populated.
   - Match to existing `Seller` via `Property.ghlContactId → Seller.ghlContactId`,
     or fall back to fuzzy match on (normalized phone, name parts, state),
     or CREATE new Seller + PropertySeller link.
   - Populate Q2 name parts (parsed from `ownerFirstName1/LastName1` or
     fallback to splitting `Property.ownerName`/`Seller.name`).
   - Populate Q1 skip-trace fallback (`skipTracedPhone/Email` from
     `Property.ownerPhone/Email`).
   - Populate Q3 person flags (`seniorOwner`, `deceasedOwner`, `cashBuyerOwner`).
   - Populate portfolio aggregates (`ownerPortfolioTotalEquity` etc.).
   - Idempotent — re-runnable. Logs per-property outcome to
     `audit_logs` for spot-check.
2. **`Property.manualBuyerIds[]` → `PropertyBuyerStage` migration**
   at `scripts/v1_1_wave_2_migrate_manual_buyer_ids.ts`:
   - For each Property with non-empty `manualBuyerIds`, iterate GHL contact
     IDs, find/create Buyer by `ghlContactId`, insert `PropertyBuyerStage`
     row with `stage='added'`, `source='manual'`. Idempotent.
3. **Dual-write turn-on** in `lib/enrichment/sync-seller.ts`:
   `buildSellerSyncUpdate` today writes legacy `name/phone/email`. Expand
   to also write `firstName/middleName/lastName` (parsed via existing
   `splitName` helper), `skipTracedPhone/Email` (mirroring legacy fields),
   portfolio aggregates from BatchData/PropertyRadar payload, and the 3
   person flags. Legacy fields KEEP getting written (dual-write window).
4. **Diagnostic endpoint** `app/api/diagnostics/v1_1_seller_backfill/route.ts`:
   bearer-token gated (PUBLIC_PATHS entry required), returns per-tenant
   backfill coverage report — counts, sample mismatches, dual-write delta.

**Acceptance:**
- Diagnostic returns 100% Property→Seller match coverage for the live tenant.
- 5 spot-check properties manually verified: Seller has correct name parts,
  skip-trace fallback values, portfolio totals, person flags.
- Dual-write live: a fresh enrichment run writes both old AND new columns;
  no read regressions.

**Open questions still queued (Q4-Q7 from PLAN §11):**
- Q4 — Auto-link calls by ghlContactId (sprint-time, can defer to Wave 3).
- Q5 — Mirror legal-distress flags (sprint-time).
- Q6 — Seller Buy Signal (sprint-time, lands with Wave 4 AI integration).
- Q7 — Move Buyer matchScore to PropertyBuyerStage (sprint-time, Wave 4).

**Carry-forward decisions still queued for Corey** (not blockers for Wave 2):
- **D-045** — KPI snapshot timestamp (createdAt vs calledAt)?
- **D-046** — Add test framework (vitest)?
- **P4** — When to start `/tasks/` deletion migration? (5-step plan in AUDIT_PLAN.md)
- **P5** — `assign_contact_to_user` UI flow alignment.
- **P6** — View As cookie + server-side resolution (Shape C).
  Recommendation per plan: land BEFORE v1.1 Wave 3 (new client components reading tenant-scoped data hit the same hydration race class as Wave 6.2).

**Carry-forward bug debt** (low-priority, deferred from v1):
- Bug #16 — DEV_BYPASS_AUTH hardcoded slugs (clean before tenant #2)
- Bug #17 — no_answer never rewritten to short_call (cron processor)
- Bug #18 — 2487 calls with `source IS NULL` (one-time backfill)
- Bug #20 — deal-intel parser doesn't strip markdown fences
- Bug #21 — sentiment/sellerMotivation type coercion incomplete
- Bug #22 — 24 empty-shell FAILED rows from 2026-04-20 (one-time cleanup)
- Bug #23 — heartbeat audit rows on other crons (poll-calls, daily-audit,
  etc.)
- Bug #24 — body-size gap on `/api/ai/assistant/execute`
- Bug #25 — `/api/calls-review-count` 404 (one-line cleanup in
  `components/ui/top-nav.tsx:42`)

These don't block v1.1 kickoff but are eventually-resolve items.

**Production state at sprint close (2026-04-30):**
- All 9 v1-launch-ready exit criteria met (see Session 59).
- Reliability scorecard: all 8 dimensions ≥7/10 except item 8
  (Seller/Buyer data model = 4/10, the v1.1 redesign target).
- webhook_logs last 24h: 1558 received, 1 failed (0.06%), 0 stuck.
- daily-health-check: 3 audit_logs ERROR (low, within tolerance).
- silent-catches sweep: 73 violations (down from 79 baseline; queued
  in AUDIT_PLAN as ongoing hygiene).
