-- Backfill: reset today's falsely-failed calls so the next poll picks them up
-- Scope: only calls that have evidence they were real conversations
UPDATE calls
SET
  grading_status = 'PENDING',
  call_result = NULL,
  ai_summary = NULL
WHERE
  grading_status = 'FAILED'
  AND call_result IN ('no_answer', 'short_call')
  AND called_at >= ((NOW() AT TIME ZONE 'America/Chicago')::date)::timestamp AT TIME ZONE 'America/Chicago'
  AND (
    duration_seconds >= 45
    OR recording_url IS NOT NULL
    OR duration_seconds IS NULL
  );
