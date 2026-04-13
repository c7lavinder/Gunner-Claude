-- Add SKIPPED to grading_status enum
-- Short calls (<45s) and no-answers now get SKIPPED instead of FAILED
ALTER TYPE "grading_status" ADD VALUE 'SKIPPED';
