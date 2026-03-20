-- AlterTable workflow_definitions
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "trigger_event" TEXT NOT NULL DEFAULT 'property_created';

-- AlterTable workflow_executions
ALTER TABLE "workflow_executions" ADD COLUMN IF NOT EXISTS "property_id" TEXT;
ALTER TABLE "workflow_executions" ADD COLUMN IF NOT EXISTS "context" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "workflow_executions" ADD COLUMN IF NOT EXISTS "next_run_at" TIMESTAMP(3);
