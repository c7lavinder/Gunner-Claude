-- Property Story: AI-generated narrative that updates on call.graded and a daily cron.
-- story holds the most recent paragraph; storyUpdatedAt powers the "Updated Xd ago" pill;
-- storyVersion bumps every regeneration for cache-busting and debugging.
ALTER TABLE "properties" ADD COLUMN "story" TEXT;
ALTER TABLE "properties" ADD COLUMN "story_updated_at" TIMESTAMP(3);
ALTER TABLE "properties" ADD COLUMN "story_version" INTEGER NOT NULL DEFAULT 0;

-- Alt offer types (Novation, Subto, Partnership, custom…). Cash stays in the existing
-- askingPrice/mao/contractPrice/highestOffer/acceptedPrice/assignmentFee/finalProfit columns.
-- offer_types is the per-property list of alt type names (String[]).
-- alt_prices is keyed by offer type → { [priceField]: stringValue }. Example:
--   { "Novation": { "mao": "180000", "askingPrice": "240000" },
--     "Subto":    { "mao": "165000" } }
ALTER TABLE "properties" ADD COLUMN "offer_types" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "properties" ADD COLUMN "alt_prices"  JSONB NOT NULL DEFAULT '{}'::jsonb;
