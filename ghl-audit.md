# GHL API Polling Audit

## GHL Rate Limit: 100 requests/minute

## Background Jobs Using GHL API

| Job | File | Interval | GHL Calls Per Run | Calls/Min (est) |
|-----|------|----------|-------------------|-----------------|
| Call Sync (pollForNewCalls) | ghlService.ts | 10 min (min) | 1 (conversations) + N (messages per conversation) + N (recordings) | ~20-50/run |
| Opportunity Poll (pollOpportunities) | ghlService.ts | 5 min | 1 (pipelines) + 1 (opportunities) per tenant | ~2-4/run |
| Opportunity Detection | ghlService.ts | 60 min | Multiple GHL calls per tenant (conversations, contacts) | ~10-30/run |
| Stuck Call Retry | ghlService.ts | 30 min | 0 (no GHL calls, just retries grading) | 0 |
| BatchDialer Sync | batchDialerSync.ts | 2 min | 0 (uses BatchDialer API, not GHL) | 0 |
| BatchLeads Sync | batchLeadsSync.ts | 60 min | 0 (uses BatchLeads API, not GHL) | 0 |
| Archival | ghlService.ts | 24 hr | 0 (just moves data) | 0 |
| Insights | ghlService.ts | 60 min | 0 (just LLM) | 0 |

## Key Problems

1. **Opportunity Poll runs every 5 minutes** — fetches pipelines + opportunities per tenant
2. **Call Sync + Opportunity Poll run sequentially** in same interval (10 min) — double the load
3. **Opportunity Detection runs every 60 min** but makes many GHL calls per tenant (fetching conversations for each contact)
4. **Per-conversation message fetching** — each conversation found triggers another API call
5. **No deduplication** — pipelines are fetched fresh every single poll cycle despite rarely changing

## Root Cause
The combination of:
- 5-min opportunity poll
- 10-min call sync (which fetches conversations + messages + recordings)
- Hourly opportunity detection (which scans many contacts)
- Multiple tenants multiplying all of the above

Easily exceeds 100 req/min during peak overlap windows.

## Fix Plan
1. Increase opportunity poll to 15 min (from 5 min)
2. Increase call sync to 15 min (from 10 min) 
3. Stagger: call sync at 0, opportunity poll at +7 min offset
4. Cache pipelines (they rarely change) — fetch once per hour
5. Reduce opportunity detection GHL calls by batching
6. Add request budget tracking to stay under 60 req/min (leaving 40 for user actions)
