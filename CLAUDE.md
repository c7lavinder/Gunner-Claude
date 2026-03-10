# CLAUDE.md — Gunner Codebase Briefing

Read this first. Every time. It will save you significant time.

## What Is This?
Gunner (getgunner.ai) is a multi-tenant AI-powered sales call coaching platform.
- Pulls calls from GoHighLevel (GHL) CRM every 5 minutes
- Downloads recordings, transcribes with OpenAI Whisper, grades with AI
- Shows leaderboards, scorecards, coaching insights to sales teams

## Stack
- **Frontend:** React + TypeScript + Vite + TailwindCSS (client/)
- **Backend:** Node.js + Express + TypeScript (server/)
- **Database:** PostgreSQL on Railway (Drizzle ORM — drizzle/ directory)
- **File Storage:** Supabase Storage (bucket: gunner-recordings)
- **AI:** OpenAI (Whisper for transcription, GPT-4 for grading/coaching)
- **Email:** Resend (transactional) + Loops (drip sequences)
- **Observability:** Sentry (errors) + PostHog (analytics) + LangSmith (AI traces)
- **Payments:** Stripe
- **Deployment:** Railway (auto-deploys on push to manus-migration branch)

## Active Branch
**Always work on `manus-migration` branch. Never touch `main`.**

## Key Directories
```
client/src/pages/     — All frontend pages
client/src/components/ — Reusable UI components
server/               — All backend routes and services
server/_core/         — Core utilities (auth, db, env, AI)
server/routers.ts     — All API endpoints (tRPC)
drizzle/schema.ts     — Database schema (source of truth)
drizzle/migrations/   — DB migration files
```

## Key Files
- `server/_core/env.ts` — All environment variables (never hardcode)
- `server/_core/voiceTranscription.ts` — OpenAI Whisper transcription
- `server/storage.ts` — Supabase Storage file upload/download
- `server/ghlService.ts` — GHL sync, call ingestion, recording upload
- `server/grading.ts` — AI call grading pipeline
- `server/emailService.ts` — Resend email sending
- `server/loops.ts` — Loops drip email sequences
- `drizzle/schema.ts` — All 68 DB tables defined here

## Database
- PostgreSQL on Railway (internal: gunner-postgres.railway.internal:5432)
- ORM: Drizzle — always update schema.ts + run migrations, never raw ALTER TABLE
- NAH tenant ID: 1 (only real tenant — all others are test data)
- 3,263 calls in DB for NAH

## Environment Variables
All vars are set on Railway. Key ones:
- DATABASE_URL — Railway Postgres internal URL
- OPENAI_API_KEY — Whisper transcription + GPT grading
- SUPABASE_SERVICE_KEY — file storage
- RESEND_API_KEY / RESEND_FROM_EMAIL
- LOOPS_API_KEY
- STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (OAuth login)
- GHL_CLIENT_ID / GHL_CLIENT_SECRET
- JWT_SECRET
- SENTRY_DSN / POSTHOG_API_KEY / LANGSMITH_API_KEY

## GHL Sync
- Polls every 5 minutes via `startPolling(5)` in server/_core/index.ts
- Uses ghlApiKey from tenant crmConfig (not OAuth tokens)
- NAH GHL location: hmD7eWGQJE7EVFpJxj4q

## Auth
- Google OAuth (primary login method)
- JWT cookies for session management
- Cookie name: auth_token
- Session verified via verifySessionToken() in server/_core/sdk.ts

## Rules
1. Never commit to `main` — only `manus-migration`
2. Never hardcode credentials — always use process.env.*
3. Never hardcode tenant IDs — always multi-tenant safe
4. Run `npx tsc --noEmit` before pushing — must be 0 errors
5. After schema changes: run `npm run db:generate` then `npm run db:migrate`
6. Staging URL: https://gunner-app-production.up.railway.app
7. Live URL: https://getgunner.ai (DNS not yet flipped — do not touch)

## Deploy
Push to `manus-migration` → Railway auto-deploys → live in ~3 minutes.
No manual deploy steps needed.

## Common Tasks
- **Fix a UI bug:** Edit file in client/src/pages/ or client/src/components/
- **Fix an API bug:** Edit server/routers.ts or the relevant server/*.ts file
- **Add a DB column:** Edit drizzle/schema.ts → run db:generate → db:migrate
- **Check DB:** Query via Railway Postgres (ask Xhaka for connection details)

## Available Skills (use these)
- `.claude/skills/fix-bug.md` — step-by-step bug fixing workflow
- `.claude/skills/add-feature.md` — plan + build new features
- `.claude/skills/review-code.md` — code review before pushing
- `.claude/skills/deploy-check.md` — pre-deploy checklist

## Plan Mode — Required for Complex Work
For anything that touches more than 2 files OR involves DB schema changes:
1. Switch to Plan Mode first (bottom-left in Cursor)
2. Describe what you want
3. Review the plan
4. Then switch to build mode and execute
This saves hours of rework. Never skip planning for complex builds.
