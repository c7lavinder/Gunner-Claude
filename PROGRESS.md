# PROGRESS.md — Gunner AI Build Tracker

> Updated at the end of every session. First thing to read when resuming work.

---

## Current Status

**Phase**: MVP complete + Phase 2 core features built
**Last worked on**: Session 8 (local setup)
**Deployment status**: Not yet deployed — needs GHL Marketplace App credentials
**Test status**: Local dev environment running — not yet end-to-end tested with real GHL account
**Local dev**: Running on http://localhost:3000 — all non-GHL features functional

---

## Session Log

### Session 8 — Local environment setup + dev auth bypass (2026-03-19)
**What was done:**
- Generated NEXTAUTH_SECRET, configured all env vars in `.env.local`
- Symlinked `.env` → `.env.local` so Prisma can read env vars
- Ran `npm install` — all 629 packages installed
- Ran `prisma generate` — Prisma Client generated
- Ran `prisma migrate dev --name init` — first migration applied to Supabase
- Applied RLS policies (`prisma/rls-policies.sql`) via Supabase SQL Editor
- Ran `db:seed` — tenant "Apex Wholesaling" with 5 users, 5 properties, 3 graded calls, 4 tasks
- Started `npm run dev` — server running on http://localhost:3000 with no errors
- Verified login page loads (200) and root redirects correctly (307)
- Added temporary auth bypass for local dev/testing (DEV_BYPASS_AUTH=true in .env.local)

**Dev auth bypass details (TEMPORARY — revert before go-live):**
- `DEV_BYPASS_AUTH=true` in `.env.local` — delete this line to restore normal login
- Files touched: `middleware.ts`, `lib/auth/session.ts`, `app/page.tsx`
- All bypass code marked with `// TEMP: DEV BYPASS` comments
- Visiting http://localhost:3000 goes straight to /apex-dev/dashboard as owner@apex.dev
- No auth code was deleted — bypass wraps around the existing flow

**What's working locally (no GHL needed):**
- Auth, dashboard, calls, inventory, tasks, KPIs, AI coach, settings, rubric editor

**What still needs GHL:**
- OAuth connection, auto call grading, property auto-create, inbox, appointments, GHL actions

### Session 7 — Migration + property CRUD + rubric editor
**What was done:**
- Migrated all 19 pages and API routes from `getServerSession(authConfig)` + casting to `requireSession()` / `getSession()`
- All ugly `(session.user as { tenantId?: string })` casts eliminated — uses `session.tenantId` directly
- Built property edit page (`inventory/[propertyId]/edit/page.tsx`)
- Built new property page (`inventory/new/page.tsx`)
- Built shared `PropertyForm` component — handles create and edit
- Built properties API: `POST /api/properties`, `PATCH /api/properties/[id]`
- Built call rubric editor UI (`components/settings/rubric-editor.tsx`) — full CRUD
- Built call rubrics API: `GET/POST /api/call-rubrics`, `PATCH/DELETE /api/call-rubrics/[id]`
- Wired edit button on property detail page → edit form
- Wired `RubricEditor` into Settings → Call config tab

### Session 6 — Bug fixes + new utilities
**What was done:**
- Fixed NextAuth v5 → v4 (all API routes used `getServerSession` from v4 but config was v5 type)
- Fixed Supabase RLS wiring — added `setTenantContext()` and `withTenantContext()` to `lib/db/client.ts`
- Fixed `null as any` in `kpi-snapshot.ts`
- Built `lib/auth/session.ts` — typed `requireSession()` / `getSession()` helpers
- Built `lib/utils.ts` — `cn()`, `formatCurrency()`, `formatDuration()`, `slugify()` etc
- Built `lib/email/index.ts` — Resend integration with team invite + call graded emails
- Updated invite route to send real emails via Resend
- Added `app/page.tsx` root redirect (was causing 404 at `/`)
- Added `app/(tenant)/[tenant]/error.tsx` — error boundary
- Added `app/(tenant)/[tenant]/loading.tsx` — skeleton loader
- Added `types/next-auth.d.ts` for v4 — properly extends session types
- Fixed `postcss.config.js` / added `autoprefixer` to devDependencies
- Added `NEXT_PUBLIC_GHL_CLIENT_ID` to `.env.example`
- Added `RESEND_API_KEY` and `EMAIL_FROM` to `.env.example`

### Sessions 1–5 — Foundation + full MVP
See previous PROGRESS.md for detailed log of each session.
Short summary: full project scaffolded, all pages built, GHL integration, auto call grading,
AI coach, inventory, KPIs, tasks, inbox, appointments, settings, self-audit, seed data, Railway deploy config.

---

## Complete Feature Map

### ✅ Fully built
- Self-registration + auto-slug + login
- 5-step onboarding wizard with GHL OAuth
- Multi-tenant routing with middleware enforcement
- Supabase RLS tenant isolation (policies + Prisma wiring)
- Role-based access (6 roles, full permission matrix)
- Dashboard with live KPI cards + recent calls/tasks/properties
- Call grading list with score filters
- Call detail: rubric bars, coaching tips, audio player, transcript
- Inventory list with status chips + search
- Property detail with GHL action panel (SMS, add note)
- **Property create form** (`/inventory/new`) ← new this session
- **Property edit form** (`/inventory/[id]/edit`) ← new this session
- Task list grouped by priority, create/complete with GHL sync
- Inbox — live GHL conversations
- Appointments — 7-day view from GHL
- KPIs — today/week/month toggle, score trend bars
- AI Coach chat with user context (scores, tasks, properties)
- Settings: team management, GHL connection, call types
- **Call rubric editor** — full CRUD per role/call type ← new this session
- GHL webhook receiver (all event types)
- Auto call grading on call end (Claude API)
- Property auto-create from GHL pipeline stage
- GHL actions API: SMS, note, task, stage update
- Email invite system (Resend)
- Daily self-audit agent (Claude-powered, 2am cron)
- Daily KPI snapshot cron
- Dev seed data (5 users, 5 properties, graded calls, tasks)
- Railway deployment config + health check

### ⚠️ Built but not end-to-end tested
- GHL OAuth flow (needs real marketplace app credentials)
- Auto call grading via webhook (needs real GHL account)
- Property auto-create from pipeline stage (needs real GHL pipeline)
- Email sending via Resend (needs RESEND_API_KEY)
- Token auto-refresh logic (needs expired token)

### ❌ Not yet built — backlog
See BACKLOG section below.

---

## Known Bugs

| # | Description | File | Priority | Status |
|---|---|---|---|---|
| 1 | `withTenantContext()` not called in API routes — RLS doesn't activate per-request | `lib/db/client.ts` | Medium | Needs wiring in each route |
| 2 | `session.role` cast still uses `as UserRole` in some pages — minor but avoidable | various pages | Low | Cosmetic |
| 3 | Invite email uses empty `companyName` string — needs tenant.name lookup | `app/api/tenants/invite/route.ts` | Low | Fix next session |

---

## Phase 2 Backlog — prioritized

### Priority 1 — do before first paid client
| Feature | Effort |
|---|---|
| Wire `withTenantContext()` into sensitive API routes | Small |
| Fix invite email to include company name | Tiny |
| End-to-end test with real GHL account | Medium |
| Error monitoring (Sentry or similar) | Small |

### Priority 2 — next feature wave
| Feature | Effort |
|---|---|
| Buyer list management | Large |
| Deal blasting (SMS/email to buyer list) | Large |
| Property enrichment (Zillow API) | Medium |
| Bulk property import from GHL pipeline | Medium |
| Call transcript integration (Deepgram or GHL native) | Medium |
| Custom KPI formula builder per role | Large |
| Reporting + CSV export | Medium |

### Priority 3 — scale
| Feature | Effort |
|---|---|
| GHL Marketplace App public submission | Large |
| White-label / custom domain per tenant | Large |
| Mobile-responsive polish | Medium |
| Push notifications | Medium |

---

## Next Session — exact tasks

1. Fix invite route to pass `companyName` (fetch tenant.name before sending email)
2. Wire `withTenantContext(session.tenantId, session.userId)` into the 5 most sensitive API routes
3. Deploy to Railway — full deployment checklist below
4. Test end-to-end with a real GHL account
5. Start buyer list module if time allows

---

## Deployment Checklist

- [ ] `git init && git add . && git commit -m "initial: Gunner AI MVP"`
- [ ] Push to GitHub
- [ ] Create Supabase project → copy `DATABASE_URL` and `DIRECT_URL`
- [ ] Run `npm run db:migrate` locally pointing at Supabase
- [ ] Paste `prisma/rls-policies.sql` into Supabase SQL Editor → Run
- [ ] Create GHL Marketplace App → get `GHL_CLIENT_ID` + `GHL_CLIENT_SECRET`
- [ ] Sign up for Resend → get `RESEND_API_KEY` → verify your domain
- [ ] Create Railway project → connect GitHub repo
- [ ] Add ALL env vars to Railway (reference `.env.example`)
- [ ] Trigger first deploy → check logs
- [ ] Hit `GET /api/health` → should return `{ status: 'ok' }`
- [ ] Open `/register` → create first tenant → complete onboarding
- [ ] Connect GHL → verify webhook shows in GHL dashboard
- [ ] Make a test call in GHL → verify it appears graded in `/calls`
- [ ] Invite a team member → verify email arrives
