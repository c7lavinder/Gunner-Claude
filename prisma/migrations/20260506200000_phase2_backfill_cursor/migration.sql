-- Phase 2 of GHL multi-pipeline redesign — backfill cursor table.
-- Tracks per-tenant per-pipeline progress so the backfill script
-- (scripts/backfill-ghl-pipelines.ts) is resumable on partial failure.
-- See docs/plans/ghl-multi-pipeline-bulletproof.md §7.

CREATE TABLE "backfill_cursors" (
  "id"                    TEXT NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  "tenant_id"             TEXT NOT NULL,
  "ghl_pipeline_id"       TEXT NOT NULL,
  "next_start_after_ts"   BIGINT,
  "next_start_after_id"   TEXT,
  "is_completed"          BOOLEAN NOT NULL DEFAULT FALSE,
  "opps_scanned"          INTEGER NOT NULL DEFAULT 0,
  "properties_created"    INTEGER NOT NULL DEFAULT 0,
  "properties_linked"     INTEGER NOT NULL DEFAULT 0,
  "sellers_created"       INTEGER NOT NULL DEFAULT 0,
  "errors_logged"         INTEGER NOT NULL DEFAULT 0,
  "last_run_at"           TIMESTAMP(3),
  CONSTRAINT "backfill_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backfill_cursors_tenant_id_ghl_pipeline_id_key"
  ON "backfill_cursors" ("tenant_id", "ghl_pipeline_id");
