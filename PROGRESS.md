# PROGRESS.md — Gunner AI Build Tracker

> First file Claude Code reads every session.
> "Next Session" tells Claude exactly where to start.
> Older sessions archived in docs/SESSION_ARCHIVE.md.

---

## Current Status

**Phase**: AI Intelligence Layer complete. Deep audit done. Production ready.
**App state**: Live on Railway
**GitHub**: https://github.com/c7lavinder/Gunner-Claude
**Railway**: https://gunner-claude-production.up.railway.app
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: hmD7eWGQJE7EVFpJxj4q)
**AI Tools**: 74 assistant tools, 11 AI logging touchpoints, pgvector semantic search
**Knowledge**: 42 playbook docs loaded + embedded, 3 user profiles
**Calls graded**: 17+ (auto-grading active)

---

## What's Built

| Feature | Status |
|---|---|
| Call grading (7-layer playbook context) | Live |
| Role Assistant (74 tools) | Live |
| AI Coach (playbook-aware) | Live |
| Day Hub (tasks, appointments, inbox, KPIs) | Live |
| Inventory (200+ fields, deal intel, research tab) | Live |
| Call detail (coaching, transcript, next steps, property tabs) | Live |
| KPI dashboard (score trends, milestones, TCP ranking) | Live |
| Knowledge system (upload, playbook loader, pgvector search) | Live |
| User profiles (auto-generated weekly, editable) | Live |
| Calibration calls (flag good/bad examples) | Live |
| AI logging (all 11 touchpoints, admin page) | Live |
| Lead Quality section (A-F grade, ad campaign attribution) | Live |
| Deal intel extraction (100+ fields, 9 categories) | Live |
| Gamification (XP, badges, leaderboard) | Live |
| Workflow engine (triggers, conditions, delayed steps) | Live |
| Disposition hub (buyers, deal blasts, approval gates) | Built, hidden from nav |
| Lead Source ROI | Built, hidden from nav |
| Training hub | Built, hidden from nav |
| Stripe billing | Built, needs env vars to activate |
| Onboarding flow | Built |
| Password reset | Built |

---

## Session Log (recent — older sessions in docs/SESSION_ARCHIVE.md)

### Session 34b — WebhookLog outcome tracking (2026-04-08)

Extended WebhookLog with outcome tracking:
- Added 3 fields: status (received|processing|success|failed), processedAt, errorReason
- Added 3 indexes: [tenantId,eventType], [tenantId,status], [tenantId,receivedAt]
- route.ts: WebhookLog now writes status='processing' on arrival, then updates to
  'success' or 'failed' with processedAt + errorReason after handleGHLWebhook resolves
- Response to GHL still returns immediately — outcome update is fully async
- Files changed: prisma/schema.prisma, app/api/webhooks/ghl/route.ts, PROGRESS.md

### Session 34 — Autonomous audit + known bug fixes (2026-04-08)

Tasks completed:
- Task 1: Health check — HEALTHY (0 queue items, 0 errors, 0 misclassifications)
- Task 2: P7 grading parse failure fixed (lib/ai/grading.ts + lib/ai/extract-deal-intel.ts)
  - Added robust `stripJsonFences()` using anchored regexes (^ and $) instead of weak /g flag
  - Applied to parseGradingResponse, next steps parser, and parseExtractionResponse
  - Existing fence stripping had weak regex that could match mid-content; now anchored to start/end
- Task 3: Silent catches swept from lib/ai/ and app/api/ai/ — 27 catches replaced
  - lib/ai/: grading.ts (3), extract-deal-intel.ts (1), coach.ts (4), context-builder.ts (1),
    enrich-property.ts (3), generate-user-profiles.ts (2) = 14
  - app/api/ai/: assistant/execute/route.ts (10), assistant/route.ts (1), outreach-action/route.ts (1) = 12
  - Plus 1 missed catch in execute/route.ts (getGHLClient) = 27 total
  - Audit log .catch() cases use console.error to avoid recursion
- Task 4: withTenant migration — 8 routes migrated (72 → 64 remaining)
  - review-count, audit, export, feedback, skip, reclassify, calibration, actions
- Task 5: TypeScript sweep — zero errors across entire project

Also in this session (before autonomous block):
- Call pipeline fix: WebhookLog table added, no-answer bug fixed, poll-calls stripped of
  inline transcription/grading, existingIds scoped to 48h. Deployed to Railway (a93d5b9).
- Restored embedding column on KnowledgeDocument (prevented 40-row data loss during db push)
- Created .env file for local Prisma operations

### Session 33 — Bulletproofing run + going-forward habits (2026-04-06 to 2026-04-07)

All 7 critical reliability fixes shipped in one session. Original GHL ingestion pipeline
audit found that 65% of real calls were being misclassified at webhook time. Fixed root
cause + 6 related reliability gaps + baked operational habits into the repo.

Fixes shipped:
- #1 (7255ed9): Calls misclassification — handleCallCompleted now uses isFailed (proof-based)
                 instead of isGradeable=duration>=45. Adds DB-level upgrade in poll-calls.
                 Adds FAILED→PENDING flip in fetchAndStoreRecording. Backfill SQL applied.
- #2 (7ef3eba): Recording-fetch jobs queue. Replaces in-process setTimeout(90_000) with
                 durable RecordingFetchJob table + 1-min cron. Survives Railway restarts.
- #3 (8b36af3 + 7fee0ca): 28 silent catches replaced with logFailure() across 5 files.
                            25-action vocabulary defined in audit_logs.
- #4 (7658a4a): HMAC signature verification + removed "first tenant" fallback (multi-tenant
                 leak risk).
- P4 (5d9911c): Caught Fix #3 miss in app/api/webhooks/ghl/route.ts during Fix #4 review.
- #5 (814ca50): Postgres advisory lock on poll-calls.ts (prevents concurrent run races) +
                 getGHLClient() in fetchAndStoreRecording (prevents stale token 401s).
- #6 (c63cb03 + f484820): withTenant<TParams>() helper + refactor of 3 representative routes
                           (properties[propertyId] PATCH, tasks[taskId]/complete POST,
                           call-rubrics[id] DELETE/PATCH). Refactor caught a real cross-tenant
                           leak in db.propertyMilestone.findFirst that the Session 12 audit missed.

Verification:
- Live site: All Calls today went from 8 → 23 immediately after Fix #1 + manual grading.
- Lisa Finley 10:17 conversation moved from Skipped → graded (score 63, 617s).
- Fix #2/#3 verified next morning via scripts/verify-bulletproofing.ts.

Going-forward habits committed:
- scripts/check-silent-catches.sh — bash scanner for .catch(() => {}) patterns (found 79 in broader codebase)
- scripts/daily-health-check.ts — morning ritual SQL check on queue + errors + misclassifications
- AGENTS.md route conventions — withTenant is now the default for all new routes

Parked for next session (none blocking team onboarding):
- Refactor recording-jobs script + route to share lib/jobs/process-recording-jobs.ts
- LM tab "227" dial count not aggregating across LM role
- Day Hub vs Calls page count source-of-truth alignment
- Migrate the other ~22 API routes to withTenant (incremental, team work)
- Sweep remaining 79 silent catches in broader codebase (AI pipeline, assistant, client-side)
- Claude grading response parse failures (3 in last 12h — truncated JSON from long transcripts)
- P7 (HIGH): Claude grading response parser doesn't strip ```json``` markdown fences before
  JSON.parse. Caught by Fix #3 audit_logs surfacing — 3 instances in the last 12 hours,
  likely many more historically. Each instance = a call that didn't get graded.
  File: lib/ai/grading.ts. Fix: strip ```json prefix and ``` suffix before parsing.

### Session 30-31 — Bug fixes + AI Intelligence Layer + Role Assistant (2026-04-01 to 2026-04-02)
- 8 bug fixes (calendars, calls, buyers, SMS, property tabs, appointments)
- Call ingestion rewrite (3-layer: webhook + export + per-user search)
- AI Intelligence Layer: 5 new models, playbook loader, context builder, AI log page
- Role Assistant: 17 tools, daily persistence, page context, action cards

### Session 32 — Playbook integration + pgvector + all 74 tools + deep audit (2026-04-02 to 2026-04-03)

**Build:**
- Fixed Railway ESLint build error blocking deployment
- AI logging wired into all 11 touchpoints (was 3)
- Playbook knowledge wired into all 5 AI touchpoints (was 1)
- Weekly user profile auto-generation from call data
- Calibration call UI (star button on call detail)
- pgvector semantic search with OpenAI embeddings
- Assistant expanded to all 74 tools from architecture plan
- Lead Quality section on research tab (for ad agency feedback)
- Deal intel expanded: cost of inaction, walkthrough notes, financial distress, engagement metrics, objection effectiveness, deal red/green flags
- Knowledge tab redesigned: Playbook + User Profiles sub-tabs, editable profiles
- Action rejection learning loop (assistant learns from rejected suggestions)

**Nav + UI:**
- AI Logs moved to Bot icon (next to Settings gear)
- Training, ROI, Disposition hidden from nav
- Disposition, ROI, Training pages still accessible via direct URL

**Deep Audit — 30 issues found and fixed:**
- BROKEN: Calls tab grid, flag scoring button, KPI spend card
- BUG: Appointment toast, GHL 200-on-error, blast overrides not used
- SAFETY: SMS/blast confirmation dialogs added
- DATA: Offer status validation, offer update duplicate fix
- UX: Inventory pagination, outreach toast feedback

**Repo Cleanup:**
- 21 unused npm packages removed (-2,391 lines)
- All 5 TODO comments resolved
- .env.example synced with all 23 env vars
- Root cleaned: START_HERE.md, TECH_STACK.md moved to docs/
- .vscode/, .claude/ added to .gitignore
- Hardcoded secret removed from functions/poll-calls.js
- README.md rewritten, AGENTS.md + DECISIONS.md updated
- Stop hook: auto TypeScript check + push on session end

---

## Known Bugs

| # | Description | Priority | Status |
|---|---|---|---|
| 7 | withTenantContext() RLS not called per-request | MEDIUM | Before multi-tenant production |
| 10 | GHL webhook registration returns 404 | HIGH | Relying on polling fallback |
| 11 | Appointments 401 — scope may need update | HIGH | Investigate GHL scope |
| 12 | GHL API version header may be outdated | MEDIUM | Test newer version |
| 16 | DEV_BYPASS_AUTH references hardcoded slugs | LOW | Clean up before tenant #2 |

All other bugs from sessions 1-32 are resolved.

---

## Next Session — Start Exactly Here

**Task:** Run `npx tsx scripts/daily-health-check.ts` first. If clean, work on the LM "227"
aggregation bug (parked item, highest team-visibility). If errors, investigate before
touching anything else.

Parked items (prioritized):
1. LM tab "227" dial count not aggregating across LM role
2. Day Hub vs Calls page count source-of-truth alignment
3. Grading truncated JSON — consider max_tokens bump in lib/ai/grading.ts (P7 fence-stripping RESOLVED Session 34, but truncation may still occur on very long transcripts)
4. Refactor recording-jobs script + route to share lib/jobs/
5. Migrate ~64 remaining API routes to withTenant (was 72, 8 done in Session 34)
6. Sweep remaining silent catches — lib/ai/ and app/api/ai/ done (Session 34). Remaining dirs: lib/workflows/, lib/ghl/, lib/properties.ts, lib/buyers/, app/(tenant)/, app/api/[tenant]/dayhub/, app/api/admin/, app/api/properties/, app/api/milestones/, scripts/
