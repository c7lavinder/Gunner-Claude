-- When TRUE, re-grades must NOT overwrite call_outcome with the AI's prediction.
-- Set by the reclassify endpoint when a human explicitly picks an outcome.
ALTER TABLE "calls" ADD COLUMN "outcome_manual_override" BOOLEAN NOT NULL DEFAULT FALSE;
