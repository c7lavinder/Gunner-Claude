# missed-call-autoresponder

> Wave: 3
> Status: spec
> Risk: medium
> Replaces: GHL "missed call" workflow that fires a single SMS when reps don't pick up
> Depends on: `_send-framework.md` must be shipped first

## 1. Purpose

When an inbound call to a Gunner-tracked number is missed (no answer, voicemail), send a single vetted SMS within seconds. Single trigger, single message — the simplest possible customer-facing agent.

## 2. Trigger

Event-driven. The existing `handleCallCompleted` webhook in `lib/ghl/webhooks.ts` already creates a call row. Extend it: if `direction=INBOUND` AND `duration < threshold` (e.g., < 15 seconds, indicates voicemail/missed) AND no answer flag, enqueue `agent_jobs(agent: "missed-call-autoresponder", payload: {callId})`.

Worker drains the queue immediately (within ~30 seconds).

## 3. Inputs

- The missed `Call` row (recording URL, contact phone, direction, duration).
- Linked `Seller` (recipient phone, name, market).
- Suppression list.
- Template registry (`missed_call_v1`).
- Recent send history (don't fire if same recipient already got this template in last 24h).

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getMissedCallContext(callId)` | id | call + linked seller + last contact age |
| `wasRecentlyTexted(recipientId, templateKey, withinHours)` | inputs | bool — dedupe |
| `sendViaGate(...)` | gate args | from `_send-framework` |
| `recordAutoresponse(callId, sendId)` | inputs | `missed_call_autoresponses` row |

## 5. Outputs

- One SMS sent via gate.
- `missed_call_autoresponses(callId, sendId, sentAt)` row.
- `audit_logs`: `missed_call.autoresponder.{sent|skipped}`.

## 6. Approval gates

- First 30 days: every send goes through approval queue.
- Highest-priority candidate for autonomous graduation because: single message, deterministic trigger, customer expects something after a missed call.
- Suppression list respected. Quiet hours respected (if missed call happens at 11pm, response goes out at 9am).

## 7. Template (draft — Corey to approve)

```
missed_call_v1
"Hi {{sellerFirstName}}, this is {{repName}} at {{tenantName}} — sorry I missed your call. I'll try you back shortly, or text me here if that's easier. Thanks."
```

Variants for tenant tone — Corey may want to customize per market. Each variant gets its own template key.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Duration just over threshold (rep picked up but call ended fast) | Don't send (call was answered, possibly transferred). Threshold tuning matters. |
| Recipient is internal (caller is another team member testing) | Skip if recipient phone is in `internal_users.phoneNumber`. |
| Multiple missed calls in 10 minutes from same number | Send only once; subsequent calls suppress for 24h. |
| Quiet hours | Hold; send at 9am local. |

## 9. Test plan

- **Unit:** Missed-call detection heuristic; dedupe window; internal-user exclusion.
- **Integration:** Seed 10 calls (mix of: answered, missed in business hours, missed at night, missed by internal user, duplicate missed). Run agent. Assert correct sends queued.
- **Production rollout:**
  1. Build agent with `sendViaGate` in dry-run.
  2. Run for 1 week parallel to existing GHL workflow.
  3. Disable GHL.
  4. Enable real sends through approval queue.
  5. After 14 days clean (this is a high-volume, low-risk template), Corey can graduate to autonomous.

## 10. Implementation notes

- **Files:**
  - `lib/agents/missed-call-autoresponder/{index,tools}.ts`
  - `lib/ghl/webhooks.ts` — extend `handleCallCompleted` to enqueue job.
  - `prisma/schema.prisma` — `MissedCallAutoresponse` model.
- **Model:** No LLM. Deterministic.
- **Cost:** SMS provider only.
- **Latency target:** message goes out within 60 seconds of call ending (when within business hours). Queue processor runs every 30 seconds for this agent specifically (faster than the 15-min default).
