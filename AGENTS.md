# AGENTS.md — Gunner AI Agent Standards

> This file governs how every AI agent (Claude Code, sub-agents, workers) operates on this codebase.
> Read this alongside CLAUDE.md at the start of every session.
> Updated whenever a new convention is established.

---

## Agent Identity

You are a Production Systems Engineer working on Gunner AI.
Not a chatbot. Not an autocomplete tool. A systems engineer.

Your job is to:
- Build production-grade code that works the first time
- Catch your own errors before reporting completion
- Update documentation as part of the work, not after
- Never leave the codebase in a worse state than you found it

---

## Completion Signals

**The only valid completion signal is stop_reason: "end_turn".**

Never use natural language parsing to detect task completion.
Never consider a task done because the model said "I'm done" or "that's complete."

A task is complete when:
1. The code runs without errors (verified by running it)
2. PROGRESS.md is updated
3. The specific acceptance criteria from the task are met
4. Structured JSON status has been returned confirming completion
5. **The feature has been verified working end-to-end on the live Railway URL with real data** — local tests, manual replays, and "should work" do not count as verification
6. **The agent builds the plan, not the user** — present a sequenced, reasoned plan. Never ask "what do you want to do first?" The agent is the engineer — assess dependencies, prioritize by impact, and present the order. The user approves or adjusts.

---

## Tool Response Contract

Every tool and API wrapper in this codebase must return:
```typescript
interface ToolResponse<T = unknown> {
  status: 'success' | 'error' | 'no_results'
  data?: T
  error?: string
  code?: string
  suggestion?: string
}
```

Example — GHL API call failure:
```typescript
{
  status: 'error',
  error: 'GHL token expired for tenant abc123',
  code: 'GHL_TOKEN_EXPIRED',
  suggestion: 'Call refreshGHLToken(tenantId) then retry the request'
}
```

This allows agents to auto-recover from errors without human intervention.

---

## Sub-Agent Spawning Rules

When spawning a sub-agent for any task:

1. Pass full context explicitly — never assume inherited context
   - Include: CLAUDE.md contents, AGENTS.md contents, relevant SYSTEM_MAP.md / OPERATIONS.md section
   - Include: current task description and acceptance criteria
   - Include: any relevant DB schema excerpts

2. Isolate the context — sub-agents start with a blank slate
   - Do not assume the sub-agent knows project history
   - Do not assume the sub-agent has read prior messages

3. Define the output contract — tell the sub-agent exactly what to return
   - Format of the response
   - Files it should have modified
   - What success looks like

---

## High-Stakes Action Gates

These actions require explicit human approval before execution.
A code-level interceptor must pause and confirm.
Prompt instructions alone are not sufficient security boundaries.

| Action | Gate type |
|---|---|
| SMS blast to more than 10 contacts | Confirmation modal + count display |
| Bulk property status change | Preview list + confirm count |
| Delete any record | Soft delete first, hard delete requires second confirmation |
| Webhook registration/deregistration | Log + confirm |
| Bulk GHL contact update | Preview diff + confirm |

Implementation: lib/gates/requireApproval.ts

Pattern:
```typescript
await requireApproval({
  action: 'sms_blast',
  description: `Send SMS to ${count} contacts`,
  data: { contactIds, message },
  userId: session.userId,
  tenantId: session.tenantId,
})
```

---

## Coding Standards

### File headers
Every new file starts with:
```typescript
// [filepath from project root]
// [one-line description of what this file does]
// [WRITES TO / READ BY if settings-related]
```

### Error handling
```typescript
try {
  const result = await someOperation()
  return { status: 'success', data: result }
} catch (err) {
  await db.auditLog.create({
    data: {
      tenantId,
      action: 'operation.failed',
      source: 'SYSTEM',
      severity: 'ERROR',
      payload: { error: err instanceof Error ? err.message : 'Unknown' },
    },
  })
  return {
    status: 'error',
    error: err instanceof Error ? err.message : 'Unknown error',
    suggestion: 'Check audit_logs for details',
  }
}
```

### Settings writes
All settings writes go through updateTenantSettings():
```typescript
// lib/db/settings.ts
export async function updateTenantSettings(
  tenantId: string,
  updates: Partial<TenantSettingsUpdate>
): Promise<ToolResponse>
```

Never write to tenant settings fields directly in API routes.

### GHL dropdown components
```typescript
<GHLDropdown
  endpoint="/api/ghl/pipelines"
  valueKey="id"
  labelKey="name"
  value={value}
  onChange={setValue}
  placeholder="Select pipeline..."
  searchable
/>
```

---

## Structured Status Reporting

After completing any task or sub-task, return:
```json
{
  "step": "step identifier",
  "status": "success | error | in_progress",
  "finding": "what you found",
  "action": "what you did",
  "filesModified": ["list of files changed"],
  "nextStep": "exact next action"
}
```

---

## Lead Scoring — TCP Model

True Conversion Probability recalculates on:
- Call graded (lib/ai/grading.ts triggers lib/ai/scoring.ts)
- Pipeline stage changed (GHL webhook)
- Task completed
- Appointment set or no-show

Score stored in properties.tcp_score (Float, 0.0 to 1.0).
High TCP + Low engagement = Buy Signal = surface to team immediately.
Implementation: lib/ai/scoring.ts (v1 built — 8-factor weighted ensemble)

---

## Context Window Management

Monitor context window health during long sessions.
If context is over 80% full → summarize and start fresh sub-agent.

Critical files to re-inject at start of any new context window:
1. CLAUDE.md
2. AGENTS.md
3. PROGRESS.md (Next Session section only)
4. Relevant SYSTEM_MAP.md / OPERATIONS.md section

---

## Background Worker Conventions (revised 2026-04-27 — Session 44; supersedes Session 38)

**In-process via Next.js `instrumentation.ts` is the default for reliability-critical work.**

Session 38 originally established a long-running Railway `[[services]]` pattern after the
`process-recording-jobs` `[[cron]]` silently dropped from the Railway scheduler. Sessions
41-42 superseded that with the Next.js 14.2 `instrumentation.ts` boot hook: the worker
runs in-process inside every `gunner-ai-web` Node process, no separate Railway service
required. Reference implementation: `instrumentation.ts` → `lib/grading-worker.ts` →
`lib/grading-processor.ts`.

The legacy `[[services]] grading-worker` block in `railway.toml` was removed in
Wave 1 of the v1-finish sprint (2026-04-27, Blocker #3 closed). The atomic
`updateMany({ gradingStatus: PENDING } → PROCESSING)` claim in
`lib/grading-processor.ts:69-72` is now defense-in-depth against future
re-introduction of a second worker, not active double-grading prevention.

### Pattern for new reliability-critical work

1. Put the per-iteration logic in a `runX()` function in `lib/<name>-processor.ts`
   that returns a `Stats` object on success and throws on failure. No `process.exit()`
   inside. Heartbeat + rescue-sweep responsibilities live in this function. Reference:
   `lib/grading-processor.ts`.
2. Create `lib/<name>-worker.ts` exporting `start<Name>Worker()`:
   - Single-flight: `running` flag prevents overlap when a tick takes longer than the
     interval.
   - Hot-reload safe: `Symbol.for('gunner.<name>Worker.started')` global guard prevents
     duplicate timers on Next.js dev-server reloads.
   - First tick on `setTimeout(5_000)` so the heartbeat lands quickly; `setInterval(60_000)`
     thereafter.
   - Per-iteration error swallowing inside the tick — never crash the loop.

   Reference: `lib/grading-worker.ts`.
3. In `instrumentation.ts`, add a guarded boot:
   ```typescript
   if (process.env.NEXT_RUNTIME !== 'nodejs') return
   if (process.env.DISABLE_<NAME>_WORKER === '1') return
   const { start<Name>Worker } = await import('@/lib/<name>-worker')
   start<Name>Worker()
   ```
4. Add an HTTP wrapper at `app/api/cron/<name>/route.ts` (GET + POST → calls `runX()`)
   so external cron, uptime monitors, and manual debug curls have a trigger surface.
   Reference: `app/api/cron/process-recording-jobs/route.ts`.
5. **Do NOT** add a `[[services]]` block in `railway.toml`. Instrumentation handles boot.
   `[[cron]]` is fine for genuinely periodic non-reliability-critical work
   (`daily-audit`, `daily-kpi-snapshot`, `weekly-profiles`, `regenerate-stories`,
   `compute-aggregates`, `poll-calls`).

### Mandatory observability for workers

**Every worker iteration MUST write heartbeat audit rows** so silent outages are
visible within one cycle. Established pattern (lives inside `runX()` in
`lib/<name>-processor.ts`):

```typescript
// At the top of runX(), BEFORE the main try block:
await db.auditLog.create({
  data: {
    tenantId: null,
    userId: null,
    action: 'cron.<worker_name>.started',
    resource: 'cron',
    resourceId: '<worker_name>',
    severity: 'INFO',
    source: 'SYSTEM',
    payload: { startedAt: new Date().toISOString() },
  },
}).catch(err => console.error('[heartbeat] audit write failed:', err))

// At the END of runX(), AFTER the main try block (skipped on throw/exit):
await db.auditLog.create({
  data: {
    tenantId: null,
    userId: null,
    action: 'cron.<worker_name>.finished',
    resource: 'cron',
    resourceId: '<worker_name>',
    severity: 'INFO',
    source: 'SYSTEM',
    payload: { durationMs: Date.now() - startedAt, stats },
  },
}).catch(err => console.error('[heartbeat] audit write failed:', err))
```

Health query:
```sql
SELECT MAX(created_at) FROM audit_logs
WHERE action = 'cron.<worker_name>.started';
```
If `MAX(created_at)` is > 2 minutes old, the worker is not running.

Absence of a matching `.finished` row after a `.started` row = the worker reached the
main body but died mid-run. Distinguishes "worker not running" from "worker crashing."

### Rescue sweeps for self-healing

Workers that claim rows via a transient intermediate state (e.g. PROCESSING) MUST
rescue stuck rows at the top of every iteration. Established pattern from
`lib/grading-processor.ts` (Session 38 Fix 2 — pattern carried into the in-process
processor):

```typescript
await db.call.updateMany({
  where: {
    gradingStatus: 'PROCESSING',
    updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
  },
  data: { gradingStatus: 'PENDING' },
}).catch(err => console.error('[rescue] PROCESSING reset failed:', err))
```

Requires the row's model to have `updatedAt DateTime @updatedAt @map("updated_at")`.
Prisma's `@updatedAt` directive auto-populates on every `.update()` / `.updateMany()`
call, so post-rescue the row's updated_at is fresh — prevents infinite rescue loops.

For auto-retry of permanently-terminal states (e.g. FAILED), same pattern with a
longer threshold (1 hour) + an additional guard (`recordingUrl: { not: null }`) so
only rows that CAN be retried get flipped back.

---

## Route Conventions (added 2026-04-07)

Every new API route under app/api/[tenant]/ MUST use withTenant from lib/api/withTenant.ts.
Routes that call getSession() directly are considered legacy and pending migration.

Pattern:
```typescript
import { withTenant } from '@/lib/api/withTenant'

export const PATCH = withTenant<{ propertyId: string }>(async (req, ctx, params) => {
  // ctx.tenantId is GUARANTEED to be a valid string
  // Every db.* call MUST include tenantId: ctx.tenantId in its where clause
  const updated = await db.property.update({
    where: { id: params.propertyId, tenantId: ctx.tenantId },
    data: { ... },
  })
  return NextResponse.json(updated)
})
```

Why: Bug #7, #13, #14, #15 (cross-tenant data leaks) and the propertyMilestone.findFirst leak
caught during Fix #6 Phase 2 all came from manual tenantId tracking. withTenant makes
"forget to check tenantId" structurally impossible to ship.

Reference: lib/api/withTenant.ts, commit c63cb03 (helper) + f484820 (3-route refactor template)

#### Every db.* WHERE needs tenant scope — including chained updates

A common subtle leak class caught during Wave 3 batch 1 (2026-04-28): a
handler does `db.X.findFirst({ where: { id, tenantId } })` (correctly scoped),
then later does `db.X.update({ where: { id } })` or
`db.X.updateMany({ where: { id: { in: ... } } })` — id-only WHERE on the
write. The find is a guard, but the write is the source of truth for what
gets mutated. If `id` ever turns out to refer to a different tenant's row
(corrupted FK, mass-assignment via params, future refactor that derives id
from elsewhere), the write will silently cross the boundary. Always include
`tenantId: ctx.tenantId` on EVERY write WHERE — find AND update AND delete AND
updateMany — even when the upstream find was already scoped. Defense-in-depth.

Same rule applies to foreign-key-driven lookups: if `call.propertyId` is used
as the next WHERE, scope by `tenantId` again. The foreign key is data; the
tenant boundary is policy. They should both gate the query.

Concrete examples from Wave 3 batch 1:
- `deal-intel/route.ts` — `Property.findUnique({ where: { id: call.propertyId } })`
  was id-only; now scoped.
- `generate-next-steps/route.ts` — two trailing `Call.update({ where: { id: params.id } })`
  calls were id-only; now scoped.
- `reprocess/route.ts` — `Call.update({ where: { id: params.id } })` was id-only.
- `bulk-regrade/route.ts` — `Call.updateMany({ where: { id: { in: ids } } })`
  pulled ids from a tenant-scoped findMany but the updateMany itself didn't
  re-enforce; now scoped.

Wave 3 batch 3 added two more variants of the same class:

**Variant: id-only `findUnique` + JS-side tenantId comparison.** Caught in
`bugs/[id]/route.ts` GET/PATCH/DELETE — the route did
`db.bugReport.findUnique({ where: { id } })` and then compared
`bug.tenantId !== admin.tenantId` in JavaScript. The DB query was
unscoped; any refactor that dropped the JS guard would expose
cross-tenant rows. Same fix shape: `findFirst` with `tenantId` in the
WHERE pushes the boundary into the query layer.

**Variant: id-only `delete()`.** Caught in `bugs/[id]/route.ts` DELETE
and `ai/assistant/execute/route.ts` `remove_team_member` tool. Prisma
`delete` on a unique key (id, or compound `propertyId_userId`) doesn't
allow extra-key fields without `extendedWhereUnique`. The clean fix is
`deleteMany({ where: { id, tenantId } })` — same WHERE freedom as
update/findMany, just less ergonomic.

**Variant: id-only `findUnique` for read-then-merge before tenant-scoped
update.** Caught in `ai/assistant/execute/route.ts` (`add_internal_note`,
`update_deal_intel`): the find was id-only (so the read could leak
another tenant's row) even though the follow-up update was tenant-scoped.
Defense-in-depth: scope the find too. `findFirst` with tenantId, not
`findUnique` by id.

Wave 3 batch 5 added two more variants of the same class:

**Variant: id-only `upsert` (or `upsert` on compound unique without
tenant validation).** Caught in `properties/[propertyId]/buyers/route.ts`
(`buyer.upsert({ where: { id } })`) and `properties/[propertyId]/buyer-stage/route.ts`
(`propertyBuyerStage.upsert({ where: { propertyId_buyerId } })`). Prisma
`upsert.where` requires a unique input, so you can't add `tenantId` to
the WHERE directly. Two valid fixes:
1. Validate the tenant boundary upstream first: `findFirst({ id, tenantId })`
   on the parent record (e.g. property), then proceed with the upsert.
   The compound unique becomes implicitly tenant-scoped via the FK.
2. Manually expand the upsert: `findFirst({ unique-key, tenantId })` →
   conditional `update` with `id+tenantId` in WHERE, else `create`.

The pre-scan grep `(update|delete|updateMany|deleteMany)` does NOT match
`upsert` (no substring overlap with `update`). When pre-scanning routes,
add `upsert` to the write-pattern grep — buyer-stage was misclassified
cool by the original heuristic and contained a real cross-tenant write
vector.

**Variant: helper-delegate id-only lookup.** Caught in
`properties/[propertyId]/metrics/route.ts` calling `computePropertyMetrics(propertyId)`
in `lib/computed-metrics.ts`. The helper does
`db.property.findUnique({ where: { id: propertyId } })` and then trusts
the row's `tenantId` to scope downstream queries. Without route-level
validation, any tenant could read another tenant's metrics by passing
the right propertyId. The pre-scan heuristic misses this because the
find is in the lib, not the route. **Rule**: when a route delegates to
a lib helper that takes a record id without an explicit tenantId
parameter, add a route-level `findFirst({ id, tenantId })` validation
gate before the delegate call. The fix can also be made in the helper
itself, but route-level gates are the safer ship-now move.

Reference: Wave 3 batch 5 commit (this convention added in batch 5).

#### Don't re-fetch user role — `ctx.userRole` is canonical

A separate cleanup class found across Wave 3 batches 2-3: routes did
`db.user.findUnique({ where: { id: session.userId }, select: { role: true } })`
to gate admin-only endpoints, then compared the result to `['OWNER', 'ADMIN']`.
After migration, `ctx.userRole` already exposes the role from the JWT
session. Drop the lookup. Saves a DB roundtrip per request and removes
a "look up the same user twice" pattern. Examples in batch 3:
`admin/knowledge`, `admin/load-playbook`, `admin/user-profiles`,
`bugs/[id]`, `bugs/route.ts`, `ai/assistant/session`.

Reference: Wave 3 batch 1 + batch 3 commits (this convention extended in batch 3).

### Public/self-gating routes need TWO entries (added 2026-04-28 — Wave 2)

When adding a new public/self-gating API endpoint (token-gated cron, webhook,
diagnostic, etc.), it needs BOTH:
1. A route handler auth check (token, HMAC signature, etc.).
2. An entry in `PUBLIC_PATHS` in `middleware.ts`.

The middleware runs FIRST. It uses `getToken({ req, secret: NEXTAUTH_SECRET })`
to enforce session auth on every non-public path — and on miss, returns a 307
redirect to `/login`. A perfectly valid `Authorization: Bearer` request to a
diagnostic endpoint without the PUBLIC_PATHS entry will be redirected before
the route handler ever sees it. The route handler's bearer-token check would
never fire.

Caught during Wave 2 of v1-finish sprint: `f0c4de9` shipped
`/api/diagnostics/dial-counts` with route-handler auth but no PUBLIC_PATHS
entry. Post-push probe returned `307 → /login?callbackUrl=/api/diagnostics/dial-counts`
instead of the expected 401. Followup commit `f8e58bb` fixed it with a one-line
addition. See `app/api/cron`, `app/api/webhooks`, `app/api/vieira` for the
matching pattern (all in PUBLIC_PATHS, all self-gating in their handlers).

When in doubt, probe the deployed endpoint with no auth and confirm it returns
the route handler's 401 JSON, not a 307 redirect.

---

## Repo Conventions

| Convention | Rule |
|---|---|
| Branch naming | feature/description, fix/description, docs/description |
| Commit format | type: description (feat, fix, docs, refactor, test) |
| File naming | kebab-case for files, PascalCase for components |
| API routes | REST conventions — GET/POST/PATCH/DELETE |
| DB migrations | Named descriptively: add_tcp_score_to_properties |
| Environment | Never commit .env.local — always use .env.example |

---

## Current Agent Toolset

| Tool | Location | Purpose |
|---|---|---|
| GHL client | lib/ghl/client.ts | All GHL API calls (contacts, tasks, SMS, email, pipelines, calendars) |
| Session helper | lib/auth/session.ts | Auth in API routes |
| Settings writer | lib/db/settings.ts | All tenant settings writes |
| GHL dropdown | components/ui/ghl-dropdown.tsx | Reusable GHL entity dropdown (Rule 2) |
| Call grader | lib/ai/grading.ts | Claude-powered call scoring (7-layer playbook context) |
| Call poller | scripts/poll-calls.ts | 3-layer call ingestion: webhook + export + per-user search |
| TCP scorer | lib/ai/scoring.ts | Lead conversion probability (8-factor weighted ensemble) |
| AI coach | lib/ai/coach.ts | User-facing coaching chat (playbook-aware) |
| Role Assistant | app/api/ai/assistant/ | 74-tool AI assistant with action approval flow |
| Context builder | lib/ai/context-builder.ts | Central knowledge assembly (exact + pgvector semantic search) |
| Embeddings | lib/ai/embeddings.ts | pgvector embedding generation + similarity search |
| Deal intel extractor | lib/ai/extract-deal-intel.ts | Extracts 100+ fields from call transcripts |
| Profile generator | lib/ai/generate-user-profiles.ts | Weekly auto-generated coaching profiles |
| Property enricher | lib/ai/enrich-property.ts | AI property valuation + neighborhood analysis |
| Approval gates | lib/gates/requireApproval.ts | High-stakes action gates (SMS blast, bulk updates) |
| AI logger | lib/ai/log.ts | All AI call logging (11 touchpoints) |
| Audit logger | lib/db/client.ts | All action logging |
| Self-audit agent | scripts/audit.ts | Scheduled code review |
| Stripe | lib/stripe/index.ts | Subscription management, plan definitions |
| Gamification | lib/gamification/xp.ts | XP, badges, leaderboard |
| Workflow engine | lib/workflows/engine.ts | Trigger-based automation workflows |

---

## Phase 1 Acceptance Criteria

The agent must verify all of these before declaring Phase 1 complete:

1. GET /api/health on Railway URL returns { status: ok } ✅
2. GHL OAuth flow completes without error on production URL
3. Webhook registered in GHL dashboard for connected location
4. Real call in GHL → graded record appears in /calls within 60 seconds
5. Pipeline stage change in GHL → property appears in /inventory
6. Settings pipeline selector populated from live GHL API
7. Two tenants cannot access each other's data
8. DEV_BYPASS_AUTH is NOT present in production environment
