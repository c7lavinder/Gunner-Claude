-- Multi-vendor enrichment expansion.
--
-- Three sections in one migration — all fields confirmed present in live
-- probes on 2026-04-23:
--   A) PropertyRadar subscription extras on Property
--   B) Google Places fields on Property
--   C) CourtListener case-search fields on Seller
--
-- All nullable, all opportunistic. The same `setIfEmpty` pattern the
-- BatchData denormalizer uses applies: whichever vendor fills a cell first
-- keeps it unless a user edits.

-- ═════════════════════════════════════════════════════════════════════
-- A) PropertyRadar subscription extras
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE "properties"
  ADD COLUMN "owner_first_name_1"   TEXT,
  ADD COLUMN "owner_last_name_1"    TEXT,
  ADD COLUMN "owner_first_name_2"   TEXT,
  ADD COLUMN "owner_last_name_2"    TEXT,
  ADD COLUMN "pct_change_in_value"  DECIMAL(6, 2),
  ADD COLUMN "cash_sale"            BOOLEAN,
  ADD COLUMN "investor_type"        TEXT,
  ADD COLUMN "hoa_dues"             DECIMAL(10, 2),
  ADD COLUMN "hoa_past_due"         BOOLEAN,
  ADD COLUMN "hoa_name"             TEXT,
  ADD COLUMN "last_mls_status"      TEXT,
  ADD COLUMN "last_mls_list_price"  DECIMAL(12, 2),
  ADD COLUMN "last_mls_sold_price"  DECIMAL(12, 2),
  ADD COLUMN "owner_mailing_vacant" BOOLEAN,

-- ═════════════════════════════════════════════════════════════════════
-- B) Google Places fields on Property
-- ═════════════════════════════════════════════════════════════════════
  ADD COLUMN "google_place_id"              TEXT,
  ADD COLUMN "google_verified_address"      TEXT,
  ADD COLUMN "google_latitude"              DECIMAL(10, 8),
  ADD COLUMN "google_longitude"             DECIMAL(11, 8),
  ADD COLUMN "google_street_view_url"       TEXT,
  ADD COLUMN "google_maps_url"              TEXT,
  ADD COLUMN "google_place_types"           JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "google_photo_thumbnail_url"   TEXT,
  ADD COLUMN "google_searched_at"           TIMESTAMP(3);

CREATE INDEX "properties_google_place_id_idx" ON "properties" ("google_place_id");
CREATE INDEX "properties_investor_type_idx"   ON "properties" ("investor_type");

-- ═════════════════════════════════════════════════════════════════════
-- C) CourtListener case-search fields on Seller
-- ═════════════════════════════════════════════════════════════════════
-- These live on Seller, not Property, because bankruptcy / divorce / civil
-- judgments follow the person across every property they own. A single
-- CourtListener search per seller populates all of these.
ALTER TABLE "sellers"
  ADD COLUMN "cl_cases_searched_at"             TIMESTAMP(3),
  ADD COLUMN "cl_cases_json"                    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "cl_bankruptcy_count"              INT  NOT NULL DEFAULT 0,
  ADD COLUMN "cl_bankruptcy_latest_chapter"     TEXT,
  ADD COLUMN "cl_bankruptcy_latest_filing_date" TIMESTAMP(3),
  ADD COLUMN "cl_bankruptcy_latest_status"      TEXT,
  ADD COLUMN "cl_bankruptcy_latest_court"       TEXT,
  ADD COLUMN "cl_divorce_count"                 INT  NOT NULL DEFAULT 0,
  ADD COLUMN "cl_divorce_latest_filing_date"    TIMESTAMP(3),
  ADD COLUMN "cl_civil_judgment_count"          INT  NOT NULL DEFAULT 0,
  ADD COLUMN "cl_civil_judgment_latest_date"    TIMESTAMP(3),
  ADD COLUMN "cl_foreclosure_court_case_date"   TIMESTAMP(3),
  ADD COLUMN "cl_probate_count"                 INT  NOT NULL DEFAULT 0,
  ADD COLUMN "cl_probate_latest_filing_date"    TIMESTAMP(3);

CREATE INDEX "sellers_cl_bankruptcy_count_idx"     ON "sellers" ("cl_bankruptcy_count");
CREATE INDEX "sellers_cl_civil_judgment_count_idx" ON "sellers" ("cl_civil_judgment_count");
