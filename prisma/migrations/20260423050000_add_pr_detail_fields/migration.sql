-- PropertyRadar detail + persons endpoint fields.
--
-- The basic PropertyRadar search returns ~40 summary fields. To match what
-- the PR web UI shows (condition grades, tax rate, census info, owner age
-- + occupation + gender), we switched to a two-phase fetch:
--   1. POST /properties → find RadarID
--   2. GET /properties/{RadarID}?Purchase=1&Fields=<list> → rich detail
--   3. GET /properties/{RadarID}/persons?Purchase=1 → owner demographics
--
-- This migration adds the receiving columns. All nullable — no behavior
-- change for existing rows.

-- Property — condition grades + census + tax rate + legal description
ALTER TABLE "properties"
  ADD COLUMN "improvement_condition" TEXT,
  ADD COLUMN "building_quality"      TEXT,
  ADD COLUMN "estimated_tax_rate"    DECIMAL(5, 2),
  ADD COLUMN "census_tract"          TEXT,
  ADD COLUMN "census_block"          TEXT,
  ADD COLUMN "carrier_route"         TEXT,
  ADD COLUMN "legal_description"     TEXT;

CREATE INDEX "properties_improvement_condition_idx" ON "properties" ("improvement_condition");
CREATE INDEX "properties_building_quality_idx"      ON "properties" ("building_quality");

-- Seller — owner demographics from PropertyRadar's /persons endpoint
ALTER TABLE "sellers"
  ADD COLUMN "age"         INT,
  ADD COLUMN "gender"      TEXT,
  ADD COLUMN "person_type" TEXT;
