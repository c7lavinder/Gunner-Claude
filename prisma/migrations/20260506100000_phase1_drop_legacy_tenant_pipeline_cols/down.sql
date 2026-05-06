-- Reverse for 20260506100000_phase1_drop_legacy_tenant_pipeline_cols.
-- Apply manually: psql $DATABASE_URL -f prisma/migrations/.../down.sql
--
-- Restores the four columns + best-effort backfill from
-- tenant_ghl_pipelines so the legacy single-trigger webhook handler can
-- read them again. trigger-stage values can NOT be restored — they were
-- not preserved in tenant_ghl_pipelines (the new model is pipeline-wide,
-- no per-pipeline trigger stage). Manual re-entry required after rollback.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "property_pipeline_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "property_trigger_stage" TEXT,
  ADD COLUMN IF NOT EXISTS "dispo_pipeline_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "dispo_trigger_stage"    TEXT;

UPDATE "tenants" t
  SET "property_pipeline_id" = sub."ghl_pipeline_id"
  FROM (
    SELECT DISTINCT ON ("tenant_id") "tenant_id", "ghl_pipeline_id"
    FROM "tenant_ghl_pipelines"
    WHERE "track" = 'acquisition' AND "is_active" = TRUE
    ORDER BY "tenant_id", "created_at" ASC
  ) sub
  WHERE t."id" = sub."tenant_id";

UPDATE "tenants" t
  SET "dispo_pipeline_id" = sub."ghl_pipeline_id"
  FROM (
    SELECT DISTINCT ON ("tenant_id") "tenant_id", "ghl_pipeline_id"
    FROM "tenant_ghl_pipelines"
    WHERE "track" = 'disposition' AND "is_active" = TRUE
    ORDER BY "tenant_id", "created_at" ASC
  ) sub
  WHERE t."id" = sub."tenant_id";
