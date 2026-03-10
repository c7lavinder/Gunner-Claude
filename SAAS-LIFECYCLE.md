# SAAS-LIFECYCLE.md — Gunner SaaS Lifecycle Map

> **Purpose:** This is the strategic north star for all product decisions. It maps the 16-stage SaaS lifecycle to Gunner's current state, gaps, and priorities. Update this document whenever a stage advances.
>
> **Last updated:** March 10, 2026

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

## 4. Design (IN PROGRESS — 80%)

- **Wireframes:** N/A -- built directly in code.
- **UI Design:** Tailwind + shadcn/ui component library. Modern dark-friendly design.
- **UX Flows:** Onboarding flow, call review flow, AI coach chat.
- **Prototype:** Live app serves as the prototype.
- **Design System:** 50+ reusable UI components in client/src/components/ui/.

**Gaps:** No Figma source of truth. Design decisions live in code only.

---

## 5. Development (BUILT — 90%)

- **Frontend:** 15 pages, 50+ shadcn/Radix UI components, TanStack Query + tRPC client, Framer Motion animations, Recharts dashboards, command palette (cmdk), canvas-confetti for badge unlocks, wavesurfer.js for audio playback. Key pages: Today Hub, Call Inbox, Inventory Pipeline, KPIs, Team, Training, Playbook, Settings, AI Coach, Profile.
- **Backend:** 13 tRPC routers (auth, calls, team, settings, inventory, today, KPIs, gamification, training, AI, playbook, actions). Express middleware for auth, rate limiting, webhooks (GHL + Stripe). Scheduled jobs: daily digest (8am), weekly report, 5-min GHL call polling, 10-min opportunity sync.
- **APIs:** tRPC for internal API. REST endpoints for Stripe webhooks, GHL webhooks, AI streaming, health check.
- **Database:** 68+ tables with 79 migrations. Covers: multi-tenancy, auth, calls/grades, gamification, KPIs, properties/pipeline, playbooks, AI coach, subscriptions, contact cache, sync logs, voice profiles.
- **Authentication:** Google OAuth (primary) + email/password + bcrypt. JWT cookies via jose. Turnstile bot protection (env-ready).
- **Integrations:** GoHighLevel, OpenAI (Whisper + GPT-4o), Supabase Storage, Stripe, Resend, Google OAuth.
- **AI Development Workforce:** 20 Claude agents (8 engineering, 4 product, 8 testing) + 4 codified skills + Jules + CodeRabbit.

**Gaps:** No real-time features (WebSockets). No mobile app. Some dead/unused tables in schema.

---

## 6. Infrastructure (BUILT — 85%)

- **Cloud Hosting:** Railway (Nixpacks, auto-deploy, health checks at /health with 300s timeout, auto-restart with 3 retries). Railway billing active.
- **DevOps:** Git push = deploy (zero-step). Drizzle migrations via npm run db:push. 14 utility scripts for tenant management, badge evaluation, sync triggers, Stripe setup.
- **CI/CD:** GitHub Actions (PR type check + build, nightly 2 AM CST autonomous build + failure notifications).
- **Monitoring (3-layer):**
  - Sentry -- Active on backend + frontend. 10% trace sampling in prod. Error replay enabled.
  - PostHog -- posthog-node installed, custom trackEvent() writes to user_events table.
  - LangSmith -- AI observability via env vars. Auto-traces OpenAI calls.
- **AI Code Quality Pipeline:** Cursor + Claude, CLAUDE.md, REBUILD-PLAN.md, 20 agents, 4 skills, Jules, CodeRabbit, .cursor/rules/gunner.mdc.
- **Security:** Helmet, express-rate-limit, JWT auth (jose), bcrypt, Turnstile (env-ready), webhook signature verification.

**Gaps:** No staging environment. No uptime monitoring (Pingdom/Better Uptime). No automated DB backups beyond Railway built-in. PostHog frontend SDK not wired.

---

## 7. Testing (AGENT-POWERED — 15%)

- **Unit Testing:** Vitest configured, no test files written yet.
- **Integration Testing:** None automated. Manual testing via live NAH tenant.
- **Bug Fixing:** Sentry alerts + CodeRabbit PR reviews + Jules autonomous fixing + 8 testing Claude agents.
- **Performance Testing:** Performance Benchmarker agent available, no benchmarks run.
- **Beta Testing:** NAH (tenant 1) live with 3,263+ calls. Kitty Hawk onboarding next.

**Gaps:** Zero automated test coverage. Agent testing is reactive, not CI-integrated. Priority: grading pipeline tests, auth flow tests, webhook handler tests.

---

## 8. Launch (IN PROGRESS — 50%)

- **Landing Page:** Live with industry-specific pages. Deployed on Railway.
- **Product Hunt:** Not launched yet.
- **Beta Users:** NAH (tenant 1) is live with 3,263 calls.
- **Early Adopters:** Kitty Hawk (450029) onboarding. Apex (540044) demo.
- **Public Release:** Not yet. Domain getgunner.ai reserved but DNS not flipped to Railway.

**Gaps:** No Product Hunt launch planned. No public marketing site separate from app. DNS still pointing elsewhere.

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

- **User Onboarding:** 4-step flow (welcome -> CRM -> team -> done).
- **Email Automation:** Daily digest, grade alerts via Resend. Loops env-ready but not fully implemented.
- **Customer Support:** None built. No in-app chat, no help center.
- **Feature Adoption:** Gamification (badges, streaks, XP, leaderboards). AI Coach for in-app coaching.
- **Churn Reduction:** outreach_history table exists. Weekly digest job running.

**Gaps:** No help center. No in-app NPS survey. Loops drip sequences not implemented. No churn prediction.

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
| Design         | 80%    | Low -- iterate in code                               |
| Development    | 90%    | Medium -- ongoing feature work, 20 AI agents active  |
| Infrastructure | 85%    | Low -- operational, needs staging + uptime monitoring |
| Testing        | 15%    | Medium -- agents cover QA, need CI test suite        |
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

## Recommended Execution Order (Next 90 Days)

1. **Acquisition + Distribution** -- Get found. GHL Marketplace listing, SEO blog, community presence.
2. **Launch** -- Flip DNS to Railway. Plan a Product Hunt launch.
3. **Conversion** -- Pricing page, explicit free trial, upgrade prompts.
4. **Retention** -- Finish Loops drip emails, add in-app help/support.
5. **Revenue** -- Annual plans, upsell prompts at tier limits.
6. **Testing** -- Core pipeline tests (grading, auth, webhooks) before scaling.

---

## Change Log

| Date | Stage | Change | By |
|------|-------|--------|----|
| 2026-03-10 | All | Initial lifecycle document created | Cursor + Claude |
