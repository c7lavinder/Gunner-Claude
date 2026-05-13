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

### D-047 — Gunner is source of truth for buyer-info; GHL keeps contact info only

**Decision**

For Buyer rows, Gunner owns: `tier`, `verifiedFunding`,
`purchasedBefore`, `responseSpeed`, `lastContactDate`, `buybox`,
`markets`, `internalNotes`. GHL owns: `name`, `phone`, `email`,
mailing address, `tags`, `source`. The sync direction in
`lib/buyers/sync.ts` is contact-only on existing buyers — buyer-info
fields seed from GHL once at first import and never overwrite after.

**Why**

- Per the user (CEO Corey, Session 78): "I want to get rid of those
  fields in GHL and have Gunner as source of truth for buyer info and
  GHL as just the source of truth for contact info."
- GHL custom-field dropdowns are static and unwieldy (no add-on-the-fly
  for markets, no boolean response-speed primitive); Gunner can render
  the right shape per field without that constraint.
- Eight GHL custom fields are scheduled for deletion per
  `docs/GHL_BUYER_FIELD_DELETION_CHECKLIST.md` once the owner verifies
  Gunner-side accuracy.
- Contact info legitimately belongs in GHL because outbound channels
  (SMS, email, calls) all flow through GHL infrastructure; keeping
  Gunner authoritative there would create two sources of phone/email
  truth — exactly the drift CLAUDE.md Rule 1 prevents.

**Alternatives considered**

- Gunner authoritative for everything (contact info too). Rejected —
  GHL is the outbound dispatch layer; phone/email round-trip there
  every time we send. Two sources of phone truth would split.
- Keep status quo (GHL fields). Rejected — every write surface in
  Gunner already wrote to `Buyer.customFields` (the local cache); the
  GHL fields were read-only mirrors with no UI for the rep to edit
  there anyway.

**Status:** Locked. Date: 2026-05-10 (Session 78).

---

### D-048 — Drop `secondaryMarket` entirely; one canonical `markets` field

**Decision**

`Buyer.customFields.secondaryMarkets[]` is retired. Existing values
were folded into `Buyer.primaryMarkets` (case-insensitive dedupe) by
`scripts/backfill-buyer-fields.ts` on Session 78b. The
`BuyerEditSlideover` no longer renders a secondary-market field.
Markets is a single chip multi-select with on-the-fly add (new entries
persist tenant-wide).

**Why**

- The primary/secondary distinction existed because GHL dropdown was
  locked to a fixed list; reps used "Secondary Market" as a free-form
  escape hatch for one-off markets. In Gunner there's no reason for
  two fields — the chip multi-select with add-new gives the same
  flexibility without the conceptual split.
- Per the user (Session 78b): "I think in this app we can change that
  and when we get new deal in a market we can add it."
- Match logic (`buyerMatchesMarket` in
  `app/api/properties/[propertyId]/buyers/route.ts`) was already
  combining primary + secondary into one matching set — this just
  collapses the storage to match the matching behavior.

**Alternatives considered**

- Keep secondary alongside primary, both addable. Rejected — UI
  sprawl with no real semantic difference between the two fields.
- Migrate but keep the field hidden in the API for back-compat.
  Rejected — silent dead fields rot; clean removal forces correct
  callers.

**Status:** Locked. Date: 2026-05-10 (Session 78b). Backfill ran live
2026-05-10: 2,055 buyers updated, 0 errors.

---

### D-049 — Buyer ↔ property market match uses ONLY `Buyer.primaryMarkets`

**Decision**

`buyerMatchesMarket()` in
[app/api/properties/[propertyId]/buyers/route.ts](app/api/properties/%5BpropertyId%5D/buyers/route.ts)
reads exactly one field on the Buyer record: `primaryMarkets`. No
fallbacks to `customFields.secondaryMarkets`, `citiesOfInterest`,
`countiesOfInterest`, `zipCodesOfInterest`, `mailingCity`, `tags`, or
`isNationalBuyer`. The buyer profile UI's "Markets" chip multi-select
is the single source of truth.

**Why**

- An interim widening (Session 84) pulled from all six geography
  surfaces to recover buyers whose Markets field was unpopulated. Owner
  rejected: "I think you are pulling from not important fields. In
  buyer profile, there is a field for markets. That is only one we
  need to pull from."
- Matching from multiple fields makes the kanban results unpredictable
  for ops — reps can't tell which field a match came from. Single
  source = "if the buyer profile shows Chattanooga, they match."
- `mailingCity` / `tags` etc. drift over time and reflect things other
  than the buyer's actual buy zone (a Knoxville flipper might have a
  Nashville mailing address; tags hold legacy GHL pipeline labels).
- Composes cleanly with D-048: storage is one field, matching reads
  one field, the UI edits one field.

**Behavior preserved across the narrowing**
- Substring + normalization still handles "Chattanooga" ↔ "Chattanooga,
  TN" ↔ lowercase variants.
- "Nationwide" inside `primaryMarkets` still matches every property.
- The diagnostic banner in Section 3 (Buyer Match) counts buyers whose
  `primaryMarkets` is non-empty, so reps can see at a glance whether a
  0-matches situation is "no buyers tagged with this market" vs
  "Markets field empty across the whole buyer DB".

**Operational implication**

If a buyer should match but doesn't, the fix is upstream — populate
the buyer's profile Markets field. Don't add new fallback fields to
the matcher.

**Status:** Locked. Date: 2026-05-11 (Session 84). No backfill needed
— D-048 already migrated everyone's market data into `primaryMarkets`.

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

---

### D-050 — Worker-agent architecture in 3 risk-ascending waves with mandatory send framework

**Decision:** Gunner's automation layer will be built as 16 worker
agents in three waves, risk-ascending. No customer-facing send agent
ships before the shared send framework (template registry + approval
queue + code-level send gate + suppression list + quiet hours +
per-tenant caps + ESLint rule blocking direct provider imports).
Each agent has its own spec doc under `docs/agents/<name>.md`
following a fixed template.

Wave 1 (site-keeping, autonomous): cron-sentinel, stuck-calls-recovery,
tcp-anomaly-surfacer, webhook-drift-watchdog.

Wave 2 (internal team work, autonomous, no customer contact):
lead-triage, pipeline-janitor, followup-task-builder,
property-enrichment-iterator, buyer-match-outreach-queue,
daily-operations-briefing, internal-alert-hub.

Wave 3 (customer-facing sends, vetted templates only, approval queue
on first 30-90 days each): _send-framework, appointment-reminder,
drip-cadence-migrator, missed-call-autoresponder, no-show-recovery,
walkthrough-coordinator.

**Why:**
- Rule 4 (Worker Agent Architecture in CLAUDE.md) mandates `end_turn`
  completion signals, code-level high-stakes gates, isolated context,
  structured JSON tool returns. The wave order operationalizes this:
  internal-only agents (Waves 1-2) can iterate fast under those
  constraints; customer-facing agents (Wave 3) only ship once the
  defense layer is in place.
- Corey's autonomy bar (2026-05-11, saved as memory): customer-facing
  SMS/email is restricted to narrow pre-approved scenarios with vetted
  templates. Free-form LLM-generated outbound is disallowed initially.
  The send framework enforces this at the code level — ESLint rule
  blocks any direct import of `twilio`, `@sendgrid/mail`, etc., outside
  the gate.
- A unified send gate plus a versioned template registry means every
  customer touch is auditable, dedupe-able, suppression-aware, and
  rate-limited. Prompt instructions are not security boundaries —
  code-level interceptors are.

**Alternatives considered:**
- Build customer-facing agents first ("kill GHL workflows ASAP").
  Rejected — without the gate, a single regression or prompt injection
  could blast hundreds of real customers. Risk of one disaster
  outweighs migration speed.
- Per-agent ad-hoc send paths (each agent calls Twilio directly).
  Rejected — replicates the GHL workflow sprawl problem in our own
  codebase. The whole point of the migration is to centralize.
- LLM-generated personalized message bodies on each send. Rejected —
  non-deterministic content can't be audited or compliance-reviewed,
  and is the vector for prompt-injection-driven outbound abuse.
  Personalization stays via variable substitution into vetted
  templates only.
- Skip the spec docs, "just build agents as needed." Rejected —
  this is exactly how the prior Gunner build accumulated AI features
  that didn't compose. Per-agent specs (purpose, trigger, tools,
  outputs, approval gates, completion signal, failure modes, test
  plan, implementation notes) force decisions before code, like
  Rule 1 (Data Contract Rule) does for settings.

**Status:** Locked at planning stage. Date: 2026-05-11 (Session 85).
References: `docs/AI_AUDIT.md`, `docs/agents/README.md`,
`docs/agents/_send-framework.md`, and 16 per-agent spec docs under
`docs/agents/`.

---

### D-051 — LLM Rewiring Plan: tiered cost cap, measured budgets, tiered evals, LM-DEAC as code

**Decision:** The LLM Rewiring Plan (Elite Edition) ships with five
specific corrections applied to the original draft before execution.
These corrections are non-negotiable for the plan to deliver its
intended outcomes.

The five corrections (all integrated into `docs/LLM_REWIRING_PLAN.md`):

1. **Tiered cost cap, not blanket.** Critical-path LLM calls (call
   grading, deal intel, property enrichment, property story regen,
   photo classifier) are exempt from the per-tenant daily budget;
   they are subject only to a hard tenant ceiling (default $500/day)
   that pages Corey but does not refuse calls. Discretionary calls
   (Role Assistant, AI Coach, dispo-on-demand, session-summarizer,
   user-profile generation) are subject to the daily budget and
   refused on cap-hit.

2. **Tool count verified before Phase 3.** The original plan claimed
   "74 → 15 tools." Phase 0 verified the count BUT used a flawed grep
   that missed inline shorthand definitions; reported 38. Phase 3a
   (2026-05-13) re-counted properly: **real total is 83 tools.**
   Post-cleanup target per `docs/TOOL_AUDIT.md`: **43 tools (~2×
   reduction)** — the 15-tool target would gut real product capability
   (appointment management, buyer pipeline, CRM creation). See Section 2
   + Section 13 of `docs/LLM_AUDIT_BASELINE.md`.

3. **Per-tenant budget default is measured, not guessed.** The original
   plan hard-coded $25/day. Phase 0 computed real spend from `ai_logs`:
   NAH p95 daily spend is $22.07, p99 is $38.13. Default budget rule:
   `max(10, ceil(1.5 × p95 / 5) × 5)`. NAH default = $35/day.

4. **Tiered evals (smoke/medium/full) instead of full suite on every
   pre-commit.** Smoke (5 prompts, pre-commit, ~$0.50/run, <30 sec)
   catches obvious regressions. Medium (15-20 prompts, CI on PRs,
   ~$2/run, 1-2 min) catches cross-surface drift. Full (50+ prompts,
   nightly cron + manual, ~$5/run, 5-10 min) catches everything.
   Original "full on every pre-commit" would have been bypassed within
   a week.

5. **LM-DEAC implemented as code in Phase 0, not described as a
   metric.** `lib/kpis/lm-deac.ts` ships with `calculateLmDeac` and
   `calculateLmDeacRange`. Operational definition locked:
   `LM-DEAC = dials + tasksCompleted + (apptsSet × 3) +
   scriptAdherenceScore`. Pre-soak 14-day baseline persisted per
   user before Phase 1 starts; +25% target measured against this
   baseline.

**Why these specific corrections:**

- Correction (1): the blanket cap would have silently blocked 99.9% of
  legitimate spend mid-day on busy days. Critical-path is the product;
  it cannot be cap-refused. Verified by 30-day spend split: $166.42
  critical / $0.24 discretionary.
- Correction (2): the original "74 → 15" framing was inaccurate.
  Phase 3 still does useful work, but the headline narrative shifts.
- Correction (3): hard-coding $25/day was unsafe — NAH has had days
  hit $38, and the $25 cap would have blocked the rest of those days'
  legitimate spend.
- Correction (4): expensive pre-commit hooks get bypassed (`--no-verify`)
  within a week of friction. The eval safety net only works if it's
  actually run; tiered shape keeps friction low at commit time and
  comprehensive at PR/merge/nightly time.
- Correction (5): a metric described in prose drifts. Multiple reviewers
  produce multiple numbers from the same data. Code is the contract.

**Alternatives considered:**

- Keep the original plan and discover these issues during execution.
  Rejected — at least three of the five would have caused production
  incidents (cost-cap blocking grading, $25 budget blocking NAH).
- Add the corrections as separate ADRs over the course of execution.
  Rejected — coupling them into one decision keeps the plan reviewable
  as a unit.
- Defer LM-DEAC implementation to Phase 1 or later. Rejected — without
  a working LM-DEAC at Phase 0, every downstream phase's "did this
  help?" question becomes unanswerable.

**Known limitations of the locked decisions:**

- LM-DEAC `apptsSet` field uses `property.updatedAt` proxy until
  Phase 0e instruments proper stage-transition audit logging.
- LM-DEAC `scriptAdherenceScore` averages all rubric categories
  because no `script_adherence` key exists yet. Phase 6 may introduce
  one.
- LM-DEAC `tasksCompleted = 0` for all NAH users in baseline. Either
  team doesn't use Gunner tasks or completion paths skip `completedAt`.
  Phase 1 investigates.

**Status:** Locked. Date: 2026-05-12 (Session 86).
References:
- `docs/LLM_REWIRING_PLAN.md` (the plan, patches integrated inline)
- `docs/LLM_AUDIT_BASELINE.md` (Phase 0 baseline + open issues)
- `lib/kpis/lm-deac.ts` (LM-DEAC implementation)

---

### D-052 — Prompt-version drift signal on every `logAiCall`

**Decision:** Every Anthropic API call routed through `lib/ai/log.ts`
stamps the semver of the prompt-source-of-truth into
`ai_logs.prompt_version`. The column is the foundation for Phase 9
drift detection — `scripts/drift-report.ts` groups by
`(type, page-context bucket, prompt_version)` and surfaces score /
latency / cost / error deltas across prompt revisions.

**Implementation contract:**

1. Every prompt-source module under `lib/ai/prompts/<surface>.ts`
   exports `VERSION = 'major.minor.patch'`. Caller (e.g.
   `lib/ai/grading.ts`) re-exports as `<SURFACE>_PROMPT_VERSION` and
   threads through `logAiCall({ ..., promptVersion })`.

2. Inline / route-local prompts (small one-offs that don't justify a
   module) declare a local `const X_PROMPT_VERSION = '1.0.0'` at the
   top of the route file. Same threading.

3. Schema: `ai_logs.prompt_version TEXT` (nullable; legacy rows stay
   NULL) + composite index `(type, prompt_version)`. Migration:
   `20260513200000_add_ai_log_prompt_version` (additive). `logAiCall`
   has an internal try/catch at `lib/ai/log.ts:56` that swallows
   P2022 errors — deploy ordering is FLEXIBLE.

4. Bump rule: any prompt content edit (text, examples, schema prose,
   rule ordering) bumps the VERSION constant in the SAME commit.
   Without that, the drift signal collapses because runtime behavior
   changes but the version label doesn't.

**Coverage at adoption (2026-05-13):** 16 prompt-version sources / 22
`logAiCall` call sites covering every production Anthropic surface
(grading, next-steps, coach, deal-intel, property-story, dispo
description/listing/social/tier-messages, user-profile,
session-summarizer, assistant, enrich-property, ai-edit, manual-next-
steps, property-suggestions, blast-legacy, outreach-action,
buyer-response classify, buyer-scoring). Only unwired site:
`scripts/audit.ts` daily self-audit cron (dev-facing, 1 row/day, low
priority).

**Photo-classifier exception:** `lib/ai/photo-classifier.ts` exports
`VERSION` but is intentionally NOT wired to `logAiCall` — ~250
classifications per photo-upload session would dominate `ai_logs`
without producing meaningful drift signal (single-token classification
into one of 7 buckets; the volume drowns everything else).

**Why semver:** the bump pattern matches engineer intuition. `1.0.1` is
a polish-only edit (no behavior change expected); `1.1.0` adds a
behavioral rule (compatible output contract); `2.0.0` changes the
output contract (downstream consumers update in the same PR).

**Alternatives considered:**

- Auto-derive version from a SHA hash of the prompt content. Rejected
  — hash collisions in version-grouping queries are nonzero, and a
  rolling hash makes it impossible to label "this was the version we
  shipped to prod in week 19" in user-facing surfaces.
- Per-tenant prompt versions (allow tenants to customize). Rejected
  — turning prompts into per-tenant config is a much bigger lift and
  isn't the drift problem we're solving today. The current rule
  assumes one prompt per surface across all tenants.
- Stamp version into `ai_logs.input_summary` instead of a new column.
  Rejected — un-indexable; can't run the group-by queries that make
  drift detection cheap.

**Companion convention — Phase 10 typed calibration shape:** when
human feedback on AI output is persisted to `Call.calibrationNotes`,
the format is `"<kind>: <free-text notes>"` with `kind ∈ {good, bad}`.
Established at `app/api/ai/assistant/execute/route.ts:952` (assistant
flag_calibration tool) and
`app/api/[tenant]/calls/[id]/calibration/route.ts` (user-facing Good/Bad
popover). `scripts/mine-eval-candidates.ts` parses this prefix to
bucket entries for eval-fixture promotion.

**Status:** Locked. Date: 2026-05-13 (Session 89 pass 11).
References:
- `prisma/migrations/20260513200000_add_ai_log_prompt_version/`
- `lib/ai/log.ts` (the single `db.aiLog.create` choke point)
- `scripts/drift-report.ts` (Phase 9b drift signal CLI)
- `scripts/_phase8-check.ts` (transient — Phase 8 wiring health check)
- `scripts/mine-eval-candidates.ts` (Phase 10 — mines feedback signals)
- `AGENTS.md` — "AI prompt versioning convention" section
- `docs/LLM_AUDIT_BASELINE.md` — Sections 30e-30o for the rollout story

