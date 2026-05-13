# property-enrichment-iterator

> Wave: 2
> Status: spec
> Risk: low
> Replaces: one-shot `enrich-property.ts` — currently enrichment runs once on create; if PR/BD/Google data later updates, the property doesn't get re-enriched

## 1. Purpose

Watch properties whose vendor enrichment data has updated since the last AI enrichment. Re-run the enrichment intelligently — preserve user-edited fields, only refresh AI-sourced fields, flag conflicts where vendor data disagrees.

## 2. Trigger

Cron, daily at 5am UTC (`0 5 * * *`).

```toml
[[cron]]
name = "property-enrichment-iterator"
schedule = "0 5 * * *"
command = "npx tsx scripts/agents/property-enrichment-iterator.ts"
```

Plus event-driven hook: when vendor data refresh completes (PropertyRadar / BatchData / Google), enqueue.

## 3. Inputs

- `properties.{field_sources, ai_enrichment_status, enrichmentLastRunAt, vendorDataUpdatedAt}`.
- Vendor blobs: PropertyRadar, BatchData, Google, CourtListener.
- `properties.fieldEdits` history (which fields the user has manually edited — those are sacred).
- Existing `enrichPropertyWithAI()` logic in `lib/ai/enrich-property.ts`.

## 4. Tools

| Tool | Input | Returns |
|---|---|---|
| `listStaleEnrichments(tenantId, sinceMinutes)` | tenant, age | properties where vendor data > AI enrichment timestamp |
| `getVendorDataDiff(propertyId)` | id | diff between current property fields and vendor data; highlights conflicts |
| `runIterativeEnrichment(propertyId, fieldsToRefresh)` | inputs | invokes `enrichPropertyWithAI()` for *only the specified fields*, preserving user-edited values |
| `flagConflict(propertyId, field, vendorValue, currentValue)` | inputs | writes `property_conflicts` row for human review |

## 5. Outputs

- `properties` field updates for the AI-managed fields (only those where `field_sources[field] !== 'user'`).
- `properties.enrichmentLastRunAt` updated.
- `property_conflicts` rows for human review when vendor and user disagree.

## 6. Approval gates

- Refreshing AI-sourced fields: autonomous (`field_sources[field] === 'ai'`).
- Overwriting user-edited fields: blocked at code level.
- ARV is the explicit exception (per `feedback_auto_fill_from_vendors.md`) — agent never overwrites a user-set ARV.

## 7. Completion signal

`stop_reason: "end_turn"`. Per property: diff → decide refresh-vs-flag → action → end.

## 8. Failure modes & retries

| Failure | Behavior |
|---|---|
| Vendor data malformed | Skip property; log WARNING. |
| AI enrichment fails | Don't overwrite existing fields; mark `ai_enrichment_status=FAILED_RETRY`. |
| Conflict (vendor data wildly different from current AI value) | Flag for human, don't overwrite. |

## 9. Test plan

- **Unit:** Field-edit preservation; ARV protection; conflict thresholds.
- **Integration:** Seed property with mixed user-edited + AI-set fields. Run iterator with new vendor data. Assert user fields preserved, AI fields refreshed.

## 10. Implementation notes

- **Files:**
  - `scripts/agents/property-enrichment-iterator.ts`
  - `lib/agents/property-enrichment-iterator/{index,tools}.ts`
  - `lib/ai/enrich-property.ts` — extend with `fieldsToRefresh` parameter (current API enriches all fields).
- **Model:** Reuse `claude-sonnet-4-6` from `enrich-property.ts`. No new agent reasoning needed beyond the diff classifier (Haiku).
- **Cost:** ~$0.50/property iterated. Capped at 100 properties/run = $50/day worst case.
