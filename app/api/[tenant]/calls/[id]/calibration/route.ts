// POST /api/[tenant]/calls/[id]/calibration
// Mark a call as a calibration example with a kind (good|bad) + optional notes.
// Powers the Phase 10 learning-loop signal: `scripts/mine-eval-candidates.ts`
// reads `calibrationNotes` to surface eval-fixture candidates. Without a kind
// the AI can't tell "this was a great call" from "this was a bad call" — so
// the route now requires kind + persists it in the `calibrationNotes` prefix.
//
// Storage convention matches `app/api/ai/assistant/execute/route.ts:952`:
//   calibrationNotes = "<kind>: <free-text notes>" (e.g. "good: rep nailed the close")
//
// Body shape (one of):
//   { kind: 'good' | 'bad', notes?: string }        — mark or update
//   { isCalibration: false }                         — clear the flag
//
// Backwards-compat: an old `{ isCalibration: true }` payload still works
// but doesn't set kind/notes; the row will surface in mine as un-typed.
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const POST = withTenant<{ id: string }>(async (req, ctx, params) => {
  const body = await req.json() as {
    isCalibration?: boolean
    kind?: 'good' | 'bad'
    notes?: string
  }

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Resolve the operation. New shape uses `kind`; legacy uses `isCalibration`.
  const clearing = body.isCalibration === false || (!body.kind && body.isCalibration !== true)
  const kindNormalized = body.kind === 'good' || body.kind === 'bad' ? body.kind : null
  const notesTrim = (body.notes ?? '').trim().slice(0, 1000)

  if (clearing) {
    await db.call.update({
      where: { id: params.id },
      data: { isCalibration: false, calibrationNotes: null },
    })
    await db.auditLog.create({
      data: {
        tenantId: ctx.tenantId, userId: ctx.userId,
        action: 'call.calibration.unflagged',
        resource: 'call', resourceId: params.id,
        source: 'USER', severity: 'INFO',
      },
    }).catch(() => {})
    return NextResponse.json({ status: 'success', isCalibration: false, kind: null })
  }

  // Setting kind. Format notes as "<kind>: <text>" to match the convention.
  if (!kindNormalized) {
    return NextResponse.json({ error: 'kind must be "good" or "bad"' }, { status: 400 })
  }
  const composedNotes = notesTrim.length > 0
    ? `${kindNormalized}: ${notesTrim}`
    : `${kindNormalized}:`

  await db.call.update({
    where: { id: params.id },
    data: { isCalibration: true, calibrationNotes: composedNotes },
  })

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: 'call.calibration.flagged',
      resource: 'call', resourceId: params.id,
      source: 'USER', severity: 'INFO',
      payload: { kind: kindNormalized, hasNotes: notesTrim.length > 0 },
    },
  }).catch(() => {})

  return NextResponse.json({
    status: 'success',
    isCalibration: true,
    kind: kindNormalized,
    calibrationNotes: composedNotes,
  })
})
