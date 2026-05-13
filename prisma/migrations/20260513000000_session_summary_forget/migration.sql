-- Phase 5 of LLM Rewiring Plan — user-controlled session forgetting.
-- Adds excluded_from_history flag to AssistantSessionSummary so users can
-- opt a daily summary out of future memory injection.

ALTER TABLE "assistant_session_summaries"
  ADD COLUMN "excluded_from_history" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "excluded_at" TIMESTAMP(3);

CREATE INDEX "assistant_session_summaries_tenant_id_user_id_excluded_from_history_idx"
  ON "assistant_session_summaries"("tenant_id", "user_id", "excluded_from_history");
