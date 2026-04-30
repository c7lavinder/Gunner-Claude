-- v1.1 Wave 4 — PropertyBuyerStage gains matchScore (per-property buyer fit).
-- See docs/v1.1/SELLER_BUYER_PLAN.md §7 (Q7 lock) for design rationale.
--
-- Today llmScoreBuyers in app/api/properties/[propertyId]/buyers/route.ts
-- recomputes the score on every GET and never persists it. Buyer-level
-- matchLikelihoodScore exists today but is the wrong unit — match
-- quality is property-specific. This column is the persisted home.
-- Buyer.matchLikelihoodScore drops in Wave 5 cutover; Buyer.buyerScore
-- (cross-portfolio reliability) stays.
--
-- Additive only — no drops, no defaults that would touch existing rows.
-- Wave 4 commit D backfills this column from Buyer.matchLikelihoodScore.

ALTER TABLE "property_buyer_stages"
  ADD COLUMN "match_score"             DOUBLE PRECISION,
  ADD COLUMN "match_score_updated_at"  TIMESTAMP(3);
