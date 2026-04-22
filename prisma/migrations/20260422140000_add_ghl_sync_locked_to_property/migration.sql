-- Add ghl_sync_locked column to properties. When true, GHL webhook stage
-- updates skip this property. Used after an auto-split of a combined-address
-- property when one continues to follow the GHL opp and the other needs to
-- diverge (user manages its stage manually).

ALTER TABLE "properties" ADD COLUMN "ghl_sync_locked" BOOLEAN NOT NULL DEFAULT false;
