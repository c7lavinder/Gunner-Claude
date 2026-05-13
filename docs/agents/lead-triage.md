# lead-triage

> Wave: 2
> Status: spec
> Risk: low-medium
> Replaces: dispatcher / admin manually reviewing new GHL leads, scoring motivation, assigning owners, tagging urgency

## 1. Purpose

When a new lead enters GHL (`ContactCreated` webhook or `OpportunityCreate`), classify it, score motivation, assign the right team member, and create the first task. No outbound messaging — purely internal scoring and routing.

## 2. Trigger

Event-driven, via the existing GHL webhook handler `handleContactChange()` and `handleOpportunityCreate()`. Webhook writes a job to `agent_jobs(agent: "lead-triage", payload: {contactId|opportunityId})`. A worker drains this queue.

Plus catch-up cron every 30 min for any job that didn't get processed:

```toml
[[cron]]
name = "lead-triage-catchup"
schedule = "*/30 * * * *"
command = "npx tsx scripts/agents/lead-triage-catchup.ts"
```

## 3. Inputs

- GHL contact fields: name, phone, email, source, tags, custom fields.
- Linked opportunity (if any): pipeline, stage, monetary value.
- Property data (if `OpportunityCreate` triggered Property stub creation): address, vendor enrichment.
- Tenant's team config: which users handle which lead sources/markets/lanes.
- Historical: prior contacts at the same phone/email/address.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `fetchGhlContact(ghlContactId)` | id | full contact + linked opportunities |
| `findDuplicateLeads(phone, email, address)` | identifiers | list of existing contacts that may be duplicates |
| `getTeamRouting(tenantId, leadSource, market)` | inputs | which user(s) should own this lead per tenant routing config |
| `scoreMotivation(contactData, propertyData)` | data | `{ score 0-1, factors: string[] }` — heuristic + LLM blended |
| `assignOwner(contactId, userId, reason)` | inputs | sets `properties.assignedUserId` or `sellers.assignedUserId`; writes audit log |
| `addTags(contactId, tags)` | inputs | applies Gunner-side tags (NOT GHL tags — keep GHL tags as source of truth, write to `sellers.tags`) |
| `createTriageTask(contactId, userId, title, urgency, dueAt)` | inputs | creates a Gunner Task; urgency drives Day Hub ranking |
| `flagDuplicate(contactId, duplicateOfId)` | inputs | links to existing record, suppresses follow-up triage |
| `logTriageDecision(contactId, decision, reasoning)` | inputs | audit log entry |

## 5. Outputs

- `properties.assignedUserId` or `sellers.assignedUserId` set.
- `sellers.tags` updated.
- `tasks` row created (first-touch task for owner).
- `sellers.likelihoodToSellScore` populated from motivation scoring.
- `audit_logs` entry: `lead.triaged`.
- Duplicate links recorded.

## 6. Approval gates

Fully autonomous for internal actions (assign, tag, task creation). **No customer contact.** No SMS, no email — the first-touch is left for the human owner.

## 7. Completion signal

`stop_reason: "end_turn"`. One pass per lead: fetch context → score → route → task → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| GHL fetch fails (rate limit) | Re-queue job, retry in 5 min. Max 3 retries → mark `agent_jobs.status=FAILED` + escalate. |
| No team routing config for this lead source | Default to tenant admin; log WARNING. |
| Duplicate found, very high confidence | Link + suppress, don't double-task. |
| Motivation score returns garbage from LLM | Fall back to a heuristic-only score (no LLM blend). |
| All assigned users are over their daily lead cap | Queue lead, escalate to manager. |

## 9. Test plan

- **Unit:** Routing rules per source/market; duplicate detection by phone+address; motivation heuristic.
- **Integration:** Seed 20 fixture leads (mix of sources, markets, with/without property data, with/without duplicates). Run agent. Assert correct owner + tags + task per lead.
- **Production rollout:**
  1. Observe-only 1 week: agent runs, writes audit log of *intended* decisions, but does NOT actually assign or create tasks.
  2. Manual review: dispatcher/admin compares agent's intended decisions to what they would have done. Aim for > 85% match.
  3. Enable assignment + tagging.
  4. Enable task creation 1 week later.

## 10. Implementation notes

- **Files:**
  - `lib/agents/lead-triage/{index,tools,scoring}.ts`
  - `scripts/agents/lead-triage-catchup.ts`
  - `lib/ghl/webhooks.ts` — enqueue `agent_jobs` row on lead events.
  - `prisma/schema.prisma` — add `AgentJob` model (shared infra).
- **Model:** `claude-sonnet-4-6` for scoring/reasoning; `claude-haiku-4-5-20251001` for routing-only path.
- **Token budget:** ~5k input / ~1k output per lead. At 50 leads/day per tenant = ~$3/day per tenant.
- **Prompt strategy:** System prompt enumerates the tenant's lead sources + team routing matrix + motivation rubric. User message contains the contact + property snapshot. Agent calls tools in order: fetch → dupe-check → score → route → task. End turn.
- **Important:** This agent does NOT modify GHL — only writes to Gunner DB. Stays consistent with `project_stage_sync_direction.md` memory (GHL is source of truth for CRM core; Gunner overlays intelligence).
