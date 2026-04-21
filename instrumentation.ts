// instrumentation.ts
// Next.js 14.2 instrumentation hook — runs ONCE at server boot.
// This makes the app self-driving: grading worker runs continuously in-process,
// no external cron required. Works everywhere Next.js runs (Railway, Vercel node).

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.DISABLE_GRADING_WORKER === '1') return

  const { startGradingWorker } = await import('@/lib/grading-worker')
  startGradingWorker()
}
