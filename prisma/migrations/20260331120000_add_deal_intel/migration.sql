-- Add deal intelligence fields to properties
ALTER TABLE "properties" ADD COLUMN "lead_sub_source" TEXT;
ALTER TABLE "properties" ADD COLUMN "seller_motivation_level" INTEGER;
ALTER TABLE "properties" ADD COLUMN "timeline_urgency" TEXT;
ALTER TABLE "properties" ADD COLUMN "decision_makers_confirmed" BOOLEAN;
ALTER TABLE "properties" ADD COLUMN "competing_offer_count" INTEGER;
ALTER TABLE "properties" ADD COLUMN "deal_health_score" INTEGER;
ALTER TABLE "properties" ADD COLUMN "deal_intel" JSONB;

-- Add deal intel history to calls
ALTER TABLE "calls" ADD COLUMN "deal_intel_history" JSONB;
