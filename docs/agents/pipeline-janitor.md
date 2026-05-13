# pipeline-janitor

> Wave: 2
> Status: spec
> Risk: low
> Replaces: humans noticing stuck deals; no current process for "properties idle in this stage too long"

## 1. Purpose

Find properties stuck in a stage longer than the configured threshold. Surface them to the right owner. Optionally auto-progress (if rules allow) or auto-create a "ping" task.

## 2. Trigger

Cron, daily at 6am UTC (`0 6 * * *`).

```toml
[[cron]]
name = "pipeline-janitor"
schedule = "0 6 * * *"
command = "npx tsx scripts/agents/pipeline-janitor.ts"
```

## 3. Inputs

- `properties.{acqStatus, dispoStatus, longtermStatus, *_updated_at, assignedUserId}`.
- `tasks` linked to property (open tasks count, last completed task).
- `calls` linked to property (last call age + score).
- Tenant config: per-stage age thresholds (e.g., "Negotiation > 7 days = stuck"). Define defaults; override per tenant via Settings.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getStaleProperties(tenantId, lane, ageThresholds)` | inputs | list of stale property rows |
| `getPropertyEngagement(propertyId)` | id | open tasks, last call age, last touch age |
| `createPingTask(propertyId, userId, urgency)` | inputs | task assigned to property owner |
| `markAtRisk(propertyId, reason)` | inputs | sets `properties.atRiskAt`, writes audit log |
| `escalateToManager(propertyId, reason)` | inputs | when property has been stale + at risk for 2+ janitor passes, escalate |

## 5. Outputs

- `tasks` row (ping task per stale property).
- `properties.atRiskAt` set when applicable.
- `audit_logs`: `pipeline.stale.flagged|escalated`.
- Surfaced in Day Hub for the assigned user.

## 6. Approval gates

Fully autonomous for internal tasks/flags. No customer contact.

## 7. Completion signal

`stop_reason: "end_turn"`. Per tenant: gather stale list → for each, choose action (task vs flag vs escalate) → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Property has no assignedUserId | Task goes to tenant admin. |
| Property already has an open ping task | No-op (don't dupe). |
| Stage age threshold not configured | Use default (Negotiation=7d, Contracts=10d, Dispo=14d). |

## 9. Test plan

- **Unit:** Stale detection per lane + per stage age threshold.
- **Integration:** Seed 30 properties across stages with mixed ages. Run agent. Verify only properly-stale ones get ping tasks.
- **Production rollout:** Observe-only 1 week. Then enable.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/pipeline-janitor.ts`
  - `lib/agents/pipeline-janitor/{index,tools}.ts`
  - Settings hub: add per-stage age threshold UI to Section 2 (Pipeline) per Rule 3.
- **Model:** `claude-haiku-4-5-20251001`.
- **Cost:** ~$1/day per tenant.
