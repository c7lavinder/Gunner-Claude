# PROGRESS.md — Gunner AI Build Tracker

> This is the first file Claude Code reads every session.
> The "Next Session" section tells Claude Code exactly where to start.
> Updated at the end of EVERY session — no exceptions.

---

## Current Status

**Phase**: Phase 1 — Foundation hardening
**App state**: Running locally at localhost:3000 with seed data
**Auth**: DEV_BYPASS_AUTH=true — goes straight to dashboard (owner@apex.dev)
**Deployment**: NOT deployed — no public URL yet
**GHL**: NOT connected — no Marketplace App created yet
**First call graded**: NOT achieved — this is the Phase 1 exit criteria

---

## Phase 1 Exit Criteria — must ALL be true before Phase 2

- [ ] App deployed to Railway with a real public URL
- [ ] GHL Marketplace App created with correct scopes and redirect URI
- [ ] One real tenant onboarded through the full onboarding flow
- [ ] GHL connected via OAuth — webhooks registered and confirmed in GHL dashboard
- [ ] One real call made in GHL → appears graded in Gunner AI /calls page
- [ ] Settings pipeline selector uses live GHL dropdown (not text input)
- [ ] DEV_BYPASS_AUTH removed — real login working
- [ ] PROGRESS.md updated with all of the above confirmed

**Do not start Phase 2 until every box above is checked.**

---

## Non-Negotiable Rules (from CLAUDE.md — repeated here for visibility)

1. **Data Contract Rule** — every settings field must declare what it writes to and what reads it
2. **No text inputs for GHL mappings** — always live dropdowns from GHL API
3. **Single settings hub** — 7 sections, no gear icons on individual pages
4. **Gunner enhances GHL, doesn't replace it** — we own properties/KPIs/grades, GHL owns contacts
5. **Autonomous handoff** — PROGRESS.md updated every session, next task explicitly stated

---

## Session Log

### Session 8 — Phase 1 hardening + doc rewrite
**What was done:**
- Integrated 5 non-negotiable rules from prior failed build into CLAUDE.md
- Rewrote PROGRESS.md with Phase 1 exit criteria
- Rewrote docs/ARCHITECTURE.md with data contract rule and GHL boundary
- App running locally with DEV_BYPASS_AUTH=true
- Seed data confirmed working (3 graded calls, 5 properties, team visible)
- GitHub repo created and code pushed to github.com/c7lavinder/Gunner-Claude

### Session 7 — Migration + property CRUD + rubric editor
- Migrated all 19 pages to requireSession() / getSession()
- Built property edit + create forms
- Built call rubric editor UI with full CRUD
- Built properties API and call rubrics API

### Sessions 1–6 — Foundation
- Full project scaffolded, all pages built
- GHL integration layer, auto call grading, AI coach
- Inventory, KPIs, tasks, inbox, appointments, settings shell
- Self-audit agent, seed data, Railway deploy config

---

## Known Bugs

| # | Description | File | Priority | Status |
|---|---|---|---|---|
| 1 | Pipeline selector in settings does not use live GHL dropdown — violates Rule 2 | settings-client.tsx | HIGH | Fix in Phase 1 |
| 2 | Settings fields missing data contract comments — violates Rule 1 | settings-client.tsx | HIGH | Fix in Phase 1 |
| 3 | withTenantContext() not called in API routes — RLS doesn't activate per-request | lib/db/client.ts | MEDIUM | Fix before production |
| 4 | Invite email sends empty companyName | app/api/tenants/invite/route.ts | LOW | Fix next session |

---

## Phase 1 — Sequenced Task List

Work through these IN ORDER. Do not skip ahead.

### Step 1 — Deploy to Railway (BLOCKER)
- Create Railway project → connect GitHub repo
- Add all env vars from .env.example
- Confirm deployment succeeds
- Confirm https://[your-url]/api/health returns { status: ok }
- Why first: GHL webhooks need a public URL. Nothing real can be tested without this.

### Step 2 — GHL Marketplace App
- Go to GHL Agency → Settings → Developer → My Apps → Create App
- Name: Gunner AI
- Redirect URI: https://[your-railway-url]/api/auth/ghl/callback
- Scopes: contacts.readonly/write, opportunities.readonly/write, conversations.readonly/write, calls.readonly, tasks.readonly/write, calendars.readonly
- Copy CLIENT_ID and CLIENT_SECRET → add to Railway env vars
- Why second: Can't do OAuth without the app existing and having a live redirect URI.

### Step 3 — Fix Settings Pipeline Selector (Rule 2 compliance)
- Settings → Pipeline tab → must use live GHL dropdown
- Call GET /opportunities/pipelines and populate options from API
- Store pipelineId and stageId (not names)
- Add data contract comment to every field touched
- Why now: If wrong, property auto-create will never work.

### Step 4 — First Real Tenant Onboarding
- Remove DEV_BYPASS_AUTH from .env.local
- Register as a new real tenant through /register
- Go through full 5-step onboarding wizard
- Connect real GHL sub-account via OAuth
- Confirm webhooks appear in GHL dashboard
- Configure pipeline trigger using the live dropdown

### Step 5 — First Call Graded (Phase 1 exit criteria)
- Make a real call through GHL
- Confirm it appears in Gunner AI /calls within 30 seconds
- Confirm score, rubric breakdown, and AI feedback are populated
- Screenshot as proof
- This is the moment the architecture is proven.

### Step 6 — Invite testers + verify isolation
- Invite 1-2 test users from Settings → Team
- Confirm invite email arrives
- Log in as each tester → confirm they only see their own data
- Confirm roles restrict access correctly

---

## Next Session — Start Exactly Here

**Task:** Deploy to Railway (Step 1 above)

**First message to Claude Code:**
