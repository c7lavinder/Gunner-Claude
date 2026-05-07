-- Session 77 — Disposition Journey rewrite
-- Adds:
--   • property_comps table (manual buyer comps shown in Data tab Property
--     Assessment area; feeds the listing-site prompt)
--   • properties.dispo_artifacts (JSON) — generated description, listing
--     post, social post, generated_at, generated_by
--   • properties.dispo_asking_price — investor-facing asking, distinct
--     from properties.asking_price (which is the seller's asking from
--     Overview). Section 2 deal summary "Asking" card reads/writes this.
--   • tenants.disposition_funding_link — URL appended to all 3 generated
--     artifact closing blocks. Defaults to the New Again Houses franchise
--     site; per-tenant override via Settings → Disposition.

-- ── property_comps ───────────────────────────────────────────────────
CREATE TABLE "property_comps" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "zillow_url" TEXT,
  "beds" INTEGER,
  "baths" DOUBLE PRECISION,
  "sqft" INTEGER,
  -- condition: remodeled | updated | functional | as_is
  "condition" TEXT,
  "price" DECIMAL(12,2),
  -- status: sold | active | pending
  "status" TEXT,
  "notes" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "property_comps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "property_comps_property_id_idx" ON "property_comps" ("property_id");
CREATE INDEX "property_comps_tenant_id_idx" ON "property_comps" ("tenant_id");
ALTER TABLE "property_comps" ADD CONSTRAINT "property_comps_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_comps" ADD CONSTRAINT "property_comps_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Property.dispoArtifacts + dispoAskingPrice ───────────────────────
ALTER TABLE "properties" ADD COLUMN "dispo_artifacts" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "properties" ADD COLUMN "dispo_asking_price" DECIMAL(12,2);

-- ── Tenant.dispositionFundingLink ────────────────────────────────────
ALTER TABLE "tenants" ADD COLUMN "disposition_funding_link" TEXT
  DEFAULT 'https://franchise.newagainhouses.com/';
