# GHL Multi-Pipeline Redesign + Bulletproof Bundle

**Owner:** Corey ([OWNER_EMAIL])
**Spec'd:** 2026-05-05 — 2026-05-06 (Phase 0 audit + close)
**Estimated effort:** ~6 days, six phases, each independently shippable
**Purpose:** Replace the trigger-stage-based property creation model with a
multi-pipeline lane-tracking model, fix the cross-contamination + drift
gaps from the audit, and verify the enrichment pipeline writes the right
data to the right columns.

---

## 0. Anti-drift discipline (read first, every session)

This plan represents weeks of architectural conversations and live audit
findings. Treat its decisions as **load-bearing**. Drift kills these
projects.

**Locked decisions — do not relitigate without explicit owner sign-off:**

1. **Three pipelines feed Gunner**: Sales Process → acquisition,
   Dispo → disposition, Follow Up → longterm. JV Deals removed from
   GHL entirely (replaced by native intake form).
2. **Strict-lane writes**: each pipeline writes only to its own status
   column. The 1-Month-FU exception is the only cross-lane write.
3. **Three independent status columns**: `acqStatus`, `longtermStatus`,
   `dispoStatus`. Not a single derived field. Per-pipeline progression
   is preserved exclusively.
4. **Per-lane opp-ID + stage-name + entered-at tracking** (3 × 3 = 9
   columns). Required because a single `ghlPipelineStage` field can't
   represent multiple lanes simultaneously.
5. **`SOLD` → `CLOSED`** rename. Drop `CONTACTED` and
   `APPOINTMENT_COMPLETED` (unused).
6. **BatchData stays shelved.** `ENRICHMENT_VENDORS_ENABLED` default
   `propertyradar,google`. Do not re-enable BD without owner sign-off.
7. **Skip-trace fully shelved.** Not in backfill, catch-up, or live
   webhook. Per-seller manual button is the only invocation path.
8. **Inventory page UI does not change.** Layout/pills/click-to-filter
   stays exactly as-is. The only inventory-card additions: days-in-stage
   label + pipeline name beside the existing stage pill.
9. **Phases are independently shippable.** Do not merge phases or skip
   verification steps. Roll back any single phase without affecting
   subsequent ones.
10. **Backfill skips enrichment.** Catch-up cron handles enrichment
    over time within daily budget. Do not run full enrichment during
    backfill — costs $1,500+ and takes hours.
11. **Reverse sync gated by feature flag**, default off. ~30 days of
    stable Phase 1-4 operation before flipping on.

**Rules of engagement during execution:**

- **Read this doc front-to-back at the start of any session that
  touches this work.** No exceptions.
- **No scope creep within a phase.** If you find a related improvement,
  log it in §11 ("Open Issues") and ship after this plan completes.
- **No "while I'm here" refactors.** Each phase is the minimum to ship
  its piece. The bulletproof bundle isn't done until Phase 5 is
  verified live.
- **Verification block at the end of each phase is non-negotiable.**
  Skipping verification = the phase isn't done.
- **PR config sensitivity.** `PROPERTYRADAR_API_KEY` must stay set on
  Railway. The diagnostic endpoint at `/api/diagnostics/pr-probe`
  exists to verify config after any future env changes.
- **CLAUDE.md production identifier hygiene applies.** No GHL pipeline/
  stage IDs, no tenant IDs, no API keys, no real addresses, no
  emails in committed files. Use placeholders.

---

## 1. Why we're doing this

### Problems with the current model

1. **Single-trigger model.** Today, only opps reaching `propertyTriggerStage`
   in Sales Process create properties. Other opps in any pipeline are
   silently ignored. JV deals, follow-up leads, and cold revivals don't
   round-trip cleanly.
2. **Cross-contamination.** All pipelines write to the same
   `Property.status` field via `updateMany({ ghlContactId })`. Moving an
   opp in Follow Up will overwrite the status set by Sales Process for the
   same contact, and vice versa.
3. **No drift detection.** If a webhook is missed (Railway deploy window,
   GHL outage, network flake), there's no reconciliation job. Lost leads
   stay lost.
4. **One-way sync.** Status changes in Gunner UI never push back to GHL.
   Reps who edit in-app silently diverge from GHL.
5. **JV deals don't fit GHL's data model.** One contact (the partner)
   brings many deals; reusing one opp + renaming/re-addressing each time
   is the team's current workaround. Doesn't scale.
6. **Enrichment fires per-property.** 5,000-property backfill at full
   enrichment ≈ $1,500+ in BatchData. Has to be decoupled.

### Target architecture

| GHL pipeline | Gunner lane | Effect when opp created in this pipeline |
|---|---|---|
| Sales Process | acquisition | Creates property if none exists for contact, updates `acqStatus` per stage |
| Dispo Pipeline | disposition | Flips `dispoStatus` on existing property; creates new only if no acq exists (rare) |
| Follow Up | longterm | Flips `longtermStatus` on existing property; skips + logs if no property exists |
| *(removed)* JV Deals | n/a | JV deals enter Gunner directly via a native intake form, not GHL |

**Key principle: each pipeline writes to its own lane only.** Three independent
status columns coexist; each pipeline's webhook only touches its column.
Exception: Sales Process at "1 Month Follow Up" stage may write
`longtermStatus = FOLLOW_UP` (the only cross-lane write Gunner allows).

---

## 2. Final stage maps (locked)

### Sales Process → `acqStatus` (+ 1-Month-FU exception → `longtermStatus`)

| GHL stage | Writes | Value |
|---|---|---|
| New Lead (1), Warm Leads(2), Hot Leads(2) | `acqStatus` | `NEW_LEAD` |
| Pending Apt(3), Walkthrough Apt Scheduled, Offer Apt Scheduled (3) | `acqStatus` | `APPOINTMENT_SET` |
| Made Offer (4) | `acqStatus` | `OFFER_MADE` |
| Under Contract (5) | `acqStatus` | `UNDER_CONTRACT` |
| Purchased (6) | `acqStatus` | `CLOSED` |
| **1 Month Follow Up** | `longtermStatus` (exception) | `FOLLOW_UP` |
| 4 Month FU, 1 Year FU, Ghosted Lead, Agreement not closed, SOLD-stage, DO NOT WANT | — | **NO-OP** (paired FU opp expected per strict mode) |

### Dispo Pipeline → `dispoStatus`

| GHL stage | Value |
|---|---|
| New deal, Clear to Send Out | `IN_DISPOSITION` |
| Sent to buyers, <1 Day — Need to Terminate | `DISPO_PUSHED` |
| Offers Received, With JV Partner | `DISPO_OFFERS` |
| UC W/ Buyer, Working w/ Title | `DISPO_CONTRACTED` |
| Closed | `CLOSED` |

### Follow Up → `longtermStatus`

| GHL stage | Value |
|---|---|
| New Lead, New Offer, New Walkthrough, 4 Month FU, 1 Year FU, Ghosted | `FOLLOW_UP` |
| Agreement Not Closed, SOLD, Trash | `DEAD` |
| Purchased | **NO-OP** (`CLOSED` not in lane) |

---

## 3. Schema changes

### New `Property` columns

| Column | Type | Purpose |
|---|---|---|
| `acqStatus` | enum (`AcqStatus`), nullable | Sales Process lane status |
| `longtermStatus` | enum (`LongtermStatus`), nullable | Follow Up lane status (+ 1-Month-FU exception from SP) |
| `ghlAcqOppId` | String?, indexed | Active SP opp tracking this property |
| `ghlDispoOppId` | String?, indexed | Active Dispo opp tracking this property |
| `ghlLongtermOppId` | String?, indexed | Active FU opp tracking this property |
| `ghlAcqStageName` | String? | Current SP stage display name (e.g., "Hot Leads(2)") |
| `ghlDispoStageName` | String? | Current Dispo stage display name (e.g., "Sent to buyers") |
| `ghlLongtermStageName` | String? | Current FU stage display name (e.g., "1 Year Follow Up") |
| `acqStageEnteredAt` | DateTime? | When SP opp entered current stage — drives days-in-stage label |
| `dispoStageEnteredAt` | DateTime? | When Dispo opp entered current stage |
| `longtermStageEnteredAt` | DateTime? | When FU opp entered current stage |
| `pendingEnrichment` | Boolean, default false | True if backfill-created and enrichment hasn't run yet |

**Why per-lane stage names + entered-at timestamps:** with three independent lanes, a single `ghlPipelineStage` + `stageEnteredAt` field can't represent all three pipelines simultaneously. Each lane gets its own stage-name and timestamp so the inventory card can show "Hot Leads(2) — 14 days" with the right pipeline's data.

### Migration of existing `Property.status` enum

| Old `status` value | New column / value |
|---|---|
| `NEW_LEAD` | `acqStatus = NEW_LEAD` |
| `CONTACTED` | dropped (unused) — migrate to `NEW_LEAD` |
| `APPOINTMENT_SET` | `acqStatus = APPOINTMENT_SET` |
| `APPOINTMENT_COMPLETED` | dropped (unused) — migrate to `APPOINTMENT_SET` |
| `OFFER_MADE` | `acqStatus = OFFER_MADE` |
| `UNDER_CONTRACT` | `acqStatus = UNDER_CONTRACT` |
| `SOLD` | `acqStatus = CLOSED` (renamed) |
| `IN_DISPOSITION`, `DISPO_PUSHED`, `DISPO_OFFERS`, `DISPO_CONTRACTED` | already in `dispoStatus` field — value preserved, column retyped (see below) |
| `DISPO_CLOSED` (in `dispoStatus`) | `dispoStatus = CLOSED` (renamed in same migration) |
| `FOLLOW_UP` | `longtermStatus = FOLLOW_UP` |
| `DEAD` | `longtermStatus = DEAD` |

After migration:
- `Property.status` column dropped entirely.
- `Property.dispoStatus` retyped from `PropertyStatus?` to a new dedicated
  `DispoStatus` enum: `{ IN_DISPOSITION, DISPO_PUSHED, DISPO_OFFERS,
  DISPO_CONTRACTED, CLOSED }`. The retype is a `USING CASE …` cast that
  also performs `DISPO_CLOSED → CLOSED` in the same statement.
- The old `PropertyStatus` enum is dropped (no remaining columns reference it).

### Dropped `Property` columns (legacy, superseded by per-lane equivalents)

- `Property.ghlPipelineId` (was the pipeline-id pin; replaced by per-lane
  `ghl{Acq,Dispo,Longterm}OppId` — those are opp IDs, not pipeline IDs)
- `Property.ghlPipelineStage` (replaced by `ghl{Acq,Dispo,Longterm}StageName`)
- `Property.stageEnteredAt` (replaced by `{acq,dispo,longterm}StageEnteredAt`)

These three are dropped in the same migration as `Property.status`. The ~53
read sites that reference them are rewritten in the same commit (the
"commit 1" of Phase 1, which is migration + read-site swaps as a single
atomic unit — see §6 sequencing note).

### New `TenantGhlPipeline` table

```prisma
model TenantGhlPipeline {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())
  tenantId      String
  ghlPipelineId String   // GHL pipeline ID
  track         String   // 'acquisition' | 'disposition' | 'longterm'
  isActive      Boolean  @default(true)
  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, ghlPipelineId])
  @@index([tenantId, track])
  @@map("tenant_ghl_pipelines")
}
```

### Dropped `Tenant` columns

- `propertyTriggerStage` (no longer used)
- `dispoTriggerStage` (no longer used)
- `propertyPipelineId` (replaced by `TenantGhlPipeline` row with track=acquisition)
- `dispoPipelineId` (replaced by `TenantGhlPipeline` row with track=disposition)

---

## 4. Per-property visibility rules

**Phase 1 visibility (status-presence-based — transitional rule):**

| Surface | Show if |
|---|---|
| Main inventory list | `acqStatus` IN {NEW_LEAD, APPOINTMENT_SET, OFFER_MADE, UNDER_CONTRACT, CLOSED} OR `dispoStatus` IS NOT NULL AND `dispoStatus` ≠ `CLOSED` |
| Follow Up view *(deferred)* | `longtermStatus = FOLLOW_UP` |
| Hidden / archived bucket | All other cases. Findable via "Show archived" toggle. **Never deleted.** |

**Why status-presence and not opp-ID-presence in Phase 1:** existing
properties don't have `ghl{Acq,Dispo,Longterm}OppId` populated until
Phase 2 backfill runs (today's `Property.ghlPipelineId` stores the
*pipeline* ID, not an opp ID — there's no source for opp IDs on
existing rows during the schema migration). Visibility based on the
status column instead keeps existing properties visible after Phase 1
ships, which is required by the §6 verification block.

**Phase 2+ visibility (post-backfill — tightened rule):** once the
backfill has populated `ghl{Acq,Dispo,Longterm}OppId` on every row that
should be visible, the rule tightens to require the opp ID:
*(ghlAcqOppId set AND acqStatus IN {…}) OR (ghlDispoOppId set AND
dispoStatus ≠ CLOSED)*. Decision logged in §13. The tightening lands as
a separate inventory-query change after Phase 2 backfill verification.

When a webhook handler runs on `OpportunityDeleted`, it clears the matching
`*OppId` field. Status values stay intact. If a new opp arrives later for
the same contact in the same pipeline, the field gets repopulated and the
property re-pops in the right view.

---

## 4b. UI constraints (locked 2026-05-05)

**The inventory page UI does NOT change in any visual way.** Layout, pipeline visualization, status pills, sorting, click-to-filter — all stays exactly as-is. The only inventory-page additions in this work:

1. **Days-in-stage label** on each property card. Computed from the appropriate per-lane `*StageEnteredAt` field. Format: "14 days in Hot Leads(2)".
2. **Pipeline name + actual GHL stage name** on each property card (currently `ghlPipelineStage` shows the stage name; we just verify this keeps working post-refactor and add the pipeline name beside it).
3. **Click-on-stage filtering** — already works today via `selectedStage` state ([components/inventory/inventory-client.tsx:119](components/inventory/inventory-client.tsx#L119), `onStageSelect` at line 225). Verify it continues to filter correctly with the new per-lane status columns.

**Stage label resolution rule** (which lane's stage shows on the card):
- If `ghlDispoOppId` set AND `dispoStatus` ≠ `CLOSED` → show `ghlDispoStageName` ("Sent to buyers — 5 days in Dispo Pipeline")
- Else if `ghlAcqOppId` set → show `ghlAcqStageName` ("Hot Leads(2) — 14 days in Sales Process")
- Else if `ghlLongtermOppId` set → show `ghlLongtermStageName` ("1 Year Follow Up — 92 days in Follow Up")

Property detail page (separate from list cards) displays all three lanes side-by-side regardless.

## 4c. Sync requirements (locked, no-regression)

Two sync paths that must keep working through this refactor:

1. **Inbound — GHL stage update → Gunner field update.** When an opp moves stages in GHL, the matching lane's status + stage-name + stage-entered-at on the Gunner property update within seconds. Phase 1 webhook handler refactor MUST preserve this. Verification: trigger a stage move in each pipeline, confirm Gunner reflects it.
2. **BatchData stays shelved.** `ENRICHMENT_VENDORS_ENABLED` default = `propertyradar,google` (BD off). The new code paths must not re-enable BD by accident. The enrichment catch-up cron (Phase 3) will only call BD if it's explicitly enabled in the env var. Phase 0 audit verifies BD is off in the live config and stays off.

## 5. Phase 0 — Vendor audit (½ day)

Before any schema work, verify what enrichment is actually running and that
PropertyRadar data points are mapped to the right Property columns.

### Tasks

1. Print the live `ENRICHMENT_VENDORS_ENABLED` env var on Railway.
   Confirm with Corey.
2. Read `lib/propertyradar/client.ts` + `lib/batchdata/enrich.ts`
   (`buildDenormUpdate`) to map every PR field returned to its Property
   column.
3. Run a one-off script that picks 5 random recently-created properties
   and prints: vendor blob received, columns written, columns NULL when
   data was available. Identifies missing mappings.
4. Same for Google + CourtListener if enabled.
5. Document gaps in this plan doc (append to Section 11 — Open Issues).
6. Fix any mapping gaps before Phase 1 ships. Schema migration will pick up
   the corrected mappings.

### Deliverables

- Confirmed list of enabled vendors
- Audit report appended to this plan
- Any mapping fixes merged to main before Phase 1

---

## 6. Phase 1 — Schema + handlers + safety harness (~2 days)

### Sequencing (commit boundaries)

Phase 1 ships in **two commits**, each atomic and independently
verifiable. The original "first commit = migration only" target is
relaxed because dropping `Property.status` + 3 legacy `Property` columns
breaks the TypeScript build for ~53 read sites — those swaps must ride
in the same commit as the column drop, otherwise prod doesn't compile.

**Commit 1 — Schema migration + read-site swaps (no behavior change):**

1. Prisma migration: new Property columns, new TenantGhlPipeline table,
   data copy from `status` to `acqStatus`/`longtermStatus`, retype
   `dispoStatus` to new `DispoStatus` enum (with `DISPO_CLOSED → CLOSED`
   in the cast), drop `Property.status` + `Property.ghlPipelineId` +
   `Property.ghlPipelineStage` + `Property.stageEnteredAt`, drop
   `PropertyStatus` enum. Reverse migration kept in
   `prisma/migrations/<ts>_phase1_multi_pipeline/down.sql`.
2. Backfill `tenant_ghl_pipelines` rows from existing
   `Tenant.propertyPipelineId` + `Tenant.dispoPipelineId` (one row per
   non-null value, track set per source field). `Tenant` columns
   themselves stay until commit 2.
3. Read-site swaps: every reference to dropped fields rewritten to use
   the new per-lane equivalents. Webhook handler keeps single-trigger
   logic but writes to the new field names. Inventory query updated to
   the §4 status-presence visibility rule.
4. `npx tsc --noEmit` exit 0.

**Commit 2 — Lane-aware handler + Settings + Tenant cleanup:**

5. Webhook handler refactor — three lane-aware paths
   (`OpportunityCreate` / `OpportunityUpdate` / `OpportunityDelete`,
   matching real GHL event names — note the plan's earlier "ed"
   spelling was wrong). Pipeline filter on stage updates per §0
   decision #2 (strict-lane writes).
6. Settings UI — pipeline picker rebuilt as "list of pipelines per
   track" sourced from `tenant_ghl_pipelines`. Writes go to the new
   table, not to dropped `Tenant.*PipelineId` columns.
7. Token mutex on `getGHLClient` (closes audit gap C.3).
8. "Show archived" toggle on inventory.
9. Second migration drops `Tenant.propertyPipelineId`,
   `Tenant.propertyTriggerStage`, `Tenant.dispoPipelineId`,
   `Tenant.dispoTriggerStage`. Read sites for these (settings UI,
   onboarding, `app/api/tenants/config`, `lib/db/settings.ts`,
   `lib/ghl/webhooks.ts`) are rewritten in this commit.
10. `npx tsc --noEmit` exit 0.

### Tasks (legacy view — preserved for cross-reference)

1. **Schema migration** (~½ day) — see commit 1 above
2. **Webhook handler refactor** (~1 day) — see commit 2
3. **Token mutex on `getGHLClient`** (~1 hour) — see commit 2
4. **Settings UI updates** (~½ day) — see commit 2
5. **Visibility filter logic** (~few hours) — split: status-presence
   rule lands in commit 1; "Show archived" toggle lands in commit 2

### Webhook event name correction

GHL's actual event names are `OpportunityCreate`, `OpportunityUpdate`,
`OpportunityDelete` (no trailing *d*). The plan's earlier `Created` /
`Deleted` references were incorrect; corrected throughout this section.
`OpportunityStageChanged` is also valid as an alias for
`OpportunityUpdate` in some GHL configurations — both must be handled.

### Pipelines not in `tenant_ghl_pipelines`

When a webhook arrives for a pipeline that isn't registered in
`tenant_ghl_pipelines`, the handler logs an `INFO` audit row
(`ghl.webhook.unlistened_pipeline`) and returns. No property creation,
no status update. Important during the GHL-side JV pipeline removal
window — those events can keep arriving and we should ignore them
silently rather than creating ghost rows.

### `Property.ghlSyncLocked` semantics under three lanes

The existing `ghlSyncLocked` boolean continues to lock **all three
lanes** (single-flag carry-forward). When set, none of the
`acqStatus` / `dispoStatus` / `longtermStatus` fields are updated by
the webhook handler. Per-lane locking would be a follow-up if the
split-pair workflow needs it.

### Deliverables

- Live deploy with new schema, no behavior change for existing properties
- Settings UI shows the three pipelines as listening targets
- New properties from real webhooks correctly track into the right lane
- Safe to roll back: schema migration is reversible if no backfill has run

### Verification

- `npx tsc --noEmit` exit 0
- Trigger an opp creation in each of the three pipelines (test contact),
  verify the right lane fields populate
- Trigger an opp deletion, verify only the matching `*OppId` clears
- Confirm existing properties (~72 in last 7d) still appear in inventory

---

## 7. Phase 2 — Backfill from GHL (~1 day)

### Tasks

1. **Backfill script** (`scripts/backfill-ghl-pipelines.ts`)
   - Reads `TenantGhlPipeline` table for active listening pipelines
   - For each tenant, for each pipeline, paginates GHL opportunities
     using cursor-based pagination (~100 opps/page)
   - Throttles to ~5 GHL API calls/sec to stay under rate limits
   - For each opp:
     - Find or create the contact (Seller) in Gunner
     - Find or create the Property (dedup by tenantId + ghlContactId)
     - Set the matching `*OppId` and lane status
     - Mark `pendingEnrichment = true` — backfill does NOT enrich
     - Audit log entry: `enrich.property.deferred_backfill`
   - Per-tenant per-pipeline progress checkpointed in a `BackfillCursor`
     table — resumable on partial failure
2. **Dry-run mode** (`--dry-run` flag)
   - Reports "would create N properties, M sellers, link X opps" without
     writing
   - Required first run before real backfill
3. **Run order**
   - Phase 1 schema deployed and verified live
   - Backfill dry-run, results reviewed by Corey
   - Backfill real run, off-hours
   - Spot-check 10 random properties

### Deliverables

- Backfill script in `scripts/`
- Backfill cursor table for resumability
- Run report after dry-run (counts, no writes)
- Run report after real run (counts, errors, duration)

### Risks + mitigations

| Risk | Mitigation |
|---|---|
| GHL rate limit | 5 req/sec throttle + cursor pagination |
| Token expiration mid-run | Token mutex from Phase 1 |
| Connection pool exhaustion | Sequential per tenant, no parallelism |
| Duplicate property creation | Idempotent upsert via existing `createPropertyFromContact` dedup |
| Webhook collisions during backfill | Both paths use same upsert logic — latest write wins, no data loss |
| OOM on large opp lists | Cursor pagination keeps memory constant |
| Long-running blocks deploys | Manual invocation, not a Next.js cron |

---

## 8. Phase 3 — Enrichment catch-up cron (~½ day)

### Tasks

1. **Cron in `railway.toml`** runs hourly, picks ~5 properties with
   `pendingEnrichment = true`, runs full enrichment, clears flag.
2. **Throttled by daily budget** — checks `BATCHDATA_DAILY_BUDGET_USD`
   (default $15/day) and skips if exceeded.
3. **At default rate**: 5,000 properties × $0.30 BatchData = ~100 days.
   At $15/day, this catches up over ~14 weeks.
4. **Override**: bump `BATCHDATA_DAILY_BUDGET_USD` env var on Railway to
   accelerate.
5. **Manual override**: per-property "Enrich now" button in Gunner UI
   (already exists at `app/api/properties/[propertyId]/enrich/route.ts`
   if it exists, else add).

### Skip-trace policy

Per Corey 2026-05-05: **skip-trace fully shelved.** Not run during
backfill, not run during catch-up, not run during live webhook
enrichment. The orchestrator passes `opts.skipTrace=false` always.
Per-seller manual "Skip trace" button stays available but is the only
way it ever fires.

### JV intake form enrichment

Per Corey 2026-05-05: **enrich immediately on submit.** PR + Google
(+ CourtListener if enabled) fire as part of the JV intake form
submission, not deferred to the catch-up queue. These are
partner-pre-qualified deals worth the immediate spend.

### Deliverables

- New cron entry
- Audit log entries for catch-up runs
- Verification: 7 days post-deploy, enrichment count = 5×24×7 = ~840 properties

---

## 9. Phase 4 — Bulletproof additions (~1.5 days)

### 9.1 Daily reconciliation cron

- Runs nightly at 4am UTC (off-hours, after KPI snapshots)
- For each tenant, for each listening pipeline, fetches last 7 days of
  opps from GHL
- Compares to Gunner: any opp that should have created a property but
  didn't? Any opp whose stage doesn't match Gunner's status?
- Logs discrepancies to `auditLog` with severity WARNING
- If > 5 discrepancies in 24h, write a critical alert

### 9.2 Retry queue for failed `getContact` calls

- New `pending_property_creations` table:
  `{ tenantId, ghlContactId, ghlPipelineId, ghlOppId, retryCount, nextRetryAt, status }`
- On `getContact` failure inside webhook handler, write a row instead of
  returning null
- Reconciliation cron picks up rows where `status='pending'` and
  `nextRetryAt < now`, retries with exponential backoff
- After 5 retries (spread over ~6h), marks as `failed` and logs ERROR

### 9.3 Reverse sync — Gunner UI → GHL

- PATCH `/api/properties/[propertyId]/route.ts`: when `acqStatus`,
  `longtermStatus`, or `dispoStatus` changes via UI, call GHL's
  `updateOpportunityStage` for the matching `*OppId`
- Reverse stage map (Gunner status → GHL stage) using existing
  `lib/ghl-stage-map.ts` keyed-inverse
- Behind feature flag `REVERSE_SYNC_ENABLED` (default false initially —
  opt-in for testing)
- Failures logged to auditLog, no UI error (writeback is best-effort)

### Deliverables

- Reconciliation cron + audit log entries
- Retry table + cron handler
- Reverse sync wired with flag
- Verification: drop a webhook intentionally, confirm reconciliation
  catches it within 24h

---

## 10. Phase 5 — JV intake form (~½ day)

### Tasks

1. **New page** at `/{tenant}/inventory/log-jv-deal` OR a "Log Deal"
   button on the Partners page (each partner detail page or the partners
   list)
2. **Form fields**:
   - Partner: dropdown picker from Partners list (required)
   - Address, city, state, zip (required)
   - Asking price, ARV, contract price, assignment fee (optional)
   - Notes (optional)
3. **Submit handler**: in one transaction:
   - Create Property row (acqStatus=NEW_LEAD, leadSource='JV Partner',
     ghlPipelineId=null, ghlAcqOppId=null)
   - Create PropertyPartner row (role='sourced_to_us', linked to picked
     partner)
   - Audit log entry: source='JV_INTAKE', action='property.created'
   - Mark `pendingEnrichment=true` so the catch-up cron picks it up
   - Optional: trigger immediate enrichment if Corey wants JV deals
     enriched faster than the queue
4. **Visibility**: appears in main inventory immediately at NEW_LEAD

### Decision needed

- "Enrich JV deals immediately or queue them?" — Recommend immediate, since
  these are typically partner-pre-qualified deals worth the spend.

---

## 11. Open issues (filled in during execution)

*(Append findings here as each phase runs.)*

### Phase 0 vendor audit findings (2026-05-06)

**Live vendor state (last 7 days, 65 enrichment runs):**

| Vendor | Status | Ran | Matched |
|---|---|---|---|
| PropertyRadar | ⚠️ ON but broken | 65/65 | **0/65** |
| Google Places | ✅ Working | 65/65 | 65/65 |
| BatchData | ✅ Off (as intended) | 0/65 | n/a |
| CourtListener | ✅ Off | 0/65 | n/a |
| Skip-trace | ✅ Off (as intended) | 0/65 | n/a |

**🚨 BLOCKER: PropertyRadar is producing zero data.**

Every property creation in the last 7 days:
- PR call fired (`ran=true`)
- PR returned no match (`matched=false`)
- No PR fields land on the Property row
- `fieldSources` shows only `ai` (5 fields) and occasionally `api` (Google's 7-8 columns)

The PR client returns null in two cases:
1. API call returns non-200 (logged to console.error but not to DB)
2. Search response has empty `results[]` (logged as "no match for {addr}")

We can't distinguish between these from audit logs alone. Need to check Railway server logs for `[PropertyRadar]` entries to know which case is hitting.

**Why Phase 1 must wait on this:**

Today, properties have ~30 non-null fields out of 270 (11% capacity). Vendor enrichment is supposed to fill ~50-100 of those columns from PR alone. If we ship the new schema + handlers without fixing PR, we lock in the broken state across new code paths and the backfill creates 5,000 properties with no PR data.

**Diagnosis path (for Corey):**

1. Check Railway logs for last 24h: `grep '\[PropertyRadar\]' | head -50` — look for "search API error: 401/403/404/etc" vs "no match for".
2. Verify `PROPERTYRADAR_API_KEY` env var on Railway is current and the PR account has search credits.
3. Test directly: `curl -H "Authorization: Bearer $KEY" "https://api.propertyradar.com/v1/properties?Purchase=0&Limit=1" -d '{"Criteria":[{"name":"Address","value":["318 Caruthers Ave"]},{"name":"City","value":["Hohenwald"]},{"name":"State","value":["TN"]},{"name":"ZipFive","value":["38462"]}]}'` — see if results come back.
4. If API returns matches but our code doesn't, there's a parsing bug in `lib/propertyradar/client.ts:91` (`searchBody.results?.[0]`).
5. If API returns no matches, the search criteria format may need adjustment (e.g., PR may want street-name only without "Ave"/"St" suffix).

**Mapping coverage (when PR works):**

`lib/propertyradar/client.ts:lookupProperty` returns ~80 normalized fields including: structural (beds/baths/sqft/yearBuilt), valuation (AVM, equity, mortgage detail), distress signals (foreclosure status, tax delinquent, in-probate, vacant), MLS (listing dates/prices/days on market), tax (assessed value, annual tax), and owner identity (firstName/lastName, age, gender, occupation). All 80 routed through `lib/batchdata/enrich.ts:buildDenormUpdate` to typed Property columns.

The Property schema has ~270 columns total, including PR-fillable like `availableEquity`, `estimatedEquity`, `openMortgageBalance`, `distressScore`, `isRecentFlip`, `inProbate`, `inDivorce`, `mlsListingPrice`, `foreclosureFilingDate`, `salePropensity`, etc. **The mapping CODE is comprehensive** — the problem is upstream (PR not returning data).

**Google Places coverage:**

Working as expected. Writes 7-8 Google-prefixed columns per property: `googlePlaceId`, `googleVerifiedAddress`, `googleLatitude`, `googleLongitude`, `googleStreetViewUrl`, `googleMapsUrl`, `googlePhotoThumbnailUrl`, `googlePlaceTypes`. Image-only — does not provide structural/valuation data.

**Field sources distribution (5 random properties):**

| Property | Field sources |
|---|---|
| 318 Caruthers Ave, Hohenwald TN | `{ai: 5}` — only AI |
| 208 Bank Ave, Rocky Top TN | `{api: 8}` — Google + maybe one PR field |
| 1963 Thrasher Pike, Chattanooga TN | `{ai: 5}` — only AI |
| 4393 Washington Rd, Greenbrier TN | `{ai: 5}` — only AI |
| 124 Helton Rd, Lewisburg TN | `{ai: 5}` — only AI |

AI enrichment writes ~5 fields per property (description, repair estimate, rental estimate, neighborhood summary, ARV — Claude estimates). PR writes 0. Google writes ~7-8 image/address columns when matched.

**Phase 0 recommendation:** PAUSE Phase 1 until PR is producing matches. The fix is in PR config or PR API call construction, not in our code's mapping logic. Likely a 1-2 hour fix once we have access to PR account / Railway logs.

### Phase 0 RESOLVED (2026-05-06)

**Root cause:** `PROPERTYRADAR_API_KEY` was never set in Railway env. Verified via Railway CLI — listed all 35 env vars, key was genuinely absent. The PR client's outer try/catch silently swallowed the "not configured" exception, returning null on every call. Audit logs showed `matched=false` with no error field.

**Fix applied:**

1. Set `PROPERTYRADAR_API_KEY` on Railway via `railway variables --set` (commit message scrubbed of value).
2. Shipped `PropertyRadarConfigError` marker class (commit `0918495`) so future missing-key situations propagate to `result.propertyRadar.error` instead of being collapsed into `matched=false`. Visibility-only — no behavior change.

**Verification (commit `8036931` enriched a real property end-to-end):**

- Test property: [TEST_PROPERTY_ADDRESS]
- Raw PR probe with `Purchase=1`: HTTP 200, 1 result, `radarIdFound: true`, full data (AVM $303,059, 1,169 sqft, year built 1991, distress flags populated)
- Full `enrichProperty()` orchestrator run:
  - `propertyRadar: {ran: true, matched: TRUE}` (was matched=0 before)
  - `google: {ran: true, matched: true}` (unchanged)
  - `batchdata: skipped='env_disabled'` (correctly shelved)
- Property columns populated post-enrichment: `availableEquity`, `baths`, `sqft`, `yearBuilt`, `advancedPropertyType`, `latitude`, `longitude`, `apn`, `fieldSources`. (Pre-fix: only AI-sourced description/repair/rental estimates.)

**Diagnostic endpoint stays:** `app/api/diagnostics/pr-probe` is left in place as a documented admin tool. Token-gated (DIAGNOSTIC_TOKEN bearer). Use `?purchase=1` for real data, `?enrich=1` for full orchestrator path. Useful for verifying PR after future config changes.

**Phase 0 status: ✅ CLOSED. Phase 1 can start.**

**Mapping coverage notes** (validated by the post-fix probe):

- 80+ PR fields normalized through `lib/propertyradar/client.ts` → routed via `buildDenormUpdate` to typed Property columns. All mapped.
- The previously-observed 11% column fill rate (~30/270) will improve dramatically as new webhooks fire — expect ~50-80 PR-derived columns populated per property.
- Existing 65 properties created in last 7 days with the bad key remain at 11%. They can be back-enriched via the catch-up cron from Phase 3 (or manually via the per-property re-enrich button).

### Phase 2 backfill report

- **Total opps fetched from GHL**: TBD
- **Properties created**: TBD
- **Sellers created**: TBD
- **Errors / skipped**: TBD

---

## 12. Verification + rollback

### Per phase

Each phase has a verification block in its section. Roll back any phase
without affecting subsequent ones — phases are independently shippable.

### End-to-end (after Phase 5)

1. **Live opp test**: create test opps in each of the three pipelines.
   Verify each lands in the right lane in Gunner with the right status.
2. **Lane isolation**: move a Sales Process opp to a stage. Confirm the
   matching property's `acqStatus` updates and nothing else does.
3. **Deletion test**: delete one of those test opps. Confirm matching
   `*OppId` clears, property still exists, status fields unchanged.
4. **Reverse sync test**: change a property's status in Gunner UI.
   Verify GHL opp moved to the corresponding stage.
5. **JV intake test**: submit the form. Verify property + PropertyPartner
   row created, no GHL involvement.
6. **Backfill spot check**: pick 10 random backfill-created properties.
   Verify status, opp ID, partner link (if applicable) match GHL state.
7. **Reconciliation test**: temporarily block one webhook (firewall block
   or manual disable). Wait 24h. Verify reconciliation cron caught it
   and logged the discrepancy.
8. **Enrichment catch-up**: 7 days post-deploy, count properties with
   `pendingEnrichment=false`. Should be ~5×24×7 = 840 (assuming default
   $15/day budget).

### Rollback

- Phase 1 schema is reversible via inverse migration (kept in
  `prisma/migrations/`).
- Phase 2 backfill: `pendingEnrichment=true` flag identifies
  backfill-created properties; can be cleaned up with a single delete
  query if needed.
- Phase 3 enrichment cron: disable via env var.
- Phase 4 reverse sync: feature flag default off, no rollback needed.
- Phase 5 JV intake: hide form via permission flag.

---

## 13. Decisions log

- 2026-05-05: GHL JV Deals pipeline removed — Gunner-native intake form
  replaces it. Reason: GHL's one-opp-per-contact model doesn't fit
  "one partner brings many deals."
- 2026-05-05: Strict-lane mode chosen over pragmatic. Reason: Corey's team
  is disciplined about pairing SP terminal stages with corresponding FU
  pipeline opps.
- 2026-05-05: Three independent status columns chosen over single
  derived field. Reason: lane-exclusive tracking required so each
  pipeline's progression is preserved in property detail.
- 2026-05-05: `SOLD` enum value renamed to `CLOSED`. Reason: removes
  ambiguity between acq end-state ("we bought it") and dispo end-state
  ("we sold it"). Both lanes now use `CLOSED` in their own column.
- 2026-05-05: Backfill skips enrichment. Catch-up cron handles
  enrichment over time. Reason: 5,000-property × $0.30 BatchData would be
  $1,500+ in one run; default $15/day budget makes that infeasible.
- 2026-05-05: Skip-trace stays opt-in. Reason: $0.07/seller × thousands
  of sellers adds up; per-seller "Skip trace" button covers the
  high-value cases.
- 2026-05-05: Reverse sync gated by feature flag, default off. Reason:
  changes the surface that GHL trusts; opt-in lets Corey verify on a
  small subset before turning on globally.
- 2026-05-06: Phase 1 visibility uses status-presence (loosened from
  the original `ghl{Acq,Dispo,Longterm}OppId`-set rule). Reason:
  existing rows have no opp IDs at migration time (today's
  `Property.ghlPipelineId` is a *pipeline* ID, not an opp ID);
  visibility based on the status column instead keeps existing
  properties visible after Phase 1 ships. The opp-ID-based rule
  tightens after Phase 2 backfill populates the new columns.
- 2026-05-06: Dedicated `DispoStatus` enum created (not reuse of
  legacy `PropertyStatus`). Reason: `Property.status` column dropped
  in Phase 1, the old enum has no remaining columns referencing it;
  splitting the enum into `AcqStatus` / `DispoStatus` /
  `LongtermStatus` gives type safety per lane. `DISPO_CLOSED → CLOSED`
  rename happens in the same `ALTER TABLE … TYPE` cast.
- 2026-05-06: Three legacy `Property` columns dropped in Phase 1
  migration: `ghlPipelineId`, `ghlPipelineStage`, `stageEnteredAt`.
  Reason: each is superseded by per-lane equivalents (`ghl{Acq,Dispo,
  Longterm}OppId` — note opp not pipeline, `ghl{Acq,Dispo,Longterm}
  StageName`, `{acq,dispo,longterm}StageEnteredAt`). Keeping the
  legacy columns as deprecated would invite bit-rot.
- 2026-05-06: `pipelineName` NOT added to `tenant_ghl_pipelines`.
  Reason: inventory cards use a hard-coded lane label ("Sales
  Process" / "Dispo" / "Follow Up") rather than the tenant's actual
  GHL pipeline name. If multi-tenant rollout requires per-tenant
  pipeline naming later, the column is a 5-minute add.
- 2026-05-06: Phase 1 ships in two commits, not one. Reason: dropping
  `Property.status` + 3 legacy columns breaks the TS build for ~53
  read sites; they must ride together. Lane-aware handler refactor
  + Settings UI + Tenant column drops ride in commit 2 so each
  commit is independently verifiable on prod.

---

## 14. Owner sign-off

Corey to review this doc and confirm before any Phase 1 code touches the
repo. Outstanding items to confirm:

- [ ] Vendor audit findings (Phase 0) acceptable
- [ ] PR mapping gaps fixed before Phase 1 ships
- [ ] Backfill dry-run results (Phase 2) acceptable
- [ ] Real backfill executed off-hours
- [ ] Reverse sync default off until ~30 days of stable Phase 1-4 operation

---

*End of plan.*
