# TECH_STACK.md — Gunner AI Complete Technical Vision

> The most important doc after CLAUDE.md.
> This defines what Gunner AI IS, what it DOES, and exactly how every piece fits together.
> Read this before building any new feature.

---

## What Gunner AI Is

**Gunner AI** is an AI-first CRM Enhancer for wholesale real estate teams.
It sits on top of Go High Level (GHL) and turns raw CRM activity into revenue intelligence.

This is NOT a CRM. This is a revenue intelligence layer.

### The 5 Core Systems

| # | System | What it does | Status |
|---|--------|-------------|--------|
| 1 | **Call Grading Engine** | Every sales call gets transcribed (Deepgram) and scored (Claude AI) the moment it ends. Rubric-based scoring, sentiment analysis, coaching tips, key moments. | LIVE — 17 calls graded |
| 2 | **Inventory Manager** | Wholesale properties auto-created from GHL pipeline stage changes. Financial fields (ARV, MAO, asking price), status tracking, custom fields per tenant. | LIVE — 2 properties via webhook |
| 3 | **True Conversion Probability (TCP)** | Lead scoring engine. 8-factor ensemble model (0.0–1.0) that recalculates on every call, stage change, and task completion. Surfaces Buy Signals when TCP is high but team engagement is low. | BUILT — v1 rule-based |
| 4 | **AI Coach** | Conversational coaching powered by Claude. Knows the rep's last 5 calls, scores, tasks, and properties. Gives direct, actionable feedback — not generic advice. | BUILT — basic version |
| 5 | **KPI & Accountability** | Role-based dashboards, daily snapshots, team hierarchy, performance trends. The daily driver that keeps teams accountable. | PARTIAL — schema ready, wiring needed |

---

## Real Numbers — New Again Houses (First Live Tenant)

| Metric | Value |
|--------|-------|
| Tenant | New Again Houses |
| Owner | [OWNER_EMAIL] |
| GHL Location | [GHL_LOCATION_ID] |
| Pipeline ID | [PIPELINE_ID] |
| Trigger Stage | [TRIGGER_STAGE_ID] |
| Calls Graded | 17 of 17 COMPLETED |
| Score Range | 8–72 (metadata-only grades, no transcripts yet) |
| Properties | 2 created via live webhook (Emi Yoshimura, Gregory Palm) |
| TCP Score Tested | 0.349 (Gregory Palm, rule-based ensemble) |
| Team Members | 1 (owner only — invites not yet sent) |
| Cron Polling | Every 5 minutes via Railway Function |
| Recording Transcripts | 0 (waiting for first real-time call with recording URL) |

---

## Current Stack — Locked

| Layer | Tech | Entry Point |
|-------|------|-------------|
| Framework | Next.js 14.2.35 App Router | next.config.js |
| Database | PostgreSQL via Supabase | prisma/schema.prisma |
| ORM | Prisma 5.14.0 | lib/db/client.ts |
| Auth | NextAuth.js v4 | lib/auth/config.ts |
| AI — Grading | Claude claude-sonnet-4-6 | lib/ai/grading.ts |
| AI — Coach | Claude claude-opus-4-6 | lib/ai/coach.ts |
| AI — Scoring | Rule-based ensemble | lib/ai/scoring.ts |
| Transcription | Deepgram nova-2 | lib/ai/transcribe.ts |
| CRM | GHL OAuth Marketplace App | lib/ghl/client.ts |
| Styling | Tailwind CSS + Radix UI | tailwind.config.ts |
| Charts | Recharts | components/ |
| Icons | Lucide React | components/ |
| Email | Resend | lib/email/ |
| Deploy | Railway + Supabase | railway.toml |
| State | Zustand | stores/ |
| Validation | Zod | lib/ |

---

## Feature Modules — Complete Inventory

### Module 1: Call Grading Engine (LIVE)

**What it does:** GHL call ends → poll-calls.ts detects it → Deepgram transcribes → Claude grades with rubric → score + feedback + coaching tips saved to DB.

**Pipeline:**
```
GHL Call Ends
  → InboundMessage/OutboundMessage webhook (or poll-calls.ts fallback)
  → Duration routing: <30s skip, 30-60s summary, 60s+ full grade
  → Deepgram transcription (if recording URL available)
  → GHL context fetch (contact name, tags, source, history)
  → Role-based rubric selection
  → Claude grades with system prompt + full context
  → Parse: overallScore, rubricScores[], summary, feedback, coachingTips[]
  → Save to calls table
  → Trigger TCP recalculation for associated property
```

**Files:** lib/ai/grading.ts (1,109 lines), lib/ai/transcribe.ts, lib/ghl/webhooks.ts, scripts/poll-calls.ts

---

### Module 2: Call Detail — 4-Tab Layout (BUILT — Session 14)

**What it does:** Single call detail page with 4 purpose-built tabs.

| Tab | Content | Data Source |
|-----|---------|-------------|
| **Rubric** | Visual score bars per criterion, overall score badge, sentiment indicator, seller motivation gauge | calls.rubricScores, calls.sentiment, calls.sellerMotivation |
| **Coaching** | Detailed AI feedback paragraph, numbered coaching tips, key moments with timestamps highlighted | calls.feedback, calls.coachingTips, calls.keyMoments |
| **Transcript** | Full transcript with speaker labels (Agent/Caller), search/filter, keyword highlight | calls.transcript |
| **Next Steps** | AI-recommended next action, quick action buttons (Send SMS, Add Note, Create Task, Schedule Follow-up) with confirm-before-execute | calls.nextBestAction, GHL actions API |

**Quick Actions (Next Steps tab):**
- Send SMS → GHL sendSMS (requires confirmation modal)
- Add Note → GHL addNote to contact
- Create Task → GHL createTask
- Schedule Follow-up → GHL calendar integration

**File:** app/[tenant]/calls/[callId]/page.tsx, components/calls/call-detail-client.tsx

---

### Module 3: AI Coaching Loop (BUILT — basic)

**What it does:** Chat interface where reps talk to an AI coach that knows their actual performance data.

**Context injected per message:**
- Last 5 graded calls (scores, feedback, coaching tips)
- Open task count
- Active property count
- User role and name
- Average score trend

**Planned enhancements (Phase 3):**
- Proactive coaching alerts ("Your objection handling dropped 15 points this week")
- Role-specific coaching paths
- Coaching session summaries saved to coach_logs table
- Manager visibility into team coaching sessions

**Files:** lib/ai/coach.ts, app/[tenant]/ai-coach/, components/ai-coach/ai-coach-client.tsx

---

### Module 4: TCP Lead Scoring (BUILT — v1)

**What it does:** Calculates True Conversion Probability (0.0–1.0) for every property using an 8-factor weighted ensemble.

| Factor | Weight | Source |
|--------|--------|--------|
| Call duration > 45s | 0.15 | calls.duration |
| Call sentiment (avg) | 0.20 | calls.sentiment |
| Appointment set | 0.25 | tasks/appointments |
| Appointment no-show | -0.15 | Phase 2 |
| Touch count (calls) | 0.10 | COUNT(calls) |
| Days since first contact | -0.05/week | calls.createdAt |
| Stage velocity | 0.10 | property status changes |
| Equity > 30% | 0.15 | property ARV vs asking |

**Buy Signal:** TCP > 0.5 AND no team activity in 3+ days = priority lead.

**Recalculation triggers:** call graded, stage change, task completed, appointment set/no-show.

**File:** lib/ai/scoring.ts (154 lines)

---

### Module 5: KPI Dashboard (PARTIAL — schema ready, wiring needed)

**What it does:** Role-based daily performance dashboard. The screen every team member sees first thing in the morning.

**Dashboard cards to wire:**
- Calls today / this week / this month
- Average call score (with trend arrow)
- Properties in pipeline (by status)
- Tasks open / completed today
- TCP distribution (how many leads above 0.5)
- Buy Signals active

**KPI snapshots:** Daily cron (scripts/kpi-snapshot.ts) saves metrics JSON to kpi_snapshots table. Powers 7/30/90-day trend charts.

**Role-based views:**
| Role | Sees |
|------|------|
| OWNER / ADMIN | All team metrics, cost per lead, ROI |
| TEAM_LEAD | Their team's calls, scores, tasks |
| LEAD_MANAGER | Own calls, lead pipeline, TCP scores |
| ACQUISITION_MANAGER | Own calls, property pipeline, financials |
| DISPOSITION_MANAGER | Buyer list, deal blasts, sold properties |

**Files:** app/[tenant]/dashboard/, app/[tenant]/kpis/, scripts/kpi-snapshot.ts

---

### Module 6: Gamification & XP System (SCHEMA READY — not built)

**What it does:** Points, levels, and badges that make daily sales activity addictive.

**XP Events:**
| Action | XP |
|--------|----|
| Call graded with score > 70 | +50 |
| Call graded with score > 90 | +100 |
| Task completed | +20 |
| Appointment set | +75 |
| Property moved to Under Contract | +200 |
| Property Sold | +500 |
| Daily login streak (7 days) | +50 bonus |

**Levels:** XP thresholds define levels (1–50). Level displayed on profile and leaderboard.

**Badges:**
- "First Blood" — first call graded
- "Hot Streak" — 5 calls above 80 in a row
- "Closer" — first property sold
- "Iron Rep" — 30-day login streak
- "TCP Hunter" — found 3 Buy Signals

**Leaderboard:** Weekly/monthly, filterable by role, team, or tenant-wide.

**DB tables:** user_xp (totalXp, weeklyXp, level), user_badges (badgeType, earnedAt), xp_events (eventType, xpAwarded, relatedId)

---

### Module 7: Training Hub (NOT BUILT)

**What it does:** Turns graded calls into training material. Best calls become examples. Worst calls become lessons.

**Features:**
- "Call of the Week" — highest scoring call auto-promoted
- "Review Queue" — calls below threshold flagged for manager review
- Clip library — managers can save call segments as training clips
- Role-specific training paths tied to rubric categories
- Progress tracking per rep

**Depends on:** Call grading with transcripts (Module 1), role system (Module 5)

---

### Module 8: Disposition Hub (NOT BUILT)

**What it does:** Buyer management and deal blasting for disposition managers.

**Features:**
- Buyer list management (name, criteria, markets, contact info)
- Deal blast: select property → select matching buyers → send SMS/email
- Blast templates with property data merge fields
- Response tracking (interested / pass / no response)
- High-stakes gate: SMS to 10+ contacts requires approval modal

**Depends on:** lib/gates/requireApproval.ts, GHL SMS integration, Stripe subscription

---

### Module 9: Workflow Engine (SCHEMA READY — not built)

**What it does:** Automated sequences triggered by events.

**Example workflows:**
- "New Lead Follow-up": property created → wait 1 hour → send SMS → wait 1 day → create task for rep
- "No-Show Recovery": appointment no-show → send SMS → create urgent task → flag for manager
- "Deal Blast Auto": property enters Disposition stage → auto-generate blast → queue for approval

**Schema:**
- workflow_definitions: name, trigger event, steps JSON array, isActive
- workflow_executions: current step, status, started/completed timestamps

**Step types:** wait, send_sms, send_email, create_task, update_status, notify_user, require_approval

---

## Database Schema — Current + Phase 2 Additions

### Current Tables (Phase 1)

```
tenants           — Multi-tenant container, GHL OAuth, pipeline config, onboarding state
users             — Team members, roles (6 types), manager hierarchy (reportsTo)
properties        — Inventory, financials (ARV/MAO/asking), TCP score, status, GHL sync
sellers           — Contacts/leads, GHL contact ID
property_sellers  — Junction table (many-to-many, isPrimary)
calls             — Graded calls, transcript, scores, AI feedback, sentiment fields
call_rubrics      — Grading templates per tenant/role
tasks             — GHL-synced tasks, priority, status
kpi_snapshots     — Daily metric snapshots (metrics JSON)
role_configs      — Per-role KPI config, permissions, task categories
audit_logs        — Full activity trail
```

### Phase 2 Schema Additions (MIGRATED)

```
-- New call fields (added to calls table):
sentiment         String?      -- positive/negative/neutral
objections        Json?        -- array of objection strings
talkRatio         Float?       -- agent talk time / total time
keyMoments        Json?        -- array of {timestamp, description, type}
callOutcome       String?      -- appointment_set, callback, not_interested, etc.
sellerMotivation  String?      -- high/medium/low
nextBestAction    String?      -- AI recommended next step

-- New property fields (added to properties table):
tcpScore          Float?       -- 0.0 to 1.0
tcpFactors        Json?        -- breakdown of each factor's contribution
tcpUpdatedAt      DateTime?    -- last recalculation timestamp

-- New tables:
user_xp           — totalXp Int, weeklyXp Int, level Int (per user)
user_badges       — badgeType String, earnedAt DateTime (per user)
xp_events         — eventType String, xpAwarded Int, relatedId String
lead_source_costs — source String, monthlyCost Float, month DateTime
coach_logs        — userId, message, role, actions Json
workflow_definitions — name, triggerEvent, steps Json, isActive Boolean
workflow_executions  — definitionId, currentStep Int, status, context Json
```

### Phase 3 Schema Additions (PLANNED)

```
-- Training hub:
training_clips    — callId, startTime, endTime, title, tags, createdBy
training_paths    — role, sequence of clip IDs, completion tracking

-- Disposition:
buyers            — name, phone, email, markets Json, criteria Json, tags
deal_blasts       — propertyId, buyerIds, templateId, status, sentAt
blast_responses   — blastId, buyerId, response (interested/pass/none), respondedAt
blast_templates   — name, smsBody, emailBody, mergeFields Json

-- Stripe billing:
subscriptions     — tenantId, stripeCustomerId, plan, status, currentPeriodEnd
usage_records     — tenantId, month, callsGraded, aiTokensUsed, seatsActive
```

---

## Packages — Current vs. Needed

### Currently Installed

| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.2.35 | Framework (locked after CVE fix) |
| react / react-dom | 18 | UI |
| typescript | 5 | Type safety |
| @prisma/client | 5.14.0 | ORM |
| next-auth | 4.24.7 | Authentication |
| @auth/prisma-adapter | 1.6.0 | NextAuth Prisma bridge |
| bcryptjs | 2.4.3 | Password hashing |
| @anthropic-ai/sdk | 0.24.0 | Claude AI |
| @deepgram/sdk | 5.0.0 | Call transcription |
| @supabase/supabase-js | 2.43.0 | Supabase client |
| @radix-ui/* | various | UI primitives (12 packages) |
| tailwindcss | 3.4.1 | Styling |
| tailwindcss-animate | 1.0.7 | Animations |
| lucide-react | 0.383.0 | Icons |
| recharts | 2.12.7 | Charts |
| zod | 3.23.8 | Schema validation |
| zustand | 4.5.2 | Client state |
| date-fns | 3.6.0 | Date utilities |
| axios | 1.7.0 | HTTP client |
| clsx | 2.1.1 | Class names |
| tailwind-merge | 2.3.0 | Tailwind merge |
| class-variance-authority | 0.7.0 | Component variants |
| resend | 3.2.0 | Email sending |
| tsx | 4.11.0 | TypeScript script runner |

### Packages to Add (by phase)

| Package | Phase | Purpose |
|---------|-------|---------|
| stripe | 2 | Payment processing, subscription management |
| @stripe/stripe-js | 2 | Client-side Stripe elements |
| @stripe/react-stripe-js | 2 | React Stripe components |
| cron-parser | 2 | Workflow engine scheduling |
| bull or bullmq | 3 | Job queue for workflow execution, blast sending |
| @tanstack/react-table | 3 | Advanced data tables (buyer list, blast history) |
| react-hot-toast | 2 | Better toast notifications (optional, Radix toast exists) |
| sharp | 3 | Image processing (property photos, optional) |

---

## Cost Model

### Current Monthly Costs (1 tenant, low volume)

| Service | Estimated Cost | Notes |
|---------|---------------|-------|
| Railway | $5–20 | Starter plan, auto-scales |
| Supabase | $0 (free tier) | Under 500MB, under 50k rows |
| Anthropic (Claude) | $5–15 | ~17 calls/month, Sonnet for grading |
| Deepgram | $0 (free tier) | 12,000 mins free, then $0.0043/min |
| Resend | $0 (free tier) | 100 emails/day free |
| GHL Marketplace | $0 | No platform fee for apps |
| **Total** | **~$10–35/month** | |

### Projected Costs at Scale (10 tenants, 500 calls/month)

| Service | Estimated Cost | Notes |
|---------|---------------|-------|
| Railway | $20–50 | Pro plan, more compute |
| Supabase | $25 | Pro plan (8GB, 100k rows) |
| Anthropic (Claude) | $50–150 | ~500 gradings/month, Sonnet |
| Deepgram | $15–30 | ~3,000 mins transcription |
| Resend | $0–20 | Depends on blast volume |
| Stripe | 2.9% + $0.30/txn | Pass-through on subscriptions |
| **Total** | **~$110–275/month** | |

### Projected Costs at Growth (50 tenants, 5,000 calls/month)

| Service | Estimated Cost | Notes |
|---------|---------------|-------|
| Railway | $50–150 | Scaled compute + workers |
| Supabase | $75–150 | Team plan |
| Anthropic (Claude) | $500–1,500 | Volume pricing applies |
| Deepgram | $100–200 | Growth tier |
| Resend | $20–80 | Scale tier |
| Stripe | 2.9% + $0.30/txn | |
| **Total** | **~$750–2,100/month** | |

### Revenue Model

| Plan | Price | Includes |
|------|-------|----------|
| Starter | $97/month | 1 seat, 100 graded calls, basic KPIs |
| Growth | $197/month | 5 seats, 500 graded calls, TCP scoring, coaching |
| Team | $397/month | 15 seats, unlimited calls, full gamification, workflows |
| Enterprise | Custom | Unlimited seats, custom rubrics, API access, dedicated support |

**Break-even:** ~3 tenants on Growth plan covers projected costs at 10-tenant scale.

---

## Build Priority Order — Phased

### Phase 2 — Revenue Loop (Current Phase)

The core loop: calls get graded → grades drive KPIs → KPIs drive accountability → accountability drives revenue.

| Step | Module | What | Depends On | Status |
|------|--------|------|------------|--------|
| 2A | Call Grading | Real transcripts via Deepgram webhook pipeline | First real-time call with recording URL | BUILT — awaiting live validation |
| 2B | Historical Import | Import all past GHL calls, grade them, calculate TCP | 2A grading pipeline | NEXT |
| 2C | Dashboard KPIs | Wire real data to dashboard cards and trend charts | 2B (needs data to display) | PENDING |
| 2D | Call Detail | 4-tab layout: Rubric, Coaching, Transcript, Next Steps | 2A (needs transcripts) | BUILT — needs production verification |
| 2E | Team Invites | Role-based views, manager hierarchy, invite flow | 2C (team needs dashboard to land on) | PENDING |
| 2F | Onboarding Polish | Under-60-second flow, first graded call as wow moment | 2A + 2C (needs working grade + dashboard) | PENDING |
| 2G | Stripe Paywall | Paywall after wow moment, subscription management | 2F (paywall goes after value shown) | PENDING |

### Phase 3 — Engagement & Retention

Make the product sticky. Daily active usage, not weekly check-ins.

| Step | Module | What | Depends On |
|------|--------|------|------------|
| 3A | Gamification | XP system, levels, badges, leaderboard | 2C dashboard + 2E team |
| 3B | Coaching Loop v2 | Proactive alerts, role-specific paths, session history | 2E team roles |
| 3C | Training Hub | Call of the week, clip library, review queue | 2B historical data + 2E team |
| 3D | Day Hub | Daily task planner with role-based default categories | 2E team + 2C KPIs |
| 3E | Advanced TCP | ML-enhanced scoring, A/B testing factor weights | 2B historical data (training set) |

### Phase 4 — Revenue Expansion

New revenue streams and enterprise features.

| Step | Module | What | Depends On |
|------|--------|------|------------|
| 4A | Disposition Hub | Buyer management, deal blasting with approval gates | 2G Stripe (paid feature) |
| 4B | Workflow Engine | Automated sequences triggered by events | 3D Day Hub + lib/gates |
| 4C | Lead Source ROI | Track cost per lead source, calculate ROI per channel | 2C KPIs + lead_source_costs table |
| 4D | Multi-Pipeline | Support multiple pipelines per tenant (acquisitions + dispositions) | 4A Disposition |
| 4E | API Access | Tenant-scoped API keys for custom integrations | 2G Stripe (enterprise tier) |
| 4F | White Label | Custom branding, custom domain per tenant | 4E (enterprise feature) |

---

## Environment Variables (23 total)

### Required for Production

| Variable | Purpose |
|----------|---------|
| NEXTAUTH_SECRET | Session encryption (32+ chars) |
| NEXTAUTH_URL | Public URL (Railway URL in prod) |
| DATABASE_URL | Supabase pooler connection (pgbouncer) |
| DIRECT_URL | Supabase direct connection (migrations only) |
| GHL_CLIENT_ID | GHL Marketplace App client ID |
| GHL_CLIENT_SECRET | GHL Marketplace App secret |
| GHL_REDIRECT_URI | OAuth callback URL |
| GHL_WEBHOOK_SECRET | Webhook signature verification |
| ANTHROPIC_API_KEY | Claude AI API key |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key (client-safe) |
| SUPABASE_SERVICE_ROLE_KEY | Supabase admin key (server-only, NEVER client-side) |

### Optional

| Variable | Purpose |
|----------|---------|
| DEEPGRAM_API_KEY | Call transcription (without it, grades on metadata only) |
| RESEND_API_KEY | Email sending (logs to console if missing) |
| EMAIL_FROM | Sender address for invite emails |
| NEXT_PUBLIC_GHL_CLIENT_ID | Client-side OAuth (same as GHL_CLIENT_ID) |
| DEV_BYPASS_AUTH | Development only — .env.local ONLY, never on Railway |

### Future (Phase 2G+)

| Variable | Purpose |
|----------|---------|
| STRIPE_SECRET_KEY | Stripe payments |
| STRIPE_PUBLISHABLE_KEY | Client-side Stripe |
| STRIPE_WEBHOOK_SECRET | Stripe webhook verification |

---

## API Routes (17 routes)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| * | /api/auth/[...nextauth] | Public | NextAuth handler |
| GET/POST | /api/auth/crm/callback | Public | GHL OAuth callback |
| GET/POST | /api/properties | Session | List/create properties |
| PATCH | /api/properties/[propertyId] | Session | Update property + TCP recalc |
| GET/POST | /api/tasks | Session | List/create tasks |
| POST | /api/tasks/[taskId]/complete | Session | Complete task, sync GHL |
| GET/POST | /api/call-rubrics | Session | List/create rubrics |
| PATCH/DELETE | /api/call-rubrics/[id] | Session | Update/delete rubric |
| PATCH | /api/tenants/config | Session | Update tenant settings |
| POST | /api/tenants/register | Public | New tenant registration |
| POST | /api/tenants/invite | Session | Send team invite |
| GET | /api/ghl/pipelines | Session | Live GHL pipelines for dropdown |
| POST | /api/ghl/actions | Session | Execute GHL actions |
| POST | /api/webhooks/ghl | Public | Receive GHL webhooks |
| POST | /api/ai/coach | Session | AI coach conversation |
| GET | /api/health | Public | Health check |
| GET | /api/cron/poll-calls | Public* | Polling fallback (*Railway internal) |

---

## Cron Jobs (Railway Functions)

| Job | Schedule | File | Purpose |
|-----|----------|------|---------|
| poll-calls | Every 5 minutes | scripts/poll-calls.ts | Detect new GHL calls, trigger grading |
| daily-audit | 2:00 AM UTC | scripts/audit.ts | TypeScript check, lint, AI code review |
| daily-kpi-snapshot | Midnight UTC | scripts/kpi-snapshot.ts | Snapshot metrics for trend charts |

---

## Decisions Log

Architectural decisions that affect how features are built. Check here before making any structural choice.

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | **GHL owns contacts, Gunner owns properties** | Never duplicate contact data. Properties are our business object with fields GHL doesn't have (ARV, MAO, TCP). Contact data fetched live from GHL. | 2026-03-19 |
| 2 | **Fire-and-forget grading** | Webhook responds 200 immediately, grading runs async. Prevents GHL webhook timeouts and retries. | 2026-03-19 |
| 3 | **No text inputs for GHL mappings** | Rule 2. GHL names change, IDs don't. Live dropdowns only. Stored value is always the GHL ID. | 2026-03-19 |
| 4 | **Path-based tenants, not subdomains** | /tenant-slug/ routing is simpler to deploy on Railway. No wildcard DNS needed. Middleware validates slug matches session. | 2026-03-19 |
| 5 | **Single settings hub, 7 sections** | Rule 3. No gear icons on individual pages. All config in one place. Prevents orphan UI. | 2026-03-19 |
| 6 | **TCP as weighted ensemble, not ML** | Fast, explainable, works without training data. 8 factors with fixed weights. Can upgrade to ML in Phase 3E when we have enough historical data. | 2026-03-20 |
| 7 | **6 fixed roles, not custom RBAC** | OWNER, ADMIN, TEAM_LEAD, LEAD_MANAGER, ACQUISITION_MANAGER, DISPOSITION_MANAGER. Simpler than full RBAC. Covers wholesale team structure. | 2026-03-19 |
| 8 | **Sonnet for grading, Opus for coaching** | Grading is structured extraction (Sonnet handles well, cheaper). Coaching requires nuanced sales reasoning (Opus quality justified). | 2026-03-20 |
| 9 | **Polling fallback over webhook-only** | GHL Marketplace Apps don't reliably support CallCompleted webhooks. poll-calls.ts every 5 minutes catches everything. Webhooks supplement, don't replace. | 2026-03-20 |
| 10 | **Paywall AFTER first graded call** | Rule 6. User must see the value before paying. Onboarding flow: connect GHL → see graded call → paywall. | 2026-03-19 |
| 11 | **Deepgram for transcription, not GHL** | GHL doesn't expose call transcripts or recording URLs via API. Recording URLs only arrive via real-time webhooks. Deepgram nova-2 handles the audio. | 2026-03-20 |
| 12 | **Duration routing for calls** | <30s = dial attempt (skip entirely), 30–60s = summary grade only, 60s+ = full transcription + grading. Saves AI costs, reduces noise. | 2026-03-20 |
| 13 | **Agent builds the plan, not the user** | The AI engineer assesses dependencies, prioritizes by impact, and presents the build order. User approves or adjusts. Never ask "what do you want to do first?" | 2026-03-20 |
| 14 | **No phase is complete until verified on production** | Manual replays, local-only tests, and "should work" don't count. Must be observed working on live Railway URL with real data. | 2026-03-20 |

---

## File Structure — Key Paths

```
/
├── CLAUDE.md              — Non-negotiable rules (read first)
├── AGENTS.md              — Agent behavior standards
├── PROGRESS.md            — Session log + next session
├── TECH_STACK.md          — This file (complete vision)
├── prisma/
│   └── schema.prisma      — All DB models
├── lib/
│   ├── ai/
│   │   ├── grading.ts     — Call grading engine (1,109 lines)
│   │   ├── scoring.ts     — TCP lead scoring (154 lines)
│   │   ├── transcribe.ts  — Deepgram transcription
│   │   └── coach.ts       — AI coach conversation
│   ├── auth/
│   │   ├── config.ts      — NextAuth configuration
│   │   └── session.ts     — getSession() helper
│   ├── db/
│   │   ├── client.ts      — Prisma client + RLS helper
│   │   └── settings.ts    — updateTenantSettings()
│   └── ghl/
│       ├── client.ts      — GHL API client (all endpoints)
│       └── webhooks.ts    — Webhook event handlers
├── app/
│   ├── [tenant]/
│   │   ├── dashboard/     — KPI dashboard
│   │   ├── calls/         — Call list + detail (4-tab)
│   │   ├── inventory/     — Property CRUD
│   │   ├── tasks/         — Task management
│   │   ├── inbox/         — GHL conversations
│   │   ├── appointments/  — Calendar view
│   │   ├── ai-coach/      — Coaching chat
│   │   ├── kpis/          — Metrics + trends
│   │   └── settings/      — 7-section config hub
│   └── api/               — All API routes
├── components/
│   ├── calls/             — Call UI components
│   ├── inventory/         — Property UI components
│   ├── ai-coach/          — Coach chat UI
│   └── ui/                — Radix-based primitives
├── scripts/
│   ├── poll-calls.ts      — Cron: detect + grade calls
│   ├── audit.ts           — Cron: daily code audit
│   ├── kpi-snapshot.ts    — Cron: daily metric snapshot
│   └── seed.ts            — Dev database seeding
└── config/
    └── env.ts             — Environment variable validation
```
