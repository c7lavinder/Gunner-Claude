# BUILD-STATUS.md — What's Done, What Remains

> Last updated: March 12, 2026 — **ALL WAVES COMPLETE (1-4)**
> Last deploy: production branch — Railway live, site loading correctly
> Type check: `npx tsc --noEmit` — 0 errors
> Tests: `npx vitest run` — 60 tests passing (8 test files)

Read `REBUILD-PLAN.md` for the full specification. This file tracks progress against that spec.

---

## Completed Work

### 23-Point Quality Gate — March 12, 2026

- [x] **TypeScript clean** — `npx tsc --noEmit` returns 0 errors
- [x] **Security (10/10 PASS)** — Session checks `revokedAt IS NULL` + `expiresAt > now`; no hardcoded admin emails; signup in `db.transaction()`; login orphan guard (`needsOnboarding`); RBAC `owner: 40`; `updateNextStep`/`updateClassification`/`completeTask` all tenant-scoped; AI stream rate-limited (20/min); AI `userInstructions` tenant-filtered
- [x] **CRM Bridge (8/8 PASS)** — `saveCrm` merges only apiKey/locationId; webhook HMAC rejects when secret unset; real handlers for OpportunityStageUpdate/ContactUpdate/AppointmentScheduled; `check_off_task`/`remove_workflow` in ACTION_TYPES; `mockSuccess` only fires when no CRM configured; first-sync 30-day lookback; pagination MAX_PAGES=50 on opportunities+calls; reconciliation auto-imports missed calls
- [x] **Grading & Gamification (5/5 PASS)** — JSON.parse in try/catch with `grade_failed` fallback; gradeCall WHERE includes tenantId; XP uses SQL atomic increment; streak in `db.transaction()`; closer badge resolves userId from teamMembers
- [x] **`call_feedback` table** — Schema + startup migration for grade dispute tracking
- [x] **`callNextSteps.editableContent`** — New column for user-edited next step content
- [x] **Inner ErrorBoundary** — Page crashes inside DashboardLayout show error UI instead of white screen

### Security Hardening — March 12, 2026 (Wave 1)

- [x] Session revocation enforcement in context.ts — checks `revokedAt IS NULL`
- [x] TOCTOU patches: `updateNextStep`, `updateClassification`, `completeTask` all verify tenantId+userId in WHERE
- [x] NAH hardcoded admin emails removed from auth.ts
- [x] Owner role hierarchy fixed (level 40) in sdk.ts
- [x] Signup wrapped in `db.transaction()` — no orphan users on failure
- [x] SSE rate limiter on `/api/ai/stream` (20 requests/min)
- [x] `userInstructions` tenant isolation in AI router

### CRM Bridge Complete — March 12, 2026 (Waves 1+3)

- [x] 3 webhook event handlers (OpportunityStageUpdate, ContactUpdate, AppointmentScheduled)
- [x] Action router gaps fixed (`check_off_task`, `remove_workflow` in ACTION_TYPES)
- [x] Error-swallowing mockSuccess removed — only fires when no CRM configured
- [x] `saveCrm` merge fix — preserves OAuth tokens when saving API key
- [x] 30-day initial backfill on OAuth connect
- [x] GHL adapter cursor pagination (MAX_PAGES=50)
- [x] Reconciliation re-ingests missing calls
- [x] 4 new action types: `email`, `update_opportunity`, `create_opportunity`, `dnc`
- [x] Dynamic GHL pickers: `getCalendars`, `getPipelines`, `getTags`, `getWorkflows` (tRPC + adapter)
- [x] Inbound field capture: `assignedTo` → `teamMemberId` lookup in polling + webhooks
- [x] `callTimestamp` captured from webhook events
- [x] Contact enrichment on first opportunity insert (city/state/zip/sellerName/sellerPhone)
- [x] Hidden actions surfaced in Inventory UI (tag, field_update, workflow, email buttons)
- [x] `createAppointment` accepts `calendarId` (was hardcoded to "primary")

### LLM Architecture — March 12, 2026 (Wave 3)

- [x] All 9 AI touchpoints now industry-aware (grading, coaching, next steps, roleplay, etc.)
- [x] Generic `FALLBACK_CRITERIA` replaced RE-specific criteria (industry-agnostic)
- [x] `aiFeedback` connected to grading — last 5 calibration notes injected into prompt
- [x] `rubricSnapshot` populated on grade insert (preserves rubric at grade time)
- [x] `weakCriteria` tracked in user_playbooks (criteria scoring <60%)
- [x] User playbook updates immediately after grading (not just weekly)
- [x] Terminology injected into all prompts (`t.contact`, `t.asset`, `t.deal`, `t.walkthrough`)

### Multi-Industry Playbooks — March 12, 2026 (Wave 3)

- [x] `GENERIC_INDUSTRY_PLAYBOOK` fallback for unknown industries
- [x] `taskSort` generic with `default` role config key
- [x] Algorithm configs surfaced to call sites
- [x] `resolveCallTypes` reads `tenant_call_types` table
- [x] Solar, Insurance, Home Services seeds verified complete
- [x] `ADDING-NEW-INDUSTRY.md` guide created

### Quality Infrastructure — March 12, 2026 (Wave 2)

- [x] Vitest config fixed — all 8 test files run (60 tests passing)
- [x] 3 critical-path unit tests added (tenant isolation, grading crash, action routing)
- [x] CodeRabbit `.coderabbit.yaml` configured with auto_review
- [x] controlRoom router mounted
- [x] 12 DB indexes added (calls, dispo_properties, daily_kpi_entries, contact_cache, team_members)
- [x] Agent stubs clearly marked with STUB AGENT banner
- [x] `RAILWAY_STATIC_URL` centralized to env.ts

### Admin UI Enhancements — March 12, 2026 (Wave 4)

- [x] Structured rubric criterion editor (replaces JSON textarea)
- [x] Stage editor with reordering
- [x] Coaching tone selector
- [x] Grading philosophy override textarea
- [x] KPI target inputs
- [x] Min grading duration control
- [x] Export JSON button
- [x] Copy from Industry shortcut

### Onboarding Flow — March 12, 2026 (Wave 4)

- [x] Signup redirects to `/onboarding`
- [x] Onboarding gate in DashboardLayout
- [x] Admin `team_members` row created at signup
- [x] Badge definitions seeded for new tenants
- [x] Industry defaults pre-populated on tenant creation

### Three-Layer CRM Sync System — March 12, 2026

- [x] **Layer 1: OAuth + Webhooks (real-time)** — GHL OAuth flow fixed end-to-end: CrmTab now reads `?code=` param on return from OAuth redirect, calls `completeGhlOAuth`, shows loading state. Webhook URL registration fixed (`/api/webhooks/ghl` not `/api/webhooks/crm`). Activity logged to `sync_activity_log` with `layer='oauth'`
- [x] **Layer 2: API Token (on-demand fallback)** — Manual API key + Location ID entry with Test Connection and Save. Activity logged with `layer='api'`
- [x] **Layer 3: Polling (safety net)** — 5-minute call polling + 10-minute opportunity polling with per-cycle activity logging (`layer='polling'`, details as JSON with processed/skipped/errors)
- [x] **Token Refresh** — `refreshTokenIfNeeded(tenantId)` utility in `ghlOAuth.ts` checks `tokenExpiresAt` and refreshes within 5-minute expiry window. Called before every API call in `ingestCallsForTenant`, `ingestOpportunitiesForTenant`, and `testCrmConnection`
- [x] **`sync_activity_log` table** — New table in schema + startup migrations. Columns: tenantId, layer (oauth/api/polling), eventType, status (success/error/skipped), details, createdAt. Indexed on tenantId+createdAt
- [x] **Settings Router Endpoints** — `getSyncLayerStatus` (3-layer status with last activity timestamps), `getSyncActivityLog` (filterable by layer, default 20 entries), `disconnectOAuth` (clears OAuth tokens, preserves manual API key), `getSyncSummary` (total calls/opportunities/data freshness)
- [x] **Three-Layer CRM Settings Dashboard** — Complete rebuild of CrmTab.tsx: connection status banner with colored dots per layer, Layer 1 card (OAuth status/token expiry countdown/webhooks/activity), Layer 2 card (API key/location ID/test/save/activity), Layer 3 card (polling interval/last poll/cycle results/activity), Sync Summary footer (total calls/opportunities/data freshness)
- [x] **CRM-Agnostic UI** — `CRM_DISPLAY_NAMES` map (ghl→GoHighLevel, hubspot→HubSpot, etc.) used everywhere. No hardcoded "GoHighLevel" in user-facing labels. CRM adapter interface unchanged
- [x] **Bug Fixes** — OAuth callback never completing (#1), webhook URL mismatch (#2), token refresh missing from ingestion (#3)

### Day Hub Polish — March 12, 2026

- [x] **Fixed-height panels** — Inbox card and AI Coach card both locked to `h-[620px]`. Zero layout bounce regardless of conversation count. Scrolls internally.
- [x] **Inbox row redesign** — Letter avatar replaced with SMS `MessageSquare` icon. Property address shown as second line (hidden if none). "via [Team Member]" label shows who the contact is texting on the team.
- [x] **Per-contact AM/PM chips** — Every task row shows AM and PM pill badges. Green = qualifying call (≥30s) made to that specific contact before/after noon today. Gray = not yet. Always shown for consistent row width.
- [x] **Task categories (playbook-driven)** — `taskCategories` added to `IndustryPlaybook` type, seeded in RE Wholesaling (New Lead, Follow Up, Admin, Reschedule), resolved through 4-layer playbook chain, exposed in `useTenantConfig()`. Categories filter dropdown on task list.
- [x] **Task complete → CRM write-back** — Two-click confirm flow: first click stages, inline confirm bar appears ("Mark complete? This will update your CRM."), confirm click marks done in Gunner AND calls `adapter.completeTask(crmTaskId)` through CRM adapter. Never blocks on CRM failure.
- [x] **Overdue gradient text** — Red "Overdue" badge replaced with plain gradient text: `1d` = yellow, `2-3d` = orange, `4d+` = red.
- [x] **Task list pagination** — 50 tasks shown, "View More (N remaining)" button at bottom. No infinite scroll.
- [x] **Team Members filter (admin only)** — Dropdown filters task list by assigned rep. Only visible to admin/owner roles.
- [x] **Update Workflow button** — Expanded task panel now has "Update Workflow" button. Opens a searchable stage dropdown (from playbook, never hardcoded). Smart sort: adjacent funnel stages float to top. Fires `actions.execute` with `type: "stage_change"`.
- [x] **KPI cards polished** — Bigger numbers (`text-3xl`), uppercase labels (`tracking-widest`), more padding (`p-5`), thicker progress bar (`h-1.5`).
- [x] **AI Coach — full Day Hub context** — `pageContext` (KPIs, AM/PM status, tasks, overdue contacts, conversations, missed calls) passed on every message. Backend builds a structured context block in the system prompt. Coach now knows exactly what's on screen and can draft replies, recommend next actions, give task scripts, and calculate KPI gap.
- [x] **Dynamic AI Coach chips** — 3 quick-prompt chips are now context-driven: shows "Draft reply to [top unread contact]" if unread convos exist, "Best call to make right now?" if AM not done, "How do I hit my offer target?" if offers behind. Never static.
- [x] **Settings — Team CRM Phones** — Admin-only section in Settings. Lists all team members with editable CRM Phone Number field. Saves via `team.updateLcPhone` mutation. All labels say "CRM Phone" — never CRM-specific.
- [x] **CRM-agnostic throughout** — No "GHL" in any user-facing label. All task completion, stage changes, and phone linking go through the CRM adapter interface.



- [x] **Call Detail Page (`/calls/:id`)** — Full two-panel layout: grade circle + strengths/red flags left, 4-tab content right (Coaching, Criteria, Transcript, Next Steps). WaveSurfer.js audio player, Feedback modal, Reclassify modal. All labels playbook-driven via `useTenantConfig()`
- [x] **CallCard Redesign** — Rich badges (direction, call type, classification from playbook), address pill, summary preview, grade circle with letter+%, navigates to `/calls/:id` on click
- [x] **CallFilters Redesign** — 5 dropdowns (date, team member grouped by roles, call type from playbook, outcome from `outcomeTypes`, score A-F). Role-scoped access: `isAdmin || isManager` for team filter
- [x] **AI Coach Sidebar (`CallsAiCoachPanel`)** — Always-visible right column on Call Inbox, coaching chips + action chips from playbook per call type, context-aware
- [x] **Next Steps Engine** — AI-generated action suggestions (note, task, stage_change, sms, appointment), editable cards, push to GHL, mark done/skip, manual add. Auto-generated on grade. `callNextSteps` table + 5 tRPC mutations
- [x] **Call Highlights** — Generate + persist to `call_grades.highlights` column
- [x] **AI Grading Updates** — Explanation per criterion (`criteriaScores[].feedback`), `objectionHandling` array with suggested responses, `overallGrade` letter stored, coaching tips array
- [x] **60-Second Grading Gate** — Calls under 60s auto-skipped, shown in Skipped tab with reason + "Grade This Call" override button
- [x] **`call_feedback` Table** — `aiFeedback` table for grade disputes (type, explanation, suggested score/grade, original score). `submitFeedback` mutation, Feedback modal on CallDetail
- [x] **Call Reclassification** — `updateClassification` mutation + Reclassify modal using `classificationLabels` from playbook
- [x] **Playbook Compliance Audit** — Removed hardcoded `"acquisition_manager"` role check in `CallFilters.tsx`, replaced with `isAdmin || isManager` from `useAuth()`

### Infrastructure Upgrade — March 12, 2026

- [x] **7-Agent Orchestration System** — `server/agents/` with CallGrader, IngestionAgent, CoachingAgent, PlaybookAgent, GamificationAgent, NotificationAgent, ReconciliationAgent
- [x] **BullMQ/Redis Queue System** — `server/queues/` with job queues, workers, and retry logic replacing in-process scheduling
- [x] **Agent Memory Store** — persistent agent state and context across job runs
- [x] **Control Room tRPC API** — real-time agent status, queue health, and job management endpoints
- [x] **Vitest Test Suite + CI Enforcement** — unit tests for grading, gamification, playbook resolution; `vitest run` in GitHub Actions PR check
- [x] **Dockerfile + Railway Config** — production Docker build for Railway deployment
- [x] **Redis Cloud Essentials** — connected via `REDIS_URL` env var for BullMQ backing store
- [x] **190 ESLint Warnings Cleared** — bulk cleanup of unused vars, explicit any, console.log usage
- [x] **Compliance Violations Fixed** — #8 (MATERIAL_ICONS), #10 (FALLBACK_CRITERIA), #12 (algorithm typing), #14 (Terminology.leadSource), #15 (Today.tsx properties), #16 (KPI conversion label), #17 (streak threshold), #21 (AlgorithmConfig.taskSort)

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

**Wave 6A–6C: Auth fixes + Day Hub rebuild**
- [x] Google OAuth login loop fixed — verified end-to-end with production cookies; new users route to `/onboarding`, returning users to `/today`
- [x] GHL OAuth button fix — replaced unsafe inline `window.location.href` with proper `trpc.settings.getGhlOAuthUrl` query + `refetch()` pattern in Settings CRM tab
- [x] Day Hub rebuild — role-based tabs, KPI stat cards with click-to-expand, daily KPI ledger modal, `DEFAULT_KPI_TARGETS` config, team member activity feed

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
- [ ] GHL OAuth end-to-end test (code-complete with 3-layer sync dashboard, needs live GHL OAuth app credentials to verify)

### Calls Section — Remaining Polish

- [ ] `user_events` — track `next_step.pushed`, `next_step.edited` (original+final), `next_step.skipped`, `next_step.added_manual`, `next_step.regenerated` for every Next Steps interaction
- [ ] Role-scoped call list access — resolve `allowedTeamMemberIds` from `teamAssignments` per user role on `calls.list`
- [ ] `grade.summary` included in `calls.list` response for preview in CallCard

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

1. **GHL OAuth not tested end-to-end** — Full flow now built (OAuth redirect → callback → token exchange → webhook registration → token refresh). Code-complete — needs live GHL OAuth app credential to verify. Not a code bug.

---

## How to Continue Building

1. Pick a section from "What Remains" above
2. Read the corresponding section in `REBUILD-PLAN.md` for full spec
3. Build it following the patterns already established in the codebase
4. Run `npx tsc --noEmit` — must be 0 errors
5. Commit with prefix: `feat:` / `fix:` / `refactor:`
6. Push to deploy branch — Railway auto-deploys
