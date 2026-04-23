-- Tier 3 enrichment columns.
--
-- Captures the vendor-exclusive signals confirmed by live probes on
-- 2026-04-23 (see /Users/vieiraproject/cast-probe-notes.md). These fields
-- are returned "for free" on calls we already pay for, so promoting them to
-- typed columns costs nothing beyond the migration.
--
-- Sources:
--   PropertyRadar  → distress composite + legal distress flags + equity
--   RealEstateAPI  → MLS activity, HUD demographics, school detail
--
-- All nullable — data coverage is opportunistic and varies per vendor.

ALTER TABLE "properties"
  -- PropertyRadar distress composite + legal flags
  ADD COLUMN "distress_score"             INT,
  ADD COLUMN "in_bankruptcy"              BOOLEAN,
  ADD COLUMN "in_probate"                 BOOLEAN,
  ADD COLUMN "in_divorce"                 BOOLEAN,
  ADD COLUMN "has_recent_eviction"        BOOLEAN,
  ADD COLUMN "is_recent_flip"             BOOLEAN,
  ADD COLUMN "is_recent_sale"             BOOLEAN,
  ADD COLUMN "is_listed_for_sale"         BOOLEAN,
  ADD COLUMN "is_auction"                 BOOLEAN,

  -- Equity detail (beyond the percent we already had)
  ADD COLUMN "available_equity"           DECIMAL(12, 2),
  ADD COLUMN "estimated_equity"           DECIMAL(12, 2),
  ADD COLUMN "equity_percent"             DECIMAL(5, 2),
  ADD COLUMN "open_mortgage_balance"      DECIMAL(12, 2),
  ADD COLUMN "estimated_mortgage_payment" DECIMAL(12, 2),

  -- Inheritance / death transfer (REAPI top-level flags)
  ADD COLUMN "inherited"                  BOOLEAN,
  ADD COLUMN "death_transfer"             BOOLEAN,
  ADD COLUMN "mortgage_assumable"         BOOLEAN,

  -- MLS activity (REAPI)
  ADD COLUMN "mls_active"                 BOOLEAN,
  ADD COLUMN "mls_pending"                BOOLEAN,
  ADD COLUMN "mls_sold"                   BOOLEAN,
  ADD COLUMN "mls_cancelled"              BOOLEAN,
  ADD COLUMN "mls_failed"                 BOOLEAN,
  ADD COLUMN "mls_status"                 TEXT,
  ADD COLUMN "mls_type"                   TEXT,
  ADD COLUMN "mls_listing_date"           TIMESTAMP(3),
  ADD COLUMN "mls_listing_price"          DECIMAL(12, 2),
  ADD COLUMN "mls_sold_price"             DECIMAL(12, 2),
  ADD COLUMN "mls_days_on_market"         INT,
  ADD COLUMN "mls_price_per_sqft"         DECIMAL(10, 2),
  ADD COLUMN "mls_keywords"               JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "mls_last_status_date"       TIMESTAMP(3),

  -- Flood detail
  ADD COLUMN "flood_zone_type"            TEXT,

  -- REAPI demographics / HUD area data
  ADD COLUMN "suggested_rent"             DECIMAL(10, 2),
  ADD COLUMN "median_income"              DECIMAL(12, 2),
  ADD COLUMN "hud_area_code"              TEXT,
  ADD COLUMN "hud_area_name"              TEXT,
  ADD COLUMN "fmr_year"                   INT,
  ADD COLUMN "fmr_efficiency"             DECIMAL(10, 2),
  ADD COLUMN "fmr_one_bedroom"            DECIMAL(10, 2),
  ADD COLUMN "fmr_two_bedroom"            DECIMAL(10, 2),
  ADD COLUMN "fmr_three_bedroom"          DECIMAL(10, 2),
  ADD COLUMN "fmr_four_bedroom"           DECIMAL(10, 2),

  -- Schools (REAPI)
  ADD COLUMN "school_primary_name"        TEXT,
  ADD COLUMN "school_primary_rating"      INT,
  ADD COLUMN "schools_json"               JSONB NOT NULL DEFAULT '[]';

-- Indexes for filter panels / dashboard widgets.
CREATE INDEX "properties_distress_score_idx"      ON "properties" ("distress_score");
CREATE INDEX "properties_in_bankruptcy_idx"       ON "properties" ("in_bankruptcy");
CREATE INDEX "properties_in_probate_idx"          ON "properties" ("in_probate");
CREATE INDEX "properties_is_listed_for_sale_idx"  ON "properties" ("is_listed_for_sale");
CREATE INDEX "properties_mls_active_idx"          ON "properties" ("mls_active");
