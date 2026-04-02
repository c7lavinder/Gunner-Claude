# PROGRESS.md — Gunner AI Build Tracker

> This is the first file Claude Code reads every session.
> The "Next Session" section tells Claude Code exactly where to start.
> Updated at the end of EVERY session — no exceptions.

---

## Current Status

**Phase**: PHASE 4 NEARLY COMPLETE — 4A, 4B, 4C, 4F done
**App state**: Live on Railway + running locally
**Auth**: Real login on Railway, DEV_BYPASS_AUTH in .env.local only
**GitHub**: https://github.com/c7lavinder/Gunner-Claude ✅
**Railway**: https://gunner-claude-production.up.railway.app ✅
**Health check**: PASSING ✅
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: hmD7eWGQJE7EVFpJxj4q)
**Calls graded**: 17 of 17 COMPLETED
**Properties**: 2 created via live webhook (Emi Yoshimura, Gregory Palm)
**Cron polling**: Railway Function running every 5 minutes

---

## Phase 1 Exit Criteria — ALL must be true before Phase 2

- [x] Railway deployed — real public URL confirmed
- [x] GET /api/health returns { status: 'ok' } on Railway URL
- [x] GHL Marketplace App created with correct scopes and redirect URI
- [x] One real tenant onboarded through full onboarding flow
- [x] GHL connected via OAuth (webhooks active — OpportunityCreate/Update handled)
- [x] Settings pipeline selector uses live GHL dropdown (Rule 2 compliant)
- [x] Real call in GHL → graded record in /calls (via polling — 17 calls found, grading confirmed)
- [x] Real stage change → property appears in /inventory (verified end-to-end: Gregory Palm auto-created via webhook)
- [x] DEV_BYPASS_AUTH removed — real login working on Railway URL
- [x] Two tenants verified cannot see each other's data

**10 of 10 checked. PHASE 1 COMPLETE.**

---

## Non-Negotiable Rules (from CLAUDE.md)

1. Data Contract — every settings field declares WRITES TO + READ BY before UI is built
2. No text inputs for GHL mappings — live dropdowns only
3. Single settings hub — 7 sections, no orphan UI
4. Worker agent architecture — stop_reason: end_turn, code-level gates, structured JSON responses
5. True Conversion Probability — lead scoring via ensemble model in lib/ai/scoring.ts
6. Onboarding is 70% — first 60 seconds must show graded call, paywall after wow moment
7. Autonomous handoff — PROGRESS.md + AGENTS.md updated every session

---

## Session Log

### Session 12 — Multi-tenancy audit + call grading pipeline (2026-03-20)
**What was done:**
- Fixed inbox crash: GHL returns dateUpdated as Unix ms, not ISO string
- Fixed inbox data: mapped contactName, phone, lastMessageBody from GHL conversation data
- Fixed poll-calls.ts: rewrote to use /conversations/search (TYPE_CALL) — /calls endpoint doesn't exist
- Fixed grading: removed hard FAIL when no transcript — Claude now grades on metadata
- Verified end-to-end: 17 real calls found, grading confirmed working
- Added calendars/events.readonly scope to OAuth URLs for future reconnects
- **MULTI-TENANCY AUDIT — 3 critical vulnerabilities fixed:**
  - call-rubrics/[id] DELETE — missing tenantId in where clause
  - call-rubrics/[id] PATCH — missing tenantId in where clause
  - tasks/[taskId]/complete — missing tenantId in where clause
  - properties/[propertyId] PATCH — missing tenantId in where clause
- Hardcoded values scan: only DEV_BYPASS_AUTH blocks reference hardcoded slugs (apex-dev, owner@apex.dev) — behind env var, not set on Railway
- Architecture enforcement: all 14 API routes now verified SAFE, all 14 server pages verified SAFE, middleware validated

### Session 29 — Fix no-answer calls graded as F + 45s threshold (2026-03-20)
**What was done:**
- **grading.ts:** Zero duration → FAILED + callResult: no_answer (was COMPLETED score 0). Under 45s → FAILED + no_answer (was 30s). Summary-only threshold raised 60s → 90s. No score set on no-answer calls.
- **webhooks.ts:** Skip threshold raised 30s → 45s. Fixed duplicate gradingStatus bug. Updated console log to show 90s FULL threshold.
- **poll-calls.ts:** Added duration extraction from conversations. Skips calls < 45s before creating DB records. Saves durationSeconds on creation.
- **calls-client.tsx:** "Short calls" tab renamed to "No answer". Filter catches: < 45s duration, callResult 'no_answer', FAILED + 'No answer' in summary. callResult added to Call interface.
- **calls/page.tsx:** Now passes callResult field to client.

**Manual DB cleanup required — run once in Supabase SQL Editor:**
```sql
UPDATE calls
SET
  grading_status = 'FAILED',
  score = NULL,
  ai_summary = 'No answer — retroactively corrected.',
  call_result = 'no_answer'
WHERE
  grading_status = 'COMPLETED'
  AND (
    duration_seconds = 0
    OR duration_seconds < 45
    OR (score = 0 AND ai_summary ILIKE '%no answer%')
    OR (score = 0 AND ai_summary ILIKE '%dial attempt%')
    OR (score = 0 AND ai_summary ILIKE '%under 30%')
  );
```

### Session 28 — PropertyMilestone system end to end (2026-03-20)
**What was done:**
- **Schema:** PropertyMilestone model with 5 types (LEAD, APPOINTMENT_SET, OFFER_MADE, UNDER_CONTRACT, CLOSED), relations on Property/User/Tenant, migration created + applied
- **Auto milestones:**
  - LEAD auto-logged when property created via webhook (lib/properties.ts)
  - LEAD auto-logged when property created manually (POST /api/properties)
  - CLOSED auto-logged (once) when property status → SOLD (PATCH /api/properties/[id])
- **Manual entry API:** POST /api/milestones for APPOINTMENT_SET, OFFER_MADE, UNDER_CONTRACT with validation + audit logging. GET /api/milestones?propertyId=xxx returns milestone history
- **Dashboard widget:** "Log today's activity" with 3 buttons (Appointment Set, Offer Made, Under Contract), inline form with property dropdown + notes, toast feedback
- **Property detail:** Deal progress bar showing 5 steps (Lead → Appt Set → Offer Made → Contract → Closed) with orange fill for hit milestones, connecting lines, count badges for multi-entry milestones
- **KPI page:** Appointments, offers, contracts, closed all now query from PropertyMilestone table instead of tasks/property status approximations. Scoped to properties within user's hierarchy.

### Session 27 — Fix Inbox, Appointments, Tasks — 10 targeted fixes (2026-03-20)
**What was done:**
- **Inbox (3 fixes):**
  - ConversationRow now opens GHL in new tab via `<a target="_blank">`
  - Team member name resolved from GHL users (shows "→ Daniel")
  - Property address cross-referenced from DB (shows "123 Main St, Nashville TN")
- **Appointments (3 fixes):**
  - getAppointments now passes Unix ms timestamps (was ISO strings → 0 results)
  - Strategy 2 per-calendar queries include groupId
  - Assigned user name resolved and shown on appointment cards
  - Error logging includes GHLError statusCode for diagnostics
- **Tasks (4 fixes):**
  - searchTasks POST body now includes locationId (was missing → 422 errors)
  - GHLTaskItem type used throughout (was GHLTask with wrong fields)
  - Added ghlContactId field to Call schema + migration for AM/PM tracking
  - AM/PM query uses PostgreSQL AT TIME ZONE 'America/Chicago' via raw SQL
  - poll-calls.ts and grading.ts now save ghlContactId on call records
  - Error banner improved with actionable troubleshooting steps

### Session 26 — Fix 3 critical bugs: calls tabs, page flash, silent errors (2026-03-20)
**What was done:**
- **Bug 1 — Calls page broken tabs:** Removed Skipped (hacky heuristic) and Archived (empty placeholder) tabs. Replaced with "Short calls" tab showing calls <30s with info banner and reprocess buttons
- **Bug 2 — window.location.reload flash:** Replaced all window.location.reload() with startTransition(() => router.refresh()) in calls-client, call-detail-client, and day-hub-client. Added optimistic UI to day-hub completeTask (immediately hides task, rolls back on failure)
- **Bug 3 — Silent errors:** Added useToast() to all three files. Every async action now shows success/error toast with human-readable messages (e.g. "Call queued for re-grading", "Task completed! +XP earned", "Failed to reprocess")
- **Transcript empty state:** Two distinct states: recording found but no transcript → "Use Reprocess to trigger transcription" vs no recording URL → explains metadata-only grading
- **Toast system fix:** Refactored Toaster into ToastProvider that wraps children (was rendering Provider as sibling, making useToast() return no-op)

### Session 25 — Phase 4C + 4F: Lead Source ROI + password reset (2026-03-20)
**What was done:**
- **4C — Lead Source ROI** (/{tenant}/roi):
  - Monthly spend tracking per source (7 default sources)
  - Auto-calculates cost per lead from property.leadSource
  - Summary cards, log spend form, source breakdown with ROI
  - GET/POST /api/lead-sources API
- **4F — Password reset**:
  - /reset-password page with email input
  - POST /api/auth/reset-password: generates temp password, sends via Resend
  - Prevents email enumeration, audit-logged
  - "Forgot password?" link on login page
- Added Lead ROI to sidebar navigation

### Session 24 — Phase 4B: Workflow Engine (2026-03-20)
**What was done:**
- Built lib/workflows/engine.ts (240 lines):
  - 4 trigger types: property_created, stage_changed, call_graded, task_completed
  - 5 step types: send_sms, create_task, update_status, notify, wait
  - Delayed execution with nextRunAt for cron processing
  - Simple condition evaluator (score > 70, status == UNDER_CONTRACT)
  - processWaitingWorkflows() for cron to advance delayed steps
- Wired triggers into: properties.ts, grading.ts, webhooks.ts
- Built GET/POST /api/workflows (CRUD + toggle)
- Added Workflows tab to Settings with visual builder
- Schema updates: triggerEvent on definitions, propertyId/context/nextRunAt on executions

### Session 23 — Phase 4A: Disposition Hub — buyers + deal blasting (2026-03-20)
**What was done:**
- 3 new DB tables: buyers, deal_blasts, deal_blast_recipients (migration created + applied)
- Built lib/gates/requireApproval.ts: code-level interceptors for high-stakes actions (Rule 4)
  - SMS/email blasts to 10+ contacts require approval before sending
  - All gate events audit-logged
- Built GET/POST /api/buyers (buyer CRUD) and POST /api/blasts (blast creation + approval)
- Built Disposition Hub page (/{tenant}/buyers):
  - Buyer list with contact info and blast count
  - Inline add buyer form
  - Deal blast composer: property selector, SMS/email toggle, message composer, multi-select buyers
  - Approval gate warning for 10+ recipients
  - Recent blasts history with status badges
- Added Disposition to sidebar navigation
- Bug #5 resolved: lib/gates/requireApproval.ts now exists

### Session 22 — Phase 3E: Advanced TCP + score distribution (2026-03-20)
**What was done:**
- Score distribution chart on KPI page: 5-bucket bar chart (Recharts), color-coded red→green
- TCP lead ranking on KPI page: top 10 properties by conversion probability with progress bars
- Batch TCP recalculation: ran against both tenants, 10 properties updated
- Both new sections linked to property detail pages

### Session 21 — Phase 3C + 3D: Training Hub + Day Hub (2026-03-20)
**What was done:**
- **3C Training Hub** (/{tenant}/training):
  - Call of the Week: golden gradient card, auto-promotes highest score this week
  - Top Calls Library: best 10 calls (70+) for studying
  - Review Queue: calls under 50 flagged for manager review (role-gated)
  - All rows link to full call detail with 4-tab layout
- **3D Day Hub** (/{tenant}/day-hub):
  - Morning planner with greeting, XP level, daily completion stats
  - Overdue tasks (red alert section)
  - Today's tasks grouped by role-based categories from roleConfig
  - One-click task completion
  - Tomorrow preview (dimmed, read-only)
  - Empty state with quick links to calls/inventory
- Added Day Hub and Training to sidebar navigation

### Session 20 — Phase 3B: Coaching v2 — proactive insights, session history (2026-03-20)
**What was done:**
- Built generateInsights(): week-over-week score trends, volume alerts, XP milestones, high score celebrations
- Proactive insight cards on coach page load (warning/celebration/tip, clickable for deeper analysis)
- Session history: all coach conversations saved to coach_logs table
- Richer coach context: XP level, weekly XP, week avg score
- Switched coach model from Opus to Sonnet for faster responses

### Session 19 — Phase 3A: Gamification — XP, badges, leaderboard (2026-03-20)
**What was done:**
- Built lib/gamification/xp.ts (310 lines):
  - XP award system with 7 event types and point values
  - 30-level progression system (100 XP → 130,000 XP)
  - 10 badge definitions with auto-check logic
  - Leaderboard query, weekly XP tracking, reset function
- Wired XP into existing pipelines:
  - grading.ts: awardCallXP() after every graded call
  - webhooks.ts: awardTaskXP() on GHL task completion
  - properties/[propertyId]: awardPropertyXP() on Under Contract / Sold
- Dashboard additions:
  - Leaderboard widget (rank, level, XP, weekly gain)
  - Earned badges grid
  - Conditionally hidden when no XP data exists
- TypeScript + Next.js build pass clean

### Session 18 — Pre-Phase 3 audit + cleanup (2026-03-20)
**What was done:**
- Created missing Prisma migration file for Stripe fields (20260320120000_add_stripe_subscription_fields)
  - Used IF NOT EXISTS for safety since db push already applied changes
  - Marked as applied via prisma migrate resolve
  - Verified prisma migrate deploy passes clean (what Railway runs on build)
- Updated AGENTS.md toolset: added Stripe and historical import entries
- Pre-Phase 3 audit identified items needing production verification

**Production verification checklist (must be done before Phase 3):**
- [ ] Dashboard loads on Railway URL with real data (score trend chart, priority leads, KPI cards)
- [ ] Call detail 4-tab layout renders with real graded calls
- [ ] Pricing page loads at /pricing
- [ ] Settings → Team tab shows GHL user mapping dropdown
- [ ] Set Stripe env vars on Railway (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, price IDs)
- [ ] Register Stripe webhook endpoint on Stripe dashboard

### Session 17 — Phase 2F/2G: Stripe paywall + pricing page (2026-03-20)
**What was done:**
- Installed stripe package, added 5 subscription fields to Tenant schema
  - stripeCustomerId, stripePriceId, subscriptionStatus, stripeSubscriptionId, stripeCurrentPeriodEnd
- Built lib/stripe/index.ts: Stripe client, 3-tier plan definitions (Starter $97, Growth $197, Team $397), isSubscriptionActive() helper
- Built POST /api/stripe/checkout: creates Stripe Checkout session with customer creation
- Built POST /api/webhooks/stripe: handles checkout.session.completed, subscription.updated/deleted, invoice.payment_failed
- Built /pricing page: 3 plan cards with Stripe Checkout redirect, auto-redirect if already subscribed
- Updated onboarding Done step: routes to /pricing instead of dashboard (Rule 6 — paywall after value shown)
- Added /pricing and /api/stripe to middleware public paths
- Next.js build passes cleanly

**To activate Stripe:**
1. Create Stripe account at stripe.com
2. Create 3 products with monthly prices ($97, $197, $397)
3. Set env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLIC_KEY, STRIPE_WEBHOOK_SECRET
4. Set price IDs: STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_TEAM
5. Register webhook endpoint: https://your-railway-url/api/webhooks/stripe

### Session 16 — Phase 2E: team invites + role-based views (2026-03-20)
**What was done:**
- Fixed bug #8: invite email now shows actual company name (was hardcoded empty string)
  - Fetches tenant.name from DB before sending email
- Built GHL user mapping for team members:
  - Added GET /api/ghl/users endpoint (fetches location users from GHL)
  - Added PATCH /api/users/[userId] endpoint (updates ghlUserId, reportsTo)
  - Added GHL user dropdown per team member in Settings → Team tab
  - Updates save instantly on selection
- Added GHL userId/assignedTo fields to GHLConversation interface
- Updated poll-calls.ts to match calls to correct user:
  - Pre-fetches all tenant users with GHL mappings
  - Matches conversation userId/assignedTo to user.ghlUserId
  - Falls back to first user if no match
- Added getLocationUsers() method to GHL client
- Next.js build passes cleanly

**What needs live validation:**
- Send a real invite on Railway and verify email shows company name
- Map GHL users in Settings and verify new calls are assigned correctly

### Session 15 — Phase 2B + 2C: historical import, dashboard KPIs (2026-03-20)
**What was done:**
- Wrote complete TECH_STACK.md (615 lines): 5 core systems, 9 feature modules, full DB schema, cost model, build priority, 14 decisions
- **2B — Historical import:**
  - Built scripts/import-historical-calls.ts with --dry-run, --tenant=slug, rate limiting, dedup
  - Added startAfterId pagination to GHL client getConversations()
  - Dry-run: 51 unique call conversations in GHL, 76 already in DB, 0 new to import
  - Finding: GHL ignores startAfterId at API v2021-07-28 — script detects stall and stops
- **2C — Dashboard KPIs wired to real data:**
  - Call volume context: today / this week / this month counts on KPI card
  - Score trend chart: 7-day bar chart using Recharts, color-coded by score thresholds
  - Priority leads widget: top 5 properties by TCP score with Buy Signal badges
  - Removed per-user filtering on KPI counts (now tenant-wide for team metrics)
  - All data from real DB queries — 76 graded calls, 2 properties with TCP
- Next.js build passes cleanly

**Known limitation:**
- GHL only exposes ~100 most recent conversations. Older calls not accessible via this API.

### Session 14 — Phase 2 schema, TCP scoring, call detail 4-tab (2026-03-20)
**What was done:**
- Full TECH_STACK.md vision analyzed — built vs missing assessment
- Phase 2 schema expansion: 7 new call fields (sentiment, objections, talkRatio, keyMoments, callOutcome, sellerMotivation, nextBestAction), 3 new property fields (tcpScore, tcpFactors, tcpUpdatedAt), 7 new tables (user_xp, user_badges, xp_events, lead_source_costs, coach_logs, workflow_definitions, workflow_executions)
- TCP Scoring v1 built (lib/ai/scoring.ts) — rule-based ensemble with 8 weighted factors, tested on live properties (0.349 score), auto-recalculates on call grading
- Call detail page rebuilt with 4-tab layout:
  - Tab 1: Rubric — visual score bars, sentiment/motivation indicators
  - Tab 2: Coaching — detailed feedback, numbered tips, key moments
  - Tab 3: Transcript — searchable with speaker labels and highlight
  - Tab 4: Next Steps — AI recommended action, quick action buttons with confirm-before-execute
- Prioritized Phase 2 build plan: 2A→2B→2C→2D→2E→2F→2G
- Added "agent builds the plan" rule to AGENTS.md
- Session closeout: PROGRESS.md updated, Next Session set for 2B + 2D

### Session 13 — Level 2 grading pipeline + Deepgram (2026-03-20)
**What was done:**
- Enriched call grading with GHL context: contact name/tags/source, conversation history, call duration/status
- All 17 calls regraded — scores now range 8-72 (was all 0)
- Investigated GHL recording URLs — NOT in conversations/messages API (236 calls, 0 recordings)
- Recording URLs only come through real-time InboundMessage/OutboundMessage webhooks
- Built InboundMessage/OutboundMessage handler in webhooks.ts — extracts recording URL from attachments[], recordingUrl, recording_url, recordingURL, meta.call.recordingUrl
- Duration routing: <30s = dial attempt (skip), 30-60s = summary only, 60s+ = full transcription + grading
- Built lib/ai/transcribe.ts — Deepgram REST API (nova-2) for call transcription
- Grading pipeline: recording URL → Deepgram transcribe → transcript saved to DB → Claude grades with full transcript
- Installed @deepgram/sdk, added DEEPGRAM_API_KEY to Railway
- Added calendars/events.readonly and conversations/message scopes
- Fixed OAuth reconnect flow (returns to Settings instead of onboarding)
- Fixed appointments endpoint (needs groupId)
- Fixed 3 cross-tenant vulnerabilities in API routes
- Added production verification rule to CLAUDE.md and AGENTS.md
- Added "agent builds the plan" rule to AGENTS.md
- Railway Function cron for call polling every 5 minutes (fallback)

**What needs live validation:**
- First call with recording URL via webhook → transcription → graded with real transcript
- This can only be tested with a new real-time call (historical calls don't have recording URLs)

### Session 12 — Phase 1 completion (2026-03-20)
**What was done:**
- Fixed inbox: GHL dateUpdated is Unix ms not ISO string, mapped contactName/phone/lastMessageBody
- Fixed poll-calls: rewrote to use /conversations/search TYPE_CALL (no /calls endpoint exists)
- Fixed grading: removed hard FAIL when no transcript, Claude grades on metadata
- All 17 calls graded to COMPLETED
- Fixed 3 cross-tenant vulnerabilities (call-rubrics, tasks, properties missing tenantId in UPDATE)
- Added calendars/events.readonly scope, fixed appointments endpoint (needs groupId)
- OAuth reconnect now returns to Settings instead of restarting onboarding
- Added leadSource to properties from GHL opportunity source
- Property dedup changed to normalized street address + state (skips city/zip mismatch)
- Fixed webhook handler: GHL sends OpportunityCreate/Update not OpportunityStageChanged
- Fixed getContact: GHL returns { contact: {...} } wrapper, was reading undefined fields
- Gregory Palm property created automatically via live webhook — end-to-end verified on Railway
- Railway Function cron created for call polling every 5 minutes
- Added production verification rule to CLAUDE.md and AGENTS.md
- Multi-tenancy audit: 14/14 API routes safe, 14/14 server pages safe
- PHASE 1 COMPLETE — all 10 exit criteria verified on live production

### Session 11 — Full deployment night (2026-03-19)
**What was done:**
- Deployed to Railway — fixed Next.js CVE (14.2.3→14.2.35), ESLint config, Suspense boundaries, health check public path
- Created GHL Marketplace App — added credentials to Railway env vars
- Renamed OAuth callback /api/auth/ghl → /api/auth/crm (GHL blocks "ghl" in URIs)
- Fixed OAuth scopes — removed invalid calls.readonly, tasks.readonly, tasks.write
- Fixed middleware to check onboardingCompleted before redirecting to dashboard
- Fixed OAuth callback to use NEXTAUTH_URL instead of request.url (was resolving to localhost in Railway)
- Made webhook registration non-blocking — GHL Marketplace API returns 404 on webhook endpoint, polling fallback handles call grading
- Added /api/tenants/register to public paths (was blocked by auth middleware)
- Built Step 3: GHLDropdown component, updateTenantSettings(), Pipeline tab with live dropdowns, data contract comments, poll-calls.ts polling fallback
- Fixed GHL API endpoints: /conversations → /conversations/search, /appointments → /calendars/events
- First real tenant "New Again Houses" onboarded and GHL connected on production
- Pipeline trigger configured via live GHL dropdown
- Phase 1 exit criteria: 7 of 10 checked

**Fixes deployed tonight (11 commits):**
1. Next.js 14.2.35 + TypeScript errors
2. ESLint config for Railway build
3. Suspense boundaries for login + onboarding
4. /api/health public path
5. /api/tenants/register public path
6. OAuth callback rename /ghl → /crm
7. Invalid GHL OAuth scopes removed
8. Middleware onboardingCompleted check
9. OAuth callback uses NEXTAUTH_URL for redirects
10. Webhook registration non-blocking
11. GHL API endpoint fixes (conversations, appointments)

### Session 10 — Step 3 complete (3a + 3b + 3c)
- Verified OAuth callback paths (3a)
- Built GHLDropdown, updateTenantSettings(), Pipeline tab (3b)
- Built poll-calls.ts polling fallback (3c)

### Session 9 — Railway + GHL Marketplace App
- Railway deployed, health check passing
- GHL Marketplace App created, credentials added to Railway
- OAuth callback renamed from /ghl to /crm

### Session 8 — Phase 1 hardening
- Integrated non-negotiable rules, DEV_BYPASS_AUTH implemented

### Session 7 — Migration + property CRUD + rubric editor
### Sessions 1–6 — Full MVP built

---

## Known Bugs

| # | Description | File | Priority | Status |
|---|---|---|---|---|
| 1 | ~~Pipeline selector not using live GHL dropdown~~ | settings-client.tsx | ~~CRITICAL~~ | ✅ FIXED — Step 3b |
| 2 | ~~Settings fields missing data contract comments~~ | settings-client.tsx | ~~CRITICAL~~ | ✅ FIXED — Step 3b |
| 3 | ~~CallCompleted webhook unavailable — polling fallback needed~~ | scripts/poll-calls.ts | ~~HIGH~~ | ✅ FIXED — Step 3c |
| 4 | ~~lib/ai/scoring.ts does not exist — TCP model not built~~ | lib/ai/ | ~~HIGH~~ | ✅ BUILT — Session 14 |
| 5 | ~~lib/gates/requireApproval.ts does not exist — high-stakes gates not built~~ | lib/ | ~~HIGH~~ | ✅ BUILT — Session 23 |
| 6 | ~~updateTenantSettings() server action does not exist~~ | lib/db/settings.ts | ~~HIGH~~ | ✅ FIXED — Step 3b |
| 7 | withTenantContext() not called in API routes — RLS inactive per-request | lib/db/client.ts | MEDIUM | Before production |
| 8 | ~~Invite email sends empty companyName~~ | app/api/tenants/invite/route.ts | ~~LOW~~ | ✅ FIXED — Session 16 |
| 9 | ~~OAuth callback references old /ghl/callback path~~ | all files | ~~HIGH~~ | ✅ FIXED — Step 3a |
| 10 | GHL webhook registration returns 404 — Marketplace Apps may not support /locations/{id}/webhooks endpoint | lib/ghl/client.ts | HIGH | Investigate correct GHL v2 webhook API or rely on polling |
| 11 | Appointments page returns 401 — calendars/events scope may not be covered by calendars.readonly | lib/ghl/client.ts | HIGH | Add correct scope to GHL Marketplace App |
| 12 | GHL API version header may be outdated (2021-07-28) — some endpoints return 404 | lib/ghl/client.ts | MEDIUM | Test with newer version string |
| 13 | ~~call-rubrics/[id] DELETE/PATCH missing tenantId in where clause~~ | call-rubrics/[id]/route.ts | ~~CRITICAL~~ | ✅ FIXED — audit |
| 14 | ~~tasks/[taskId]/complete UPDATE missing tenantId in where clause~~ | tasks/[taskId]/complete/route.ts | ~~CRITICAL~~ | ✅ FIXED — audit |
| 15 | ~~properties/[propertyId] PATCH missing tenantId in where clause~~ | properties/[propertyId]/route.ts | ~~CRITICAL~~ | ✅ FIXED — audit |
| 16 | DEV_BYPASS_AUTH code references hardcoded apex-dev slug and owner@apex.dev email | middleware.ts, session.ts, page.tsx | MEDIUM | Clean up before adding tenant #2 locally |

---

## Phase 1 — Sequenced Task List

### Step 1 — Deploy to Railway ✅ DONE
### Step 2 — GHL Marketplace App ✅ DONE
### Step 3 — Fix Settings + Build Polling Fallback ✅ DONE
### Step 4 — First Real Tenant Onboarding ✅ DONE
Tenant: New Again Houses (corey@newagainhouses.com)
GHL location: hmD7eWGQJE7EVFpJxj4q
Pipeline: tOqQbembKlIoPiXbepP3
Trigger stage: f919c1a7-17da-456f-b8f9-10c1aca62691

### Step 5 — First Call Graded ← NEXT SESSION
- Make real call in GHL
- Wait 60 seconds for poll-calls.ts to detect it
- Confirm graded record in /calls with score + rubric + AI feedback
- If polling doesn't pick up the call, debug poll-calls.ts on Railway logs
- Screenshot as proof

### Step 6 — Verify tenant isolation
- Create second test tenant
- Confirm tenant 1 cannot see tenant 2 data

---

### Session 30-31 — Bug fixes + AI Intelligence Layer + Role Assistant (2026-04-01 to 2026-04-02)
**What was done:**

**8 Bug Fixes:**
- Bug 1: Calendar parallel fetch + retry
- Bug 2: Call duration extraction hardened + recording safety rule
- Bug 3: Buyer market matching normalization + daily sync cron
- Bug 4: PropertyTeamMember model (multi-user per property)
- Bug 5: SMS sender dropdown all users + GHL phone numbers
- Bug 6: Data issues flag icon + address edit + zip auto-market
- Bug 7 (8 sub-issues): coaching fonts, transcript line-by-line, next steps dedup + per-action edit forms + AI change box, property tab redesign, follow-up label dedup
- Bug 8: Appointments on property overview

**Call Ingestion Rewrite:**
- Verified GHL API types against official docs (messageType: CALL, messageTypeId: 1)
- Poll-calls rewritten: export endpoint + per-user conversation search
- Cursor-based tracking (never miss, never reprocess)
- 3-layer reliability: webhook + export + per-user search

**AI Intelligence Layer:**
- 5 new DB models: KnowledgeDocument, UserProfile, AssistantMessage, ActionLog, AiLog
- NAH Wholesale Playbook (42 files) loaded as knowledge base
- 3 user profiles from playbook (Chris, Daniel, Kyle)
- Grading rebuilt with 7-layer playbook knowledge
- Context builder centralizing all knowledge for AI calls
- AI Log page for admin debugging
- Knowledge upload UI in Settings

**Role Assistant:**
- Replaces AI Coach — dynamic name from user role
- Daily conversation persistence
- Page context awareness
- 17 action tools via Claude tool use
- All GHL actions wired (SMS, tasks, notes, stages, contacts, email)
- All Gunner actions wired (property updates, milestones, team members)
- Action cards inline with Approve/Reject/Edit

## Next Session — Start Exactly Here

**Task:** Test and fix deployed AI intelligence layer + Role Assistant

**First message to Claude Code:**

Read CLAUDE.md, PROGRESS.md, and memory/project_current_state.md first.

Major deployment just went live. Need to:
1. Run playbook loader (Settings → Knowledge → Load Playbook)
2. Test Role Assistant on live site
3. Test grading with playbook knowledge
4. Fix any issues found
5. Wire AI logging into remaining touchpoints (coach, blasts, buyer scoring)
6. Consider: pgvector for knowledge search, weekly user profile auto-generation
2. Test: Dashboard, Day Hub, Training, Disposition, ROI, AI Coach, Workflows
3. Test password reset flow
4. When ready for monetization, activate Stripe (see Session 17)

---

## Phase 2 — Sequenced Task List

The core revenue loop: calls get graded → grades drive KPIs → KPIs drive accountability → accountability drives revenue. Every step below strengthens that loop in dependency order.

### Step 1 — Call Transcripts + Real Grading (BLOCKER for everything)
All 17 calls scored 0 because we have no transcripts. Without real scores, KPIs are empty, coaching is useless, and TCP scoring has no signal.
- Investigate GHL call recording/transcript access (may need conversations.messages scope or direct recording URL)
- If GHL doesn't expose transcripts: integrate Deepgram or AssemblyAI to transcribe from recording URLs
- Re-grade existing calls with transcripts → real scores populate
- **Exit criteria:** at least 3 calls with score > 0 and real AI feedback on production

### Step 2 — Dashboard KPIs (Wire Real Data)
Dashboard is the daily driver. Empty dashboard = dead product.
- Wire dashboard cards to real data: calls today, avg score, properties in pipeline, tasks open
- Add score trend chart (last 7/30 days)
- KPI snapshot cron already exists — verify it's running and populating kpi_snapshots table
- **Exit criteria:** dashboard shows real numbers from New Again Houses data on production

### Step 3 — Team Invites + Role-Based Views
Can't track team performance without a team. Can't sell seats without multi-user.
- Fix invite email (bug #8 — empty companyName)
- Invite 2-3 real team members from New Again Houses
- Verify role-based access: team leads see their team, managers see their own data
- Assign calls to correct team members (match GHL userId to Gunner user)
- **Exit criteria:** at least 2 team members logged in, seeing their own calls/KPIs

### Step 4 — Onboarding Polish + Paywall
Product works. Now charge for it.
- Streamline onboarding: connect GHL → see first graded call in under 60 seconds
- Add Stripe integration with paywall after first graded call is shown
- Free trial period or immediate charge — your call on pricing
- **Exit criteria:** new tenant can register, connect GHL, see graded call, hit paywall

### Step 5 — TCP Lead Scoring
Build the True Conversion Probability model (CLAUDE.md Rule 5).
- Create lib/ai/scoring.ts — ensemble model using call scores, touch count, equity, motivation
- Add tcp_score column to properties
- Recalculate on: call graded, stage change, task completed
- Surface "Buy Signal" alerts: high TCP + low team engagement
- **Exit criteria:** properties in inventory show TCP scores, buy signals surfaced on dashboard

### Step 6 — Buyer List + Deal Blasting
New revenue module — requires high-stakes gates (Rule 4).
- Build buyer management UI
- Build deal blast: select property → select buyers → send SMS/email
- Implement lib/gates/requireApproval.ts for SMS blast confirmation
- Track buyer responses and interest
- **Exit criteria:** one real deal blast sent to real buyers on production
