// lib/grading-worker.ts
// Self-driving grading loop. Starts once per Node.js process at server boot.
// See instrumentation.ts for the boot hook.
//
// Design:
//   - Single in-flight run at a time (overlap guard via `running` flag)
//   - 60s idle delay between runs
//   - Errors logged but never crash the loop
//   - Safe across hot-reload: uses a global symbol to prevent duplicate timers

const LOOP_INTERVAL_MS = 60 * 1000
const GUARD_SYMBOL = Symbol.for('gunner.gradingWorker.started')

interface GlobalWithGuard {
  [GUARD_SYMBOL]?: boolean
}

export function startGradingWorker(): void {
  const g = globalThis as GlobalWithGuard
  if (g[GUARD_SYMBOL]) {
    console.log('[grading-worker] Already started — skipping duplicate boot')
    return
  }
  g[GUARD_SYMBOL] = true

  console.log('[grading-worker] Starting self-driving loop (60s interval)')

  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      const { runGradingProcessor } = await import('@/lib/grading-processor')
      await runGradingProcessor()
    } catch (err) {
      console.error('[grading-worker] Tick error:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }
  }

  // Fire first tick shortly after boot so heartbeat shows up quickly
  setTimeout(() => { void tick() }, 5_000)
  setInterval(() => { void tick() }, LOOP_INTERVAL_MS)
}
