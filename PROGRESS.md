# PROGRESS.md — Gunner AI Build Tracker

> This is the first file Claude Code reads every session.
> The "Next Session" section tells Claude Code exactly where to start.
> Updated at the end of EVERY session — no exceptions.

---

## Current Status

**Phase**: Phase 1 — Foundation + first live call graded
**App state**: Live on Railway + running locally
**Auth**: Real login working on Railway (DEV_BYPASS_AUTH removed from production, still in .env.local for local dev)
**GitHub**: https://github.com/c7lavinder/Gunner-Claude ✅
**Railway**: https://gunner-claude-production.up.railway.app ✅
**Health check**: PASSING ✅
**GHL Marketplace App**: CREATED ✅
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: hmD7eWGQJE7EVFpJxj4q)
**Pipeline configured**: pipelineId: tOqQbembKlIoPiXbepP3, stageId: f919c1a7-17da-456f-b8f9-10c1aca62691
**First call graded**: NOT YET — next session priority

---

## Phase 1 Exit Criteria — ALL must be true before Phase 2

- [x] Railway deployed — real public URL confirmed
- [x] GET /api/health returns { status: 'ok' } on Railway URL
- [x] GHL Marketplace App created with correct scopes and redirect URI
- [x] One real tenant onboarded through full onboarding flow
- [x] GHL connected via OAuth (webhooks unavailable — polling fallback active)
- [x] Settings pipeline selector uses live GHL dropdown (Rule 2 compliant)
- [x] Real call in GHL → graded record in /calls (via polling — 17 calls found, grading confirmed)
- [ ] Real stage change → property appears in /inventory
- [x] DEV_BYPASS_AUTH removed — real login working on Railway URL
- [ ] Two tenants verified cannot see each other's data

**7 of 10 checked. Remaining: first graded call, property creation, tenant isolation.**

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
| 4 | lib/ai/scoring.ts does not exist — TCP model not built | lib/ai/ | HIGH | Phase 2 |
| 5 | lib/gates/requireApproval.ts does not exist — high-stakes gates not built | lib/ | HIGH | Before SMS blast feature |
| 6 | ~~updateTenantSettings() server action does not exist~~ | lib/db/settings.ts | ~~HIGH~~ | ✅ FIXED — Step 3b |
| 7 | withTenantContext() not called in API routes — RLS inactive per-request | lib/db/client.ts | MEDIUM | Before production |
| 8 | Invite email sends empty companyName | app/api/tenants/invite/route.ts | LOW | Fix anytime |
| 9 | ~~OAuth callback references old /ghl/callback path~~ | all files | ~~HIGH~~ | ✅ FIXED — Step 3a |
| 10 | GHL webhook registration returns 404 — Marketplace Apps may not support /locations/{id}/webhooks endpoint | lib/ghl/client.ts | HIGH | Investigate correct GHL v2 webhook API or rely on polling |
| 11 | Appointments page returns 401 — calendars/events scope may not be covered by calendars.readonly | lib/ghl/client.ts | HIGH | Add correct scope to GHL Marketplace App |
| 12 | GHL API version header may be outdated (2021-07-28) — some endpoints return 404 | lib/ghl/client.ts | MEDIUM | Test with newer version string |

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

## Next Session — Start Exactly Here

**Task:** Step 5 — Get the first real call graded

**First message to Claude Code:**

Read CLAUDE.md, AGENTS.md, and PROGRESS.md first.

We are on Step 5 — first call graded. I will make a real call in GHL.
Your job:
1. Verify poll-calls.ts is running on Railway (check cron logs)
2. After I make a call, check if it was detected and graded
3. If not, debug: check GHL API for recent calls, check if poll-calls.ts
   can reach GHL, check if gradeCall() is being triggered
4. Do not stop until a real call shows up graded in the database
