-- Property Enhancements: utilities, AI enrichment, deal blast overrides, buyer stages

-- Utilities (Fix 3)
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "water_type" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "water_notes" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sewer_type" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sewer_condition" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sewer_notes" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "electric_type" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "electric_notes" TEXT;

-- AI enrichment (Fix 4)
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "repair_estimate" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "rental_estimate" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "neighborhood_summary" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "zestimate" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "owner_name" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "deed_date" TIMESTAMP(3);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "tax_assessment" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "annual_tax" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "flood_zone" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "ai_enrichment_status" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "ai_enrichment_error" TEXT;

-- Deal Blast overrides (Fix 5)
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "deal_blast_asking_override" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "deal_blast_arv_override" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "deal_blast_contract_override" DECIMAL(12,2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "deal_blast_assignment_fee_override" DECIMAL(12,2);

-- PropertyBuyerStage table (buyers pipeline)
CREATE TABLE IF NOT EXISTS "property_buyer_stages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'matched',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ghl_response" TEXT,
    "response_intent" TEXT,
    "response_at" TIMESTAMP(3),
    "moved_to_responded_at" TIMESTAMP(3),
    "moved_to_interested_at" TIMESTAMP(3),
    CONSTRAINT "property_buyer_stages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "property_buyer_stages_property_id_buyer_id_key" ON "property_buyer_stages"("property_id", "buyer_id");

DO $$ BEGIN
  ALTER TABLE "property_buyer_stages" ADD CONSTRAINT "property_buyer_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "property_buyer_stages" ADD CONSTRAINT "property_buyer_stages_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "property_buyer_stages" ADD CONSTRAINT "property_buyer_stages_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
