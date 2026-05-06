-- Reverse migration for 20260506000000_phase1_multi_pipeline.
-- NOT auto-run by Prisma. Apply manually with:
--   psql $DATABASE_URL -f prisma/migrations/20260506000000_phase1_multi_pipeline/down.sql
--
-- Restores the pre-Phase-1 schema:
--   - Recreates legacy PropertyStatus enum + Property.status / ghl_pipeline_id /
--     ghl_pipeline_stage / stage_entered_at columns
--   - Reverts dispo_status type from DispoStatus → PropertyStatus
--   - Copies acq_status/longterm_status data back into status
--   - Drops the new per-lane columns + new enums
--   - Drops tenant_ghl_pipelines table
--
-- WARNING: data loss is possible.
--   - APPOINTMENT_COMPLETED / CONTACTED rows that were collapsed in step 3
--     of the forward migration will NOT be reconstructed here.
--   - SOLD rows (renamed to acq_status=CLOSED) come back as status=SOLD.
--   - dispo_status=CLOSED rows go back to dispo_status=DISPO_CLOSED.
--   - Any tenant_ghl_pipelines rows added since deploy are dropped.

-- ─── Step 1 — Recreate legacy PropertyStatus enum ──────────────────────────

CREATE TYPE "property_status" AS ENUM (
  'NEW_LEAD',
  'CONTACTED',
  'APPOINTMENT_SET',
  'APPOINTMENT_COMPLETED',
  'OFFER_MADE',
  'UNDER_CONTRACT',
  'IN_DISPOSITION',
  'DISPO_PUSHED',
  'DISPO_OFFERS',
  'DISPO_CONTRACTED',
  'DISPO_CLOSED',
  'SOLD',
  'FOLLOW_UP',
  'DEAD'
);

-- ─── Step 2 — Re-add legacy property columns ───────────────────────────────

ALTER TABLE "properties"
  ADD COLUMN "status"             "property_status" NOT NULL DEFAULT 'NEW_LEAD',
  ADD COLUMN "ghl_pipeline_id"    TEXT,
  ADD COLUMN "ghl_pipeline_stage" TEXT,
  ADD COLUMN "stage_entered_at"   TIMESTAMP(3);

-- ─── Step 3 — Copy per-lane status back into single column ─────────────────

UPDATE "properties" SET "status" = 'NEW_LEAD'::"property_status"
  WHERE "acq_status" = 'NEW_LEAD'::"acq_status";
UPDATE "properties" SET "status" = 'APPOINTMENT_SET'::"property_status"
  WHERE "acq_status" = 'APPOINTMENT_SET'::"acq_status";
UPDATE "properties" SET "status" = 'OFFER_MADE'::"property_status"
  WHERE "acq_status" = 'OFFER_MADE'::"acq_status";
UPDATE "properties" SET "status" = 'UNDER_CONTRACT'::"property_status"
  WHERE "acq_status" = 'UNDER_CONTRACT'::"acq_status";
UPDATE "properties" SET "status" = 'SOLD'::"property_status"
  WHERE "acq_status" = 'CLOSED'::"acq_status";

UPDATE "properties" SET "status" = 'FOLLOW_UP'::"property_status"
  WHERE "longterm_status" = 'FOLLOW_UP'::"longterm_status";
UPDATE "properties" SET "status" = 'DEAD'::"property_status"
  WHERE "longterm_status" = 'DEAD'::"longterm_status";

-- Restore stage_name + entered_at into the single legacy columns,
-- preferring acq lane when present, then dispo, then longterm.
UPDATE "properties" SET "ghl_pipeline_stage" = COALESCE(
  "ghl_acq_stage_name", "ghl_dispo_stage_name", "ghl_longterm_stage_name"
);
UPDATE "properties" SET "stage_entered_at" = COALESCE(
  "acq_stage_entered_at", "dispo_stage_entered_at", "longterm_stage_entered_at"
);

-- ─── Step 4 — Revert dispo_status type back to PropertyStatus ──────────────

ALTER TABLE "properties"
  ALTER COLUMN "dispo_status" TYPE "property_status" USING (
    CASE "dispo_status"::text
      WHEN 'IN_DISPOSITION'   THEN 'IN_DISPOSITION'::"property_status"
      WHEN 'DISPO_PUSHED'     THEN 'DISPO_PUSHED'::"property_status"
      WHEN 'DISPO_OFFERS'     THEN 'DISPO_OFFERS'::"property_status"
      WHEN 'DISPO_CONTRACTED' THEN 'DISPO_CONTRACTED'::"property_status"
      WHEN 'CLOSED'           THEN 'DISPO_CLOSED'::"property_status"
      ELSE NULL
    END
  );

-- ─── Step 5 — Drop new property columns ────────────────────────────────────

DROP INDEX IF EXISTS "properties_ghl_acq_opp_id_idx";
DROP INDEX IF EXISTS "properties_ghl_dispo_opp_id_idx";
DROP INDEX IF EXISTS "properties_ghl_longterm_opp_id_idx";

ALTER TABLE "properties"
  DROP COLUMN "acq_status",
  DROP COLUMN "longterm_status",
  DROP COLUMN "ghl_acq_opp_id",
  DROP COLUMN "ghl_dispo_opp_id",
  DROP COLUMN "ghl_longterm_opp_id",
  DROP COLUMN "ghl_acq_stage_name",
  DROP COLUMN "ghl_dispo_stage_name",
  DROP COLUMN "ghl_longterm_stage_name",
  DROP COLUMN "acq_stage_entered_at",
  DROP COLUMN "dispo_stage_entered_at",
  DROP COLUMN "longterm_stage_entered_at",
  DROP COLUMN "pending_enrichment";

-- ─── Step 6 — Drop new enums ───────────────────────────────────────────────

DROP TYPE "acq_status";
DROP TYPE "dispo_status";
DROP TYPE "longterm_status";

-- ─── Step 7 — Drop tenant_ghl_pipelines ────────────────────────────────────

DROP TABLE IF EXISTS "tenant_ghl_pipelines";
