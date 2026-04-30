# AUDIT_PLAN.md — Gunner AI

> Living audit/build plan. Updated as blockers clear and new ones surface.
> This file is an index; detailed evidence lives in `docs/audits/`.

## Blockers

### Blocker #1 — Call pipeline integrity · ✅ CLEARED (2026-04-20)

Proof: `scripts/verify-calls-pipeline.ts` runs bidirectionally:
- **Pass A (DB → GHL integrity):** 29/30 on last run. The one ❌ is a known
  legacy row (bug #19).
- **Pass B (GHL → DB coverage):** 20/25 after sampling tightening. Remaining
  drift is bug #17 (no_answer/short_call) and one genuine missing row.
- **Sanity gate:** 5/5 source-tagged SKIPPED rows verify against GHL per run.
- **Canary:** `calls WHERE source IS NULL` = 2487 total, **0 in last 24h**
  (bug #18 — taper, not active leak).
- **Rollout diagnostic:** 10/10 PASS on last 10 calls ≥45s in past 7 days.
  Confirms both 45-89s summary path and 90s+ full-grade path are live.

See PROGRESS.md Session 37 for the four-commit build history
(`4921397` → `c013ffe`).

### Blocker #2 — Action execution discipline · IN PROGRESS

Evidence base: [docs/audits/ACTION_EXECUTION_AUDIT.md](audits/ACTION_EXECUTION_AUDIT.md)

22 GHL write call sites inventoried and scored on UX compliance,
Reliability, Safety, and Observability. Three hard blockers:

1. **Assistant Edit button is a dead UI element.** `coach-sidebar.tsx:301-303` —
   no `onClick`, fields rendered as read-only `<span>`, server only accepts
   `{ toolCallId, pageContext, rejected? }`. All 7 AI-assistant action types
   execute whatever the AI proposed, verbatim. Violates the propose → edit →
   confirm spec. Highest-leverage single fix in the audit.
2. **Deal blast missing `requireApproval`.** `/properties/[propertyId]/blast`
   sends SMS/email to N buyers with no approval gate — direct violation of
   AGENTS.md rule on bulk SMS to >10 contacts.
3. **Webhook register silent catch.** `deleteWebhook.catch(() => {})` in
   `lib/ghl/webhook-register.ts:25` swallows errors with no audit trail.
   Likely explains why PROGRESS.md bug #10 (webhook registration 404) has
   persisted undiagnosed.

Plus 12 non-blocking ⚠️ rows and a systemic observability gap (17 of 22 GHL
writes skip `audit_logs` entirely).

### Proposed fix sequence for Blocker #2

1. **2-line fix:** replace `deleteWebhook.catch(() => {})` with `logFailure`
   in `lib/ghl/webhook-register.ts`. Surfaces bug #10.
2. **One import:** add `requireApproval` gate to the deal-blast route.
   Closes the AGENTS.md rule violation.
3. **Biggest lift:** wire the Edit button in `coach-sidebar.tsx` + accept
   `editedInput` server-side in `/api/ai/assistant/execute`. Unblocks the 7
   assistant action types.
4. **Sprint-scale cleanup:** add a `logGhlAction(...)` helper and call it
   from every GHL-write endpoint (success + failure) to close the systemic
   audit gap.

Items 1-3 clear the hard blockers. Item 4 is ongoing hygiene.

### Blocker #3 — Dual grading worker · ✅ CLOSED (2026-04-27, Wave 1 of v1-finish sprint)

`[[services]] grading-worker` block removed from `railway.toml` and
`scripts/grading-worker.ts` deleted. `instrumentation.ts` now sole driver of
`runGradingProcessor()` (in-process, every 60s, single-flight + hot-reload guard).
Manual debug trigger remains at `app/api/cron/process-recording-jobs/route.ts`.

**Post-deploy verification owed (within 30 min of Wave 1 push):**
1. Railway dashboard: confirm `grading-worker` service goes away on next deploy.
2. Heartbeat query — should still tick every ~60s, but now from a single source:
   ```sql
   SELECT COUNT(*) AS ticks, MAX(created_at) AS last_seen
   FROM audit_logs
   WHERE action = 'cron.process_recording_jobs.started'
     AND created_at > NOW() - INTERVAL '5 minutes';
   ```
   Expected: ~5 rows (one per minute, single source) instead of ~10 (two sources).
3. Watch grading queue for 24h. If `gradingStatus='PENDING'` count grows without
   bound, the in-process loop has a reliability issue — re-add the standalone
   service as fallback while investigating.

## Audits completed

| Audit | Date | Location |
|---|---|---|
| Call pipeline bidirectional verification | 2026-04-20 | `scripts/verify-calls-pipeline.ts` + PROGRESS.md Session 37 |
| Action execution inventory (22 GHL writes) | 2026-04-20 | [docs/audits/ACTION_EXECUTION_AUDIT.md](audits/ACTION_EXECUTION_AUDIT.md) |

## Audits queued

- **Silent-catch sweep** — 79 matches across broader codebase per Session 33; work started but not finished. Row 22 of the action audit is an example of one that slipped through.
- ~~**`withTenant` migration** — ~64 routes still on manual `tenantId` tracking per PROGRESS.md.~~ ✅ **CLOSED Wave 3** (2026-04-29). All 91 tenant-scoped routes now use `withTenant`; 38 latent cross-tenant defense gaps fixed across 4 leak classes (catalogued in AGENTS.md). Helper-level Class 4 vector closed in Session G commit 1 (6 lib helpers now take `tenantId` explicitly). 19 documented exceptions remain (auth/cron/webhooks/etc., listed in OPERATIONS.md "non-tenant-session routes").
- **Poll cron liveness on Railway** — blocked on fresh Railway API token. Largest diagnostic gap.
- **`source IS NULL` backfill** — one-time SQL plus scripted write-path audit to ensure no future untagged rows.
- **Railway log ingestion** — no visibility into cron stdout/stderr today. Blocker for catching issues the verifier's audit_log query doesn't see.

## Living state

The verifier is rollout-ready as a recurring health check — good candidate for a daily cron or pre-deploy gate. When bugs #17-19 are resolved, the one ❌ on Pass A goes away and the bucket-mismatch ❌s on Pass B disappear. A clean Pass A + Pass B (both hitting targets) is the acceptance test for pipeline-level work.

Blocker #2 work should target the 4-step fix sequence above, in order. Each step is independently reviewable; no big-bang refactor.

## Priority items (non-blocking)

**P1 — Day Hub LM dial-count aggregation · ✅ CLOSED (Wave 2, commits `98e5e7d` + `6fe3010`, verified 2026-04-28 via /api/diagnostics/dial-counts).**
Three-number reconciliation passed. Endpoint response for 2026-04-27 CT
returned `tenantDials: 317, lmDials: 215` — exact match with the SQL
ground-truth probe from earlier in Session 46. Helper math
(`lib/kpis/dial-counts.ts countDialsInRange`) confirmed equal to raw
SQL via the same `calledAt` window + `assigned_to_id IN (LM ids)` filter.

Authored retroactively from a fresh codebase grep — the original Wave-2 prompt
referenced "AUDIT_PLAN P1" but no such entry existed; the item lived as a
one-line tech-debt mention in PROGRESS.md ("Fix LM tab '227' dial count
aggregation across LM role"). The fresh grep resolved the symptom to a
different surface than the prompt suggested:

- The "LM tab" (admin role tabs ADMIN/LM/AM/DISPO) only exists on the **legacy**
  `/{tenant}/tasks/` Day Hub (`app/(tenant)/[tenant]/tasks/day-hub-client.tsx:641`).
  Its backend `/api/[tenant]/dayhub/kpis/route.ts` was already correct: passes
  `userIds=` of all LEAD_MANAGER users → `assignedToId: { in: [...] }`.
- The canonical `/{tenant}/day-hub/` (Rule 3 surface) had no role tabs but **did**
  have a related bug: `app/(tenant)/[tenant]/day-hub/page.tsx:153` always filtered
  by `assignedToId: userId` regardless of admin status. Admin/owner saw their
  own calls, not the team total — the most plausible source of the "227 not
  aggregating" complaint.
- Both surfaces also drifted on the date field: canonical Day Hub used
  `createdAt`, legacy /tasks/ backend used `calledAt` (canonical), so even a
  same-user count could differ at midnight boundaries.

Fix: extracted `lib/kpis/dial-counts.ts` (calledAt-pinned, three scopes:
`all` / `user` / `users`) and routed both surfaces through it. Canonical Day
Hub now aggregates tenant-wide for admin/owner and per-user for everyone else.
Legacy `/tasks/` Day Hub backend keeps its existing role-tab semantics but
now goes through the same helper, so the two can't drift again on date field
or aggregation rule.

**Lesson:** symptom narration ("LM tab 227") doesn't always pin the surface —
the canonical /day-hub/ doesn't have an LM tab at all, but does have the
admin-aggregation bug that produced the symptom. Fresh grep before fixing
caught this; same Wave-1 discipline.

**P2 — Day Hub vs Calls page call-count source-of-truth · ✅ CLOSED (Wave 2, commits `98e5e7d` + `525e8b8` + `6fe3010`, verified 2026-04-28 via /api/diagnostics/dial-counts).**
Same diagnostic endpoint, same response (317 / 215) confirmed both Day
Hub surfaces (canonical + legacy `/tasks/`) and the dashboard now share
one query path through `lib/kpis/dial-counts.ts countDialsInRange`. The
`/calls` page is a list view (no separate count query) but uses the same
`calledAt` field as canonical timestamp, matching the helper's contract.

Same retroactive-authoring caveat as P1. The fresh grep found three surfaces
with three different queries:

| Surface | Date field | User filter |
|---|---|---|
| `/day-hub/` canonical | `createdAt` | always single-user (BUG) |
| `/api/[tenant]/dayhub/kpis` (legacy /tasks/) | `calledAt` | role-aware via `userIds` |
| `/calls` page | `calledAt` | tenant-wide list, JS-side date filter (default 7d) |

The `/calls` page is a list view ordered by `calledAt desc, take: 500` — no
shared count query to refactor, but its filter semantics (calledAt-based)
became the canonical contract that the helper enforces.

Fix: same shared helper as P1. Both Day Hub surfaces now use `calledAt`,
matching `/calls` and `app/(tenant)/[tenant]/health/page.tsx`.

**Wave-2 follow-up (2026-04-28):**
- `app/(tenant)/[tenant]/dashboard/page.tsx:127-135` (callsToday/Week/Month)
  was the same drift family. Routed through `lib/kpis/dial-counts.ts` via
  the new `countDialsInRange(scope, range)` primitive — tenant-wide scope,
  `calledAt`-pinned. Same patch-shipped/verification-pending status as P1+P2.
- `scripts/kpi-snapshot.ts:40-42, 84` uses `createdAt` for nightly snapshots.
  Whether to switch to `calledAt` is debatable (snapshot semantics vs call
  semantics) — logged as **D-045 (proposed)** below; needs Corey decision.

**P3 — AI model date-pin standardization · ✅ CLOSED (Wave 1, commit `047ca18`, 2026-04-27).**
Original entry scoped only `lib/ai/enrich-property.ts:57` — the actual scope
discovered during Wave 1 was **9 occurrences of `claude-sonnet-4-20250514`
across 5 files** (5× larger than the AUDIT_PLAN entry suggested):
- `lib/ai/enrich-property.ts` (×2)
- `app/api/[tenant]/calls/[id]/property-suggestions/route.ts` (×2)
- `app/api/[tenant]/calls/[id]/generate-next-steps/route.ts` (×2)
- `app/api/properties/[propertyId]/blast/route.ts` (×3)

All swept to `claude-sonnet-4-6`. Post-sweep grep returns zero hits for the
date-pinned identifier. Final inventory: 13 Sonnet 4.6 callers + 4 Opus 4.6
callers, no drift. **Lesson:** AUDIT_PLAN P-entries should be authored from
a fresh codebase grep, not from a single-file finding. Future P-entries
require explicit scope verification via grep before being written.

**P4 — `app/(tenant)/[tenant]/tasks/` deletion candidate · ⏸ DEFERRED — v1.1 sprint candidate (Wave 5, commit `9d6f7ae`).** Day Hub
(`app/(tenant)/[tenant]/day-hub/`) is the canonical Tasks/Day Hub surface per
CLAUDE.md Rule 3 (Single Settings Hub — section 7 Day Hub). The `/tasks/` page
is older and kept around because at least one user (Chris) still has it
bookmarked. Deleting `/tasks/` enforces "one canonical surface" and reduces
split-brain risk on KPI source-of-truth bugs (currently in PROGRESS as a
parked tech-debt item). Coordinate with Chris before removal.

**Wave 5 attempt (2026-04-29) — STOPPED, not closed.** Investigation
discovered `/tasks/` is still wired as the canonical "Day Hub" link in
production code, contradicting the assumption that traffic had migrated:
- `components/ui/top-nav.tsx:66` — `{ href: \`${base}/tasks\`, label: 'Day Hub' }`
- `health/page.tsx`, `ai-logs/page.tsx`, `bugs/page.tsx`, `kpis/page.tsx` — all
  redirect non-admins to `/${tenant}/tasks` (4 sites)
- `dashboard-client.tsx:276` and `settings-client.tsx:487` — internal links
  to `/${tenant}/tasks`

The two pages are NOT equivalent: `/tasks/` (83K client) renders GHL tasks
via `ghl.searchTasks()` with classification, AM/PM call tracking, and
`KpiLedgerModal`; `/day-hub/` (24K client) renders local `db.task` rows
plus dial KPIs. They're different products on different data sources.

Pre-deletion migration required:
1. Repoint `top-nav.tsx` "Day Hub" link from `/tasks` → `/day-hub`
2. Repoint 4 redirect pages (health/ai-logs/bugs/kpis) from `/tasks` → `/day-hub`
3. Repoint `dashboard-client.tsx` and `settings-client.tsx` internal links
4. Confirm `/day-hub/` covers all functionality reps actually use:
   - GHL task fetch + classify (or accept the loss)
   - AM/PM call tracking pills (or accept the loss)
   - KpiLedgerModal (or rebuild)
5. Then `rm -rf app/(tenant)/[tenant]/tasks/`

Until that migration lands, deletion would break the production "Day Hub"
nav target. P4 explicitly DEFERRED to v1.1 sprint with the 5-step
migration plan above as the entry point.

**Wave 6 visual confirmation (2026-04-30):** top nav "Day Hub" link
routes to `/tasks/`, not `/day-hub/`. `/tasks/` is the LM-visible Day
Hub. Wave 6.2 closed the hydration race here, but the underlying P4
migration (rewire nav + 4 redirect targets + settings post-action →
`/day-hub/`) remains queued for v1.1.

**P5 — `assign_contact_to_user` bypasses propose-edit-confirm UI flow · ⏸ DEFERRED — v1.1 sprint candidate.**
`/api/ai/assistant/execute/route.ts` handles `assign_contact_to_user` via
server-side name-contains fuzzy matching, not through the propose → edit →
confirm flow that gates the other 12 action types (per
`components/ui/coach-sidebar.tsx`). Architectural inconsistency: it's the
13th action that exists at the route layer but has no UI surface for
preview / edit / confirm. Investigate whether to add it to the UI flow
(treat it as a high-stakes action — assignment changes who owns the lead)
or formalize the bypass with explicit documentation + a server-side
acceptance test. Surfaced during SYSTEM_MAP §6 review (Commit #2 sprint).
Not a security risk in current single-tenant deployment; deferred to v1.1.

**P6 — Move View As from localStorage to httpOnly cookie (architectural leak-class closure).**

Status: QUEUED — v1.1 sprint candidate

Context: Wave 6.2 closed the /tasks/ Day Hub hydration race via Shape A
(synchronous useState initializer reading localStorage). However, View
As is still client-only state propagated via `?asUserId=` query
parameter. Any future client component that adds a View-As-keyed fetch
could reintroduce the same race class if it forgets to use a synchronous
useState initializer.

Architectural fix: store View As in an httpOnly cookie. Server reads
cookie in withTenant; resolveEffectiveUser reads cookie when asUserId
query param is absent. Client localStorage stays for display-label
purposes only.

Benefits:
- Closes leak class structurally, not patches one component
- Server components can scope to View As (today they cannot)
- Single source of truth (cookie + label localStorage), simpler mental model

Risks (require security review before implementation):
- CSRF: cookie-based impersonation needs CSRF token or signed cookie
- Setter endpoint: bug there could let any user impersonate any user —
  much higher blast radius than current bug class
- Cross-tab semantics: cookie is browser-wide; localStorage today is
  per-tab unless `storage` event syncs it (semantic change)

Dependencies: should land before any new server-side View-As-scoped
data fetches are added. Currently /day-hub/ does not need View As
scoping; if that changes, P6 becomes blocking.

Cross-references: Wave 6.2 fix (commit 375354b), original diagnostic
(PROGRESS Session 56).

## Pending decisions

- **D-0XX — AI model churn (Opus 4.7 → Opus 4.6 with 4.7-era prompt config).**
  Writeup blocked on user-supplied reasoning for the `598f852` revert (cost?
  stability? latency?). Until provided, the model state stands as documented
  in PROGRESS Sessions 41-42 / `lib/ai/grading.ts:204-210` comment but is not
  formally adopted as a decision.

- **D-045 (proposed) — KPI snapshot timestamp semantics.**
  Status: Pending — needs driver.
  Question: Should `scripts/kpi-snapshot.ts` aggregate by `createdAt` (when
  the call row was inserted, captures pipeline backfill behavior) or
  `calledAt` (when the call actually happened, matches user-facing surfaces)?
  Currently uses `createdAt` at lines 40-42, 84.
  Driver needed: Do nightly snapshots represent "what was in the system on
  day X" or "what calls happened on day X"?
  Blocked on: Corey decision.

- **D-046 (proposed) — Add a test framework?**
  Status: Pending — needs driver.
  Question: Project has 110 API routes, time-zone math, complex helpers,
  strict `tsc` gate, but zero automated tests (no jest, vitest, mocha
  configured; no `__tests__/` or `*.test.ts` files). The TZ bug in
  `lib/dates.ts:getCentralDayBounds` (load-bearing across 15 files,
  silently masked by Railway = UTC) would have been caught by a single
  unit test — a one-liner asserting `getCentralDayBounds('2026-04-27')`
  returns `{ gte: '2026-04-27T05:00:00.000Z', lte: '2026-04-28T04:59:59.999Z' }`
  under any host TZ. Should `vitest` be added (lowest-friction option for
  Next.js 14 + Prisma)? Or is `tsc` + manual verification waves
  sufficient?
  Driver needed: Has a silent bug in production cost more than the ~1 day
  of test framework setup would have? (Wave 2 cost ~3 sub-sprints to
  diagnose, fix, verify, and infra-build a verification path; a single
  unit test would have caught the TZ bug at commit time.)
  Blocked on: Corey decision.
