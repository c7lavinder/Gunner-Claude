# DECISIONS.md — Gunner AI Decision Log

> Every significant technical or product decision lives here with its rationale.
> Before reversing a decision, read why it was made. Before making a new one, check if it's already here.

---

## Format

Each entry: **Decision** → **Why** → **Alternatives considered** → **Date / status**

---

## Infrastructure Decisions

### D-001 — Next.js 14 App Router over Pages Router or separate frontend/backend

**Decision:** Next.js 14 with App Router for everything — pages, API routes, server components.

**Why:**
- One repo, one deploy, one mental model
- Server components eliminate entire category of data-fetching complexity
- Railway deploys Next.js natively — zero extra config
- App Router's route groups `(auth)` and `(tenant)` map perfectly to our needs

**Alternatives considered:**
- React SPA + separate Express API → Two repos, two deploys, CORS complexity, not worth it for this stage
- Remix → Similar capability but smaller ecosystem, less Next.js-specific tooling
- Pages Router → Works but server components are a significant DX improvement

**Status:** Locked. Do not change.

---

### D-002 — Supabase over plain PostgreSQL or Firebase

**Decision:** PostgreSQL via Supabase.

**Why:**
- Row Level Security (RLS) is built-in — tenant isolation at DB level is basically free
- Supabase provides managed Postgres with connection pooling — we don't manage infra
- Real-time subscriptions available when we need live updates (inbox, call processing status)
- The Prisma + Supabase combination is well-documented and battle-tested

**Alternatives considered:**
- Plain PostgreSQL on Railway → We'd have to manage connection pooling, backups, etc. Not worth it.
- Firebase/Firestore → NoSQL makes Prisma-style type safety impossible. Multi-tenant queries are painful. No.
- PlanetScale → MySQL, not Postgres. No RLS. Deal-breaker.

**Status:** Locked. Do not change.

---

### D-003 — Railway over Vercel for deployment

**Decision:** Railway for application hosting.

**Why:**
- Cron jobs are built-in (audit agent, KPI snapshots) — Vercel requires external cron service
- Longer function timeout — grading calls can take 20-30 seconds, Vercel free tier times out at 10s
- Simpler pricing — Railway charges for what you use, not function invocations
- Can run scripts (seed, audit) directly — Vercel is serverless only

**Alternatives considered:**
- Vercel → Best Next.js DX, but no cron, function timeout issues, no persistent file system
- Fly.io → More control but more ops complexity
- AWS → Way too much for this stage

**Status:** Locked. Do not change.

---

## GHL Integration Decisions

### D-004 — OAuth Marketplace App over API keys

**Decision:** GHL OAuth Marketplace App for all tenant connections.

**Why:**
- Scale: 100 tenants means 100 API keys to manage manually. OAuth is self-serve.
- Security: OAuth tokens are short-lived and scoped. API keys are permanent and broad.
- UX: Tenant connects GHL themselves in onboarding. No manual credential sharing.
- GHL-approved: Marketplace apps get preferential treatment and rate limits from GHL.

**Alternatives considered:**
- API key per tenant (manually entered) → Works for 5 clients, breaks at 20. Not scalable.
- Single agency-level API key → Can't scope to individual sub-accounts cleanly. Security risk.

**Status:** Locked. Submit to GHL Marketplace when MVP is validated.

---

### D-005 — Store properties in our DB, not rely on GHL contacts

**Decision:** We own properties. GHL owns contacts. Linked via `ghlContactId`.

**Why:**
- GHL contacts are person-centric. We need property-centric data.
- One seller (contact) can own multiple properties — GHL has no native property object.
- Our KPIs are property-based (deals closed, properties in pipeline) not contact-based.
- We need fields GHL doesn't have: ARV, MAO, assignment fee, construction estimate, property status.
- Disposition workflow requires fast property browsing — GHL's UI is too slow for this.

**Alternatives considered:**
- Store everything in GHL custom fields → Custom fields are per-contact, not per-property. Can't handle 1 seller → N properties. Query performance is terrible.
- Fully replicate GHL contact data → Sync hell. GHL is source of truth for contacts. We'd be maintaining a stale mirror.

**Status:** Locked. This is core to the product's value.

---

### D-006 — Pipeline stage trigger for property creation (not tag or form)

**Decision:** A property is created when a GHL contact enters a specific pipeline stage.

**Why:**
- Pipeline stages represent intent — when a rep moves a contact to "Appointment Set," they're saying "this is a real deal to track."
- Tags are too messy — reps add/remove tags inconsistently.
- Form submission creates properties for every lead — too noisy, most don't become deals.
- Pipeline stage is a deliberate action by a human who has qualified the lead.

**Alternatives considered:**
- Tag-based trigger → Tags get added/removed randomly. Too many false positives.
- Contact created → Creates a property for every imported lead. Inventory becomes useless noise.
- Form submission → Same problem as contact created.
- Manual create → Removes automation value. Reps forget.

**Status:** Locked, but each tenant configures WHICH stage triggers it.

---

## AI Decisions

### D-007 — Claude claude-opus-4-6 for all AI features

**Decision:** Anthropic Claude claude-opus-4-6 for call grading, AI coach, and self-audit.

**Why:**
- Best reasoning quality for nuanced sales call analysis
- Strong JSON output compliance — grading returns structured data
- Long context window — can handle full call transcripts
- We're building on Anthropic's platform (Claude.ai) so using the same API is consistent

**Alternatives considered:**
- GPT-4o → Comparable quality, but we're Anthropic-native. Single vendor preferred.
- Claude Sonnet → Faster and cheaper, but grading quality noticeably lower in tests
- Fine-tuned smaller model → Build complexity not worth it at this stage

**Status:** Using claude-opus-4-6. Revisit with claude-sonnet-4-6 if cost becomes an issue at scale.

---

### D-008 — Fire-and-forget call grading (not synchronous)

**Decision:** Start grading asynchronously after saving the call. Don't await it in the webhook handler.

**Why:**
- GHL will retry the webhook if we don't respond within 5 seconds
- Claude grading takes 10-30 seconds
- If we await grading in the webhook, GHL retries → duplicate grades
- Async processing with `gradingStatus` tracking gives users real-time status

**Alternatives considered:**
- Queue system (BullMQ, SQS) → More robust but overkill for MVP. Add in Phase 2 if volume requires it.
- Synchronous in webhook → Causes GHL retry → duplicate calls graded → wrong scores

**Status:** Locked. Consider adding a proper queue when volume exceeds ~100 calls/day per tenant.

---

## Product Decisions

### D-009 — Path-based tenant routing over subdomains

**Decision:** `gunnerai.com/apex-wholesaling/dashboard` not `apex-wholesaling.gunnerai.com`

**Why:**
- Easier to deploy (no wildcard DNS, no SSL cert per tenant)
- Railway handles one domain cleanly — wildcard subdomains require custom config
- Easier for users to share links
- Can migrate to subdomains later with URL rewrites if needed

**Alternatives considered:**
- Subdomains → Professional look, but requires wildcard DNS + SSL. Railway setup is complex. Not worth it for MVP.
- Custom domain per tenant → Phase 3 feature for enterprise clients.

**Status:** Path-based for now. Custom domains in backlog.

---

### D-010 — Self-registration over manual tenant creation

**Decision:** New clients self-register, get a tenant slug, and go through onboarding themselves.

**Why:**
- Scalability — can't manually onboard 100 clients
- Lower friction — client can start same day they sign up
- Forces product to be clear enough that users don't need hand-holding
- Keeps the operator (us) out of the critical path for client activation

**Alternatives considered:**
- Manual creation by operator → Doesn't scale, creates bottleneck
- Wait for email verification before creating tenant → Adds friction, not necessary for B2B

**Status:** Locked. Add email verification and payment wall in Phase 2.

---

### D-011 — Role hierarchy: 6 roles with fixed permission matrix

**Decision:** 6 predefined roles (Owner, Admin, Team Lead, Acquisition Manager, Lead Manager, Disposition Manager) with a fixed permission matrix in code.

**Why:**
- Most wholesaling teams have these exact roles — it matches the industry
- Fixed matrix means simpler code and predictable behavior
- Customizable per-tenant roles would add enormous complexity for marginal benefit
- Tenants can configure what each role SEES (KPIs, card layouts) even if permissions are fixed

**Alternatives considered:**
- Fully custom roles → Complex RBAC builder, database schema for role-permission mappings, UI to manage it. Way too much for MVP.
- Simpler 3-role system → Admin / Manager / Rep. Too coarse — disposition and acquisition have very different access needs.

**Status:** Fixed roles. Per-tenant KPI/card config gives enough customization. Revisit full RBAC in Phase 3 if enterprise clients require it.

---

### D-017 — pgvector for knowledge search over keyword matching

**Decision:** Use pgvector (Supabase built-in) with OpenAI text-embedding-3-small for semantic search of playbook documents. Falls back to exact type/role matching if no OpenAI key set.

**Why:** 42 playbook docs with type/role filtering works but misses relevant content. Semantic search finds "how to handle price objections" even if the doc is categorized as "training" not "objection." Cost is negligible (~$0.001 for all 42 docs).

**Date:** 2026-04-02 | Active

---

### D-018 — Role Assistant with 74 tools over fewer, broader tools

**Decision:** Define all 74 actions from the architecture plan as individual Claude tools, each with specific input schemas.

**Why:** Specific tool definitions give Claude clear intent signals. "calculate_mao" with ARV/repair/fee params produces better results than a generic "run_calculation" tool. Users see exactly what the AI proposes before approving.

**Date:** 2026-04-02 | Active

---

### D-019 — Weekly auto-generated user profiles over manual-only

**Decision:** Auto-generate performance profiles from call data weekly (Sunday 3am cron), but never overwrite manually edited profiles.

**Why:** Profiles personalize AI coaching. Auto-generation ensures profiles stay current as reps improve. Manual edits take priority so managers can correct the AI's analysis.

**Date:** 2026-04-02 | Active

---

### D-020 — Lead Quality section for ad agency feedback

**Decision:** Add Lead Quality as a dedicated deal intel category with A-F grade, quality score, seller responsiveness, financial distress, DQ risks, and ad campaign attribution.

**Why:** Meta ads agency needs structured feedback on lead quality to optimize targeting. Having this data per-property lets the team say "Campaign X leads are 80% junk" with actual data.

**Date:** 2026-04-02 | Active

---

### D-021 — Long-running Railway [[services]] for reliability-critical workers, not [[cron]]

**Decision:** Reliability-critical background work (currently: grading pipeline) runs as a
long-running Railway `[[services]]` entry that loops the work internally, NOT as a Railway
`[[cron]]`. First example: `scripts/grading-worker.ts` (replaces the former `[[cron]]
process-recording-jobs`). Low-frequency or low-stakes crons (poll-calls, daily-audit,
daily-kpi-snapshot, weekly-profiles) remain on `[[cron]]`.

**Why:** On 2026-04-20 the `process-recording-jobs` `[[cron]]` silently stopped firing
mid-day. Zero audit trail, zero error, Railway did not surface the failure anywhere.
A no-op redeploy did NOT re-register the cron. After ~14 hours of silent pipeline
outage, converting to a long-running service resumed processing — same logic, same
60s cadence, different scheduler. Workers we can see start/stop (via heartbeat rows)
are the only kind we trust now.

**Alternatives considered:**
- Keep the `[[cron]]` with a whitespace-forced redeploy every N hours → we tried the
  whitespace redeploy. Did not re-register the cron. Rejected.
- External cron (GitHub Actions, EasyCron, etc.) hitting a Next.js API route → adds a
  third-party dependency, introduces auth + retry semantics in a new surface. Deferred.
- BullMQ / Redis-backed queue → correct long-term answer but premature. D-015 still open;
  add when volume exceeds ~100 calls/day/tenant or when we have multiple worker types.

**How to apply:** Any new worker that MUST run reliably goes behind a `[[services]]` block
with a dedicated `scripts/<name>-worker.ts` following the `scripts/grading-worker.ts`
template (entry-point guard in the underlying script + 60s loop + per-iteration catch).
See AGENTS.md § "Background Worker Conventions" for the template.

**Date:** 2026-04-20 | Active

---

### D-022 — Mandatory heartbeat audit rows + rescue sweeps for every worker

**Decision:** Every long-running worker writes `cron.<name>.started` and `cron.<name>.finished`
audit_logs rows per iteration, AND runs a rescue sweep at the top of every iteration that
resets stale intermediate-state rows back to their retry-eligible state.

**Why:** Before Session 38 there was no way to detect a silent worker outage without
Railway dashboard access (which was blocked by an invalid API token). Heartbeat rows
make "worker stopped running" visible via a single SQL query on audit_logs within 2 minutes
of the outage. Rescue sweeps make the worker self-healing across Railway redeploys, OOMs,
or any interruption that would otherwise leave claimed rows stranded in PROCESSING.

**Cost:** 2 audit_logs rows per worker iteration = ~2880 rows/day for a 60s-interval
worker. Negligible for Postgres at this scale. Retention is not an issue — audit_logs
is the canonical debugging surface and we WANT this trail.

**Alternatives considered:**
- Railway-side monitoring only → requires dashboard/API access we repeatedly lose.
- External uptime monitor (UptimeRobot etc.) hitting a health endpoint → tells you the
  API is up, not that the WORKER is running. Worse signal.
- Log-based alerting → requires log aggregation we don't have. Audit_logs is already
  in Postgres, already queryable.

**How to apply:** Copy the heartbeat + rescue template from AGENTS.md when creating any
new worker, OR when adding reliability guarantees to an existing script. Bug #23 in
PROGRESS.md tracks applying this pattern to the other 4 crons (poll-calls, daily-audit,
daily-kpi-snapshot, weekly-profiles).

**Date:** 2026-04-20 | Active

---

### D-044 — AI Model Selection Rule

**Status:** Accepted
**Date:** 2026-04-29
**Driver:** Lead acquisition cost

**Context**

Different parts of the codebase had used different Claude models without
a written rule. Pre-Wave-1 state:
- Grading on Opus 4.6
- Coaching on Sonnet 4.6
- `lib/ai/enrich-property.ts` pinned to `claude-sonnet-4-20250514`
  (date-stamped 2025 snapshot)
- 8 other files pinned to the same date-stamped snapshot

Wave 1 swept all 9 occurrences to `claude-sonnet-4-6` (commit `047ca18`)
and identified the need for a written rule. The rule had been referenced
as pending "D-044" across PROGRESS.md / SYSTEM_MAP.md / AUDIT_PLAN.md
since Wave 1 closed; this entry codifies it.

**Decision**

Stability-first model selection. Default to the most capable model that
fits the task. Downgrade only when latency or cost becomes a measured
problem, never preemptively.

**Driver**

Wholesale real estate teams spend hundreds of dollars per qualified
seller conversation. Maximum value extraction from each call matters
more than per-token cost optimization. Lead acquisition cost is the
binding constraint, not AI inference spend.

**Rules**

- Grading + structured high-stakes extraction (deal intel, next steps)
  → `claude-opus-4-6`
- Coaching + nuanced reasoning + audit reasoning → `claude-opus-4-6`
- Conversational outputs (coaching chat, Role Assistant) →
  `claude-sonnet-4-6`
- Generated narrative artifacts (property stories, user profiles) →
  `claude-sonnet-4-6`
- No date-pinned model snapshots anywhere — drift hazard. The Wave 1
  sweep removed 9 such pins; new code must use unpinned identifiers.

**Consequences**

- Higher per-call AI spend than minimum-viable
- Predictable output quality across features
- New AI features require capability assessment, not cost assessment
- Downgrade requires measured evidence (latency or cost data), not
  speculation

**Related**

- Wave 1 (commit `047ca18`): swept `claude-sonnet-4-20250514` across
  5 files. The original D-007 (single-model rule) is superseded by this
  finer-grained rule.
- Pending D-045 — KPI snapshot timestamp semantics (raised in
  AUDIT_PLAN.md, awaiting Corey decision).
- Pending D-046 — Add test framework (vitest)? Not yet raised in
  AUDIT_PLAN; provisional placeholder for the next session.

---

## Decisions Still Open

| # | Question | Options | Notes |
|---|---|---|---|
| D-012 | Email provider | Resend vs Postmark vs SendGrid | Resend is simplest to integrate, good free tier |
| D-013 | Call transcript source | GHL native vs Deepgram vs AssemblyAI | Deepgram integrated (D-006), GHL native not available |
| D-015 | Queue system for grading | BullMQ (Redis) vs SQS vs none | Add when volume exceeds ~100 calls/day/tenant |
| D-016 | GHL Marketplace submission | Submit now vs wait for MVP validation | Wait — needs real user testing first |
| D-017 | Deal intel storage model when a seller has multiple properties | See below | Open — impacts multi-property sellers |

---

### D-017 — Split deal intel between Seller (contact) and Property records

**Status:** OPEN — decision needed before multi-property sellers become common.

**Problem:**
Today all deal intel lives on `property.dealIntel`. That model assumes one property per
conversation. When a single seller owns or is discussing multiple properties, we either
duplicate person-level signals (motivation, timeline, decision makers, communication
style, family situation) across every property, or we only capture them on the first
one and lose them on the rest. Neither is correct, and the rep's mental model is
"this person sells, this house is the asset" — intel about *the person* should not be
property-scoped.

**Why it matters:**
- Rule 5 (True Conversion Probability) weights seller motivation + responsiveness. If
  those live per-property and get out of sync across a seller's portfolio, TCP is wrong.
- Rule 4 (Worker Agent Architecture) — downstream LLMs reading deal intel to decide
  next steps will see contradictory or duplicate signals.
- Cross-property analytics (Sharpe ratio, revenue correlation) can't join cleanly.

**Options:**

**A. Keep per-property, accept duplication.**
Simplest. Each property's dealIntel is a full snapshot. Duplicated seller signals stay
in sync only if the extraction pipeline writes to all of the seller's properties on
every call. Diverges otherwise.

**B. Split: Seller-level vs Property-level intel.**
Schema change: move person-scoped fields (motivation, timeline, decision makers,
communication style, family situation, rapport, financial distress, online behavior,
exactTriggerPhrases, whatNotToSay, sellerAskingHistory) onto the Seller/Contact record.
Keep asset-scoped fields (condition, liens, tenants, title, offers, walkthrough,
back taxes, HOA, zoning, environmental) on Property. Extraction prompt asks the AI to
disambiguate "which house is this about" and writes to the right record.
  - Cleanest long-term model.
  - Requires: Prisma migration, extraction prompt rewrite, PATCH route split by scope,
    UI rewrite of PropertyDataTab + snapshot section on Seller page, regrading consideration.
  - Cross-call learning becomes easier (seller profile builds over a career, not per asset).

**C. Property-level primary, with a pointer up to Seller.**
Hybrid. Seller record holds only the latest-observed values for person-scoped fields,
derived from the most recent call involving that seller. Property dealIntel keeps
asset-scoped fields only. Seller fields are read-through; writes still happen at the
property extraction step, but the pipeline bubbles them up.
  - Less disruptive than B but still needs migration + prompt changes.
  - Risk: "latest observed" semantics means older per-property snapshots lose person-level
    context over time.

**Recommended path (not locked):** B, done incrementally.
  1. Add Seller-level JSONB column `sellerIntel` (empty).
  2. Mark each DealIntel field in `lib/types/deal-intel.ts` as `scope: 'seller' | 'property'`.
  3. Update extraction prompt to write seller fields to Seller.sellerIntel and property
     fields to Property.dealIntel. PATCH route branches on scope.
  4. PropertyDataTab keeps working for property fields. Seller fields surface on a
     new Seller page (or as a "About the seller" section above the property section).
  5. Backfill existing Property.dealIntel → copy seller-scoped fields up to the
     associated Seller if populated.

**Open sub-questions:**
- Do we need a `Seller` model today, or does GHL contact record (via `Property.sellerName`
  or a FK) serve? Check prisma/schema.prisma before committing.
- How do we handle conflicting seller signals across properties mid-migration?
  (Latest-wins, or manual reconciliation in UI.)
- Does TCP (lib/ai/scoring.ts) need to change to read from both scopes?

**Date opened:** 2026-04-22 | Raised during Property tab UX review.

---

### D-045 — Unified Partner table for non-buyer-non-seller deal participants

**Decision:** One `Partner` table + one `PropertyPartner` join, with
`Partner.types: Json` array carrying any combination of values
(`agent`, `wholesaler`, `attorney`, `title`, `lender`, `inspector`,
`contractor`, `photographer`, `property_manager`, `other`). Per-deal
role on the join via free-string `role` column. Seller + Buyer stay
as their own typed tables.

**Why:**
- A single contact often plays multiple roles (a wholesaler who is
  also a buyer-side agent). Separate tables would duplicate identity.
- New contact types (lenders, title companies) appear without warning
  in this domain; an array-based type field absorbs them with zero
  schema change.
- The fields agents and wholesalers share (identity, GHL link,
  performance counters, reputation, communication prefs) outweigh
  their differences. Type-flavored fields (license #, brokerage,
  buyer list size, prefers-assignment) live as nullable columns —
  cheap when empty, typed when used.
- Seller (200+ ownership-specific fields populated by vendor
  enrichment + TCP scoring) and Buyer (200+ buybox / capital fields
  populated by the disposition flow) are different enough that
  merging them would have invalidated v1.1 Wave 4–5 (Sessions 60–62).
  Partners as a distinct unified table is the right scope.

**Alternatives considered:**
- Separate Agent + Wholesaler tables mirroring Seller/Buyer.
  Rejected mid-Session-67 after shipping it (commit `bb94f97`) —
  the duplication cost across 80%-shared fields outweighed the
  per-type query convenience. Replaced with Partner in commit
  `e2c3fbf` before any data was written.
- Reuse the dormant `PropertySeller.role` field at
  `prisma/schema.prisma:1046` (defaults to "Seller", never read or
  written today). Rejected — storing an "Agent" row in the `sellers`
  table is semantically wrong, and the 200+ Seller-specific fields
  don't apply.
- Full unification (Sellers + Buyers + Partners in one table).
  Rejected — would have undone v1.1 Wave 4–5 and produced a
  ~600-column union table with 80%+ nulls per row. Multi-week
  rebuild to reverse a 5-session foundation; cost not justified.

**Per-deal role values (free string, extensible):**
- Agent flavors: `sourced_to_us` | `taking_to_clients` | `closing_agent`
- Wholesaler flavors: `sold_us_this` | `we_sold_them_this` | `jv_partner`
- Service flavors: `attorney_seller` | `attorney_buyer` |
  `title_company` | `lender` | `inspector` | `contractor` |
  `photographer` | `property_manager` | `other`

**Migration history:**
- `20260504000000_add_agent_wholesaler` — created the 4 intermediate
  tables (now empty in prod, kept in version history as record).
- `20260504010000_replace_agent_wholesaler_with_partner` — dropped
  the 4 empty tables (CASCADE) and created `partners` +
  `property_partners`. Same calendar day.

**Status:** Locked. Date: 2026-05-04 (Session 67).
Plan reference: `~/.claude/plans/at-te-he-very-base-mellow-pixel.md`.

---

### D-046 — Partner contacts live in GHL contacts, not a dedicated GHL pipeline

**Decision:** Partners are linked to Gunner from existing GHL contacts
via the property-detail "Link Partner" UX. There is no bulk-pipeline
sync route (the way `/api/[tenant]/contacts/sync-from-ghl` works for
Seller + Buyer pipelines). Partners are scattered across normal GHL
contacts; the canonical input is "find a GHL contact, mark it with one
or more partner types, Gunner creates the local row pointing at that
ghlContactId."

**Why:**
- Per the user (CEO Corey, Session 67): partners "are scattered.
  Should just live in GHL contacts" — they don't get their own
  pipeline because their relationship to the team isn't pipeline-
  shaped.
- Idempotency on `(tenantId, ghlContactId)` via
  `lib/partners/sync.ts:upsertPartnerFromGHL()` means re-linking the
  same GHL contact to a different property reuses the same Partner
  row and merges the types arrays.
- Avoids the "two sources of truth" drift problem CLAUDE.md's GHL
  boundary rule (Rule 1) prevents.

**Alternatives considered:**
- Dedicated GHL pipelines per type (Agents pipeline, Wholesalers
  pipeline). Rejected — pipelines exist to model deal stages, not
  contact categories. Forcing the categorization into a pipeline
  would create empty / synthetic stages.
- GHL tag-based identification (read `tags: []` on contacts, treat
  any contact tagged `agent` as an Agent). Possible future addition
  as a discovery aid ("show me all GHL contacts tagged 'agent'
  that aren't yet in Gunner") but not the canonical input — tag
  hygiene varies and would create silent type drift.
- Manual-entry-in-Gunner-only with no GHL link. Rejected —
  violates the GHL boundary rule.

**Status:** Locked. Date: 2026-05-04 (Session 67).
