-- Reverse for 20260506200000_phase2_backfill_cursor.
-- Apply manually: psql $DATABASE_URL -f prisma/migrations/.../down.sql
DROP TABLE IF EXISTS "backfill_cursors";
