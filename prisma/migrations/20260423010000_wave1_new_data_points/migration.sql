-- Wave 1 — new data points across Seller / Buyer / PropertySeller /
-- PropertyBuyerStage / Call. No field moves in this migration; movement of
-- misplaced Seller fields to PropertySeller happens in a later wave that
-- also backfills.

-- ────────────────────────────────────────────────────────────────
-- SELLER additions
-- ────────────────────────────────────────────────────────────────

-- Call voice / emotion aggregates (promoted from dealIntel JSON)
ALTER TABLE "sellers" ADD COLUMN "trust_score" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "trust_step_current" TEXT;
ALTER TABLE "sellers" ADD COLUMN "trust_step_arc" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "voice_energy_trend" TEXT;
ALTER TABLE "sellers" ADD COLUMN "primary_emotion_most_frequent" TEXT;
ALTER TABLE "sellers" ADD COLUMN "competitors_mentioned_by_name" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "dealkillers_raised" JSONB NOT NULL DEFAULT '[]';

-- Message aggregates
ALTER TABLE "sellers" ADD COLUMN "message_response_time_avg_hours" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "message_response_rate" DOUBLE PRECISION;
ALTER TABLE "sellers" ADD COLUMN "message_best_reply_hour_of_day" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "message_best_reply_day_of_week" TEXT;
ALTER TABLE "sellers" ADD COLUMN "message_thread_sentiment_trend" TEXT;
ALTER TABLE "sellers" ADD COLUMN "message_ghost_checkpoint" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "last_message_received_at" TIMESTAMP(3);

-- Portfolio aggregates (computed)
ALTER TABLE "sellers" ADD COLUMN "total_properties_owned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "total_properties_sold_to_us" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "portfolio_markets" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sellers" ADD COLUMN "total_deals_with_us" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "total_deals_closed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "total_deals_walked" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "avg_days_to_close" INTEGER;
ALTER TABLE "sellers" ADD COLUMN "last_deal_closed_date" TIMESTAMP(3);
ALTER TABLE "sellers" ADD COLUMN "close_rate" DOUBLE PRECISION;

-- Relationship + communication preferences
ALTER TABLE "sellers" ADD COLUMN "who_referred_them" TEXT;
ALTER TABLE "sellers" ADD COLUMN "contact_responsiveness_tier" TEXT;
ALTER TABLE "sellers" ADD COLUMN "do_not_text" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sellers" ADD COLUMN "preferred_contact_time" TEXT;
ALTER TABLE "sellers" ADD COLUMN "relationship_strength" TEXT;

-- Cross-portfolio financial posture
ALTER TABLE "sellers" ADD COLUMN "overall_financial_pressure_tier" TEXT;
ALTER TABLE "sellers" ADD COLUMN "liquidity_posture" TEXT;
ALTER TABLE "sellers" ADD COLUMN "credit_proxy_tier" TEXT;
ALTER TABLE "sellers" ADD COLUMN "bankruptcy_history_flag" BOOLEAN NOT NULL DEFAULT false;

-- Public records scan
ALTER TABLE "sellers" ADD COLUMN "federal_bankruptcy_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sellers" ADD COLUMN "federal_bankruptcy_chapter" TEXT;
ALTER TABLE "sellers" ADD COLUMN "civil_suit_count_as_defendant" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "divorce_active_flag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sellers" ADD COLUMN "eviction_filing_count_as_plaintiff" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "eviction_filing_count_as_defendant" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sellers" ADD COLUMN "public_records_last_scan" TIMESTAMP(3);

-- ────────────────────────────────────────────────────────────────
-- PROPERTY_SELLERS additions
-- ────────────────────────────────────────────────────────────────

ALTER TABLE "property_sellers" ADD COLUMN "seller_resistance_level" TEXT;
ALTER TABLE "property_sellers" ADD COLUMN "last_conversation_summary" TEXT;
ALTER TABLE "property_sellers" ADD COLUMN "next_followup_date" TIMESTAMP(3);
ALTER TABLE "property_sellers" ADD COLUMN "competing_offers_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "property_sellers" ADD COLUMN "seller_timeline_constraint" TEXT;
ALTER TABLE "property_sellers" ADD COLUMN "estimated_days_to_decision" INTEGER;
ALTER TABLE "property_sellers" ADD COLUMN "current_objections" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "property_sellers" ADD COLUMN "negotiation_stage" TEXT;

-- ────────────────────────────────────────────────────────────────
-- CALLS additions (promoted per-call extractions)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE "calls" ADD COLUMN "call_primary_emotion" TEXT;
ALTER TABLE "calls" ADD COLUMN "call_voice_energy_level" TEXT;
ALTER TABLE "calls" ADD COLUMN "call_trust_step" TEXT;
ALTER TABLE "calls" ADD COLUMN "call_followup_commitment" TEXT;
ALTER TABLE "calls" ADD COLUMN "call_best_offer_mentioned" DECIMAL(12,2);
ALTER TABLE "calls" ADD COLUMN "call_dealkillers_surfaced" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "calls" ADD COLUMN "call_competitors_mentioned" JSONB NOT NULL DEFAULT '[]';

-- ────────────────────────────────────────────────────────────────
-- BUYERS additions
-- ────────────────────────────────────────────────────────────────

-- Entity / legal
ALTER TABLE "buyers" ADD COLUMN "entity_legal_name" TEXT;
ALTER TABLE "buyers" ADD COLUMN "entity_ein" TEXT;
ALTER TABLE "buyers" ADD COLUMN "entity_state" TEXT;
ALTER TABLE "buyers" ADD COLUMN "entity_status" TEXT;
ALTER TABLE "buyers" ADD COLUMN "signing_authority_contact_name" TEXT;
ALTER TABLE "buyers" ADD COLUMN "signing_authority_contact_phone" TEXT;
ALTER TABLE "buyers" ADD COLUMN "signing_authority_contact_email" TEXT;
ALTER TABLE "buyers" ADD COLUMN "real_estate_license_number" TEXT;

-- Capital posture
ALTER TABLE "buyers" ADD COLUMN "proof_of_capital_verified_date" TIMESTAMP(3);
ALTER TABLE "buyers" ADD COLUMN "typical_check_size" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "lender_relationships" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "escrow_deposit_typical_amount" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "cash_or_financing_mix" TEXT;
ALTER TABLE "buyers" ADD COLUMN "largest_deal_completed" DECIMAL(12,2);
ALTER TABLE "buyers" ADD COLUMN "portfolio_estimated_size" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "portfolio_estimated_value" DECIMAL(14,2);
ALTER TABLE "buyers" ADD COLUMN "public_record_last_scan" TIMESTAMP(3);

-- Buy-box refinements
ALTER TABLE "buyers" ADD COLUMN "days_in_market_tolerance" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "title_issue_tolerance" TEXT;

-- Execution / velocity
ALTER TABLE "buyers" ADD COLUMN "average_due_diligence_days" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "inspection_contingency_typical" TEXT;
ALTER TABLE "buyers" ADD COLUMN "renegotiate_frequency" TEXT;
ALTER TABLE "buyers" ADD COLUMN "average_days_under_contract_to_close" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "dropped_after_uc_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "reason_for_last_drop" TEXT;

-- Relationship extensions
ALTER TABLE "buyers" ADD COLUMN "jv_history_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "copy_on_emails" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "buyers" ADD COLUMN "tier_classification" TEXT;
ALTER TABLE "buyers" ADD COLUMN "reputation_notes" TEXT;
ALTER TABLE "buyers" ADD COLUMN "bad_with_us_flag" BOOLEAN NOT NULL DEFAULT false;

-- Conversion funnel
ALTER TABLE "buyers" ADD COLUMN "offers_sent_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "offers_accepted_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "conversion_rate_sent_to_accepted" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "conversion_rate_accepted_to_closed" DOUBLE PRECISION;

-- Public records
ALTER TABLE "buyers" ADD COLUMN "civil_suit_count_as_defendant" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "emd_forfeiture_count_historical" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "buyers" ADD COLUMN "contract_dispute_count_historical" INTEGER NOT NULL DEFAULT 0;

-- Social / reputation
ALTER TABLE "buyers" ADD COLUMN "google_business_rating" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "bbb_rating" TEXT;
ALTER TABLE "buyers" ADD COLUMN "bigger_pockets_mentions" INTEGER;

-- Message aggregates
ALTER TABLE "buyers" ADD COLUMN "message_response_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "message_best_reply_hour_of_day" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "message_best_reply_day_of_week" TEXT;
ALTER TABLE "buyers" ADD COLUMN "message_ghost_checkpoint" INTEGER;
ALTER TABLE "buyers" ADD COLUMN "link_ct_rate" DOUBLE PRECISION;
ALTER TABLE "buyers" ADD COLUMN "blast_open_to_offer_conversion" DOUBLE PRECISION;

-- ────────────────────────────────────────────────────────────────
-- PROPERTY_BUYER_STAGES additions (the deal itself)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE "property_buyer_stages" ADD COLUMN "offer_amount" DECIMAL(12,2);
ALTER TABLE "property_buyer_stages" ADD COLUMN "offer_date" TIMESTAMP(3);
ALTER TABLE "property_buyer_stages" ADD COLUMN "offer_withdrawn_at" TIMESTAMP(3);
ALTER TABLE "property_buyer_stages" ADD COLUMN "withdrawn_reason" TEXT;
ALTER TABLE "property_buyer_stages" ADD COLUMN "inspection_status" TEXT;
ALTER TABLE "property_buyer_stages" ADD COLUMN "inspection_completed_date" TIMESTAMP(3);
ALTER TABLE "property_buyer_stages" ADD COLUMN "inspection_issues" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "property_buyer_stages" ADD COLUMN "emd_received" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "property_buyer_stages" ADD COLUMN "emd_amount" DECIMAL(12,2);
ALTER TABLE "property_buyer_stages" ADD COLUMN "emd_date" TIMESTAMP(3);
ALTER TABLE "property_buyer_stages" ADD COLUMN "deal_stage_on_property" TEXT;
ALTER TABLE "property_buyer_stages" ADD COLUMN "notes_on_this_deal" TEXT;
ALTER TABLE "property_buyer_stages" ADD COLUMN "count_of_offers_made" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "property_buyer_stages" ADD COLUMN "reason_for_non_response" TEXT;
ALTER TABLE "property_buyer_stages" ADD COLUMN "last_blast_sent_at" TIMESTAMP(3);
ALTER TABLE "property_buyer_stages" ADD COLUMN "blasts_received_count" INTEGER NOT NULL DEFAULT 0;
