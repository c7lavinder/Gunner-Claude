# CLAUDE.md — Gunner AI

> Read this entire file before writing a single line of code.
> Rules + orientation only. For status → PROGRESS.md. For architecture → docs/ARCHITECTURE.md.

---

## What this is

**Gunner AI** — multi-tenant SaaS command center for real estate wholesaling teams in the US.
Backed by Go High Level (GHL). Empowers teams through accountability, training, and AI automation.

The three things it does:
1. Grades every sales call automatically using Claude AI the moment it ends
2. Manages wholesale properties (inventory) with KPI auto-population
3. Provides an AI coach that knows each user's scores, pipeline, and progress

---

## Orientation — read these files in order for any session

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules, constraints, orientation (this file) |
| `PROGRESS.md` | What's built, what's broken, what's next |
| `docs/ARCHITECTURE.md` | System design, data flow, key decisions |
| `docs/DECISIONS.md` | Why we chose X over Y — the decision log |
| `docs/MODULES.md` | Every module: inputs, outputs, dependencies |
| `prisma/schema.prisma` | Database — single source of truth |
| `types/roles.ts` | Permission system — single source of truth |

---

## Hard rules — never violate

### Security
- Every API route must call `getServerSession()` before touching any data
- Every DB query must include `tenantId` — no exceptions, ever
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` to the client
- Verify GHL webhook `locationId` maps to a real tenant before processing

### Architecture
- All GHL API calls go through `lib/ghl/client.ts` — never fetch GHL directly from components
- All Claude API calls go through `lib/ai/` — never call Anthropic SDK directly from routes
- All env vars go through `config/env.ts` — never read `process.env` directly
- Server components fetch data. Client components display it. No exceptions.

### Code quality
- TypeScript strict mode — no `any`, no `@ts-ignore`, no `as unknown as X`
- Every async function needs try/catch — errors log to `audit_logs` table
- No TODO comments in committed code — add to PROGRESS.md instead

### Database
- Properties are inventory, not contacts — one seller can own multiple properties
- Tenant isolation enforced at TWO levels: middleware slug check + Supabase RLS
- Never run a migration on production without testing on dev first
- Never query without `tenantId` — you'll leak cross-tenant data

---

## What NOT to do

- Do NOT add npm packages without checking `package.json` first
- Do NOT create DB tables without updating `schema.prisma` AND `rls-policies.sql`
- Do NOT add a new page without adding it to `components/ui/sidebar-nav.tsx`
- Do NOT hardcode tenant-specific data — use `tenants.config` JSON or config tables
- Do NOT call `db.user.findMany()` without `tenantId` filter
- Do NOT add a GHL call without using `getGHLClient(tenantId)` factory (handles token refresh)
- Do NOT remove the `gradingStatus: 'PROCESSING'` update before grading — prevents duplicate runs

---

## Tenant context flow

URL /{slug}/page → middleware.ts validates slug vs session → injects headers →
server component reads session → all DB queries filter by tenantId →
Supabase RLS double-checks at DB level

---

## Role hierarchy

OWNER → ADMIN → TEAM_LEAD → ACQUISITION_MANAGER → LEAD_MANAGER
                           → DISPOSITION_MANAGER

Full permissions in `types/roles.ts`. Use `hasPermission(role, permission)` for all checks.
When adding a feature, define its permission in `types/roles.ts` first.

---

## Stack — locked

| Layer | Tech | Entry point |
|---|---|---|
| Framework | Next.js 14 App Router | next.config.js |
| Database | PostgreSQL via Supabase | prisma/schema.prisma |
| ORM | Prisma | lib/db/client.ts |
| Auth | NextAuth.js v5 | lib/auth/config.ts |
| AI | Anthropic claude-opus-4-6 | lib/ai/ |
| GHL | OAuth Marketplace App | lib/ghl/client.ts |
| Styling | Tailwind CSS | tailwind.config.ts |
| Deploy | Railway + Supabase | railway.toml |

---

## How to start any coding session

1. Read PROGRESS.md — know where we left off and what's broken
2. Read the relevant section of docs/MODULES.md for the thing you're building
3. Check docs/DECISIONS.md before making any architectural choice
4. Build the thing
5. Update PROGRESS.md before ending the session — always
