-- v1.1 Wave 5 — Property column strip cutover (DESTRUCTIVE).
-- See docs/v1.1/SELLER_BUYER_PLAN.md §8 Wave 5.
--
-- DROPS 24 columns + 2 indexes across 3 tables. The data they hold has
-- been migrated to Seller (Wave 1+2 backfill applied 2026-04-30) and
-- PropertyBuyerStage (Wave 1+3 manual-buyer migration applied 2026-04-30).
-- Wave 4 closed the AI write-path so new data flows directly to the
-- canonical destinations; this migration removes the legacy staging
-- columns + the dual-write window.
--
-- PRE-CUTOVER PROTOCOL:
--   1. Railway DB snapshot taken before merging this migration. The
--      pre-cutover snapshot is the rollback handle.
--   2. Read-path migration shipped in companion code commit (this same
--      PR / commit chain). All UI surfaces now read Seller fields via
--      primarySeller = property.sellers[0]. Vendor enrichment pipeline
--      stopped writing to Property.owner_* in lib/batchdata/enrich.ts.
--   3. lib/v1_1/wave_2_backfill.ts deleted (its source columns are
--      what's being dropped — the file became uncompilable on this
--      schema). The diagnostic endpoint at
--      /api/diagnostics/v1_1_seller_backfill is also deleted.
--
-- ROLLBACK: restore the pre-cutover Railway snapshot. The columns
-- carry no data Wave 4's apply hasn't already mirrored to Seller, so
-- a forward fix (re-add columns + re-backfill from Seller) is also
-- viable but slower.

-- ─── Property — drop owner staging columns ─────────────────────────────
ALTER TABLE "properties"
  DROP COLUMN "owner_phone",
  DROP COLUMN "owner_email",
  DROP COLUMN "owner_type",
  DROP COLUMN "ownership_length_years",
  DROP COLUMN "second_owner_name",
  DROP COLUMN "second_owner_phone",
  DROP COLUMN "second_owner_email",
  DROP COLUMN "owner_first_name_1",
  DROP COLUMN "owner_last_name_1",
  DROP COLUMN "owner_first_name_2",
  DROP COLUMN "owner_last_name_2",
  DROP COLUMN "owner_portfolio_count",
  DROP COLUMN "owner_portfolio_total_equity",
  DROP COLUMN "owner_portfolio_total_value",
  DROP COLUMN "owner_portfolio_total_purchase",
  DROP COLUMN "owner_portfolio_avg_assessed",
  DROP COLUMN "owner_portfolio_avg_purchase",
  DROP COLUMN "owner_portfolio_avg_year_built",
  DROP COLUMN "owner_portfolio_json",
  DROP COLUMN "senior_owner",
  DROP COLUMN "deceased_owner",
  DROP COLUMN "cash_buyer_owner",
  DROP COLUMN "manual_buyer_ids";

-- Indexes on dropped columns are auto-removed by PostgreSQL when their
-- column drops, but listing explicitly for documentation.
-- DROP INDEX IF EXISTS "properties_senior_owner_idx";
-- DROP INDEX IF EXISTS "properties_deceased_owner_idx";

-- ─── Buyer — drop wrong-unit per-buyer match score ─────────────────────
ALTER TABLE "buyers"
  DROP COLUMN "match_likelihood_score";
