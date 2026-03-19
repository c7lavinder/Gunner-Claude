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

## Decisions Still Open — need resolution before Phase 2

| # | Question | Options | Notes |
|---|---|---|---|
| D-012 | Email provider | Resend vs Postmark vs SendGrid | Resend is simplest to integrate, good free tier |
| D-013 | Call transcript source | GHL native vs Deepgram vs AssemblyAI | GHL has native transcription in some plans — check first |
| D-014 | Property enrichment | Zillow API vs RapidAPI vs county scraping | Zillow API is expensive at scale, RapidAPI has cheaper alternatives |
| D-015 | Queue system for grading | BullMQ (Redis) vs SQS vs none | Add when volume exceeds ~100 calls/day/tenant |
| D-016 | GHL Marketplace submission | Submit now vs wait for MVP validation | Wait — needs real user testing first |
