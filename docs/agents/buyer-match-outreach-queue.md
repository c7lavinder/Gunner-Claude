# buyer-match-outreach-queue

> Wave: 2
> Status: spec
> Risk: low (queue only — no auto-send in Wave 2)
> Replaces: manual buyer list assembly when a new property is ready for disposition

## 1. Purpose

When a property hits the disposition lane, find matching buyers, rank by likelihood-to-buy, and queue an outreach list with vetted message templates. **Wave 2 ships queue-only — sending is handled by Wave 3 when the send framework lands.**

## 2. Trigger

Event-driven. `handleOpportunityUpdate()` in `lib/ghl/webhooks.ts` watches for `dispoStatus` transition into a disposition-ready stage. Enqueues an `agent_jobs(agent: "buyer-match-outreach-queue", payload: {propertyId})` row.

Plus catch-up cron daily at 8am UTC.

## 3. Inputs

- `properties.{address, market, type, beds, baths, price, dispoArtifacts}`.
- `buyers.{markets, propertyTypes, minBeds, maxBeds, minPrice, maxPrice, lastActiveAt, conversionScore}` — existing buyer-match logic in `lib/buyers/`.
- Buyer prior responses (open rates, reply rates from past `agent_send_log`).
- Tenant template registry (Wave 3): which templates exist + which are approved for use.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `getMatchingBuyers(propertyId)` | id | ranked list of buyers (uses existing match logic) |
| `getBuyerEngagement(buyerId, lookbackDays)` | id, days | open/reply rate, last contact, suppression status |
| `getApprovedTemplates(tenantId, channel)` | tenant, channel | template registry entries marked approved |
| `composeOutreachList(propertyId, buyerIds, templateId)` | inputs | builds a draft outreach batch — buyer list + template + message preview per buyer |
| `enqueueForApproval(batchId)` | id | adds to `agent_approval_queue` for human review |

## 5. Outputs

- `agent_approval_queue` row: `{ propertyId, buyerIds, templateId, status: PENDING_APPROVAL }`.
- Surfaced in `/(tenant)/inventory/[propertyId]/dispo` with a "Approve & Send" button.
- Wave 2: human clicks approve → sends are still manual (uses existing dispo send endpoint).
- Wave 3: approval triggers send framework execution.

## 6. Approval gates

**Hard gate**: nothing sends in Wave 2. The agent only proposes a batch. A human owner must click approve. Even after Wave 3 ships, this agent stays in approval-required mode until Corey explicitly relaxes it.

## 7. Completion signal

`stop_reason: "end_turn"`. Per property: match buyers → score engagement → pick template → enqueue → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| No matching buyers | Log INFO; close job. |
| Buyer count > 100 | Cap at top 100 by score (don't blast a giant list). |
| No approved templates available | Escalate to admin: "you need to approve a template before dispo outreach can run." |
| Buyer in suppression list | Exclude from batch; log reason. |

## 9. Test plan

- **Unit:** Match ranking; engagement scoring; template selection logic.
- **Integration:** Seed property entering dispo. Fixture buyer set (mix of matched, suppressed, low-engagement). Run agent. Assert correct subset queued, correct template selected, suppressions respected.
- **Production rollout:** Ship queue-only mode immediately. Real send happens only when Wave 3 framework is live AND Corey approves a specific template family.

## 10. Implementation notes

- **Files:**
  - `lib/agents/buyer-match-outreach-queue/{index,tools}.ts`
  - `scripts/agents/buyer-match-outreach-queue-catchup.ts`
  - `prisma/schema.prisma` — add `AgentApprovalQueueItem`.
  - Reuse `lib/buyers/match-engine.ts` (existing) as the matching tool.
- **Model:** `claude-haiku-4-5-20251001` (mostly retrieval + ranking, very little LLM reasoning needed).
- **Cost:** ~$0.20 per property hitting dispo.
