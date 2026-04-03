# Gunner AI

AI-powered revenue intelligence layer for wholesale real estate teams. Grades every sales call, manages inventory, scores leads, and coaches reps — all powered by Claude AI with your team's playbook.

Built on Next.js 14, Supabase, Go High Level, and Anthropic Claude.

---

## What it does

- **Call grading** — Every call graded automatically by Claude AI with your team's scripts and standards
- **Role Assistant** — AI assistant with 74 tools: send SMS, create tasks, log offers, analyze deals, and more
- **Property inventory** — Full deal management with 200+ fields, deal intel extraction, buyer matching
- **AI coaching** — Personalized coaching per rep based on their performance profile and your playbook
- **KPI dashboard** — Score trends, pipeline health, lead source ROI, team leaderboard
- **Day Hub** — Morning planner with tasks, appointments, inbox, and KPIs
- **Knowledge system** — Upload scripts, playbooks, training materials. AI uses them for grading and coaching.
- **Semantic search** — pgvector embeddings for intelligent playbook retrieval

---

## Tech stack

| Layer | Tech | Entry point |
|---|---|---|
| Framework | Next.js 14 App Router | `next.config.js` |
| Database | PostgreSQL via Supabase + pgvector | `prisma/schema.prisma` |
| ORM | Prisma | `lib/db/client.ts` |
| Auth | NextAuth.js v4 | `lib/auth/config.ts` |
| AI | Anthropic Claude (Sonnet 4.6) | `lib/ai/` |
| Embeddings | OpenAI text-embedding-3-small | `lib/ai/embeddings.ts` |
| CRM | Go High Level OAuth | `lib/ghl/client.ts` |
| Deploy | Railway + Supabase | `railway.toml` |

---

## Project structure

```
app/
  (auth)/                 Login, register, onboarding, password reset
  (tenant)/[tenant]/      All tenant-scoped pages:
    tasks/                  Day Hub (landing page)
    calls/                  Calls list + call detail (5-tab layout)
    inventory/              Property list + property detail (research tab, buyers, outreach)
    kpis/                   KPI dashboard with score trends + milestones
    ai-logs/                Admin AI interaction logs
    ai-coach/               Full-page AI coaching
    dashboard/              Overview dashboard
    buyers/                 Disposition hub (hidden from nav)
    roi/                    Lead source ROI (hidden from nav)
    training/               Training hub (hidden from nav)
    settings/               8-tab settings (team, integrations, pipeline, calls, workflows, markets, inventory, knowledge)
  api/                    API routes:
    ai/                     Assistant, coach, outreach action
    admin/                  Knowledge, profiles, AI logs, playbook loader, embeddings
    ghl/                    Pipelines, calendars, actions
    properties/             Property CRUD, blast, outreach, enrichment
    [tenant]/               Tenant-scoped: calls, tasks, day hub
    tenants/                Config, invite, register
    webhooks/               GHL webhooks, Stripe webhooks, buyer response

lib/
  ai/                     AI core:
    grading.ts              Call grading (7-layer playbook context)
    context-builder.ts      Central knowledge assembly (exact + semantic search)
    assistant-tools.ts      74 Claude tool definitions
    coach.ts                AI coaching engine
    embeddings.ts           pgvector embedding generation + search
    extract-deal-intel.ts   Deal intelligence extraction from transcripts
    generate-user-profiles.ts  Weekly profile auto-generation
    scoring.ts              True Conversion Probability (TCP) ensemble model
    enrich-property.ts      AI property enrichment
    log.ts                  AI call logging
    transcribe.ts           Deepgram transcription
    industry-knowledge.ts   Fallback industry knowledge
  ghl/                    GHL API client + webhook handlers
  auth/                   NextAuth config + session helpers
  db/                     Prisma client + RLS helpers
  types/                  TypeScript type definitions
    deal-intel.ts           Full deal intelligence schema (100+ fields, 9 categories)
  gamification/           XP, badges, leaderboard
  workflows/              Workflow engine (triggers + actions)
  gates/                  High-stakes action approval gates
  stripe/                 Stripe integration (pricing, checkout, webhooks)

components/
  ui/                     Shared: top-nav, dashboard, coach sidebar, toaster
  calls/                  Call list + call detail (coaching, transcript, next steps, property tabs)
  inventory/              Property list, property detail, property form
  settings/               Settings client (8 tabs)
  ai-coach/               AI coach chat UI

scripts/                  Cron jobs + utilities:
  poll-calls.ts             Cron: poll GHL for new calls (every minute)
  generate-profiles.ts      Cron: weekly user profile generation (Sunday 3am)
  kpi-snapshot.ts           Cron: daily KPI snapshot (midnight)
  audit.ts                  Cron: daily self-audit (2am)
  sync-buyers.ts            Sync buyers from GHL
  sync-calls.ts             Sync call data
  seed.ts                   Dev seed data
  seed-markets.ts           Seed market data

prisma/
  schema.prisma           Full DB schema (30+ models)
  migrations/             20 migration files

docs/
  AI-ARCHITECTURE-PLAN.md   Full AI intelligence architecture (74 actions, 6 knowledge layers)
  ARCHITECTURE.md           System architecture overview
  DECISIONS.md              Architectural decisions log
  DESIGN.md                 UI design system
  MODULES.md                Module documentation
  TECH_STACK.md             Detailed tech stack documentation
  START_HERE.md             Claude Code prompt guide
  NAH-Wholesale-Playbook/   42 playbook files (scripts, training, objection handling)
```

---

## Key files for Claude Code

| File | Purpose |
|---|---|
| `CLAUDE.md` | Non-negotiable rules, hard technical rules, session protocol |
| `PROGRESS.md` | Session log, current status, known bugs, next session instructions |
| `AGENTS.md` | Agent conventions and standards |

---

## Local setup

```bash
git clone https://github.com/c7lavinder/Gunner-Claude.git
cd Gunner-Claude
npm install
cp .env.example .env.local   # Fill in all values
npm run db:generate           # Generate Prisma client
npm run db:migrate            # Run migrations
npm run dev                   # Start dev server at localhost:3000
```

---

## Deployment

Railway auto-deploys on every push to `main`. Config in `railway.toml`:
- Build: `prisma migrate deploy && next build`
- Cron: poll-calls (1min), kpi-snapshot (daily), audit (daily), profile-gen (weekly)

---

## Environment variables

See `.env.example` for all required variables with descriptions.

Key variables:
- `DATABASE_URL` / `DIRECT_URL` — Supabase PostgreSQL
- `ANTHROPIC_API_KEY` — Claude AI
- `OPENAI_API_KEY` — Embeddings (optional, enables semantic search)
- `GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` — Go High Level OAuth
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL` — Auth
- `DEEPGRAM_API_KEY` — Call transcription
