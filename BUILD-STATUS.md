# BUILD-STATUS.md — What's Done, What Remains

> Last updated: March 10, 2026 (Phases 1-5 batch build: pkg cleanup, PostHog, NAH seed, AI suggestions, notifications, breadcrumbs, skeletons, optimistic updates)
> Last deploy: Railway auto-deploys from manus-migration
> Type check: `npx tsc --noEmit` — 0 errors

Read `REBUILD-PLAN.md` for the full specification. This file tracks progress against that spec.

---

## Completed Work

### Finish Line Batches (all 8 complete)

- [x] **Batch 1:** Webhook retry queue, eventId dedup, opportunity polling, removeFromWorkflow
- [x] **Batch 2:** Scheduled jobs framework (weekly digest, reconciliation, user profile update)
- [x] **Batch 3:** Closer badge, improvement XP, badge XP, playbook-driven badge definitions, confetti notifications
- [x] **Batch 4:** RE Wholesaling seed completion (6 roleplay personas, 10 training categories, grading philosophy)
- [x] **Batch 5:** GHL OAuth flow (backend + Settings UI), webhook registration, sync health display
- [x] **Batch 6:** SearchableDropdown component + sender picker in ActionConfirmDialog
- [x] **Batch 7:** Landing page pricing section, testimonials, industry landing template
- [x] **Batch 8:** AI streaming (SSE), Sentry backend init, ResponsiveTable, accessibility basics

### Security & Polish Pass (complete)

- [x] Helmet security headers (replaces manual header middleware)
- [x] @sentry/react + ErrorBoundary in main.tsx
- [x] Grading philosophy wired from industry playbook into AI grading prompt
- [x] EmptyState component applied to CallInbox, KpiPage, Team, Training
- [x] user_voice_samples + user_voice_profiles tables added to schema + migrations
- [x] eslint.config.js with typescript-eslint + prettier

### Core Infrastructure (complete)

- [x] tRPC routers split from 9,059-line monolith into 12 focused files in `server/routers/`
- [x] CRM adapter abstraction (`server/crm/adapter.ts` + `server/crm/ghl/ghlAdapter.ts`)
- [x] Algorithm framework with config objects (`server/algorithms/`)
- [x] Playbook data model (4 layers: Software, Industry, Tenant, User)
- [x] `useTenantConfig` hook for dynamic labels on all pages
- [x] `usePlaybook` hook for playbook data access
- [x] ActionConfirmDialog universal action system
- [x] SearchableDropdown for all pickers
- [x] Command palette (Cmd+K) via cmdk
- [x] Page transitions (Framer Motion)
- [x] Webhook handler with dedup + retry queue
- [x] Call polling (5min) + opportunity polling (10min)
- [x] Daily digest email job
- [x] Event tracking (user_events table + flusher)
- [x] AI suggestions table (ai_suggestions)
- [x] Playbook insights table (playbook_insights)
- [x] SSE streaming endpoint for AI coach (`POST /api/ai/stream`)
- [x] Health check endpoint (`GET /health`)
- [x] Rate limiting on auth endpoints
- [x] Express-rate-limit middleware
- [x] Skip-to-content link + ARIA landmarks in DashboardLayout

---

## What Remains (by REBUILD-PLAN.md phase)

### Phase 0: Security (COMPLETE)

- [x] **IDOR endpoints** — All 9 endpoints from the old monolith no longer exist. Every endpoint in the new 12-router architecture has `WHERE tenantId = ctx.user.tenantId`. Verified in full audit.
- [x] **Hardcoded Supabase service key** — `storage.ts` throws if credentials missing, no hardcoded fallback.
- [x] **JWT secret defaulting to "dev-secret"** — `JWT_SECRET` uses `required()` in env.ts, server won't start without it.
- [x] **Login lockout** — After 10 failed attempts, account locks for 30 minutes. Counter resets on success. `failedLoginAttempts` + `lockedUntil` columns added to users table via startupMigrations.
- [x] **Webhook signature verification** — GHL payloads verified via HMAC-SHA256 with `GHL_WEBHOOK_SECRET` env var. Graceful skip if secret not configured (dev mode).
- [x] **trust proxy** — Added `app.set("trust proxy", 1)` so Railway's reverse proxy sets correct `req.ip` and secure cookies work.

### Phase 1: Software Playbook + Codebase (mostly done, gaps remain)

- [x] **Dead pages deleted** — Home, LeadGenDashboard, ComponentShowcase, GradingRules, Feedback are gone. Pages directory only contains the 7 core pages + auth pages. Verified in full audit.
- [x] **Pages consolidated** — Methodology, TeamTraining, Leaderboard, Analytics, Opportunities, CoachActivityLog, TeamManagement, TenantSetup all eliminated or absorbed. Verified.
- [x] Remove unused packages: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `add` devDep
- [ ] Frontend testing setup: `@testing-library/react`
- [ ] E2E testing setup: Playwright
- [x] PostHog JS client for frontend analytics/user_events (posthog-js installed, init in main.tsx gated on VITE_POSTHOG_API_KEY)

### Phase 2: Industry Playbook (mostly done, gaps remain)

- [x] **Industry terminology wired** — Full audit confirmed: no hardcoded "Seller", "Property", "Deal" outside of fallback defaults. All pages use `useTenantConfig()` for labels.
- [x] **No hardcoded role checks** — No `if (role === 'acquisition_manager')` pattern found in codebase.
- [x] **No RE-specific AI prompts** — Grading prompts load from playbook dynamically. No hardcoded "Real estate wholesaling" strings in AI code.
- [x] Create additional industry seeds: Solar, Insurance, SaaS, Home Services — all 4 seeded in `server/seeds/industries.ts` + wired into `seedPlaybooks.ts`

### Phase 3: Tenant Playbook / NAH Config (partially done)

- [x] Map NAH's exact pipeline stages to playbook stages (with GHL pipeline/stage ID placeholders in `server/seeds/nahTenant.ts`)
- [x] Define NAH's markets + zip codes in tenant playbook (Charlotte metro + Kitty Hawk)
- [x] Define NAH's lead sources + GHL source string mappings (cold call, DFD, direct mail, PPC, referral, SMS, Facebook, probate)
- [ ] Import NAH team members + map to GHL user IDs (needs real GHL data)
- [x] Set NAH's KPI targets per role per period (in customConfig.kpiTargets)
- [x] Set NAH's algorithm weight overrides

### Phase 4: User Playbook + Intelligence Loop (early stage)

- [x] **Coaching memory distillation** — Weekly job (Monday 7am) that reads AI coaching conversations, calls GPT-4o to extract strengths + growth areas + grade trend, and updates `user_playbooks`. Wired into `startScheduledJobs`.
- [x] Action pattern analysis (daily job in `scheduledJobs.ts` — reads user_events, identifies patterns, stores in user_playbooks.instructions)
- [x] Proactive AI suggestions (V2 — `ai.generateSuggestions` + `ai.getSuggestions` tRPC procedures; cards on Today page)
- [ ] Voice sample extraction job (runs after grading, extracts user audio segments)
- [ ] Consent toggle in Profile page for voice collection
- [ ] Supabase bucket: `gunner-voice-samples`
- [ ] Voice profile dashboard in Profile page (total minutes, sample count, ready status)
- [x] Full user_events collection on frontend (useTrackEvent hook, page_view via PageTracker in App.tsx, ai.trackEvent tRPC procedure)

### Phase 5: Landing + Premium Polish (partially done)

- [x] **Empowerment messaging** — Landing hero already says "Empower Your Sales Team to Perform at Their Best". No "Stop Babysitting" copy exists. Verified in audit.
- [x] **Email+password signup enabled** — Signup.tsx has full email/password form + Google OAuth. Both work. Backend `auth.signup` procedure is live.
- [x] **Gamification fixes** — 4 broken items fixed: (1) Improvement XP now awarded in `processCallGamification` when score beats avg by 5+ pts. (2) Improvement badge check fixed to use score-vs-average logic. (3) Weekly volume badges added (Volume Dialer/Cold Call Warrior/Deal Machine). (4) All badges evaluated on every graded call.
- [x] **Dark mode audit** — No critical raw color issues. `text-white` uses are intentional (text on colored backgrounds). `bg-white` on Google buttons is per Google branding spec.
- [x] **Google OAuth new-user routing** — New users now go to `/onboarding` instead of `/today`.
- [x] Build 5 industry landing pages — all 5 configs in `client/src/pages/landing/industryConfigs/index.ts` (wholesaling, solar, insurance, saas-sales, recruiting/home-services)
- [ ] Testimonials from DB (currently hardcoded)
- [ ] FAQ section on landing (from config/DB)
- [ ] Integrations section ("Works with your CRM" — CRM-agnostic icons)
- [x] Loading skeleton consistency — CallInbox, Inventory, Today shimmer replaced with Skeleton; all other pages already correct
- [x] In-app notification system — `notifications` table, `notificationsRouter`, `NotificationBell` component in header (badge_earned triggers notifications from gamification service)
- [x] Breadcrumbs on nested views — auto-generated from route in DashboardLayout
- [ ] Full accessibility pass (aria-labels on icon-only buttons, form labels, keyboard nav)
- [x] Optimistic updates for CRM actions — `optimisticStatus` in useActions hook, "Sending..." button state in ActionConfirmDialog

### Enhancement List (REBUILD-PLAN Section 21)

These are "premium parity" features — not blockers but important for quality:

- [ ] Advanced full-text search across calls, contacts, properties, transcripts
- [ ] Export any table to CSV + weekly PDF report auto-emailed
- [ ] Complete audit log (who did what, when, viewable in admin)
- [ ] Funnel charts, heat maps, trend sparklines
- [ ] AI-generated training content based on team weak areas
- [ ] Daily/weekly gamification challenges
- [ ] Badge rarity visuals (bronze/silver/gold glow effects)
- [ ] XP history timeline
- [ ] Bulk action selection with warning + confirm
- [ ] Action history per contact (every SMS, note, task, stage change)
- [ ] 5-second undo window for non-destructive actions
- [ ] SMS/note templates per role (from Tenant Playbook)
- [ ] Database query optimization (identify slow queries, add indexes)
- [ ] Bundle size optimization (code-split per route, lazy load heavy pages)
- [ ] API response caching (playbook data, team members — 5-min TTL)
- [ ] Graceful CRM degradation (grading/training still work when CRM disconnected)
- [ ] RBAC (admin, manager, member with per-feature permissions)
- [ ] Session management (session list, "sign out everywhere")

---

## Known Issues

1. **Google OAuth login loop** — Likely fixed by: (a) adding `trust proxy` for Railway's reverse proxy, (b) routing new users to `/onboarding` instead of `/today`. Needs production verification.
2. ~~**Old routers.ts still exists**~~ — **RESOLVED.** Full audit confirmed `server/routers.ts` does not exist. The 12-router split is the only implementation.
3. **GHL OAuth not tested end-to-end** — The OAuth flow (server/services/ghlOAuth.ts + Settings UI) is built but hasn't been tested with a real GHL OAuth app credential.

---

## How to Continue Building

1. Pick a section from "What Remains" above
2. Read the corresponding section in `REBUILD-PLAN.md` for full spec
3. Build it following the patterns already established in the codebase
4. Run `npx tsc --noEmit` — must be 0 errors
5. Commit with prefix: `feat:` / `fix:` / `refactor:`
6. Push to deploy branch — Railway auto-deploys
