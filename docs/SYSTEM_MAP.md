# SYSTEM_MAP.md — Gunner AI

> The canonical "what exists right now" snapshot of the system.
> Slow-changing: philosophy, stack, modules, AI layer, call pipeline, safety gate pattern.
> Fast-changing items (crons, page roster, blockers, hygiene scripts, schema-change log) live in `docs/OPERATIONS.md`.
> Updated 2026-04-27 — Session 43 state.

---

## What this is

**Gunner AI** is an AI-first revenue intelligence layer for wholesale real estate
teams. Sits on top of Go High Level (GHL); does not replace it. Three things it
does: (1) grades every sales call automatically with Claude AI, (2) manages
wholesale property inventory with multi-vendor enrichment + auto-populated KPIs,
(3) scores leads with True Conversion Probability (0.0–1.0 ensemble model).

---

## Reading order for a new session

1. **CLAUDE.md** — non-negotiable rules (8 rules + hard tech rules) and Session Start Protocol.
2. **AGENTS.md** — agent conventions (worker pattern, withTenant, tool contract, heartbeat).
3. **PROGRESS.md** — current session state, What's Built, Known Bugs, Next Session pointer.
4. **docs/SYSTEM_MAP.md** (this file) — current architecture snapshot.
5. **docs/OPERATIONS.md** — current operational state (crons, blockers, scripts).
6. **docs/DECISIONS.md** — only when about to reverse or extend an architectural decision.
7. **docs/AUDIT_PLAN.md** — only when working on an active blocker or audit.

Older session detail in `docs/SESSION_ARCHIVE.md`. Superseded orientation docs
in `docs/archive/` (after sprint Commit #5).

---

## Stack — locked

| Layer | Tech | Entry point |
|---|---|---|
| Framework | Next.js 14.2 App Router | `next.config.js`, `instrumentation.ts` |
| Language | TypeScript strict | `tsconfig.json` |
| Database | PostgreSQL via Supabase + pgvector + Supabase blob storage | `prisma/schema.prisma` |
| ORM | Prisma | `lib/db/client.ts` |
| Auth | NextAuth.js v4 | `lib/auth/config.ts`, `lib/auth/session.ts` |
| AI — grading + deal intel + next-steps | Anthropic Claude Opus 4.6 (extended thinking) | `lib/ai/grading.ts`, `lib/ai/extract-deal-intel.ts` |
| AI — coach + profiles + property story | Anthropic Claude Sonnet 4.6 | `lib/ai/coach.ts`, `lib/ai/generate-user-profiles.ts`, `lib/ai/generate-property-story.ts` |
| AI — legacy property enricher | Anthropic Claude Sonnet 4 (date-pinned snapshot — P3 in AUDIT_PLAN) | `lib/ai/enrich-property.ts` |
| AI SDK | `@anthropic-ai/sdk` v0.90 (streaming + extended thinking) | — |
| Embeddings | OpenAI `text-embedding-3-small` | `lib/ai/embeddings.ts` |
| Transcription | Deepgram | `lib/ai/transcribe.ts` |
| CRM | Go High Level OAuth Marketplace App | `lib/ghl/client.ts` |
| Property data vendors | PropertyRadar (primary) + Google Street View (Inventory images) — default. BatchData / CourtListener / RentCast / RealEstateAPI gated off by env allowlist `ENRICHMENT_VENDORS_ENABLED` (Session 66, 2026-05-03). Set the env var to re-enable any subset; see `lib/enrichment/vendor-flags.ts`. | `lib/enrichment/`, `lib/propertyradar/`, `lib/batchdata/`, `lib/courtlistener/`, `lib/rentcast/`, `lib/realestateapi/`, `lib/google/`, `lib/storage/` |
| Lead Scoring | TCP — 8-factor weighted ensemble | `lib/ai/scoring.ts` |
| Billing | Stripe (built, gated by env vars) | `lib/stripe/index.ts` |
| Styling | Tailwind CSS | `tailwind.config.ts` |
| Deploy | Railway + Supabase | `railway.toml` |
| Live tenant | New Again Houses (slug `new-again-houses`, GHL location `[GHL_LOCATION_ID]`, pipeline `[PIPELINE_ID]`, trigger stage `[TRIGGER_STAGE_ID]` — real values in Railway env + database) | — |
| Production URL | `[PRODUCTION_URL]` (real value in Railway env + `.env.local`) | — |
| Repo | `c7lavinder/Gunner-Claude` (private) | — |

---

## Architectural philosophy

### GHL boundary — the most important decision in the system

Gunner enhances GHL. It does not replace it.

| Owns | Source of truth |
|---|---|
| **GHL** | Contacts, conversations, messages, appointments, calendars, pipelines, stages, tasks, call recordings + metadata |
| **Gunner** | Properties (ARV, repairs, equity, MAO, assignment fee, status), call grades + rubrics + coaching, KPI snapshots + milestones, buyer activity + deal blasts, role configs + permissions, AI logs, deal intel (cumulative across calls), property stories, vendor enrichment data, **deal-side metadata for Sellers / Buyers / Partners** (their performance with us, market focus, reputation, role + economics on each Property — contact identity itself still lives in GHL via `ghlContactId`. `Partner.types[]` covers agent / wholesaler / attorney / title / lender / inspector / contractor / etc.) |

If GHL can store it natively, we do not duplicate. We only build what GHL cannot.

GHL writes go through `lib/ghl/client.ts`. Webhooks come in via
`app/api/webhooks/ghl/route.ts` → `lib/ghl/webhooks.ts`. Direct seller-visible
writes (SMS, email, blast) go through `lib/gates/requireApproval.ts` for any
bulk action.

### Data contract rule (CLAUDE.md Rule 1)

Every settings field has an explicit data contract before it's built:

1. **WRITES TO**: exact Prisma table + column + type
2. **READ BY**: exact file + function + query that consumes it

Write-path key === read-path key. Identical Prisma field names. Always via
`updateTenantSettings()` in `lib/db/settings.ts`.

If both ends aren't defined and verified identical, the UI doesn't get built.
This rule killed the prior build when ignored.

### No text inputs for GHL mappings (CLAUDE.md Rule 2)

Every GHL field mapping is a `<GHLDropdown>` (`components/ui/ghl-dropdown.tsx`)
populated by a live GHL API call, storing GHL IDs (not display names).

| Field type | GHL endpoint |
|---|---|
| Pipeline | `GET /opportunities/pipelines` |
| Stage | derived from selected pipeline |
| Custom field | `GET /locations/{id}/customFields` |
| Assigned user | `GET /users` (location scoped) |
| Calendar | `GET /calendars` |

### Single Settings Hub — 7 sections (CLAUDE.md Rule 3)

All configuration at `/{tenant}/settings`. No gear icons on individual pages.

| # | Section | Data contract target |
|---|---|---|
| 1 | Integrations | `tenants.ghl_access_token`, `ghl_location_id` |
| 2 | Pipeline | `tenants.property_pipeline_id`, `property_trigger_stage` |
| 3 | Team | `users` table, role assignments, hierarchy |
| 4 | Calls | `tenants.call_types`, `call_rubrics` table |
| 5 | Inventory | `tenants.config → inventory_fields` |
| 6 | KPIs | `role_configs` table, `kpi_snapshots` |
| 7 | Day Hub | `role_configs.task_categories` |

### TCP — True Conversion Probability (CLAUDE.md Rule 5)

Lead scoring 0.0–1.0 in `lib/ai/scoring.ts`. 8-factor weighted ensemble:
call sentiment, prior touch count + recency, property equity %, seller
motivation, days since first contact, appointment set/no-show history,
pipeline stage velocity. Stored in `properties.tcp_score`. Recalculates on
call graded, pipeline stage change, task completed, appointment set/no-show.

The Buy Signal: high TCP + low team engagement = priority lead.

**v1.1 Wave 4 — Seller-side scoring.** `Seller.likelihoodToSellScore`
(0.0–1.0) lives next to Property TCP — different question, different
formula. Property TCP answers "Will THIS deal close?" combining
property facts + seller motivation + market signals. Seller score
answers "Will THIS person sell SOMETHING?" — cross-portfolio
motivation × urgency-recency × sentiment-trend with hardship
modifier. Computed by `lib/v1_1/seller_rollup.ts:rollupSellerFromCalls`
(Class-4 hardened, idempotent) on every call grade where
`call.sellerId` is set, plus on every Property TCP recalc trigger via
fan-out from `calculateTCP` (so stage-change / task-completion keep
seller scores fresh even when no new call has landed). EMA over the
last 5 calls' `Call.sellerMotivation`.

Per-property buyer fit also moved off the Buyer table: persisted on
`PropertyBuyerStage.matchScore` (per-property) instead of
`Buyer.matchLikelihoodScore` (per-buyer — wrong unit).
`Buyer.buyerScore` stays as cross-portfolio reliability score
(`closeRate × communicationScore × ghostRiskScore`).

### Worker agent architecture (CLAUDE.md Rule 4)

Workers, not chatbots. `stop_reason: "end_turn"` is the only valid completion
signal. High-stakes actions (SMS blast > 10 contacts, bulk update, record delete)
gated by `lib/gates/requireApproval.ts` — code-level interceptor, not a prompt
instruction. Sub-agents always receive full context explicitly. All tools
return structured JSON: `{ status, data?, error?, code?, suggestion? }`.

### Living Map Discipline (CLAUDE.md Rule 8)

Any session that adds/changes a module, page, cron, AI tool, API surface, or
readable Prisma field MUST update SYSTEM_MAP.md (slow-changing) or
OPERATIONS.md (fast-changing) in the same commit. Default to OPERATIONS when
unsure — fast-changing files with slow-changing entries rot more gracefully.

---

## Modules

Library code lives in `lib/`. App routes live in `app/`. Components in
`components/`. This is the slow-changing snapshot of what each module owns.

### Auth + session

- `lib/auth/config.ts` — NextAuth.js v4 config, JWT sessions, role enrichment.
- `lib/auth/session.ts` — `getSession()` helper called by every legacy API route.
- Session shape: `{ id, email, name, role, tenantId, tenantSlug, onboardingCompleted }`.

### Database

- `lib/db/client.ts` — Prisma client singleton, `auditLog` helper.
- `lib/db/settings.ts` — `updateTenantSettings()` (only path to write tenant
  settings — bypasses are bug grounds per Rule 1).
- `prisma/schema.prisma` — schema source of truth. ~70+ Property fields after
  Schema Wave 1 (Session 39-40); ~16 BugReport / Wave 1 / vendor migrations.

### API routing

- `lib/api/withTenant.ts` — wrapper that guarantees `ctx.tenantId` is a valid
  string before the handler runs. **Mandatory for all new routes** under
  `app/api/[tenant]/*` per AGENTS.md (added 2026-04-07). Routes calling
  `getSession()` directly are legacy pending migration.

### GHL

- `lib/ghl/client.ts` — all GHL API calls (contacts, tasks, SMS, email,
  pipelines, calendars). Token refresh + 502/503/504 retry built in.
- `lib/ghl/webhooks.ts` — event handlers for incoming GHL webhooks.
  Reads opportunity `status` field (since Session 81) and stamps
  per-lane `*LostAt` timestamps when `lost` / `abandoned`; clears them
  on `open` / `won`. Lost is orthogonal to stage — a Lost opp keeps
  its stage, the `lostAt` column is the only Lost signal. Webhook
  also invalidates the GHL read cache (see `cache.ts`) on
  TaskCompleted and Contact{Created,Update,Delete}.
- `lib/ghl/cache.ts` (Session 81) — in-process TTL memoizer for
  expensive GHL reads. `cachedGHL(key, ttlMs, loader)` reads from a
  module-level `Map`, falls through to the loader on miss/expiry,
  caches successful results only (failures retry). `invalidateCache(prefix)`
  drops every entry whose key starts with the prefix — called by
  webhook handlers to bust stale data immediately. 5000-entry hard cap
  with oldest-expiry eviction. Used by the Day Hub page to cache
  `searchTasks` (45s), `getContact` (5min), `getLocationUsers` (15min)
  — collapsed ~53 live GHL calls per Day Hub load down to near-zero
  on warm cache.
- `lib/ghl/resolveAssignee.ts` — internal `userId` → GHL `userId` resolver
  (single source of truth across actions/route.ts and assistant/execute/route.ts).
- `lib/ghl/fetch-recording.ts` — recording URL retrieval with retry.
- `lib/ghl/webhook-register.ts` — soft-deprecated as of Session 79 (Bug #10).
  GHL Marketplace apps register webhooks at the **App level** in the GHL
  marketplace dashboard, not via `POST /locations/{id}/webhooks` (that path
  returned 404 for every install). The function stays callable as a no-op
  for back-compat; webhook events flow to `/api/webhooks/ghl` from the
  global App-level config. Polling cron (`/api/cron/poll-calls`) is the
  redundancy layer.

### AI

See "AI Layer" section below. Lives in `lib/ai/`.

### KPIs (lib/kpis/)

Canonical aggregation modules. Single source of truth for any number that
appears on the dashboard, in Day Hub, or in retrospectives. Drift between
multiple "today's dials" implementations was a real bug class — these
modules exist so every surface gets the same answer.

- `lib/kpis/dial-counts.ts` — `countDialsToday`, `countConvosToday`,
  `getDialKpisToday`. Uses `calledAt` (not `createdAt`) for day boundaries
  and `getCentralDayBounds` for tenant-local time. 45s threshold defines
  "convo" vs "dial."
- `lib/kpis/lm-deac.ts` (Session 86) — `calculateLmDeac`,
  `calculateLmDeacRange`. **The locked north-star metric** for the LLM
  Rewiring Plan and any future AI/agent program. Formula:
  `dials + tasksCompleted + (apptsSet × 3) + scriptAdherenceScore`.
  Operational definition + caveats locked in DECISIONS.md D-051 and in
  the file header.

### Multi-vendor enrichment (Sessions 41-42; flag-gated since Session 66)

- `lib/enrichment/enrich-property.ts` — orchestrator. Routes property by
  PropertyRadar motivation signals to BatchData/RentCast/etc. Each vendor
  call is wrapped by both the legacy `opts.skip*` testing flag AND the
  env allowlist (Session 66 — see vendor-flags below).
- `lib/enrichment/sync-seller.ts` — seller-side enrichment. `skipTraceSeller`
  also gated by `isVendorEnabled('batchdata')`; returns no-op when disabled.
- `lib/enrichment/sync-seller-courtlistener.ts` — court-records subroutine.
- `lib/enrichment/vendor-flags.ts` — single source of truth for the
  `ENRICHMENT_VENDORS_ENABLED` env allowlist. Default = `propertyradar,google`.
- Per-vendor clients:
  - `lib/propertyradar/client.ts` — primary (full property + ownership +
    valuation + skip-traced contact + `/persons` fetch).
  - `lib/batchdata/client.ts` — gap fill (gated behind PR motivation signals
    for -92% projected spend).
  - `lib/courtlistener/client.ts` — V4 API, scoped by state + exact name.
  - `lib/rentcast/client.ts` — rentals.
  - `lib/realestateapi/client.ts` — fallback.
  - `lib/google/client.ts` — Street View / imagery.
  - `lib/storage/supabase.ts` — Supabase blob storage for vendor images.
  - `lib/storage/property-assets.ts` (Session 76) — generalizes the
    Supabase storage pattern for user-uploaded property photos +
    documents. Two private buckets `property-photos` and
    `property-documents`, auto-created on first use. Used by the photos
    + documents routes under `/api/properties/[id]/`.
  - `lib/ai/photo-classifier.ts` (Session 76) — Claude Haiku 4.5 vision
    classifies user-uploaded photos into front/exterior/kitchen/bathroom/
    living/basement/other. Fire-and-forget after upload (~$0.001/photo).
    UI polls until `classificationStatus` flips from `pending` to
    `done`/`failed`.

Per-vendor isolation: vendor failures do not take down the orchestrator.

### Buyers (Session 78 — Gunner = source of truth for buyer-info)

Buyers are GHL contacts with structured buyer-info layered on top.
**GHL stays authoritative for contact info only** (name, phone, email,
mailing address, tags, source). Everything else is owned by Gunner.

**Sync direction** (`lib/buyers/sync.ts`):
- New buyer (first import): all GHL fields seed the Buyer row, including
  `customFields.tier`, `customFields.buybox`, `customFields.verifiedFunding`,
  etc. parsed from the GHL custom fields catalogued in `GHL_FIELD_MAP`.
- Existing buyer (every subsequent webhook + manual sync): only
  `name / phone / email / ghlContactId` get refreshed. Buyer-info keys
  stay Gunner-owned.

**Canonical buyer-info fields** (see AGENTS.md "Buyer-info source of
truth" for the full table). Storage shape:

| Field             | Storage                                       |
|-------------------|-----------------------------------------------|
| tier              | `Buyer.customFields.tier`                     |
| verifiedFunding   | `Buyer.customFields.verifiedFunding`          |
| purchasedBefore   | `Buyer.customFields.hasPurchased` (legacy key)|
| responseSpeed     | `Buyer.customFields.responseSpeed`            |
| buybox            | `Buyer.customFields.buybox` (string[])        |
| markets           | `Buyer.primaryMarkets` (Json string[])        |
| internalNotes     | `Buyer.internalNotes` (Text column)           |
| lastContactDate   | Auto-derived server-side: `max(latest Call.calledAt, latest OutreachLog.loggedAt)` for the buyer's ghlContactId. Manual override at `Buyer.customFields.lastContactDate`. |

**Retired**: `Buyer.customFields.secondaryMarkets[]` — folded into
`Buyer.primaryMarkets` (case-insensitive dedupe) by
`scripts/backfill-buyer-fields.ts` on Session 78b. Do not reintroduce.

**Tenant-wide markets list**: union of `Buyer.primaryMarkets` and
`Property.propertyMarkets` across the tenant. Computed in the buyer page
server query and passed to `BuyerEditSlideover` as `marketOptions`. Reps
add new markets inline via the chip multi-select; new entries persist
across the tenant from the next page load forward.

**Read paths**:
- `app/api/properties/[propertyId]/buyers/route.ts` — `parseBuyerFields` /
  `matchBuyers`. Reads from `Buyer.customFields` directly (no GHL
  roundtrip per request).
- `app/(tenant)/[tenant]/buyers/[id]/page.tsx` — full buyer detail.
  Computes the closed-deal revenue (sum of `Property.assignmentFee`
  from `OutreachLog` rows with `offerStatus='Accepted'` matching the
  buyer's ghlContactId) and the auto-derived last-contact date.

**Write path**: `PATCH /api/buyers/[buyerId]` accepts the 9 canonical
fields by user-facing names. Internal storage keeps the legacy
customFields keys so `matchBuyers` keeps working unchanged.

**Hero shell**: `BuyerHero` (in `components/buyers/buyer-detail-client.tsx`)
sits above the deep-dive tabs — sports-profile layout with avatar +
identity bar + 5-cell stat banner + Profile / Contact 2-col body. The
old comprehensive tabs (Identity / Buybox / Activity / Communication /
AI Insights) stay below as the deep dive.

**Backfill scripts**:
- `scripts/backfill-buyer-fields.ts` — fills missing canonical keys
  from GHL + folds secondaryMarkets → primaryMarkets. Throttled at
  250ms per GHL call with 2s 429 backoff.
- `scripts/strip-other-market.ts` — drops literal "Other" market entries.

**GHL deletion checklist**: `docs/GHL_BUYER_FIELD_DELETION_CHECKLIST.md`
walks the owner through deleting the 8 GHL custom fields once Gunner is
verified authoritative.

### Partners (Session 67 — schema + property-detail UX)

Unified contact table for everyone in a deal who isn't the property
owner (Seller) or on our buy list (Buyer). One row per person, with a
`types` array carrying any combination of roles. Future contact types
add by extending the array, not by changing schema.

Recognized values for `Partner.types[]` (extensible):
`agent` | `wholesaler` | `attorney` | `title` | `lender` |
`inspector` | `contractor` | `photographer` | `property_manager` |
`other`

- `Partner` — identity + GHL link via `ghlContactId`. Holds nullable
  type-flavored fields (brokerage / license for agents, buyer list
  size / deals-per-month / prefers-assignment for wholesalers).
  Cross-portfolio performance counters (`dealsSourcedToUsCount`,
  `dealsTakenFromUsCount`, `dealsClosedWithUsCount`, `jvHistoryCount`),
  reputation grading (`partnerGrade` A/B/C/D, `tierClassification`),
  market focus, communication prefs, standard `tags` / `internalNotes`
  / `customFields` / `fieldSources` / `priorityFlag`.
- `PropertyPartner` join — composite key (propertyId, partnerId).
  Free-string `role` (per-deal: `sourced_to_us` |
  `taking_to_clients` | `closing_agent` | `sold_us_this` |
  `we_sold_them_this` | `jv_partner` | `attorney_seller` |
  `attorney_buyer` | `title_company` | `lender` | `inspector` | …),
  per-deal economics (`commissionPercent` / `commissionAmount` /
  `purchasePrice` / `assignmentFeePaid` — all nullable, only relevant
  fields filled), `notesOnThisDeal`.

**Architectural note (Session 67 mid-session pivot):** Initial Phase 1
shipped separate Agent + Wholesaler tables; pivoted to this unified
shape within the hour before any data was written. Two migrations land
back-to-back: `20260504000000_add_agent_wholesaler` (creates the 4
intermediate tables) + `20260504010000_replace_agent_wholesaler_with_partner`
(drops them and creates `partners` + `property_partners`). Plan
reference: `~/.claude/plans/at-te-he-very-base-mellow-pixel.md`.

**Phase 2 + 3 + 4 wiring (Session 67, all in one calendar day):**

- `lib/partners/sync.ts` — `upsertPartnerFromGHL()` helper. Single
  source of truth for "create-or-link a Partner row from a GHL
  contact". Idempotent on (tenantId, ghlContactId): existing row gets
  its `types` array merged with new types and contact details refreshed
  (never wiped to null); new rows are created with the seed fields.
  Exports `PARTNER_TYPES` const tuple + `isPartnerType()` guard.
- `app/api/properties/[propertyId]/partners/route.ts` — GET/POST/DELETE
  for the property-bound partner list. POST handles two actions: link
  a new partner (creates-or-reuses Partner via `upsertPartnerFromGHL`,
  then creates the PropertyPartner join row with role + economics) AND
  update an existing PropertyPartner row (action='update' branch).
  Mirrors the sibling sellers route. Permission gated on
  `properties.edit`.
- `components/inventory/partners-tab.tsx` — new client component.
  Three pieces: `<PartnersTab>` (top-level container), `<LinkPartnerForm>`
  (GHL contact search + multi-type chips + role select + economics +
  notes), `<PartnerCard>` (read/edit per linked partner). Mounted from
  `components/inventory/property-detail-client.tsx` as the new
  `partners` tab (TabKey added next to `sellers` + `buyers`).
- `app/(tenant)/[tenant]/inventory/[propertyId]/page.tsx` — Prisma
  query extended with `partners: { include: { partner: { select: ... } } }`
  + map step that serializes Decimal fields to strings for the client
  prop.
- **Phase 3** — `app/(tenant)/[tenant]/partners/page.tsx` +
  `partners-list-client.tsx`. Standalone browseable list with search
  (name/company/phone/email) + type filter chips (one per type, with
  per-type counts). Shows propertyLinkCount per partner so reps can
  see "this agent is on 12 deals." `properties.view.assigned`
  permission gated. Linked from top-nav (admin-only).
- **Phase 4** — `components/contacts/contacts-client.tsx` extended
  with a third tab. Partners tab table shows name, types, phone,
  email, company, markets, on-deal count, last deal, grade, and a
  GHL deep-link icon. `app/(tenant)/[tenant]/contacts/page.tsx`
  fetches partners alongside sellers + buyers.
- **Phase 2 close** — `scripts/compute-aggregates.ts` extended with
  `computePartnerAggregates()`. Maps PropertyPartner.role + Property.status
  to per-Partner counters: `dealsSourcedToUsCount`,
  `dealsTakenFromUsCount`, `dealsClosedWithUsCount`, `jvHistoryCount`,
  `lastDealDate`. Idempotent (absolute counts each run). Runs nightly
  at 4am UTC alongside seller + buyer aggregates.
- **Phase 5** — `app/(tenant)/[tenant]/partners/[id]/page.tsx` +
  `partner-detail-client.tsx`. Per-partner detail surface mirroring
  `/sellers/[id]` and `/buyers/[id]` patterns:
  - Header with name + type badges + grade + priority/bad flags +
    edit button.
  - Read view: identity card (phone/email/website/GHL deep-link/comm
    pref), performance card (4 stat tiles + last deal / response
    rate / reliability / avg commission / tier), conditional
    type-flavored cards (brokerage+license for agents, wholesaler
    operation for wholesalers), markets+focus, reputation notes,
    deal history table (every linked Property with role + economics
    + per-deal notes + status pill + click-through to property
    detail), internal notes, tags.
  - Edit form: full identity + multi-type chips + agent fields
    (conditional on types includes agent) + wholesaler fields
    (conditional on types includes wholesaler) + markets/experience
    + reputation (grade/tier/priority/bad-with-us flags + notes) +
    communication (preferred method/best time/DNC) + internal notes
    + delete-partner action (with confirm).
  - `app/api/partners/[partnerId]/route.ts` — PATCH (partner-level
    fields) + DELETE (cascades PropertyPartner via Prisma onDelete).
- All link surfaces routed to the new detail page: partners list
  page rows (`partners-list-client.tsx`), contacts page Partners
  tab rows (`contacts-client.tsx`), property-detail Partner cards
  (`partners-tab.tsx`).

### Disposition (Session 68 — journey + portfolio)

The disposition workflow is a five-section journey per property,
plus a manager portfolio view that groups properties by their current
journey stage. Same status logic powers both surfaces (one util,
two callers).

- `lib/disposition/journey-status.ts` — pure function
  `computeJourneyStatus(inputs)` returns per-section status
  (`not_started | in_progress | done`) for the 5 sections plus an
  aggregate `stage` label (`ready_to_blast` | `awaiting_responses`
  | `in_offer` | `closing`). Inputs are a narrow projection of
  Property + relation counts so the portfolio query doesn't need
  a full PropertyDetail fetch. `firstActiveSection()` picks the
  section to auto-expand on first load.
- `components/disposition/journey/disposition-journey.tsx` —
  per-property journey container. Mounted on the property-detail
  Disposition tab. Renders 5 collapsible sections in sequence;
  first non-Done section auto-opens; manual expand/collapse via
  chevrons. **Session 78** lifts mutable Section 2 state
  (`description` / `internalNotes` / `dispoArtifacts`) into this
  component so collapse/expand round-trips don't drop generations or
  notes — `JourneySection` unmounts children when collapsed.
- `components/disposition/journey/journey-section.tsx` — shared
  chrome (header bar, status pill, collapse chevron, summary line,
  body slot).
- `components/disposition/journey/section-1-deal-info.tsx` —
  Section 1 (Deal info readiness checklist). **Session 77 rewrite**:
  6 gates — address / seller linked / contract (= property in dispo
  lane) / property details all 26 fields filled / photos / dispo
  manager assigned. The 26-field check is delegated to
  `lib/disposition/property-details-readiness.ts` (single source of
  truth, also consumed by the per-property page); expandable sub-list
  shows which of the 26 are missing. Deep-link buttons jump to
  Overview / Data tabs to fix gaps.
- `components/disposition/journey/section-2-deal-blast.tsx` —
  Section 2 (Generate deal blast). **Session 77 rewrite**: generation
  only, no sending. Deal-summary cards reordered Contract → Asking →
  ARV → Assignment Fee; Asking writes to investor-facing
  `dispoAskingPrice` (distinct from seller's `askingPrice` on Overview).
  Footer fact strip adds property type, drops repair+rental est.
  Mounts `<Section2Artifacts/>` for the 3 generators. The prior tier
  picker, recipient list, FROM dropdown, per-tier email/SMS editors,
  blast history were stripped — sending lives in Section 3 now.
- `components/disposition/journey/section-2-artifacts.tsx` —
  **Session 77** ships 3 generator blocks (description / listing post /
  FB social post) + the per-tier message block. Each block: Generate
  button → POST `/api/properties/[id]/dispo-generate` → fills the
  textarea → debounced PATCH on blur saves manual edits. **Session 78
  B6** drops the `description` Kind from this component — the single
  description (canonical on `Property.description`) now has its own
  Generate button rendered in `section-2-deal-blast.tsx` next to the
  inline editor. Listing post + social post + tier messages remain
  here, persisted on `Property.dispoArtifacts.{listingPost, socialPost,
  tierMessages}`.
- **Section 2 status badge (Session 78 B5)**: driven by artifact
  generation count (description + listing + social + tierMessages):
  `0 = not_started`, `1-3 = in_progress`, `4 = done`. Falls back to
  `blastsSentCount` for the portfolio query that doesn't load artifact
  counts. Summary line shows "X of 4 generated" while in progress.
- **Primary offer-type toggle (Session 78 B8)**: per-tab star (☆/★)
  in the property-details Numbers column marks one offer type as
  primary for the deal blast. Stored as
  `Property.dispoArtifacts.primaryOfferType` (no schema migration).
  Section 2 description shows `Primary: <type>` pill + amber
  `⚠ Stale` badge when the active primary differs from
  `descriptionGeneratedForType` (also stamped on dispoArtifacts on
  every successful description generation). Regenerate button turns
  amber when stale (visual nudge, no auto-overwrite). The description
  prompt receives a per-type voice hint via `offerTypeVoice()`:
  Cash → deal math; Sub-to → terms; Novation → retail-buyer ARV +
  commission room; Partnership/JV → split / capital / exit. Custom
  types fall back to a generic professional voice.
- `app/api/properties/[propertyId]/dispo-meta/route.ts` —
  **Session 78.** PATCH route that merges `primaryOfferType` and
  `descriptionGeneratedForType` into `Property.dispoArtifacts` JSON.
  Lives separate from `/dispo-generate` because it's a click-driven
  metadata write, not an AI call.
- `lib/ai/dispo-generators.ts` — **Session 77.** Three generators
  with locked prompts (owner-supplied). Shared tone rules: no hype
  words, no emojis, always close with assigned dispo manager + GHL
  phone. Loads PropertyComp rows + intangibles → infers pros /
  work-needed for the prompts. claude-sonnet-4-6.
- `components/inventory/comps-panel.tsx` — **Session 77.** Manual
  comps CRUD inside the Data tab Property Assessment area. Feeds the
  listing-site generator's `## Comps` block automatically. No vendor
  / MLS auto-pull. Backed by `app/api/properties/[id]/comps/` routes.
- `components/disposition/journey/section-3-buyer-match.tsx` —
  Section 3 (Match buyers). **Session 77 rewrite**: kanban columns
  flipped to **Matched / Sent / Responded**. Operational dispatch
  center — sending happens here. Header has Bulk Add + Sync CRM +
  Match buttons; Matched-column header has "Add" + "Send all (N)";
  per-card has Send + Edit + manual move arrows. Realtor is the 5th
  tier in the color map + edit-buyer dropdown. Mounts `<BulkAddModal/>`
  and `<SendModal/>`.
- `components/disposition/journey/bulk-add-modal.tsx` — **Session 77.**
  Paste-mode bulk add. Phone is the only match key. Phone matches
  existing GHL contact or DB Buyer → link. No phone match → create
  GHL contact + Buyer + link. Backed by
  `app/api/properties/[id]/buyers/bulk-add/route.ts` (up to 500 rows).
- `components/disposition/journey/send-modal.tsx` — **Session 77.**
  Picks artifact (description / listing / social / custom) + channel
  (sms / email) + per-recipient eligibility filter. Calls existing
  `/api/properties/[id]/blast` route which auto-promotes
  PropertyBuyerStage to `stage='sent'` on each successful send.
- `components/disposition/journey/section-4-responses.tsx` —
  Section 4 (Track responses). **Session 77 rewrite** (was a
  "coming soon" stub). 3-column kanban: **Responded / Interested /
  Showing Scheduled**. Backed by `app/api/properties/[id]/section4-
  buyers/route.ts` which returns PropertyBuyerStage rows in those
  stages without running the GHL match algo. AI auto-flag-to-
  interested already ran in `app/api/webhooks/ghl/buyer-response/
  route.ts` (Haiku 4.5 classifies inbound replies → promotes
  responseIntent='interested' to stage='interested'); surfaced in
  Section 4 with a Sparkles "AI auto-flagged" badge.
- `components/disposition/journey/section-5-offers-showings.tsx` —
  Section 5 (Offers & showings). Lifted from the prior `OutreachTab`,
  trimmed to the 'offer' and 'showing' sub-tabs only. **Session 77
  fast-forward rule**: logging an offer or showing in
  `app/api/properties/[id]/outreach/route.ts` POST upserts the
  matched buyer's PropertyBuyerStage to `stage='showing_scheduled'`
  — the buyer card jumps to Section 4's rightmost column regardless
  of where they were before.
- `components/inventory/contacts-panel.tsx` — replaces the prior
  Sellers / Buyers / Partners property-detail tabs with a compact
  panel mounted at the top of Overview and Data tabs. Three short
  stacked sections (Sellers · Buyer · Partners), each row =
  name + role/type + phone/email + click-through to the per-type
  detail page. Empty states surface handoff gaps explicitly.
- `app/(tenant)/[tenant]/disposition/page.tsx` +
  `disposition-client.tsx` — admin pipeline view. Server fetch
  selects properties with `status ∈ (IN_DISPOSITION,
  UNDER_CONTRACT)` only (strict dispo scope per plan); computes
  journey stage per row via `computeJourneyStatus`; client groups
  rows under the four stages (Ready to Blast → Awaiting Responses
  → In Offer → Closing). Each row click-throughs to
  `/inventory/{id}?tab=disposition` — the property-detail page
  reads `?tab=` from search params to land on the right tab.

**Property-detail tabs collapsed 8 → 4** (Session 68): Overview ·
Activity · Data · Disposition. The prior Sellers / Buyers /
Partners tabs collapsed into `<ContactsPanel>` (Overview top + Data
top); Outreach + Deal Blast tabs collapsed into Section 2 / 5 of the
journey. The lifted tab functions were physically deleted from
`components/inventory/property-detail-client.tsx` (file shrank from
~7,100 to ~4,900 LOC). `InlineTextArea` is now exported from
property-detail-client so Section 2 can reuse it.

**Plan reference:**
`~/.claude/plans/okay-this-is-all-radiant-canyon.md`.

### Workers (in-process)

- `instrumentation.ts` — Next.js 14.2 boot hook. Fires `startGradingWorker()`
  exactly once per Node process at server start.
- `lib/grading-worker.ts` — `startGradingWorker()` exported function. Single
  flight via `running` flag. Hot-reload safe via `Symbol.for('gunner.gradingWorker.started')`
  global guard. setTimeout(5s) first tick, setInterval(60s) thereafter.
- `lib/grading-processor.ts` — `runGradingProcessor()` with the actual logic.
  See "Call pipeline" section below.

> **Historical note (Blocker #3 closed Wave 1, 2026-04-27):** Sessions 38-44
> ran a parallel standalone worker (`scripts/grading-worker.ts` + `[[services]]
> grading-worker` in `railway.toml`). The atomic-claim was the safety net
> against double-grading. Removed Wave 1 of the v1-finish sprint;
> `instrumentation.ts` is now the sole driver. Manual debug trigger at
> `app/api/cron/process-recording-jobs/route.ts`.

### Safety gates

- `lib/gates/requireApproval.ts` — high-stakes action interceptor.

### Workflow engine

- `lib/workflows/engine.ts` — trigger-based automation (4 triggers, 5 step
  types, delayed execution, condition evaluator). Built Session 24.

### Gamification

- `lib/gamification/xp.ts` — XP, badges, leaderboard. 7 event types, 30
  levels, 10 badges.

### Stripe

- `lib/stripe/index.ts` — subscription management, plan definitions.
  Built but inactive (env vars not set per CLAUDE.md "Stripe last").

### Audit logging

- `lib/audit.ts` — `logFailure()` helper. 25-action vocabulary defined for
  `audit_logs.action`. Critical for silent-catch discipline.

### Computed metrics

- `lib/computed-metrics.ts` — derived KPI calculations.
- `lib/inventory-access.ts`, `lib/inventory-kpis.ts` — inventory-side KPIs.
- `lib/kpis/dial-counts.ts` — single source of truth for "today's dials"
  aggregation. Used by canonical Day Hub page and the legacy /tasks/ Day
  Hub backend (`/api/[tenant]/dayhub/kpis`). Locks date field to `calledAt`
  and supports `all` / `user` / `users` scopes so admin aggregation matches
  across surfaces.
- `lib/properties.ts` — property-level helpers.

### Other

- `lib/call-types.ts` — call type vocabulary, rubric lookups.
- `lib/ghl-stage-map.ts` — GHL stage → milestone mapping.
- `lib/email/` — email senders.
- `lib/tasks/` — task helpers.
- `lib/deal-intel/format.ts` — deal-intel display formatter.
- `lib/address.ts`, `lib/dates.ts`, `lib/format.ts`, `lib/utils.ts` — utilities.
- `lib/types/` — shared TypeScript types.

---

## AI Layer

The LLM is the backbone. Users interact with a smart assistant and get on
calls. Everything is AI-assisted — propose, edit, approve.

### Models in current use

| Module | Model | Notes |
|---|---|---|
| Grading (`lib/ai/grading.ts:207`) | `claude-opus-4-6` | Extended thinking 16k budget, max_tokens 32k, streaming (SDK v0.90 preflight). 7-layer context: tenant playbook, role profile, prior 50 calls, 50 calibration examples, industry knowledge, scripts, in-context corrections. |
| Deal intel (`lib/ai/extract-deal-intel.ts:55`) | `claude-opus-4-6` | Extended thinking 8k budget, max_tokens 16k. Receives current property data + existing dealIntel — UPDATES rather than replaces (cumulative across calls). 100+ fields, 9 categories. v1.1 Wave 4 added `target` field on every proposedChange (`property` \| `seller`) so the apply layer dispatches seller-targeted facts (motivation, hardship, person flags, additive lists) to typed Seller columns instead of the Property dealIntel JSON blob. Q5 mirror-write: legal-distress flags emit two proposals (Property `in*` + Seller `is*`). |
| Next-steps (`lib/ai/grading.ts:1092`) | `claude-opus-4-6` | max_tokens 16k. Receives full transcript. Bracket-aware JSON array extraction. |
| Coach (`lib/ai/coach.ts:258`) | `claude-sonnet-4-6` | Conversational coaching, AI-coach chat. |
| User profile generator (`lib/ai/generate-user-profiles.ts:168`) | `claude-sonnet-4-6` | Weekly cron, auto-generated coaching profiles per rep. |
| Property story (`lib/ai/generate-property-story.ts:23`) | `claude-sonnet-4-6` | Auto-narrative summary. Triggered on deal-intel landing + daily catch-up cron. |
| Legacy property enricher (`lib/ai/enrich-property.ts:57`) | `claude-sonnet-4-6` | Largely superseded by `lib/enrichment/` orchestrator. (Pre-Wave-1 was date-pinned `claude-sonnet-4-20250514` — swept 2026-04-27 along with 8 other occurrences across 4 API routes.) |
| Other Sonnet 4.6 callers (API routes) | `claude-sonnet-4-6` | `app/api/[tenant]/calls/[id]/property-suggestions/route.ts`, `app/api/[tenant]/calls/[id]/generate-next-steps/route.ts` (API-side variant — separate from the in-grading-pipeline next-steps at `lib/ai/grading.ts:1095`), `app/api/properties/[propertyId]/blast/route.ts` (deal blast SMS + email body generation). All previously date-pinned, swept in Wave 1. |
| Self-audit agent (`scripts/audit.ts:73`) | `claude-opus-4-6` | Daily 2am UTC cron — code review of recent changes. Opus chosen for reasoning quality. |

The Sonnet/Opus split is deliberate (D-044, stability-first, pending Wave 4
DECISIONS.md writeup): **Sonnet for conversational outputs** (coach,
profiles, story — many calls, lower per-inference value, latency matters)
and **Opus for high-signal extraction** (grading, deal-intel, next-steps,
audit — fewer calls, high per-inference value, depth matters). Driver: lead
acquisition cost dwarfs inference cost; best model for grading the lead,
fast model for the conversation about the lead. This inverts the original
TECH_STACK Decision #8 ("Sonnet for grading, Opus for coaching") — the
inversion is intentional.

> **Pending decision D-044 (AUDIT_PLAN):** Per-call AI was upgraded to Opus
> 4.7 + extended thinking + widened context in commit `c58b695`, then
> reverted to Opus 4.6 (model strings only) 8 minutes later in `598f852`.
> The 4.7-era prompt expansion (32k tokens, 16k thinking budget, 50 prior
> calls of context) is intentionally retained. Driver = stability-first
> (Wave 1 lock-in, 2026-04-27); full DECISIONS.md writeup pending Wave 4.

### Embeddings + semantic search (call transcripts — Phase D)

`lib/ai/embeddings.ts → embedCallTranscript(callId, tenantId)` generates
a 1536-dim vector from contact + type + outcome + aiSummary + transcript
(6500-char cap) and writes via raw SQL to `calls.transcript_embedding`
(HNSW index `idx_calls_transcript_embedding_hnsw`).

Backfill: `scripts/embed-calls-backfill.ts` — supports `--dry-run`,
`--tenant=<id>`, `--limit=N`. Idempotent — only embeds rows where the
column is null. Skips automatically if `OPENAI_API_KEY` is unset.

Used by the `semantic_search_calls` query tool. Falls back to a clear
"not yet enabled / not yet backfilled / migration not applied" error
if any precondition is missing — caller gets actionable guidance.

### Embeddings + semantic search

- `lib/ai/embeddings.ts` — OpenAI `text-embedding-3-small`. Embeds knowledge
  documents and calibration calls. pgvector similarity search.
- 42 playbook docs + user profiles loaded + embedded into pgvector.

### JSON response utilities

- `lib/ai/json-utils.ts` — single source of truth for parsing Claude JSON
  responses. `stripJsonFences()` handles ```` ```json ```` /```` ``` ```` /
  no-tag fences; `extractFirstJsonArray()` walks bracket depth with string
  + escape awareness so a `]` inside a quoted value doesn't fool the
  counter. Used by `grading.ts` (grading parser, next-steps array) and
  `extract-deal-intel.ts` (proposed-changes parser).

### Plain-English humanizers (Session 80)

- `lib/format/status.ts` — every Prisma enum or outreach-outcome string
  that ends up in a user-visible string (UI label, AI prompt, deal story)
  goes through here first. `formatAcqStatus`, `formatDispoStatus`,
  `formatLongtermStatus` map enum values to natural English ("In
  disposition", "Pushed to buyers"). `describePropertyStage()` combines
  all three lane statuses into a sentence; `formatOutreachOutcome()`
  covers showing + offer status strings ("Showed" → "Buyer showed up").
  Unmapped values fall through to Title Case so we never crash; missing
  entries are intentional bugs to fix. Used by
  `lib/ai/generate-property-story.ts`. Any new code that surfaces an
  enum to a human MUST route through this module — no raw `DISPO_NEW`
  shapes in user-facing strings.

### Context builder

- `lib/ai/context-builder.ts` — central knowledge assembly. Pulls:
  - Tenant company standards + scripts + calibration call list
  - Prior 50 calls (full summaries) for the user/contact
  - Top 50 calibration examples (semantic + recent)
  - pgvector-matched playbook docs (industry knowledge, objection handling, scripts)
  - Manager corrections from `call_reclassifications` table (in-context corrections feed)

### Role Assistant (~85 tools)

- Routes:
  - `app/api/ai/assistant/route.ts` — chat endpoint. Streams in-process,
    no SSE to client. Per-user rate limit (20 turns / min) via
    `lib/ai/rate-limit.ts`.
  - `app/api/ai/assistant/execute/route.ts` — action execution. Per-user
    rate limit (30 exec / min). Two server-side gates (Rule 4 defense in
    depth): role check via `canUseTool` and high-stakes approval check
    via `isHighStakes` from `lib/ai/role-gates.ts`.
  - `app/api/ai/assistant/session/route.ts` — daily session persistence.
- Component: `components/ui/coach-sidebar.tsx` — right-sidebar chat surface
  on every page, action card UI, edit panel, confirm modal.
- Tool registry: `lib/ai/assistant-tools.ts` — write/CRM tools (~70) +
  Phase B query tools (11) across calls, properties, contacts, blasts,
  workflows, KPIs, team performance.

#### Role-based capability gates (Session 82 — Phase A)

`lib/ai/role-gates.ts` is the single source of truth. `ROLE_TOOL_MATRIX`
maps every tool to an allow-list of `UserRole` values; unknown tools
default-deny to OWNER+ADMIN only. The gate fires in two places:

1. `app/api/ai/assistant/route.ts` calls `filterToolsForRole` before
   passing tools to Claude — so the LLM never sees forbidden tools.
2. `app/api/ai/assistant/execute/route.ts` calls `canUseTool` after the
   toolCallId resolves — refuses 403 if a forged client tries to execute
   a stale tool call from a higher-privilege session.

`HIGH_STAKES_TOOLS` set: `send_sms_blast`, `send_email_blast`,
`bulk_tag_contacts`, `update_user_role`, `update_pipeline_config`. The
execute route requires `approved: true` on the request body for any of
these — refuses 409 otherwise. The UI confirmation modal must set this
flag; bypass attempts get blocked server-side.

#### Query tools (Session 82 — Phase B)

`lib/ai/query-tools.ts`. 11 tenant-scoped, limit-capped functions
returning the self-healing JSON contract
(`{status, data?, error?, suggestion?, count?}`):

| Tool | Purpose |
|---|---|
| `query_properties` | Filter inventory by status / ARV / TCP / source / market / assignee / days-since-last-contact |
| `search_calls` | By date / rep / grade band / type / outcome / contact / property / emotion / has-objection |
| `semantic_search_calls` | Vector search over `Call.transcriptEmbedding` (Phase D dependency; falls back gracefully) |
| `query_tasks` | By status / priority / assignee / overdue / due-within-N / property |
| `get_kpi_metrics` | Week-over-week / month-over-month deltas (callVolume, avgScore, appointments, contracts, tasks) |
| `get_team_performance` | Leaderboard (MANAGERS-only role gate) |
| `query_sellers` | By motivation / likelihood / urgency / hardship / timeline / location |
| `query_buyers` | By market / propertyType / repair budget / national-vs-local |
| `get_ghl_pipeline_state` | Stage distribution + stuck deals per lane |
| `cross_entity_query` | Composite: property filters AND "no recent activity" |
| `find_similar_deals` | Rule-based comparables (same city, ±20% ARV, ±1 bed) |

#### Prompt caching (Session 82 — Phase C1)

Both the assistant route and `lib/ai/coach.ts` split the system prompt
into stable (cached) + variable blocks via Anthropic's
`cache_control: {type: 'ephemeral'}`. Tools list is also cached (mark
the last tool with `cache_control`). First turn pays full price; turns
2+ within 5 minutes hit the cache. Real-world impact: ~80% latency cut
on follow-up turns plus token cost savings.

#### Cross-session memory (Session 82 — Phase C2)

`lib/ai/session-summarizer.ts`. AssistantMessage history resets every
day on `sessionDate`. To stop losing continuity, Haiku 4.5 rolls each
day into a one-paragraph summary stored in `AssistantSessionSummary`
(unique on `tenantId_userId_sessionDate`). Refresh fires every 6 user
turns, fire-and-forget. On new session, `getRecentSessionMemory` loads
the last 3 daily summaries (30-day lookback cap) into the assistant
system prompt. Storage: `assistant_session_summaries` table.

#### LLM Rewiring Phases 6-10 (Sessions 87-89)

The big AI-quality program from `docs/LLM_REWIRING_PLAN.md`. All ten
phases shipped to main by 2026-05-13. The four artifacts you'd reach
for from a new session:

1. **`lib/ai/prompts/` modules** — every system + user prompt now lives
   in its own file, each exporting a `VERSION = 'major.minor.patch'`
   semver. One module per surface:

   | Module | VERSION | Surface | Caller |
   |---|---|---|---|
   | `prompts/grading.ts` | 1.1.0 | call grading | `lib/ai/grading.ts` |
   | `prompts/next-steps.ts` | 1.0.0 | post-grade follow-up actions | `lib/ai/grading.ts` (auto-fire) |
   | `prompts/deal-intel.ts` | 1.4.0 | deal intel extraction | `lib/ai/extract-deal-intel.ts` |
   | `prompts/coach.ts` | 1.0.0 | conversational coaching | `lib/ai/coach.ts` |
   | `prompts/assistant.ts` | 1.0.0 | Role Assistant chat | `app/api/ai/assistant/route.ts` |
   | `prompts/story.ts` | 1.1.0 | property story narrative | `lib/ai/generate-property-story.ts` |
   | `prompts/dispo.ts` | 1.0.0 | dispo description/listing/social/tier-messages | `lib/ai/dispo-generators.ts` |
   | `prompts/user-profile.ts` | 1.0.0 | weekly per-rep coaching profile | `lib/ai/generate-user-profiles.ts` |
   | `prompts/session-summarizer.ts` | 1.0.0 | daily session memory rollup | `lib/ai/session-summarizer.ts` |
   | `prompts/enrich-property.ts` | 1.0.0 | property ARV/repair/rental estimator | `lib/ai/enrich-property.ts` |
   | `prompts/photo-classifier.ts` | 1.0.0 | photo category classifier (silent, not logged) | `lib/ai/photo-classifier.ts` |
   | `prompts/role-overrides.ts` | data module (no VERSION) | role context for every prompt | every prompt file |

   API routes with inline prompts (smaller, not extracted) declare a
   local `const X_PROMPT_VERSION = '1.0.0'` constant at the top of the
   route file and pass it through `logAiCall`: `AI_EDIT_PROMPT_VERSION`,
   `NEXT_STEPS_MANUAL_PROMPT_VERSION` (the API-side variant, separate
   from `prompts/next-steps.ts`), `PROPERTY_SUGGESTIONS_PROMPT_VERSION`,
   `BLAST_LEGACY_PROMPT_VERSION`, `OUTREACH_ACTION_PROMPT_VERSION`,
   `BUYER_RESPONSE_CLASSIFY_PROMPT_VERSION`, `BUYER_SCORING_PROMPT_VERSION`.

   **Rule when changing a prompt:** bump the VERSION constant in the same
   commit. Drift detection groups `ai_logs` by `prompt_version` — a
   silent edit without a bump corrupts the drift signal.

2. **Drift signal (Phase 8) — `ai_logs.prompt_version`** column +
   composite `(type, prompt_version)` index. Every `logAiCall` site
   stamps the VERSION constant at call time. Migration:
   `20260513200000_add_ai_log_prompt_version` (additive, nullable —
   legacy rows stay NULL).

   `lib/ai/log.ts` is the SINGLE choke point for `db.aiLog.create` —
   internal try/catch at line 56 swallows P2022 errors so deploy
   ordering is FLEXIBLE (migration can run before or after deploy
   without breaking AI surfaces).

3. **Tiered eval framework (Phase 7) — `evals/`** directory:
   - `evals/golden/smoke.ts` (5 evals, pre-commit gate, ~$0.82/run)
   - `evals/golden/medium.ts` (20 evals, every-PR CI gate, ~$2.20/run)
   - `evals/golden/full.ts` (49 evals = 24 medium + 25 full-only +
     5 adversarial, manual + weekly cron, ~$5.77/run)
   - `evals/scorer.ts` — Haiku-as-judge with k=3 majority + one-retry
     safety net (Session 89 pass 6)
   - `evals/runners/_shared.ts` — shared cache (24h SHA-256 of
     `lib/ai/`), env loader, suite executor, markdown renderer
   - Each eval has `expectedBehaviors` + `mustNotDo` lists graded
     independently; sharpening pattern: explicit
     VIOLATION + NOT-A-VIOLATION examples (Section 28b of
     `docs/LLM_AUDIT_BASELINE.md`)

   CI workflow at `.github/workflows/evals.yml` fires smoke + medium
   on every PR touching `lib/ai/**`, `evals/**`, or `package*.json`.
   Weekly drift cron `weekly-evals` (Sunday 4:30am UTC) runs full
   with `EVAL_FORCE=1`.

4. **Adversarial / red-team set (Phase 9a)** — 5 production-safety
   evals in `evals/golden/full.ts` covering: prompt injection in
   transcript (`F_ADV_DEAL_INTEL_INJECTION`), system-prompt
   extraction (`F_ADV_ASSISTANT_EXTRACT`), role-escalation claim
   (`F_ADV_ASSISTANT_ROLE_ESCALATE`), tool-call spoofing
   (`F_ADV_GRADING_TOOL_SPOOF`), out-of-scope deflection
   (`F_ADV_COACH_OUT_OF_SCOPE`). All 5 PASS as of 2026-05-13.

5. **Diagnostic scripts** (Phase 8/9/10 operational tooling, all
   read-only — see `OPERATIONS.md` for details):
   - `scripts/_phase8-check.ts` (transient — delete after Phase 8
     sign-off) — wiring health
   - `scripts/drift-report.ts` (Phase 9b) — score/latency/cost
     deltas by prompt_version
   - `scripts/model-regression.ts` (Phase 9c) — diff two
     full-tier reports when Anthropic ships a new model
   - `scripts/mine-eval-candidates.ts` (Phase 10) — mine
     rejected/edited AiLogs + BugReports + calibration markers
     for new eval-fixture candidates

#### Propose → Edit → Confirm flow (closed Blocker #2 in Session 38)

1. **Propose:** AI emits action card with input fields pre-filled from page
   context.
2. **Edit:** User clicks Edit; per-action edit panel renders editable inputs.
   Server accepts optional `editedInput`, merges over `toolCall.input` server-side.
3. **Confirm:** For 6 high-stakes types, a confirmation modal gates execution.
   The other 6 lower-stakes types execute immediately on Approve.
4. **Audit:** Dual-row failure audit (`assistant.action.failed` ERROR +
   `logFailure` SYSTEM). Both `originalInput` and `editedInput` persisted in
   audit payload for AI-learning loop.

The 12 action types (per `components/ui/coach-sidebar.tsx` edit-panel branches
+ `HIGH_STAKES_TYPES` set):

| Gate level | Types | Why |
|---|---|---|
| **High-stakes (modal-gated)** | `send_sms`, `send_email`, `change_pipeline_stage`, `create_contact`, `update_contact`, `create_opportunity` | Touches the seller (SMS/email), changes CRM source-of-truth (pipeline stage, contact identity), or creates a deal record. All 6 are externally visible or have permanence. |
| **Lower-stakes (immediate)** | `add_note`, `create_task`, `update_task`, `complete_task`, `update_opportunity_status`, `update_opportunity_value` | Internal-only changes to internal-only objects. Reversible via UI. The 6/6 split is the safety-gate boundary itself. |

> Production verification of the 6 high-stakes types is **still owed** — see
> P1 in PROGRESS Next Session.

> **Note:** `assign_contact_to_user` is a 13th action that exists in
> `app/api/ai/assistant/execute/route.ts` but does NOT go through the
> propose-edit-confirm UI flow — it still uses name-contains fuzzy matching
> server-side (logged as a Session 38 side-finding pending its own pass).

### AI logging

- `lib/ai/log.ts` — wraps every AI call with start/end timing, token counts,
  model, cost, full prompt + response. 11 logged touchpoints: grading,
  deal intel, next-steps, coach, profiles, story, enrich-property,
  assistant chat, assistant execute, context-builder, embeddings.
- Surface: `app/(tenant)/[tenant]/ai-logs/` (admin-only). Tabbed UI as of
  Session 42: **Team Chats** (assistant + coach), **AI Work** (grading +
  intel + story + profiles), **Problems** (errors + parse failures).

### Industry knowledge

- `lib/ai/industry-knowledge.ts` — static reference (TCP factor weights,
  call type vocabulary, role definitions). Read at grade time for stable
  context that doesn't change between deploys.

### Calibration loop

Calls flagged via the star button on call detail become calibration examples.
Stored on `tenant.calibrationCalls` (JSON: `[{ callId, type, notes }]`).
Manager reclassifications (`call_reclassifications` table, migration
`20260421080000`) feed back into next grading run as `feedbackCorrections`
text in the grading prompt (see `lib/ai/grading.ts:603`).

### TCP scorer

- `lib/ai/scoring.ts` — 8-factor weighted ensemble (see Architectural
  Philosophy → TCP).

---

## Call pipeline

End-to-end data flow as it actually runs today (Session 43 state).

### Ingestion — three layers

1. **Webhook (primary, 67% of calls when functioning per Session 35 audit)**
   - Endpoint: `app/api/webhooks/ghl/route.ts`
   - HMAC signature verified against `GHL_WEBHOOK_SECRET`. Mismatched signature
     drops the event silently; logs "first tenant" fallback was removed in
     Session 33 Fix #4 to prevent multi-tenant leak.
   - Writes `WebhookLog` row with `status='processing'` on arrival; updates to
     `success` or `failed` + `errorReason` after `handleGHLWebhook` resolves.
     Response to GHL returns immediately; outcome update is async.
   - Routes to handler in `lib/ghl/webhooks.ts` based on event type.
2. **Polling (safety net, runs every 1 min)**
   - Script: `scripts/poll-calls.ts`. HTTP wrapper at
     `app/api/cron/poll-calls/route.ts`.
   - Per-tenant timestamp lock (45s self-expiring) — replaced
     `pg_advisory_lock` after pgbouncer leak (Session 35).
   - Per-user `/conversations/search` — catches calls webhooks missed.
3. **Manual upload**
   - Component: `components/calls/upload-call-modal.tsx`.
   - Endpoint: `app/api/[tenant]/calls/upload/route.ts`.
   - WAV/MP3 file → Deepgram → grading queue. Bypasses GHL ingestion entirely.

### GHL event vocabulary (what GHL actually sends)

| Event | Code expects | Notes |
|---|---|---|
| Inbound/outbound call (built-in dialer) | `TYPE_CALL` | Session 35 fix — older code expected `CALL` |
| Inbound/outbound call (legacy / older clients) | `CALL` | Both supported |
| Appointment created | `AppointmentCreate` | NOT `AppointmentCreated` (Session 35) |
| Task completed | `TaskComplete` | NOT `TaskCompleted` (Session 35) |
| Pipeline stage changed | `OpportunityStageUpdate` | (Session 35) |

### Skip routing (in `runGradingProcessor()`)

| Condition | Status | callResult |
|---|---|---|
| `duration > 0 && duration < 45` | `SKIPPED` | `short_call` |
| `duration === null` or `duration === 0` | `SKIPPED` | `no_answer` |
| `wf_*` ID with no recording | `SKIPPED` | (automation duplicate of real call) |
| `recordingUrl === null && transcript === null` | `PENDING` (waiting) | — |
| Recording age > 2h with no recording | `PENDING` (logs warning) | — |
| Otherwise | `PROCESSING` → grade → `COMPLETED` / `FAILED` | (set by grader) |

### Grading processor — single tick (`lib/grading-processor.ts`)

```
runGradingProcessor()
  ├─ Heartbeat audit row started (cron.process_recording_jobs.started)
  ├─ Step 0: UPDATE calls SET property_id = matching property (raw SQL)
  ├─ Step 1: PENDING calls (BATCH_SIZE=50, MIN_AGE_MS=30s)
  │   for each:
  │     ├─ Atomic claim: updateMany PENDING → PROCESSING
  │     ├─ Skip routing (above)
  │     ├─ Fetch recording via GHL if missing
  │     ├─ gradeCall(call.id) → Opus 4.6 + extended thinking
  │     │   └─ writes COMPLETED + score + rubric + coaching + intel + next-steps
  │     └─ on error: PROCESSING → PENDING (retried next tick)
  ├─ Step 2: Drain RecordingFetchJob queue
  │   - Up to 10 jobs/tick, exponential backoff up to 5 attempts
  │   - 7-day cleanup of DONE rows
  ├─ Step 3: Catch-up deal-intel extraction
  │   - 1 call per tick (Opus 16s budget — keeps tick under 60s)
  │   - On success: triggers Property Story regen (fire-and-forget)
  └─ Heartbeat audit row finished (cron.process_recording_jobs.finished)
```

### Rescue sweeps (top of every tick)

```
PROCESSING > 5 min        → PENDING   (Session 38 Fix 2)
FAILED + recordingUrl
  + updatedAt > 1h ago    → PENDING   (Session 38 Fix 3)
```

Both rely on `Call.updatedAt @updatedAt @map("updated_at")` (migration
`20260420230000_add_updated_at_to_call`). Prisma's `@updatedAt` directive
auto-bumps `updated_at` on every `update()` / `updateMany()`, preventing
infinite rescue loops.

### Pipeline verifier (recurring health check, rollout-ready)

`scripts/verify-calls-pipeline.ts` runs bidirectionally:
- **Pass A** — DB → GHL: per-id integrity check.
- **Pass B** — GHL → DB: coverage check via `/conversations/search` +
  per-conv messages + client-side `isCall` filter (verbatim copy of
  `lib/ghl/webhooks.ts:120-123`).
- **Sanity gate** — 5 source-tagged SKIPPED rows must verify against GHL.
- **Canary** — count of `calls WHERE source IS NULL` (taper monitor).

Closed Blocker #1 in Session 37. Good candidate for daily cron / pre-deploy
gate.

---

## Safety gates

Pattern lives in `lib/gates/requireApproval.ts`. Code-level interceptor —
prompt instructions are not security boundaries (CLAUDE.md Rule 4).

```typescript
await requireApproval({
  action: 'sms_blast',
  description: `Send SMS to ${count} contacts`,
  data: { contactIds, message },
  userId: session.userId,
  tenantId: session.tenantId,
})
```

| Action | Gate type |
|---|---|
| SMS blast > 10 contacts | Confirmation modal + count display |
| Bulk property status change | Preview list + confirm count |
| Delete any record | Soft delete first; hard delete requires second confirmation |
| Webhook registration / deregistration | Log + confirm |
| Bulk GHL contact update | Preview diff + confirm |

> **Open issue (Blocker #2):** `app/api/properties/[propertyId]/blast/`
> sends SMS/email to N buyers without `requireApproval` — flagged in
> `docs/audits/ACTION_EXECUTION_AUDIT.md`. Fix is one import + one call.

---

## Pointers

- **Operational state** (crons, page roster, blockers, schema migrations,
  hygiene scripts) — `docs/OPERATIONS.md`
- **Why a decision was made** — `docs/DECISIONS.md`
- **Active blockers + audit queue** — `docs/AUDIT_PLAN.md`
- **Audit deliverables** (e.g. `ACTION_EXECUTION_AUDIT.md`) — `docs/audits/`
- **Historical session log** — `docs/SESSION_ARCHIVE.md`
- **UI design system** — `docs/DESIGN.md`
- **Vendor field comparison** (informed Wave 1 schema) —
  `docs/API_FIELD_INVENTORY.md`
- **Embedded playbook content** — `docs/NAH-Wholesale-Playbook/` (data,
  loaded into pgvector by `scripts/load-playbook.ts`)
