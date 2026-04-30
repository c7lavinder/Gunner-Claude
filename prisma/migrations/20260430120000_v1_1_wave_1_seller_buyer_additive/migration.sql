-- v1.1 Wave 1 — Seller/Buyer redesign, additive schema only.
-- See docs/v1.1/SELLER_BUYER_PLAN.md for design rationale (Q1 Shape A,
-- Q2 name decomposition, Q3 ambiguous-field locks).
--
-- This migration is purely additive: NO column drops, NO data deletes.
-- Wave 5 will drop the legacy GHL-overlap columns + Property owner_*
-- staging columns once read-path migration (Wave 3) lands and dual-write
-- (Wave 2) has populated the new destinations.

-- ─── Seller — Q2 name decomposition + Q1 skip-trace fallback ───────────
ALTER TABLE "sellers"
  ADD COLUMN "first_name"  TEXT,
  ADD COLUMN "middle_name" TEXT,
  ADD COLUMN "last_name"   TEXT,
  ADD COLUMN "name_suffix" TEXT,

  ADD COLUMN "skip_traced_phone"            TEXT,
  ADD COLUMN "skip_traced_email"            TEXT,
  ADD COLUMN "skip_traced_mailing_address"  TEXT,
  ADD COLUMN "skip_traced_mailing_city"     TEXT,
  ADD COLUMN "skip_traced_mailing_state"    TEXT,
  ADD COLUMN "skip_traced_mailing_zip"      TEXT,

  -- Owner portfolio aggregates (stripped from Property — staging→destination)
  ADD COLUMN "owner_portfolio_total_equity"   DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_total_value"    DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_total_purchase" DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_avg_assessed"   DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_avg_purchase"   DECIMAL(14,2),
  ADD COLUMN "owner_portfolio_avg_year_built" INTEGER,
  ADD COLUMN "owner_portfolio_json"           JSONB,

  -- Q3 lock — person-level flags moved from Property
  ADD COLUMN "senior_owner"     BOOLEAN,
  ADD COLUMN "deceased_owner"   BOOLEAN,
  ADD COLUMN "cash_buyer_owner" BOOLEAN;

-- ─── Buyer — Q1 skip-trace fallback ────────────────────────────────────
ALTER TABLE "buyers"
  ADD COLUMN "skip_traced_name"             TEXT,
  ADD COLUMN "skip_traced_phone"            TEXT,
  ADD COLUMN "skip_traced_email"            TEXT,
  ADD COLUMN "skip_traced_company"          TEXT,
  ADD COLUMN "skip_traced_mailing_address"  TEXT;

-- ─── PropertyBuyerStage — disambiguate matched-from-buybox vs added-manually ─
ALTER TABLE "property_buyer_stages"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'matched';

-- ─── Property — Q3 lock rename ─────────────────────────────────────────
-- ownerMailingVacant → mailingAddressVacant (clarifies it's about a property,
-- not a person — name is misleading in the current form).
ALTER TABLE "properties"
  RENAME COLUMN "owner_mailing_vacant" TO "mailing_address_vacant";
