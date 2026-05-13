# no-show-recovery

> Wave: 3
> Status: spec
> Risk: medium
> Replaces: GHL no-show workflow — when an appointment is missed, fire a recovery sequence
> Depends on: `_send-framework.md`, `appointment-reminder.md` (shared appointment schema)

## 1. Purpose

Detect appointments marked as no-show, send a single recovery SMS, then route to the assigned rep for human follow-up. One message, one route — does NOT try to autonomously re-engage.

## 2. Trigger

Cron, hourly (`0 * * * *`), looking back at appointments that were scheduled in the last 24h with no completion record.

```toml
[[cron]]
name = "no-show-recovery"
schedule = "0 * * * *"
command = "npx tsx scripts/agents/no-show-recovery.ts"
```

Plus event-driven: if `appointments.status` flips to NO_SHOW (via GHL webhook or manual update), enqueue immediately.

## 3. Inputs

- Appointments past their scheduled time with no `completedAt` or with `status=NO_SHOW`.
- Recent call/SMS history for the seller (to inform whether to send recovery vs flag as ghosted).
- Template registry (`no_show_recovery_v1`).
- Suppression list.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `findNoShows(tenantId, sinceHours)` | inputs | list of appointments past time, no completion |
| `getSellerContactHistory(sellerId, sinceDays)` | inputs | recent inbound/outbound contact attempts |
| `classifyMiss(context)` | context | one of `{send_recovery, route_to_rep_only, mark_ghosted}` based on prior contact history |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `createRepFollowupTask(sellerId, userId, reason)` | inputs | task in rep's Day Hub |
| `markGhosted(sellerId)` | id | adds `sellers.ghostedAt`; pauses other agents from auto-contacting |

## 5. Outputs

- One SMS via gate (for `send_recovery` decisions).
- Task created for assigned rep (always).
- `sellers.ghostedAt` set (for `mark_ghosted` decisions, after multiple no-shows).
- `audit_logs`: `no_show.recovery.{sent|routed|ghosted}`.

## 6. Approval gates

- First 30 days: approval queue.
- Recovery SMS template ships with cadence-style protections (one send per appointment, never re-sent on the same no-show).
- "Mark ghosted" requires 3+ unanswered touches in 14 days — code-enforced threshold.

## 7. Template (draft)

```
no_show_recovery_v1
"Hi {{sellerFirstName}}, looks like we missed each other at {{appointmentTime}}. No worries — when's a better time for me to swing by? — {{repName}}"
```

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Appointment was actually completed but not marked | Reconcile with calendar data before sending. Wait 30 min past appointment to allow for late completion. |
| Seller is already in another active cadence | Pause that cadence; send recovery SMS; route to rep. |
| Quiet hours | Hold; send at 9am local. |

## 9. Test plan

- **Unit:** No-show detection logic; classification of recovery vs route-only vs ghosted; threshold for ghosting.
- **Integration:** Seed 8 appointment scenarios (clean no-show, late completion, multiple no-shows, already ghosted). Run agent. Verify correct action per scenario.
- **Production rollout:** Same pattern as missed-call-autoresponder — dry-run alongside existing GHL workflow, then migrate.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/no-show-recovery.ts`
  - `lib/agents/no-show-recovery/{index,tools}.ts`
- **Model:** No LLM for sending. `classifyMiss` can be heuristic-only initially (Haiku optional if heuristic is wrong > 20% of the time).
- **Cost:** SMS provider only.
