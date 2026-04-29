# PROGRESS.md — Gunner AI Build Tracker

> First file Claude Code reads every session.
> "Next Session" tells Claude exactly where to start.
> Older sessions archived in docs/SESSION_ARCHIVE.md.

---

## Current Status

**Current session**: 50 — Wave 3 Session D of v1-finish sprint (2026-04-29)
**Phase**: v1-finish sprint underway. Wave 1 closed Blocker #3 + AUDIT_PLAN P3. Wave 2 closed P4 #3 + #4 (Day Hub dial-count drift). Wave 3 Sessions A+B+C+D migrated 48 routes to `withTenant` (batches 1-4 of 6); 21 latent cross-tenant defense gaps caught and fixed across the four batches (5 + 0 + 16 + 0 — distribution explained by route shape: chained-update class clusters in CRUD-shape routes; GHL passthrough + read-only routes are leak-free). Multi-vendor enrichment live, in-process grading worker live, bug-report system live.
**App state**: Live on Railway
**GitHub**: https://github.com/c7lavinder/Gunner-Claude
**Railway**: https://gunner-claude-production.up.railway.app
**GHL OAuth**: CONNECTED — tenant "New Again Houses" (location: hmD7eWGQJE7EVFpJxj4q)
**Grading worker**: in-process via `instrumentation.ts` → `lib/grading-worker.ts` → `lib/grading-processor.ts` (60s tick). Sole driver as of Wave 1 — legacy `[[services]] grading-worker` removed (Blocker #3 closed). Manual debug surface remains at `app/api/cron/process-recording-jobs/route.ts`.
**Pipeline verifier**: `scripts/verify-calls-pipeline.ts` — bidirectional A/B with sanity gate + canary
**Active blockers**: #2 (Action execution discipline — production verification pending). #3 closed Wave 1.
**Orientation docs**: `docs/SYSTEM_MAP.md` (slow-changing) + `docs/OPERATIONS.md` (fast-changing) replaced ARCHITECTURE / MODULES / TECH_STACK / AI-ARCHITECTURE-PLAN / GUNNER_DAYHUB_CALLS_PROMPT / START_HERE — those now in `docs/archive/`. CLAUDE.md Rule 8 (Living Map Discipline) requires updating SYSTEM_MAP or OPERATIONS in the same commit as any module / page / cron / AI tool / API surface / readable schema field change.

---

## What's Built

| Feature | Status |
|---|---|
| Call grading (7-layer playbook context, Opus 4.6 + extended thinking) | Live |
| Role Assistant (74 tools, propose→edit→confirm flow) | Live |
| AI Coach (playbook-aware) | Live |
| Day Hub (tasks, appointments, inbox, KPIs, in-app GHL action modals) | Live |
| Inventory (200+ fields, deal intel, research tab, vendor intel surfacing) | Live |
| Multi-vendor property enrichment (PropertyRadar primary + BatchData fills + CourtListener + RentCast + RealEstateAPI + Google + Supabase storage) | Live (Sessions 41-42) |
| Property Story generator (auto narrative summary, regen on grading + cron) | Live (Session 39-40) |
| Call detail (coaching, transcript, next steps, property tabs, manual upload) | Live |
| KPI dashboard (score trends, milestones, TCP ranking) | Live |
| Knowledge system (upload, playbook loader, pgvector search) | Live |
| User profiles (auto-generated weekly, editable) | Live |
| Calibration calls (flag good/bad examples, in-context corrections feed) | Live |
| AI logging — tabbed UI (Team Chats / AI Work / Problems) | Live (Session 42) |
| Lead Quality section (A-F grade, ad campaign attribution) | Live |
| Deal intel extraction (100+ fields, 9 categories) | Live |
| Gamification (XP, badges, leaderboard) | Live |
| Workflow engine (triggers, conditions, delayed steps) | Live |
| Bug-report system (persistent floating button + screenshot + admin review page) | Live (Sessions 42-43) |
| Sellers detail page (`/{tenant}/sellers/[id]`) | Live (Sessions 41-42) |
| Nightly aggregates cron (seller portfolio + voice analytics + buyer funnel) | Live (Session 39-40) |
| Disposition hub (buyers, deal blasts, approval gates) | Built, hidden from nav |
| Lead Source ROI | Built, hidden from nav |
| Training hub | Built, hidden from nav |
| Stripe billing | Built, needs env vars to activate |
| Onboarding flow | Built |
| Password reset | Built |
| Tasks page (`/{tenant}/tasks/`) | Legacy — Day Hub is canonical (P4 deletion candidate) |

---

## Session Log (recent — older sessions in docs/SESSION_ARCHIVE.md)

### Session 50 — Wave 3 Session D of v1-finish sprint (2026-04-29)

`withTenant` migration, batch 4 of 6. Twelve routes migrated; **0 latent
defense gaps fixed**. Cool-zone prediction was correct: this batch was the
GHL-passthrough cluster (7 routes under `app/api/ghl/`) plus simple
list/create CRUD (`buyers/route.ts`, `call-rubrics/route.ts`,
`buyers/sync`), one read-only ledger query (`calls/ledger`), and one
already-defense-in-depth route (`kpi-entries`). No find-then-update shape
in any of the 12 routes — the structural diagnosis from Session C held
exactly: "routes that pass through to GHL or do read-only work are cool."

**Routes migrated (alphabetical, batch 4):**

1. `buyers/route.ts` — clean migration. GET list + POST create, no find-then-update.
2. `buyers/sync/route.ts` — clean migration. POST passthrough to GHL + lib helper.
3. `call-rubrics/route.ts` — clean migration. POST `updateMany` was already tenant-scoped.
4. `calls/ledger/route.ts` — clean migration. `resolveEffectiveUser` is duck-typed on `{userId, tenantId}` — passed `ctx` directly, no `getSession()` re-fetch tax (this route doesn't need `userName/userEmail`).
5. `ghl/actions/route.ts` — clean migration. POST → GHL passthrough + auditLog create.
6. `ghl/calendars/route.ts` — clean migration. `tenant.findUnique({ id: ctx.tenantId })` is correct — `Tenant.id` IS the tenant boundary.
7. `ghl/contacts/route.ts` — clean migration. GET → GHL search passthrough.
8. `ghl/phone-numbers/route.ts` — clean migration. GET → GHL passthrough.
9. `ghl/pipelines/route.ts` — clean migration. GET → GHL passthrough.
10. `ghl/reregister-webhook/route.ts` — clean migration. POST → lib helper.
11. `ghl/users/route.ts` — clean migration. GET → GHL + fire-and-forget lib sync.
12. `kpi-entries/route.ts` — clean migration. POST already had defense-in-depth on the property lookup; DELETE already used `deleteMany` with tenantId.

**No new leak-class variants found.** Variants 1-4 from Sessions A+C are
sufficient for this batch's shape coverage — there were no find-then-update
sites to scrutinize. AGENTS.md unchanged.

**No redundancy drops.** None of the 12 routes had the "re-fetch user role"
anti-pattern (admin gating was already done via `hasPermission(role, …)`
on the session role field, not via `db.user.findUnique`). All 6 redundancy
drops in this Wave's tally came from batches 1-3.

**Coverage delta:**
- `withTenant` routes: 55 → **67** (+12)
- `getSession`-direct routes: 39 → **27** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Wave 3 cumulative (sessions A+B+C+D, 48 routes):**
- 21 latent leak sites fixed (5 in batch 1, 0 in batch 2, 16 in batch 3, 0 in batch 4)
- 10 redundancy drops (4 in batch 1, 0 in batch 2, 6 in batch 3, 0 in batch 4)
- ~4 sessions × 12 routes = 48 routes complete; **2 batches remaining (~24 routes)**.

**Cross-batch leak distribution diagnosis confirmed:**
Batches 1+3 hit CRUD/AI clusters (21 leaks combined); batches 2+4 were
GHL/read-only passthroughs (0 leaks combined). Bell curve confirmed —
hot/cool prediction now reliable based on route shape (find-then-update
present = hot; GHL passthrough or read-only = cool). Predictive accuracy
this batch: **12/12 routes correctly classified as cool, 0/0 leaks predicted
vs found**.

**Files changed:**
- 12 route files (in `app/api/buyers/`, `app/api/call-rubrics/`,
  `app/api/calls/ledger/`, `app/api/ghl/` (7 routes), `app/api/kpi-entries/`).
- `PROGRESS.md` — header bumped to Session 50, this entry, coverage stats.
- `OPERATIONS.md` — API surface table updated (55→67 / 39→27).

**Queued cleanup (end of Wave 3, after batch 6):**
- Extend `TenantContext` to include `userName` + `userEmail`; drop the 3
  `getSession()` re-fetch sites (`ai/coach`, `bugs/route.ts`, the
  `resolveEffectiveUser` callers in `dayhub/*` if they need name).
- Refactor `resolveEffectiveUser` to accept `TenantContext` instead of
  legacy `AppSession` (current duck-typing works but is implicit).

**No tsc errors. No production behavior changes** — all 12 routes are
behaviorally identical to before the migration (structural enforcement
only, no semantic changes). Pre-push tsc gate clean.

### Session 49 — Wave 3 Session C of v1-finish sprint (2026-04-28)

`withTenant` migration, batch 3 of 6. Twelve routes migrated; **16 latent
defense gaps fixed** across 6 of those routes. Hot-zone prediction was
correct: the AI assistant cluster (`ai/assistant/execute`) and CRUD-shape
routes (`bugs/[id]`, `buyers/[buyerId]`, `admin/user-profiles`,
`admin/load-playbook`) accounted for all 16 fixes. Cool routes
(`ai/assistant/session`, `ai/coach`, `ai/outreach-action`,
`admin/knowledge`, `bugs/route.ts`) were leak-free as expected.

**Routes migrated (alphabetical, batch 3):**

1. `admin/knowledge/route.ts` — clean migration, 1 ctx.userRole redundancy drop
2. `admin/load-playbook/route.ts` — **1 leak** (`knowledgeDocument.update` by id-only) + 1 redundancy drop
3. `admin/user-profiles/route.ts` — **1 leak** (`userProfile.update` by id-only after tenant-scoped findFirst) + 2 redundancy drops
4. `ai/assistant/execute/route.ts` — **7 leaks across the 13-tool dispatch table**:
   - `log_offer`: `Property.update` by id only
   - `add_internal_note`: id-only `Property.findUnique` → re-merge → tenant-scoped update (read could leak)
   - `update_deal_intel`: same pattern as add_internal_note
   - `set_property_markets`: `Property.update` by id only inside the markets loop
   - `move_buyer_in_pipeline`: `PropertyBuyerStage.updateMany({ buyerId })` without tenantId — `PropertyBuyerStage` has its own tenantId column
   - `update_buyer`: `Buyer.update` by id only after tenant-scoped findFirst
   - `update_user_role`: `User.update` by id only after tenant-scoped findFirst
   - `remove_team_member`: id+userId compound delete on `PropertyTeamMember` without tenantId — switched to `deleteMany` to add tenantId
5. `ai/assistant/route.ts` — clean migration, 1 redundancy drop (used `ctx.userRole` instead of re-fetching `user.role`)
6. `ai/assistant/session/route.ts` — clean migration, 1 redundancy drop
7. `ai/coach/route.ts` — clean migration, retained `getSession()` re-fetch for `userName` (ctx doesn't expose name; queued for end-of-Wave-3 ctx extension)
8. `ai/outreach-action/route.ts` — clean migration
9. `blasts/route.ts` — **1 leak** (`dealBlast.update` by id-only after tenant-scoped findFirst)
10. `bugs/[id]/route.ts` — **5 leak sites** across GET/PATCH/DELETE: three `findUnique({ id })` + JS-side `tenantId !==` comparison anti-pattern; one id-only `update`; one id-only `delete` (switched to `deleteMany`). Plus 1 redundancy drop (the `requireAdmin` helper).
11. `bugs/route.ts` — clean migration, 1 redundancy drop. Retains `getSession()` re-fetch for reporter name/email.
12. `buyers/[buyerId]/route.ts` — **1 leak** (`Buyer.update` by id-only after tenant-scoped findFirst). Predicted hot zone confirmed.

**New leak-class variants codified in AGENTS.md:**

- `findUnique({ where: { id } })` + `bug.tenantId !== ctx.tenantId` JS comparison.
  The DB query is unscoped; the JS guard is the only thing keeping the row
  from leaking. Replaced with `findFirst({ where: { id, tenantId } })`.
- `delete({ where: { compoundUniqueKey } })` without tenantId. Prisma `delete`
  on a unique key doesn't accept extra-key fields. Fix: `deleteMany({ id, tenantId })`.

**ctx.userRole canonical pattern codified.** Six routes had a redundant
`db.user.findUnique({ where: { id: session.userId }, select: { role: true } })`
to gate admin endpoints. `ctx.userRole` is already populated from the JWT
session by `withTenant`. Drops a DB roundtrip per request and removes the
"look up the same user twice" pattern.

**Coverage delta:**
- `withTenant` routes: 43 → **55** (+12)
- `getSession`-direct routes: 51 → **39** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Wave 3 cumulative (sessions A+B+C, 36 routes):**
- 21 latent leak sites fixed (5 in batch 1, 0 in batch 2, 16 in batch 3)
- 10 redundancy drops (4 in batch 1, 0 in batch 2, 6 in batch 3)
- ~3 sessions × 12 routes = 36 routes complete; **3 batches remaining (~36 routes)**.

**Cross-batch leak distribution diagnosis:**
Batch 1 hit the calls cluster (5 leaks); batch 2 was cool (0 leaks);
batch 3 hit the AI-assistant + CRUD cluster (16 leaks). The structural
explanation: routes that follow a "find a record, then mutate that record"
shape are leak hot zones; routes that pass through to GHL or do read-only
work are cool. Bell curve confirmed — batches 4-6 will likely be a mix.

**Files changed:**
- 12 route files (in `app/api/admin/`, `app/api/ai/`, `app/api/blasts/`,
  `app/api/bugs/`, `app/api/buyers/[buyerId]/`).
- `AGENTS.md` Route Conventions — extended with two new leak-class
  variants (id-only findUnique + JS comparison; id-only delete on compound
  unique). Plus the new "Don't re-fetch user role — `ctx.userRole` is canonical"
  sub-section.
- `PROGRESS.md` — header bumped to Session 49, this entry, coverage stats.
- `OPERATIONS.md` — API surface table updated (43→55 / 51→39).

**No tsc errors. No production behavior changes** — every leak fix is
defensive against scenarios that don't currently occur. Pre-push tsc gate
clean.

### Session 48 — Wave 3 Session B of v1-finish sprint (2026-04-28)

`withTenant` migration, batch 2 of 6. Twelve routes migrated. **Zero
latent defense gaps** found — the lower extreme that triggered the
"STOP AND REPORT" check. Diagnosis (also captured below): structural,
not a methodology gap. Batch 2's 12 routes are dominated by GHL
pass-throughs (route reads tenant config, hands off to GHL API, writes
an audit log only — no DB find-then-update on tenant-scoped tables) and
admin gates that already had `getSession()`-direct tenant scoping
elsewhere. The "find a record then mutate that record" shape — the
hot zone for the chained-update leak class — simply isn't present in
this batch.

**Routes migrated:**

1. `app/api/[tenant]/dayhub/tasks/route.ts` (GET + POST)
2. `app/api/[tenant]/dayhub/team-numbers/route.ts` (GET)
3. `app/api/[tenant]/ghl/appointments/route.ts` (GET + POST)
4. `app/api/[tenant]/ghl/notes/route.ts` (POST)
5. `app/api/[tenant]/ghl/tasks/[taskId]/route.ts` (PATCH)
6. `app/api/[tenant]/ghl/workflows/[workflowId]/route.ts` (POST)
7. `app/api/[tenant]/ghl/workflows/route.ts` (GET)
8. `app/api/[tenant]/tasks/[contactId]/details/route.ts` (GET)
9. `app/api/admin/ai-logs/[id]/route.ts` (GET)
10. `app/api/admin/ai-logs/route.ts` (GET)
11. `app/api/admin/embed-knowledge/route.ts` (POST)
12. `app/api/admin/generate-profiles/route.ts` (POST)

**Bonus:** four admin routes (`ai-logs/[id]`, `ai-logs`, `embed-knowledge`,
`generate-profiles`) had a redundant `db.user.findUnique({ where: { id:
session.userId }, select: { role: true } })` to gate admin endpoints.
After migration, `ctx.userRole` is canonical — dropped four DB roundtrips.
Pattern formalized as a Wave 3 convention in batch 3's AGENTS.md update.

**Coverage delta:**
- `withTenant` routes: 31 → **43** (+12)
- `getSession`-direct routes: 63 → **51** (−12)
- Documented exceptions: 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Leak find rate diagnosis (batch 1: 5/12, batch 2: 0/12):** batch 1
hit `app/api/[tenant]/calls/[id]/*` and `calls/bulk-regrade` — every leak
followed the same shape (tenant-scoped find followed by id-only write back).
That's a hot zone for the chained-update class. Batch 2's clusters
(`dayhub/*`, `ghl/*`, `tasks/[contactId]/details`, `admin/*`) are
GHL-pass-through or read-only — no shape match. **This is consistent with
the prompt's hypothesis that "either extreme is a signal worth diagnosing."**
Not a methodology bug. Future batches that touch
`app/api/properties/[propertyId]/*` and `app/api/buyers/*` are predicted
to surface chained-update leaks again (same find-then-update shape).

**No tsc errors. No production behavior changes.**

### Session 47 — Wave 3 Session A of v1-finish sprint (2026-04-28)

`withTenant` migration, batch 1 of 6. Twelve routes flipped from
`getSession()` direct + manual `tenantId` tracking to the `withTenant`
wrapper that makes "forget to scope by tenant" structurally impossible.

**Routes migrated (alphabetical, all under `app/api/[tenant]/*`):**

1. `calls/[id]/ai-edit/route.ts`
2. `calls/[id]/deal-intel/route.ts` — **leak caught**
3. `calls/[id]/generate-next-steps/route.ts` — **leak caught (×2)**
4. `calls/[id]/property-suggestions/route.ts`
5. `calls/[id]/reprocess/route.ts` — **leak caught**
6. `calls/bulk-regrade/route.ts` — **leak caught**
7. `calls/upload/route.ts` — **leak caught (×3 structural)**
8. `dayhub/appointments/route.ts`
9. `dayhub/contact-activity/route.ts`
10. `dayhub/inbox/route.ts`
11. `dayhub/kpis/route.ts`
12. `dayhub/messages/route.ts`

**Latent cross-tenant defense gaps caught + fixed (8 sites across 5 routes):**

- **deal-intel**: `Property.findUnique({ where: { id: call.propertyId } })`
  + `Property.update({ where: { id: call.propertyId } })` — both id-only.
  `call.propertyId` is a foreign key; if it ever pointed at a different-tenant
  property (data corruption upstream), this would leak/overwrite. Both now
  scoped by `tenantId: ctx.tenantId`.
- **generate-next-steps**: two trailing `Call.update({ where: { id: params.id } })`
  calls — id-only after a tenant-scoped findFirst. Now both scoped on update.
- **reprocess**: same id-only `Call.update` pattern. Scoped.
- **bulk-regrade**: `Call.updateMany({ where: { id: { in: callIds } } })` — the
  id list came from a tenant-scoped findMany (so the IDs were all this-tenant),
  but the updateMany didn't re-enforce. Future refactor that broke the upstream
  filter would silently leak. Now scoped.
- **upload**: three `Call.update({ where: { id: callId } })` calls on the
  just-created row. callId came from same-handler `create` so no active leak,
  but defense-in-depth — id-only writes are the wrong pattern regardless.
  All three now scoped.

None of these are known active leaks. They are **structural defense gaps**:
the kind of code that is correct today but one upstream-refactor away from
silently crossing the boundary. Wave 1's lesson + this batch reinforces the
AGENTS.md convention: every db write WHERE needs `tenantId`, even when the
upstream find was already scoped.

**Coverage delta:**
- `withTenant` routes: 19 → **31** (+12)
- `getSession`-direct routes: 75 → **63** (−12)
- Documented exceptions (auth/cron/webhooks/health/diagnostics/vieira/stripe): 16 (unchanged)
- Total `route.ts` files: 110 (unchanged)

**Remaining migration backlog: ~63 routes across batches 2-6.**

**Files changed:**

- 12 route files (in `app/api/[tenant]/calls/...` and `app/api/[tenant]/dayhub/...`).
- `AGENTS.md` Route Conventions — new sub-section "Every db.* WHERE needs
  tenant scope — including chained updates" codifies the leak-class found
  in this batch (find-scoped + update-unscoped pattern). Lists the five
  routes as concrete examples for future agents.
- `PROGRESS.md` — header bumped to Session 47, this entry, coverage stats.

**No tsc errors. No production behavior changes** — every leak fix is
defensive against scenarios that don't currently occur. Pre-push tsc gate
clean. Verification path: spot-check a route via `/api/diagnostics/dial-counts`
or by sending a request with mismatched tenantId param — should now hit a
401 from `withTenant` rather than potentially executing.

### Session 46 — Wave 2 of v1-finish sprint (2026-04-28)

Two display-correctness bugs on the dial-count surface, bundled because both
touched the same aggregation logic. Closed PROGRESS P4 #3 + #4 (the items the
user mapped to Wave-2 P1/P2 — see scope-correction note below).

**Part A — Wave-2 P1: canonical Day Hub "Calls Made" never aggregated for admins.**

`app/(tenant)/[tenant]/day-hub/page.tsx:153` always filtered the calls count
by `assignedToId: userId` regardless of role. The `isAdmin` branch above it
(line 39) only multiplied **goals** by headcount — the actual numerator was
single-user. Result: an admin/owner viewing Day Hub saw their own dials over
a goal scaled to the whole team.

The query also used `createdAt` while `/calls` page ordering, the `/api/[tenant]/dayhub/kpis`
backend, and `app/(tenant)/[tenant]/health/page.tsx` all use `calledAt`.
Webhook lag at midnight boundaries put boundary calls in the wrong day,
pushing the rendered count further out of sync.

**Part B — Wave-2 P2: three surfaces, three queries.**

- `/day-hub/` canonical → `createdAt` + always-single-user (BUG, fixed above).
- `/api/[tenant]/dayhub/kpis` (backs legacy `/tasks/` Day Hub including the
  admin LM/AM/DISPO role tabs) → `calledAt` + role-aware via `userIds=` query
  param. Logic was correct.
- `/calls` page → `calledAt` ordering, JS-side date filter (default 7d).

The fix: extracted `lib/kpis/dial-counts.ts` as the single source of truth.
Three scopes (`all` | `user` | `users`), `calledAt`-pinned, plus convo
helper (graded ≥45s). Both Day Hub surfaces now go through it. Drift can't
recur on the date field or the aggregation rule because there's only one
place to change.

**Scope-correction note (Wave-1-style audit accuracy):**

The Wave-2 prompt referenced "AUDIT_PLAN P1/P2" — those entries did not
exist. The two items lived in `PROGRESS.md` "P4 — Technical debt" #3 + #4
as one-line tech-debt mentions, never authored as AUDIT_PLAN P-entries.
Per Wave-1 lesson ("AUDIT_PLAN P-entries must be authored from a fresh
codebase grep, not from a single-file finding"), Wave 2 added them
retroactively to AUDIT_PLAN as CLOSED entries with the fresh-grep scope.

The other catch from the fresh grep: the "LM tab" only ever existed on the
**legacy /tasks/ Day Hub** (`app/(tenant)/[tenant]/tasks/day-hub-client.tsx`),
not on the canonical `/day-hub/`. The legacy backend at `/api/[tenant]/dayhub/kpis`
was already correct for that tab. The "227 not aggregating" symptom most
plausibly traced to the **canonical /day-hub/ admin bug**, not to the LM
tab itself. Fix on canonical surface fixes the symptom; refactor on the
legacy surface protects against future drift while it sticks around.

**Files changed:**

- `lib/kpis/dial-counts.ts` — new. Wave 2: 80 lines (today + convo helpers).
  Wave 2 follow-up: added `countDialsInRange(scope, range)` primitive so
  multi-day dashboard windows could route through the same module.
- `app/(tenant)/[tenant]/day-hub/page.tsx` — calls/convos count via helper.
- `app/api/[tenant]/dayhub/kpis/route.ts` — calls/convos count via helper.
- `app/(tenant)/[tenant]/dashboard/page.tsx` — callsToday/Week/Month via
  helper (added in Wave 2 follow-up commit; closes the third dial-count
  surface that surfaced during the Wave 2 grep).
- `docs/SYSTEM_MAP.md` §Computed metrics — new entry for `lib/kpis/dial-counts.ts`.
- `docs/AUDIT_PLAN.md` — P1 + P2 added retroactively (status: PATCH SHIPPED,
  verification pending). D-045 (proposed) added for kpi-snapshot.ts
  timestamp-semantics decision.
- `PROGRESS.md` — header bumped to Session 46; P4 #3 + #4 + #7 dropped
  (dashboard fix landed before #7 needed its own wave).

**Commits:**

- `98e5e7d` — Wave 2 (Day Hub canonical + legacy backend, helper extracted).
- `525e8b8` — dashboard fix + AUDIT_PLAN status corrections + D-045 +
  PROGRESS verification checklist. Stacked rather than amended so the
  cadence stays honest (Wave 2 closed the user-listed items; the dashboard
  fix is genuine follow-up work).
- `f0c4de9` — Wave-2 verification infrastructure: token-gated
  `/api/diagnostics/dial-counts` endpoint + fix for a host-TZ bug in
  `lib/dates.ts:getCentralDayBounds`. The TZ bug used
  `new Date(noon.toLocaleString(...))` which silently produced wrong
  bounds on any host not running in UTC — production was lucky (Railway
  is UTC) but local dev / scripts / future Railway region changes were
  one config flip from silent KPI drift. Now uses
  `Intl.DateTimeFormat.formatToParts` and is host-TZ-independent
  (verified across UTC, America/Los_Angeles, America/New_York,
  Europe/London, Asia/Tokyo). No tests added — the project has no test
  framework configured (no jest/vitest/etc.); flagging as a separate
  decision the project owes itself.
- `f8e58bb` — middleware fix: `/api/diagnostics` was being intercepted
  by NextAuth middleware and 307-redirected to `/login` before the
  route handler's bearer-token check could fire. Caught at the post-push
  probe of `f0c4de9`. Fix is a one-line addition to `PUBLIC_PATHS`;
  same pattern as `/api/cron`, `/api/webhooks`, `/api/vieira` (all
  self-gating).

**Verification Owed (gated on Railway env)**

The verification infrastructure is shipped (commits `f0c4de9` + `f8e58bb`),
but `DIAGNOSTIC_TOKEN` must be set on Railway dashboard env before the
endpoint is callable. Until then it returns 401 to all callers (fail-closed
by design — a missing env var is a no-op, not an open door).

Once `DIAGNOSTIC_TOKEN` is set:

```bash
curl -H "Authorization: Bearer $DIAGNOSTIC_TOKEN" \
  "https://gunner-claude-production.up.railway.app/api/diagnostics/dial-counts?tenant=new-again-houses&date=2026-04-27"
```

Expected match against the prior REST-API SQL probe (Session 46 first
verification attempt): `tenantDials=317`, `lmDials=215`. If endpoint
matches → flip P1+P2 to CLOSED and check the boxes below. If it
doesn't → the helper has drift from raw SQL and Wave 2 fix is incomplete.

Original SQL still runnable from Supabase dashboard or any environment
with DB credentials (kept here as redundant verification):

```sql
SELECT
  COUNT(*) FILTER (WHERE assigned_to_id IN
    (SELECT id FROM users WHERE tenant_id=$1 AND role='LEAD_MANAGER'))
    AS lm_dials,
  COUNT(*) AS tenant_dials
FROM calls
WHERE tenant_id = $1
  AND called_at >= (NOW() AT TIME ZONE 'America/Chicago')::date
                     AT TIME ZONE 'America/Chicago'
  AND called_at <  (NOW() AT TIME ZONE 'America/Chicago')::date + INTERVAL '1 day'
                     AT TIME ZONE 'America/Chicago';
```

Three numbers must match (for the same role scope + 2026-04-27 CT, the
date used for the verification window since 2026-04-28 had just rolled
over with no business activity yet):

- [x] DB count (via Supabase REST + service-role): tenant=**317**, LM=**215**
- [x] Day Hub render (via /api/diagnostics/dial-counts helper path): tenantDials=**317**, lmDials=**215**
- [x] Calls page render (same `calledAt` window, < 500 take limit so list = count): **317**

Verified 2026-04-28 via curl against
`/api/diagnostics/dial-counts?tenant=new-again-houses&date=2026-04-27`.
Helper `lib/kpis/dial-counts.ts countDialsInRange` returned identical
counts to the SQL ground truth probe. CDT bounds correctly computed
(`2026-04-27T05:00:00.000Z` → `2026-04-28T04:59:59.999Z`).

Result → P1 + P2 flipped to CLOSED in AUDIT_PLAN.md.

### Session 45 — Wave 1 of v1-finish sprint (2026-04-27)

Two-item bundle on the AI/worker layer. Both items closed in a single commit
because both touch `lib/ai/` + worker infra and both were narrow code surgery
with low risk.

**Part A — Blocker #3: dual grading worker · CLOSED.**

- Removed `[[services]] grading-worker` block (8 lines) from `railway.toml`.
- Deleted `scripts/grading-worker.ts` (now-orphaned standalone entry).
- Kept `scripts/process-recording-jobs.ts` as manual debug surface (also
  reachable via `app/api/cron/process-recording-jobs/route.ts` HTTP wrapper).
- `instrumentation.ts` → `lib/grading-worker.ts` → `lib/grading-processor.ts`
  is now the sole grading path. Atomic claim no longer protecting against a
  second worker — protecting against future re-introduction.
- Post-deploy verification owed within 30 min: confirm Railway `grading-worker`
  service goes away + heartbeat audit rows continue at ~1/min single source.

**Part B — AUDIT_PLAN P3: AI model date-pin standardization · CLOSED.**

- Swept all `claude-sonnet-4-20250514` → `claude-sonnet-4-6` across **9
  occurrences in 5 files** (5× larger than the AUDIT_PLAN P3 entry suggested):
  `lib/ai/enrich-property.ts`, `app/api/[tenant]/calls/[id]/property-suggestions/route.ts`,
  `app/api/[tenant]/calls/[id]/generate-next-steps/route.ts`,
  `app/api/properties/[propertyId]/blast/route.ts`.
- Post-sweep grep returns ZERO hits for the date-pinned identifier.
- Final inventory: 13 Sonnet 4.6 callers + 4 Opus 4.6 callers, no drift.
- Did NOT touch the Sonnet/Opus role assignment — Wave 1 was strictly a
  date-pin sweep. The current Sonnet (conversation) / Opus (high-stakes
  extraction) split is the stability-first split per D-044 (DECISIONS
  writeup deferred to Wave 4).

**Lessons captured for future audits:**

- The AUDIT_PLAN P3 entry was authored from a single-file finding
  (`lib/ai/enrich-property.ts:57`) — the actual contagion was 5× wider.
  **AUDIT_PLAN entries must be authored from a fresh codebase grep**, not
  from an isolated observation. Updated AUDIT_PLAN P3 closure note codifies
  this.
- The original prompt for Wave 1 stated the rule as "grading → Sonnet,
  coaching → Opus" — exactly inverted from the code's current Opus / Sonnet
  split. Stop-and-report caught the contradiction before any code flipped.
  Future model-policy work should grep before stating the rule.

**Companion doc updates in this commit:**

- `AUDIT_PLAN.md` — Blocker #3 → CLOSED with post-deploy verification queries;
  P3 → CLOSED with corrected scope + lesson note.
- `SYSTEM_MAP.md` §6 — enrich-property table row updated to post-sweep state;
  added rows for the 4 API routes that also call Sonnet 4.6 + audit script
  (Opus 4.6); D-0XX renamed D-044 (driver provided = stability-first), full
  writeup still pending Wave 4.
- `PROGRESS.md` — header bumped Session 44 → 45; Active Blockers updated;
  this entry added.

### Session 44 — Docs reorganization sprint (2026-04-27)

The sprint that was the session. 8 commits, `ea02beb..f1284f3`, replacing
the rotted ARCHITECTURE / MODULES / TECH_STACK / AI-ARCHITECTURE-PLAN /
GUNNER_DAYHUB_CALLS_PROMPT / START_HERE orientation surface with two
living docs (`docs/SYSTEM_MAP.md` slow-changing + `docs/OPERATIONS.md`
fast-changing) plus the Rule 8 discipline that keeps them honest.

**Reconnaissance findings caught during the sprint** (the part that
exceeded the cleanup value):

- 70-commit drift between local PROGRESS (Session 38) and remote (Session 43)
  — sprint started with a rebase to absorb Sessions 39-43.
- **Dual grading worker contradiction** — `instrumentation.ts` in-process
  AND legacy `[[services]] grading-worker` both running. Atomic claim
  prevents double-grading. Logged as **Blocker #3** in AUDIT_PLAN.
- AGENTS.md "Background Worker Conventions" stale post-Session-42 in-process
  move. Rewritten in Commit #1.
- AI model state hybrid — Opus 4.7-era prompt config (32k tokens, extended
  thinking, 50 prior calls) intentionally retained even though model strings
  reverted to Opus 4.6 in `598f852`. Logged as **PENDING D-0XX** in AUDIT_PLAN.
- `assign_contact_to_user` bypasses propose-edit-confirm UI flow that gates
  the other 12 action types. Logged as **P5** in AUDIT_PLAN.
- `claude-sonnet-4-20250514` date-pinned snapshot in `lib/ai/enrich-property.ts`
  drifted from the `claude-sonnet-4-6` baseline. Logged as **P3** in AUDIT_PLAN.
- `/{tenant}/tasks/` legacy page kept around because Chris bookmarked it.
  Logged as **P4** in AUDIT_PLAN.
- 6 of 7 crons missing `cron.<name>.started/finished` heartbeat audit row
  pattern (only `process_recording_jobs` has it). Captured in OPERATIONS
  heartbeat coverage table; tracked as Bug #23.
- `poll-calls` "heartbeat" claim was a per-tenant timestamp lock (Session 35
  pgbouncer fix), not an audit-row heartbeat — doc-review catch in OPERATIONS §1.
- 3 stale doc references (CLAUDE.md Rule 8 body, AGENTS.md x2, lib/ai/scoring.ts:30)
  preemptively repointed in Commit #4 so Commit #5 archive could be a clean
  `git mv` with a zero-hit gate grep.
- Local env was stale post-rebase — false tsc errors until `npx prisma generate
  && npm install`. Codified as a hygiene ritual in OPERATIONS.

**Commits (chronological):**

- `077ef41` **#0** — CLAUDE.md Rule 8 (Living Map Discipline) + 6th end-of-session checklist item.
- `6f37ce8` **#1** — AGENTS Background Worker Conventions rewrite (instrumentation.ts as primary) + PROGRESS catch-up to Session 43 + AUDIT_PLAN Blocker #3 + grading.ts:204 stale Opus 4.7 comment fix. 5 files.
- `94f526b` **#2** — `docs/SYSTEM_MAP.md` (506 lines, slow-changing canonical) + AUDIT_PLAN P5.
- `dc53112` **#3** — `docs/OPERATIONS.md` (421 lines, fast-changing operational state — crons, pages, API surface 109/19/75/15, scripts, blockers, schema log, worker observability with admin tenant-spanning queries, hygiene rituals, incident notes).
- `39c528e` **#4** — README rewrite (164 → 29 lines, agent-focused) + CLAUDE/AGENTS pointer updates + lib/ai/scoring.ts comment update.
- `089ed61` **#5** — `git mv` 6 superseded docs into `docs/archive/`. Pre-archive gate grep returned zero hits.
- `a46bd46` **#6** — delete orphan `functions/poll-calls.js`.
- `f1284f3` **#7** — `git mv API_FIELD_INVENTORY.md docs/` + strip stale "(after sprint Commit #7)" pointers.
- (this commit) **#8** — sprint wrap-up: PROGRESS header → COMPLETE, Session 44 entry, Next Session rewrite, OPERATIONS baseline anchor bump.

**Conventions added by the sprint** (worth highlighting because future sessions
should follow them):

- Pre-flight `git log --oneline <baseline>..HEAD` before each push — surfaced
  the 70-commit drift on Commit #0 push attempt; would have caught silent
  drift any time after.
- Pre-archive gate grep — strict zero-hit requirement for active surfaces
  before `git mv`-ing a doc.
- Doc-only commits paste back diff before pushing; code-touching commits
  must pass `npx tsc --noEmit` (enforced by pre-push hook).
- Trailer dropped: `Co-Authored-By: Claude Opus 4.7 (1M context)` → no trailer,
  starting Commit #2.

### Session 43 — Bug-report v2 + grading empty-shell fix (2026-04-26)

Bullet-level reconstruction from git log. No detailed session notes existed — this is the catch-up.

- `4840c52` fix(grading): stop creating empty-shell FAILED + PENDING calls — addresses
  the structural bug behind PROGRESS bug #22 at the create site, not just the cleanup
  pass. New shells should not enter the database.
- `8e13fb3` feat(bugs): attach screenshot to bug-report button — adds base64 image data
  URL field to BugReport (migration `20260427000000_add_bug_screenshot`). Cap is
  ~7.5MB at the API boundary (`MAX_SCREENSHOT_BYTES` in `app/api/bugs/route.ts`).

### Session 42 — Enrichment refinement + AI logs UI + bug-report v1 (2026-04-24)

Bullet-level reconstruction from git log.

- `0f6bd2b` refactor(enrichment): PropertyRadar is primary data source, BatchData
  fills gaps on every lead. Replaces the Session-41 single-vendor-first approach with
  a dual-source merge.
- `8fbdd5f` fix(enrichment): per-vendor isolation + reliable orchestrator invocation.
  Vendor failures no longer take down the whole orchestrator.
- `f452e7f` feat(ai-logs): tabbed UI (Team Chats / AI Work / Problems) with plain-English
  labels at `/{tenant}/ai-logs`. Admin-facing.
- `5c90e24` feat(bugs): persistent bug-report button (`components/ui/floating-bug-button.tsx`)
  + admin review page (`app/(tenant)/[tenant]/bugs/`). Schema migration
  `20260424000000_add_bug_reports`.

### Session 41 — Multi-vendor enrichment pipeline (2026-04-23)

Bullet-level reconstruction from git log. The big build day for the enrichment overhaul.
Net result: ~doubled property field coverage; -92% projected BatchData spend.

- `f2b7628` feat(enrichment): multi-vendor property + seller pipeline (initial
  orchestrator across PropertyRadar, BatchData, RentCast, RealEstateAPI, CourtListener,
  Google, Supabase storage in `lib/enrichment/`).
- `32771fd` fix(courtlistener): scope by state + exact-name filter.
- `f3855c0` feat(ui): surface distress/MLS/court data across inventory + seller UIs.
- `dde3176` fix(enrichment): `buildDenormUpdate` now writes beds/baths/sqft + tax basics
  (was missing from initial build).
- `933d28b` feat(enrichment): PropertyRadar detail + `/persons` fetch (~10 fields/property).
- `2c88541` feat(enrichment): capture all vendor fields — nearly doubles property coverage.
- `53b83c4` feat(inventory): comprehensive vendor intel in property detail UI.
- `3b9ba70` fix(enrichment): manual create + re-enrich routes now fire vendor orchestrator
  (previously skipped the orchestrator path).
- `29b2d15` fix(courtlistener): upgrade V3 → V4 + leads-today audit scripts
  (`scripts/check-todays-leads.ts`, `check-today-leads.ts`).
- `fada00b` feat(enrichment): gate BatchData behind PropertyRadar motivation signals
  (projected -92% BatchData spend).

### Session 39-40 — API field inventory + schema wave 1 + inventory redesign (2026-04-22 to 2026-04-23)

> Detailed entry archived in `docs/SESSION_ARCHIVE.md`. Summary kept here for cross-reference:

- `API_FIELD_INVENTORY.md` authored — vendor-by-vendor field comparison
  (PropertyRadar, RealEstateAPI, RentCast, BatchData) informing Wave 1 schema design.
- Schema Wave 1 — 80+ columns across Property, PropertySeller, PropertyBuyer, Call.
- Inventory UI redesign — Property Story generator, cash-hero matrix, persistent
  cross-tab side panel.
- Nightly aggregates cron (`compute-aggregates`) — seller portfolio + voice analytics
  + buyer funnel.
- Self-driving grading worker via `instrumentation.ts` (commit `6cb5c0a`) +
  `lib/grading-worker.ts` + `lib/grading-processor.ts` — primary grading loop
  moved in-process. Legacy `[[services]] grading-worker` not removed (Blocker #3).
- AI model churn (Opus 4.7 → Opus 4.6 with 4.7-era prompt config) — see PENDING
  D-0XX in `docs/AUDIT_PLAN.md`.

---

## Known Bugs

| # | Description | Priority | Status |
|---|---|---|---|
| 7 | withTenantContext() RLS not called per-request | MEDIUM | Before multi-tenant production |
| 10 | GHL webhook registration returns 404 | HIGH | Relying on polling fallback |
| 11 | Appointments 401 — scope may need update | HIGH | Investigate GHL scope |
| 12 | GHL API version header may be outdated | MEDIUM | Test newer version |
| 16 | DEV_BYPASS_AUTH references hardcoded slugs | LOW | Clean up before tenant #2 |
| 17 | callResult `no_answer` never rewritten to `short_call` when cron routes <45s call to SKIPPED. Surfaced 4× in Session 37 verifier Pass B. | MEDIUM | Either fix in cron processor or update spec to accept both for short calls |
| 18 | 2487 `calls` rows have `source IS NULL` (oldest 2026-03-21, newest 2026-04-18, **0 in last 24h**). Likely from `scripts/recover-stuck-calls.ts` not setting source. | LOW | One-time `UPDATE` to backfill `source='recovery'`; grep `db.call.create` to add `source` to all script callsites |
| 19 | One legacy row `cmo4o88zn0raqn5nzaboykobe` (ghlCallId `VyCnm5DBNBVFfipIo0FR`) — non-wf_ id GHL doesn't recognize, source/contactId/duration all null. | LOW | Single instance, no production impact. Origin worth understanding (covered by #18 backfill) |
| 20 | Deal intel parser has a markdown-fence regression — `` ```json `` not stripped. Session 34 `stripJsonFences()` fix covers grading only. Calls still grade cleanly; deal intel returns 0 proposed changes. Observed 6× across Session 38 manual drains. | MEDIUM | Extract stripJsonFences into a shared util and use in lib/ai/extract-deal-intel.ts |
| 21 | Sentiment/sellerMotivation type coercion incomplete — Claude occasionally returns strings ("positive", full prose paragraphs) where Prisma expects Float. Prior fix `79e916e` missed some shapes. Surfaced 4× in the 04:14-04:28 UTC window today. | MEDIUM | Normalize in `parseGradingResponse()` before the `db.call.update` — string→null mapping for these fields |
| 22 | 24 empty-shell FAILED rows from 2026-04-20 have `ghlContactId=NULL`, `recording_url=NULL`, `duration=NULL`. Pre-existing structural issue — GHL fires call-like webhooks with no payload content. Fix 1 (Session 38 `a77911c`) prevents NEW ones but does not remediate these 24. | LOW | One-time `UPDATE calls SET gradingStatus='SKIPPED' WHERE gradingStatus='FAILED' AND recording_url IS NULL AND tenantId=(…)` to clean up |
| 23 | Railway `[[cron]] process-recording-jobs` would not self-register even after no-op redeploy. Workaround: converted to `[[services]] grading-worker` long-running worker (Session 38). Unknown if poll-calls, daily-audit, daily-kpi-snapshot, weekly-profiles crons are at risk of the same failure. | MEDIUM | Add per-cron heartbeat audit rows (same pattern as `1c8befe`) so a similar silent outage is immediately visible |
| 24 | Body-size gap on `/api/ai/assistant/execute` — `editedInput` is `z.record(z.unknown()).optional()`, no content-length check. Malicious/malformed client could POST multi-MB payloads that bloat audit_logs. | LOW (P2) | Logged in AUDIT_PLAN.md. Follow-up: tighter per-action zod schemas across all endpoints, not piecemeal |

All other bugs from sessions 1-32 are resolved.

> Note: bug #13, #14, #15 (cross-tenant data leaks) were resolved in Session 33
> via the `withTenant<TParams>()` helper (commit `c63cb03`) and the 3-route refactor
> template (commit `f484820`) — already removed from this table per AGENTS.md.

---

## Next Session — Start Exactly Here

**Status as of 2026-04-27 (post-Wave-1):** v1-finish sprint Wave 1 closed
Blocker #3 (dual grading worker) and AUDIT_PLAN P3 (date-pin sweep). Docs
reorg sprint is also closed (Session 44 above). Production code state has
2 small touches from Wave 1: `railway.toml` block removal + 9 model-string
replacements across 5 files. Pre-push tsc gate stayed clean.

**Post-Wave-1 verification owed (within 30 min of deploy):**
- Railway dashboard: confirm `grading-worker` standalone service goes away.
- Heartbeat audit rows continue at ~1/min from a single source (was ~2/min
  pre-Wave-1 from two sources):
  ```sql
  SELECT COUNT(*) AS ticks, MAX(created_at) AS last_seen
  FROM audit_logs
  WHERE action = 'cron.process_recording_jobs.started'
    AND created_at > NOW() - INTERVAL '5 minutes';
  ```
- Grading queue does not back up over 24h (in-process loop carries the load).

**P1 — Blocker #2 production verification (deferred 6 sessions):**
The AI Assistant propose→edit→confirm flow was coded in Session 38 (commits
`15fe184` — `5203539`) but never validated end-to-end on live Railway with
real GHL data. Three validation paths in order of safety:
1. **Cancel-path only** for high-stakes types (send_sms, send_email,
   change_pipeline_stage, create_contact, update_contact, create_opportunity) —
   proves UI + preview + merge + modal without GHL writes.
2. **GUNNER TEST contact** in GHL for a single end-to-end SMS proof.
3. **Real contact** for medium/low-stakes types (add_note, create_task,
   update_task, complete_task, opp status/value) — no outbound seller visibility.

Start with path 1 on the live URL. If that works, escalate to path 2.

**P2 — Worker health verification (still owed from Session 38, now also the Wave-1 post-deploy gate):**
```sql
SELECT action, COUNT(*)::int AS count, MAX(created_at) AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int AS seconds_since
FROM audit_logs
WHERE action LIKE 'cron.process_recording_jobs.%'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY action;
```
Expected: one `started` + one `finished` per minute (single source post-Wave-1,
was double-source pre-Wave-1). If `last_seen` > 120s, the in-process worker is
down — escalate per Session 38 notes.

**P3 — Known bugs (in severity order):**
1. Bug #20 — deal-intel parser doesn't strip markdown fences. Extract
   `stripJsonFences()` into `lib/ai/stripJsonFences.ts`, use in
   `lib/ai/extract-deal-intel.ts`.
2. Bug #21 — sentiment/sellerMotivation type coercion incomplete. Normalize
   in `parseGradingResponse()` before `db.call.update`.
3. Bug #17 — `no_answer` never rewritten to `short_call` in cron processor.
4. Bug #23 — add heartbeat audit rows to the other crons (poll-calls,
   daily-audit, daily-kpi-snapshot, weekly-profiles, regenerate-stories,
   compute-aggregates).
5. Bug #18 — one-time backfill: `UPDATE calls SET source='recovery' WHERE source IS NULL`.
6. Bug #22 — one-time cleanup: 24 empty-shell FAILED rows. Session 43
   commit `4840c52` closes the create-site root cause; the 24 existing rows
   still need the `UPDATE … SET gradingStatus='SKIPPED'` cleanup.

**P4 — Technical debt:**
1. Migrate remaining 27 API routes to `withTenant` helper (down from 75 pre-migration; batches 1-4 of 6 closed Sessions 47-50, 21 latent leaks fixed).
2. Sweep remaining silent catches in broader codebase (79 total).
3. ~~Align Day Hub vs Calls page call count source-of-truth.~~ ✅ Closed Wave 2 (Session 46).
4. ~~Fix LM tab "227" dial count aggregation across LM role.~~ ✅ Closed Wave 2 (Session 46).
5. P4 from AUDIT_PLAN — delete legacy `/{tenant}/tasks/` page (coordinate with Chris).
6. P5 from AUDIT_PLAN — `assign_contact_to_user` UI flow vs route discrepancy.
7. ~~Dashboard `/{tenant}/dashboard/page.tsx:127-135` still uses `createdAt` for callsToday/Week/Month + tenant-wide.~~ ✅ Closed in Wave 2 follow-up (Session 46) — same helper, new `countDialsInRange` primitive. Verification pending alongside P1+P2.

**Railway + Logging:** Railway API token noted invalid in Session 38 — request
a fresh one if the post-Wave-1 verification (P2) needs Railway dashboard access.
