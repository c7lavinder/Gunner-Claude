-- Session 67 mid-session pivot — replace the just-shipped separate
-- Agent + Wholesaler tables with one unified Partner table.
--
-- The previous migration (20260504000000_add_agent_wholesaler) created
-- 4 empty tables less than ~1 hour before this one. Corey changed the
-- architectural call to "one big database of contacts with a type
-- array" before any data was written. This migration drops the 4
-- empty tables and creates the unified shape.
--
-- Plan: ~/.claude/plans/at-te-he-very-base-mellow-pixel.md
--
-- Safe to drop because the 4 tables have zero rows (no UI / API ever
-- consumed them; Phase 2 was never built against the prior shape).

-- DropTable (CASCADE handles the FKs into properties/tenants
-- automatically; the join tables go first so the FK from join → parent
-- is cleared before the parent drop)
DROP TABLE IF EXISTS "property_agents" CASCADE;
DROP TABLE IF EXISTS "property_wholesalers" CASCADE;
DROP TABLE IF EXISTS "agents" CASCADE;
DROP TABLE IF EXISTS "wholesalers" CASCADE;

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "types" JSONB NOT NULL DEFAULT '[]',
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "ghl_contact_id" TEXT,
    "company" TEXT,
    "website" TEXT,
    "brokerage_name" TEXT,
    "brokerage_address" TEXT,
    "license_number" TEXT,
    "license_state" TEXT,
    "license_expiration" TIMESTAMP(3),
    "buyer_list_size" INTEGER,
    "deals_per_month_estimate" INTEGER,
    "prefers_assignment" BOOLEAN,
    "typical_assignment_fee" DECIMAL(10,2),
    "primary_markets" JSONB NOT NULL DEFAULT '[]',
    "property_type_focus" TEXT,
    "years_experience" INTEGER,
    "specialties" JSONB NOT NULL DEFAULT '[]',
    "deals_sourced_to_us_count" INTEGER NOT NULL DEFAULT 0,
    "deals_taken_from_us_count" INTEGER NOT NULL DEFAULT 0,
    "deals_closed_with_us_count" INTEGER NOT NULL DEFAULT 0,
    "jv_history_count" INTEGER NOT NULL DEFAULT 0,
    "last_deal_date" TIMESTAMP(3),
    "response_rate" DOUBLE PRECISION,
    "reliability_score" DOUBLE PRECISION,
    "partner_grade" TEXT,
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

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_partners" (
    "property_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sourced_to_us',
    "commission_percent" DOUBLE PRECISION,
    "commission_amount" DECIMAL(12,2),
    "purchase_price" DECIMAL(12,2),
    "assignment_fee_paid" DECIMAL(12,2),
    "notes_on_this_deal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_partners_pkey" PRIMARY KEY ("property_id","partner_id")
);

-- CreateIndex
CREATE INDEX "partners_tenant_id_phone_idx" ON "partners"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "partners_tenant_id_ghl_contact_id_idx" ON "partners"("tenant_id", "ghl_contact_id");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_partners" ADD CONSTRAINT "property_partners_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_partners" ADD CONSTRAINT "property_partners_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
