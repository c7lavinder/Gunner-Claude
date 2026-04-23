-- Tier 1 + Tier 2 Property enrichment columns.
--
-- These fields are returned "for free" by at least one of our enrichment
-- vendors (BatchData, PropertyRadar, RealEstateAPI, RentCast). By
-- promoting them to typed columns we can:
--   1. Denormalize existing zillowData.batchData JSON blobs (zero API cost)
--   2. Accept the same shape from every future vendor client
--   3. Query/filter directly in the inventory UI without JSON introspection
--
-- All columns are nullable — enrichment is opportunistic.

ALTER TABLE "properties"
  -- Identity & location
  ADD COLUMN "county"                     TEXT,
  ADD COLUMN "latitude"                   DECIMAL(10, 8),
  ADD COLUMN "longitude"                  DECIMAL(11, 8),
  ADD COLUMN "apn"                        TEXT,
  ADD COLUMN "fips"                       TEXT,
  ADD COLUMN "subdivision"                TEXT,

  -- Owner
  ADD COLUMN "absentee_owner"             BOOLEAN,
  ADD COLUMN "owner_phone"                TEXT,
  ADD COLUMN "owner_email"                TEXT,
  ADD COLUMN "owner_type"                 TEXT,
  ADD COLUMN "ownership_length_years"     INT,
  ADD COLUMN "second_owner_name"          TEXT,
  ADD COLUMN "second_owner_phone"         TEXT,
  ADD COLUMN "second_owner_email"         TEXT,

  -- Primary mortgage
  ADD COLUMN "mortgage_amount"            DECIMAL(12, 2),
  ADD COLUMN "mortgage_date"              TIMESTAMP(3),
  ADD COLUMN "mortgage_lender"            TEXT,
  ADD COLUMN "mortgage_type"              TEXT,
  ADD COLUMN "mortgage_rate"              DECIMAL(5, 3),

  -- Second mortgage / HELOC
  ADD COLUMN "second_mortgage_amount"     DECIMAL(12, 2),
  ADD COLUMN "second_mortgage_date"       TIMESTAMP(3),
  ADD COLUMN "second_mortgage_lender"     TEXT,

  -- Liens & legal
  ADD COLUMN "lien_count"                 INT,
  ADD COLUMN "property_lien_amount"       DECIMAL(12, 2),
  ADD COLUMN "lien_types"                 JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "judgment_count"             INT,

  -- Distress & foreclosure
  ADD COLUMN "tax_delinquent"             BOOLEAN,
  ADD COLUMN "tax_delinquent_amount"      DECIMAL(12, 2),
  ADD COLUMN "foreclosure_status"         TEXT,
  ADD COLUMN "bank_owned"                 BOOLEAN,
  ADD COLUMN "pre_foreclosure"            BOOLEAN,
  ADD COLUMN "nod_date"                   TIMESTAMP(3),
  ADD COLUMN "lis_pendens_date"           TIMESTAMP(3),
  ADD COLUMN "lis_pendens_amount"         DECIMAL(12, 2),
  ADD COLUMN "lis_pendens_plaintiff"      TEXT,
  ADD COLUMN "foreclosure_auction_date"   TIMESTAMP(3),
  ADD COLUMN "foreclosure_opening_bid"    DECIMAL(12, 2),

  -- Structure
  ADD COLUMN "stories"                    INT,
  ADD COLUMN "units"                      INT,
  ADD COLUMN "basement_finished_percent"  INT,

  -- Transfer / deed history
  ADD COLUMN "last_sale_price"            DECIMAL(12, 2),
  ADD COLUMN "transfer_count"             INT,
  ADD COLUMN "deed_type"                  TEXT,
  ADD COLUMN "data_last_updated"          TIMESTAMP(3),

  -- Construction detail (Tier 2)
  ADD COLUMN "roof_type"                  TEXT,
  ADD COLUMN "foundation_type"            TEXT,
  ADD COLUMN "garage_type"                TEXT,
  ADD COLUMN "garage_capacity"            INT,
  ADD COLUMN "heating_system"             TEXT,
  ADD COLUMN "cooling_system"             TEXT,
  ADD COLUMN "exterior_walls"             TEXT,

  -- Amenity flags (Tier 2)
  ADD COLUMN "has_pool"                   BOOLEAN,
  ADD COLUMN "has_deck"                   BOOLEAN,
  ADD COLUMN "has_porch"                  BOOLEAN,
  ADD COLUMN "has_solar"                  BOOLEAN,
  ADD COLUMN "has_fireplace"              BOOLEAN,
  ADD COLUMN "has_spa"                    BOOLEAN,

  -- Zoning / neighborhood
  ADD COLUMN "zoning_code"                TEXT,
  ADD COLUMN "land_use_code"              TEXT,
  ADD COLUMN "property_school_district"   TEXT,

  -- Environmental risk (flood_zone already present as "flood_zone")
  ADD COLUMN "earthquake_zone"            TEXT,
  ADD COLUMN "wildfire_risk"              TEXT,

  -- Vacancy signals (BatchData ships 4 orthogonal flags)
  ADD COLUMN "vacant_status"              TEXT,
  ADD COLUMN "vacant_status_year"         INT,
  ADD COLUMN "site_vacant"                BOOLEAN,
  ADD COLUMN "mail_vacant"                BOOLEAN;

-- Useful indexes for the inventory filter panel.
CREATE INDEX "properties_county_idx"             ON "properties" ("county");
CREATE INDEX "properties_apn_idx"                ON "properties" ("apn");
CREATE INDEX "properties_absentee_owner_idx"     ON "properties" ("absentee_owner");
CREATE INDEX "properties_tax_delinquent_idx"     ON "properties" ("tax_delinquent");
CREATE INDEX "properties_foreclosure_status_idx" ON "properties" ("foreclosure_status");
CREATE INDEX "properties_pre_foreclosure_idx"    ON "properties" ("pre_foreclosure");
CREATE INDEX "properties_vacant_status_idx"      ON "properties" ("vacant_status");
