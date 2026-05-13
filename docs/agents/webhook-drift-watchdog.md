# webhook-drift-watchdog

> Wave: 1
> Status: spec
> Risk: low
> Replaces: once-a-day `reconcile-ghl-pipelines` blindspot — currently drift between GHL and Gunner is invisible for up to 24h

## 1. Purpose

Detect when GHL webhooks have stopped firing or are firing at an abnormal rate. The current `reconcile-ghl-pipelines` cron runs once a day at 4am — this agent runs hourly and catches drift much earlier, then triggers an early reconciliation if needed.

## 2. Trigger

Cron, every hour (`0 * * * *`).

```toml
[[cron]]
name = "webhook-drift-watchdog"
schedule = "0 * * * *"
command = "npx tsx scripts/agents/webhook-drift-watchdog.ts"
```

## 3. Inputs

- `webhook_receipts` (new table) — every received GHL webhook writes a row: `{ eventType, ghlObjectId, receivedAt, processedAt, processingError }`.
- `audit_logs` for `ghl.webhook.received` entries.
- Baseline expected rates per tenant — derived from rolling 7-day median per event type.
- `properties.updatedAt` and `calls.createdAt` to cross-check against webhook receipts.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getWebhookRates(tenantId, sinceMinutes)` | tenant, age | per-event-type count + average for that timewindow over last 7 days |
| `crossCheckGhlPolling(tenantId, eventType)` | tenant, eventType | hits GHL API to count actual events in window. If GHL says 12 happened and Gunner saw 4 webhooks → drift. |
| `triggerEarlyReconciliation(tenantId, reason)` | tenant, reason | invokes `scripts/reconcile-ghl-pipelines.ts` for this tenant outside the 4am window |
| `logWatchdogFinding(severity, message, payload)` | severity, msg | writes audit log |
| `escalateToOwner(reason, details)` | reason, details | writes `agent_escalations` row, calls `internal-alert-hub` when available |

## 5. Outputs

- `webhook_receipts` rows (continuously, from the webhook handler — instrumentation lives in `app/api/webhooks/ghl/route.ts`).
- `audit_logs` entries: `webhook.drift.{healthy|degraded|critical}`.
- `agent_escalations` for CRITICAL findings.
- Early reconciliation runs when drift detected.

## 6. Approval gates

Fully autonomous. `triggerEarlyReconciliation` is idempotent (the reconcile script handles being run multiple times safely).

## 7. Completion signal

`stop_reason: "end_turn"`. Per tenant: gather rates → compare to baseline → classify → take one action → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Webhook receipt count for an event type is 0 over 6 hours when median is > 5 | CRITICAL. Trigger reconciliation + escalate. |
| Webhook rate is 50%+ below median | WARNING. Trigger reconciliation but don't escalate yet. |
| GHL polling cross-check fails (rate limit) | Skip cross-check this run; rely on baseline-only signal. |
| Tenant has no baseline yet (new tenant, < 7 days of data) | Skip drift check; log INFO. |

## 9. Test plan

- **Unit:** Baseline calculation correctness; classification thresholds.
- **Integration:** Seed `webhook_receipts` with normal traffic for 7 days, then a 24h dropout. Run agent. Assert reconciliation + escalation fire.
- **Production rollout:**
  1. Add `webhook_receipts` instrumentation (no agent).
  2. After 14 days of baseline data, enable agent in observe-only.
  3. After 1 week of clean shadow runs, enable `triggerEarlyReconciliation`.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/webhook-drift-watchdog.ts`
  - `lib/agents/webhook-drift-watchdog/{index,tools}.ts`
  - `prisma/schema.prisma` — add `WebhookReceipt` model.
  - `app/api/webhooks/ghl/route.ts` — write a `WebhookReceipt` row on every receipt.
- **Model:** `claude-haiku-4-5-20251001`.
- **Cost:** trivial (~$0.50/day per tenant).
- **Cross-link:** When `internal-alert-hub` (Wave 2) ships, replace direct escalations with hub calls.
