-- Add cursor tracking for call export endpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "last_call_export_cursor" TEXT;
