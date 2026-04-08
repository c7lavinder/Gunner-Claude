// POST /api/[tenant]/calls/[id]/calibration
// Toggle a call's calibration flag — marks it as a good/bad example for AI grading
import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/api/withTenant'
import { db } from '@/lib/db/client'

export const POST = withTenant<{ id: string }>(async (req, ctx, params) => {
  const { isCalibration } = await req.json()

  const call = await db.call.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: { id: true },
  })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  await db.call.update({
    where: { id: params.id },
    data: { isCalibration: !!isCalibration },
  })

  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: isCalibration ? 'call.calibration.flagged' : 'call.calibration.unflagged',
      resource: 'call',
      resourceId: params.id,
      source: 'USER',
      severity: 'INFO',
    },
  }).catch(() => {})

  return NextResponse.json({ status: 'success', isCalibration: !!isCalibration })
})
