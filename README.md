# Gunner AI

AI-powered command center for real estate wholesaling teams. Built on Next.js 14, Supabase, and Go High Level.

---

## What it does

- **Call grading** — every call graded automatically by Claude AI the moment it ends
- **Inbox** — unread messages and missed calls from GHL, live
- **Appointments** — daily appointment view pulled live from GHL
- **Task list** — configurable, synced with GHL tasks
- **Property inventory** — property-based (not contact-based), disposition-focused
- **KPIs** — auto-populated from inventory and calls, per-role
- **AI Coach** — Claude-powered coach that knows your call scores, pipeline, and industry
- **GHL actions** — send SMS, add notes, create tasks, change pipeline stage — all from the app

---

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | NextAuth.js v5 |
| AI | Anthropic Claude API |
| GHL | OAuth Marketplace App |
| Deploy | Railway |

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/gunner-ai.git
cd gunner-ai
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`. See `.env.example` for descriptions.

### 3. Set up the database

Create a project at [supabase.com](https://supabase.com), copy the connection strings, then:

```bash
npm run db:generate    # generate Prisma client
npm run db:migrate     # run migrations
npm run db:seed        # optional: seed dev data
```

Then run the RLS policies in Supabase SQL Editor:
```bash
# Copy and paste contents of prisma/rls-policies.sql into Supabase SQL Editor
```

### 4. Set up GHL Marketplace App

1. Go to GHL → Settings → Developer → Apps
2. Create a new app with redirect URI: `http://localhost:3000/api/auth/ghl/callback`
3. Copy the Client ID and Client Secret to your `.env.local`
4. Set required scopes: `contacts.readonly contacts.write opportunities.readonly opportunities.write conversations.readonly conversations.write calls.readonly tasks.readonly tasks.write calendars.readonly`

### 5. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000/register` to create your first tenant.

---

## Deployment (Railway)

### 1. Push to GitHub

```bash
git add .
git commit -m "initial commit"
git push origin main
```

### 2. Create Railway project

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select your repo

### 3. Add environment variables

Add all variables from `.env.example` to Railway's Environment Variables panel.

### 4. Deploy

Railway auto-deploys on every push to `main`. The `railway.toml` handles:
- Running DB migrations before each deploy
- Starting the Next.js server
- Daily self-audit cron at 2am UTC
- Daily KPI snapshot cron at midnight UTC

---

## Project structure

```
app/
  (auth)/               login, register, onboarding
  (tenant)/[tenant]/    all tenant-scoped pages
  api/                  all API routes

lib/
  ghl/                  GHL API client + webhook handlers
  ai/                   Claude grading + coach
  auth/                 NextAuth config
  db/                   Prisma client

components/
  ui/                   shared components (sidebar, topbar, etc.)
  calls/                call grading UI
  inventory/            property cards + detail
  tasks/                task list
  inbox/                GHL inbox
  appointments/         GHL appointments
  kpis/                 KPI dashboard
  ai-coach/             AI coach chat

scripts/
  audit.ts              self-audit agent (runs daily)
  kpi-snapshot.ts       daily KPI snapshot (runs daily)
  seed.ts               dev seed data

prisma/
  schema.prisma         full DB schema
  rls-policies.sql      Supabase RLS policies
```

---

## Multi-tenant architecture

- Each client gets a unique slug: `gunnerai.com/{slug}/dashboard`
- Tenant isolation enforced at two levels:
  1. Middleware — checks session's `tenantId` matches URL slug
  2. Supabase RLS — every DB query filtered by `tenant_id` at DB level
- Each tenant has their own GHL sub-account connected via OAuth

---

## Self-audit system

The Claude-powered self-audit agent runs daily:

```bash
npm run audit   # run manually
```

It checks:
- TypeScript errors
- ESLint violations
- Missing environment variables
- AI code review (security, tenant isolation, error handling)

Results logged to `audit_logs` table. Critical issues printed to console.

---

## User roles

| Role | Access |
|---|---|
| Owner | Everything |
| Admin | Everything except billing |
| Team Lead | Team calls + all properties + team KPIs |
| Acquisition Manager | Own calls + assigned lead managers' calls |
| Lead Manager | Own calls + assigned properties only |
| Disposition Manager | All inventory + own calls |

---

## Key decisions

- **Properties not contacts** — inventory is property-based; one seller can own multiple properties
- **Auto-grading** — every call graded immediately when it ends, no manual trigger
- **GHL as source of truth for contacts** — we store properties, GHL stores contacts
- **Pipeline stage triggers** — a specific GHL pipeline stage creates a property in inventory

---

## Environment variables

See `.env.example` for all required variables with descriptions.
