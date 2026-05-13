# tcp-anomaly-surfacer

> Wave: 1
> Status: spec
> Risk: low
> Replaces: humans noticing buy signals from dashboards (currently invisible until someone reviews)

## 1. Purpose

Watch every property's TCP score. When a property's TCP jumps significantly (high probability + low team engagement), surface it as a **Buy Signal** on the right user's dashboard. The Buy Signal is in Rule 5 of CLAUDE.md but no agent currently produces it.

## 2. Trigger

Cron, every 30 minutes (`*/30 * * * *`). Plus event-driven hook from `scoring.ts → calculateTCP()` when delta > threshold (so big jumps surface immediately).

```toml
[[cron]]
name = "tcp-anomaly-surfacer"
schedule = "*/30 * * * *"
command = "npx tsx scripts/agents/tcp-anomaly-surfacer.ts"
```

## 3. Inputs

- `properties.{tcp_score, tcp_factors, tcp_updated_at, assignedUserId, acqStatus}`.
- `property_tcp_history` (new table) — rolling history of TCP values per property for delta calculation.
- `tasks` and `calls` for engagement signal (when was last touch?).
- `buyer_matches` to enrich the signal context.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getTcpDeltas(tenantId, sinceMinutes)` | tenant, age | list of `{ propertyId, tcpFrom, tcpTo, lastTouchAt, assignedUserId }` |
| `getPropertyContext(propertyId)` | id | property + seller + last call + open tasks + buyer count |
| `createBuySignal(propertyId, userId, reason, urgency)` | inputs | inserts `buy_signals` row, fires `internal-alert-hub` (Wave 2) when available |
| `suppressSignal(propertyId, reason)` | id, reason | so the agent doesn't re-create a signal a user already dismissed |

## 5. Outputs

- New table `buy_signals(id, tenantId, propertyId, userId, reason, urgency, createdAt, dismissedAt)`.
- Surfaced on `/(tenant)/dashboard` as a "Buy Signals" panel.
- Audit log: `tcp.signal.created`.

## 6. Approval gates

Fully autonomous. No customer contact. Worst case: false positive surfaces a property to a rep that isn't actually hot — easily dismissed.

## 7. Completion signal

`stop_reason: "end_turn"`. Per-tenant: gather TCP deltas → for each delta above threshold, call `getPropertyContext` → call `createBuySignal` if not suppressed → end turn.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| TCP factors malformed (JSON corrupt) | Skip property, log WARNING. |
| Property assignedUserId is null | Create signal scoped to tenant admin instead of user. |
| Duplicate signal (already exists, not dismissed) | No-op. |

## 9. Test plan

- **Unit:** Threshold logic — TCP jump 0.2 → 0.85 = signal; 0.6 → 0.65 = no signal; 0.85 → 0.9 = no signal (already high, no jump).
- **Integration:** Seed property history showing a 0.3 → 0.8 jump in 24h with no recent touch. Run agent. Assert signal created for the assigned user.
- **Production rollout:** Observe-only 1 week (write to `buy_signals` but don't surface to UI). Manually review 50 signals for true-positive rate. If > 70% TP, ship UI.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/tcp-anomaly-surfacer.ts`
  - `lib/agents/tcp-anomaly-surfacer/{index,tools}.ts`
  - `prisma/schema.prisma` — add `BuySignal`, `PropertyTcpHistory`.
  - `lib/ai/scoring.ts` — extend `calculateTCP` to append history row + fire event when delta > 0.2.
  - `app/(tenant)/[tenant]/dashboard/page.tsx` — add Buy Signals panel.
- **Model:** `claude-haiku-4-5-20251001` (lightweight reasoning over numeric deltas + a few entity facts).
- **Threshold tuning:** Start with absolute-delta > 0.2 AND target TCP > 0.65 AND no touch in last 48h. Adjust based on TP rate.
- **Reason field:** Agent generates a 1-sentence reason string ("TCP jumped from 0.31 to 0.78 after Tuesday's call with strong motivation signals; no follow-up scheduled.") — this is the dashboard hook for the user.
- **Cost:** ~$2/day per tenant at expected scale.
