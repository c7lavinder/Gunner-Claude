-- Add updated_at column to calls table.
-- Required by the grading-worker rescue sweeps at scripts/process-recording-jobs.ts:
--   * stuck-PROCESSING rescue (rows PROCESSING > 5 min flip back to PENDING)
--   * auto-retry FAILED rows that have a recording (updated > 1 hr ago)
-- Backfill existing rows to their created_at so rescue queries behave
-- correctly from the first worker run post-deploy (i.e., old FAILED rows
-- immediately qualify for retry, fresh ones don't).

ALTER TABLE "calls" ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "calls" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "calls" ALTER COLUMN "updated_at" SET NOT NULL;
