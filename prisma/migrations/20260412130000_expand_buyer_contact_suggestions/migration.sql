-- Expand Buyer model to ~200 data points
-- Add ContactSuggestion model
-- Wire Call.buyerId -> Buyer relation

-- ============================================================
-- 1. Expand buyers table — new columns
-- ============================================================

-- Identity & Contact
ALTER TABLE "buyers" ADD COLUMN "secondary_phone" TEXT;
ALTER TABLE "buyers" ADD COLUMN "mobile_phone" TEXT;
ALTER TABLE "buyers" ADD COLUMN "secondary_email" TEXT;
ALTER TABLE "buyers" ADD COLUMN "mailing_address" TEXT;
ALTER TABLE "buyers" ADD COLUMN "mailing_city" TEXT;
ALTER TABLE "buyers" ADD COLUMN "mailing_state" TEXT;
ALTER TABLE "buyers" ADD COLUMN "mailing_zip" TEXT;
ALTER TABLE "buyers" ADD COLUMN "website" TEXT;
ALTER TABLE "buyers" ADD COLUMN "preferred_contact_method" TEXT;
ALTER TABLE "buyers" ADD COLUMN "best_time_to_contact" TEXT;
ALTER TABLE "buyers" ADD COLUMN "do_not_contact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "is_deceased" BOOLEAN NOT NULL DEFAULT false;

-- Buybox — Geographic
ALTER TABLE "buyers" ADD COLUMN "primary_markets" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "counties_of_interest" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "cities_of_interest" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "zip_codes_of_interest" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "neighborhoods_of_interest" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "geographic_exclusions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "max_drive_distance_miles" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "urban_rural_preference" TEXT;
ALTER TABLE "buyers" ADD COLUMN "is_national_buyer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "is_out_of_state_buyer" BOOLEAN NOT NULL DEFAULT false;

-- Buybox — Property
ALTER TABLE "buyers" ADD COLUMN "property_types" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "min_beds" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "max_beds" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "min_baths" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "max_baths" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "min_sqft" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "max_sqft" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "min_lot_size_acres" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "max_lot_size_acres" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "year_built_min" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "condition_range" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "buyers" ADD COLUMN "max_repair_budget" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "structural_issues_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "foundation_issues_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "fire_damage_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "mold_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "hoarder_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "tenant_occupied_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "prefers_vacant" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "basement_required" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "garage_required" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "pool_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "hoa_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "historic_district_ok" BOOLEAN;

-- Buybox — Financial
ALTER TABLE "buyers" ADD COLUMN "min_purchase_price" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "max_purchase_price" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "min_arv" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "max_arv" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "max_arv_percent" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "min_equity_required" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "max_assignment_fee_accepted" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "min_roi_required" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "min_cash_flow_required" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "rehab_budget_min" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "rehab_budget_max" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "funding_type" TEXT;
ALTER TABLE "buyers" ADD COLUMN "proof_of_funds_on_file" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "pof_amount" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "pof_expiration" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "hard_money_lender" TEXT;
ALTER TABLE "buyers" ADD COLUMN "typical_close_timeline_days" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "can_close_as_is" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "emd_amount_comfortable" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "double_close_ok" BOOLEAN;
ALTER TABLE "buyers" ADD COLUMN "subject_to_ok" BOOLEAN;

-- Activity & Performance
ALTER TABLE "buyers" ADD COLUMN "buyer_since_date" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "last_deal_closed_date" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "total_deals_closed_with_us" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "total_deals_closed_overall" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "average_deal_price" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "average_spread_accepted" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "average_close_timeline_days" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "blast_response_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "offer_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "close_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "deals_fallen_through" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "fall_through_reasons" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "total_volume_from_us" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "referrals_given" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "referrals_converted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "reliability_score" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "communication_score" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "buyer_grade" TEXT;

-- Blast & Communication
ALTER TABLE "buyers" ADD COLUMN "blast_frequency" TEXT;
ALTER TABLE "buyers" ADD COLUMN "best_blast_day" TEXT;
ALTER TABLE "buyers" ADD COLUMN "best_blast_time" TEXT;
ALTER TABLE "buyers" ADD COLUMN "preferred_blast_channel" TEXT;
ALTER TABLE "buyers" ADD COLUMN "unsubscribed_from_email" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "unsubscribed_from_text" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "email_open_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "text_response_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "call_answer_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "last_communication_date" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "average_response_time_hours" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "engagement_trend" TEXT;
ALTER TABLE "buyers" ADD COLUMN "is_ghost" BOOLEAN NOT NULL DEFAULT false;

-- Relationship
ALTER TABLE "buyers" ADD COLUMN "assigned_to_id" TEXT;
ALTER TABLE "buyers" ADD COLUMN "how_acquired" TEXT;
ALTER TABLE "buyers" ADD COLUMN "referral_source_name" TEXT;
ALTER TABLE "buyers" ADD COLUMN "relationship_strength" TEXT;
ALTER TABLE "buyers" ADD COLUMN "personal_notes" TEXT;
ALTER TABLE "buyers" ADD COLUMN "birthday" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "spouse_name" TEXT;
ALTER TABLE "buyers" ADD COLUMN "key_staff_names" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "last_in_person_meeting" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "is_vip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "has_exclusivity_agreement" BOOLEAN NOT NULL DEFAULT false;

-- Strategy & Preferences
ALTER TABLE "buyers" ADD COLUMN "exit_strategies" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "hold_period_months" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "target_tenant_profile" TEXT;
ALTER TABLE "buyers" ADD COLUMN "property_management_company" TEXT;
ALTER TABLE "buyers" ADD COLUMN "typical_rehab_timeline_days" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "off_market_only" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "is_1031_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "is_opportunity_zone_interest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "creative_finance_interest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "is_subject_to_buyer" BOOLEAN NOT NULL DEFAULT false;

-- AI Enriched
ALTER TABLE "buyers" ADD COLUMN "buyer_score" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "match_likelihood_score" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "reliability_prediction" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "communication_style_ai" TEXT;
ALTER TABLE "buyers" ADD COLUMN "negotiation_style" TEXT;
ALTER TABLE "buyers" ADD COLUMN "ghost_risk_score" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "upsell_potential" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "lifetime_value_estimate" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "ai_summary" TEXT;
ALTER TABLE "buyers" ADD COLUMN "recommended_approach" TEXT;
ALTER TABLE "buyers" ADD COLUMN "red_flags_ai" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "churn_risk" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "last_ai_analysis_date" TIMESTAMP(3);

-- General
ALTER TABLE "buyers" ADD COLUMN "internal_notes" TEXT;
ALTER TABLE "buyers" ADD COLUMN "priority_flag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyers" ADD COLUMN "custom_fields" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "buyers" ADD COLUMN "field_sources" JSONB NOT NULL DEFAULT '{}';

-- Drop old columns that are replaced by new schema
-- "markets" -> replaced by primary_markets, counties, cities, zips, neighborhoods
-- "criteria" -> replaced by individual buybox fields
-- "tags" stays (same name, same type)
-- "notes" -> replaced by internal_notes + personal_notes
ALTER TABLE "buyers" DROP COLUMN IF EXISTS "markets";
ALTER TABLE "buyers" DROP COLUMN IF EXISTS "criteria";
ALTER TABLE "buyers" DROP COLUMN IF EXISTS "notes";

-- Add index
CREATE INDEX "buyers_tenant_id_phone_idx" ON "buyers"("tenant_id", "phone");

-- ============================================================
-- 2. Wire Call.buyer_id -> buyers FK
-- ============================================================

ALTER TABLE "calls" ADD CONSTRAINT "calls_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 3. Create contact_suggestions table
-- ============================================================

CREATE TABLE "contact_suggestions" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenant_id" TEXT NOT NULL,
  "call_id" TEXT,
  "property_id" TEXT,
  "target_type" TEXT NOT NULL,
  "seller_id" TEXT,
  "buyer_id" TEXT,
  "field_name" TEXT NOT NULL,
  "field_label" TEXT NOT NULL,
  "current_value" JSONB,
  "proposed_value" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "evidence" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "final_value" JSONB,
  "decided_at" TIMESTAMP(3),
  "decided_by_id" TEXT,

  CONSTRAINT "contact_suggestions_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "contact_suggestions" ADD CONSTRAINT "contact_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "contact_suggestions_tenant_id_property_id_status_idx" ON "contact_suggestions"("tenant_id", "property_id", "status");
CREATE INDEX "contact_suggestions_tenant_id_seller_id_status_idx" ON "contact_suggestions"("tenant_id", "seller_id", "status");
CREATE INDEX "contact_suggestions_tenant_id_buyer_id_status_idx" ON "contact_suggestions"("tenant_id", "buyer_id", "status");
