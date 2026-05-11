// app/api/admin/embed-calls-backfill/route.ts
//
// Server-side trigger for the Phase D call-transcript embedding backfill.
// Runs on Railway where OPENAI_API_KEY lives, so the operator doesn't have
// to ship the key to a local terminal.
//
// Auth: same pattern as app/api/diagnostics/*. Bearer DIAGNOSTIC_TOKEN.
// Fails closed (401) when the token env var is unset.
//
// Usage:
//   curl -X POST \
//     -H "Authorization: Bearer ${DIAGNOSTIC_TOKEN}" \
//     "<PRODUCTION_URL>/api/admin/embed-calls-backfill?limit=200"
//
//   Optional ?tenant=<tenantId> to scope to one tenant.
//   Optional ?limit=N (default 200, capped at 1000 per request to keep the
//   request bounded — re-call to continue).
//
// Response:
//   { embedded, skipped, errors, remaining, durationMs, suggestion }
//
// Idempotent — only processes calls where transcript_embedding IS NULL.
// Safe to re-run after a partial failure.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { embedCallTranscript } from '@/lib/ai/embeddings'

export const dynamic = 'force-dynamic'
// Railway runs long-lived node, no per-route timeout — generous budget
// so a 500-call run can finish without splitting.
export const maxDuration = 600

export async function POST(req: Request) {
  const token = process.env.DIAGNOSTIC_TOKEN
  const auth = req.headers.get('authorization') ?? ''
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set on this server. Set it in Railway env vars before running the backfill.' },
      { status: 503 },
    )
  }

  const url = new URL(req.url)
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 1),
    1000,
  )
  const tenantId = url.searchParams.get('tenant')

  const started = Date.now()

  // Pick the calls that need embedding. Restrict to COMPLETED grading so
  // we don't waste tokens on half-ingested calls. Newest first — more
  // useful to backfill recent calls earlier.
  const rows = tenantId
    ? await db.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
        `SELECT id, tenant_id FROM calls
         WHERE transcript_embedding IS NULL
           AND transcript IS NOT NULL
           AND grading_status = 'COMPLETED'
           AND tenant_id = $1
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        tenantId,
      )
    : await db.$queryRawUnsafe<Array<{ id: string; tenant_id: string }>>(
        `SELECT id, tenant_id FROM calls
         WHERE transcript_embedding IS NULL
           AND transcript IS NOT NULL
           AND grading_status = 'COMPLETED'
         ORDER BY created_at DESC
         LIMIT ${limit}`,
      )

  let embedded = 0
  let skipped = 0
  let errors = 0

  // Sequential — keep API rate predictable and avoid bursting OpenAI.
  for (const r of rows) {
    try {
      const ok = await embedCallTranscript(r.id, r.tenant_id)
      if (ok) embedded++
      else skipped++
    } catch (err) {
      errors++
      console.error('[embed-backfill] fail', r.id, err instanceof Error ? err.message : err)
    }
  }

  // How many are still pending (after this batch) so the operator knows
  // whether to call again.
  const remainingRows = tenantId
    ? await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint as count FROM calls
         WHERE transcript_embedding IS NULL
           AND transcript IS NOT NULL
           AND grading_status = 'COMPLETED'
           AND tenant_id = $1`,
        tenantId,
      )
    : await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint as count FROM calls
         WHERE transcript_embedding IS NULL
           AND transcript IS NOT NULL
           AND grading_status = 'COMPLETED'`,
      )
  const remaining = Number(remainingRows[0]?.count ?? 0)

  const durationMs = Date.now() - started
  const suggestion = remaining > 0
    ? `POST again with the same params to continue — ${remaining} call(s) still pending.`
    : 'Done — every eligible call is embedded.'

  return NextResponse.json({
    embedded,
    skipped,
    errors,
    remaining,
    batchSize: rows.length,
    durationMs,
    suggestion,
  })
}

// GET returns counts only — useful for "what's the backlog?" without
// spending OpenAI tokens.
export async function GET(req: Request) {
  const token = process.env.DIAGNOSTIC_TOKEN
  const auth = req.headers.get('authorization') ?? ''
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant')

  const result = tenantId
    ? await db.$queryRawUnsafe<Array<{ total: bigint; pending: bigint; embedded: bigint }>>(
        `SELECT
          count(*) FILTER (WHERE grading_status = 'COMPLETED' AND transcript IS NOT NULL)::bigint as total,
          count(*) FILTER (WHERE grading_status = 'COMPLETED' AND transcript IS NOT NULL AND transcript_embedding IS NULL)::bigint as pending,
          count(*) FILTER (WHERE transcript_embedding IS NOT NULL)::bigint as embedded
         FROM calls WHERE tenant_id = $1`,
        tenantId,
      )
    : await db.$queryRawUnsafe<Array<{ total: bigint; pending: bigint; embedded: bigint }>>(
        `SELECT
          count(*) FILTER (WHERE grading_status = 'COMPLETED' AND transcript IS NOT NULL)::bigint as total,
          count(*) FILTER (WHERE grading_status = 'COMPLETED' AND transcript IS NOT NULL AND transcript_embedding IS NULL)::bigint as pending,
          count(*) FILTER (WHERE transcript_embedding IS NOT NULL)::bigint as embedded
         FROM calls`,
      )

  return NextResponse.json({
    total: Number(result[0]?.total ?? 0),
    pending: Number(result[0]?.pending ?? 0),
    embedded: Number(result[0]?.embedded ?? 0),
    openaiKeySet: !!process.env.OPENAI_API_KEY,
  })
}
