# BUILD-STATUS.md — What's Done, What Remains

> Last updated: March 11, 2026 — **POST-BUILD SPRINT COMPLETE**
> Last deploy: commit `3572c9f` — Railway live, site loading correctly
> Type check: `npx tsc --noEmit` — 0 errors

Read `REBUILD-PLAN.md` for the full specification. This file tracks progress against that spec.

---

## Completed Work

### Post-Build Sprint — March 11, 2026

**Wave 0: GitHub CI hygiene**
- [x] `sync-main.yml` auto-sync workflow added — keeps `main` in sync with the deploy branch
- [x] ESLint added to `pr-check.yml` — lint failures block PRs
- [x] `nightly.yml` cleaned up — removed stale steps, consistent env handling

**Wave 0: Tech stack wiring**
- [x] `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` promoted to `required()` in `server/_core/env.ts` — server won't start if missing
- [x] `VITE_POSTHOG_API_KEY` documented in `.env.example`
- [x] Loops and LangSmith env vars marked with `// TODO: wire up` comments to surface remaining integration gaps

**Wave 1: Bug fixes**
- [x] `isStarred` boolean fix — was comparing string `"true"` instead of boolean; fixed across call grading and inbox
- [x] D-grade color restored — `--g-grade-d` CSS var was missing from token sheet; orange added back
- [x] Nested anchor removed — `<a>` inside `<a>` on landing page caused React hydration warning
- [x] `icon-sm` button variant fixed — was rendering at wrong size; corrected in `button.tsx`
- [x] `--g-warning-bg` and `--g-warning-text` CSS vars added to design token sheet
- [x] Team leaderboard column headers added — table was rendering data rows with no header row

**Wave 2: CallInbox polish**
- [x] shadcn `Select` component replaces native `<select>` for date filter — consistent with design system
- [x] Improvements section styled orange — matches grade-D / warning color convention
- [x] Transcript formatted — line breaks and speaker labels rendered properly instead of raw string
- [x] Inline `style={{}}` props removed from CallInbox — replaced with Tailwind arbitrary-value classes

**Wave 2: Design system cleanup**
- [x] All `--obs-*` alias tokens removed (58 lines deleted from `index.css`) — these were stale Obsidian-era tokens never used in the app
- [x] `"nt"` typo removed from Inventory — orphaned string fragment cleaned up
- [x] `stageColor()` helper added with safe fallback — prevents crash when an unknown stage code is passed

**Wave 2: Today page — contact context**
- [x] `getContactContext` tRPC procedure added to `server/routers/today.ts` — returns last 3 calls for a phone number (grade, duration, date) via left join on `callGrades`
- [x] Recent Calls section added to contact detail panel in `Today.tsx` — shows grade circle, date, duration chips + "View all calls →" link

**Wave 3: Landing page accuracy**
- [x] Integration badges corrected — Twilio, HubSpot, and Salesforce moved to "Coming Soon"; only live integrations (GHL, Stripe, OpenAI, Google) shown as active
- [x] Privacy Policy and Terms of Service stub routes added (`/privacy`, `/terms`) — prevents 404 from footer links

**Wave 3: XP level thresholds centralized**
- [x] XP level thresholds moved to `shared/types.ts` — single source of truth used by both frontend (leaderboard) and backend (gamification service); no more duplication

**Wave 3: Settings + Playbook incomplete sections**
- [x] All inline `style={{}}` props removed from `Settings.tsx` (35 instances) and `Playbook.tsx` (2 instances) — replaced with Tailwind arbitrary-value classes
- [x] Confirmed all 8 Settings tabs and all 4 Playbook tabs render with real content — no empty or TODO sections found

---

### Final Hardening Pass (just completed)

- [x] **Accessibility:** `aria-label` added to all icon-only buttons — Training (2 close buttons), Settings (remove member), Onboarding (add/remove member), Inventory (SMS, note, task, stage buttons), Playbook (delete role), ActionConfirmDialog (edit pencil), SearchableDropdown (clear search)
- [x] **SAAS-LIFECYCLE.md:** Corrected stale sections — gamification (all 4 "broken" badges were already fixed in prior session), security (Phase 0 items 4+5 were already fixed), Phase 0 remaining gaps section updated to reflect reality
- [x] **Type check:** `npx tsc --noEmit` — 0 errors confirmed

### Final Build Session (Batches 1–5 — prior session)

- [x] **Batch 1 — RBAC:** `requireRole` helper in `server/_core/sdk.ts`; role guards on all write procedures in settings/team/playbook routers; `isAdmin`/`isManager`/`isMember` booleans in `useAuth`; admin-gated UI in Settings + Team page
- [x] **Batch 2 — Session Management:** `sessions` table + startupMigration; session insert on every login/signup/googleCallback; `listSessions`/`revokeSession`/`revokeAllSessions` tRPC procedures; Sessions tab in Settings showing all active devices
- [x] **Batch 3 — Advanced Search:** `search.global` tRPC procedure (calls, contacts, notes via ILIKE); CommandPalette (Cmd+K) wired to real debounced search with grouped results by type and icons (Phone, User, FileText); falls back to page navigation when query is short
- [x] **Batch 4 — Audit Log:** `audit_log` table + startupMigration; fire-and-forget `logAction` service; `auditLogRouter` (admin-only); audit events on tenant settings change, team invite, team removal, playbook edit; Audit Log tab in Settings (admin-only)
- [x] **Batch 5 — Performance & Polish:** DB indexes for calls/user_events/notifications/audit_log; `crmStatus` in `/health` endpoint; CRM degraded banner in DashboardLayout; loading skeleton final pass confirmed (no Loader2 spinners remain)
- **NOTE:** Vite `manualChunks` (react/recharts/radix splitting) was removed — it caused React 19.2 to crash on startup (`Cannot set properties of undefined (setting 'Activity')`). Vite handles chunking automatically.

### Finish Line Batches (all 8 complete — prior session)

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

- [x] tRPC routers split from 9,059-line monolith into 12+ focused files in `server/routers/`
- [x] CRM adapter abstraction (`server/crm/adapter.ts` + `server/crm/ghl/ghlAdapter.ts`)
- [x] Algorithm framework with config objects (`server/algorithms/`)
- [x] Playbook data model (4 layers: Software, Industry, Tenant, User)
- [x] `useTenantConfig` hook for dynamic labels on all pages
- [x] `usePlaybook` hook for playbook data access
- [x] ActionConfirmDialog universal action system
- [x] SearchableDropdown for all pickers
- [x] Command palette (Cmd+K) via cmdk — now with real search
- [x] Page transitions (Framer Motion)
- [x] Webhook handler with dedup + retry queue
- [x] Call polling (5min) + opportunity polling (10min)
- [x] Daily digest email job
- [x] Event tracking (user_events table + flusher)
- [x] AI suggestions table (ai_suggestions)
- [x] Playbook insights table (playbook_insights)
- [x] SSE streaming endpoint for AI coach (`POST /api/ai/stream`)
- [x] Health check endpoint (`GET /health`) — now includes `crmStatus`
- [x] Rate limiting on auth endpoints
- [x] Skip-to-content link + ARIA landmarks in DashboardLayout

---

## What Remains (known gaps — not blockers)

### Needs external config / production data (not code issues)
- [ ] Import NAH team members + map to GHL user IDs (needs real GHL data)
- [ ] Supabase bucket: `gunner-voice-samples` (create manually in Supabase dashboard)
- [ ] GHL OAuth end-to-end test (built, needs live GHL OAuth app credentials)
- [ ] Google OAuth login loop (likely fixed — needs production verification with real cookies)

### Future features (enhancement backlog)
- [ ] E2E testing: Playwright
- [ ] Testimonials from DB (currently hardcoded in landing page — needs testimonials table + admin UI)
- [ ] Funnel charts, heat maps, trend sparklines
- [ ] AI-generated training content based on team weak areas
- [ ] Daily/weekly gamification challenges
- [ ] Badge rarity visuals (bronze/silver/gold glow effects)
- [ ] XP history timeline
- [ ] Bulk action selection with warning + confirm
- [ ] Action history per contact (every SMS, note, task, stage change)
- [ ] 5-second undo window for non-destructive actions
- [ ] SMS/note templates per role (from Tenant Playbook)
- [ ] NAH markets/zip codes, lead sources, KPI targets in tenant playbook
- [ ] Voice sample collection UI + consent toggle
- [ ] Proactive AI suggestions (V2 intelligence loop)

---

## Known Issues

1. **Google OAuth login loop** — Likely fixed by: (a) `trust proxy: 1` for Railway's reverse proxy, (b) routing new users to `/onboarding` instead of `/today`. Needs production verification.
2. **GHL OAuth not tested end-to-end** — Built (server/services/ghlOAuth.ts + Settings UI) but hasn't been tested with a real GHL OAuth app credential. Not a code bug.

---

## How to Continue Building

1. Pick a section from "What Remains" above
2. Read the corresponding section in `REBUILD-PLAN.md` for full spec
3. Build it following the patterns already established in the codebase
4. Run `npx tsc --noEmit` — must be 0 errors
5. Commit with prefix: `feat:` / `fix:` / `refactor:`
6. Push to deploy branch — Railway auto-deploys
