-- Expand Seller model to ~200 data points
-- Link Call records to Seller
-- Strip seller-specific intel fields from Property

-- ============================================================
-- 1. Add new columns to sellers table
-- ============================================================

ALTER TABLE "sellers" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sellers" ADD COLUMN "secondary_phone" TEXT;
ALTER TABLE "sellers" ADD COLUMN "mobile_phone" TEXT;
ALTER TABLE "sellers" ADD COLUMN "secondary_email" TEXT;
ALTER TABLE "sellers" ADD COLUMN "mailing_address" TEXT;
ALTER TABLE "sellers" ADD COLUMN "mailing_city" TEXT;
ALTER TABLE "sellers" ADD COLUMN "mailing_state" TEXT;
ALTER TABLE "sellers" ADD COLUMN "mailing_zip" TEXT;
ALTER TABLE "sellers" ADD COLUMN "date_of_birth" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "marital_status" TEXT;
ALTER TABLE "sellers" ADD COLUMN "spouse_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "spouse_phone" TEXT;
ALTER TABLE "sellers" ADD COLUMN "spouse_email" TEXT;
ALTER TABLE "sellers" ADD COLUMN "occupation" TEXT;
ALTER TABLE "sellers" ADD COLUMN "employer" TEXT;
ALTER TABLE "sellers" ADD COLUMN "preferred_contact_method" TEXT;
ALTER TABLE "sellers" ADD COLUMN "language_preference" TEXT;
ALTER TABLE "sellers" ADD COLUMN "do_not_contact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sellers" ADD COLUMN "is_deceased" BOOLEAN NOT NULL DEFAULT false;

-- Property Ownership
ALTER TABLE "sellers" ADD COLUMN "years_owned" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "how_acquired" TEXT;
ALTER TABLE "sellers" ADD COLUMN "ownership_type" TEXT;
ALTER TABLE "sellers" ADD COLUMN "entity_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "mortgage_balance" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "monthly_mortgage_payment" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "lender_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "interest_rate" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "loan_type" TEXT;
ALTER TABLE "sellers" ADD COLUMN "remaining_term_months" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "has_second_mortgage" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "second_mortgage_balance" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "has_hoa" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "hoa_amount" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "hoa_status" TEXT;
ALTER TABLE "sellers" ADD COLUMN "property_taxes_current" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "property_taxes_owed" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "has_liens" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "lien_amount" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "lien_type" TEXT;
ALTER TABLE "sellers" ADD COLUMN "is_probate" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_estate" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "estate_attorney_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "estate_attorney_phone" TEXT;

-- Motivation & Situation
ALTER TABLE "sellers" ADD COLUMN "motivation_primary" TEXT;
ALTER TABLE "sellers" ADD COLUMN "motivation_secondary" TEXT;
ALTER TABLE "sellers" ADD COLUMN "urgency_score" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "urgency_level" TEXT;
ALTER TABLE "sellers" ADD COLUMN "sale_timeline" TEXT;
ALTER TABLE "sellers" ADD COLUMN "hardship_type" TEXT;
ALTER TABLE "sellers" ADD COLUMN "is_divorce" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_foreclosure" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "foreclosure_auction_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "is_bankruptcy" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_pre_probate" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_recently_inherited" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "behind_on_payments" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "months_behind_on_payments" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "life_event_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "emotional_state" TEXT;
ALTER TABLE "sellers" ADD COLUMN "is_decision_makers_confirmed" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_tenant_occupied" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "tenant_lease_end_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "is_tenant_paying" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_eviction_in_progress" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_vacant" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "vacant_duration_months" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "is_listed_with_agent" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "agent_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "agent_listing_expiration" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "willing_to_do_seller_financing" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "willing_to_do_subject_to" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "move_out_timeline" TEXT;

-- Financial
ALTER TABLE "sellers" ADD COLUMN "seller_asking_price" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "lowest_acceptable_price" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "amount_needed_to_clear" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "asking_reason" TEXT;
ALTER TABLE "sellers" ADD COLUMN "financial_distress_score" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "monthly_carrying_cost" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "has_insurance" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "insurance_company" TEXT;

-- Interaction History
ALTER TABLE "sellers" ADD COLUMN "first_contact_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "last_contact_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "total_call_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "last_call_outcome" TEXT;
ALTER TABLE "sellers" ADD COLUMN "response_rate" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "calls_to_appointment_ratio" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "best_day_to_call" TEXT;
ALTER TABLE "sellers" ADD COLUMN "no_answer_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "text_response_rate" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "sentiment_trend" TEXT;
ALTER TABLE "sellers" ADD COLUMN "common_objections" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "rapport_score" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "engagement_level" TEXT;
ALTER TABLE "sellers" ADD COLUMN "last_meaningful_conversation_date" TIMESTAMP(3);

-- Lead & Pipeline
ALTER TABLE "sellers" ADD COLUMN "lead_source" TEXT;
ALTER TABLE "sellers" ADD COLUMN "lead_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "assigned_to_id" TEXT;
ALTER TABLE "sellers" ADD COLUMN "campaign_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "list_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "times_recycled" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "referral_source" TEXT;
ALTER TABLE "sellers" ADD COLUMN "lead_score" DOUBLE PRECISION;

-- AI Enriched
ALTER TABLE "sellers" ADD COLUMN "motivation_score" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "likelihood_to_sell_score" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "personality_type" TEXT;
ALTER TABLE "sellers" ADD COLUMN "communication_style" TEXT;
ALTER TABLE "sellers" ADD COLUMN "price_sensitivity" TEXT;
ALTER TABLE "sellers" ADD COLUMN "objection_profile" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "recommended_approach" TEXT;
ALTER TABLE "sellers" ADD COLUMN "red_flags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "positive_signals" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "price_reduction_likelihood" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "is_subject_to_candidate" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "is_creative_finance_candidate" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "follow_up_priority" TEXT;
ALTER TABLE "sellers" ADD COLUMN "predicted_close_probability" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "days_to_close_estimate" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "ai_summary" TEXT;
ALTER TABLE "sellers" ADD COLUMN "ai_coaching_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "last_ai_analysis_date" TIMESTAMP(3);

-- Public Records / Enrichment
ALTER TABLE "sellers" ADD COLUMN "county_owner_name" TEXT;
ALTER TABLE "sellers" ADD COLUMN "county_assessed_value" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "county_market_value" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "last_sale_price" DECIMAL(12,2);
ALTER TABLE "sellers" ADD COLUMN "last_sale_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "parcel_id" TEXT;
ALTER TABLE "sellers" ADD COLUMN "legal_description" TEXT;
ALTER TABLE "sellers" ADD COLUMN "deed_type" TEXT;
ALTER TABLE "sellers" ADD COLUMN "zoning" TEXT;
ALTER TABLE "sellers" ADD COLUMN "school_district" TEXT;
ALTER TABLE "sellers" ADD COLUMN "flood_zone" TEXT;
ALTER TABLE "sellers" ADD COLUMN "neighborhood_rating" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "walk_score" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "crime_score" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "natural_disaster_risk" TEXT;
ALTER TABLE "sellers" ADD COLUMN "foreclosure_history_count" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "environmental_flags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "enrichment_status" TEXT;
ALTER TABLE "sellers" ADD COLUMN "enrichment_last_updated" TIMESTAMP(3);

-- Appointment & Visit
ALTER TABLE "sellers" ADD COLUMN "appointment_set_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "appointment_completed_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "walk_through_completed" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "walk_through_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "photos_taken" BOOLEAN;
ALTER TABLE "sellers" ADD COLUMN "interior_condition_rep_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "exterior_condition_rep_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "neighborhood_condition_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "access_notes" TEXT;

-- General
ALTER TABLE "sellers" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "internal_notes" TEXT;
ALTER TABLE "sellers" ADD COLUMN "priority_flag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sellers" ADD COLUMN "custom_fields" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "sellers" ADD COLUMN "field_sources" JSONB NOT NULL DEFAULT '{}';

-- Rename old columns (motivation -> motivation kept in situation, decision_makers stays)
-- The old "motivation" column (hot|warm|cold|dead) doesn't map 1:1 to new schema.
-- "situation" and "decision_makers" and "best_time_to_call" already exist — no action needed.
-- Drop the old "motivation" column since it's replaced by motivation_primary/motivation_score
ALTER TABLE "sellers" DROP COLUMN IF EXISTS "motivation";

-- ============================================================
-- 2. Add index on sellers(tenant_id, phone)
-- ============================================================

CREATE INDEX "sellers_tenant_id_phone_idx" ON "sellers"("tenant_id", "phone");

-- ============================================================
-- 3. Add seller_id and buyer_id to calls table
-- ============================================================

ALTER TABLE "calls" ADD COLUMN "seller_id" TEXT;
ALTER TABLE "calls" ADD COLUMN "buyer_id" TEXT;

-- Add foreign key for seller_id -> sellers.id
ALTER TABLE "calls" ADD CONSTRAINT "calls_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 4. Drop seller intel fields from properties table
-- ============================================================

ALTER TABLE "properties" DROP COLUMN IF EXISTS "seller_motivation_text";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "seller_motivation_level";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "seller_timeline";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "seller_asking_reason";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "timeline_urgency";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "decision_makers_confirmed";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "owner_name";
