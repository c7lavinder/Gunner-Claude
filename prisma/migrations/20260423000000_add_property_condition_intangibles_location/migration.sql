-- Property condition, intangibles, and location/market grades. All free-form
-- strings so users can pick any grading scheme (A-F, 1-10, "Good", "Needs
-- replacement", etc.) without enum lock-in.

-- Exterior / structural condition
ALTER TABLE "properties" ADD COLUMN "roof_condition" TEXT;
ALTER TABLE "properties" ADD COLUMN "windows_condition" TEXT;
ALTER TABLE "properties" ADD COLUMN "siding_condition" TEXT;
ALTER TABLE "properties" ADD COLUMN "exterior_condition" TEXT;

-- Intangibles
ALTER TABLE "properties" ADD COLUMN "comparable_risk" TEXT;
ALTER TABLE "properties" ADD COLUMN "basement_status" TEXT;
ALTER TABLE "properties" ADD COLUMN "curb_appeal" TEXT;
ALTER TABLE "properties" ADD COLUMN "neighbors_grade" TEXT;
ALTER TABLE "properties" ADD COLUMN "parking_type" TEXT;
ALTER TABLE "properties" ADD COLUMN "yard_grade" TEXT;

-- Location + market
ALTER TABLE "properties" ADD COLUMN "location_grade" TEXT;
ALTER TABLE "properties" ADD COLUMN "market_risk" TEXT;
