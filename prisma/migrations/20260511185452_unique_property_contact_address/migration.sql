-- Prevent GHL-webhook race duplicates.
--
-- Symptom: two GHL webhooks for the same contact + same address landed
-- within 21-128ms of each other (see Session 82 audit). The TS-level
-- check-then-insert in lib/properties.ts can't catch it — both checks
-- pass before either row exists.
--
-- Fix: partial UNIQUE index on (tenant_id, ghl_contact_id, lower(address)).
-- The second simultaneous insert fails atomically (P2002), and the
-- application code catches and returns the winner's id.
--
-- WHERE ghl_contact_id IS NOT NULL: manually-created properties (no GHL
-- linkage) are exempt — same address can legitimately exist twice if a
-- user adds two records without GHL contact attachment.
--
-- lower(address): mirrors the case-insensitive checks in lib/properties.ts.

CREATE UNIQUE INDEX "Property_tenant_ghlContact_address_key"
  ON "properties" ("tenant_id", "ghl_contact_id", lower("address"))
  WHERE "ghl_contact_id" IS NOT NULL;
