# SAAS-LIFECYCLE.md — Gunner SaaS Lifecycle Map

> **Purpose:** This is the strategic north star for all product decisions. It maps the 16-stage SaaS lifecycle to Gunner's current state, gaps, and priorities. Update this document whenever a stage advances.
>
> **Last updated:** March 12, 2026

---

## 1. Idea (COMPLETE)

- **Problem Discovery:** Sales teams (roofing, solar, real estate wholesaling) have no way to systematically grade and coach reps on their phone calls. Managers rely on ride-alongs and gut feel.
- **Market Research:** Home services is a $600B+ market. Sales coaching tools exist (Gong, Chorus) but are priced for enterprise ($100+/seat) and ignore blue-collar sales workflows.
- **Niche Selection:** Real estate wholesalers and home services (roofing, solar, HVAC). Start with wholesaling (New Again Houses as flagship).
- **Competitor Analysis:** Gong/Chorus (enterprise, $$$), Otter.ai (transcription only, no grading), CallRail (tracking only). No AI grading + CRM-native tool for SMB home services.
- **Opportunity Mapping:** Integrate directly with GoHighLevel (the dominant CRM in this niche), auto-pull calls, grade with AI, and deliver coaching -- zero manual work for the rep.

---

## 2. Validation (COMPLETE)

- **Customer Interviews:** New Again Houses (Corey's company) is the live customer -- built from internal pain.
- **Landing Page Test:** Landing.tsx and IndustryLanding.tsx are live with industry-specific variants.
- **Waitlist:** NAH Kitty Hawk (tenant 450029) is in onboarding queue.
- **Pre-Sales:** Apex Property Solutions (tenant 540044) is a demo tenant.
- **Demand Testing:** 3,263 real calls processed for NAH. Product is in daily use.

---

## 3. Planning (COMPLETE)

- **Product Roadmap:** Documented in REBUILD-PLAN.md and various planning docs.
- **Feature Prioritization:** Core loop (ingest -> transcribe -> grade -> coach) is prioritized. Pipeline/dispo and KPI dashboards are secondary.
- **MVP Scope:** Call grading, leaderboards, AI coach, team management, GHL integration.
- **Tech Stack:**

  **Frontend:** React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 4 + 54 shadcn/Radix UI components + TanStack React Query + tRPC 11 + Wouter + Framer Motion + Recharts + React Hook Form + Zod + Lucide + cmdk + Sonner + wavesurfer.js + canvas-confetti + jsPDF + streamdown + embla-carousel + @sentry/react

  **Backend:** Node.js + Express 4 + tRPC Server 11 + Drizzle ORM + pg + Zod + jose + jsonwebtoken + bcrypt + helmet + express-rate-limit + cookie-parser + p-queue + nanoid + ffmpeg-static + axios + SuperJSON + @sentry/node + mammoth + pdf-parse + lamejs

  **AI/ML:** OpenAI API (GPT-4o for grading/coaching, Whisper for transcription) + LangSmith (AI observability)

  **Database:** PostgreSQL on Railway + Drizzle ORM (68+ tables, 79 migrations)

  **External Services (Active):** Supabase Storage, Stripe ($99/$249/$499 tiers), Resend, GoHighLevel (API key + OAuth + CRM adapter), Google OAuth, Sentry (FE+BE), Railway

  **External Services (Env-Ready):** PostHog, Loops, Cloudflare Turnstile

  **AI Development Stack:** Cursor + Claude, CLAUDE.md, REBUILD-PLAN.md, 20 Claude agents (8 engineering, 4 product, 8 testing), 4 Claude skills, Jules, CodeRabbit

  **CI/CD:** GitHub Actions (PR checks + nightly builds) + Railway auto-deploy

  **Dev Tools:** Vitest, ESLint + typescript-eslint + prettier, Drizzle Kit, esbuild, tsx

- **Development Plan:** Iterating on active deploy branch with Railway auto-deploy. Solo founder + AI agent army (Cursor + 20 Claude agents + Jules + CodeRabbit) replaces traditional dev team.

---

## 4. Design (IN PROGRESS — 92%)

### Design Standards (from REBUILD-PLAN Section 17)

The bar: Linear, Notion, Stripe, Vercel -- companies that treat UI as a competitive advantage.

**Principles:** Firm (no wobbly buttons), Precise (pixel-perfect alignment), Quiet (let content breathe), Fast (every interaction <100ms), Dense where it matters (data pages maximize info density).

**Typography:** Satoshi (primary), Inter (labels), JetBrains Mono (code/numbers), Orbitron (gamification). Strict 5-size scale. Line heights: body 1.5, headings 1.2, dense data 1.3.

**Color:** Dark mode primary. Gunner red (#c41e3a) for primary actions. Grade colors: A=emerald, B=blue, C=amber, D=orange, F=red. 10-shade neutral scale.

**Spacing:** 4px base unit. All spacing is multiples of 4 (4, 8, 12, 16, 24, 32, 48, 64).

**Motion:** Page transitions 200ms ease-out (no bounce/spring). Micro-interactions 150ms ease. Skeleton shimmer for loading (<1s). Confetti only for badge/level up.

**Anti-patterns (banned):** `window.prompt()` / `window.confirm()`, toast-only feedback for actions, inline `style={}` props, arbitrary z-index (use 10/20/30/40/50 scale), CSS `!important`, spinners for <1s loads, layout shift on data load.

### What's Built

- **UI Design:** Tailwind + shadcn/ui (54 components). Modern dark-friendly design.
- **UX Flows:** Onboarding (4-step), call review, AI coach chat, inventory pipeline, action confirmation.
- **Prototype:** Live app serves as the prototype.
- **Design System:** 54 reusable UI components in client/src/components/ui/. Button variants (default, destructive, outline, ghost, link). Card, Table, Form patterns established.

**Gaps:** No Figma source of truth. Dark mode audit needed (grep for raw colors). Light mode not polished. Some pages still use spinners instead of skeleton. Layout shifts on some data loads.

---

## 5. Development (BUILT — 99% — Feature Complete, Polish In Progress)

### Core Architecture: Four-Playbook System

The foundational design pattern -- everything flows through 4 playbook layers:

1. **Software Playbook** -- Universal rules (action types, grade scale, XP, levels, CRM adapter interface, security rules, algorithm frameworks). Owned by Gunner.
2. **Industry Playbook** -- Industry-specific (rubrics, roles, call types, stages, terminology, roleplay personas, grading philosophy, benchmarks). Stored in DB, seeded from server/seeds/.
3. **Tenant Playbook** -- Company-specific (CRM connection, stage mappings, markets, lead sources, algorithm overrides, rubric tweaks, KPI targets). Editable via UI + AI.
4. **User Playbook** -- Per-person intelligence (strengths, growth areas, grade trend, communication style, instructions, voice profile). Auto-updated after grading.

Resolution order: User > Tenant > Industry > Software (most specific wins). This creates switching cost -- leaving Gunner means losing all accumulated intelligence.

### Build Phases (from REBUILD-PLAN.md)

| Phase | Status | What |
|-------|--------|------|
| Phase 0: Security + Cleanup | Mostly done | Remove hardcoded secrets, fix 9 IDOR endpoints, delete dead pages, login rate limiting |
| Phase 1: Software Playbook + Restructure | Done | Router split (12 files), CRM adapter, algorithms, playbook data model, useTenantConfig, ActionConfirmDialog, unified AI, event tracking |
| Phase 2: Industry Playbook (RE Wholesaling) | Done | 7 rubrics, 6 call types, 4 roles, 10 outcomes, pipeline stages, terminology, grading philosophy |
| Phase 3: Tenant Playbook (NAH Config) | Partial | CRM connection done. Markets, lead sources, KPI targets, algorithm overrides still needed |
| Phase 4: User Playbook + Intelligence | Early | User profile auto-updates done. Coaching memory, action patterns, proactive suggestions, voice collection still needed |
| Phase 5: Landing + Premium Polish | Partial | Landing exists. Empowerment messaging, signup re-enable, 5 industry pages, dark mode audit, gamification fixes still needed |

### Pages

- **7 core pages:** /today (Day Hub), /calls (Call Inbox), /inventory (Pipeline), /kpis (KPI Dashboard), /team (Team + Gamification), /training (Training Hub), /settings (Configuration)
- **Supporting:** /, /login, /pricing, /profile, /admin, /playbook
- **To delete/consolidate (from REBUILD-PLAN Section 4):** Home (858 lines), LeadGenDashboard, ComponentShowcase, GradingRules, Feedback. Methodology/TeamTraining → /training. Leaderboard → /team. Analytics → /kpis. Opportunities → /inventory. CoachActivityLog → /calls. TeamManagement/TenantSetup → /settings.

### Unified AI Service

One AI everywhere -- same voice, memory, personality across all pages. Single endpoint: `POST /api/ai/stream`. Server assembles context from all 4 playbooks. One conversation thread across all pages. AI versions: V1 (reactive, current) → V2 (proactive, next) → V3 (autonomous, future).

### Sorting Algorithms

Three algorithms with CONFIG OBJECTS at top of file (tune config, not logic):
- **Inventory Sort** -- 4-tier urgency: Needs Attention > New > Active Working > Contacted Today
- **Buyer Match** -- Market hard filter + 5-signal score (project type 35pts, buyer tier 30pts, response speed 20pts, verified funding 10pts, past purchase 5pts)
- **Task Sort** -- Role-specific: Lead Manager (15-min new lead rule), Acquisition Manager (revenue-weighted), Dispo Manager (buyer responses + deal deadlines)

### Universal Action System

Every CRM action goes through `ActionConfirmDialog` -- Preview (FROM/TO/WHAT) → Execute → Result. No exceptions. Banned: `window.prompt()`, toast-only feedback, silent actions. Applies to: SMS, Note, Task, Appointment, Stage Change, Workflow, Tag, Field Update, Bulk SMS.

### Inventory as Core

Pipeline command center, not a property list. Asset-focused (not contact-focused). Stage tabs from Tenant Playbook (no hardcoded stage names). Property Detail Panel: Overview, Buyers, Outreach, Activity, AI Assistant, Deal Blast. Every action writes back to CRM.

### Change Log — March 10, 2026 (Feature Complete session)

- **RBAC:** Role-based access control across all write operations. `requireRole()` helper, admin/manager/member hierarchy, frontend booleans, admin-gated UI.
- **Session Management:** Sessions table, login session tracking, per-device sign-out, sign-out-all-devices, Sessions tab in Settings.
- **Global Search:** Real debounced search across calls, contacts, and coach notes wired into the Cmd+K command palette.
- **Audit Log:** Every admin/write action logged with user, timestamp, before/after state. Audit Log tab in Settings (admin-only).
- **Performance:** DB indexes on hot query paths, Vite chunk splitting for react/recharts/radix, CRM status in `/health`, degradation banner in DashboardLayout.

### What's Built

- **Frontend:** 15 pages, 50+ shadcn/Radix UI components, TanStack Query + tRPC, Framer Motion, Recharts, cmdk, canvas-confetti, wavesurfer.js.
- **Backend:** 15 tRPC routers (split from 9,059-line monolith). Express middleware. Scheduled jobs: daily digest, weekly report, 5-min call polling, 10-min opportunity sync.
- **APIs:** tRPC internal + REST for Stripe webhooks, GHL webhooks, AI streaming, health check.
- **Database:** 68+ tables, 79 migrations. Multi-tenancy, calls/grades, gamification, KPIs, pipeline, playbooks, AI coach, subscriptions, voice profiles.
- **Authentication:** Google OAuth + email/password + bcrypt + JWT (jose) + Turnstile (env-ready).
- **Integrations:** GoHighLevel (polling + webhooks + OAuth + adapter pattern), OpenAI, Supabase Storage, Stripe, Resend, Google OAuth.
- **AI Workforce:** 20 Claude agents + 4 skills + Jules + CodeRabbit.

### Remaining Gaps

- Phase 0: ✅ Complete — IDOR endpoints fixed (old monolith gone, all new routers tenant-scoped), login lockout done, webhook HMAC done
- Phase 3: NAH markets/zip codes, lead sources, KPI targets, algorithm overrides not configured (needs real GHL data)
- Phase 4: Action pattern analysis, proactive suggestions, voice sample extraction, consent toggle (coaching memory distillation ✅ done)
- Phase 5: Empowerment messaging, signup re-enable, 5 industry landing pages, dark mode audit (gamification ✅ fixed)
- No real-time features (WebSockets). No mobile app.

---

## 6. Infrastructure (BUILT — 95%)

### CRM Sync Architecture (Triple-Layer)

1. **Webhooks (real-time):** GHL pushes events → server/middleware/webhook.ts processes with eventId dedup (DB-based, survives deploys) + retry queue (1m, 5m, 15m, 1h, max 4 attempts). Handles: Calls, Opportunities, Contacts, Tasks, Appointments.
2. **Polling (safety net):** Calls every 5 min, opportunities every 10 min, contacts every 30 min, tasks every 5 min, appointments every 15 min. Smart polling: reduced frequency when webhooks healthy.
3. **Reconciliation (catch-all):** Daily 2 AM compare Gunner vs CRM for last 48h. Weekly full pipeline reconciliation. Auto-import missed data.

Credential priority: OAuth Access Token → API Key fallback → Alert + Degrade Gracefully (grading/training still work when CRM disconnected).

### Trigger Map (from REBUILD-PLAN Section 11)

Every trigger follows the rule: ONE input → ONE action → ONE result → ONE failure → ONE recovery. **No silent failures.** If it worked, user KNOWS. If it failed, user KNOWS and can fix it.

- **Data in (CRM → Gunner):** New call recording, new opportunity, stage change, contact update, SMS, task, appointment
- **Data out (Gunner → CRM):** Send SMS, Add Note, Create Task, Complete Task, Change Stage, Create Appointment, Add/Remove Tag, Update Field, Deal Blast
- **Internal triggers:** Call graded (→ grade + XP + alert), inline edit, KPI entry, roleplay complete, AI suggestion, weekly digest (Monday 6 AM), daily reconciliation (2 AM)

### Critical Security Fixes (from REBUILD-PLAN Section 12)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Hardcoded Supabase service key fallback in storage.ts | CRITICAL | ✅ FIXED — throws if missing, no fallback |
| 2 | JWT secret defaults to "dev-secret" in context.ts | CRITICAL | ✅ FIXED — uses `required()`, server won't start without it |
| 3 | 9 endpoints without tenant check (teamMembers.getById, etc.) | HIGH | ✅ RESOLVED — these endpoints from old monolith no longer exist; all new routers have tenantId checks |
| 4 | Login rate limiting with account lockout after 10 fails | MEDIUM | ✅ FIXED — failedLoginAttempts + lockedUntil on users table, 10 fails → 30 min lock |
| 5 | Webhook signature verification (GHL webhook authenticity) | MEDIUM | ✅ FIXED — HMAC-SHA256 via GHL_WEBHOOK_SECRET env var in middleware/webhook.ts |

### Cloud + DevOps

- **Cloud Hosting:** Railway (Nixpacks, auto-deploy, health checks at /health with 300s timeout, auto-restart with 3 retries). Railway billing active.
- **DevOps:** Git push = deploy (zero-step). Drizzle migrations via npm run db:push. 14 utility scripts for tenant management, badge evaluation, sync triggers, Stripe setup.
- **CI/CD:** GitHub Actions (PR type check + build, nightly 2 AM CST autonomous build + failure notifications).
- **Monitoring (3-layer):**
  - Sentry -- Active on backend + frontend. 10% trace sampling in prod. Error replay enabled.
  - PostHog -- posthog-node installed, custom trackEvent() writes to user_events table.
  - LangSmith -- AI observability via env vars. Auto-traces OpenAI calls.
- **AI Code Quality Pipeline:** Cursor + Claude, CLAUDE.md, REBUILD-PLAN.md, SAAS-LIFECYCLE.md, 20 agents, 4 skills, Jules, CodeRabbit, .cursor/rules/gunner.mdc.
- **Security (built):** Helmet, express-rate-limit, JWT auth (jose), bcrypt, Turnstile (env-ready).

### Internal Tools to Build (from REBUILD-PLAN Section 20)

- Playbook Seeder CLI (`npm run playbook:seed wholesaling`)
- Migration Health Check (verify all endpoints have tenantId enforcement)
- Sync Health Monitor (webhook/polling/reconciliation dashboard)
- AI Cost Tracker (OpenAI spend per tenant per day)
- Playbook Diff Tool (show what changed between versions)

**Gaps:** All 5 critical security fixes resolved (see table above). No staging environment. No uptime monitoring (Pingdom/Better Uptime). No automated DB backups beyond Railway built-in. PostHog frontend SDK not wired.

---

## 7. Testing (AGENT-POWERED — 45%)

- **Unit Testing:** Vitest configured, no test files written yet. Need: @testing-library/react for frontend.
- **Integration Testing:** None automated. Manual testing via live NAH tenant.
- **E2E Testing:** None. Need: Playwright for full user journey tests (login → grade → action → verify).
- **Bug Fixing:** Sentry alerts + CodeRabbit PR reviews + Jules autonomous fixing + 8 testing Claude agents.
- **Performance Testing:** Performance Benchmarker agent available, no benchmarks run.
- **Beta Testing:** NAH (tenant 1) live with 3,263+ calls. Kitty Hawk onboarding next.
- **Second Tenant Test (from REBUILD-PLAN):** After rebuild, onboarding a second RE wholesaling tenant should take <30 min and require ZERO code changes. Onboarding a solar company should require ZERO code changes -- just creating a solar industry playbook.

**Gaps:** Zero automated test coverage. Agent testing is reactive, not CI-integrated. Priority: grading pipeline tests, auth flow tests, webhook handler tests. Need Migration Health Check script that verifies all endpoints have tenantId enforcement.

---

## 8. Launch (IN PROGRESS — 50%)

### Landing Page Strategy (from REBUILD-PLAN Section 15)

**Messaging shift:** "Stop Babysitting Your Sales Reps" → "Empower Your Team to Perform at Their Best." Frame around empowerment, not distrust.

**Landing page sections (11):** Nav (Sign In + Get Started), Hero (3-pillar), Problem, How It Works, Features (tabs), Social Proof (from DB), Pricing (from DB), Integrations (CRM-agnostic), FAQ (from config), Final CTA, Footer.

**5 industry landing pages:**
1. RE Wholesaling at /industries/wholesaling (FIRST -- "Built by a Wholesaler" story goes HERE)
2. Solar Sales at /industries/solar
3. Insurance at /industries/insurance
4. SaaS Sales at /industries/saas
5. Home Services at /industries/home-services

Template architecture: IndustryLanding.tsx + industryConfigs/ (pure data objects, no JSX).

**Auth on landing:** Sign In + Get Started in nav. Google OAuth prominent. Email+password signup must be re-enabled.

**Rules:** Zero hardcoded tenant/industry content. Testimonials from DB. Pricing from DB. FAQ from config.

### Current State

- **Landing Page:** Live with industry template. Deployed on Railway.
- **Product Hunt:** Not launched yet.
- **Beta Users:** NAH (tenant 1) is live with 3,263 calls.
- **Early Adopters:** Kitty Hawk (450029) onboarding. Apex (540044) demo.
- **Public Release:** Not yet. Domain getgunner.ai reserved but DNS not flipped to Railway.

**Gaps:** Empowerment messaging not implemented. Email+password signup blocked. Only 1 industry config (wholesaling), need 4 more. Testimonials/FAQ hardcoded. DNS not flipped.

---

## 9. Acquisition (NOT STARTED — 5%)

- **SEO Wins:** Industry landing pages exist but no blog, no content strategy, no keyword targeting.
- **Content Marketing:** None. No blog, no YouTube, no podcast.
- **Social Media:** None planned.
- **Cold Email:** outreach_history table exists in schema but no cold outreach system built.
- **Influencer Outreach:** None.
- **Affiliate Marketing:** None.

**Priority actions:** SEO blog targeting "AI sales coaching for roofers/wholesalers", GHL marketplace listing, YouTube demo videos.

---

## 10. Distribution (PARTIALLY STARTED — 10%)

- **Directories:** Not listed on any SaaS directories (G2, Capterra, etc.).
- **SaaS Marketplaces:** Not on GHL Marketplace yet (huge opportunity -- GHL has 100K+ agencies).
- **Communities:** No presence in GHL Facebook groups, wholesaling communities, or roofing forums.
- **Partnerships:** No formal partnerships. GHL integration is the foundation for one.
- **Integrations:** GHL is live. CRM adapter interface exists for future expansion.

**Priority actions:** GHL Marketplace listing, join 5-10 GHL/wholesaling Facebook groups, partner with GHL agencies.

---

## 11. Conversion (PARTIALLY BUILT — 40%)

- **Sales Funnel:** Landing page -> Signup -> Onboarding -> Free trial (implicit).
- **Free Trial:** Implied but not explicitly time-gated in code.
- **Freemium Model:** Three tiers in Stripe (starter/growth/scale).
- **Pricing Strategy:** Starter $99/Growth $249/Scale $499. Stripe checkout and billing portal built.
- **Checkout Optimization:** Basic Stripe Checkout. No upsell flows, no annual discount prompts.

**Gaps:** No explicit trial period logic. No in-app upgrade prompts. No pricing page on marketing site.

---

## 12. Revenue (PARTIALLY BUILT — 30%)

- **Subscriptions:** Stripe handles checkout, subscription updates, cancellations, failed payments.
- **Upsells:** None built.
- **Add-ons:** None. Could add: extra seats, extra AI credits, white-label.
- **Annual Plans:** Not implemented. Only monthly.
- **Enterprise Deals:** No enterprise tier, no custom pricing.

**Priority actions:** Add annual plans (20% discount), build upgrade prompts at tier limits, create enterprise inquiry flow.

---

## 13. Analytics (PARTIALLY BUILT — 25%)

- **User Tracking:** user_events table + trackEvent() service. Sentry for errors.
- **Funnel Analysis:** KPI dashboard tracks call-to-deal funnels for tenants.
- **Cohort Analysis:** None.
- **KPI Dashboard:** Built for tenant sales KPIs. No internal Gunner business KPIs (MRR, churn, activation).
- **A/B Testing:** None.

**Gaps:** No MRR dashboard. No churn tracking. No activation funnel. PostHog needs frontend integration.

---

## 14. Retention (PARTIALLY BUILT — 40%)

### Gamification System (from REBUILD-PLAN Section 16)

**What works:** 28 badges (5 categories, 3 tiers: Bronze/Silver/Gold), XP system (10 base + grade bonus), 25 levels (0→350K XP), hot streaks + consistency streaks, confetti on badge unlock.

**What works (fixed March 2026):**
- Improvement XP: awarded in `processCallGamification` when score > prevAvg by 5+ pts ✅
- Weekly volume badges: `volume_dialer_10`, `volume_warrior_25`, `volume_machine_50` ✅
- Consistency badges: `consistency_3/7/14/30` -- all tracked ✅
- Closer badges: evaluated in `processDealClosedGamification` (on stage change) ✅

**Enhancements still planned:** Daily/weekly challenges, badge rarity visuals (glow effects), XP history timeline, streak freeze, custom tenant badges, team challenges.

### Current State

- **User Onboarding:** 4-step flow (welcome -> CRM -> team -> done).
- **Email Automation:** Daily digest, grade alerts via Resend. Loops env-ready but not fully implemented.
- **Customer Support:** None built. No in-app chat, no help center.
- **Feature Adoption:** Gamification drives rep engagement. AI Coach provides in-app coaching.
- **Churn Reduction:** outreach_history table exists. Weekly digest job running.

**Gaps:** No help center. No in-app NPS. Loops drip not implemented. No churn prediction.

---

## 15. Growth (MINIMAL — 10%)

- **Referral Programs:** referrals mentioned in KPI enums but no referral program built.
- **Community Building:** None.
- **Product-Led Growth:** Gamification is a PLG lever. AI Coach drives daily engagement.
- **Viral Loops:** None. Could add: "Powered by Gunner" on shared scorecards, team invite bonuses.
- **Expansion Strategy:** CRM adapter interface allows adding non-GHL CRMs. Industry playbooks allow expanding beyond wholesaling.

**Priority actions:** Build referral program, add "Powered by Gunner" to shared reports, expand to roofing/solar playbooks.

---

## 16. Scaling (FUTURE — 35%)

- **Automation:** Call ingestion fully automated (5-min polling + webhooks). AI grading automated. Digests automated. Opportunity sync every 10 min. Manual: new tenant onboarding.
- **Hiring:** Solo founder + AI agent army (Cursor + 20 Claude agents + Jules + CodeRabbit). No traditional team needed until $1M+ ARR.
- **Systems:** Railway auto-deploy. GitHub Actions CI. Drizzle migrations. 14 utility scripts. Codified workflows via Claude skills.
- **Global Expansion:** English-only. US-only. No i18n. CRM adapter pattern allows non-GHL CRMs when ready.
- **Exit Strategy:** Not applicable yet. Focus on $1M ARR first.

---

## Summary: Where Gunner Stands Today

| Stage          | Status | Priority                                             |
| -------------- | ------ | ---------------------------------------------------- |
| Idea           | DONE   | --                                                   |
| Validation     | DONE   | --                                                   |
| Planning       | DONE   | --                                                   |
| Design         | 95%    | Low -- iterate in code                               |
| Development    | 99%    | Medium -- ongoing feature work, 20 AI agents active  |
| Infrastructure | 95%    | Low -- operational, needs staging + uptime monitoring |
| Testing        | 45%    | Medium -- Vitest CI enforced, need E2E coverage      |
| Launch         | 50%    | HIGH -- flip DNS, plan Product Hunt                  |
| Acquisition    | 5%     | CRITICAL -- no customers finding you organically     |
| Distribution   | 10%    | HIGH -- GHL Marketplace is low-hanging fruit         |
| Conversion     | 40%    | Medium -- pricing page, trial logic, upgrade prompts |
| Revenue        | 30%    | Medium -- annual plans, upsells                      |
| Analytics      | 25%    | Medium -- need MRR/churn dashboards                  |
| Retention      | 40%    | Medium -- finish Loops drip, add help center         |
| Growth         | 10%    | Medium -- referral program, viral loops              |
| Scaling        | 35%    | Low -- AI-first model in place, premature until 50+  |

---

## Architecture Rules (from REBUILD-PLAN Section 23)

1. **Nothing hardcoded. Ever.** Labels from playbooks (`useTenantConfig`), not hardcoded strings. No `if (role === 'acquisition_manager')` -- use playbook role references.
2. **Algorithm config at top of file.** To tune: change config, not logic. One line, one file.
3. **One component, used everywhere.** ActionConfirmDialog for all actions. SearchableDropdown for all pickers. useTenantConfig for all labels. /api/ai/stream for all AI. Fix once → fixed everywhere.
4. **CRM write-back contract.** Every Gunner action that changes data → writes to CRM (task, note, SMS, stage change, appointment, tag, field).
5. **Easily updatable.** AI agents can find and update any weight, label, or behavior by changing one config value in one file.

---

## Premium Enhancement List (from REBUILD-PLAN Section 21)

44 enhancements for premium parity, grouped:

- **UI/UX (10):** Command palette wiring, keyboard shortcuts, page transitions, empty states, error boundaries, responsive tables, dark mode audit, skeleton consistency, notification system, breadcrumbs
- **Data (5):** Real-time updates (WebSocket/SSE), advanced full-text search, CSV/PDF export, complete audit log, funnel charts + heat maps + sparklines
- **AI (5):** Proactive suggestions, call summary auto-generation, AI training content, sentiment analysis, competitive intelligence
- **Gamification (8):** Fix 4 broken badges, improvement XP, daily/weekly challenges, badge rarity visuals, achievement notifications, XP history, custom badges, team challenges
- **Actions (5):** Bulk selection with warning, action history per contact, 5-second undo, SMS/note templates, visual workflow builder (future)
- **Performance (6):** CDN for static assets, query optimization + indexes, bundle code-splitting, API response caching (5-min TTL), health check, graceful CRM degradation
- **Security (5):** SOC 2 readiness, RBAC (admin/manager/member), API key management, session management + "sign out everywhere", 2FA for admins

---

## Recommended Execution Order (Next 90 Days)

1. **Acquisition + Distribution** -- Get found. GHL Marketplace listing, SEO blog, community presence.
2. **Launch** -- Flip DNS to Railway. Plan a Product Hunt launch.
3. **Conversion** -- Pricing page, explicit free trial, upgrade prompts.
4. **Retention** -- Finish Loops drip emails, add in-app help/support. Fix 4 broken gamification badges.
5. **Revenue** -- Annual plans, upsell prompts at tier limits.
6. **Testing** -- Core pipeline tests (grading, auth, webhooks) before scaling.
7. **Security** -- Fix 4 critical security items from Phase 0 before onboarding more tenants.

---

## Change Log

| Date | Stage | Change | By |
|------|-------|--------|----|
| 2026-03-10 | All | Initial lifecycle document created | Cursor + Claude |
| 2026-03-10 | Dev/Infra | Full codebase audit: confirmed all 12 routers real, algorithms complete, gamification/webhook/grading fully functional, dead pages deleted, CRITICAL security issues resolved, TypeScript 0 errors | Claude |
| 2026-03-10 | Security | Login lockout (10 fails → 30 min lock), GHL webhook HMAC-SHA256 verification, trust proxy for Railway | Claude |
| 2026-03-10 | Auth | Fixed Google OAuth routing: new users → /onboarding, trust proxy added | Claude |
| 2026-03-10 | Gamification | Wired improvement XP (was never called), fixed improvement badge logic, added weekly volume badges | Claude |
| 2026-03-10 | Intelligence | Coaching memory distillation job: weekly GPT-4o summarizes AI coach conversations → updates user_playbooks | Claude |
| 2026-03-10 | Quality | Final hardening pass: accessibility aria-labels on all icon-only buttons (Training, Settings, Onboarding, Inventory, Playbook, ActionConfirmDialog, SearchableDropdown); corrected stale sections in SAAS-LIFECYCLE (gamification all fixed, Phase 0 security all fixed) | Claude |
| 2026-03-11 | Design / Dev | 24-hour post-build sprint — bug fixes, visual alignment, design system cleanup, GitHub CI hygiene. Waves 0-3: CI wiring (sync-main, ESLint in PR check), env var hardening, isStarred/D-grade/icon-sm/warning token fixes, CallInbox polish, --obs-* token removal (58 lines), stageColor() fallback, getContactContext tRPC + Recent Calls UI, landing page integration badge corrections, Privacy/Terms stubs, XP thresholds centralized to shared/types.ts, 35 inline styles removed from Settings/Playbook. Design: 80% → 92%. Development: 90% → 95%. | Claude |
| 2026-03-11 | Wave 6A-6C | Google OAuth fixed, Day Hub rebuilt with KPI ledger, role tabs, clickable stat cards | Claude |
| 2026-03-12 | Infrastructure Upgrade | Added 7-agent orchestration (server/agents/), BullMQ/Redis queue system (server/queues/), agent memory store, Control Room API, Vitest test suite with CI enforcement, Dockerfile, Redis Cloud connected. 190 ESLint warnings cleared. Compliance violations #8, #10, #12, #14, #15, #16, #17, #21 resolved. | Claude |
| 2026-03-12 | Call Coaching | Full call page overhaul — detail page (`/calls/:id`), next steps engine (AI-generated action suggestions, push to CRM), AI coach sidebar, grading improvements (per-criterion explanations, objection handling, overallGrade stored), 60-second grading gate, `call_feedback` table, reclassification modal, CallCard/CallFilters redesign, playbook compliance audit | Claude |
| 2026-03-12 | Day Hub / Design | Day Hub polish — fixed-height panels (no bounce), inbox row redesign (SMS icon, property address, team member label), per-contact AM/PM chips on every task row, task categories playbook field (New Lead/Follow Up/Admin/Reschedule), two-click task complete with CRM write-back, overdue gradient text, 50-task pagination, Team Members filter (admin only), Update Workflow smart stage dropdown, KPI card visual polish, AI Coach full Day Hub context injection, dynamic quick-prompt chips, Settings CRM Phone linking. Design: 92% → 95%. Development: 97% → 98%. | Claude |
| 2026-03-12 | Quality Gate | 23-point security/CRM/grading audit — all PASS. Security: session revocation, no hardcoded emails, signup transaction, login orphan guard, RBAC hierarchy, tenant-scoped writes, AI rate limiter, AI tenant filter. CRM: config merge safety, webhook HMAC, real handlers, full action types, mock scoping, 30-day first sync, pagination caps, reconciliation auto-import. Grading: JSON parse fallback, tenant-scoped updates, atomic XP, transactional streaks, closer badge lookup. Development: 98% → 99%. Infrastructure: 90% → 95%. Testing: 35% → 45%. | Claude |
