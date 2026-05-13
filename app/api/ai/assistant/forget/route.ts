// POST /api/ai/assistant/forget — mark a session summary as excluded from
// future memory injection. Phase 5 of LLM Rewiring Plan.
//
// Request body: { sessionDate: 'YYYY-MM-DD' }
// Response: { ok: true } | { error: string }
//
// Tenant + user scoping via withTenant. A user can only forget THEIR OWN
// session summaries.

import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { forgetSession } from '@/lib/ai/session-summarizer'
import { z } from 'zod'

const bodySchema = z.object({
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
})

export const POST = withTenant(async (request, ctx) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid sessionDate' }, { status: 400 })
  }

  const result = await forgetSession(ctx.tenantId, ctx.userId, parsed.data.sessionDate)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
})
