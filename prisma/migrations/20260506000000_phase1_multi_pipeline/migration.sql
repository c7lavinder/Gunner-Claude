-- Phase 1 of GHL multi-pipeline redesign.
-- See docs/plans/ghl-multi-pipeline-bulletproof.md §3 + §6.
-- Reverse migration kept alongside in down.sql.
--
-- Net effect:
--   - 3 new enums: AcqStatus, DispoStatus, LongtermStatus
--   - 12 new columns on properties (per-lane status/opp-id/stage-name/entered-at + pendingEnrichment)
--   - dispo_status retyped from PropertyStatus → DispoStatus (DISPO_CLOSED renamed to CLOSED in same cast)
--   - 4 columns dropped from properties (status, ghl_pipeline_id, ghl_pipeline_stage, stage_entered_at)
--   - PropertyStatus enum dropped
--   - tenant_ghl_pipelines table created + backfilled from existing tenants.{property,dispo}_pipeline_id
--
-- Tenant.{property,dispo}_{pipeline_id,trigger_stage} columns intentionally
-- preserved here — they are dropped in Phase 1 commit 2 alongside the
-- lane-aware handler refactor + Settings UI rebuild.

-- ─── Step 1 — Create new enums ──────────────────────────────────────────────

CREATE TYPE "acq_status" AS ENUM (
  'NEW_LEAD',
  'APPOINTMENT_SET',
  'OFFER_MADE',
  'UNDER_CONTRACT',
  'CLOSED'
);

CREATE TYPE "dispo_status" AS ENUM (
  'IN_DISPOSITION',
  'DISPO_PUSHED',
  'DISPO_OFFERS',
  'DISPO_CONTRACTED',
  'CLOSED'
);

CREATE TYPE "longterm_status" AS ENUM (
  'FOLLOW_UP',
  'DEAD'
);

-- ─── Step 2 — Add new columns on properties ─────────────────────────────────

ALTER TABLE "properties"
  ADD COLUMN "acq_status"               "acq_status",
  ADD COLUMN "longterm_status"          "longterm_status",
  ADD COLUMN "ghl_acq_opp_id"           TEXT,
  ADD COLUMN "ghl_dispo_opp_id"         TEXT,
  ADD COLUMN "ghl_longterm_opp_id"      TEXT,
  ADD COLUMN "ghl_acq_stage_name"       TEXT,
  ADD COLUMN "ghl_dispo_stage_name"     TEXT,
  ADD COLUMN "ghl_longterm_stage_name"  TEXT,
  ADD COLUMN "acq_stage_entered_at"     TIMESTAMP(3),
  ADD COLUMN "dispo_stage_entered_at"   TIMESTAMP(3),
  ADD COLUMN "longterm_stage_entered_at" TIMESTAMP(3),
  ADD COLUMN "pending_enrichment"       BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "properties_ghl_acq_opp_id_idx"      ON "properties" ("ghl_acq_opp_id");
CREATE INDEX "properties_ghl_dispo_opp_id_idx"    ON "properties" ("ghl_dispo_opp_id");
CREATE INDEX "properties_ghl_longterm_opp_id_idx" ON "properties" ("ghl_longterm_opp_id");

-- ─── Step 3 — Data copy: status → acq_status / longterm_status ──────────────

UPDATE "properties" SET "acq_status" = 'NEW_LEAD'::"acq_status"
  WHERE "status"::text IN ('NEW_LEAD', 'CONTACTED');
UPDATE "properties" SET "acq_status" = 'APPOINTMENT_SET'::"acq_status"
  WHERE "status"::text IN ('APPOINTMENT_SET', 'APPOINTMENT_COMPLETED');
UPDATE "properties" SET "acq_status" = 'OFFER_MADE'::"acq_status"
  WHERE "status"::text = 'OFFER_MADE';
UPDATE "properties" SET "acq_status" = 'UNDER_CONTRACT'::"acq_status"
  WHERE "status"::text = 'UNDER_CONTRACT';
UPDATE "properties" SET "acq_status" = 'CLOSED'::"acq_status"
  WHERE "status"::text = 'SOLD';

UPDATE "properties" SET "longterm_status" = 'FOLLOW_UP'::"longterm_status"
  WHERE "status"::text = 'FOLLOW_UP';
UPDATE "properties" SET "longterm_status" = 'DEAD'::"longterm_status"
  WHERE "status"::text = 'DEAD';

-- ─── Step 4 — Stage-name + entered-at backfill from legacy single columns ──

UPDATE "properties"
  SET "ghl_acq_stage_name" = "ghl_pipeline_stage"
  WHERE "acq_status" IS NOT NULL AND "ghl_pipeline_stage" IS NOT NULL;

UPDATE "properties"
  SET "ghl_longterm_stage_name" = "ghl_pipeline_stage"
  WHERE "longterm_status" IS NOT NULL AND "ghl_pipeline_stage" IS NOT NULL;

-- (Existing dispo properties don't have a separate stage_name source —
-- they kept their stage in ghl_pipeline_stage too, mostly via the dispo
-- handler. Same backfill rule.)
UPDATE "properties"
  SET "ghl_dispo_stage_name" = "ghl_pipeline_stage"
  WHERE "dispo_status" IS NOT NULL AND "ghl_pipeline_stage" IS NOT NULL;

UPDATE "properties"
  SET "acq_stage_entered_at" = "stage_entered_at"
  WHERE "acq_status" IS NOT NULL;

UPDATE "properties"
  SET "dispo_stage_entered_at" = "stage_entered_at"
  WHERE "dispo_status" IS NOT NULL;

UPDATE "properties"
  SET "longterm_stage_entered_at" = "stage_entered_at"
  WHERE "longterm_status" IS NOT NULL;

-- ─── Step 5 — Retype dispo_status from PropertyStatus to DispoStatus ────────
-- DISPO_CLOSED → CLOSED rename happens in the cast.

ALTER TABLE "properties"
  ALTER COLUMN "dispo_status" DROP DEFAULT,
  ALTER COLUMN "dispo_status" TYPE "dispo_status" USING (
    CASE "dispo_status"::text
      WHEN 'IN_DISPOSITION'   THEN 'IN_DISPOSITION'::"dispo_status"
      WHEN 'DISPO_PUSHED'     THEN 'DISPO_PUSHED'::"dispo_status"
      WHEN 'DISPO_OFFERS'     THEN 'DISPO_OFFERS'::"dispo_status"
      WHEN 'DISPO_CONTRACTED' THEN 'DISPO_CONTRACTED'::"dispo_status"
      WHEN 'DISPO_CLOSED'     THEN 'CLOSED'::"dispo_status"
      ELSE NULL
    END
  );

-- ─── Step 6 — Drop legacy property columns ──────────────────────────────────

ALTER TABLE "properties"
  DROP COLUMN "status",
  DROP COLUMN "ghl_pipeline_id",
  DROP COLUMN "ghl_pipeline_stage",
  DROP COLUMN "stage_entered_at";

-- ─── Step 7 — Drop legacy PropertyStatus enum ───────────────────────────────

DROP TYPE "property_status";

-- ─── Step 8 — Create tenant_ghl_pipelines table ────────────────────────────

CREATE TABLE "tenant_ghl_pipelines" (
  "id"              TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id"       TEXT NOT NULL,
  "ghl_pipeline_id" TEXT NOT NULL,
  "track"           TEXT NOT NULL,
  "is_active"       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "tenant_ghl_pipelines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_ghl_pipelines_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenant_ghl_pipelines_tenant_id_ghl_pipeline_id_key"
  ON "tenant_ghl_pipelines" ("tenant_id", "ghl_pipeline_id");

CREATE INDEX "tenant_ghl_pipelines_tenant_id_track_idx"
  ON "tenant_ghl_pipelines" ("tenant_id", "track");

-- ─── Step 9 — Backfill tenant_ghl_pipelines from existing tenant config ────

-- Acquisition lane: one row per non-null property_pipeline_id.
INSERT INTO "tenant_ghl_pipelines" ("id", "tenant_id", "ghl_pipeline_id", "track", "is_active")
SELECT
  -- cuid-shaped fallback: 'c' + 24 chars of randomness. Good enough for
  -- backfilled rows; new rows from app code use Prisma's @default(cuid()).
  'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  "id",
  "property_pipeline_id",
  'acquisition',
  TRUE
FROM "tenants"
WHERE "property_pipeline_id" IS NOT NULL
ON CONFLICT ("tenant_id", "ghl_pipeline_id") DO NOTHING;

-- Disposition lane: one row per non-null dispo_pipeline_id.
INSERT INTO "tenant_ghl_pipelines" ("id", "tenant_id", "ghl_pipeline_id", "track", "is_active")
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  "id",
  "dispo_pipeline_id",
  'disposition',
  TRUE
FROM "tenants"
WHERE "dispo_pipeline_id" IS NOT NULL
ON CONFLICT ("tenant_id", "ghl_pipeline_id") DO NOTHING;
