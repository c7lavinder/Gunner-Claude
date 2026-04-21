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
   - Include: CLAUDE.md contents, AGENTS.md contents, relevant MODULES.md section
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
4. Relevant MODULES.md section

---

## Background Worker Conventions (added 2026-04-20 — Session 38)

**Long-running Railway `[[services]]`, NOT `[[cron]]`, for anything that MUST run reliably.**

Session 38 root-caused a pipeline outage where Railway silently dropped the
`process-recording-jobs` `[[cron]]` registration and would not re-provision it via
redeploy. The workaround — a `[[services]] grading-worker` that imports the same
`processJobs()` function and calls it in a 60s infinite loop — is now the repo standard.

### Pattern for new reliability-critical work

1. Put the core logic in a function that returns on success and throws on failure.
   Do NOT call `process.exit()` inside it — callers decide.
2. Put a thin CLI entry point at the bottom of the script, guarded by an
   `import.meta.url` check so the file is side-effect-free when imported:
   ```typescript
   import { fileURLToPath } from 'url'
   const isMainModule = process.argv[1] ? process.argv[1] === fileURLToPath(import.meta.url) : false
   if (isMainModule) {
     processJobs().then(() => process.exit(0)).catch(() => process.exit(1))
   }
   ```
3. Create a `scripts/<name>-worker.ts` that imports and loops the function with
   a 60s sleep + per-iteration error-swallowing. Reference: `scripts/grading-worker.ts`.
4. Add to railway.toml:
   ```toml
   [[services]]
   name = "<name>-worker"
   [services.deploy]
   startCommand = "npx tsx scripts/<name>-worker.ts"
   ```

### Mandatory observability for workers

**Every worker iteration MUST write heartbeat audit rows** so silent outages are
visible within one cycle. Established pattern:

```typescript
// At the top of the per-iteration function, BEFORE the main try block:
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

// At the END of the function, AFTER the main try block (skipped on throw/exit):
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
`scripts/process-recording-jobs.ts` (Fix 2):

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
