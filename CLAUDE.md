# CLAUDE.md — Gunner Codebase Briefing

Read this first. Every time. Then read `REBUILD-PLAN.md` for the full spec.
Then read `BUILD-STATUS.md` for what's done and what remains.

## What Is This?

Gunner (getgunner.ai) is a multi-tenant AI-powered sales call coaching platform.
- Pulls calls from GoHighLevel (GHL) CRM every 5 minutes
- Downloads recordings, transcribes with OpenAI Whisper, grades with GPT-4
- Shows leaderboards, scorecards, coaching insights to sales teams
- Four-layer playbook architecture drives all UI, AI, and algorithms

## Stack

- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui (client/)
- **Backend:** Node.js + Express + tRPC + TypeScript (server/)
- **Database:** PostgreSQL on Railway (Drizzle ORM — 76 tables in drizzle/schema.ts)
- **File Storage:** Supabase Storage (bucket: gunner-recordings)
- **AI:** OpenAI (Whisper for transcription, GPT-4o for grading/coaching, SSE streaming)
- **Email:** Resend (transactional) + Loops (drip sequences)
- **Observability:** Sentry (backend + frontend), PostHog (analytics), LangSmith (AI traces)
- **Payments:** Stripe
- **Security:** Helmet headers, express-rate-limit, JWT auth
- **Linting:** ESLint + typescript-eslint + eslint-config-prettier
- **Deployment:** Railway (auto-deploys on push to manus-migration branch)

## Active Branch

**Always work on `manus-migration` branch. Never touch `main`.**

## Four-Playbook Architecture

This is the core design pattern — understand it before touching anything.

1. **Software Playbook** — Universal rules for any sales coaching platform (action types, grade scale, XP rewards, level thresholds). Defined in `server/services/playbooks.ts` as `SOFTWARE_PLAYBOOK`.
2. **Industry Playbook** — What's true for a specific industry (RE Wholesaling: rubrics, roles, call types, stages, terminology, roleplay personas, grading philosophy). Stored in `industry_playbooks` DB table. Seeded from `server/seeds/reWholesaling.ts`.
3. **Tenant Playbook** — Company-specific config (CRM connection, stage mappings, markets, lead sources, algorithm overrides). Stored in `tenant_playbooks` DB table.
4. **User Playbook** — Per-person intelligence (strengths, growth areas, grade trend, communication style, instructions). Stored in `user_playbooks` DB table. Auto-updated after grading.

Resolution order: User > Tenant > Industry > Software (most specific wins).

## Directory Structure

```
gunner/
├── client/
│   ├── src/
│   │   ├── pages/                    — All frontend pages
│   │   │   ├── CallInbox.tsx
│   │   │   ├── Inventory.tsx
│   │   │   ├── KpiPage.tsx
│   │   │   ├── Team.tsx
│   │   │   ├── Training.tsx
│   │   │   ├── Today.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── Playbook.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── Login.tsx / Signup.tsx / GoogleAuthCallback.tsx
│   │   │   ├── Onboarding.tsx
│   │   │   └── landing/
│   │   │       ├── Landing.tsx
│   │   │       ├── IndustryLanding.tsx
│   │   │       └── industryConfigs/
│   │   ├── components/
│   │   │   ├── ui/                   — 54+ shadcn components
│   │   │   ├── actions/              — ActionConfirmDialog, ActionResultCard, SenderPicker
│   │   │   ├── layout/              — DashboardLayout, AuthGuard
│   │   │   ├── AiCoach.tsx
│   │   │   ├── CommandPalette.tsx    — Cmd+K global search
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── BadgeUnlockNotification.tsx
│   │   │   └── SearchableDropdown.tsx, ResponsiveTable.tsx (in ui/)
│   │   ├── hooks/
│   │   │   ├── useAuth.tsx           — Auth context + session
│   │   │   ├── useTenantConfig.ts    — All labels from playbook (used everywhere)
│   │   │   ├── usePlaybook.ts        — Playbook data access
│   │   │   ├── useActions.ts         — Universal CRM action execution
│   │   │   └── useMobile.tsx
│   │   ├── lib/
│   │   │   ├── trpc.ts              — tRPC client setup
│   │   │   └── utils.ts
│   │   ├── App.tsx                   — Router + layout
│   │   ├── main.tsx                  — Entry point (Sentry ErrorBoundary wraps App)
│   │   └── index.css                — Tailwind + design tokens
│   └── index.html
│
├── server/
│   ├── _core/                        — Core infrastructure
│   │   ├── index.ts                  — Express server startup, middleware, SSE endpoint
│   │   ├── db.ts                     — Drizzle database connection
│   │   ├── env.ts                    — All environment variables (never hardcode)
│   │   ├── context.ts                — tRPC context + JWT auth verification
│   │   ├── llm.ts                    — OpenAI chat completion + streaming
│   │   ├── storage.ts                — Supabase file upload/download/delete
│   │   └── email.ts                  — Resend email client
│   │
│   ├── routers/                      — tRPC routers (split from old monolith)
│   │   ├── index.ts                  — Merges all routers into appRouter
│   │   ├── auth.ts                   — Login, signup, Google OAuth, session
│   │   ├── calls.ts                  — Call CRUD, grading, inbox
│   │   ├── inventory.ts              — Property/asset CRUD, stages, buyers
│   │   ├── team.ts                   — Team member management
│   │   ├── gamification.ts           — XP, badges, streaks, leaderboard
│   │   ├── kpi.ts                    — KPI data entry + dashboards
│   │   ├── training.ts               — Materials, roleplay, coaching sessions
│   │   ├── ai.ts                     — Unified AI endpoints
│   │   ├── playbook.ts               — Playbook CRUD + overrides
│   │   ├── actions.ts                — CRM write-back actions
│   │   ├── settings.ts               — Workspace config, CRM setup, GHL OAuth
│   │   └── today.ts                  — Day Hub (tasks, SMS, appointments)
│   │
│   ├── services/                     — Business logic
│   │   ├── grading.ts                — AI call grading pipeline (uses playbook philosophy)
│   │   ├── gamification.ts           — Badge evaluation, XP awards, streak tracking
│   │   ├── playbooks.ts              — Playbook assembly + resolution (4 layers)
│   │   ├── callIngestion.ts          — CRM polling for calls + opportunities
│   │   ├── notifications.ts          — Daily digest, grade alerts (Resend)
│   │   ├── scheduledJobs.ts          — Weekly digest, reconciliation, user profile updates
│   │   ├── eventTracking.ts          — user_events collection + flushing
│   │   ├── ghlOAuth.ts               — GHL OAuth flow, token management, webhook registration
│   │   ├── auth.ts                   — Password hashing, JWT creation
│   │   ├── stripe.ts                 — Stripe billing integration
│   │   └── index.ts
│   │
│   ├── crm/                          — CRM abstraction layer
│   │   ├── adapter.ts                — CRM adapter interface (any CRM)
│   │   ├── index.ts
│   │   └── ghl/
│   │       └── ghlAdapter.ts         — GoHighLevel implementation
│   │
│   ├── algorithms/                   — Sorting algorithms with config objects
│   │   ├── inventorySort.ts          — Asset urgency sort (4 tiers)
│   │   ├── buyerMatch.ts             — Buyer matching score (0-100)
│   │   ├── taskSort.ts               — Role-specific task prioritization
│   │   └── index.ts
│   │
│   ├── middleware/                    — Express middleware
│   │   ├── auth.ts                   — JWT verification middleware
│   │   ├── rateLimiter.ts            — Rate limiting (login, signup, API)
│   │   ├── webhook.ts                — GHL webhook handler + retry queue + dedup
│   │   └── stripeWebhook.ts          — Stripe webhook handler
│   │
│   └── seeds/                        — Industry playbook seed data
│       ├── reWholesaling.ts          — RE Wholesaling playbook (roles, rubrics, personas, philosophy)
│       ├── industries.ts             — Industry registry
│       ├── seedPlaybooks.ts          — Upsert playbooks to DB
│       └── startupMigrations.ts      — Idempotent DDL (runs every deploy)
│
├── shared/                           — Shared types (frontend + backend)
│   └── types.ts                      — Playbook, action, rubric, persona types
│
├── drizzle/
│   ├── schema.ts                     — All 76 DB tables (source of truth)
│   ├── relations.ts                  — Drizzle relation definitions
│   └── migrations/                   — Generated migrations
│
├── REBUILD-PLAN.md                   — Full rebuild specification (THE SPEC)
├── BUILD-STATUS.md                   — What's done + what remains (THE STATUS)
├── eslint.config.js                  — ESLint + typescript-eslint + prettier
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Files (Accurate Paths)

| File | Purpose |
|---|---|
| `server/_core/env.ts` | All environment variables (never hardcode, never use raw process.env) |
| `server/_core/index.ts` | Express server, Helmet, Sentry init, SSE streaming endpoint, startup |
| `server/_core/llm.ts` | OpenAI chat completion + `chatCompletionStream` for SSE |
| `server/_core/storage.ts` | Supabase Storage file upload/download/delete |
| `server/_core/context.ts` | tRPC context creation + JWT session verification |
| `server/routers/index.ts` | Merges all 12 routers into `appRouter` |
| `server/services/grading.ts` | AI grading pipeline (loads rubric + grading philosophy from playbook) |
| `server/services/gamification.ts` | XP, badges (closer, improvement, volume), streaks, confetti |
| `server/services/playbooks.ts` | `SOFTWARE_PLAYBOOK` + `getIndustryPlaybook` + `getTenantPlaybook` + `getUserPlaybook` |
| `server/services/callIngestion.ts` | CRM polling (calls every 5min, opportunities every 10min) |
| `server/services/scheduledJobs.ts` | Weekly digest, reconciliation, user profile aggregation |
| `server/services/ghlOAuth.ts` | GHL OAuth flow, token refresh, webhook registration |
| `server/middleware/webhook.ts` | Webhook handler + eventId dedup + retry queue (4 attempts, backoff) |
| `server/algorithms/inventorySort.ts` | 4-tier urgency sort with config object |
| `server/algorithms/buyerMatch.ts` | Buyer matching score (market filter + 5-signal score) |
| `server/crm/ghl/ghlAdapter.ts` | GHL API adapter (sendSMS, addNote, createTask, etc.) |
| `server/seeds/reWholesaling.ts` | RE Wholesaling seed (7 rubrics, 6 call types, 4 roles, personas, philosophy) |
| `drizzle/schema.ts` | All 76 DB tables — source of truth |
| `shared/types.ts` | Shared TypeScript interfaces for playbooks, actions, rubrics |
| `client/src/hooks/useTenantConfig.ts` | Frontend hook — reads all labels/config from playbook |
| `client/src/components/actions/ActionConfirmDialog.tsx` | Universal action confirmation (every CRM action goes through this) |

## Database

- PostgreSQL on Railway
- ORM: Drizzle — always update `drizzle/schema.ts` + run startup migrations
- **76 tables** in schema (including playbook tables, user_events, ai_suggestions, playbook_insights, user_voice_samples, user_voice_profiles)
- Active tenants: ID=1 (New Again Houses), ID=450029 (NAH Kitty Hawk), ID=540044 (Apex Property Solutions demo)
- Startup migrations run automatically on every deploy (`server/seeds/startupMigrations.ts`)

## Environment Variables

All vars set on Railway. Access via `ENV` object in `server/_core/env.ts`.

Key vars: DATABASE_URL, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, LOOPS_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GHL_CLIENT_ID, GHL_CLIENT_SECRET, JWT_SECRET, SENTRY_DSN, POSTHOG_API_KEY, LANGSMITH_API_KEY, VITE_SENTRY_DSN.

## CRM Sync Architecture

Three layers of data synchronization:
1. **Webhooks (real-time):** GHL pushes events → `server/middleware/webhook.ts` processes with eventId dedup + retry queue (1m, 5m, 15m, 1h backoff, max 4 attempts)
2. **Polling (safety net):** Calls every 5 min, opportunities every 10 min via `server/services/callIngestion.ts`
3. **Reconciliation (catch-all):** Daily job compares Gunner vs CRM data, auto-imports missed calls via `server/services/scheduledJobs.ts`

## Auth

- Google OAuth (primary) + email/password (secondary)
- JWT cookies (`auth_token`), verified in `server/_core/context.ts`
- Rate limiting on login (10/15min), signup (5/hr), Google callback (15/15min)
- **Known issue:** Google OAuth login loop — deferred, needs debugging

## Gamification

- XP system (call base + grade bonus + improvement + badge earned)
- 25 levels (Rookie → Hall of Fame, 0 → 350K XP)
- Hot streaks (consecutive C+ grades) + consistency streaks
- Closer badges, improvement XP, playbook-driven badge definitions
- Confetti + toast notifications on badge unlock (`BadgeUnlockNotification.tsx`)

## Rules

1. Never commit to `main` — only `manus-migration`
2. Never hardcode credentials — always use `ENV` from `server/_core/env.ts`
3. Never hardcode tenant IDs — always multi-tenant safe
4. Run `npx tsc --noEmit` before pushing — must be 0 errors
5. Startup migrations are idempotent — safe to re-run on every deploy
6. All CRM actions go through `ActionConfirmDialog` — no silent actions
7. Every algorithm has a CONFIG OBJECT at the top of its file — tune config, not logic
8. Labels come from playbooks, not hardcoded strings

## Deploy

Push to `manus-migration` → Railway auto-deploys → live in ~3 minutes.
Staging URL: https://gunner-app-production.up.railway.app
Health check: `GET /health` returns `{"status":"ok"}`

## What to Read Next

1. **`REBUILD-PLAN.md`** — The full specification. Every architecture decision, page spec, algorithm, trigger, and playbook mapping.
2. **`BUILD-STATUS.md`** — Exactly what's been built and what remains. Read this to avoid re-building existing features.

## Owner

Corey Lavinder — non-technical. Explain changes in plain English. Never ask unnecessary questions — read files first, then act.
