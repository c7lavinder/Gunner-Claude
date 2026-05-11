-- 2026-05-11 — Phase C2 + Phase D
--
-- 1. AssistantSessionSummary table (cross-session memory for the assistant)
-- 2. transcript_embedding column on calls (semantic call search)
--
-- See lib/ai/session-summarizer.ts and lib/ai/query-tools.ts → semanticSearchCalls.
-- Idempotent — every operation guarded with IF [NOT] EXISTS.

-- ─── 1. Cross-session memory ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "assistant_session_summaries" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_date" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "key_facts" JSONB,
  "message_count" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "assistant_session_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_session_summaries_tenant_id_user_id_session_date_key"
  ON "assistant_session_summaries" ("tenant_id", "user_id", "session_date");

CREATE INDEX IF NOT EXISTS "assistant_session_summaries_tenant_id_user_id_idx"
  ON "assistant_session_summaries" ("tenant_id", "user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_session_summaries_tenant_id_fkey'
  ) THEN
    ALTER TABLE "assistant_session_summaries"
      ADD CONSTRAINT "assistant_session_summaries_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_session_summaries_user_id_fkey'
  ) THEN
    ALTER TABLE "assistant_session_summaries"
      ADD CONSTRAINT "assistant_session_summaries_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── 2. Semantic search over call transcripts ─────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "transcript_embedding" vector(1536);

CREATE INDEX IF NOT EXISTS "idx_calls_transcript_embedding_hnsw"
  ON "calls"
  USING hnsw (transcript_embedding vector_cosine_ops);
