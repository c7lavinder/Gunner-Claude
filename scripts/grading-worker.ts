// scripts/grading-worker.ts
// Self-looping grading worker — Railway-service variant of process-recording-jobs.
// Runs processJobs() forever with a 60-second sleep between iterations.
//
// Why this exists:
//   Railway's [[cron]] scheduler stopped firing process-recording-jobs on
//   2026-04-20 and redeploys did not re-register it. The cron entry for this
//   job has been removed from railway.toml; this service replaces it.
//
// Contract:
//   - Never calls process.exit() — Railway keeps the service alive
//   - Per-iteration errors are logged and swallowed; next iteration self-heals
//   - Each iteration writes the same heartbeat audit rows as the original cron
//     (cron.process_recording_jobs.started / .finished) so the existing health
//     query continues to work unchanged:
//       SELECT MAX(created_at) FROM audit_logs
//       WHERE action='cron.process_recording_jobs.started';
//     If result > 2 minutes old, the worker is not running.

import { processJobs } from './process-recording-jobs'

const LOOP_INTERVAL_MS = 60_000

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log(`[grading-worker] Starting — loop interval = ${LOOP_INTERVAL_MS}ms`)
  let iteration = 0
  // Infinite loop — Railway keeps the process alive. SIGTERM on redeploy
  // terminates the process via Node's default handler (exit code 143), which
  // Railway treats as a clean shutdown.
  while (true) {
    iteration++
    const startedAt = new Date().toISOString()
    console.log(`[grading-worker] Iteration ${iteration} starting at ${startedAt}`)
    try {
      await processJobs()
      console.log(`[grading-worker] Iteration ${iteration} completed cleanly`)
    } catch (err) {
      // Swallow per-iteration errors so one bad run doesn't kill the worker.
      // processJobs already logged details; we just note the failure and loop.
      console.error(
        `[grading-worker] Iteration ${iteration} failed:`,
        err instanceof Error ? err.message : err,
      )
    }
    await sleep(LOOP_INTERVAL_MS)
  }
}

main()
