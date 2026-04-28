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
- **`withTenant` migration** — ~64 routes still on manual `tenantId` tracking per PROGRESS.md.
- **Poll cron liveness on Railway** — blocked on fresh Railway API token. Largest diagnostic gap.
- **`source IS NULL` backfill** — one-time SQL plus scripted write-path audit to ensure no future untagged rows.
- **Railway log ingestion** — no visibility into cron stdout/stderr today. Blocker for catching issues the verifier's audit_log query doesn't see.

## Living state

The verifier is rollout-ready as a recurring health check — good candidate for a daily cron or pre-deploy gate. When bugs #17-19 are resolved, the one ❌ on Pass A goes away and the bucket-mismatch ❌s on Pass B disappear. A clean Pass A + Pass B (both hitting targets) is the acceptance test for pipeline-level work.

Blocker #2 work should target the 4-step fix sequence above, in order. Each step is independently reviewable; no big-bang refactor.

## Priority items (non-blocking)

**P3 — AI model date-pin standardization · ✅ CLOSED (2026-04-27, Wave 1 of v1-finish sprint).**
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

**P4 — `app/(tenant)/[tenant]/tasks/` deletion candidate.** Day Hub
(`app/(tenant)/[tenant]/day-hub/`) is the canonical Tasks/Day Hub surface per
CLAUDE.md Rule 3 (Single Settings Hub — section 7 Day Hub). The `/tasks/` page
is older and kept around because at least one user (Chris) still has it
bookmarked. Deleting `/tasks/` enforces "one canonical surface" and reduces
split-brain risk on KPI source-of-truth bugs (currently in PROGRESS as a
parked tech-debt item). Coordinate with Chris before removal.

**P5 — `assign_contact_to_user` bypasses propose-edit-confirm UI flow.**
`/api/ai/assistant/execute/route.ts` handles `assign_contact_to_user` via
server-side name-contains fuzzy matching, not through the propose → edit →
confirm flow that gates the other 12 action types (per
`components/ui/coach-sidebar.tsx`). Architectural inconsistency: it's the
13th action that exists at the route layer but has no UI surface for
preview / edit / confirm. Investigate whether to add it to the UI flow
(treat it as a high-stakes action — assignment changes who owns the lead)
or formalize the bypass with explicit documentation + a server-side
acceptance test. Surfaced during SYSTEM_MAP §6 review (Commit #2 sprint).

## Pending decisions

- **D-0XX — AI model churn (Opus 4.7 → Opus 4.6 with 4.7-era prompt config).**
  Writeup blocked on user-supplied reasoning for the `598f852` revert (cost?
  stability? latency?). Until provided, the model state stands as documented
  in PROGRESS Sessions 41-42 / `lib/ai/grading.ts:204-210` comment but is not
  formally adopted as a decision.
