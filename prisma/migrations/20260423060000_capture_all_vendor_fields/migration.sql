-- Capture every field returned by BatchData + PropertyRadar as first-class
-- columns so the UI can display/filter and KPIs can query them. Arrays
-- (deed history, mortgage history, liens) get dedicated JSON columns.

-- ─── Property columns ───────────────────────────────────────────────
ALTER TABLE "properties"
  -- Address metadata (BatchData USPS validation)
  ADD COLUMN "address_validity"          TEXT,
  ADD COLUMN "zip_plus4"                 TEXT,

  -- BatchData intel (seller motivation)
  ADD COLUMN "sale_propensity"           DECIMAL(5,2),
  ADD COLUMN "sale_propensity_category"  TEXT,
  ADD COLUMN "sale_propensity_status"    TEXT,

  -- BatchData listing activity
  ADD COLUMN "listing_status"            TEXT,
  ADD COLUMN "listing_status_category"   TEXT,
  ADD COLUMN "listing_failed_date"       TIMESTAMP(3),
  ADD COLUMN "listing_original_date"     TIMESTAMP(3),
  ADD COLUMN "listing_sold_price"        DECIMAL(12,2),
  ADD COLUMN "listing_sold_date"         TIMESTAMP(3),
  ADD COLUMN "listing_agent_name"        TEXT,
  ADD COLUMN "listing_agent_phone"       TEXT,
  ADD COLUMN "listing_broker_name"       TEXT,

  -- Foreclosure extended detail (BatchData `foreclosure` block)
  ADD COLUMN "foreclosure_auction_city"     TEXT,
  ADD COLUMN "foreclosure_auction_location" TEXT,
  ADD COLUMN "foreclosure_auction_time"     TEXT,
  ADD COLUMN "foreclosure_borrower"         TEXT,
  ADD COLUMN "foreclosure_document_type"    TEXT,
  ADD COLUMN "foreclosure_filing_date"      TIMESTAMP(3),
  ADD COLUMN "foreclosure_recording_date"   TIMESTAMP(3),
  ADD COLUMN "foreclosure_trustee_name"     TEXT,
  ADD COLUMN "foreclosure_trustee_phone"    TEXT,
  ADD COLUMN "foreclosure_trustee_address"  TEXT,
  ADD COLUMN "foreclosure_trustee_sale_num" TEXT,

  -- Owner portfolio (BatchData `propertyOwnerProfile`)
  ADD COLUMN "owner_portfolio_count"           INTEGER,
  ADD COLUMN "owner_portfolio_total_equity"    DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_total_value"     DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_total_purchase"  DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_avg_assessed"    DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_avg_purchase"    DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_avg_year_built"  INTEGER,

  -- QuickLists flags (BatchData)
  ADD COLUMN "absentee_owner_in_state"   BOOLEAN,
  ADD COLUMN "senior_owner"              BOOLEAN,
  ADD COLUMN "same_property_mailing"     BOOLEAN,

  -- Valuation detail (BatchData `valuation`)
  ADD COLUMN "valuation_as_of_date"      TIMESTAMP(3),
  ADD COLUMN "valuation_confidence"      INTEGER,
  ADD COLUMN "valuation_std_deviation"   DECIMAL(10,2),

  -- PropertyRadar scalar flags + detail
  ADD COLUMN "advanced_property_type"    TEXT,
  ADD COLUMN "lot_depth_footage"         INTEGER,
  ADD COLUMN "cash_buyer_owner"          BOOLEAN,
  ADD COLUMN "deceased_owner"            BOOLEAN,
  ADD COLUMN "has_open_liens"            BOOLEAN,
  ADD COLUMN "has_open_person_liens"     BOOLEAN,
  ADD COLUMN "same_mailing_or_exempt"    BOOLEAN,
  ADD COLUMN "same_mailing"              BOOLEAN,
  ADD COLUMN "underwater"                BOOLEAN,
  ADD COLUMN "expired_listing"           BOOLEAN,

  -- Multi-row arrays stored as JSON (dedicated, not buried in zillowData)
  ADD COLUMN "deed_history_json"         JSONB,
  ADD COLUMN "mortgage_history_json"     JSONB,
  ADD COLUMN "liens_json"                JSONB,
  ADD COLUMN "foreclosure_detail_json"   JSONB,
  ADD COLUMN "owner_portfolio_json"      JSONB,
  ADD COLUMN "valuation_json"            JSONB,
  ADD COLUMN "quicklists_json"           JSONB;

-- Indexes for common filter columns
CREATE INDEX "properties_advanced_property_type_idx" ON "properties"("advanced_property_type");
CREATE INDEX "properties_senior_owner_idx"          ON "properties"("senior_owner");
CREATE INDEX "properties_deceased_owner_idx"        ON "properties"("deceased_owner");
CREATE INDEX "properties_has_open_liens_idx"        ON "properties"("has_open_liens");
CREATE INDEX "properties_sale_propensity_idx"       ON "properties"("sale_propensity");

-- ─── Seller columns (mailing address components) ────────────────────
ALTER TABLE "sellers"
  ADD COLUMN "mailing_validity"            TEXT,
  ADD COLUMN "mailing_zip_plus4"           TEXT,
  ADD COLUMN "mailing_delivery_point"      TEXT,
  ADD COLUMN "mailing_dpv_footnotes"       TEXT,
  ADD COLUMN "mailing_dpv_match_code"      TEXT,
  ADD COLUMN "mailing_county"              TEXT;
