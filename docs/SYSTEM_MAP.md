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
| **Gunner** | Properties (ARV, repairs, equity, MAO, assignment fee, status), call grades + rubrics + coaching, KPI snapshots + milestones, buyer activity + deal blasts, role configs + permissions, AI logs, deal intel (cumulative across calls), property stories, vendor enrichment data |

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
- `lib/ghl/resolveAssignee.ts` — internal `userId` → GHL `userId` resolver
  (single source of truth across actions/route.ts and assistant/execute/route.ts).
- `lib/ghl/fetch-recording.ts` — recording URL retrieval with retry.
- `lib/ghl/webhook-register.ts` — register/deregister webhooks. Currently has
  a silent `.catch(() => {})` flagged in Blocker #2 / AUDIT_PLAN.

### AI

See "AI Layer" section below. Lives in `lib/ai/`.

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

Per-vendor isolation: vendor failures do not take down the orchestrator.

### Buyers

- `lib/buyers/sync.ts` — buyer matching against new properties + outreach sync.

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

### Embeddings + semantic search

- `lib/ai/embeddings.ts` — OpenAI `text-embedding-3-small`. Embeds knowledge
  documents and calibration calls. pgvector similarity search.
- 42 playbook docs + user profiles loaded + embedded into pgvector.

### Context builder

- `lib/ai/context-builder.ts` — central knowledge assembly. Pulls:
  - Tenant company standards + scripts + calibration call list
  - Prior 50 calls (full summaries) for the user/contact
  - Top 50 calibration examples (semantic + recent)
  - pgvector-matched playbook docs (industry knowledge, objection handling, scripts)
  - Manager corrections from `call_reclassifications` table (in-context corrections feed)

### Role Assistant (74 tools)

- Routes:
  - `app/api/ai/assistant/route.ts` — chat endpoint.
  - `app/api/ai/assistant/execute/route.ts` — action execution.
  - `app/api/ai/assistant/session/route.ts` — daily session persistence.
- Component: `components/ui/coach-sidebar.tsx` — right-sidebar chat surface
  on every page, action card UI, edit panel, confirm modal.
- Tool registry: `lib/ai/assistant-tools.ts` — 74 tools across CRM, calls,
  properties, contacts, blasts, workflows, etc.

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
