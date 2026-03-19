# CLAUDE.md — Gunner AI

> Read this ENTIRE file before writing a single line of code.
> Rules + orientation only. For status → PROGRESS.md. For architecture → docs/ARCHITECTURE.md.
> Last updated: Phase 1 hardening — lessons from prior failed build integrated.

---

## What this is

**Gunner AI** — multi-tenant SaaS command center for real estate wholesaling teams in the US.
Backed by Go High Level (GHL). Empowers teams through accountability, training, and AI automation.

The three things it does:
1. Grades every sales call automatically using Claude AI the moment it ends
2. Manages wholesale properties (inventory) with KPI auto-population
3. Provides an AI coach that knows each user's scores, pipeline, and progress

---

## NON-NEGOTIABLE RULES — learned from prior failed build

These rules exist because a previous version of this product failed due to these exact mistakes.
Violating any of these is grounds to stop and revert.

### Rule 1 — The Data Contract Rule (Settings)

**The single biggest failure mode: building settings UI that doesn't actually control what the live pages read.**

Before building ANY settings field or tab:
1. Define the exact DB field it writes to (table, column, type)
2. Define the exact query the live page uses to read it
3. Confirm both are identical — same field, same table, same format

If you cannot answer both questions before writing the UI, DO NOT BUILD IT.

Every settings field must have a comment like:
```
// WRITES TO: tenants.property_trigger_stage (string)
// READ BY: lib/ghl/webhooks.ts → handleOpportunityStageChanged()
```

### Rule 2 — No Text Inputs for GHL Mappings

**Users cannot type GHL stage names, field keys, or pipeline IDs. Too fragile. Always breaks.**

Every field that maps to a GHL entity MUST be:
- A dropdown populated by a live GHL API call
- Searchable if the list is long
- Storing the GHL ID (not the display name)

Never: `<input placeholder="Enter stage name" />`
Always: `<Select options={fetchedFromGHL} />`

### Rule 3 — Single Settings Hub

All settings live at `/{tenant}/settings` with these 7 sections:
1. **Integrations** — GHL connection, OAuth status, webhook health
2. **Pipeline** — which pipeline + stage triggers property creation
3. **Team** — invite members, assign roles, hierarchy
4. **Calls** — call types, results, grading rubrics per role
5. **Inventory** — property card fields, custom fields
6. **KPIs** — which metrics each role sees
7. **Day Hub** — task categories, default views

Individual pages show data. Settings page controls configuration. Never mix them.

### Rule 4 — Gunner is a CRM Enhancer, Not a CRM

What GHL owns (we read, never overwrite):
- Contacts, conversations, appointments, pipelines, tasks, call recordings

What WE own (GHL cannot do this):
- Properties (ARV, repairs, equity, assignment fee)
- Call grades, rubric scores, AI feedback
- KPI milestones and historical snapshots
- Buyer activity and deal blast history

### Rule 5 — Autonomous Handoff (Session Discipline)

Every session ends with PROGRESS.md updated. No exceptions.

At the end of every Claude Code session:
1. Update PROGRESS.md → Session Log with exactly what was done
2. Update PROGRESS.md → Known Bugs with anything discovered
3. Update PROGRESS.md → Next Session with the exact first task
4. If any architectural decision was made → add to docs/DECISIONS.md

The test: could a new Claude Code session pick up exactly where this one left off
using only PROGRESS.md? If no → the handoff is incomplete.

---

## Hard rules — technical

### Security
- Every API route must call `getSession()` from `lib/auth/session.ts` before touching data
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
- Never query without `tenantId` — you will leak cross-tenant data

---

## What NOT to do

- Do NOT build a settings field without defining its data contract first
- Do NOT use text inputs for any GHL mapping — always live dropdowns
- Do NOT add gear icons or config UI to individual pages — everything in /settings
- Do NOT store data GHL should own, or let GHL own data we should own
- Do NOT end a session without updating PROGRESS.md
- Do NOT add npm packages without checking `package.json` first
- Do NOT create DB tables without updating `schema.prisma` AND `rls-policies.sql`
- Do NOT add a new page without adding it to `components/ui/sidebar-nav.tsx`
- Do NOT call `db.user.findMany()` without `tenantId` filter
- Do NOT add a GHL call without using `getGHLClient(tenantId)` factory

---

## Orientation — read these files in order

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules, constraints, orientation (this file) |
| `PROGRESS.md` | Exact build status, bugs, next task |
| `docs/ARCHITECTURE.md` | System design, data flows, decisions |
| `docs/DECISIONS.md` | Why things are built the way they are |
| `docs/MODULES.md` | Every module: inputs, outputs, gotchas |
| `prisma/schema.prisma` | Database — single source of truth |
| `types/roles.ts` | Permission system — single source of truth |

---

## Stack — locked

| Layer | Tech | Entry point |
|---|---|---|
| Framework | Next.js 14 App Router | next.config.js |
| Database | PostgreSQL via Supabase | prisma/schema.prisma |
| ORM | Prisma | lib/db/client.ts |
| Auth | NextAuth.js v4 | lib/auth/config.ts |
| AI | Anthropic claude-opus-4-6 | lib/ai/ |
| GHL | OAuth Marketplace App | lib/ghl/client.ts |
| Styling | Tailwind CSS | tailwind.config.ts |
| Deploy | Railway + Supabase | railway.toml |

---

## Role hierarchy

OWNER → ADMIN → TEAM_LEAD → ACQUISITION_MANAGER → LEAD_MANAGER
                           → DISPOSITION_MANAGER

Full permissions in `types/roles.ts`. Use `hasPermission(role, permission)` for all checks.
When adding a feature, define its permission in `types/roles.ts` first.

---

## How to start any coding session

1. Read PROGRESS.md — find "Next Session" section, start exactly there
2. Read the relevant section of docs/MODULES.md for what you're building
3. Check docs/DECISIONS.md before making any architectural choice
4. Build the thing
5. Update PROGRESS.md before ending the session — always
