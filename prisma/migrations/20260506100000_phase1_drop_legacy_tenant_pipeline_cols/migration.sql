-- Phase 1 commit 2 — drop the legacy single-pipeline columns from tenants.
-- These were preserved through commit 1 because the old single-trigger
-- webhook handler still read them. Commit 2 introduces the lane-aware
-- handler which reads tenant_ghl_pipelines instead, so the columns are
-- safe to drop.
--
-- See docs/plans/ghl-multi-pipeline-bulletproof.md §3 + §6 commit 2.
-- Reverse migration in down.sql.

ALTER TABLE "tenants"
  DROP COLUMN IF EXISTS "property_pipeline_id",
  DROP COLUMN IF EXISTS "property_trigger_stage",
  DROP COLUMN IF EXISTS "dispo_pipeline_id",
  DROP COLUMN IF EXISTS "dispo_trigger_stage";
