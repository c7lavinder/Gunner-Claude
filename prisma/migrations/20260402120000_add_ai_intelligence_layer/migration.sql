-- AI Intelligence Layer — schema for knowledge, profiles, assistant, logging

-- Tenant fields for AI knowledge
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "scripts" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "company_standards" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "calibration_calls" JSONB NOT NULL DEFAULT '[]';

-- Call calibration fields
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "is_calibration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "calibration_notes" TEXT;

-- Knowledge Documents
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "call_type" TEXT,
    "role" TEXT,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User Profiles
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scoring_patterns" JSONB NOT NULL DEFAULT '{}',
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "common_mistakes" JSONB NOT NULL DEFAULT '[]',
    "communication_style" TEXT,
    "improvement_velocity" JSONB NOT NULL DEFAULT '{}',
    "preferred_actions" JSONB NOT NULL DEFAULT '{}',
    "coaching_priorities" JSONB NOT NULL DEFAULT '[]',
    "total_calls_graded" INTEGER NOT NULL DEFAULT 0,
    "profile_source" TEXT NOT NULL DEFAULT 'auto',
    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_user_id_key" ON "user_profiles"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_tenant_id_user_id_key" ON "user_profiles"("tenant_id", "user_id");

DO $$ BEGIN
  ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Assistant Messages
CREATE TABLE IF NOT EXISTS "assistant_messages" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "page_context" TEXT,
    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assistant_messages_tenant_user_date" ON "assistant_messages"("tenant_id", "user_id", "session_date");

DO $$ BEGIN
  ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Action Logs
CREATE TABLE IF NOT EXISTS "action_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "executed" JSONB,
    "was_edited" BOOLEAN NOT NULL DEFAULT false,
    "was_rejected" BOOLEAN NOT NULL DEFAULT false,
    "edit_diff" JSONB,
    "page_context" TEXT,
    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AI Logs
CREATE TABLE IF NOT EXISTS "ai_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "page_context" TEXT,
    "input_summary" TEXT NOT NULL,
    "input_full" TEXT,
    "output_summary" TEXT NOT NULL,
    "output_full" TEXT,
    "tools_called" JSONB,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "estimated_cost" DOUBLE PRECISION,
    "duration_ms" INTEGER,
    "model" TEXT,
    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_logs_tenant_created" ON "ai_logs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_logs_tenant_type" ON "ai_logs"("tenant_id", "type");

DO $$ BEGIN
  ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
