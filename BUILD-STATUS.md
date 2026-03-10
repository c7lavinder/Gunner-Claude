# BUILD-STATUS.md — What's Done, What Remains

> Last updated: March 10, 2026
> Last deploy: commit `9758055` on `manus-migration` — Railway live
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

### Phase 0: Security (mostly done, gaps remain)

- [ ] Add tenant checks to remaining IDOR-vulnerable endpoints — REBUILD-PLAN Section 12 lists 9 endpoints: `teamMembers.getById`, `trainingMaterials.getById`, `feedback.getById`, `teamTrainingItems.getById`, `brandAssets.getById`, `calls.getGrade`, `nextSteps.getNextStepsCount`, `nextSteps.updateNextStepStatus`, `nextSteps.editNextStep`. Audit each and add `WHERE tenantId = ctx.user.tenantId`.
- [ ] Login rate limiting with account lockout after 10 failed attempts
- [ ] Webhook signature verification (verify GHL webhook payloads are authentic)

### Phase 1: Software Playbook + Codebase (mostly done, gaps remain)

- [ ] Delete dead pages: Home (858 lines), LeadGenDashboard, ComponentShowcase, GradingRules, Feedback — see REBUILD-PLAN Section 4 "Pages to Delete/Consolidate"
- [ ] Consolidate pages: Methodology → Training tab, TeamTraining → Training tab, Leaderboard → Team, Analytics → KPIs, SocialMedia → Training/Settings, Opportunities → Inventory, CoachActivityLog → Calls tab, TeamManagement → Settings, TenantSetup → Settings/Admin
- [ ] Remove unused packages: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `add` devDep
- [ ] Frontend testing setup: `@testing-library/react`
- [ ] E2E testing setup: Playwright
- [ ] PostHog JS client for frontend analytics/user_events

### Phase 2: Industry Playbook (mostly done, gaps remain)

- [ ] Wire industry terminology into ALL frontend pages (replace hardcoded "Seller", "Property", "Deal" with `t.contact`, `t.asset`, `t.deal` from useTenantConfig) — see REBUILD-PLAN Section 3 "Currently Hardcoded → Moves To" table
- [ ] Replace hardcoded role checks (`if (role === 'acquisition_manager')`) with playbook role references
- [ ] Remove "Real estate wholesaling" from AI prompts (use `industryPlaybook.name` instead)
- [ ] Remove GHL-specific copy from frontend ("GoHighLevel" mentions)
- [ ] Create additional industry seeds: Solar, Insurance, SaaS, Home Services (REBUILD-PLAN Section 15)

### Phase 3: Tenant Playbook / NAH Config (partially done)

- [ ] Map NAH's exact pipeline stages to playbook stages (with GHL pipeline/stage IDs)
- [ ] Define NAH's markets + zip codes in tenant playbook
- [ ] Define NAH's lead sources + GHL source string mappings
- [ ] Import NAH team members + map to GHL user IDs
- [ ] Set NAH's KPI targets per role per period
- [ ] Set NAH's algorithm weight overrides

### Phase 4: User Playbook + Intelligence Loop (early stage)

- [ ] Coaching memory distillation job (weekly — summarize coaching themes from conversations)
- [ ] Action pattern analysis (from user_events — what actions each user takes, misses)
- [ ] Proactive AI suggestions (V2 — AI suggests without being asked, shown as cards)
- [ ] Voice sample extraction job (runs after grading, extracts user audio segments)
- [ ] Consent toggle in Profile page for voice collection
- [ ] Supabase bucket: `gunner-voice-samples`
- [ ] Voice profile dashboard in Profile page (total minutes, sample count, ready status)
- [ ] Full user_events collection on frontend (page_view, feature_used, search_performed)

### Phase 5: Landing + Premium Polish (partially done)

- [ ] Rebuild main landing with empowerment messaging (replace "Stop Babysitting" — see REBUILD-PLAN Section 15)
- [ ] Re-enable email+password signup
- [ ] Build 5 industry landing pages (wholesaling, solar, insurance, SaaS, home services) — template exists at `IndustryLanding.tsx`, need industry configs
- [ ] Testimonials from DB (currently hardcoded)
- [ ] FAQ section on landing (from config/DB)
- [ ] Integrations section ("Works with your CRM" — CRM-agnostic icons)
- [ ] Dark mode full audit — grep for raw colors (`#fff`, `rgb(`, `bg-white`) and replace with CSS variables
- [ ] Loading skeleton consistency — ensure ALL pages use skeleton, not spinners
- [ ] In-app notification system (badge earned, task due, call graded)
- [ ] Breadcrumbs on nested views
- [ ] Full accessibility pass (aria-labels on icon-only buttons, form labels, keyboard nav)
- [ ] Optimistic updates for CRM actions (show success immediately, rollback on failure)

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

1. **Google OAuth login loop** — Users get redirected back to login after Google auth callback. Deferred — needs dedicated debugging session. Email+password login works as fallback.
2. **Old routers.ts still exists** — The monolith `server/routers.ts` file may still exist alongside the new split routers. If both exist, the split routers in `server/routers/index.ts` are the canonical source.
3. **GHL OAuth not tested end-to-end** — The OAuth flow (server/services/ghlOAuth.ts + Settings UI) is built but hasn't been tested with a real GHL OAuth app credential.

---

## How to Continue Building

1. Pick a section from "What Remains" above
2. Read the corresponding section in `REBUILD-PLAN.md` for full spec
3. Build it following the patterns already established in the codebase
4. Run `npx tsc --noEmit` — must be 0 errors
5. Commit with prefix: `feat:` / `fix:` / `refactor:`
6. Push to `manus-migration` — Railway auto-deploys
