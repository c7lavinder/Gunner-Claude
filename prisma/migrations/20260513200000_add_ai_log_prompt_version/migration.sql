-- Phase 8 of the LLM Rewiring Plan (docs/LLM_REWIRING_PLAN.md).
-- Additive: adds a nullable `prompt_version` column + a composite index on
-- (type, prompt_version) so drift queries (group-by prompt version per
-- surface) stay fast even at multi-million-row scale.
--
-- Every prompt module under lib/ai/prompts/ exports a VERSION constant.
-- Each surface (grading, coach, deal-intel, property-story, dispo,
-- user-profile, session-summarizer, assistant) writes its VERSION into
-- this column on every ai_logs row. Legacy rows stay NULL — queries
-- should treat NULL as "pre-Phase-8 / unversioned".

ALTER TABLE "ai_logs"
    ADD COLUMN IF NOT EXISTS "prompt_version" TEXT;

CREATE INDEX IF NOT EXISTS "ai_logs_type_prompt_version_idx"
    ON "ai_logs"("type", "prompt_version");
