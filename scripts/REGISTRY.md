# Scripts Registry — Gunner AI

> One-page catalog of every file in `/scripts/`. New devs (and future Claude
> Code sessions) should be able to tell at a glance what each script does,
> whether it's safe to re-run, when it last ran, and whether it can be
> deleted. Cross-references `docs/OPERATIONS.md` "Operational scripts" for
> categorical context. Keep current as scripts land, sweep, or rot out.

**Purpose categories:** Cron · Worker · Verify · Diagnostic · Backfill (mutating) · Seed · UI

**Idempotent?** Yes = safe to re-run as many times as needed · No = single-shot
or has unwanted side effects on re-run · N/A = read-only.

**Safe to delete after** = the date or condition under which the script becomes
dead weight (drop-only, no longer matches schema, etc.). When unset, retain.

---

## Recurring crons (referenced in `railway.toml`)

| Script | Purpose | Idempotent? | Last Run | Safe to delete after |
|---|---|---|---|---|
| `poll-calls.ts` | 3-layer call ingestion: webhook + export + per-user search | Yes | recurring | Never (cron) |
| `audit.ts` | Self-audit agent (Claude-powered code review) | Yes | recurring | Never (cron) |
| `kpi-snapshot.ts` | Daily KPI snapshot row write | Yes | recurring | Never (cron) |
| `generate-profiles.ts` | Weekly user profile regeneration | Yes | recurring | Never (cron) |
| `regenerate-stories.ts` | Property Story regen (cron + post-grading) | Yes | recurring | Never (cron) |
| `compute-aggregates.ts` | Nightly seller portfolio + voice analytics + buyer funnel | Yes | recurring | Never (cron) |

## Background worker (manual debug only)

| Script | Purpose | Idempotent? | Last Run | Safe to delete after |
|---|---|---|---|---|
| `process-recording-jobs.ts` | Older standalone driver. Same logic as `lib/grading-processor.ts` (the in-process driver). HTTP wrapper at `app/api/cron/process-recording-jobs/route.ts` is preferred manual surface. | Yes | on demand | When in-process worker conventions are universal and no operator reaches for the standalone driver for ≥90 days |

## Health checks + verifiers

| Script | Purpose | Idempotent? | Last Run | Safe to delete after |
|---|---|---|---|---|
| `verify-calls-pipeline.ts` | Bidirectional A/B + sanity gate + canary. Closed Blocker #1. | Yes | on demand | Never (operational tool) |
| `verify-e2e.ts` | End-to-end smoke check | Yes | on demand | Never |
| `daily-health-check.ts` | Morning ritual SQL on queue + errors + misclassifications | Yes | on demand | Never |
| `check-silent-catches.sh` | Bash scanner for `.catch(() => {})` patterns. Baseline 60 (post-Phase 3, 2026-05-01). | Yes | on demand | Never (audit gate) |
| `coverage-probe.ts` | Vendor-coverage diagnostic (writes test seller/property then deletes) | Yes | on demand | Never |
| `enrichment-stats.ts` | Vendor field-coverage stats | Yes | on demand | Never |
| `enrichment-gaps.ts` | Properties with missing enrichment fields | Yes | on demand | Never |
| `verify-april13-calls.ts` | Spot-check for the April 13 call-loss incident | Yes | 2026-04-13 | When the April 13 incident is ≥6 months stale (after 2026-10-13) |
| `verify-bulletproofing.ts` | Verifies bulletproofing checklist items | Yes | on demand | Never |
| `visual-audit.ts` | Playwright UI audit. **Excluded from `tsc`** so playwright stays in `devDependencies`. | Yes | on demand | Never |

## Diagnostic reads (one-shot, idempotent)

| Script | Purpose | Idempotent? | Last Run | Safe to delete after |
|---|---|---|---|---|
| `check-progress.ts` | Live status-count snapshot | Yes (read-only) | on demand | If not run in 30 days (2026-06-01) — overlaps with `daily-health-check.ts` |
| `check-stuck-calls.ts` | PENDING/FAILED state via raw SQL (bypasses Prisma enum drift) | Yes (read-only) | on demand | Never |
| `check-durations.ts` | Duration-bucket distribution | Yes (read-only) | on demand | Never |
| `check-missing-leads.ts` | Leads not yet linked to properties | Yes (read-only) | on demand | Never |
| `check-remaining.ts` | Remaining work-queue spot check | Yes (read-only) | on demand | Never |
| `check-today-leads.ts` | Today's leads spot check | Yes (read-only) | on demand | Never |
| `check-todays-leads.ts` | Today's leads (variant; check whether duplicates `check-today-leads.ts`) | Yes (read-only) | on demand | Consolidate with `check-today-leads.ts` next time either is touched |
| `inspect-failed.ts` | Per-row deep inspection of FAILED rows | Yes (read-only) | on demand | Never |
| `inspect-lead.ts` | Per-row deep inspection of a single lead | Yes (read-only) | on demand | Never |
| `inspect-enterprise.ts` | Per-row deep inspection for the enterprise tenant | Yes (read-only) | on demand | Never |
| `audit-short-graded.ts` | Anomaly: <45s calls that got graded anyway | Yes (read-only) | on demand | Never |
| `diagnose-calls.ts` | Anomaly investigator for call rows | Yes (read-only) | on demand | Never |
| `diagnose-inventory-issues.ts` | Anomaly investigator for inventory rows | Yes (read-only) | on demand | Never |
| `raw-field-audit.ts` | Raw vendor-field exploration | Yes (read-only) | on demand | Never |
| `full-leaf-dump.ts` | Raw vendor leaf-field dump (PR + BatchData side-by-side) | Yes (read-only) | on demand | Never |
| `vendor-comparison.ts` | Cross-vendor field-coverage comparison | Yes (read-only) | on demand | Never |

## Backfills (mutating, one-shot)

| Script | Purpose | Idempotent? | Last Run | Safe to delete after |
|---|---|---|---|---|
| `recover-stuck-calls.ts` | wf_* ID resolution + recording fetch + transcribe + grade | Yes (per-row idempotent) | on demand | Never (recovery tool) |
| `import-historical-calls.ts` | Historical call import | Yes | one-shot | When historical import is ≥6 months stale and never re-run |
| `backfill-batchdata-blobs.ts` | Backfill BatchData JSON blobs into properties | Yes | one-shot | When all properties have BatchData blobs (post-Wave 5 verified — re-run produces 0 changes) |
| `backfill-inventory-cleanup.ts` | Targeted inventory cleanup backfill | Yes | one-shot | Same — once production dry-run yields 0 changes for ≥30 days |
| `backfill-today.ts` | Backfill today's enrichment | Yes | on demand | Never (recovery tool) |
| `cleanup-empty-shell-calls.ts` | Bug #22 — 24 empty-shell FAILED rows | Yes | one-shot | After 2026-10-01 (6 months past Bug #22 close) |
| `cleanup-duplicate-milestones.ts` | Data hygiene — dedupe duplicate milestones | Yes | on demand | Never (recurrent hygiene need) |
| `cleanup-orphans.ts` | PROCESSING-orphan recovery + FAILED surface | Yes | on demand | Never (recurrent hygiene need) |
| `fix-dispo-milestones.ts` | Disposition milestone repair | Yes | on demand | When dispo-milestone create flow is fully bulletproof for ≥90 days |
| `flip-failed-to-pending.ts` | Status flipper — FAILED → PENDING for retry | Yes | on demand | If not run in 30 days (2026-06-01) — `recover-stuck-calls.ts` covers this |
| `reset-april13-calls.ts` | One-shot reset for April 13 incident | No (date-scoped) | 2026-04-13 | After 2026-10-13 (6 months) — incident-scoped |
| `reset-processing.ts` | Status flipper — PROCESSING → PENDING (rescue stuck rows) | Yes | on demand | If not run in 30 days (2026-06-01) — rescue sweep in `lib/grading-processor.ts` covers this |
| `retry-stuck-calls.ts` | Retry FAILED with recordingUrl present | Yes | on demand | Never (recovery tool) |
| `reenrich-today.ts` | Re-run enrichment for today's leads | Yes | on demand | Never (operational tool) |
| `split-existing-doubles.ts` | Split combined-address properties (Session-41 era) | Yes | one-shot | When auto-split has been universal for ≥6 months and no combined-address rows exist (post-Wave-5 + verified) |
| `migrate-field-source-ai-to-api.ts` | One-shot: rename field_sources `ai` → `api` for BatchData fields. Replaces runtime patch in `/api/health` (removed Phase 4, 2026-05-01). | Yes | 2026-05-01 (dry-run, 0 changes — patch already drained) | Retain — idempotent recovery tool if values drift again |

## Seed + setup (idempotent at install time)

| Script | Purpose | Idempotent? | Last Run | Safe to delete after |
|---|---|---|---|---|
| `seed.ts` | Base DB seed (tenants + roles) | Yes | install | Never |
| `seed-markets.ts` | Market data seed | Yes | install | Never |
| `seed-appointment-types.ts` | Appointment types seed | Yes | install | Never |
| `setup-team.ts` | Initial team roster | No (creates users) | install | Never (used per-tenant onboarding) |
| `load-playbook.ts` | Load playbook content into pgvector | Yes | install + on-demand | Never (re-loadable on playbook updates) |
| `load-user-profiles.ts` | Load user profiles into pgvector | Yes | install + on-demand | Never (re-loadable) |
| `sync-buyers.ts` | Buyer list sync from GHL | Yes | install + on-demand | Never (operational tool) |
| `sync-calls.ts` | Call sync (alternative to `poll-calls`) | Yes | on demand | When `poll-calls.ts` 3-layer ingestion is fully sufficient for ≥90 days |

---

## Sweep candidates (this session — Pre-Scaling Cleanup Wave, 2026-05-01)

Per Phase 5 of the cleanup plan, three scripts are candidates for deletion
**if not run in the next 30 days** (re-evaluate ≥ 2026-06-01):

- `scripts/reset-processing.ts` — superseded by rescue sweep in `lib/grading-processor.ts:69-72` (PROCESSING → PENDING after 5min idle)
- `scripts/flip-failed-to-pending.ts` — superseded by `recover-stuck-calls.ts` (also handles wf_* ID resolution)
- `scripts/check-progress.ts` — overlaps with `daily-health-check.ts`

Before deleting any of these, grep the operational ritual notes (Corey's
morning workflow) for the script name. If it shows up in muscle-memory commands,
keep it.

---

## Maintenance discipline

- New script lands → add a row here in the same commit
- Script materially changes purpose → update the row
- Script deleted → drop the row
- Re-run an "on demand" script → bump its Last Run column

This file is part of the Living Map (CLAUDE.md Rule 8). It's slow-changing
relative to the script surface, but it WILL drift if the discipline lapses.
