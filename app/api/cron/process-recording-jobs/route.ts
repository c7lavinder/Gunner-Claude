// app/api/cron/process-recording-jobs/route.ts
// Thin wrapper around the shared grading processor.
// The app is self-driving — instrumentation.ts starts an in-process loop on boot.
// This HTTP endpoint remains for:
//   - external cron triggers (Railway cron, uptime monitors)
//   - manual curls during debugging

import { NextResponse } from 'next/server'
import { runGradingProcessor } from '@/lib/grading-processor'

export async function POST() {
  return run()
}

export async function GET() {
  return run()
}

async function run() {
  try {
    const stats = await runGradingProcessor()
    return NextResponse.json({ ok: true, ...stats })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
