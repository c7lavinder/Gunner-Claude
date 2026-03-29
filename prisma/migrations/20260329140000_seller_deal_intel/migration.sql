-- Seller & deal intel fields
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "seller_motivation_text" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "seller_timeline" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "property_condition" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "seller_asking_reason" TEXT;

ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "motivation" TEXT;
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "situation" TEXT;
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "decision_makers" TEXT;
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "best_time_to_call" TEXT;
