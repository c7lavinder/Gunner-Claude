-- Add stage_entered_at column to properties. Powers the days-in-stage badge on
-- the inventory page. Updated on every status or dispo_status change by
-- createPropertyFromContact, handleOpportunityStageChanged, the properties PATCH
-- route, and the properties POST route. Nullable — backfilled by
-- scripts/backfill-inventory-cleanup.ts using the latest milestone createdAt
-- (or created_at if no milestones exist).

ALTER TABLE "properties" ADD COLUMN "stage_entered_at" TIMESTAMP(3);
