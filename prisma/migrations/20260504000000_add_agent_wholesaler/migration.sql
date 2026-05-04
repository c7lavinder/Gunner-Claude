-- Session 67 — Add Agent + Wholesaler as first-class contact entities
-- alongside Seller + Buyer. Plan: ~/.claude/plans/at-te-he-very-base-mellow-pixel.md
-- Phase 1: schema only, no UI yet. Pattern mirrors v1.1 Wave 4-5
-- Seller/Buyer rebuild (Sessions 60-62).
--
-- This migration is purely additive — 4 new tables, 4 new indexes,
-- 8 new foreign keys. No existing tables, columns, or rows are touched.

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "ghl_contact_id" TEXT,
    "brokerage_name" TEXT,
    "brokerage_address" TEXT,
    "license_number" TEXT,
    "license_state" TEXT,
    "license_expiration" TIMESTAMP(3),
    "primary_markets" JSONB NOT NULL DEFAULT '[]',
    "property_type_focus" TEXT,
    "years_experience" INTEGER,
    "specialties" JSONB NOT NULL DEFAULT '[]',
    "is_buyer_side_agent" BOOLEAN NOT NULL DEFAULT false,
    "is_seller_side_agent" BOOLEAN NOT NULL DEFAULT false,
    "deals_brought_count" INTEGER NOT NULL DEFAULT 0,
    "deals_taken_to_clients_count" INTEGER NOT NULL DEFAULT 0,
    "deals_closed_with_us_count" INTEGER NOT NULL DEFAULT 0,
    "last_deal_date" TIMESTAMP(3),
    "response_rate" DOUBLE PRECISION,
    "reliability_score" DOUBLE PRECISION,
    "agent_grade" TEXT,
    "average_commission_percent" DOUBLE PRECISION,
    "preferred_contact_method" TEXT,
    "best_time_to_contact" TEXT,
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "tier_classification" TEXT,
    "reputation_notes" TEXT,
    "bad_with_us_flag" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "internal_notes" TEXT,
    "priority_flag" BOOLEAN NOT NULL DEFAULT false,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "field_sources" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_agents" (
    "property_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sourced_to_us',
    "commission_percent" DOUBLE PRECISION,
    "commission_amount" DECIMAL(12,2),
    "notes_on_this_deal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_agents_pkey" PRIMARY KEY ("property_id","agent_id")
);

-- CreateTable
CREATE TABLE "wholesalers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "ghl_contact_id" TEXT,
    "company" TEXT,
    "website" TEXT,
    "buyer_list_size" INTEGER,
    "primary_markets" JSONB NOT NULL DEFAULT '[]',
    "deals_per_month_estimate" INTEGER,
    "prefers_assignment" BOOLEAN,
    "typical_assignment_fee" DECIMAL(10,2),
    "brings_us_inventory" BOOLEAN NOT NULL DEFAULT false,
    "takes_our_inventory" BOOLEAN NOT NULL DEFAULT false,
    "deals_sold_to_us_count" INTEGER NOT NULL DEFAULT 0,
    "deals_taken_from_us_count" INTEGER NOT NULL DEFAULT 0,
    "last_deal_date" TIMESTAMP(3),
    "response_rate" DOUBLE PRECISION,
    "reliability_score" DOUBLE PRECISION,
    "jv_history_count" INTEGER NOT NULL DEFAULT 0,
    "preferred_contact_method" TEXT,
    "best_time_to_contact" TEXT,
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "tier_classification" TEXT,
    "reputation_notes" TEXT,
    "bad_with_us_flag" BOOLEAN NOT NULL DEFAULT false,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "internal_notes" TEXT,
    "priority_flag" BOOLEAN NOT NULL DEFAULT false,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "field_sources" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "wholesalers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_wholesalers" (
    "property_id" TEXT NOT NULL,
    "wholesaler_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sold_us_this',
    "purchase_price" DECIMAL(12,2),
    "assignment_fee_paid" DECIMAL(12,2),
    "notes_on_this_deal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_wholesalers_pkey" PRIMARY KEY ("property_id","wholesaler_id")
);

-- CreateIndex
CREATE INDEX "agents_tenant_id_phone_idx" ON "agents"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "agents_tenant_id_ghl_contact_id_idx" ON "agents"("tenant_id", "ghl_contact_id");

-- CreateIndex
CREATE INDEX "wholesalers_tenant_id_phone_idx" ON "wholesalers"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "wholesalers_tenant_id_ghl_contact_id_idx" ON "wholesalers"("tenant_id", "ghl_contact_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_agents" ADD CONSTRAINT "property_agents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_agents" ADD CONSTRAINT "property_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesalers" ADD CONSTRAINT "wholesalers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_wholesalers" ADD CONSTRAINT "property_wholesalers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_wholesalers" ADD CONSTRAINT "property_wholesalers_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "wholesalers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
