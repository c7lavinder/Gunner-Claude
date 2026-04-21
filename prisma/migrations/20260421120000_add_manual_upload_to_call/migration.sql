-- Add manual upload support to calls table.
-- manual_upload = true for calls ingested via /api/[tenant]/calls/upload
-- audio_storage_path holds the Supabase Storage key: "{tenantId}/{callId}.{ext}"
-- Both fields default NULL/FALSE for existing GHL-sourced rows; no backfill needed.

ALTER TABLE "calls" ADD COLUMN "manual_upload" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "calls" ADD COLUMN "audio_storage_path" TEXT;
